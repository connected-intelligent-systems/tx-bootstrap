import type { Pool } from "pg";

export function createHealthRepository(pool: Pool) {
  return {
    async checkDatabase() {
      await pool.query("SELECT 1");
    },
  };
}

export type HealthRepository = ReturnType<typeof createHealthRepository>;
