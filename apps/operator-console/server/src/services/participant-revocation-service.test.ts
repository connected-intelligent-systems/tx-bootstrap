import { describe, expect, it, vi } from "vitest";
import type { ParticipantAccessLease } from "@tx-bootstrap/core/server/db/participant-access-lease.js";
import { createParticipantRevocationService } from "./participant-revocation-service.js";

const lease: ParticipantAccessLease = {
  token: "lease-1",
  signal: new AbortController().signal,
  assertActive() {
    this.signal.throwIfAborted();
  },
};
const revokedAt = new Date("2026-11-09T12:00:00Z");
const ok = (name: string) => ({ name, status: "ok", message: "" });

function partner(overrides: Record<string, unknown> = {}) {
  return {
    id: "partner-1",
    assigned_bpn: "BPNL000000000001",
    verification_status: "REVOKED",
    revoked_at: revokedAt,
    revocation_checks: [],
    ...overrides,
  };
}

function setup({
  rows = [partner()],
  enrollments = [] as Array<Record<string, unknown>>,
  tunnels = { enabled: true, url: "https://headscale.example" },
  now = new Date(revokedAt.getTime() + 120_000),
  locked = false,
} = {}) {
  const stored = new Map(rows.map((row) => [row.id, { ...row }]));
  const runRevocation = vi.fn(async () => [
    ok("issuer-holder-block"),
    ok("issuer-credential-revocation"),
    ok("bdrs-removal"),
  ]);
  const businessPartners = {
    listRevoked: vi.fn(async () => [...stored.values()]),
    load: vi.fn(async (id: string) => stored.get(id)),
    setRevocationChecks: vi.fn(async (id: string, checks: unknown[]) => {
      stored.get(id)!.revocation_checks = checks as never;
    }),
    withParticipantLock: vi.fn(
      async (
        _id: string,
        fn: (lease: ParticipantAccessLease) => Promise<unknown>,
      ) => (locked ? undefined : fn(lease)),
    ),
  };
  const participantEvents = { insert: vi.fn(async () => undefined) };
  const service = createParticipantRevocationService({
    approvalService: { runRevocation } as never,
    repositories: {
      businessPartners,
      onboardingCases: {
        getLatestForBusinessPartner: vi.fn(async () => ({
          did: "did:web:p.example",
        })),
      },
      networkEnrollments: { list: vi.fn(async () => enrollments) },
      participantEvents,
    } as never,
    tunnels,
    now: () => now,
  });
  return { service, runRevocation, businessPartners, participantEvents };
}

describe("participant revocation service", () => {
  it("reports tunnel cleanup as not applicable without tunnels", async () => {
    const { service } = setup({ tunnels: { enabled: false, url: "" } });

    const checks = await service.runChecks(partner() as never, lease);

    expect(checks.at(-1)).toMatchObject({
      name: "tunnel-revocation",
      status: "skipped",
    });
  });

  it("keeps tunnel cleanup pending while a tunnel key is active", async () => {
    const { service } = setup({
      enrollments: [
        { control_url: "https://headscale.example", state: "ISSUED" },
        { control_url: "https://headscale.example", state: "REVOKED" },
        { control_url: "https://old.example", state: "ISSUED" },
      ],
    });

    const checks = await service.runChecks(partner() as never, lease);

    expect(checks.at(-1)).toMatchObject({
      name: "tunnel-revocation",
      status: "pending",
      message: "1 tunnel key(s) awaiting revocation",
    });
  });

  it("asks for another credential scan until the revocation has settled", async () => {
    const { service, runRevocation } = setup({
      now: new Date(revokedAt.getTime() + 10_000),
    });

    await service.runChecks(partner() as never, lease);

    expect(runRevocation).toHaveBeenCalledWith({
      bpn: "BPNL000000000001",
      did: "did:web:p.example",
      settled: false,
      lease,
    });
  });

  it("repeats unfinished revocations and records their completion", async () => {
    const { service, runRevocation, businessPartners, participantEvents } =
      setup({
        rows: [
          partner({
            revocation_checks: [
              { name: "tunnel-revocation", status: "pending", message: "" },
            ],
          }),
          partner({
            id: "partner-2",
            revocation_checks: [ok("issuer-holder-block")],
          }),
        ],
      });

    expect(await service.reconcile()).toEqual({ completed: 1, incomplete: 0 });
    expect(runRevocation).toHaveBeenCalledTimes(1);
    expect(businessPartners.setRevocationChecks).toHaveBeenCalledWith(
      "partner-1",
      expect.arrayContaining([
        expect.objectContaining({ name: "tunnel-revocation", status: "ok" }),
      ]),
      lease,
    );
    expect(participantEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        businessPartnerId: "partner-1",
        action: "participant.revocation_completed",
      }),
    );
  });

  it("skips participants locked by a running revoke or readmit", async () => {
    const { service, runRevocation } = setup({
      rows: [partner({ revocation_checks: [] })],
      locked: true,
    });

    expect(await service.reconcile()).toEqual({ completed: 0, incomplete: 0 });
    expect(runRevocation).not.toHaveBeenCalled();
  });

  it("leaves a participant alone once it has been readmitted", async () => {
    const { service, runRevocation, businessPartners } = setup();
    businessPartners.load.mockResolvedValueOnce(
      partner({ verification_status: "VERIFIED" }) as never,
    );

    await service.reconcile();

    expect(runRevocation).not.toHaveBeenCalled();
  });
});
