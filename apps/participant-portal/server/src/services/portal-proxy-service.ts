import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config/index.js'
import { fetchUpstream } from '../lib/http-client.js'
import { requireScope } from './auth-service.js'
import { federatedCatalogScope, managementScope } from './gateway-policy.js'

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const forwardedRequestHeaders = new Set([
  'accept',
  'accept-language',
  'content-language',
  'content-type',
  'traceparent',
  'tracestate',
  'user-agent',
  'x-request-id',
])

interface ProxyRequestInit extends RequestInit {
  duplex?: 'half'
}

interface ProxyOptions {
  sourcePathPrefix: string
  upstreamBaseUrl: string
  upstreamName: string
  extraHeaders?: Record<string, string>
  noStore?: boolean
}

export async function proxyToManagementApi(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
  const scope = managementScope(request.method, request.url)
  if (!scope) throw Object.assign(new Error('EDC operation is not exposed by the participant API'), { status: 404 })
  await requireScope(request, scope)
  return proxyToUpstream(request, reply, {
    sourcePathPrefix: '/api/management',
    upstreamBaseUrl: config.edc.managementApiUrl,
    upstreamName: 'EDC',
    extraHeaders: { 'x-api-key': config.edc.apiKey },
    noStore: scope === 'edr:data-address:read',
  })
}

export async function proxyToFederatedCatalog(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
  const scope = federatedCatalogScope(request.method, request.url)
  if (!scope) throw Object.assign(new Error('Federated catalog operation is not exposed'), { status: 404 })
  await requireScope(request, scope)
  return proxyToUpstream(request, reply, {
    sourcePathPrefix: '/api/federated-catalog',
    upstreamBaseUrl: config.federatedCatalog.apiUrl,
    upstreamName: 'federated catalog',
    extraHeaders: { 'x-api-key': config.federatedCatalog.apiKey },
  })
}

export async function proxyToUpstream(
  request: FastifyRequest,
  reply: FastifyReply,
  options: ProxyOptions,
): Promise<FastifyReply> {
  const target = buildProxyTargetUrl(request.url, options.sourcePathPrefix, options.upstreamBaseUrl)
  const headers = copyRequestHeaders(request, options.extraHeaders)
  const hasBody = !['GET', 'HEAD'].includes(request.method ?? 'GET')
  const requestInit: ProxyRequestInit = {
    method: request.method,
    headers,
    body: hasBody ? buildRequestBody(request.body) : undefined,
    duplex: hasBody ? 'half' : undefined,
  }
  const upstream = await fetchUpstream(target, requestInit, { upstreamName: options.upstreamName })

  upstream.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) reply.header(key, value)
  })
  if (options.noStore) reply.header('Cache-Control', 'no-store')
  reply.code(upstream.status)
  if (!upstream.body) {
    return reply.send()
  }
  return reply.send(Readable.fromWeb(upstream.body as ReadableStream))
}

export function buildProxyTargetUrl(originalUrl: string, sourcePathPrefix: string, upstreamBaseUrl: string): URL {
  const requestUrl = new URL(originalUrl, 'http://localhost')
  const prefix = sourcePathPrefix.replace(/\/+$/, '')
  const pathSuffix = requestUrl.pathname === prefix ? '' : requestUrl.pathname.slice(prefix.length).replace(/^\/+/, '')
  return new URL(pathSuffix + requestUrl.search, ensureTrailingSlash(upstreamBaseUrl))
}

function copyRequestHeaders(request: FastifyRequest, extraHeaders: Record<string, string> = {}): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value || !forwardedRequestHeaders.has(key.toLowerCase())) continue
    if (Array.isArray(value)) headers.set(key, value.join(','))
    else headers.set(key, String(value))
  }
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value)
  }
  return headers
}

function buildRequestBody(body: unknown): RequestInit['body'] | undefined {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return body
  if (Buffer.isBuffer(body)) return body
  if (body instanceof ArrayBuffer) return body
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  if (body instanceof URLSearchParams) return body
  return JSON.stringify(body)
}

function ensureTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '') + '/'
}
