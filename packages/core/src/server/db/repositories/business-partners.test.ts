import { Kysely, PostgresDialect } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../database.js";
import {
  ParticipantLeaseLostError,
  type ParticipantAccessLease,
} from "../participant-access-lease.js";
import { createBusinessPartnerRepository } from "./business-partners.js";

// Exercise Kysely's actual transactions and SQL through an in-memory pg
// transport. The transport rolls back its snapshot on ROLLBACK and models
// token/expiry conditions, without needing a running PostgreSQL server.
function database() {
  const state = {
    partner: {
      id: "partner-1",
      verification_status: "REVOKED",
      revoked_at: new Date(),
      revocation_reason: "Left",
      revocation_checks: [{ name: "readmission", status: "pending" }],
      access_lease_token: "owner" as string | null,
      access_lease_until: new Date(Date.now() + 10_000) as Date | null,
    } as Record<string, unknown>,
    onboardingCase: {
      id: "case-1",
      business_partner_id: "partner-1",
      state: "REVOKED",
      setup_started_at: null,
      setup_attempt_count: 0,
      credential_request: { holderPid: "old" },
      credential_receipts: [{ id: "old-credential" }],
    } as Record<string, unknown>,
  };
  let snapshot: typeof state | undefined;
  let connections = 0;
  let failCaseWrite = false;
  let renewal: "ok" | "error" | "missing" = "ok";
  let renewalGate: Promise<void> | undefined;
  const commands: string[] = [];
  const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    commands.push(sql);
    const result = (
      rows: Record<string, unknown>[] = [],
      rowCount = rows.length,
    ) => ({
      command: sql.split(" ")[0].toUpperCase(),
      rows,
      rowCount,
    });
    if (sql === "begin") {
      snapshot = structuredClone(state);
      return result();
    }
    if (sql === "commit") {
      snapshot = undefined;
      return result();
    }
    if (sql === "rollback") {
      Object.assign(state, snapshot);
      snapshot = undefined;
      return result();
    }
    const selecting = sql.startsWith("select ");
    if (!sql.startsWith("update ") && !selecting)
      throw new Error(`Unexpected SQL: ${sql}`);
    const isPartner =
      sql.startsWith('update "business_partners"') ||
      sql.includes('from "business_partners"');
    const row = isPartner ? state.partner : state.onboardingCase;
    const [assignments, conditions] = sql.split(" where ");
    const renewing =
      isPartner &&
      assignments.startsWith(
        'update "business_partners" set "access_lease_until"',
      );
    if (renewing) await renewalGate;
    if (renewing && renewal === "error")
      throw new Error("Database unavailable");
    if (renewing && renewal === "missing") return result();
    // Evaluate parameter equality and lease expiry in the WHERE clause.
    for (const match of conditions.matchAll(/"(\w+)" = \$(\d+)/g)) {
      if (row[match[1]] !== parameters[Number(match[2]) - 1]) return result();
    }
    const until = row.access_lease_until as Date | null;
    if (
      conditions.includes('"access_lease_until" >') &&
      (!until || until.getTime() <= Date.now())
    )
      return result();
    if (selecting) return result([{ ...row }]);
    if (
      conditions.includes('"access_lease_until" is null or') &&
      until &&
      until.getTime() > Date.now()
    )
      return result();
    if (!isPartner && failCaseWrite) throw new Error("Case update failed");
    for (const match of assignments.matchAll(/"(\w+)" = \$(\d+)/g)) {
      const value = parameters[Number(match[2]) - 1];
      row[match[1]] = [
        "revocation_checks",
        "credential_request",
        "credential_receipts",
      ].includes(match[1])
        ? JSON.parse(String(value))
        : value;
    }
    for (const match of assignments.matchAll(/"(\w+)" = null/g))
      row[match[1]] = null;
    const interval = assignments.match(/make_interval\(secs => \$(\d+)\)/);
    if (interval)
      row.access_lease_until = new Date(
        Date.now() + Number(parameters[Number(interval[1]) - 1]) * 1000,
      );
    return result(sql.includes("returning") ? [{ id: row.id }] : [], 1);
  });
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: {
        async connect() {
          connections++;
          return {
            query,
            release() {
              connections--;
            },
          };
        },
        async end() {},
      } as never,
    }),
  });
  const repository = createBusinessPartnerRepository(db);
  return {
    state,
    commands,
    repository,
    get connections() {
      return connections;
    },
    failCaseWrite(value: boolean) {
      failCaseWrite = value;
    },
    renewal(value: typeof renewal) {
      renewal = value;
    },
    pauseRenewal(gate: Promise<void>) {
      renewalGate = gate;
    },
  };
}

const lease: ParticipantAccessLease = {
  token: "owner",
  signal: new AbortController().signal,
  assertActive() {
    this.signal.throwIfAborted();
  },
};

afterEach(() => vi.useRealTimers());

describe("rejection transaction", () => {
  it("rejects an unused invitation and its participant together", async () => {
    const db = database();
    db.state.partner.verification_status = "VERIFIED";
    db.state.onboardingCase.state = "REQUESTED";
    expect(await db.repository.reject("partner-1", "Not eligible", lease)).toBe(
      true,
    );
    expect(db.state.partner).toMatchObject({
      verification_status: "REJECTED",
      verification_notes: "Not eligible",
    });
    expect(db.state.onboardingCase).toMatchObject({
      state: "REJECTED",
      rejection_reason: "Not eligible",
    });
  });

  it.each([
    "IN_REVIEW",
    "READY_FOR_PARTICIPANT",
    "CREDENTIALS_REQUESTED",
    "FAILED",
    "REVOKED",
  ])("requires revocation once a case is %s", async (state) => {
    const db = database();
    db.state.partner.verification_status = "VERIFIED";
    db.state.onboardingCase.state = state;
    const before = structuredClone(db.state);
    expect(await db.repository.reject("partner-1", "Not eligible", lease)).toBe(
      false,
    );
    expect(db.state).toEqual(before);
  });

  it("rolls back participant rejection if updating the case fails", async () => {
    const db = database();
    db.state.partner.verification_status = "VERIFIED";
    db.state.onboardingCase.state = "REQUESTED";
    const before = structuredClone(db.state);
    db.failCaseWrite(true);
    await expect(
      db.repository.reject("partner-1", "Not eligible", lease),
    ).rejects.toThrow("Case update failed");
    expect(db.state).toEqual(before);
  });

  it("does not reject after another action has revoked the participant", async () => {
    const db = database();
    db.state.onboardingCase.state = "REQUESTED";
    expect(await db.repository.reject("partner-1", "Not eligible", lease)).toBe(
      false,
    );
    expect(db.state.partner.verification_status).toBe("REVOKED");
  });
});

describe("readmission transaction", () => {
  it("retains the recovery marker and revoked state if the case write fails, then permits retry", async () => {
    const db = database();
    const before = structuredClone(db.state);
    db.failCaseWrite(true);

    await expect(
      db.repository.completeReadmission(
        "partner-1",
        "case-1",
        { holderPid: "new" },
        lease,
      ),
    ).rejects.toThrow("Case update failed");

    expect(db.state).toEqual(before);
    expect(db.commands.at(-1)).toBe("rollback");
    expect(db.connections).toBe(0);
    db.failCaseWrite(false);
    await db.repository.completeReadmission(
      "partner-1",
      "case-1",
      { holderPid: "new" },
      lease,
    );
    expect(db.state.partner).toMatchObject({
      verification_status: "VERIFIED",
      revoked_at: null,
      revocation_reason: "",
      revocation_checks: [],
    });
    expect(db.state.onboardingCase).toMatchObject({
      state: "READY_FOR_PARTICIPANT",
      credential_request: { holderPid: "new" },
      credential_receipts: [],
    });
    expect(db.commands.at(-1)).toBe("commit");
  });

  it("rolls back when the onboarding case no longer belongs to the participant", async () => {
    const db = database();
    db.state.onboardingCase.business_partner_id = "other-partner";
    const before = structuredClone(db.state);
    await expect(
      db.repository.completeReadmission("partner-1", "case-1", {}, lease),
    ).rejects.toThrow();
    expect(db.state).toEqual(before);
    expect(db.commands.at(-1)).toBe("rollback");
  });

  it("refuses finalization and check updates from a previous lease owner", async () => {
    const db = database();
    db.state.partner.access_lease_token = "new-owner";
    const before = structuredClone(db.state);
    await expect(
      db.repository.completeReadmission("partner-1", "case-1", {}, lease),
    ).rejects.toBeInstanceOf(ParticipantLeaseLostError);
    await expect(
      db.repository.setRevocationChecks("partner-1", [], lease),
    ).rejects.toBeInstanceOf(ParticipantLeaseLostError);
    expect(db.state).toEqual(before);
  });
});

describe("participant access lease", () => {
  it("renews beyond the original expiry without reserving a connection, excluding other callers", async () => {
    vi.useFakeTimers();
    const db = database();
    db.state.partner.access_lease_token = null;
    db.state.partner.access_lease_until = null;
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let active!: ParticipantAccessLease;
    const operation = db.repository.withParticipantLock(
      "partner-1",
      async (lease) => {
        active = lease;
        expect(db.connections).toBe(0);
        await waiting;
        lease.assertActive();
        return "done";
      },
      { leaseMs: 900, waitMs: 0 },
    );
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(3_600);

    expect(active.signal.aborted).toBe(false);
    expect(db.connections).toBe(0);
    const contender = vi.fn(async () => "overlap");
    expect(
      await db.repository.withParticipantLock("partner-1", contender, {
        waitMs: 0,
        leaseMs: 900,
      }),
    ).toBeUndefined();
    expect(contender).not.toHaveBeenCalled();
    finish();
    expect(await operation).toBe("done");
    expect(db.state.partner.access_lease_token).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(
      await db.repository.withParticipantLock("partner-1", async () => "next", {
        waitMs: 0,
        leaseMs: 900,
      }),
    ).toBe("next");
  });

  it.each(["error", "missing"] as const)(
    "aborts work on renewal %s and preserves a replacement owner's lease",
    async (failure) => {
      vi.useFakeTimers();
      const db = database();
      db.state.partner.access_lease_token = null;
      db.state.partner.access_lease_until = null;
      let active!: ParticipantAccessLease;
      const furtherWrite = vi.fn();
      const operation = db.repository.withParticipantLock(
        "partner-1",
        async (lease) => {
          active = lease;
          await new Promise<void>((_resolve, reject) => {
            lease.signal.addEventListener(
              "abort",
              () => reject(lease.signal.reason),
              { once: true },
            );
          });
          furtherWrite();
        },
        { leaseMs: 900, waitMs: 0 },
      );
      const rejected = expect(operation).rejects.toBeInstanceOf(
        ParticipantLeaseLostError,
      );
      await vi.advanceTimersByTimeAsync(0);
      db.renewal(failure);
      db.state.partner.access_lease_token = "replacement";

      await vi.advanceTimersByTimeAsync(300);

      await rejected;
      expect(active.signal.aborted).toBe(true);
      expect(furtherWrite).not.toHaveBeenCalled();
      expect(db.state.partner.access_lease_token).toBe("replacement");
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("rejects work after expiry even if the event loop did not run the heartbeat", async () => {
    vi.useFakeTimers();
    const db = database();
    db.state.partner.access_lease_token = null;
    db.state.partner.access_lease_until = null;
    await expect(
      db.repository.withParticipantLock(
        "partner-1",
        async (lease) => {
          vi.setSystemTime(Date.now() + 901);
          lease.assertActive();
        },
        { leaseMs: 900, waitMs: 0 },
      ),
    ).rejects.toBeInstanceOf(ParticipantLeaseLostError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts at expiry while a renewal is stuck, and never revives a replaced lease", async () => {
    vi.useFakeTimers();
    const db = database();
    db.state.partner.access_lease_token = null;
    db.state.partner.access_lease_until = null;
    let resume!: () => void;
    db.pauseRenewal(
      new Promise<void>((resolve) => {
        resume = resolve;
      }),
    );
    let active!: ParticipantAccessLease;
    const operation = db.repository.withParticipantLock(
      "partner-1",
      async (lease) => {
        active = lease;
        await new Promise<void>((_resolve, reject) => {
          lease.signal.addEventListener(
            "abort",
            () => reject(lease.signal.reason),
            { once: true },
          );
        });
      },
      { waitMs: 0, leaseMs: 900 },
    );
    const rejected = expect(operation).rejects.toBeInstanceOf(
      ParticipantLeaseLostError,
    );
    await vi.advanceTimersByTimeAsync(900);
    expect(active.signal.aborted).toBe(true);

    db.state.partner.access_lease_token = "replacement";
    db.state.partner.access_lease_until = new Date(Date.now() + 900);
    resume();

    await rejected;
    expect(db.state.partner.access_lease_token).toBe("replacement");
    expect(vi.getTimerCount()).toBe(0);
    expect(db.connections).toBe(0);
  });
});
