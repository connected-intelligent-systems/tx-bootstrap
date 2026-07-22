import type { FastifyPluginAsync } from "fastify";
import type { HealthService } from "@tx-bootstrap/core/server/services/health-service.js";

export const createHealthRoutes: FastifyPluginAsync<{
  healthService: HealthService;
}> = async (app, { healthService }) => {
  app.get(
    "/health",
    { config: { rateLimit: false } },
    async (request, reply) => {
      const health = await healthService.getHealth();

      if (health.status === "unhealthy") {
        request.log.error({ checks: health.checks }, "Health check failed");
        return reply.status(503).send(health);
      }

      return health;
    },
  );
};
