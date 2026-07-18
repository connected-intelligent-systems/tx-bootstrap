import { createDatabasePool } from "@tx-bootstrap/core/server/db/pool.js";
import type { Config } from "../config/index.js";

export function createDatabase(config: Config) {
  return createDatabasePool(config.database.url);
}

export type OperatorOnboardingServiceDatabase = ReturnType<typeof createDatabase>;
