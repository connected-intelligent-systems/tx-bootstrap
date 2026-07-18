import {
  createStandardFastifyApp,
  registerStandardErrorHandler,
} from "@tx-bootstrap/core/server/fastify/app.js";
import type { HealthService } from "@tx-bootstrap/core/server/services/health-service.js";
import type { Config } from "./config/index.js";
import { createApiRoutes } from "./routes/api-routes.js";
import { registerAppPlugins } from "./plugins.js";
import type { PublicOnboardingService } from "./services/public-onboarding-service.js";
import type { NetworkParticipantService } from "./services/network-participant-service.js";

export function createApp({
  config,
  healthService,
  publicOnboardingService,
  networkParticipantService,
}: {
  config: Config;
  healthService: HealthService;
  publicOnboardingService: PublicOnboardingService;
  networkParticipantService: NetworkParticipantService;
}) {
  const app = createStandardFastifyApp({ logLevel: config.logLevel });

  registerAppPlugins(app, config);

  app.register(createApiRoutes, {
    prefix: "/api",
    healthService,
    publicOnboardingService,
    networkParticipantService,
  });

  registerStandardErrorHandler(app, {
    includeStack: process.env.NODE_ENV === "development",
  });

  return app;
}
