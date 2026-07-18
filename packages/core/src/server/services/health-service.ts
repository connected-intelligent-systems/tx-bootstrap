import type { HealthRepository } from "../repositories/health-repository.js";

type CheckStatus = "healthy" | "unhealthy";

type HealthCheck = {
  status: CheckStatus;
  responseTime?: number;
  error?: string;
};

export type HealthReport = {
  status: CheckStatus;
  checks: Record<string, HealthCheck>;
  timestamp: string;
  responseTime: number;
};

export function createHealthService({
  healthRepository,
}: {
  healthRepository: HealthRepository;
}) {
  return {
    async getHealth(): Promise<HealthReport> {
      const startTime = Date.now();
      const checks: Record<string, HealthCheck> = {};

      try {
        const dbStartTime = Date.now();
        await healthRepository.checkDatabase();
        checks.database = {
          status: "healthy",
          responseTime: Date.now() - dbStartTime,
        };
      } catch (error) {
        checks.database = {
          status: "unhealthy",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }

      const unhealthy = Object.values(checks).some(
        (check) => check.status === "unhealthy",
      );

      return {
        status: unhealthy ? "unhealthy" : "healthy",
        checks,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
      };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
