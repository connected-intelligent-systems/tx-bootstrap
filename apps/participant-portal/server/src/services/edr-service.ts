import { httpError } from '@tx-bootstrap/core/server/http/errors.js'
import { config } from '../config/index.js'
import { fetchUpstream } from '../lib/http-client.js'

type DataAddress = Record<string, unknown>

export interface HttpEndpointDataReference {
  endpoint: URL
  authorization?: string
}

interface ResolveEdrOptions {
  forceRefresh?: boolean
  requireAuthorization?: boolean
}

export async function resolveHttpEndpointDataReference(
  transferProcessId: string,
  { forceRefresh = false, requireAuthorization = false }: ResolveEdrOptions = {},
): Promise<HttpEndpointDataReference> {
  validateTransferProcessId(transferProcessId)
  const encodedId = encodeURIComponent(transferProcessId)
  const url = new URL(
    forceRefresh ? `v3/edrs/${encodedId}/refresh` : `v3/edrs/${encodedId}/dataaddress`,
    config.edc.managementApiUrl,
  )
  if (!forceRefresh) url.searchParams.set('auto_refresh', 'true')

  const response = await fetchUpstream(
    url,
    {
      method: forceRefresh ? 'POST' : 'GET',
      headers: { accept: 'application/json', 'x-api-key': config.edc.apiKey },
    },
    { upstreamName: 'EDC' },
  )
  if (!response.ok) {
    if (response.status === 404) throw httpError(404, 'Access details are not available for this transfer')
    throw httpError(502, 'Could not resolve transfer access details')
  }

  let dataAddress: DataAddress
  try {
    dataAddress = (await response.json()) as DataAddress
  } catch {
    throw httpError(502, 'EDC returned invalid transfer access details')
  }

  const endpointValue = property(dataAddress, 'endpoint') ?? property(dataAddress, 'baseUrl')
  const authorization = property(dataAddress, 'authorization') ?? property(dataAddress, 'authKey')
  if (!endpointValue) throw httpError(422, 'The transfer does not provide an HTTP endpoint')
  if (requireAuthorization && !authorization) {
    throw httpError(422, 'The transfer does not provide an authorization token')
  }

  let endpoint: URL
  try {
    endpoint = new URL(endpointValue)
  } catch {
    throw httpError(422, 'The transfer does not provide a valid HTTP endpoint')
  }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw httpError(422, 'Only HTTP data endpoints can be accessed')
  }
  if (endpoint.username || endpoint.password) {
    throw httpError(422, 'Transfer endpoints with embedded credentials cannot be accessed')
  }

  return { endpoint, authorization }
}

function property(record: DataAddress, name: string): string | undefined {
  const value =
    record[name] ??
    Object.entries(record).find(
      ([key]) => key.endsWith('/' + name) || key.endsWith('#' + name) || key.endsWith(':' + name),
    )?.[1]
  return typeof value === 'string' && value ? value : undefined
}

function validateTransferProcessId(value: string): void {
  if (!value || value.length > 200 || hasControlCharacter(value)) {
    throw httpError(400, 'Invalid transfer process ID')
  }
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f
  })
}
