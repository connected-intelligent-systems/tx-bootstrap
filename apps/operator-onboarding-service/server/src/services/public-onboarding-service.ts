import type { Pool } from "pg";
import type { Config } from "../config/index.js";
import { createPublicOnboardingActions } from "@tx-bootstrap/core/server/controllers/public-onboarding-actions.js";
import type { EmailService } from "@tx-bootstrap/core/server/services/email-service.js";

export function createPublicOnboardingService({
  config,
  pool,
  emailService,
}: {
  config: Config;
  pool: Pool;
  emailService: EmailService;
}) {
  return createPublicOnboardingActions({
    pool,
    emailService,
    publicUrl: config.publicUrl,
  });
}

export type PublicOnboardingService = ReturnType<
  typeof createPublicOnboardingService
>;
