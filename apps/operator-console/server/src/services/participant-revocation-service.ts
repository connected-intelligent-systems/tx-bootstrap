import { randomUUID } from "node:crypto";
import type { Repositories } from "@tx-bootstrap/core/server/db/repositories/index.js";
import type { BusinessPartnerRow } from "@tx-bootstrap/core/server/db/database.js";
import type { ParticipantAccessLease } from "@tx-bootstrap/core/server/db/participant-access-lease.js";
import type {
  createParticipantApprovalService,
  SetupCheck,
} from "./participant-approval-service.js";

export const REVOCATION_RECONCILER_ACTOR = "system:revocation-reconciler";

// A credential request the issuer accepted just before the holder was blocked
// can still produce a credential. The credential step stays pending until a
// scan has run at least this long after the revocation.
const DEFAULT_SETTLE_MS = 60_000;

/**
 * Runs and follows up the revocation steps of a participant. The console runs
 * them when the operator revokes; the revocation reconciler repeats them until
 * every step is done, so late issuance and tunnel cleanup are covered.
 */
export function createParticipantRevocationService({
  approvalService,
  repositories,
  tunnels,
  settleMs = DEFAULT_SETTLE_MS,
  now = () => new Date(),
}: {
  approvalService: Pick<
    ReturnType<typeof createParticipantApprovalService>,
    "runRevocation"
  >;
  repositories: Pick<
    Repositories,
    | "businessPartners"
    | "onboardingCases"
    | "networkEnrollments"
    | "participantEvents"
  >;
  tunnels: { enabled: boolean; url?: string };
  settleMs?: number;
  now?: () => Date;
}) {
  const { businessPartners, onboardingCases, networkEnrollments } =
    repositories;

  async function runChecks(
    partner: BusinessPartnerRow,
    lease: ParticipantAccessLease,
  ): Promise<SetupCheck[]> {
    lease.assertActive();
    const latest = await onboardingCases.getLatestForBusinessPartner(
      partner.id,
    );
    const revokedAt = partner.revoked_at
      ? new Date(partner.revoked_at).getTime()
      : now().getTime();
    const checks = await approvalService.runRevocation({
      bpn: partner.assigned_bpn,
      did: latest?.did ?? "",
      settled: now().getTime() - revokedAt >= settleMs,
      lease,
    });
    lease.assertActive();
    checks.push(await tunnelCheck(partner.id));
    return checks;
  }

  // Tunnel keys are revoked by the network reconciler; this step reports
  // whether it has finished.
  async function tunnelCheck(partnerId: string): Promise<SetupCheck> {
    const name = "tunnel-revocation";
    if (!tunnels.enabled)
      return { name, status: "skipped", message: "Tunnels are not enabled" };
    const active = (await networkEnrollments.list(partnerId)).filter(
      (row) =>
        row.control_url === tunnels.url &&
        ["CREATING", "ISSUED", "REVOKING"].includes(row.state),
    ).length;
    if (active)
      return {
        name,
        status: "pending",
        retryable: true,
        message: `${active} tunnel key(s) awaiting revocation`,
      };
    return { name, status: "ok", message: "No active tunnel keys" };
  }

  function complete(checks: unknown): boolean {
    return (
      Array.isArray(checks) &&
      checks.length > 0 &&
      checks.every(
        (check) => check?.status === "ok" || check?.status === "skipped",
      )
    );
  }

  /**
   * One reconciliation pass over revoked participants whose revocation is not
   * complete. A participant locked by a running revoke or readmit is skipped
   * and picked up on the next pass.
   */
  async function reconcile() {
    let completed = 0;
    let incomplete = 0;
    for (const candidate of await businessPartners.listRevoked()) {
      if (complete(candidate.revocation_checks)) continue;
      const result = await businessPartners.withParticipantLock(
        candidate.id,
        async (lease) => {
          const partner = await businessPartners.load(candidate.id);
          if (partner?.verification_status !== "REVOKED") return undefined;
          if (complete(partner.revocation_checks)) return undefined;
          const checks = await runChecks(partner, lease);
          await businessPartners.setRevocationChecks(partner.id, checks, lease);
          return complete(checks);
        },
        { waitMs: 0 },
      );
      if (result === true) {
        completed++;
        await repositories.participantEvents.insert({
          id: randomUUID(),
          businessPartnerId: candidate.id,
          onboardingCaseId: null,
          actor: REVOCATION_RECONCILER_ACTOR,
          action: "participant.revocation_completed",
          message: "Revocation completed.",
          payload: {},
        });
      } else if (result === false) {
        incomplete++;
      }
    }
    return { completed, incomplete };
  }

  return { runChecks, reconcile };
}

export type ParticipantRevocationService = ReturnType<
  typeof createParticipantRevocationService
>;
