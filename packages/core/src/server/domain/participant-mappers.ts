import type { BusinessPartnerRow, OnboardingCaseRow } from "../db/database.js";
import { BadRequestError } from "../http/errors.js";
import {
  BPN_FORMAT_REGEX,
  BpnSource,
  type BpnSourceType,
  CredentialState,
  type CredentialStateType,
  LOCAL_BPN_PREFIX,
  OnboardingCaseState,
  ParticipantStage,
  type ParticipantStageType,
  VerificationStatus,
  type VerificationStatusType,
} from "./constants.js";

// Type definitions for DTOs and inputs
export interface TechnicalMetadataInput {
  did?: string;
  dspEndpoint?: string;
  dsp_endpoint?: string;
  identityHubCredentialServiceEndpoint?: string;
  identityhub_credential_service_endpoint?: string;
}

export interface CaseInput {
  organizationName?: string;
  organization_name?: string;
  legalForm?: string;
  legal_form?: string;
  registeredAddress?: string;
  registered_address?: string;
  country?: string;
  taxId?: string;
  tax_id?: string;
  vatId?: string;
  vat_id?: string;
  commercialRegisterNumber?: string;
  commercial_register_number?: string;
  website?: string;
  requestedBpn?: string;
  requested_bpn?: string;
  bpn?: string;
  did?: string;
  dspEndpoint?: string;
  dsp_endpoint?: string;
  identityHubCredentialServiceEndpoint?: string;
  identityhub_credential_service_endpoint?: string;
  contactEmail?: string;
  contact_email?: string;
  requestedRole?: string;
  requested_role?: string;
}

export interface BusinessPartnerInput {
  legalName?: string;
  legal_name?: string;
  organizationName?: string;
  legalForm?: string;
  legal_form?: string;
  registeredAddress?: string;
  registered_address?: string;
  country?: string;
  taxId?: string;
  tax_id?: string;
  commercialRegisterNumber?: string;
  commercial_register_number?: string;
  website?: string;
  contactEmail?: string;
  contact_email?: string;
  requestedBpn?: string;
  requested_bpn?: string;
  bpn?: string;
  assignedBpn?: string;
  assigned_bpn?: string;
  bpnSource?: string;
  bpn_source?: string;
  externalAuthority?: string;
  external_authority?: string;
  verificationStatus?: string;
  verification_status?: string;
  verificationNotes?: string;
  verification_notes?: string;
}

export interface NormalizedTechnicalMetadata {
  did: string;
  dspEndpoint: string;
  identityHubCredentialServiceEndpoint: string;
}

export interface NormalizedCaseInput {
  organizationName: string;
  legalForm: string;
  registeredAddress: string;
  country: string;
  taxId: string;
  commercialRegisterNumber: string;
  website: string;
  requestedBpn: string;
  did: string;
  dspEndpoint: string;
  identityHubCredentialServiceEndpoint: string;
  contactEmail: string;
  requestedRole: string;
}

export interface NormalizedBusinessPartnerInput {
  legalName: string;
  legalForm: string;
  registeredAddress: string;
  country: string;
  taxId: string;
  commercialRegisterNumber: string;
  website: string;
  contactEmail: string;
  requestedBpn: string;
  assignedBpn: string;
  bpnSource: BpnSourceType;
  externalAuthority: string;
  verificationStatus: VerificationStatusType;
  verificationNotes: string;
}

export function formatLocalBpn(value: string | bigint | number): string {
  return LOCAL_BPN_PREFIX + String(value).padStart(10, "0");
}

export function normalizeTechnicalMetadataInput(
  body: TechnicalMetadataInput,
): NormalizedTechnicalMetadata {
  const normalized = {
    did: String(body.did ?? "").trim(),
    dspEndpoint: String(body.dspEndpoint ?? body.dsp_endpoint ?? "").trim(),
    identityHubCredentialServiceEndpoint: String(
      body.identityHubCredentialServiceEndpoint ??
        body.identityhub_credential_service_endpoint ??
        "",
    ).trim(),
  };
  const missing = Object.entries(normalized)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new BadRequestError(
      `Missing required connector metadata: ${missing.join(", ")}`,
    );
  }
  return normalized;
}

export function normalizeCaseInput(body: CaseInput): NormalizedCaseInput {
  const normalized = {
    organizationName: String(
      body.organizationName ?? body.organization_name ?? "",
    ).trim(),
    legalForm: String(body.legalForm ?? body.legal_form ?? "").trim(),
    registeredAddress: String(
      body.registeredAddress ?? body.registered_address ?? "",
    ).trim(),
    country: String(body.country ?? "").trim(),
    taxId: String(
      body.taxId ?? body.tax_id ?? body.vatId ?? body.vat_id ?? "",
    ).trim(),
    commercialRegisterNumber: String(
      body.commercialRegisterNumber ?? body.commercial_register_number ?? "",
    ).trim(),
    website: String(body.website ?? "").trim(),
    requestedBpn: String(
      body.requestedBpn ?? body.requested_bpn ?? body.bpn ?? "",
    ).trim(),
    did: String(body.did ?? "").trim(),
    dspEndpoint: String(body.dspEndpoint ?? body.dsp_endpoint ?? "").trim(),
    identityHubCredentialServiceEndpoint: String(
      body.identityHubCredentialServiceEndpoint ??
        body.identityhub_credential_service_endpoint ??
        "",
    ).trim(),
    contactEmail: String(body.contactEmail ?? body.contact_email ?? "").trim(),
    requestedRole: String(
      body.requestedRole ?? body.requested_role ?? "participant",
    ).trim(),
  };
  const optionalFields = new Set([
    "legalForm",
    "registeredAddress",
    "country",
    "taxId",
    "commercialRegisterNumber",
    "website",
    "requestedBpn",
    "did",
    "dspEndpoint",
    "identityHubCredentialServiceEndpoint",
  ]);
  const missing = Object.entries(normalized)
    .filter(([key, value]) => !optionalFields.has(key) && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new BadRequestError(`Missing required fields: ${missing.join(", ")}`);
  }
  return normalized;
}

export function normalizeBusinessPartnerInput(
  body: BusinessPartnerInput,
): NormalizedBusinessPartnerInput {
  const requestedBpn = String(
    body.requestedBpn ?? body.requested_bpn ?? body.bpn ?? "",
  ).trim();
  const assignedBpn = String(
    body.assignedBpn ?? body.assigned_bpn ?? "",
  ).trim();
  return {
    legalName: String(
      body.legalName ?? body.legal_name ?? body.organizationName ?? "",
    ).trim(),
    legalForm: String(body.legalForm ?? body.legal_form ?? "").trim(),
    registeredAddress: String(
      body.registeredAddress ?? body.registered_address ?? "",
    ).trim(),
    country: String(body.country ?? "").trim(),
    taxId: String(body.taxId ?? body.tax_id ?? "").trim(),
    commercialRegisterNumber: String(
      body.commercialRegisterNumber ?? body.commercial_register_number ?? "",
    ).trim(),
    website: String(body.website ?? "").trim(),
    contactEmail: String(body.contactEmail ?? body.contact_email ?? "").trim(),
    requestedBpn,
    assignedBpn,
    bpnSource: normalizeEnum<BpnSourceType>(
      body.bpnSource ??
        body.bpn_source ??
        (assignedBpn
          ? BpnSource.EXTERNAL
          : requestedBpn
            ? BpnSource.EXTERNAL
            : BpnSource.LOCAL),
      [BpnSource.LOCAL, BpnSource.IMPORTED, BpnSource.EXTERNAL],
      BpnSource.LOCAL,
    ),
    externalAuthority: String(
      body.externalAuthority ?? body.external_authority ?? "",
    ).trim(),
    verificationStatus: normalizeEnum<VerificationStatusType>(
      body.verificationStatus ??
        body.verification_status ??
        VerificationStatus.UNVERIFIED,
      [
        VerificationStatus.UNVERIFIED,
        VerificationStatus.IN_REVIEW,
        VerificationStatus.VERIFIED,
        VerificationStatus.REJECTED,
      ],
      VerificationStatus.UNVERIFIED,
    ),
    verificationNotes: String(
      body.verificationNotes ?? body.verification_notes ?? "",
    ).trim(),
  };
}

export function normalizeEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return (allowed as readonly string[]).includes(normalized)
    ? (normalized as T)
    : fallback;
}

export function assertBpnFormat(value: string): void {
  if (!isValidBpn(value)) {
    throw new BadRequestError(
      "BPN must match BPNL/BPNS/BPNA plus 12 uppercase alphanumeric characters",
    );
  }
}

export function isValidBpn(value: string): boolean {
  return BPN_FORMAT_REGEX.test(value);
}

export function toParticipantDto(partner, cases, audit) {
  const latestCase = cases[0] ?? null;
  const stage = deriveParticipantStage(partner, latestCase);
  const updatedAt =
    latestCase?.updatedAt &&
    new Date(latestCase.updatedAt) > new Date(partner.updated_at)
      ? latestCase.updatedAt
      : partner.updated_at;
  const technicalComplete = Boolean(
    latestCase?.did &&
    latestCase?.dspEndpoint &&
    latestCase?.identityHubCredentialServiceEndpoint,
  );
  const credentialReceipts = latestCase?.credentialReceipts ?? [];

  return {
    id: partner.id,
    stage,
    nextAction: nextParticipantAction(
      stage,
      partner,
      latestCase,
      technicalComplete,
    ),
    organization: {
      legalName: partner.legal_name,
      legalForm: partner.legal_form,
      registeredAddress: partner.registered_address,
      country: partner.country,
      taxId: partner.tax_id,
      commercialRegisterNumber: partner.commercial_register_number,
      website: partner.website,
      contactEmail: partner.contact_email,
    },
    bpn: {
      requestedBpn: partner.requested_bpn,
      assignedBpn: partner.assigned_bpn,
      source: partner.bpn_source,
      externalAuthority: partner.external_authority,
      verificationStatus: partner.verification_status,
      verificationNotes: partner.verification_notes,
      verifiedAt: partner.verified_at,
    },
    technical: {
      did: latestCase?.did ?? "",
      dspEndpoint: latestCase?.dspEndpoint ?? "",
      credentialServiceEndpoint:
        latestCase?.identityHubCredentialServiceEndpoint ?? "",
      metadataComplete: technicalComplete,
      setupChecks: latestCase?.setupChecks ?? [],
    },
    credentials: {
      state: deriveCredentialState(latestCase, credentialReceipts),
      request: latestCase?.credentialRequest ?? {},
      receipts: credentialReceipts,
    },
    onboarding: latestCase,
    cases: cases.map((item) => ({
      id: item.id,
      state: item.state,
      requestedBpn: item.requestedBpn,
      assignedBpn: item.assignedBpn,
      updatedAt: item.updatedAt,
    })),
    audit,
    createdAt: partner.created_at,
    updatedAt,
  };
}

export function deriveParticipantStage(
  partner: BusinessPartnerRow,
  latestCase: OnboardingCaseRow | undefined,
): ParticipantStageType {
  if (
    partner.verification_status === VerificationStatus.REJECTED ||
    latestCase?.state === OnboardingCaseState.REJECTED
  )
    return ParticipantStage.REJECTED;
  if (latestCase?.state === OnboardingCaseState.FAILED)
    return ParticipantStage.FAILED;
  if (
    latestCase &&
    (latestCase.state === OnboardingCaseState.READY_FOR_PARTICIPANT ||
      latestCase.state === OnboardingCaseState.CREDENTIALS_REQUESTED)
  )
    return ParticipantStage.CREDENTIALS;
  if (partner.verification_status !== VerificationStatus.VERIFIED) {
    return partner.requested_bpn
      ? ParticipantStage.BPN_DECISION
      : ParticipantStage.IDENTITY_PROOFING;
  }
  return ParticipantStage.CONNECTOR_SETUP;
}

export function deriveCredentialState(
  latestCase: OnboardingCaseRow | undefined,
  receipts: Array<{ status?: string }>,
): CredentialStateType {
  if (!latestCase) return CredentialState.NOT_REQUESTED;
  const latestReceipt = receipts.at(-1);
  if (latestReceipt?.status === "issued") return CredentialState.ISSUED;
  if (latestReceipt?.status === "failed") return CredentialState.FAILED;
  if (
    latestCase.state === OnboardingCaseState.CREDENTIALS_REQUESTED ||
    latestReceipt?.status === "requested" ||
    latestReceipt?.status === "reported"
  )
    return CredentialState.REQUESTED;
  if (latestCase.state === OnboardingCaseState.READY_FOR_PARTICIPANT)
    return CredentialState.READY;
  return CredentialState.NOT_REQUESTED;
}

export function nextParticipantAction(
  stage: ParticipantStageType,
  partner: BusinessPartnerRow,
  latestCase: OnboardingCaseRow | undefined,
  technicalComplete: boolean,
): string {
  if (stage === ParticipantStage.IDENTITY_PROOFING)
    return "Review legal identity and assign a local BPN.";
  if (stage === ParticipantStage.BPN_DECISION)
    return "Accept the existing BPN with evidence or assign a local BPN.";
  if (stage === ParticipantStage.CONNECTOR_SETUP && !latestCase)
    return "Send the registration token to the participant.";
  if (stage === ParticipantStage.CONNECTOR_SETUP && !technicalComplete)
    return "Wait for the participant stack to report DID and endpoint metadata.";
  if (
    stage === ParticipantStage.CONNECTOR_SETUP &&
    latestCase?.state === "IN_REVIEW"
  )
    return "Automatic connector setup is preparing BDRS and issuer state.";
  if (stage === ParticipantStage.CONNECTOR_SETUP)
    return "Wait for the participant gateway to submit connector metadata.";
  if (stage === ParticipantStage.CREDENTIALS)
    return "Participant can request credentials and is ready for dataspace operations.";
  if (stage === ParticipantStage.FAILED)
    return "Review setup checks and retry connector setup.";
  if (stage === ParticipantStage.REJECTED)
    return (
      partner.verification_notes ||
      latestCase?.rejection_reason ||
      "Participant was rejected."
    );
  return "Review participant.";
}

export function toParticipantEventDto(row) {
  return {
    id: row.id,
    businessPartnerId: row.business_partner_id,
    onboardingCaseId: row.onboarding_case_id,
    actor: row.actor,
    action: row.action,
    message: row.message,
    payload: row.payload ?? {},
    createdAt: row.created_at,
  };
}

export function toCaseDto(row) {
  const businessPartner = toJoinedBusinessPartnerDto(row);
  const requestedBpn =
    row.requested_bpn || businessPartner?.requestedBpn || row.bpn || "";
  const assignedBpn = businessPartner?.assignedBpn || "";
  const displayBpn = assignedBpn || row.bpn || requestedBpn;
  return {
    id: row.id,
    businessPartnerId: row.business_partner_id,
    businessPartner,
    organizationName: row.organization_name,
    requestedBpn,
    assignedBpn,
    bpn: displayBpn,
    did: row.did,
    dspEndpoint: row.dsp_endpoint,
    identityHubCredentialServiceEndpoint:
      row.identityhub_credential_service_endpoint,
    contactEmail: row.contact_email,
    requestedRole: row.requested_role,
    state: row.state,
    adminNotes: row.admin_notes,
    rejectionReason: row.rejection_reason,
    issuerDid: row.issuer_did,
    credentialRequest: row.credential_request,
    setupChecks: row.setup_checks ?? [],
    credentialReceipts: row.credential_receipts ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toJoinedBusinessPartnerDto(row) {
  if (!row.bp_id) return null;
  return {
    id: row.bp_id,
    legalName: row.bp_legal_name,
    legalForm: row.bp_legal_form,
    registeredAddress: row.bp_registered_address,
    country: row.bp_country,
    taxId: row.bp_tax_id,
    commercialRegisterNumber: row.bp_commercial_register_number,
    website: row.bp_website,
    contactEmail: row.bp_contact_email,
    requestedBpn: row.bp_requested_bpn,
    assignedBpn: row.bp_assigned_bpn,
    bpnSource: row.bp_bpn_source,
    externalAuthority: row.bp_external_authority,
    verificationStatus: row.bp_verification_status,
    verificationNotes: row.bp_verification_notes,
    verifiedAt: row.bp_verified_at,
    createdAt: row.bp_created_at,
    updatedAt: row.bp_updated_at,
  };
}

export function toBusinessPartnerDto(row, onboardingCases = []) {
  return {
    id: row.id,
    legalName: row.legal_name,
    legalForm: row.legal_form,
    registeredAddress: row.registered_address,
    country: row.country,
    taxId: row.tax_id,
    commercialRegisterNumber: row.commercial_register_number,
    website: row.website,
    contactEmail: row.contact_email,
    requestedBpn: row.requested_bpn,
    assignedBpn: row.assigned_bpn,
    bpnSource: row.bpn_source,
    externalAuthority: row.external_authority,
    verificationStatus: row.verification_status,
    verificationNotes: row.verification_notes,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    onboardingCases,
  };
}
