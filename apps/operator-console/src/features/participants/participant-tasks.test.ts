import { describe, expect, it } from "vitest";
import {
  canEditConnectorMetadata,
  deriveParticipantTask,
  isParticipantActive,
} from "./participant-tasks";
import type { Participant } from "./types";

describe("deriveParticipantTask", () => {
  it("does not expose a BPN review task for legacy identity states", () => {
    const task = deriveParticipantTask(
      makeParticipant({
        stage: "BPN_DECISION",
        bpn: {
          ...verifiedBpn(),
          assignedBpn: "",
          verificationStatus: "IN_REVIEW",
          verifiedAt: null,
        },
      }),
    );

    expect(task).toMatchObject({
      queue: "waiting",
      taskKind: null,
      isAdminAction: false,
    });
  });

  it("treats incomplete connector metadata as waiting", () => {
    const participant = makeParticipant({
      stage: "CONNECTOR_SETUP",
      bpn: verifiedBpn(),
      technical: emptyTechnical(),
    });

    expect(deriveParticipantTask(participant)).toMatchObject({
      queue: "waiting",
      taskKind: null,
      isAdminAction: false,
    });
  });

  it("shows automatic setup as in progress without an admin task", () => {
    const participant = makeParticipant({
      stage: "CONNECTOR_SETUP",
      bpn: verifiedBpn(),
      technical: {
        ...completeTechnical(),
        setupChecks: [
          { name: "BDRS", status: "failed", message: "Retry scheduled" },
        ],
      },
    });

    expect(deriveParticipantTask(participant)).toMatchObject({
      queue: "waiting",
      taskKind: null,
      title: "Automatic connector setup in progress",
      isAdminAction: false,
    });
  });

  it("creates a retry task for failed connector setup", () => {
    const participant = makeParticipant({
      stage: "FAILED",
      bpn: verifiedBpn(),
      technical: {
        ...completeTechnical(),
        setupChecks: [
          { name: "BDRS", status: "failed", message: "Unavailable" },
        ],
      },
    });

    expect(deriveParticipantTask(participant)).toMatchObject({
      queue: "failed",
      taskKind: "connector-retry",
      isAdminAction: true,
    });
  });

  it("treats credential-ready participants as completed", () => {
    const participant = makeParticipant({
      stage: "CREDENTIALS",
      credentials: { state: "ISSUED", request: {}, receipts: [] },
    });

    expect(deriveParticipantTask(participant)).toMatchObject({
      queue: "done",
      taskKind: null,
      isAdminAction: false,
    });
    expect(isParticipantActive(participant)).toBe(true);
  });

  it("does not expose tasks for rejected participants", () => {
    const participant = makeParticipant({
      stage: "REJECTED",
      bpn: { ...verifiedBpn(), verificationStatus: "REJECTED" },
    });

    expect(deriveParticipantTask(participant)).toMatchObject({
      queue: "done",
      taskKind: null,
      isAdminAction: false,
    });
  });

  it("treats registration as a non-executable status", () => {
    const participant = makeParticipant({ stage: "REGISTRATION" });

    expect(deriveParticipantTask(participant)).toMatchObject({
      queue: "waiting",
      taskKind: null,
      isAdminAction: false,
    });
  });
});

describe("canEditConnectorMetadata", () => {
  it("only allows edits while the onboarding case is mutable", () => {
    expect(canEditConnectorMetadata(makeParticipant())).toBe(true);
    expect(
      canEditConnectorMetadata(
        makeParticipant({
          onboarding: { ...makeParticipant().onboarding!, state: "REJECTED" },
        }),
      ),
    ).toBe(false);
  });
});

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "participant-1",
    stage: "CONNECTOR_SETUP",
    nextAction: "Wait for connector metadata",
    organization: {
      legalName: "ACME GmbH",
      legalForm: "GmbH",
      registeredAddress: "Example Street 1",
      country: "DE",
      taxId: "DE123",
      commercialRegisterNumber: "HRB 123",
      website: "https://example.com",
      contactEmail: "ops@example.com",
    },
    bpn: {
      requestedBpn: "BPNL000000000001",
      assignedBpn: "BPNL000000000001",
      source: "EXTERNAL",
      externalAuthority: "",
      verificationStatus: "VERIFIED",
      verificationNotes: "Verified by operator",
      verifiedAt: "2026-07-10T00:00:00.000Z",
    },
    technical: emptyTechnical(),
    credentials: { state: "NOT_REQUESTED", request: {}, receipts: [] },
    onboarding: {
      id: "case-1",
      businessPartnerId: "participant-1",
      organizationName: "ACME GmbH",
      requestedBpn: "BPNL000000000001",
      assignedBpn: "BPNL000000000001",
      bpn: "BPNL000000000001",
      did: "",
      dspEndpoint: "",
      identityHubCredentialServiceEndpoint: "",
      contactEmail: "ops@example.com",
      requestedRole: "participant",
      state: "IN_REVIEW",
      adminNotes: "",
      rejectionReason: "",
      issuerDid: "",
      credentialRequest: { issuerDid: "", holderPid: "", credentials: [] },
      setupChecks: [],
      credentialReceipts: [],
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    },
    cases: [],
    audit: [],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

function emptyTechnical(): Participant["technical"] {
  return {
    did: "",
    dspEndpoint: "",
    credentialServiceEndpoint: "",
    metadataComplete: false,
    setupChecks: [],
  };
}

function completeTechnical(): Participant["technical"] {
  return {
    did: "did:web:example.com",
    dspEndpoint: "https://example.com/api/dsp",
    credentialServiceEndpoint: "https://example.com/api/credentials",
    metadataComplete: true,
    setupChecks: [],
  };
}

function verifiedBpn(): Participant["bpn"] {
  return {
    requestedBpn: "BPNL000000000001",
    assignedBpn: "BPNL000000000001",
    source: "EXTERNAL",
    externalAuthority: "Authority",
    verificationStatus: "VERIFIED",
    verificationNotes: "Verified",
    verifiedAt: "2026-07-10T00:00:00.000Z",
  };
}
