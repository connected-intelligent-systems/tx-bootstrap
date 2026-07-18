import type { FastifyPluginAsync } from "fastify";
import type { HealthService } from "@tx-bootstrap/core/server/services/health-service.js";
import type { PublicOnboardingService } from "../services/public-onboarding-service.js";
import type { NetworkParticipantService } from "../services/network-participant-service.js";

export const createApiRoutes: FastifyPluginAsync<{
  healthService: HealthService;
  publicOnboardingService: PublicOnboardingService;
  networkParticipantService: NetworkParticipantService;
}> = async (
  app,
  { healthService, publicOnboardingService, networkParticipantService },
) => {
  app.get("/health", async (request, reply) => {
    const health = await healthService.getHealth();

    if (health.status === "unhealthy") {
      request.log.error({ checks: health.checks }, "Health check failed");
      return reply.status(503).send(health);
    }

    return health;
  });

  app.get("/network/participants", async (_request, reply) => {
    const participants = await networkParticipantService.list();
    return reply
      .header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
      .send({ participants });
  });

  app.post("/onboarding-cases/:caseId/resend-token", async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    await publicOnboardingService.resendToken(
      request.raw,
      reply.raw,
      caseId,
      request.body as Record<string, unknown> | undefined,
    );
  });

  app.get("/onboarding-cases/:caseId", async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const url = new URL(request.url, `http://${request.headers.host}`);
    await publicOnboardingService.handleParticipantCase(
      request.raw,
      reply.raw,
      caseId,
      undefined,
      url,
    );
  });

  app.get("/onboarding-cases/:caseId/:action", async (request, reply) => {
    const { caseId, action } = request.params as {
      caseId: string;
      action: string;
    };
    const url = new URL(request.url, `http://${request.headers.host}`);
    await publicOnboardingService.handleParticipantCase(
      request.raw,
      reply.raw,
      caseId,
      action,
      url,
    );
  });

  app.patch("/onboarding-cases/:caseId/:action", async (request, reply) => {
    const { caseId, action } = request.params as {
      caseId: string;
      action: string;
    };
    const url = new URL(request.url, `http://${request.headers.host}`);
    await publicOnboardingService.handleParticipantCase(
      request.raw,
      reply.raw,
      caseId,
      action,
      url,
      request.body as Record<string, unknown> | undefined,
    );
  });

  app.post("/onboarding-cases/:caseId/:action", async (request, reply) => {
    const { caseId, action } = request.params as {
      caseId: string;
      action: string;
    };
    const url = new URL(request.url, `http://${request.headers.host}`);
    await publicOnboardingService.handleParticipantCase(
      request.raw,
      reply.raw,
      caseId,
      action,
      url,
      request.body as Record<string, unknown> | undefined,
    );
  });
};
