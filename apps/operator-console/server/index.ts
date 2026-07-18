import { createApp } from "./src/app.js";
import { config } from "./src/config/index.js";
import { createOperatorController } from "./src/controllers/operator-controller.js";
import { createDatabases } from "./src/db/index.js";
import { createRepositories } from "@tx-bootstrap/core/server/db/repositories/index.js";
import { createHealthRepository } from "@tx-bootstrap/core/server/repositories/health-repository.js";
import { createHealthService } from "@tx-bootstrap/core/server/services/health-service.js";
import { createAuth } from "./src/http/auth.js";
import { createEmailService } from "@tx-bootstrap/core/server/services/email-service.js";
import { setupGracefulShutdown } from "@tx-bootstrap/core/server/utils/shutdown.js";
import { createTechnicalSetupWorker } from "./src/services/technical-setup-worker.js";

const databases = createDatabases(config);
const repositories = createRepositories(databases.db, databases.issuerClaimsDb);
const auth = createAuth(config);
const emailService = createEmailService(config.email);

// Verify email configuration on startup
if (config.email.enabled) {
  emailService.verify().catch((err) => {
    console.error("[Email] SMTP verification failed:", err.message);
  });
}

const controller = createOperatorController({
  config,
  repositories,
  auth,
  emailService,
});
const healthService = createHealthService({
  healthRepository: createHealthRepository(databases.pool),
});

const app = createApp({ config, controller, auth, healthService });
const technicalSetupWorker = createTechnicalSetupWorker({
  db: databases.db,
  onboardingCases: repositories.onboardingCases,
  participantEvents: repositories.participantEvents,
  approvalService: controller.approvalService,
  logger: app.log,
});

// Graceful shutdown handling
setupGracefulShutdown({
  logger: app.log,
  serviceName: "operator console",
  cleanup: async () => {
    await technicalSetupWorker.stop();
    await app.close();
    await databases.close();
  },
});

// Start server
try {
  await app.listen({
    port: config.port,
    host: "0.0.0.0",
  });
  app.log.info(`Admin console listening on ${config.port}`);
  technicalSetupWorker.start();
} catch (err) {
  app.log.error(err, "Failed to start server");
  process.exit(1);
}
