import { sql, type Kysely } from "kysely";
import type { IssuerClaimsDatabase } from "../database.js";

export function createIssuerPolicyClaimsRepository(
  db: Kysely<IssuerClaimsDatabase> | null,
) {
  return {
    configured: Boolean(db),

    async upsert(row: {
      bpn: string;
      memberOf: string;
      groupName: string;
      useCase: string;
      contractTemplate: string;
      contractVersion: string;
      now: number;
    }): Promise<void> {
      if (!db) throw new Error("ISSUER_CLAIMS_DATABASE_URL is not configured");
      await db
        .insertInto("custom_attestation_claims")
        .values({
          holder_id: row.bpn,
          holder_identifier: row.bpn,
          member_of: row.memberOf,
          bpn: row.bpn,
          group_name: row.groupName,
          use_case: row.useCase,
          contract_template: row.contractTemplate,
          contract_version: row.contractVersion,
          created_date: row.now,
          last_modified_date: row.now,
        })
        .onConflict((oc) =>
          oc.column("holder_id").doUpdateSet({
            holder_identifier: (eb) => eb.ref("excluded.holder_identifier"),
            member_of: (eb) => eb.ref("excluded.member_of"),
            bpn: (eb) => eb.ref("excluded.bpn"),
            group_name: (eb) => eb.ref("excluded.group_name"),
            use_case: (eb) => eb.ref("excluded.use_case"),
            contract_template: (eb) => eb.ref("excluded.contract_template"),
            contract_version: (eb) => eb.ref("excluded.contract_version"),
            last_modified_date: sql`excluded.last_modified_date`,
          }),
        )
        .execute();
    },
  };
}
