import {
  parseBooleanEnv,
  parseCsvEnv,
  parseLogLevelEnv,
} from "@tx-bootstrap/core/server/config/env.js";
import { credentialDefinitions } from "@tx-bootstrap/core/server/domain/credential-definitions.js";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  logLevel: parseLogLevelEnv(),
  corsOrigins: parseCsvEnv("OPERATOR_ONBOARDING_SERVICE_ALLOWED_ORIGINS", "*"),
  enableRateLimit: parseBooleanEnv(
    "OPERATOR_ONBOARDING_SERVICE_ENABLE_RATE_LIMIT",
    true,
  ),
  rateLimit: {
    max: Number(process.env.OPERATOR_ONBOARDING_SERVICE_RATE_LIMIT_MAX ?? 60),
    timeWindow:
      process.env.OPERATOR_ONBOARDING_SERVICE_RATE_LIMIT_WINDOW ?? "1 minute",
  },
  database: {
    url:
      process.env.OPERATOR_ONBOARDING_SERVICE_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://registration_svc:registration_svc_password@operator-postgres:5432/dataspace_admin",
  },
  issuer: {
    did:
      process.env.ISSUER_DID ??
      `did:web:${process.env.ISSUER_DID_HOST ?? "issuer-did"}:${
        process.env.BPN_ISSUER ?? "BPNL00000003CRHK"
      }`,
    credentialDefinitions,
  },
  email: {
    enabled: process.env.EMAIL_ENABLED === "true",
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.EMAIL_FROM ?? "noreply@dataspace.example.org",
    fromName: process.env.EMAIL_FROM_NAME ?? "Dataspace Operations",
  },
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:39085",
};

export type Config = typeof config;
