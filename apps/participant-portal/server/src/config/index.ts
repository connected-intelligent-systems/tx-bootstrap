import { join } from 'node:path'
import { parseBooleanEnv, parseLogLevelEnv } from '@tx-bootstrap/core/server/config/env.js'
import type { OnboardingInput } from '../types.js'

const allowInsecureAuth = process.env.PARTICIPANT_PORTAL_ALLOW_INSECURE_AUTH === 'true'

export const config = {
  port: Number(process.env.PORT ?? 3000),
  logLevel: parseLogLevelEnv('LOG_LEVEL', process.env.NODE_ENV === 'test' ? 'fatal' : 'info'),
  enableHttpsHeaders: parseBooleanEnv('PARTICIPANT_PORTAL_HTTPS_HEADERS', process.env.NODE_ENV === 'production'),
  enableRateLimit: parseBooleanEnv('PARTICIPANT_PORTAL_ENABLE_RATE_LIMIT', true),
  rateLimit: {
    max: positiveIntegerEnv('PARTICIPANT_PORTAL_RATE_LIMIT_MAX', 300),
    timeWindow: process.env.PARTICIPANT_PORTAL_RATE_LIMIT_WINDOW ?? '1 minute',
  },
  upstreamRequestTimeoutMs: positiveIntegerEnv('PARTICIPANT_PORTAL_UPSTREAM_TIMEOUT_MS', 10_000),
  databaseUrl: process.env.DATABASE_URL ?? buildDatabaseUrl(),
  dataspaceAdminApiUrl: trimTrailingSlash(
    process.env.ONBOARDING_DATASPACE_ADMIN_API_URL ??
      process.env.DATASPACE_ADMIN_API_URL ??
      'http://operator-onboarding-service:3000/api',
  ),
  edc: {
    managementApiUrl: ensureTrailingSlash(process.env.EDC_MANAGEMENT_API_URL ?? 'http://controlplane:8081/management/'),
    apiKey: process.env.EDC_API_KEY ?? 'password',
  },
  federatedCatalog: {
    apiUrl: ensureTrailingSlash(process.env.FEDERATED_CATALOG_API_URL ?? 'http://federated-catalog:8000/'),
    apiKey: process.env.FEDERATED_CATALOG_API_KEY ?? '',
  },
  auth: {
    mode: parseAuthMode(process.env.PARTICIPANT_PORTAL_AUTH_MODE, {
      production: process.env.NODE_ENV === 'production',
      allowInsecure: allowInsecureAuth,
    }),
    header: (process.env.PARTICIPANT_PORTAL_AUTH_HEADER ?? 'x-forwarded-user').toLowerCase(),
    allowedUsers: (process.env.PARTICIPANT_PORTAL_AUTH_ALLOWED_USERS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  },
  identityHub: {
    identityApiUrl: trimTrailingSlash(
      process.env.IDENTITYHUB_IDENTITY_API_URL ?? 'http://identityhub:8082/api/identity',
    ),
    participantContextId: process.env.IDENTITYHUB_PARTICIPANT_CONTEXT_ID ?? process.env.PARTICIPANT_BPN ?? '',
    participantContextPathId: process.env.IDENTITYHUB_PARTICIPANT_CONTEXT_PATH_ID ?? '',
    apiKey: process.env.IDENTITYHUB_API_KEY ?? '',
    vaultUrl: trimTrailingSlash(process.env.IDENTITYHUB_VAULT_URL ?? ''),
    vaultToken: process.env.IDENTITYHUB_VAULT_TOKEN ?? '',
    apiKeyVaultPath: process.env.IDENTITYHUB_API_KEY_VAULT_PATH ?? '/v1/secret/data/super-user-apikey',
  },
  staticDir: process.env.PORTAL_STATIC_DIR ?? join(process.cwd(), 'dist'),
  portalStaticDir: process.env.PORTAL_APP_STATIC_DIR ?? process.env.PORTAL_STATIC_DIR ?? join(process.cwd(), 'dist'),
  publicConfig: {
    title: process.env.PORTAL_TITLE ?? 'Participant Portal',
    participantPortalName: process.env.PARTICIPANT_PORTAL_NAME ?? process.env.PORTAL_TITLE ?? 'Participant Portal',
  },
  stateId: 'default',
  onboardingRegistrationToken: process.env.ONBOARDING_REGISTRATION_TOKEN ?? '',
}

export type Config = typeof config

export function onboardingDefaults(): OnboardingInput {
  return {
    organizationName: process.env.ONBOARDING_ORGANIZATION_NAME ?? '',
    requestedBpn: process.env.ONBOARDING_REQUESTED_BPN ?? process.env.PARTICIPANT_BPN ?? '',
    did: process.env.ONBOARDING_DID ?? '',
    dspEndpoint: process.env.ONBOARDING_DSP_ENDPOINT ?? '',
    identityHubCredentialServiceEndpoint: process.env.ONBOARDING_CREDENTIAL_SERVICE_ENDPOINT ?? '',
    contactEmail: process.env.ONBOARDING_CONTACT_EMAIL ?? '',
    requestedRole: process.env.ONBOARDING_REQUESTED_ROLE ?? 'participant',
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function ensureTrailingSlash(value: string): string {
  return trimTrailingSlash(value) + '/'
}

function buildDatabaseUrl(): string {
  const user = process.env.POSTGRES_USER ?? 'user'
  const password = process.env.POSTGRES_PASSWORD ?? 'password'
  return (
    'postgresql://' +
    encodeURIComponent(user) +
    ':' +
    encodeURIComponent(password) +
    '@postgres:5432/participant_onboarding'
  )
}

export function parseAuthMode(
  value: string | undefined,
  options: { production?: boolean; allowInsecure?: boolean } = {},
): 'none' | 'forwarded-header' {
  const mode = value?.toLowerCase() || (options.production ? 'forwarded-header' : 'none')
  if (mode === 'none') {
    if (options.production && !options.allowInsecure) {
      throw new Error(
        'PARTICIPANT_PORTAL_AUTH_MODE=none requires PARTICIPANT_PORTAL_ALLOW_INSECURE_AUTH=true in production',
      )
    }
    return mode
  }
  if (mode === 'forwarded-header') return mode
  throw new Error('PARTICIPANT_PORTAL_AUTH_MODE must be none or forwarded-header')
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isInteger(value) && value > 0 && value <= 300_000 ? value : fallback
}
