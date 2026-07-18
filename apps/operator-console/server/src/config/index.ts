import { join } from "node:path";
import {
  parseBooleanEnv,
  parseCsvEnv,
  parseJsonEnv,
  parseLogLevelEnv,
} from "@tx-bootstrap/core/server/config/env.js";
import { base64 } from "@tx-bootstrap/core/server/utils/crypto.js";
import {
  credentialDefinitions,
  holderAttestationId,
  policyClaimsAttestationId,
} from "@tx-bootstrap/core/server/domain/credential-definitions.js";

type ConsoleRuntimeConfig = {
  title?: string;
  subtitle?: string;
  theme?: unknown;
};

const defaultConsoleTitle = "Participant Operations";
const defaultConsoleSubtitle = "Dataspace Administration";

const appRoot = process.env.OPERATOR_CONSOLE_APP_ROOT ?? process.cwd();
const consoleRuntimeConfig = parseJsonEnv<ConsoleRuntimeConfig>(
  "OPERATOR_CONSOLE_CONFIG_JSON",
  {},
);
const issuerContext =
  process.env.ISSUER_CONTEXT ?? process.env.BPN_ISSUER ?? "BPNL00000003CRHK";
const issuerContextPathId =
  process.env.ISSUER_CONTEXT_PATH_ID ?? base64(issuerContext);
const issuerApiKeyAlias =
  process.env.ISSUER_API_KEY_ALIAS ?? `${issuerContext}-apikey`;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  appRoot,
  distRoot: join(appRoot, "dist"),
  console: {
    title:
      process.env.OPERATOR_CONSOLE_TITLE?.trim() ||
      consoleRuntimeConfig.title?.trim() ||
      defaultConsoleTitle,
    subtitle:
      process.env.OPERATOR_CONSOLE_SUBTITLE?.trim() ||
      consoleRuntimeConfig.subtitle?.trim() ||
      defaultConsoleSubtitle,
    theme: parseJsonEnv(
      "OPERATOR_CONSOLE_THEME_JSON",
      consoleRuntimeConfig.theme,
    ),
  },
  corsOrigins: parseCsvEnv(
    "OPERATOR_CONSOLE_ALLOWED_ORIGINS",
    "http://localhost:5173",
  ),
  logLevel: parseLogLevelEnv(),
  enableRateLimit: process.env.ENABLE_RATE_LIMIT !== "false",
  enableHttpsHeaders: parseBooleanEnv(
    "OPERATOR_CONSOLE_HTTPS_HEADERS",
    process.env.NODE_ENV === "production",
  ),
  adminAuth: {
    mode: (process.env.OPERATOR_CONSOLE_AUTH_MODE ?? "api-key").toLowerCase(),
    apiKey: process.env.OPERATOR_CONSOLE_API_KEY ?? "",
    header: (
      process.env.OPERATOR_CONSOLE_AUTH_HEADER ?? "x-forwarded-user"
    ).toLowerCase(),
    allowedUsers: new Set(
      (process.env.OPERATOR_CONSOLE_AUTH_ALLOWED_USERS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  },
  database: {
    url:
      process.env.OPERATOR_CONSOLE_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://operator_console:operator_console_password@operator-postgres:5432/dataspace_admin",
    migrationUrl:
      process.env.OPERATOR_MIGRATOR_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://operator_migrator:operator_migrator_password@operator-postgres:5432/dataspace_admin",
  },
  bdrs: {
    managementUrl:
      process.env.BDRS_MANAGEMENT_URL ??
      "http://bdrs-server:8081/api/management",
    apiKey: process.env.BDRS_API_KEY ?? "password",
  },
  issuer: {
    adminUrl:
      process.env.ISSUER_ADMIN_URL ?? "http://issuerservice:8086/api/admin",
    identityUrl:
      process.env.ISSUER_IDENTITY_URL ??
      "http://issuerservice:8087/api/identity",
    issuanceUrl:
      process.env.ISSUER_ISSUANCE_URL ??
      "http://issuerservice:8082/api/issuance",
    did:
      process.env.ISSUER_DID ??
      `did:web:${process.env.ISSUER_DID_HOST ?? "issuer-did"}:${
        process.env.BPN_ISSUER ?? "BPNL00000003CRHK"
      }`,
    context: issuerContext,
    contextPathId: issuerContextPathId,
    apiKey: process.env.ISSUER_API_KEY ?? "",
    apiKeyAlias: issuerApiKeyAlias,
    apiKeyVaultUrl: process.env.ISSUER_API_KEY_VAULT_URL ?? "",
    apiKeyVaultToken: process.env.ISSUER_API_KEY_VAULT_TOKEN ?? "",
    apiKeyVaultPath:
      process.env.ISSUER_API_KEY_VAULT_PATH ??
      `/v1/secret/data/${issuerApiKeyAlias}`,
    superUserApiKeyVaultPath:
      process.env.ISSUER_SUPERUSER_API_KEY_VAULT_PATH ??
      "/v1/secret/data/super-user-apikey",
    databaseUrl:
      process.env.ISSUER_CLAIMS_DATABASE_URL ??
      process.env.ISSUER_DATABASE_URL ??
      "",
    holderAttestationId,
    policyClaimsAttestationId,
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
