import { parsePayload } from './objects.js'
import { httpError, upstreamError } from '@tx-bootstrap/core/server/http/errors.js'
import { config } from '../config/index.js'

interface FetchJsonOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  upstreamName: string
  timeoutMs?: number
}

interface FetchUpstreamOptions {
  upstreamName: string
  timeoutMs?: number
}

export async function fetchJson<T = unknown>(
  url: string,
  { method = 'GET', headers = {}, body, upstreamName, timeoutMs }: FetchJsonOptions,
): Promise<T> {
  const response = await fetchUpstream(
    url,
    {
      method,
      headers: {
        Accept: 'application/json',
        ...headers,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { upstreamName, timeoutMs },
  )
  const responseText = await response.text()
  const payload = parsePayload(responseText)

  if (!response.ok) throw upstreamError(response.status, upstreamName, payload, responseText)
  return payload as T
}

export async function fetchUpstream(
  input: string | URL | Request,
  init: RequestInit = {},
  { upstreamName, timeoutMs = config.upstreamRequestTimeoutMs }: FetchUpstreamOptions,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal

  try {
    return await fetch(input, { ...init, signal })
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw httpError(504, `${upstreamName} request timed out`)
    }
    throw error
  }
}
