import pg from "pg";

const { Pool } = pg;

export function createDatabasePool(connectionString: string) {
  const pool = new Pool({ connectionString });

  return {
    pool,
    async close() {
      await pool.end();
    },
  };
}

export type DatabasePool = ReturnType<typeof createDatabasePool>;
