import { z } from "zod";

const bpnFormat = /^BPN[LSA][A-Z0-9]{12}$/;
const didFormat = /^did:[a-z0-9]+:.+/i;

const nullableString = z.string().nullable().optional();
const jsonRecord = z.record(z.string(), z.unknown());

const boundedString = (max = 255) => z.string().trim().max(max);
const requiredString = (label: string, max = 255) =>
  boundedString(max).min(1, label + " is required");
const optionalString = boundedString(512).default("");
const optionalLongString = boundedString(4000).default("");
const optionalInput = (max = 512) => boundedString(max).optional();
const emailString = requiredString("Contact email", 254).email(
  "Contact email must be a valid email address",
);
const requestedRoleString = boundedString(64).min(1).default("participant");

const optionalBpnString = boundedString(16)
  .refine(
    (value) => value === "" || bpnFormat.test(value),
    "BPN must match BPNL/BPNS/BPNA plus 12 uppercase alphanumeric characters",
  )
  .default("");
const optionalBpnInput = optionalInput(16).refine(
  (value) => value === undefined || value === "" || bpnFormat.test(value),
  "BPN must match BPNL/BPNS/BPNA plus 12 uppercase alphanumeric characters",
);

const optionalDidString = boundedString(512)
  .refine(
    (value) => value === "" || didFormat.test(value),
    "DID must be a valid did:<method>:<identifier> value",
  )
  .default("");
const requiredDidString = requiredString("DID", 512).refine(
  (value) => didFormat.test(value),
  "DID must be a valid did:<method>:<identifier> value",
);
const requiredDidWebString = requiredString("DID", 512).refine(
  (value) => value.startsWith("did:web:"),
  "DID must use did:web",
);

const optionalHttpUrlString = boundedString(2048)
  .refine(
    (value) => value === "" || isHttpUrl(value),
    "Must be a valid http(s) URL",
  )
  .default("");
const requiredHttpUrlString = requiredString("URL", 2048).refine(
  (value) => isHttpUrl(value),
  "Must be a valid http(s) URL",
);

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const bpnSourceSchema = z.enum(["LOCAL", "IMPORTED", "EXTERNAL"]);
export const verificationStatusSchema = z.enum([
  "UNVERIFIED",
  "IN_REVIEW",
  "VERIFIED",
  "REJECTED",
]);
export const onboardingStateSchema = z.enum([
  "REQUESTED",
  "IN_REVIEW",
  "READY_FOR_PARTICIPANT",
  "CREDENTIALS_REQUESTED",
  "REJECTED",
  "FAILED",
]);
export const participantStageSchema = z.enum([
  "REGISTRATION",
  "IDENTITY_PROOFING",
  "BPN_DECISION",
  "CONNECTOR_SETUP",
  "CREDENTIALS",
  "REJECTED",
  "FAILED",
]);
export const credentialStateSchema = z.enum([
  "NOT_REQUESTED",
  "READY",
  "REQUESTED",
  "ISSUED",
  "FAILED",
]);
export const credentialReceiptReportStatusSchema = z.enum([
  "reported",
  "requested",
  "issued",
  "failed",
]);

export const setupCheckSchema = z.object({
  name: z.string(),
  status: z.string(),
  retryable: z.boolean().optional(),
  message: z.string(),
});

export const credentialRequestPayloadSchema = z.object({
  issuerDid: z.string(),
  holderPid: z.string(),
  credentials: z.array(
    z.object({ id: z.string(), type: z.string(), format: z.string() }),
  ),
});

const credentialRecordSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  issuer: z.string().optional(),
  state: z.string().optional(),
});

export const credentialReceiptSchema = z.object({
  id: z.string(),
  receivedAt: z.string(),
  status: z.string(),
  message: z.string().optional(),
  credentials: z.array(credentialRecordSchema),
});

export const businessPartnerSummarySchema = z.object({
  id: z.string(),
  legalName: z.string(),
  legalForm: z.string(),
  registeredAddress: z.string(),
  country: z.string(),
  taxId: z.string(),
  commercialRegisterNumber: z.string(),
  website: z.string(),
  contactEmail: z.string(),
  requestedBpn: z.string(),
  assignedBpn: z.string(),
  bpnSource: bpnSourceSchema,
  externalAuthority: z.string(),
  verificationStatus: verificationStatusSchema,
  verificationNotes: z.string(),
  verifiedAt: nullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const onboardingCaseSchema = z.object({
  id: z.string(),
  businessPartnerId: z.string().nullable().optional(),
  businessPartner: businessPartnerSummarySchema.nullable().optional(),
  organizationName: z.string(),
  requestedBpn: z.string(),
  assignedBpn: z.string(),
  bpn: z.string(),
  did: z.string(),
  dspEndpoint: z.string(),
  identityHubCredentialServiceEndpoint: z.string(),
  contactEmail: z.string(),
  requestedRole: z.string(),
  state: onboardingStateSchema,
  adminNotes: z.string(),
  rejectionReason: z.string(),
  issuerDid: z.string(),
  credentialRequest: credentialRequestPayloadSchema,
  setupChecks: z.array(setupCheckSchema),
  credentialReceipts: z.array(credentialReceiptSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const onboardingCaseUpdateSchema = z.object({
  businessPartnerId: z.string().nullable().optional(),
  organizationName: requiredString("Organization name"),
  requestedBpn: optionalBpnString,
  did: requiredDidString,
  dspEndpoint: requiredHttpUrlString,
  identityHubCredentialServiceEndpoint: requiredHttpUrlString,
  contactEmail: emailString,
  requestedRole: requiredString("Requested role", 64),
  adminNotes: optionalLongString,
});

export const onboardingCaseCreateSchema = z.object({
  organizationName: requiredString("Organization name"),
  legalForm: optionalString,
  registeredAddress: optionalLongString,
  country: optionalString,
  taxId: optionalString,
  commercialRegisterNumber: optionalString,
  website: optionalHttpUrlString,
  contactEmail: emailString,
  requestedBpn: optionalBpnString,
  requestedRole: requestedRoleString,
  did: optionalDidString,
  dspEndpoint: optionalHttpUrlString,
  identityHubCredentialServiceEndpoint: optionalHttpUrlString,
});

export const participantOrganizationSchema = z.object({
  legalName: z.string(),
  legalForm: z.string(),
  registeredAddress: z.string(),
  country: z.string(),
  taxId: z.string(),
  commercialRegisterNumber: z.string(),
  website: z.string(),
  contactEmail: z.string(),
});

export const participantBpnSchema = z.object({
  requestedBpn: z.string(),
  assignedBpn: z.string(),
  source: bpnSourceSchema,
  externalAuthority: z.string(),
  verificationStatus: verificationStatusSchema,
  verificationNotes: z.string(),
  verifiedAt: nullableString,
});

export const participantTechnicalSchema = z.object({
  did: z.string(),
  dspEndpoint: z.string(),
  credentialServiceEndpoint: z.string(),
  metadataComplete: z.boolean(),
  setupChecks: z.array(setupCheckSchema),
});

export const participantCredentialsSchema = z.object({
  state: credentialStateSchema,
  request: credentialRequestPayloadSchema.partial().or(jsonRecord),
  receipts: z.array(credentialReceiptSchema),
});

export const participantCaseSummarySchema = z.object({
  id: z.string(),
  state: z.string(),
  requestedBpn: z.string(),
  assignedBpn: z.string(),
  updatedAt: z.string(),
});

export const participantEventSchema = z.object({
  id: z.string(),
  businessPartnerId: z.string().nullable().optional(),
  onboardingCaseId: z.string().nullable().optional(),
  actor: z.string(),
  action: z.string(),
  message: z.string(),
  payload: jsonRecord,
  createdAt: z.string(),
});

export const participantSchema = z.object({
  id: z.string(),
  stage: participantStageSchema,
  nextAction: z.string(),
  organization: participantOrganizationSchema,
  bpn: participantBpnSchema,
  technical: participantTechnicalSchema,
  credentials: participantCredentialsSchema,
  onboarding: onboardingCaseSchema.nullable().optional(),
  cases: z.array(participantCaseSummarySchema),
  audit: z.array(participantEventSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const participantOrganizationUpdateSchema = participantOrganizationSchema
  .partial()
  .strict();

export const participantCreateInputSchema =
  participantOrganizationSchema.extend({
    bpn: optionalBpnInput,
    verificationNotes: optionalInput(4000),
    requestedRole: boundedString(64).optional(),
  });

export const participantInviteSchema = z.object({
  participant: participantSchema,
  registrationToken: z.string(),
});

export const technicalMetadataUpdateSchema = z.object({
  did: requiredDidWebString,
  dspEndpoint: requiredHttpUrlString,
  identityHubCredentialServiceEndpoint: requiredHttpUrlString,
});

export const rejectSchema = z.object({
  reason: optionalInput(4000),
  verificationNotes: optionalInput(4000),
});

export const credentialReceiptsReportSchema = z.object({
  status: credentialReceiptReportStatusSchema.default("reported"),
  message: boundedString(2000).optional().default(""),
  credentials: z.array(credentialRecordSchema).max(100).optional().default([]),
});

export type BpnSource = z.infer<typeof bpnSourceSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
export type ParticipantStage = z.infer<typeof participantStageSchema>;
export type CredentialState = z.infer<typeof credentialStateSchema>;
export type SetupCheck = z.infer<typeof setupCheckSchema>;
export type CredentialReceipt = z.infer<typeof credentialReceiptSchema>;
export type CredentialRequestPayload = z.infer<
  typeof credentialRequestPayloadSchema
>;
export type BusinessPartnerSummary = z.infer<
  typeof businessPartnerSummarySchema
>;
export type OnboardingCase = z.infer<typeof onboardingCaseSchema>;
export type OnboardingCaseUpdate = z.infer<typeof onboardingCaseUpdateSchema>;
export type ParticipantOrganization = z.infer<
  typeof participantOrganizationSchema
>;
export type ParticipantBpn = z.infer<typeof participantBpnSchema>;
export type ParticipantTechnical = z.infer<typeof participantTechnicalSchema>;
export type ParticipantCredentials = z.infer<
  typeof participantCredentialsSchema
>;
export type ParticipantCaseSummary = z.infer<
  typeof participantCaseSummarySchema
>;
export type ParticipantEvent = z.infer<typeof participantEventSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type ParticipantOrganizationUpdate = z.infer<
  typeof participantOrganizationUpdateSchema
>;
export type ParticipantCreateInput = z.infer<
  typeof participantCreateInputSchema
>;
export type ParticipantInvite = z.infer<typeof participantInviteSchema>;
export type TechnicalMetadataUpdate = z.infer<
  typeof technicalMetadataUpdateSchema
>;
export type PublicOnboardingDraft = z.infer<typeof onboardingCaseCreateSchema>;
export type PublicOnboardingResponse = {
  registrationToken: string;
  case: OnboardingCase;
};
