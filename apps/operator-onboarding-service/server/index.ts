import { createApp } from "./src/app.js";
import { config } from "./src/config/index.js";
import { createDatabase } from "./src/db/index.js";
import { createHealthRepository } from "@tx-bootstrap/core/server/repositories/health-repository.js";
import { createHealthService } from "@tx-bootstrap/core/server/services/health-service.js";
import { createPublicOnboardingService } from "./src/services/public-onboarding-service.js";
import { createEmailService } from "@tx-bootstrap/core/server/services/email-service.js";
import { setupGracefulShutdown } from "@tx-bootstrap/core/server/utils/shutdown.js";
import { createNetworkParticipantService } from "./src/services/network-participant-service.js";

const database = createDatabase(config);
const emailService = createEmailService(config.email);

if (config.email.enabled) {
  emailService.verify().catch((err) => {
    console.error("[Email] SMTP verification failed:", err.message);
  });
}

const healthService = createHealthService({
  healthRepository: createHealthRepository(database.pool),
});
const publicOnboardingService = createPublicOnboardingService({
  config,
  pool: database.pool,
  emailService,
});
const networkParticipantService = createNetworkParticipantService(
  database.pool,
);
const app = createApp({
  config,
  healthService,
  publicOnboardingService,
  networkParticipantService,
});

setupGracefulShutdown({
  logger: app.log,
  serviceName: "operator onboarding service",
  cleanup: async () => {
    await app.close();
    await database.close();
  },
});

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`Operator onboarding service listening on ${config.port}`);
} catch (err) {
  app.log.error(err, "Failed to start operator onboarding service");
  process.exit(1);
}
