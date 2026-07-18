import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { config } from "./src/config/index.js";
import type { Database } from "@tx-bootstrap/core/server/db/database.js";
import {
  quotePostgresIdentifier,
  runMigrations,
} from "@tx-bootstrap/core/server/db/migrations.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: config.database.migrationUrl });
const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
const ownerRoleName = process.env.OPERATOR_MIGRATOR_ROLE;
const ownerRole = ownerRoleName ? quotePostgresIdentifier(ownerRoleName) : null;

try {
  await runMigrations(db, {
    migrationsDir: process.env.OPERATOR_MIGRATIONS_DIR,
    lockName: "tx-bootstrap:dataspace-admin",
    role: ownerRoleName,
    retryTimeoutMs: Number(
      process.env.DB_MIGRATION_RETRY_TIMEOUT_MS ?? 120_000,
    ),
    retryDelayMs: Number(process.env.DB_MIGRATION_RETRY_DELAY_MS ?? 2_000),
    onRetry: (_error, delayMs) => {
      console.warn(`Database unavailable; retrying migration in ${delayMs}ms`);
    },
    afterMigrate: async (connection) => {
      if (!ownerRole) return;
      await sql
        .raw(
          `
        ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public
          REVOKE ALL ON TABLES FROM PUBLIC;
        ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public
          REVOKE ALL ON SEQUENCES FROM PUBLIC;
        ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public
          REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
        ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO operator_console;
        ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public
          GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO operator_console;
      `,
        )
        .execute(connection);
    },
  });
  console.log("Operator database migrations complete");
} finally {
  await db.destroy();
}
