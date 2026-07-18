import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import { quotePostgresIdentifier, runMigrations } from '@tx-bootstrap/core/server/db/migrations.js'

const databaseUrl = process.env.PARTICIPANT_PORTAL_MIGRATOR_DATABASE_URL
const ownerRoleName = process.env.PARTICIPANT_PORTAL_OWNER_ROLE
const runtimeRoleName = process.env.PARTICIPANT_PORTAL_DB_ROLE

if (!databaseUrl) throw new Error('PARTICIPANT_PORTAL_MIGRATOR_DATABASE_URL must be set')
if (!ownerRoleName) throw new Error('PARTICIPANT_PORTAL_OWNER_ROLE must be set')
if (!runtimeRoleName) throw new Error('PARTICIPANT_PORTAL_DB_ROLE must be set')

const { Pool } = pg
const db = new Kysely<unknown>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString: databaseUrl }) }),
})
const runtimeRole = quotePostgresIdentifier(runtimeRoleName)
const ownerRole = quotePostgresIdentifier(ownerRoleName)

try {
  await runMigrations(db, {
    migrationsDir: process.env.PARTICIPANT_PORTAL_MIGRATIONS_DIR,
    lockName: 'tx-bootstrap:participant-portal',
    role: ownerRoleName,
    retryTimeoutMs: Number(process.env.DB_MIGRATION_RETRY_TIMEOUT_MS ?? 120_000),
    retryDelayMs: Number(process.env.DB_MIGRATION_RETRY_DELAY_MS ?? 2_000),
    onRetry: (_error, delayMs) => {
      console.warn(`Portal database unavailable; retrying migration in ${delayMs}ms`)
    },
    afterMigrate: async (connection) => {
      await sql.raw(`REVOKE ALL ON TABLE onboarding_state FROM PUBLIC`).execute(connection)
      await sql.raw(`REVOKE ALL ON TABLE api_clients FROM PUBLIC`).execute(connection)
      await sql.raw(`GRANT USAGE ON SCHEMA public TO ${runtimeRole}`).execute(connection)
      await sql
        .raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE onboarding_state, api_clients TO ${runtimeRole}`)
        .execute(connection)
      await sql
        .raw(
          `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public ` +
            `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtimeRole}`,
        )
        .execute(connection)
    },
  })
  console.log('Participant portal database migrations complete')
} finally {
  await db.destroy()
}
