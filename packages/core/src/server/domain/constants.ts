/**
 * Domain constants for participant onboarding and business partner management
 */

export const VerificationStatus = {
  UNVERIFIED: "UNVERIFIED",
  IN_REVIEW: "IN_REVIEW",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;

export type VerificationStatusType =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const BpnSource = {
  LOCAL: "LOCAL",
  IMPORTED: "IMPORTED",
  EXTERNAL: "EXTERNAL",
} as const;

export type BpnSourceType = (typeof BpnSource)[keyof typeof BpnSource];

export const OnboardingCaseState = {
  REQUESTED: "REQUESTED",
  IN_REVIEW: "IN_REVIEW",
  READY_FOR_PARTICIPANT: "READY_FOR_PARTICIPANT",
  CREDENTIALS_REQUESTED: "CREDENTIALS_REQUESTED",
  REJECTED: "REJECTED",
  FAILED: "FAILED",
} as const;

export type OnboardingCaseStateType =
  (typeof OnboardingCaseState)[keyof typeof OnboardingCaseState];

export const ParticipantStage = {
  IDENTITY_PROOFING: "IDENTITY_PROOFING",
  BPN_DECISION: "BPN_DECISION",
  CONNECTOR_SETUP: "CONNECTOR_SETUP",
  CREDENTIALS: "CREDENTIALS",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
} as const;

export type ParticipantStageType =
  (typeof ParticipantStage)[keyof typeof ParticipantStage];

export const CredentialState = {
  NOT_REQUESTED: "NOT_REQUESTED",
  READY: "READY",
  REQUESTED: "REQUESTED",
  ISSUED: "ISSUED",
  FAILED: "FAILED",
} as const;

export type CredentialStateType =
  (typeof CredentialState)[keyof typeof CredentialState];

export const ParticipantAction = {
  INVITED: "participant.invited",
  ORGANIZATION_UPDATED: "participant.organization_updated",
  BPN_ASSIGNED: "participant.bpn_assigned",
  BPN_ACCEPTED: "participant.bpn_accepted",
  REJECTED: "participant.rejected",
  TECHNICAL_SETUP_STARTED: "participant.technical_setup_started",
  TECHNICAL_SETUP_RETRY_SCHEDULED:
    "participant.technical_setup_retry_scheduled",
  TECHNICAL_SETUP_COMPLETED: "participant.technical_setup_completed",
  TECHNICAL_SETUP_FAILED: "participant.technical_setup_failed",
  TECHNICAL_RETRY_REQUESTED: "participant.technical_retry_requested",
  TECHNICAL_METADATA_UPDATED: "participant.technical_metadata_updated",
} as const;

export type ParticipantActionType =
  (typeof ParticipantAction)[keyof typeof ParticipantAction];

export const BPN_FORMAT_REGEX = /^BPN[LSA][A-Z0-9]{12}$/;
export const LOCAL_BPN_PREFIX = "BPNLDS";
export const LOCAL_BPN_FORMAT = "BPNLDS0000000001";
