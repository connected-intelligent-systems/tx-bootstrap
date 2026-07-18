import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createAdminParticipantActions } from "./admin-participant-actions.js";
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
  const businessPartners = {
    list: vi.fn(),
    load: vi.fn(),
    insert: insertBusinessPartner,
    updateOrganization,
    reject: vi.fn(),
    nextLocalBpnValue: vi.fn(),
  } as unknown as ActionDependencies["businessPartners"];

  const updateState = vi.fn().mockResolvedValue({ id: "case-1" });
  const onboardingCases = {
    rejectForBusinessPartner: vi.fn().mockResolvedValue(undefined),
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
      businessPartners,
      lifecycle,
      onboardingCases,
      emailService,
    }),
    createOnboardingCaseForPartner,
    generateLocalBpn,
    insertBusinessPartner,
    loadLatestCaseForPartner,
    recordParticipantEvent,
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
});
