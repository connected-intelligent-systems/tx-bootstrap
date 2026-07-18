import { config } from '../config/index.js'
import { fetchJson } from '../lib/http-client.js'

interface DataspaceFetchOptions {
  method?: string
  token?: string | null
  body?: unknown
}

export function dataspaceFetch<T = unknown>(path: string, options: DataspaceFetchOptions = {}): Promise<T> {
  return fetchJson<T>(config.dataspaceAdminApiUrl + path, {
    method: options.method ?? 'GET',
    headers: participantHeaders(options.token),
    body: options.body,
    upstreamName: 'dataspace-admin',
  })
}

function participantHeaders(token?: string | null): Record<string, string> {
  return token ? { 'x-participant-token': token } : {}
}
