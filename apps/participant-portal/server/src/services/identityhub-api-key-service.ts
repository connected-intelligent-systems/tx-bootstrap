import { config } from '../config/index.js'
import { fetchUpstream } from '../lib/http-client.js'
import { isRecord, parsePayload } from '../lib/objects.js'
import type { HttpError } from '../types.js'

let cachedIdentityHubApiKey = ''

export async function getIdentityHubApiKey(): Promise<string> {
  if (config.identityHub.apiKey) return config.identityHub.apiKey
  if (cachedIdentityHubApiKey) return cachedIdentityHubApiKey
  if (!config.identityHub.vaultUrl || !config.identityHub.vaultToken) return ''

  try {
    const payload = await fetchVaultSecret(config.identityHub.apiKeyVaultPath)
    const content = isRecord(payload)
      ? (nestedContent(payload, ['data', 'data', 'content']) ??
        nestedContent(payload, ['data', 'content']) ??
        payload.content)
      : ''
    cachedIdentityHubApiKey = typeof content === 'string' ? content : ''
    return cachedIdentityHubApiKey
  } catch (error) {
    if (isHttpStatus(error, 404)) return ''
    throw error
  }
}

async function fetchVaultSecret(secretPath: string): Promise<unknown> {
  const paths = getVaultPathCandidates(secretPath)
  let lastPayload: unknown = null
  let lastStatus = 0
  for (const candidate of paths) {
    const response = await fetchUpstream(
      config.identityHub.vaultUrl + candidate,
      { headers: { 'X-Vault-Token': config.identityHub.vaultToken, Accept: 'application/json' } },
      { upstreamName: 'Vault' },
    )
    const responseText = await response.text()
    const payload = parsePayload(responseText)
    if (response.ok) return payload
    lastPayload = payload
    lastStatus = response.status
  }

  const error = new Error('IdentityHub API key Vault lookup failed with HTTP ' + lastStatus) as HttpError
  error.status = lastStatus === 404 ? 404 : 500
  error.details = lastPayload
  throw error
}

function getVaultPathCandidates(secretPath: string): string[] {
  const candidates = [secretPath]
  if (secretPath.includes('/secret/data/data/')) {
    candidates.push(secretPath.replace('/secret/data/data/', '/secret/data/'))
  } else if (secretPath.includes('/secret/data/')) {
    candidates.push(secretPath.replace('/secret/data/', '/secret/data/data/'))
  }
  return [...new Set(candidates)]
}

function nestedContent(source: Record<string, unknown>, path: string[]): unknown {
  let value: unknown = source
  for (const key of path) {
    if (!isRecord(value)) return undefined
    value = value[key]
  }
  return value
}

function isHttpStatus(error: unknown, status: number): boolean {
  return isRecord(error) && error.status === status
}
