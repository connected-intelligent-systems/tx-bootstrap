import { randomUUID } from "node:crypto";
import type { Repositories } from "@tx-bootstrap/core/server/db/repositories/index.js";
import {
  assertBpnFormat,
  normalizeBusinessPartnerInput,
  normalizeCaseInput,
  normalizeTechnicalMetadataInput,
  toBusinessPartnerDto,
} from "@tx-bootstrap/core/server/domain/participant-mappers.js";
import { readJson } from "@tx-bootstrap/core/server/http/body.js";
import {
  BadRequestError,
  ConflictError,
} from "@tx-bootstrap/core/server/http/errors.js";
import { sendJson } from "@tx-bootstrap/core/server/http/responses.js";
import type { ParticipantLifecycleService } from "@tx-bootstrap/core/server/services/participant-lifecycle-service.js";
import {
  participantOrganizationUpdateSchema,
  participantCreateInputSchema,
  readmitSchema,
  type ReadmitInput,
  rejectSchema,
  revokeSchema,
  technicalMetadataUpdateSchema,
} from "../../../src/shared/api/index.js";
import type { EmailService } from "@tx-bootstrap/core/server/services/email-service.js";
import { emailTemplates } from "@tx-bootstrap/core/server/services/email-templates.js";
import type {
  createParticipantApprovalService,
  SetupCheck,
} from "../services/participant-approval-service.js";
import type { ParticipantRevocationService } from "../services/participant-revocation-service.js";
import {
  ParticipantLeaseLostError,
  type ParticipantAccessLease,
} from "@tx-bootstrap/core/server/db/participant-access-lease.js";

type ParsedBody = unknown;

export function createAdminParticipantActions({
  approvalService,
  revocation,
  businessPartners,
  lifecycle,
  onboardingCases,
  emailService,
}: {
  approvalService: Pick<
    ReturnType<typeof createParticipantApprovalService>,
    "runReadmission" | "buildCredentialRequest"
  >;
  revocation: Pick<ParticipantRevocationService, "runChecks">;
  businessPartners: Repositories["businessPartners"];
  lifecycle: ParticipantLifecycleService;
  onboardingCases: Repositories["onboardingCases"];
  emailService: EmailService;
}) {
  const {
    createOnboardingCaseForPartner,
    generateLocalBpn,
    getParticipantDto,
    loadBusinessPartner,
    loadLatestCaseForPartner,
    recordParticipantEvent,
    syncUnverifiedOnboardingMetadata,
    updateCaseTechnicalMetadata,
  } = lifecycle;

  // Individual action handlers
  async function getParticipant(_request, response, id) {
    sendJson(response, 200, await getParticipantDto(id));
  }

  async function updateOrganization(request, response, id, body?: ParsedBody) {
    const existing = await loadBusinessPartner(id);
    const patch =
      body !== undefined
        ? participantOrganizationUpdateSchema.parse(body)
        : await readJson(request, participantOrganizationUpdateSchema);
    const data = normalizeBusinessPartnerInput({
      ...toBusinessPartnerDto(existing),
      ...patch,
    });
    const organization = {
      legalName: data.legalName,
      legalForm: data.legalForm,
      registeredAddress: data.registeredAddress,
      country: data.country,
      taxId: data.taxId,
      commercialRegisterNumber: data.commercialRegisterNumber,
      website: data.website,
      contactEmail: data.contactEmail,
    };
    await businessPartners.updateOrganization(id, organization);
    await syncUnverifiedOnboardingMetadata(id, data);
    await recordParticipantEvent({
      request,
      businessPartnerId: id,
      action: "participant.organization_updated",
      message: "Organization data updated.",
      payload: { changedFields: Object.keys(patch) },
    });
    sendJson(response, 200, await getParticipantDto(id));
  }

  async function rejectParticipant(request, response, id, body?: ParsedBody) {
    const partner = await loadBusinessPartner(id);
    const latest = await loadLatestCaseForPartner(id);
    assertCanRejectParticipant(partner, latest);
    const bodyData =
      body !== undefined
        ? rejectSchema.parse(body)
        : await readJson(request, rejectSchema);
    const reason = String(
      bodyData.reason ??
        bodyData.verificationNotes ??
        "Rejected by dataspace operator.",
    ).trim();
    await withAccessLease(id, async (lease) => {
      if (!(await businessPartners.reject(id, reason, lease))) {
        throw new ConflictError(
          "Rejection is only available before connector setup is queued; use Revoke once setup has started",
        );
      }
    });
    await recordParticipantEvent({
      request,
      businessPartnerId: id,
      action: "participant.rejected",
      message: reason,
      payload: {},
    });

    // Notify the participant that onboarding was rejected.
    if (partner.contact_email) {
      const emailContent = emailTemplates.participantRejected({
        organizationName: partner.legal_name || "Organization",
        reason,
      });
      await emailService.sendEmail({
        to: partner.contact_email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
    }

    sendJson(response, 200, await getParticipantDto(id));
  }

  // Permanent removal from the dataspace. Marks the participant REVOKED
  // first, so no other action or setup run treats it as active, then runs the
  // idempotent revocation steps. Calling it again retries failed steps.
  async function revokeParticipant(request, response, id, body?: ParsedBody) {
    const partner = await loadBusinessPartner(id);
    const latest = await onboardingCases.getLatestForBusinessPartner(id);
    const data =
      body !== undefined
        ? revokeSchema.parse(body)
        : await readJson(request, revokeSchema);
    const bpn = partner.assigned_bpn;
    if (!bpn) {
      throw new ConflictError(
        "Only participants with an assigned BPN can be revoked",
      );
    }
    if (data.confirmBpn.trim() !== bpn) {
      throw new BadRequestError(
        "The confirmation does not match the participant's BPN",
      );
    }
    const retry = partner.verification_status === "REVOKED";

    const checks = await withAccessLease(id, async (lease) => {
      if (!(await businessPartners.revoke(id, data.reason.trim(), lease))) {
        throw new ConflictError(
          "Automatic connector setup is running; revoke once it has finished",
        );
      }
      const checks = await revocation.runChecks(
        await loadBusinessPartner(id),
        lease,
      );
      await businessPartners.setRevocationChecks(id, checks, lease);
      return checks;
    });
    const failed = checks.filter((check) => check.status === "failed");
    await recordParticipantEvent({
      request,
      businessPartnerId: id,
      onboardingCaseId: latest?.id,
      action: "participant.revoked",
      message: failed.length
        ? `Revocation ${retry ? "retried" : "started"}; ${failed.length} step(s) failed.`
        : retry
          ? "Revocation completed on retry."
          : `Participant revoked: ${data.reason.trim()}`,
      payload: { checks },
    });
    sendJson(response, 200, await getParticipantDto(id));
  }

  // Lets a revoked participant back in. Its revoked credentials stay revoked;
  // it requests new ones under a new holder request id (its Identity Hub
  // ignores a request id it has already used).
  async function readmitParticipant(request, response, id, body?: ParsedBody) {
    const data =
      body !== undefined
        ? readmitSchema.parse(body)
        : await readJson(request, readmitSchema);
    await loadBusinessPartner(id);
    await withAccessLease(id, (lease) =>
      readmitLocked(request, id, data, lease),
    );
    sendJson(response, 200, await getParticipantDto(id));
  }

  async function withAccessLease<T>(
    id: string,
    fn: (lease: ParticipantAccessLease) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await businessPartners.withParticipantLock(
        id,
        async (lease) => ({
          value: await fn(lease),
        }),
      );
      if (!result) {
        throw new ConflictError(
          "Another participant access action is running; try again shortly",
        );
      }
      return result.value;
    } catch (error) {
      if (error instanceof ParticipantLeaseLostError) {
        throw new ConflictError(error.message);
      }
      throw error;
    }
  }

  async function readmitLocked(
    request,
    id: string,
    data: ReadmitInput,
    lease: ParticipantAccessLease,
  ) {
    const partner = await loadBusinessPartner(id);
    const latest = await onboardingCases.getLatestForBusinessPartner(id);
    const bpn = partner.assigned_bpn;
    if (partner.verification_status !== "REVOKED") {
      throw new ConflictError("Only revoked participants can be readmitted");
    }
    if (data.confirmBpn.trim() !== bpn) {
      throw new BadRequestError(
        "The confirmation does not match the participant's BPN",
      );
    }
    if (!latest?.did) {
      throw new ConflictError(
        "The participant has no connector metadata to restore",
      );
    }

    // Recorded before any remote write: if readmission does not finish (a
    // failed step, a lost response or a crash), the revocation stays
    // incomplete and the steps re-block the participant, here or in the
    // revocation reconciler once the lease expires.
    await businessPartners.setRevocationChecks(
      id,
      [
        {
          name: "readmission",
          status: "pending",
          message:
            "Readmission started; access is blocked again unless it completes",
        },
      ],
      lease,
    );
    let checks: SetupCheck[];
    try {
      checks = await approvalService.runReadmission({
        bpn,
        did: latest.did,
        organizationName: partner.legal_name,
        lease,
      });
    } catch (error) {
      lease.assertActive();
      checks = [
        {
          name: "readmission",
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        },
      ];
    }
    lease.assertActive();
    const failed = checks.filter((check) => check.status !== "ok");
    if (failed.length) {
      const reblock = await revocation.runChecks(partner, lease);
      await businessPartners.setRevocationChecks(id, reblock, lease);
      await recordParticipantEvent({
        request,
        businessPartnerId: id,
        onboardingCaseId: latest.id,
        action: "participant.readmission_failed",
        message: `Readmission failed; the participant stays revoked.`,
        payload: { checks, revocationChecks: reblock },
      });
      // 409, not 5xx: server errors are masked, and the operator needs the
      // failed step to fix it.
      throw new ConflictError(
        `Readmission failed; the participant stays revoked. ${failed
          .map((check) => `${check.name}: ${check.message}`)
          .join("; ")}`,
      );
    }

    await businessPartners.completeReadmission(
      id,
      latest.id,
      approvalService.buildCredentialRequest(
        `${bpn}-${Date.now().toString(36)}`,
      ),
      lease,
    );
    await recordParticipantEvent({
      request,
      businessPartnerId: id,
      onboardingCaseId: latest.id,
      action: "participant.readmitted",
      message: `Participant readmitted: ${data.reason.trim()}`,
      payload: { checks },
    });
  }

  async function retryTechnicalSetup(request, response, id) {
    const latest = await loadLatestCaseForPartner(id);
    assertCanRetryConnectorSetup(latest);
    await onboardingCases.updateState(latest.id, "IN_REVIEW", {
      setup_attempt_count: 0,
      setup_started_at: null,
      setup_next_attempt_at: new Date(),
    });
    await recordParticipantEvent({
      request,
      businessPartnerId: id,
      onboardingCaseId: latest.id,
      action: "participant.technical_retry_requested",
      message: "Admin queued another automatic connector setup attempt.",
      payload: {},
    });
    sendJson(response, 202, await getParticipantDto(id));
  }

  async function updateTechnicalMetadata(
    request,
    response,
    id,
    body?: ParsedBody,
  ) {
    const latest = await loadLatestCaseForPartner(id);
    assertCanUpdateConnectorMetadata(latest);
    const metadata =
      body !== undefined
        ? technicalMetadataUpdateSchema.parse(body)
        : await readJson(request, technicalMetadataUpdateSchema);
    const merged = normalizeTechnicalMetadataInput({ ...latest, ...metadata });
    await updateCaseTechnicalMetadata(latest.id, merged);
    await recordParticipantEvent({
      request,
      businessPartnerId: id,
      onboardingCaseId: latest.id,
      action: "participant.technical_metadata_updated",
      message: "Connector metadata updated by operator.",
      payload: merged,
    });
    sendJson(response, 200, await getParticipantDto(id));
  }

  return { createParticipant, handleAdminParticipant };

  async function createParticipant(request, response, parsedBody?: ParsedBody) {
    const body =
      parsedBody !== undefined
        ? participantCreateInputSchema.parse(parsedBody)
        : await readJson(request, participantCreateInputSchema);
    const suppliedBpn = String(body.bpn ?? "").trim();
    const generatedBpn = !suppliedBpn;
    const assignedBpn = generatedBpn ? await generateLocalBpn() : suppliedBpn;
    assertBpnFormat(assignedBpn);
    const bpnSource = generatedBpn ? "LOCAL" : "EXTERNAL";
    const verificationNotes = String(body.verificationNotes ?? "").trim();
    const partnerData = normalizeBusinessPartnerInput({
      ...body,
      requestedBpn: generatedBpn ? "" : assignedBpn,
      assignedBpn,
      bpnSource,
      externalAuthority: "",
      verificationStatus: "VERIFIED",
      verificationNotes,
    });
    if (!partnerData.legalName) {
      throw new BadRequestError("Missing required fields: legalName");
    }

    const partnerId = randomUUID();
    try {
      await businessPartners.insert({
        id: partnerId,
        legal_name: partnerData.legalName,
        legal_form: partnerData.legalForm,
        registered_address: partnerData.registeredAddress,
        country: partnerData.country,
        tax_id: partnerData.taxId,
        commercial_register_number: partnerData.commercialRegisterNumber,
        website: partnerData.website,
        contact_email: partnerData.contactEmail,
        requested_bpn: partnerData.requestedBpn,
        assigned_bpn: assignedBpn,
        bpn_source: bpnSource,
        external_authority: "",
        verification_status: "VERIFIED",
        verification_notes: verificationNotes,
        verified_at: new Date(),
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictError("Assigned BPN is already registered");
      }
      throw error;
    }

    const caseData = normalizeCaseInput({
      ...body,
      organizationName: partnerData.legalName,
      requestedBpn: generatedBpn ? "" : assignedBpn,
      contactEmail: partnerData.contactEmail,
      requestedRole: body.requestedRole ?? "participant",
    });
    const created = await createOnboardingCaseForPartner(partnerId, caseData);
    await recordParticipantEvent({
      request,
      businessPartnerId: partnerId,
      onboardingCaseId: created.caseId,
      action: generatedBpn
        ? "participant.bpn_assigned"
        : "participant.bpn_accepted",
      message: generatedBpn
        ? `Assigned local BPN ${assignedBpn} during participant creation.`
        : `Accepted existing BPN ${assignedBpn} during participant creation.`,
      payload: { assignedBpn, source: bpnSource },
    });
    await recordParticipantEvent({
      request,
      businessPartnerId: partnerId,
      onboardingCaseId: created.caseId,
      action: "participant.invited",
      message: "Operator created participant invite.",
      payload: { assignedBpn, bpnSource },
    });

    sendJson(response, 201, {
      participant: await getParticipantDto(partnerId),
      registrationToken: created.registrationToken,
    });
  }

  // Router function that delegates to specific handlers
  async function handleAdminParticipant(
    request,
    response,
    id,
    action,
    body?: ParsedBody,
  ) {
    const routeKey = `${request.method} ${action || ""}`;

    const routes = {
      "GET ": () => getParticipant(request, response, id),
      "PATCH organization": () =>
        updateOrganization(request, response, id, body),
      "POST reject": () => rejectParticipant(request, response, id, body),
      "POST revoke": () => revokeParticipant(request, response, id, body),
      "POST readmit": () => readmitParticipant(request, response, id, body),
      "POST retry-technical-setup": () =>
        retryTechnicalSetup(request, response, id),
      "PATCH technical-metadata": () =>
        updateTechnicalMetadata(request, response, id, body),
    };

    const handler = routes[routeKey];
    if (handler) {
      await handler();
    } else {
      sendJson(response, 404, { error: "Not found" });
    }
  }
}

const connectorMetadataMutableStates = new Set([
  "REQUESTED",
  "IN_REVIEW",
  "FAILED",
]);

function assertCanRejectParticipant(partner, latestCase) {
  if (partner.verification_status === "REVOKED") {
    throw new ConflictError("Participant is revoked");
  }
  if (
    partner.verification_status === "REJECTED" ||
    latestCase.state === "REJECTED"
  ) {
    throw new ConflictError("Participant is already rejected");
  }
  if (
    latestCase.state !== "REQUESTED" ||
    latestCase.setup_started_at ||
    latestCase.setup_attempt_count > 0
  ) {
    throw new ConflictError(
      "Rejection is only available before connector setup is queued; use Revoke once setup has started",
    );
  }
}

function assertCanUpdateConnectorMetadata(latestCase) {
  if (
    latestCase.bp_verification_status !== "VERIFIED" ||
    !latestCase.bp_assigned_bpn
  ) {
    throw new ConflictError(
      "Participant must have a verified assigned BPN before connector metadata can be updated",
    );
  }
  if (
    !connectorMetadataMutableStates.has(latestCase.state) ||
    latestCase.setup_started_at
  ) {
    throw new ConflictError(
      `Connector metadata cannot be updated while onboarding case is ${latestCase.state}`,
    );
  }
}

function assertCanRetryConnectorSetup(latestCase) {
  if (latestCase.state !== "FAILED") {
    throw new ConflictError(
      "Connector setup retry is only allowed after a failed setup check",
    );
  }
}
