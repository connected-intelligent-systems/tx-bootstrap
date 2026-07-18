import type { Kysely } from "kysely";
import type { Database, ParticipantEventRow } from "../database.js";

export function createParticipantEventRepository(db: Kysely<Database>) {
  return {
    async listForBusinessPartners(
      ids: string[],
    ): Promise<ParticipantEventRow[]> {
      if (!ids.length) return [];
      return db
        .selectFrom("participant_events")
        .selectAll()
        .where("business_partner_id", "in", ids)
        .orderBy("created_at", "desc")
        .limit(200)
        .execute();
    },

    async insert(row: {
      id: string;
      businessPartnerId: string | null;
      onboardingCaseId: string | null;
      actor: string;
      action: string;
      message: string;
      payload: Record<string, unknown>;
    }): Promise<void> {
      await db
        .insertInto("participant_events")
        .values({
          id: row.id,
          business_partner_id: row.businessPartnerId,
          onboarding_case_id: row.onboardingCaseId,
          actor: row.actor,
          action: row.action,
          message: row.message,
          payload: row.payload,
        })
        .execute();
    },
  };
}
