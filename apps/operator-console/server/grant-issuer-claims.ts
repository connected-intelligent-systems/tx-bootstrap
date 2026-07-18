import { sql, Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { quotePostgresIdentifier } from "@tx-bootstrap/core/server/db/migrations.js";

const databaseUrl = process.env.ISSUER_MIGRATOR_DATABASE_URL;
const claimsRoleName = process.env.ISSUER_CLAIMS_DB_ROLE;

if (!databaseUrl) throw new Error("ISSUER_MIGRATOR_DATABASE_URL must be set");
if (!claimsRoleName) throw new Error("ISSUER_CLAIMS_DB_ROLE must be set");

const { Pool } = pg;
const db = new Kysely<unknown>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: databaseUrl }),
  }),
});
const claimsRole = quotePostgresIdentifier(claimsRoleName);
const retryTimeoutMs = Number(
  process.env.DB_MIGRATION_RETRY_TIMEOUT_MS ?? 120_000,
);
const retryDelayMs = Number(process.env.DB_MIGRATION_RETRY_DELAY_MS ?? 2_000);
const deadline = Date.now() + retryTimeoutMs;

try {
  for (;;) {
    try {
      await db.connection().execute(async (connection) => {
        const lockName = "tx-bootstrap:issuer-claims-grant";
        await sql`SELECT pg_advisory_lock(hashtextextended(${lockName}, 0))`.execute(
          connection,
        );
        try {
          await sql
            .raw(`GRANT USAGE ON SCHEMA public TO ${claimsRole}`)
            .execute(connection);
          await sql
            .raw(
              `GRANT SELECT, INSERT, UPDATE ON TABLE custom_attestation_claims TO ${claimsRole}`,
            )
            .execute(connection);
        } finally {
          await sql`SELECT pg_advisory_unlock(hashtextextended(${lockName}, 0))`
            .execute(connection)
            .catch(() => undefined);
        }
      });
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      console.warn(
        `Issuer claims grant unavailable; retrying in ${retryDelayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  console.log("Issuer claims database grants complete");
} finally {
  await db.destroy();
}
