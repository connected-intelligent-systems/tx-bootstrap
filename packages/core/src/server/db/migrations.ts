import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql, type Kysely } from "kysely";

export type MigrationOptions<DB> = {
  migrationsDir?: string;
  lockName?: string;
  role?: string;
  retryTimeoutMs?: number;
  retryDelayMs?: number;
  afterMigrate?: (db: Kysely<DB>) => Promise<void>;
  onRetry?: (error: unknown, delayMs: number) => void;
};

const connectionErrorCodes = new Set([
  "57P03",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

const defaultMigrationsDir = join(process.cwd(), "../db/migrations");

export async function runMigrations<DB>(
  db: Kysely<DB>,
  options: MigrationOptions<DB> = {},
) {
  const retryTimeoutMs = options.retryTimeoutMs ?? 60_000;
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  const deadline = Date.now() + retryTimeoutMs;

  for (;;) {
    try {
      await runMigrationsOnce(db, options);
      return;
    } catch (error) {
      if (!isConnectionError(error) || Date.now() >= deadline) throw error;
      options.onRetry?.(error, retryDelayMs);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

async function runMigrationsOnce<DB>(
  db: Kysely<DB>,
  options: MigrationOptions<DB>,
) {
  const migrationsDir = options.migrationsDir ?? defaultMigrationsDir;
  const lockName = options.lockName ?? `tx-bootstrap:${migrationsDir}`;
  const role = options.role ? quotePostgresIdentifier(options.role) : null;

  await db.connection().execute(async (connection) => {
    await sql`SELECT pg_advisory_lock(hashtextextended(${lockName}, 0))`.execute(
      connection,
    );

    try {
      if (role) await sql.raw(`SET ROLE ${role}`).execute(connection);

      await sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename text PRIMARY KEY,
          checksum text NOT NULL,
          executed_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(connection);

      const files = (await readdir(migrationsDir))
        .filter((file) => /^\d+_.+\.sql$/.test(file))
        .sort();

      for (const filename of files) {
        const path = join(migrationsDir, filename);
        const content = await readFile(path, "utf8");
        const checksum = createHash("sha256").update(content).digest("hex");
        const applied = await sql<{ filename: string; checksum: string }>`
          SELECT filename, checksum
          FROM schema_migrations
          WHERE filename = ${filename}
        `.execute(connection);
        const migration = applied.rows[0];

        if (migration) {
          if (migration.checksum !== checksum) {
            throw new Error(`Migration checksum mismatch for ${filename}`);
          }
          continue;
        }

        await connection.transaction().execute(async (trx) => {
          await sql.raw(content).execute(trx);
          await sql`
            INSERT INTO schema_migrations (filename, checksum)
            VALUES (${filename}, ${checksum})
          `.execute(trx);
        });
      }

      await options.afterMigrate?.(connection);
    } finally {
      if (role)
        await sql`RESET ROLE`.execute(connection).catch(() => undefined);
      await sql`SELECT pg_advisory_unlock(hashtextextended(${lockName}, 0))`
        .execute(connection)
        .catch(() => undefined);
    }
  });
}

export function quotePostgresIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function isConnectionError(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = "code" in current ? String(current.code) : "";
    if (connectionErrorCodes.has(code) || code.startsWith("08")) return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}
