import type { ChipColor } from "./components/participant-formatters";
import type { Participant } from "./types";

export type ParticipantTaskQueue = "admin" | "failed" | "waiting" | "done";

export type OperatorTaskKind = "connector-retry";

export interface ParticipantTask {
  queue: ParticipantTaskQueue;
  taskKind: OperatorTaskKind | null;
  title: string;
  description: string;
  tableCue: string;
  severity: ChipColor;
  isAdminAction: boolean;
}

export const participantTaskQueues: Array<{
  key: ParticipantTaskQueue;
  label: string;
}> = [
  { key: "admin", label: "Needs admin action" },
  { key: "failed", label: "Setup failed" },
  { key: "waiting", label: "Waiting for participant" },
  { key: "done", label: "No admin action" },
];

export function isConnectorSetupApprovable(
  participant: Pick<Participant, "bpn">,
  technical: {
    did: string;
    dspEndpoint: string;
    identityHubCredentialServiceEndpoint: string;
  },
): boolean {
  return (
    participant.bpn.verificationStatus === "VERIFIED" &&
    Boolean(
      technical.did &&
      technical.dspEndpoint &&
      technical.identityHubCredentialServiceEndpoint,
    )
  );
}

export function canEditConnectorMetadata(participant: Participant): boolean {
  return Boolean(
    participant.onboarding &&
    ["REQUESTED", "IN_REVIEW", "FAILED"].includes(participant.onboarding.state),
  );
}

export function isParticipantActive(participant: Participant): boolean {
  return (
    participant.stage === "CREDENTIALS" &&
    participant.credentials.state === "ISSUED"
  );
}

/**
 * The CONNECTOR_SETUP sub-conditions intentionally mirror
 * nextParticipantAction() in packages/core/src/server/domain/participant-mappers.ts.
 */
export function deriveParticipantTask(
  participant: Participant,
): ParticipantTask {
  const hasCompleteTechnicalMetadata = Boolean(
    participant.technical.did &&
    participant.technical.dspEndpoint &&
    participant.technical.credentialServiceEndpoint,
  );
  if (participant.stage === "FAILED") {
    return executableTask({
      queue: "failed",
      taskKind: "connector-retry",
      title: "Retry connector setup",
      description:
        "Connector setup failed. Review the failed checks, then retry the setup when the issue is fixed.",
      tableCue: "Retry setup",
      severity: "error",
    });
  }

  if (participant.stage === "REJECTED") {
    return statusTask({
      queue: "done",
      title: "Participant rejected",
      description:
        participant.onboarding?.rejectionReason ||
        participant.bpn.verificationNotes ||
        "Participant was rejected.",
      tableCue: "Rejected",
      severity: "error",
    });
  }

  if (participant.stage === "CONNECTOR_SETUP") {
    if (!participant.onboarding) {
      return statusTask({
        queue: "waiting",
        title: "Waiting for participant registration",
        description:
          "The participant must attach its gateway to this onboarding case before connector setup can continue.",
        tableCue: "Waiting",
        severity: "info",
      });
    }

    if (!hasCompleteTechnicalMetadata) {
      return statusTask({
        queue: "waiting",
        title: "Waiting for connector metadata",
        description:
          "The participant gateway must report DID, DSP endpoint, and credential service endpoint before automatic setup can start.",
        tableCue: "Waiting",
        severity: "info",
      });
    }

    if (participant.onboarding.state === "IN_REVIEW") {
      return statusTask({
        queue: "waiting",
        title: "Automatic connector setup in progress",
        description:
          "The operator services are validating metadata and preparing BDRS and issuer state. No admin action is required.",
        tableCue: "Setting up",
        severity: "info",
      });
    }

    return statusTask({
      queue: "waiting",
      title: "Waiting for connector submission",
      description:
        "The participant gateway must attach the invite and submit its connector metadata.",
      tableCue: "Waiting",
      severity: "info",
    });
  }

  if (participant.stage === "CREDENTIALS") {
    return statusTask({
      queue: "done",
      title: "Participant can request credentials",
      description:
        "No admin action is required. The participant gateway can request credentials and continue dataspace operations.",
      tableCue: "Ready",
      severity: "success",
    });
  }

  return statusTask({
    queue: "waiting",
    title: "Registration in progress",
    description: participant.nextAction,
    tableCue: "In progress",
    severity: "info",
  });
}

function executableTask(
  task: Omit<ParticipantTask, "isAdminAction">,
): ParticipantTask {
  return { ...task, isAdminAction: true };
}

function statusTask(
  task: Omit<ParticipantTask, "isAdminAction" | "taskKind">,
): ParticipantTask {
  return { ...task, taskKind: null, isAdminAction: false };
}
