import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Repositories } from "../db/repositories/index.js";
import {
  formatLocalBpn,
  toCaseDto,
  toParticipantDto,
  toParticipantEventDto,
} from "../domain/participant-mappers.js";
import { ConflictError, NotFoundError } from "../http/errors.js";
import { hashToken, randomToken } from "../utils/crypto.js";
import { encodeRegistrationToken } from "../../api/registration-token.js";

type OperatorAuth = { eventActor(request: IncomingMessage): string };

type ApprovalService = {
  buildCredentialRequest(holderPid: string): unknown;
};

export function createParticipantLifecycleService({
  auth,
  businessPartners,
  issuerDid,
  onboardingCases,
  participantEvents,
  approvalService,
}: {
  auth: OperatorAuth;
  businessPartners: Repositories["businessPartners"];
  issuerDid: string;
  onboardingCases: Repositories["onboardingCases"];
  participantEvents: Repositories["participantEvents"];
  approvalService: ApprovalService;
}) {
  const { buildCredentialRequest } = approvalService;

  return {
    createOnboardingCaseForPartner,
    generateLocalBpn,
    getParticipantDto,
    listParticipants,
    loadBusinessPartner,
    loadCase,
    loadLatestCaseForPartner,
    recordParticipantEvent,
    syncUnverifiedOnboardingMetadata,
    updateCaseTechnicalMetadata,
  };

  async function listParticipants(
    filters?: import("../db/repositories/business-partners.js").ListPartnersFilters,
  ) {
    return participantsWithCases(await businessPartners.list(filters), {
      includeEvents: false,
    });
  }

  async function getParticipantDto(id) {
    const partner = await loadBusinessPartner(id);
    return (await participantsWithCases([partner], { includeEvents: true }))[0];
  }

  async function participantsWithCases(partners, { includeEvents }) {
    if (!partners.length) return [];
    const ids = partners.map((partner) => partner.id);
    const caseRows = await onboardingCases.listForBusinessPartners(ids);

    const casesByPartner = new Map();
    for (const row of caseRows) {
      const current = casesByPartner.get(row.business_partner_id) ?? [];
      current.push(toCaseDto(row));
      casesByPartner.set(row.business_partner_id, current);
    }

    const eventsByPartner = new Map();
    if (includeEvents) {
      const eventRows = await participantEvents.listForBusinessPartners(ids);
      for (const row of eventRows) {
        const current = eventsByPartner.get(row.business_partner_id) ?? [];
        current.push(toParticipantEventDto(row));
        eventsByPartner.set(row.business_partner_id, current);
      }
    }

    return partners.map((partner) => {
      const cases = casesByPartner.get(partner.id) ?? [];
      return toParticipantDto(
        partner,
        cases,
        eventsByPartner.get(partner.id) ?? [],
      );
    });
  }

  async function syncUnverifiedOnboardingMetadata(partnerId, data) {
    await onboardingCases.updateUnverifiedMetadata(partnerId, {
      organizationName: data.legalName,
      contactEmail: data.contactEmail,
      requestedBpn: data.requestedBpn,
    });
  }

  async function generateLocalBpn() {
    return formatLocalBpn(await businessPartners.nextLocalBpnValue());
  }

  async function createOnboardingCaseForPartner(businessPartnerId, data) {
    const id = randomUUID();
    const token = randomToken();
    const partner = await loadBusinessPartner(businessPartnerId);
    const assignedBpn = partner.assigned_bpn || "";
    const displayBpn = assignedBpn || data.requestedBpn;

    const caseId = await onboardingCases.insert({
      id,
      participant_token_hash: hashToken(token),
      business_partner_id: businessPartnerId,
      organization_name: data.organizationName,
      requested_bpn: data.requestedBpn,
      bpn: displayBpn,
      did: data.did,
      dsp_endpoint: data.dspEndpoint,
      identityhub_credential_service_endpoint:
        data.identityHubCredentialServiceEndpoint,
      contact_email: data.contactEmail,
      requested_role: data.requestedRole,
      issuer_did: issuerDid,
      credential_request: buildCredentialRequest(assignedBpn),
      admin_notes: "",
      rejection_reason: "",
      setup_checks: [],
      credential_receipts: [],
    });

    return {
      caseId,
      participantToken: token,
      registrationToken: encodeRegistrationToken({
        caseId,
        participantToken: token,
      }),
      case: toCaseDto(await loadCase(caseId)),
    };
  }

  async function loadLatestCaseForPartner(businessPartnerId) {
    const caseRow =
      await onboardingCases.getLatestForBusinessPartner(businessPartnerId);
    if (!caseRow) throw new NotFoundError("Onboarding case not found");
    return caseRow;
  }

  async function updateCaseTechnicalMetadata(id, metadata) {
    const result = await onboardingCases.updateTechnicalMetadata(id, {
      did: metadata.did,
      dsp_endpoint: metadata.dspEndpoint,
      identityhub_credential_service_endpoint:
        metadata.identityHubCredentialServiceEndpoint,
    });
    if (!result) {
      throw new ConflictError(
        "Connector metadata cannot be updated while automatic setup is active",
      );
    }
  }

  async function loadCase(id) {
    const caseRow = await onboardingCases.getWithBusinessPartner(id);
    if (!caseRow) throw new NotFoundError();
    return caseRow;
  }

  async function loadBusinessPartner(id) {
    const partner = await businessPartners.load(id);
    if (!partner) throw new NotFoundError("Business partner not found");
    return partner;
  }

  async function recordParticipantEvent({
    request,
    businessPartnerId,
    onboardingCaseId,
    actor,
    action,
    message,
    payload,
  }: {
    request: IncomingMessage;
    businessPartnerId?: string | null;
    onboardingCaseId?: string | null;
    actor?: string;
    action: string;
    message?: string;
    payload?: unknown;
  }) {
    if (!businessPartnerId && !onboardingCaseId) return;
    await participantEvents.insert({
      id: randomUUID(),
      businessPartnerId: businessPartnerId || null,
      onboardingCaseId: onboardingCaseId || null,
      actor: actor || eventActor(request),
      action,
      message: message || "",
      payload:
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : { value: payload },
    });
  }

  function eventActor(request) {
    return auth.eventActor(request);
  }
}

export type ParticipantLifecycleService = ReturnType<
  typeof createParticipantLifecycleService
>;
