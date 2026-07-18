import { describe, expect, it, vi } from "vitest";
import { createTechnicalSetupWorker } from "./technical-setup-worker.js";

const fixedNow = new Date("2026-07-10T12:00:00.000Z");

describe("technical setup worker", () => {
  it("completes a claimed case when every setup check succeeds", async () => {
    const fixture = workerFixture([
      { name: "metadata-validation", status: "ok", message: "valid" },
      { name: "bdrs-registration", status: "ok", message: "ready" },
    ]);

    await fixture.worker.runOnce();

    expect(fixture.updateState).toHaveBeenCalledWith(
      "case-1",
      "READY_FOR_PARTICIPANT",
      expect.objectContaining({
        bpn: "BPNL000000000001",
        setup_started_at: null,
      }),
    );
    expect(fixture.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "participant.technical_setup_completed",
      }),
    );
  });

  it("schedules a transient first failure five seconds later", async () => {
    const fixture = workerFixture([
      {
        name: "bdrs-registration",
        status: "failed",
        retryable: true,
        message: "temporarily unavailable",
      },
    ]);

    await fixture.worker.runOnce();

    expect(fixture.updateState).toHaveBeenCalledWith(
      "case-1",
      "IN_REVIEW",
      expect.objectContaining({
        setup_started_at: null,
        setup_next_attempt_at: new Date("2026-07-10T12:00:05.000Z"),
      }),
    );
    expect(fixture.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "participant.technical_setup_retry_scheduled",
      }),
    );
  });

  it("marks manual setup results as terminal failures", async () => {
    const fixture = workerFixture([
      {
        name: "issuer-participant-context",
        status: "manual",
        message: "issuer key is unavailable",
      },
    ]);

    await fixture.worker.runOnce();

    expect(fixture.updateState).toHaveBeenCalledWith(
      "case-1",
      "FAILED",
      expect.objectContaining({ setup_started_at: null }),
    );
    expect(fixture.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "participant.technical_setup_failed",
      }),
    );
  });

  it("marks the third transient failure terminal", async () => {
    const fixture = workerFixture(
      [
        {
          name: "bdrs-registration",
          status: "failed",
          retryable: true,
          message: "still unavailable",
        },
      ],
      3,
    );

    await fixture.worker.runOnce();

    expect(fixture.updateState).toHaveBeenCalledWith(
      "case-1",
      "FAILED",
      expect.objectContaining({ setup_started_at: null }),
    );
  });
});

function workerFixture(checks: Array<Record<string, unknown>>, attempt = 1) {
  const row = {
    id: "case-1",
    business_partner_id: "partner-1",
    bpn: "BPNL000000000001",
    did: "did:web:participant.example",
    dsp_endpoint: "https://participant.example/api/dsp",
    identityhub_credential_service_endpoint:
      "https://participant.example/api/credentials",
    bp_id: "partner-1",
    bp_assigned_bpn: "BPNL000000000001",
    bp_verification_status: "VERIFIED",
    bp_legal_name: "Example GmbH",
    setup_attempt_count: attempt,
  };
  const claimed = [row, null];
  const updateState = vi.fn().mockResolvedValue({ id: "case-1" });
  const insertEvent = vi.fn().mockResolvedValue(undefined);
  const approvalService = {
    requireVerifiedBusinessPartner: vi.fn((value) => ({
      ...value,
      bpn: "BPNL000000000001",
      organization_name: "Example GmbH",
    })),
    runApprovalSetup: vi.fn().mockResolvedValue(checks),
    buildCredentialRequest: vi.fn().mockReturnValue({ credentials: [] }),
  };

  const worker = createTechnicalSetupWorker({
    db: {} as never,
    onboardingCases: {
      getWithBusinessPartner: vi.fn(),
      updateState,
    } as never,
    participantEvents: { insert: insertEvent } as never,
    approvalService: approvalService as never,
    logger: { info: vi.fn(), error: vi.fn() },
    now: () => fixedNow,
    claimCase: vi.fn(async () => claimed.shift() as never),
  });

  return { worker, updateState, insertEvent };
}
