import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type {
  Database,
  IssuerClaimsDatabase,
} from "@tx-bootstrap/core/server/db/database.js";
import type { Config } from "../config/index.js";

const { Pool } = pg;

export type Databases = {
  db: Kysely<Database>;
  pool: pg.Pool;
  issuerClaimsDb: Kysely<IssuerClaimsDatabase> | null;
  issuerClaimsPool: pg.Pool | null;
  close: () => Promise<void>;
};

export function createDatabases(config: Config): Databases {
  const pool = new Pool({ connectionString: config.database.url });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  const issuerClaimsPool = config.issuer.databaseUrl
    ? new Pool({ connectionString: config.issuer.databaseUrl })
    : null;
  const issuerClaimsDb = issuerClaimsPool
    ? new Kysely<IssuerClaimsDatabase>({
        dialect: new PostgresDialect({ pool: issuerClaimsPool }),
      })
    : null;

  return {
    db,
    pool,
    issuerClaimsDb,
    issuerClaimsPool,
    async close() {
      await db.destroy();
      if (issuerClaimsDb) await issuerClaimsDb.destroy();
    },
  };
}
