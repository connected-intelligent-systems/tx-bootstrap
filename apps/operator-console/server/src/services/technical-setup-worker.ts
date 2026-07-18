import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "@tx-bootstrap/core/server/db/database.js";
import type { Repositories } from "@tx-bootstrap/core/server/db/repositories/index.js";
import type { SetupCheck } from "./participant-approval-service.js";
import type { createParticipantApprovalService } from "./participant-approval-service.js";

const pollIntervalMs = 1_000;
const leaseTimeoutMs = 5 * 60_000;
const retryDelaysMs = [5_000, 30_000];
const maxAttempts = 3;

type ApprovalService = ReturnType<typeof createParticipantApprovalService>;
type Logger = {
  info: (data: unknown, message?: string) => void;
  error: (error: unknown, message: string) => void;
};
type SetupCase = NonNullable<
  Awaited<ReturnType<Repositories["onboardingCases"]["getWithBusinessPartner"]>>
>;

export function createTechnicalSetupWorker({
  db,
  claimCase,
  onboardingCases,
  participantEvents,
  approvalService,
  logger,
  now = () => new Date(),
}: {
  db: Kysely<Database>;
  onboardingCases: Repositories["onboardingCases"];
  claimCase?: () => Promise<SetupCase | null>;
  participantEvents: Repositories["participantEvents"];
  approvalService: ApprovalService;
  logger: Logger;
  now?: () => Date;
}) {
  let stopped = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeRun: Promise<void> = Promise.resolve();

  return { start, stop, runOnce };

  function start() {
    if (!stopped) return;
    stopped = false;
    schedule(0);
  }

  async function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    await activeRun;
  }

  async function runOnce() {
    while (true) {
      const row = claimCase ? await claimCase() : await claimNextCase();
      if (!row) return;
      await processCase(row);
      if (stopped) return;
    }
  }

  function schedule(delay: number) {
    if (stopped) return;
    timer = setTimeout(() => {
      activeRun = runOnce()
        .catch((error) =>
          logger.error(error, "Automatic technical setup worker failed"),
        )
        .finally(() => schedule(pollIntervalMs));
    }, delay);
  }

  async function claimNextCase() {
    const claimedId = await db.transaction().execute(async (trx) => {
      const currentTime = now();
      const staleBefore = new Date(currentTime.getTime() - leaseTimeoutMs);
      const candidate = await trx
        .selectFrom("onboarding_cases as c")
        .innerJoin("business_partners as bp", "bp.id", "c.business_partner_id")
        .select("c.id")
        .where("c.state", "=", "IN_REVIEW")
        .where("c.setup_next_attempt_at", "<=", currentTime)
        .where((eb) =>
          eb.or([
            eb("c.setup_started_at", "is", null),
            eb("c.setup_started_at", "<=", staleBefore),
          ]),
        )
        .where("bp.verification_status", "=", "VERIFIED")
        .where("bp.assigned_bpn", "!=", "")
        .where("c.did", "!=", "")
        .where("c.dsp_endpoint", "!=", "")
        .where("c.identityhub_credential_service_endpoint", "!=", "")
        .orderBy("c.setup_next_attempt_at", "asc")
        .orderBy("c.updated_at", "asc")
        .forUpdate()
        .skipLocked()
        .executeTakeFirst();

      if (!candidate) return null;

      await trx
        .updateTable("onboarding_cases")
        .set({
          setup_started_at: currentTime,
          setup_attempt_count: sql<number>`setup_attempt_count + 1`,
          updated_at: currentTime,
        })
        .where("id", "=", candidate.id)
        .execute();

      return candidate.id;
    });

    return claimedId ? onboardingCases.getWithBusinessPartner(claimedId) : null;
  }

  async function processCase(row) {
    const attempt = row.setup_attempt_count;
    await recordEvent(
      row,
      "participant.technical_setup_started",
      "Automatic connector setup started.",
      {
        attempt,
      },
    );

    try {
      const verified = approvalService.requireVerifiedBusinessPartner(row);
      const checks = await approvalService.runApprovalSetup(verified);
      const failures = checks.filter((check) => check.status !== "ok");

      if (!failures.length) {
        await onboardingCases.updateState(row.id, "READY_FOR_PARTICIPANT", {
          bpn: verified.bpn,
          setup_checks: checks,
          credential_request: approvalService.buildCredentialRequest(
            verified.bpn,
          ),
          setup_started_at: null,
          setup_next_attempt_at: now(),
        });
        await recordEvent(
          row,
          "participant.technical_setup_completed",
          "Automatic connector setup completed.",
          { attempt, setupChecks: checks },
        );
        return;
      }

      await handleFailure(
        row,
        attempt,
        checks,
        failures.every((check) => check.retryable === true),
      );
    } catch (error) {
      const check: SetupCheck = {
        name: "automatic-setup",
        status: "failed",
        retryable: false,
        message: error instanceof Error ? error.message : String(error),
      };
      await handleFailure(row, attempt, [check], false);
    }
  }

  async function handleFailure(
    row,
    attempt: number,
    checks: SetupCheck[],
    retryable: boolean,
  ) {
    if (retryable && attempt < maxAttempts) {
      const delay =
        retryDelaysMs[attempt - 1] ?? retryDelaysMs[retryDelaysMs.length - 1];
      const nextAttemptAt = new Date(now().getTime() + delay);
      await onboardingCases.updateState(row.id, "IN_REVIEW", {
        setup_checks: checks,
        setup_started_at: null,
        setup_next_attempt_at: nextAttemptAt,
      });
      await recordEvent(
        row,
        "participant.technical_setup_retry_scheduled",
        "Automatic connector setup will retry after a transient failure.",
        {
          attempt,
          nextAttemptAt: nextAttemptAt.toISOString(),
          setupChecks: checks,
        },
      );
      return;
    }

    await onboardingCases.updateState(row.id, "FAILED", {
      setup_checks: checks,
      setup_started_at: null,
      setup_next_attempt_at: now(),
    });
    await recordEvent(
      row,
      "participant.technical_setup_failed",
      "Automatic connector setup failed and needs admin action.",
      { attempt, setupChecks: checks },
    );
  }

  async function recordEvent(
    row,
    action: string,
    message: string,
    payload: Record<string, unknown>,
  ) {
    try {
      await participantEvents.insert({
        id: randomUUID(),
        businessPartnerId: row.business_partner_id,
        onboardingCaseId: row.id,
        actor: "system",
        action,
        message,
        payload,
      });
      logger.info({ onboardingCaseId: row.id, action, ...payload }, message);
    } catch (error) {
      logger.error(error, `Could not record automatic setup event ${action}`);
    }
  }
}
