import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createAdminParticipantActions } from "./admin-participant-actions.js";
import {
  ParticipantLeaseLostError,
  type ParticipantAccessLease,
} from "@tx-bootstrap/core/server/db/participant-access-lease.js";
import type { EmailService } from "@tx-bootstrap/core/server/services/email-service.js";

const existingPartner = {
  id: "partner-1",
  legal_name: "Old Org GmbH",
  legal_form: "GmbH",
  registered_address: "Old Street 1",
  country: "DE",
  tax_id: "DE123",
  commercial_register_number: "HRB 123",
  website: "https://old.example",
  contact_email: "old@example.com",
  requested_bpn: "BPNLREQUESTED001",
  assigned_bpn: "BPNLASSIGNED0001",
  bpn_source: "LOCAL",
  external_authority: "Authority record",
  verification_status: "VERIFIED",
  verification_notes: "Keep these notes",
  verified_at: new Date("2026-01-01T00:00:00Z"),
  revoked_at: null,
  revocation_reason: "",
  revocation_checks: [],
  access_lease_token: null,
  access_lease_until: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-02T00:00:00Z"),
};

const latestCase = {
  id: "case-1",
  state: "REQUESTED",
  bp_assigned_bpn: "BPNLASSIGNED0001",
  bp_verification_status: "VERIFIED",
  did: "did:web:participant.example:BPNLASSIGNED0001",
  dspEndpoint: "https://participant.example/api/dsp",
  identityHubCredentialServiceEndpoint:
    "https://participant.example/api/credentials",
  setup_started_at: null as Date | null,
};

const revocationChecks = [
  { name: "issuer-holder-block", status: "ok", message: "Holder blocked" },
  { name: "issuer-credential-revocation", status: "ok", message: "3 revoked" },
  { name: "bdrs-removal", status: "ok", message: "removed" },
];

type ActionDependencies = Parameters<typeof createAdminParticipantActions>[0];

function jsonRequest(body: unknown, method = "PATCH"): IncomingMessage {
  const request = Readable.from([JSON.stringify(body)]) as IncomingMessage & {
    method: string;
  };
  request.method = method;
  return request;
}

function jsonResponse() {
  return {
    setHeader: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn(),
  };
}

function createActions({
  partner = existingPartner,
  caseRow = latestCase,
} = {}) {
  const updateOrganization = vi.fn().mockResolvedValue(undefined);
  const syncUnverifiedOnboardingMetadata = vi.fn().mockResolvedValue(undefined);
  const recordParticipantEvent = vi.fn().mockResolvedValue(undefined);
  const getParticipantDto = vi.fn().mockResolvedValue({ id: "partner-1" });
  const loadBusinessPartner = vi.fn().mockResolvedValue(partner);
  const loadLatestCaseForPartner = vi.fn().mockResolvedValue(caseRow);
  const generateLocalBpn = vi.fn().mockResolvedValue("BPNLDS0000000001");
  const updateCaseTechnicalMetadata = vi.fn().mockResolvedValue(undefined);
  const createOnboardingCaseForPartner = vi.fn().mockResolvedValue({
    caseId: "case-1",
    participantToken: "participant-secret",
    registrationToken: "registration-token",
  });

  const insertBusinessPartner = vi.fn().mockResolvedValue(undefined);
  const revoke = vi.fn().mockResolvedValue(true);
  const setRevocationChecks = vi.fn().mockResolvedValue(undefined);
  const runChecks = vi.fn().mockResolvedValue(revocationChecks);
  const locked: string[] = [];
  const controller = new AbortController();
  const lease: ParticipantAccessLease = {
    token: "lease-1",
    signal: controller.signal,
    assertActive: () => controller.signal.throwIfAborted(),
  };
  const withParticipantLock = vi.fn(
    async (
      id: string,
      fn: (lease: ParticipantAccessLease) => Promise<unknown>,
    ) => {
      locked.push(id);
      try {
        return await fn(lease);
      } finally {
        locked.pop();
      }
    },
  );
  const runReadmission = vi.fn().mockResolvedValue([
    { name: "issuer-holder-restore", status: "ok", message: "restored" },
    { name: "bdrs-registration", status: "ok", message: "mapped" },
  ]);
  const completeReadmission = vi.fn().mockResolvedValue(undefined);
  const buildCredentialRequest = vi.fn((holderPid: string) => ({
    issuerDid: "did:web:issuer",
    holderPid,
    credentials: [],
  }));
  const businessPartners = {
    list: vi.fn(),
    load: vi.fn(),
    insert: insertBusinessPartner,
    updateOrganization,
    reject: vi.fn(),
    revoke,
    completeReadmission,
    setRevocationChecks,
    withParticipantLock,
    nextLocalBpnValue: vi.fn(),
  } as unknown as ActionDependencies["businessPartners"];

  const updateState = vi.fn().mockResolvedValue({ id: "case-1" });
  const onboardingCases = {
    rejectForBusinessPartner: vi.fn().mockResolvedValue(undefined),
    getLatestForBusinessPartner: vi.fn().mockResolvedValue(caseRow),
    updateState,
  } as unknown as ActionDependencies["onboardingCases"];

  const lifecycle = {
    createOnboardingCaseForPartner,
    generateLocalBpn,
    getParticipantDto,
    loadBusinessPartner,
    loadLatestCaseForPartner,
    recordParticipantEvent,
    syncUnverifiedOnboardingMetadata,
    updateCaseTechnicalMetadata,
  } as unknown as ActionDependencies["lifecycle"];

  const emailService = {
    sendEmail: vi.fn().mockResolvedValue(true),
    verify: vi.fn().mockResolvedValue(true),
  } as unknown as EmailService;

  return {
    actions: createAdminParticipantActions({
      approvalService: {
        runReadmission,
        buildCredentialRequest,
      } as unknown as ActionDependencies["approvalService"],
      revocation: { runChecks } as unknown as ActionDependencies["revocation"],
      businessPartners,
      lifecycle,
      onboardingCases,
      emailService,
    }),
    createOnboardingCaseForPartner,
    generateLocalBpn,
    insertBusinessPartner,
    loadLatestCaseForPartner,
    locked,
    lease,
    leaseController: controller,
    completeReadmission,
    recordParticipantEvent,
    revoke,
    runChecks,
    runReadmission,
    setRevocationChecks,
    withParticipantLock,
    syncUnverifiedOnboardingMetadata,
    updateCaseTechnicalMetadata,
    updateOrganization,
    updateState,
    emailService,
  };
}

describe("createAdminParticipantActions", () => {
  it("creates an existing-BPN participant already verified", async () => {
    const {
      actions,
      createOnboardingCaseForPartner,
      insertBusinessPartner,
      recordParticipantEvent,
    } = createActions();
    const response = jsonResponse();

    await actions.createParticipant(jsonRequest({}, "POST"), response, {
      legalName: "New Org GmbH",
      legalForm: "GmbH",
      registeredAddress: "New Street 1",
      country: "DE",
      taxId: "DE999",
      commercialRegisterNumber: "HRB 999",
      website: "https://new.example",
      contactEmail: "ops@example.test",
      bpn: "BPNL000000000001",
      verificationNotes: "Checked by operator",
    });

    expect(insertBusinessPartner).toHaveBeenCalledWith(
      expect.objectContaining({
        requested_bpn: "BPNL000000000001",
        assigned_bpn: "BPNL000000000001",
        bpn_source: "EXTERNAL",
        verification_status: "VERIFIED",
        verification_notes: "Checked by operator",
        verified_at: expect.any(Date),
      }),
    );
    expect(createOnboardingCaseForPartner).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ requestedBpn: "BPNL000000000001" }),
    );
    expect(recordParticipantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "participant.bpn_accepted" }),
    );
    expect(recordParticipantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "participant.invited" }),
    );
    const payload = JSON.parse(String(response.end.mock.calls[0]?.[0]));
    expect(payload).toEqual({
      participant: { id: "partner-1" },
      registrationToken: "registration-token",
    });
  });

  it("generates and verifies a local BPN when the create input is empty", async () => {
    const {
      actions,
      generateLocalBpn,
      insertBusinessPartner,
      recordParticipantEvent,
    } = createActions();

    await actions.createParticipant(jsonRequest({}, "POST"), jsonResponse(), {
      legalName: "Generated Org GmbH",
      legalForm: "GmbH",
      registeredAddress: "Generated Street 1",
      country: "DE",
      taxId: "",
      commercialRegisterNumber: "",
      website: "",
      contactEmail: "generated@example.test",
      bpn: "",
    });

    expect(generateLocalBpn).toHaveBeenCalledOnce();
    expect(insertBusinessPartner).toHaveBeenCalledWith(
      expect.objectContaining({
        requested_bpn: "",
        assigned_bpn: "BPNLDS0000000001",
        bpn_source: "LOCAL",
        verification_status: "VERIFIED",
        verification_notes: "",
      }),
    );
    expect(recordParticipantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "participant.bpn_assigned" }),
    );
  });

  it("rejects invalid existing BPNs before persistence", async () => {
    const { actions, insertBusinessPartner } = createActions();

    await expect(
      actions.createParticipant(jsonRequest({}, "POST"), jsonResponse(), {
        legalName: "Invalid Org",
        legalForm: "",
        registeredAddress: "",
        country: "",
        taxId: "",
        commercialRegisterNumber: "",
        website: "",
        contactEmail: "invalid@example.test",
        bpn: "not-a-bpn",
      }),
    ).rejects.toBeTruthy();

    expect(insertBusinessPartner).not.toHaveBeenCalled();
  });

  it("returns a conflict when the assigned BPN already exists", async () => {
    const { actions, insertBusinessPartner } = createActions();
    insertBusinessPartner.mockRejectedValueOnce({ code: "23505" });

    await expect(
      actions.createParticipant(jsonRequest({}, "POST"), jsonResponse(), {
        legalName: "Duplicate Org",
        legalForm: "",
        registeredAddress: "",
        country: "",
        taxId: "",
        commercialRegisterNumber: "",
        website: "",
        contactEmail: "duplicate@example.test",
        bpn: "BPNL000000000001",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("updates organization data without overwriting BPN or verification fields", async () => {
    const {
      actions,
      updateOrganization,
      syncUnverifiedOnboardingMetadata,
      recordParticipantEvent,
    } = createActions();

    await actions.handleAdminParticipant(
      jsonRequest({}),
      jsonResponse(),
      "partner-1",
      "organization",
      { legalName: "New Org GmbH" },
    );

    expect(updateOrganization).toHaveBeenCalledWith("partner-1", {
      legalName: "New Org GmbH",
      legalForm: "GmbH",
      registeredAddress: "Old Street 1",
      country: "DE",
      taxId: "DE123",
      commercialRegisterNumber: "HRB 123",
      website: "https://old.example",
      contactEmail: "old@example.com",
    });
    expect(updateOrganization.mock.calls[0]?.[1]).not.toEqual(
      expect.objectContaining({
        requestedBpn: expect.anything(),
        externalAuthority: expect.anything(),
        verificationNotes: expect.anything(),
      }),
    );
    expect(syncUnverifiedOnboardingMetadata).toHaveBeenCalledWith(
      "partner-1",
      expect.objectContaining({ requestedBpn: "BPNLREQUESTED001" }),
    );
    expect(recordParticipantEvent).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { changedFields: ["legalName"] } }),
    );
  });

  it("uses participant-level wording when onboarding is rejected", async () => {
    const { actions, emailService } = createActions();

    await actions.handleAdminParticipant(
      jsonRequest({}, "POST"),
      jsonResponse(),
      "partner-1",
      "reject",
      { reason: "Organization is not eligible" },
    );

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Dataspace Participation Update",
        text: expect.stringContaining(
          "dataspace participation request cannot proceed",
        ),
      }),
    );
    expect(emailService.sendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("BPN request") }),
    );
  });

  it("blocks connector metadata updates before BPN verification", async () => {
    const { actions, updateCaseTechnicalMetadata } = createActions({
      caseRow: {
        ...latestCase,
        bp_assigned_bpn: "",
        bp_verification_status: "UNVERIFIED",
      },
    });

    await expect(
      actions.handleAdminParticipant(
        jsonRequest({}, "PATCH"),
        jsonResponse(),
        "partner-1",
        "technical-metadata",
        {
          did: "did:web:participant.example:BPNLASSIGNED0001",
          dspEndpoint: "https://participant.example/api/dsp",
          identityHubCredentialServiceEndpoint:
            "https://participant.example/api/credentials",
        },
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(updateCaseTechnicalMetadata).not.toHaveBeenCalled();
  });

  it("blocks connector metadata edits while automatic setup holds a lease", async () => {
    const { actions, updateCaseTechnicalMetadata } = createActions({
      caseRow: {
        ...latestCase,
        state: "IN_REVIEW",
        setup_started_at: new Date("2026-07-10T12:00:00.000Z"),
      },
    });

    await expect(
      actions.handleAdminParticipant(
        jsonRequest({}, "PATCH"),
        jsonResponse(),
        "partner-1",
        "technical-metadata",
        {
          did: "did:web:participant.example:BPNLASSIGNED0001",
          dspEndpoint: "https://participant.example/api/dsp",
          identityHubCredentialServiceEndpoint:
            "https://participant.example/api/credentials",
        },
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(updateCaseTechnicalMetadata).not.toHaveBeenCalled();
  });

  it("does not expose the removed connector approval action", async () => {
    const { actions } = createActions();
    const response = jsonResponse();

    await actions.handleAdminParticipant(
      jsonRequest({}, "POST"),
      response,
      "partner-1",
      "approve-technical-setup",
    );

    expect(response.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it("only allows connector setup retry after a failed setup check", async () => {
    const { actions, updateState } = createActions({
      caseRow: { ...latestCase, state: "REQUESTED" },
    });

    await expect(
      actions.handleAdminParticipant(
        jsonRequest({}, "POST"),
        jsonResponse(),
        "partner-1",
        "retry-technical-setup",
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(updateState).not.toHaveBeenCalled();
  });
  it("queues a failed connector setup for automatic retry", async () => {
    const { actions, recordParticipantEvent, updateState } = createActions({
      caseRow: { ...latestCase, state: "FAILED" },
    });
    const response = jsonResponse();

    await actions.handleAdminParticipant(
      jsonRequest({}, "POST"),
      response,
      "partner-1",
      "retry-technical-setup",
    );

    expect(updateState).toHaveBeenCalledWith(
      "case-1",
      "IN_REVIEW",
      expect.objectContaining({
        setup_attempt_count: 0,
        setup_started_at: null,
      }),
    );
    expect(recordParticipantEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "participant.technical_retry_requested",
      }),
    );
    expect(response.writeHead).toHaveBeenCalledWith(202, expect.any(Object));
  });

  describe("revoke", () => {
    const issuedCase = { ...latestCase, state: "CREDENTIALS_REQUESTED" };

    it("marks the participant revoked before running the revocation steps", async () => {
      const {
        actions,
        locked,
        recordParticipantEvent,
        revoke,
        runChecks,
        setRevocationChecks,
      } = createActions({ caseRow: issuedCase });
      runChecks.mockImplementationOnce(async () => {
        expect(locked).toEqual(["partner-1"]);
        return revocationChecks;
      });
      const response = jsonResponse();

      await actions.handleAdminParticipant(
        jsonRequest({}, "POST"),
        response,
        "partner-1",
        "revoke",
        { confirmBpn: "BPNLASSIGNED0001", reason: "Left the project" },
      );

      expect(revoke).toHaveBeenCalledWith(
        "partner-1",
        "Left the project",
        expect.objectContaining({ token: "lease-1" }),
      );
      expect(revoke.mock.invocationCallOrder[0]).toBeLessThan(
        runChecks.mock.invocationCallOrder[0],
      );
      expect(runChecks).toHaveBeenCalledWith(
        existingPartner,
        expect.objectContaining({ token: "lease-1" }),
      );
      expect(setRevocationChecks).toHaveBeenCalledWith(
        "partner-1",
        revocationChecks,
        expect.objectContaining({ token: "lease-1" }),
      );
      expect(recordParticipantEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "participant.revoked",
          message: "Participant revoked: Left the project",
        }),
      );
      expect(response.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });

    it("requires the BPN as confirmation", async () => {
      const { actions, revoke, runChecks } = createActions({
        caseRow: issuedCase,
      });

      await expect(
        actions.handleAdminParticipant(
          jsonRequest({}, "POST"),
          jsonResponse(),
          "partner-1",
          "revoke",
          { confirmBpn: "BPNLOTHER0000001", reason: "Left the project" },
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(revoke).not.toHaveBeenCalled();
      expect(runChecks).not.toHaveBeenCalled();
    });

    it("refuses while automatic setup is running", async () => {
      const { actions, revoke, runChecks } = createActions();
      revoke.mockResolvedValueOnce(false);

      await expect(
        actions.handleAdminParticipant(
          jsonRequest({}, "POST"),
          jsonResponse(),
          "partner-1",
          "revoke",
          { confirmBpn: "BPNLASSIGNED0001", reason: "Left the project" },
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(runChecks).not.toHaveBeenCalled();
    });

    it("retries the steps of an already revoked participant", async () => {
      const failed = [
        { ...revocationChecks[0] },
        { name: "bdrs-removal", status: "failed", message: "HTTP 503" },
      ];
      const { actions, recordParticipantEvent, runChecks, updateState } =
        createActions({
          partner: { ...existingPartner, verification_status: "REVOKED" },
          caseRow: { ...latestCase, state: "REVOKED" },
        });
      runChecks.mockResolvedValueOnce(failed);

      await actions.handleAdminParticipant(
        jsonRequest({}, "POST"),
        jsonResponse(),
        "partner-1",
        "revoke",
        { confirmBpn: "BPNLASSIGNED0001", reason: "Left the project" },
      );

      expect(updateState).not.toHaveBeenCalled();
      expect(recordParticipantEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Revocation retried; 1 step(s) failed.",
        }),
      );
    });

    it("cannot reject a revoked participant", async () => {
      const { actions } = createActions({
        partner: { ...existingPartner, verification_status: "REVOKED" },
        caseRow: { ...latestCase, state: "REVOKED" },
      });

      await expect(
        actions.handleAdminParticipant(
          jsonRequest({}, "POST"),
          jsonResponse(),
          "partner-1",
          "reject",
          { reason: "x" },
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe("readmit", () => {
    const revokedPartner = {
      ...existingPartner,
      verification_status: "REVOKED",
    };
    const revokedCase = { ...latestCase, state: "REVOKED" };
    const body = { confirmBpn: "BPNLASSIGNED0001", reason: "Rejoined" };

    it("restores access and asks for credentials under a new request id", async () => {
      const {
        actions,
        locked,
        completeReadmission,
        recordParticipantEvent,
        runReadmission,
        updateState,
      } = createActions({ partner: revokedPartner, caseRow: revokedCase });
      runReadmission.mockImplementationOnce(async () => {
        expect(locked).toEqual(["partner-1"]);
        return [];
      });

      await actions.handleAdminParticipant(
        jsonRequest({}, "POST"),
        jsonResponse(),
        "partner-1",
        "readmit",
        body,
      );

      expect(runReadmission).toHaveBeenCalledWith({
        bpn: "BPNLASSIGNED0001",
        did: "did:web:participant.example:BPNLASSIGNED0001",
        organizationName: "Old Org GmbH",
        lease: expect.objectContaining({ token: "lease-1" }),
      });
      expect(completeReadmission).toHaveBeenCalledWith(
        "partner-1",
        "case-1",
        expect.objectContaining({
          holderPid: expect.stringMatching(/^BPNLASSIGNED0001-[0-9a-z]+$/),
        }),
        expect.objectContaining({ token: "lease-1" }),
      );
      expect(updateState).not.toHaveBeenCalled();
      expect(recordParticipantEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "participant.readmitted",
          message: "Participant readmitted: Rejoined",
        }),
      );
    });

    it("keeps the participant revoked when a step fails", async () => {
      const { actions, completeReadmission, runReadmission, updateState } =
        createActions({ partner: revokedPartner, caseRow: revokedCase });
      runReadmission.mockResolvedValueOnce([
        {
          name: "issuer-holder-restore",
          status: "failed",
          message: "HTTP 503",
        },
      ]);

      await expect(
        actions.handleAdminParticipant(
          jsonRequest({}, "POST"),
          jsonResponse(),
          "partner-1",
          "readmit",
          body,
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining("issuer-holder-restore: HTTP 503"),
      });
      expect(completeReadmission).not.toHaveBeenCalled();
      expect(updateState).not.toHaveBeenCalled();
    });

    it("records the readmission before any remote write", async () => {
      const { actions, runReadmission, setRevocationChecks } = createActions({
        partner: revokedPartner,
        caseRow: revokedCase,
      });

      await actions.handleAdminParticipant(
        jsonRequest({}, "POST"),
        jsonResponse(),
        "partner-1",
        "readmit",
        body,
      );

      expect(setRevocationChecks).toHaveBeenCalledWith(
        "partner-1",
        [expect.objectContaining({ name: "readmission", status: "pending" })],
        expect.objectContaining({ token: "lease-1" }),
      );
      expect(setRevocationChecks.mock.invocationCallOrder[0]).toBeLessThan(
        runReadmission.mock.invocationCallOrder[0],
      );
    });

    it.each([
      [
        "a step fails",
        (mock: ReturnType<typeof vi.fn>) =>
          mock.mockResolvedValueOnce([
            { name: "bdrs-registration", status: "ok", message: "" },
            { name: "issuer-holder-restore", status: "failed", message: "" },
          ]),
      ],
      [
        "the issuer response is lost",
        (mock: ReturnType<typeof vi.fn>) =>
          mock.mockRejectedValueOnce(new Error("The operation timed out")),
      ],
    ])("blocks access again when %s", async (_label, fail) => {
      const blocked = [
        { name: "issuer-holder-block", status: "ok", message: "" },
      ];
      const { actions, runChecks, runReadmission, setRevocationChecks } =
        createActions({ partner: revokedPartner, caseRow: revokedCase });
      fail(runReadmission);
      runChecks.mockResolvedValueOnce(blocked);

      await expect(
        actions.handleAdminParticipant(
          jsonRequest({}, "POST"),
          jsonResponse(),
          "partner-1",
          "readmit",
          body,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(runChecks).toHaveBeenCalledWith(
        revokedPartner,
        expect.objectContaining({ token: "lease-1" }),
      );
      expect(setRevocationChecks).toHaveBeenLastCalledWith(
        "partner-1",
        blocked,
        expect.objectContaining({ token: "lease-1" }),
      );
    });

    it("stops readmission without re-blocking after losing the lease", async () => {
      const {
        actions,
        leaseController,
        completeReadmission,
        runReadmission,
        runChecks,
        setRevocationChecks,
      } = createActions({ partner: revokedPartner, caseRow: revokedCase });
      runReadmission.mockImplementationOnce(async () => {
        const error = new ParticipantLeaseLostError();
        leaseController.abort(error);
        throw error;
      });

      await expect(
        actions.handleAdminParticipant(
          jsonRequest({}, "POST"),
          jsonResponse(),
          "partner-1",
          "readmit",
          body,
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining("lease was lost"),
      });
      expect(completeReadmission).not.toHaveBeenCalled();
      expect(runChecks).not.toHaveBeenCalled();
      expect(setRevocationChecks).toHaveBeenCalledTimes(1);
    });

    it("refuses while another revocation or readmission holds the lease", async () => {
      const { actions, runReadmission, withParticipantLock } = createActions({
        partner: revokedPartner,
        caseRow: revokedCase,
      });
      withParticipantLock.mockResolvedValueOnce(undefined);

      await expect(
        actions.handleAdminParticipant(
          jsonRequest({}, "POST"),
          jsonResponse(),
          "partner-1",
          "readmit",
          body,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(runReadmission).not.toHaveBeenCalled();
    });

    it("only readmits revoked participants", async () => {
      const { actions, runReadmission } = createActions();

      await expect(
        actions.handleAdminParticipant(
          jsonRequest({}, "POST"),
          jsonResponse(),
          "partner-1",
          "readmit",
          body,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(runReadmission).not.toHaveBeenCalled();
    });
  });
});
