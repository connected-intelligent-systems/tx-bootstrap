import { config } from '../config/index.js'
import { fetchJson } from '../lib/http-client.js'
import { getIdentityHubApiKey } from '../services/identityhub-api-key-service.js'
import { httpError } from '@tx-bootstrap/core/server/http/errors.js'

interface IdentityHubFetchOptions {
  method?: string
  body?: unknown
}

export async function identityHubFetch<T = unknown>(path: string, options: IdentityHubFetchOptions = {}): Promise<T> {
  return fetchJson<T>(config.identityHub.identityApiUrl + path, {
    method: options.method ?? 'GET',
    headers: await identityHubHeaders(),
    body: options.body,
    upstreamName: 'IdentityHub',
  })
}

export async function assertIdentityHubConfigured(): Promise<void> {
  const missing = []
  if (!config.identityHub.identityApiUrl) missing.push('IDENTITYHUB_IDENTITY_API_URL')
  if (!config.identityHub.participantContextId) missing.push('IDENTITYHUB_PARTICIPANT_CONTEXT_ID')
  if (!(await getIdentityHubApiKey())) missing.push('participant IdentityHub API key')
  if (missing.length) {
    throw httpError(
      500,
      'Participant IdentityHub proxy is not configured: ' +
        missing.join(', ') +
        '. Initialize the participant IdentityHub context before requesting credentials.',
    )
  }
}

export function getIdentityHubParticipantContextPathId(): string {
  return (
    config.identityHub.participantContextPathId ||
    Buffer.from(config.identityHub.participantContextId).toString('base64')
  )
}

async function identityHubHeaders(): Promise<Record<string, string>> {
  const apiKey = await getIdentityHubApiKey()
  return apiKey ? { 'x-api-key': apiKey } : {}
}
