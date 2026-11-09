import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type {
  Database,
  NetworkEnrollmentRow,
  NetworkEnrollmentState,
} from "../database.js";
import { ConflictError, NotFoundError } from "../../http/errors.js";

export function createNetworkEnrollmentRepository(db: Kysely<Database>) {
  return {
    async reserve(row: {
      id: string;
      participantId: string;
      controlUrl: string;
      participantTag: string;
      expiresAt: Date;
    }) {
      try {
        return await db
          .insertInto("network_enrollments")
          .values({
            id: row.id,
            business_partner_id: row.participantId,
            control_url: row.controlUrl,
            participant_tag: row.participantTag,
            expires_at: row.expiresAt,
            pre_auth_key_id: null,
            state: "CREATING",
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .returningAll()
          .executeTakeFirst();
      } catch (error) {
        const pgError = error as { code?: string; constraint?: string };
        if (
          pgError.code === "23505" &&
          pgError.constraint ===
            "network_enrollments_one_active_per_participant"
        ) {
          throw new ConflictError(
            "The participant already has an active network enrollment; revoke it first",
          );
        }
        throw error;
      }
    },
    /** Issued enrollments on one Headscale server, with the participant BPN. */
    async listIssued(controlUrl: string) {
      return db
        .selectFrom("network_enrollments as e")
        .innerJoin("business_partners as p", "p.id", "e.business_partner_id")
        .select(["e.id", "e.pre_auth_key_id", "p.assigned_bpn"])
        .where("e.control_url", "=", controlUrl)
        .where("e.state", "=", "ISSUED")
        .execute();
    },
    /**
     * Enrollments to revoke on one Headscale server: unfinished revocations
     * and issued enrollments of rejected participants.
     */
    async listPendingRevocations(controlUrl: string) {
      return db
        .selectFrom("network_enrollments as e")
        .innerJoin("business_partners as p", "p.id", "e.business_partner_id")
        .select(["e.id", "e.business_partner_id"])
        .where("e.control_url", "=", controlUrl)
        .where((eb) =>
          eb.or([
            eb("e.state", "=", "REVOKING"),
            eb.and([
              eb("e.state", "=", "ISSUED"),
              eb("p.verification_status", "=", "REJECTED"),
            ]),
          ]),
        )
        .execute();
    },
    async list(participantId: string) {
      return db
        .selectFrom("network_enrollments")
        .selectAll()
        .where("business_partner_id", "=", participantId)
        .orderBy("created_at", "desc")
        .execute();
    },
    async fail(id: string, keyId: string | null) {
      await db
        .updateTable("network_enrollments")
        .set({
          state: "FAILED",
          pre_auth_key_id: keyId,
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .where("state", "=", "CREATING")
        .execute();
    },
    async withLock<T>(
      participantId: string,
      id: string,
      work: (locked: {
        row: NetworkEnrollmentRow;
        update: (
          state: NetworkEnrollmentState,
          keyId?: string,
        ) => Promise<NetworkEnrollmentRow>;
        audit: (action: string, actor: string) => Promise<void>;
      }) => Promise<T>,
    ): Promise<T> {
      return db.transaction().execute(async (trx) => {
        await sql`SET LOCAL lock_timeout = '5s'`.execute(trx);
        const row = await trx
          .selectFrom("network_enrollments")
          .selectAll()
          .where("business_partner_id", "=", participantId)
          .where("id", "=", id)
          .forUpdate()
          .executeTakeFirst();
        if (!row) throw new NotFoundError("Network deployment not found");
        return work({
          row,
          async update(state, keyId) {
            const result = await trx
              .updateTable("network_enrollments")
              .set({
                state,
                pre_auth_key_id: keyId ?? row.pre_auth_key_id,
                updated_at: new Date(),
              })
              .where("id", "=", id)
              .returningAll()
              .executeTakeFirst();
            if (!result) throw new ConflictError("Network deployment changed");
            return result;
          },
          async audit(action, actor) {
            await trx
              .insertInto("participant_events")
              .values({
                id: randomUUID(),
                business_partner_id: participantId,
                onboarding_case_id: null,
                actor,
                action,
                message: "",
                payload: { deploymentId: id, provider: "headscale" },
              })
              .execute();
          },
        });
      });
    },
  };
}

export type NetworkEnrollmentRepository = ReturnType<
  typeof createNetworkEnrollmentRepository
>;
