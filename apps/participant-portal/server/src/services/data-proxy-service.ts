import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { Transform, type Readable } from 'node:stream'
import { httpError } from '@tx-bootstrap/core/server/http/errors.js'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config/index.js'
import { requireScope } from './auth-service.js'
import { resolveHttpEndpointDataReference, type HttpEndpointDataReference } from './edr-service.js'
import { requestSafeHttpResponse } from './safe-http-request.js'

export const DATA_PROXY_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

const blockedRequestHeaders = new Set([
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'forwarded',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'remote-user',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-auth-request-user',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-forwarded-user',
  'x-real-ip',
])

const blockedResponseHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

type DataProxyParams = { transferProcessId: string; '*': string }
type RequestStats = { bytes: number }

export async function proxyTransferData(
  request: FastifyRequest<{ Params: DataProxyParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const method = request.method.toUpperCase()
  if (!DATA_PROXY_METHODS.includes(method as (typeof DATA_PROXY_METHODS)[number])) {
    return reply
      .header('Allow', DATA_PROXY_METHODS.join(', '))
      .code(405)
      .send({ error: 'HTTP method is not supported' })
  }

  const principal = await requireScope(request, 'data:proxy')
  const startedAt = performance.now()
  const transferProcessId = request.params.transferProcessId
  const timeoutSignal = AbortSignal.timeout(config.dataProxy.timeoutMs)
  const clientAbort = new AbortController()
  const signal = AbortSignal.any([timeoutSignal, clientAbort.signal])
  const abortForDisconnectedClient = () => {
    if (!reply.raw.writableFinished) clientAbort.abort()
  }
  request.raw.once('aborted', abortForDisconnectedClient)
  reply.raw.once('close', abortForDisconnectedClient)

  try {
    const edr = await resolveHttpEndpointDataReference(transferProcessId, { requireAuthorization: true })
    const target = buildDataProxyTarget(edr.endpoint, request.url, transferProcessId)
    const requestStats = { bytes: 0 }
    const body = requestBody(request, method, requestStats)
    let upstream = await sendDataRequest(target, method, request.headers, body, edr.authorization!, signal)

    if (upstream.statusCode === 401 && (method === 'GET' || method === 'HEAD')) {
      upstream.resume()
      const refreshed = await resolveHttpEndpointDataReference(transferProcessId, {
        forceRefresh: true,
        requireAuthorization: true,
      })
      const refreshedTarget = buildDataProxyTarget(refreshed.endpoint, request.url, transferProcessId)
      upstream = await sendDataRequest(
        refreshedTarget,
        method,
        request.headers,
        undefined,
        refreshed.authorization!,
        signal,
      )
      return sendDataResponse(request, reply, upstream, refreshed, refreshedTarget, principal, startedAt, requestStats)
    }

    return sendDataResponse(request, reply, upstream, edr, target, principal, startedAt, requestStats)
  } catch (error) {
    if (timeoutSignal.aborted) throw httpError(504, 'Transfer data endpoint request timed out')
    if (clientAbort.signal.aborted) throw httpError(502, 'Transfer data request was cancelled')
    if (isHttpError(error)) throw error
    throw httpError(502, 'Transfer data endpoint request failed')
  }
}

export function buildDataProxyTarget(endpoint: URL, requestUrl: string, transferProcessId: string): URL {
  const rawPath = requestUrl.split('?', 1)[0]
  const routePrefix = `/api/data/${encodeURIComponent(transferProcessId)}`
  if (rawPath !== routePrefix && !rawPath.startsWith(routePrefix + '/')) {
    throw httpError(400, 'Invalid transfer data proxy path')
  }

  const suffix = rawPath === routePrefix ? '' : rawPath.slice(routePrefix.length + 1)
  const basePath = endpoint.pathname.endsWith('/') ? endpoint.pathname : endpoint.pathname + '/'
  let target: URL
  if (!suffix) {
    target = new URL(endpoint)
  } else {
    const base = new URL(endpoint)
    base.pathname = basePath
    base.search = ''
    base.hash = ''
    target = new URL(suffix, base)
    if (target.origin !== endpoint.origin || !target.pathname.startsWith(basePath)) {
      throw httpError(422, 'Transfer data path escapes the negotiated endpoint')
    }
    for (const [name, value] of endpoint.searchParams) target.searchParams.append(name, value)
  }

  const incoming = new URL(requestUrl, 'http://participant.invalid')
  for (const [name, value] of incoming.searchParams) target.searchParams.append(name, value)
  target.hash = ''
  return target
}

async function sendDataRequest(
  target: URL,
  method: string,
  incomingHeaders: FastifyRequest['headers'],
  body: Readable | undefined,
  authorization: string,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const headers = copyRequestHeaders(incomingHeaders, authorization)
  // Node does not enable chunked framing by default for every body-capable
  // method (notably DELETE). The inbound content length is intentionally not
  // trusted, so streamed bodies need explicit outbound framing.
  if (body) headers['transfer-encoding'] = 'chunked'
  return requestSafeHttpResponse(target, {
    method,
    headers,
    body,
    signal,
    allowedPrivateHosts: config.dataProxy.allowedPrivateHosts,
  })
}

function sendDataResponse(
  request: FastifyRequest<{ Params: DataProxyParams }>,
  reply: FastifyReply,
  upstream: IncomingMessage,
  edr: HttpEndpointDataReference,
  target: URL,
  principal: Awaited<ReturnType<typeof requireScope>>,
  startedAt: number,
  requestStats: RequestStats,
): FastifyReply {
  const status = validStatus(upstream.statusCode) ? upstream.statusCode : 502
  try {
    copyResponseHeaders(reply, upstream.headers, edr.endpoint, target, request.params.transferProcessId)
  } catch (error) {
    upstream.destroy()
    throw error
  }
  reply.header('Cache-Control', 'no-store').code(status)

  let completionLogged = false
  const logCompletion = (responseBytes: number) => {
    if (completionLogged) return
    completionLogged = true
    request.log.info(
      {
        method: request.method,
        transferProcessId: request.params.transferProcessId,
        principalId: principal.id,
        principalKind: principal.kind,
        upstreamStatus: status,
        requestBytes: requestStats.bytes,
        responseBytes,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'Transfer data proxy request completed',
    )
  }

  if (request.method === 'HEAD') {
    upstream.resume()
    logCompletion(0)
    return reply.send()
  }

  let responseBytes = 0
  const countedResponse = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      responseBytes += chunk.byteLength
      callback(null, chunk)
    },
    flush(callback) {
      logCompletion(responseBytes)
      callback()
    },
  })
  countedResponse.once('close', () => logCompletion(responseBytes))
  upstream.once('error', (error) => countedResponse.destroy(error))
  upstream.pipe(countedResponse)
  return reply.send(countedResponse)
}

function requestBody(request: FastifyRequest, method: string, stats: RequestStats): Readable | undefined {
  if (method === 'GET' || method === 'HEAD') return undefined
  const declaredLength = parseContentLength(request.headers['content-length'])
  if (declaredLength !== undefined && declaredLength > config.dataProxy.maxRequestBytes) {
    throw httpError(413, 'Transfer data request body is too large')
  }
  if (request.body === undefined || request.body === null) return undefined
  if (!isReadable(request.body)) throw httpError(400, 'Transfer data request body could not be streamed')

  return request.body.pipe(
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        stats.bytes += chunk.byteLength
        if (stats.bytes > config.dataProxy.maxRequestBytes) {
          callback(httpError(413, 'Transfer data request body is too large'))
        } else {
          callback(null, chunk)
        }
      },
    }),
  )
}

function copyRequestHeaders(headers: FastifyRequest['headers'], authorization: string): IncomingHttpHeaders {
  const copied: IncomingHttpHeaders = {}
  const connectionHeaders = headerTokens(headers.connection)
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase()
    if (
      value === undefined ||
      blockedRequestHeaders.has(lowerName) ||
      connectionHeaders.has(lowerName) ||
      lowerName.startsWith('proxy-') ||
      lowerName.startsWith('x-forwarded-')
    ) {
      continue
    }
    copied[lowerName] = value
  }
  copied.authorization = authorization
  return copied
}

function copyResponseHeaders(
  reply: FastifyReply,
  headers: IncomingHttpHeaders,
  endpoint: URL,
  target: URL,
  transferProcessId: string,
): void {
  const connectionHeaders = headerTokens(headers.connection)
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase()
    if (
      value === undefined ||
      blockedResponseHeaders.has(lowerName) ||
      connectionHeaders.has(lowerName) ||
      lowerName.startsWith('proxy-')
    ) {
      continue
    }
    if (lowerName === 'location') {
      const location = Array.isArray(value) ? value[0] : value
      reply.header(name, rewriteRedirect(location, endpoint, target, transferProcessId))
    } else {
      reply.header(name, value)
    }
  }
}

export function rewriteRedirect(location: string, endpoint: URL, target: URL, transferProcessId: string): string {
  let redirect: URL
  try {
    redirect = new URL(location, target)
  } catch {
    throw httpError(502, 'Transfer data endpoint returned an invalid redirect')
  }
  const basePath = endpoint.pathname.endsWith('/') ? endpoint.pathname : endpoint.pathname + '/'
  const atBase = redirect.pathname === endpoint.pathname
  if (redirect.origin !== endpoint.origin || (!atBase && !redirect.pathname.startsWith(basePath))) {
    throw httpError(502, 'Transfer data endpoint returned an unsafe redirect')
  }
  const suffix = atBase ? '' : redirect.pathname.slice(basePath.length)
  const localBase = `/api/data/${encodeURIComponent(transferProcessId)}`
  return localBase + (suffix ? '/' + suffix : '') + redirect.search + redirect.hash
}

function headerTokens(value: string | string[] | undefined): Set<string> {
  const text = Array.isArray(value) ? value.join(',') : (value ?? '')
  return new Set(
    text
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

function parseContentLength(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function isReadable(value: unknown): value is Readable {
  return typeof value === 'object' && value !== null && 'pipe' in value && typeof value.pipe === 'function'
}

function validStatus(status: number | undefined): status is number {
  return Number.isInteger(status) && Number(status) >= 200 && Number(status) <= 599
}

function isHttpError(error: unknown): error is Error & { status: number } {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
}
