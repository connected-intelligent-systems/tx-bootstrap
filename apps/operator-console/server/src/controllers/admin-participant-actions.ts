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
  rejectSchema,
  technicalMetadataUpdateSchema,
} from "../../../src/shared/api/index.js";
import type { EmailService } from "@tx-bootstrap/core/server/services/email-service.js";
import { emailTemplates } from "@tx-bootstrap/core/server/services/email-templates.js";

type ParsedBody = unknown;

export function createAdminParticipantActions({
  businessPartners,
  lifecycle,
  onboardingCases,
  emailService,
}: {
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
    await businessPartners.reject(id, reason);
    await onboardingCases.rejectForBusinessPartner(id, reason);
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
  if (
    partner.verification_status === "REJECTED" ||
    latestCase.state === "REJECTED"
  ) {
    throw new ConflictError("Participant is already rejected");
  }
  if (latestCase.state === "CREDENTIALS_REQUESTED") {
    throw new ConflictError(
      "Participants with requested or issued credentials cannot be rejected through onboarding",
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
