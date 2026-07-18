import { createDatabasePool } from '@tx-bootstrap/core/server/db/pool.js'
import { config } from '../config/index.js'

const db = createDatabasePool(config.databaseUrl)
export const pool = db.pool

export async function closePool() {
  await db.close()
}
