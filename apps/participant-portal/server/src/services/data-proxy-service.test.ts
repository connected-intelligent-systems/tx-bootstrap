import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { config } from '../config/index.js'
import { buildDataProxyTarget, rewriteRedirect } from './data-proxy-service.js'

vi.mock('../db/state-repository.js', () => ({
  ensureDb: vi.fn(async () => undefined),
  loadStateRow: vi.fn(async () => null),
}))

vi.mock('./onboarding-service.js', () => ({
  attachOnboardingCase: vi.fn(),
  isOnboarded: vi.fn(async () => false),
}))

const originalConfig = {
  edc: { ...config.edc },
  dataProxy: { ...config.dataProxy, allowedPrivateHosts: [...config.dataProxy.allowedPrivateHosts] },
  auth: { ...config.auth, allowedUsers: [...config.auth.allowedUsers] },
}

describe('participant transfer data proxy', () => {
  beforeEach(() => {
    config.auth.mode = 'none'
    config.dataProxy.allowedPrivateHosts = ['127.0.0.1']
    config.dataProxy.timeoutMs = 5_000
    config.dataProxy.maxRequestBytes = 50 * 1024 * 1024
  })

  afterEach(() => {
    Object.assign(config.edc, originalConfig.edc)
    Object.assign(config.dataProxy, originalConfig.dataProxy, {
      allowedPrivateHosts: [...originalConfig.dataProxy.allowedPrivateHosts],
    })
    Object.assign(config.auth, originalConfig.auth, { allowedUsers: [...originalConfig.auth.allowedUsers] })
    vi.clearAllMocks()
  })

  it('proxies a streamed REST request with path, query, body, and safe headers', async () => {
    const captured: CapturedRequest[] = []
    const provider = await startServer(async (request, reply) => {
      captured.push({
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: await readBody(request),
      })
      reply.writeHead(202, {
        'content-type': 'application/json',
        'x-provider': 'yes',
        'set-cookie': 'provider=session',
      })
      reply.end('{"accepted":true}')
    })
    const edc = await startEdrServer(() => ({
      endpoint: `${provider.url}/api/public?fixed=one`,
      authorization: 'Bearer edr-secret',
    }))
    config.edc.managementApiUrl = `${edc.url}/management/`

    try {
      const app = createApp()
      const response = await app.inject({
        method: 'POST',
        url: '/api/data/transfer-1/orders/42?expand=true',
        headers: {
          authorization: 'Bearer local-application-token',
          'content-type': 'application/vnd.example+json',
          cookie: 'local=session',
          'x-custom-header': 'preserved',
          'x-forwarded-user': 'spoofed',
        },
        payload: '{"status":"ready"}',
      })
      await app.close()

      expect(response.statusCode).toBe(202)
      expect(response.payload).toBe('{"accepted":true}')
      expect(response.headers['x-provider']).toBe('yes')
      expect(response.headers['set-cookie']).toBeUndefined()
      expect(response.headers['cache-control']).toBe('no-store')
      expect(captured).toHaveLength(1)
      expect(captured[0]).toMatchObject({
        method: 'POST',
        url: '/api/public/orders/42?fixed=one&expand=true',
        body: '{"status":"ready"}',
      })
      expect(captured[0].headers.authorization).toBe('Bearer edr-secret')
      expect(captured[0].headers['content-type']).toBe('application/vnd.example+json')
      expect(captured[0].headers['x-custom-header']).toBe('preserved')
      expect(captured[0].headers.cookie).toBeUndefined()
      expect(captured[0].headers['x-forwarded-user']).toBeUndefined()
    } finally {
      await closeServer(edc.server)
      await closeServer(provider.server)
    }
  })

  it('preserves all six supported HTTP methods at root and nested paths', async () => {
    const captured: CapturedRequest[] = []
    const provider = await startServer(async (request, reply) => {
      captured.push({
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: await readBody(request),
      })
      reply.writeHead(200, { 'x-provider-method': request.method ?? '' }).end(request.method)
    })
    const edc = await startEdrServer(() => ({
      endpoint: `${provider.url}/public`,
      authorization: 'Bearer token',
    }))
    config.edc.managementApiUrl = `${edc.url}/management/`

    try {
      const app = createApp()
      const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
      for (const [index, method] of methods.entries()) {
        const hasBody = method !== 'GET' && method !== 'HEAD'
        const response = await app.inject({
          method,
          url: index === 0 ? '/api/data/transfer-1' : `/api/data/transfer-1/items/${index}`,
          ...(hasBody
            ? {
                headers: { 'content-type': 'application/octet-stream' },
                payload: method,
              }
            : {}),
        })
        expect(response.statusCode).toBe(200)
        expect(response.headers['x-provider-method']).toBe(method)
        expect(response.payload).toBe(method === 'HEAD' ? '' : method)
      }
      await app.close()

      expect(captured.map(({ method }) => method)).toEqual(methods)
      expect(captured[0].url).toBe('/public')
      expect(captured[1].url).toBe('/public/items/1')
      expect(captured.slice(2).map(({ body }) => body)).toEqual(['POST', 'PUT', 'PATCH', 'DELETE'])
    } finally {
      await closeServer(edc.server)
      await closeServer(provider.server)
    }
  })

  it('refreshes and retries one failed GET with the new EDR token', async () => {
    const authorizations: Array<string | undefined> = []
    const provider = await startServer(async (request, reply) => {
      authorizations.push(request.headers.authorization)
      if (request.headers.authorization === 'Bearer stale') {
        reply.writeHead(401).end('expired')
      } else {
        reply.writeHead(200, { 'content-type': 'text/plain' }).end('fresh data')
      }
    })
    let refreshes = 0
    const edc = await startEdrServer((_request, forceRefresh) => {
      if (forceRefresh) refreshes += 1
      return {
        endpoint: `${provider.url}/public`,
        authorization: forceRefresh ? 'Bearer fresh' : 'Bearer stale',
      }
    })
    config.edc.managementApiUrl = `${edc.url}/management/`

    try {
      const app = createApp()
      const response = await app.inject({ method: 'GET', url: '/api/data/transfer-1/resource' })
      await app.close()

      expect(response.statusCode).toBe(200)
      expect(response.payload).toBe('fresh data')
      expect(authorizations).toEqual(['Bearer stale', 'Bearer fresh'])
      expect(refreshes).toBe(1)
    } finally {
      await closeServer(edc.server)
      await closeServer(provider.server)
    }
  })

  it('does not retry a mutating request after an upstream 401', async () => {
    let providerRequests = 0
    const provider = await startServer(async (request, reply) => {
      providerRequests += 1
      await readBody(request)
      reply.writeHead(401).end('not authorized')
    })
    let refreshes = 0
    const edc = await startEdrServer((_request, forceRefresh) => {
      if (forceRefresh) refreshes += 1
      return { endpoint: `${provider.url}/public`, authorization: 'Bearer token' }
    })
    config.edc.managementApiUrl = `${edc.url}/management/`

    try {
      const app = createApp()
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/data/transfer-1/resource',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      })
      await app.close()

      expect(response.statusCode).toBe(401)
      expect(providerRequests).toBe(1)
      expect(refreshes).toBe(0)
    } finally {
      await closeServer(edc.server)
      await closeServer(provider.server)
    }
  })

  it('rejects unsupported methods and oversized request bodies', async () => {
    const edc = await startEdrServer(() => ({
      endpoint: 'https://provider.example/public',
      authorization: 'Bearer token',
    }))
    config.edc.managementApiUrl = `${edc.url}/management/`
    config.dataProxy.maxRequestBytes = 3

    try {
      const app = createApp()
      const unsupported = await app.inject({ method: 'OPTIONS', url: '/api/data/transfer-1' })
      const oversized = await app.inject({
        method: 'POST',
        url: '/api/data/transfer-1',
        headers: { 'content-type': 'text/plain' },
        payload: 'four',
      })
      await app.close()

      expect(unsupported.statusCode).toBe(405)
      expect(unsupported.headers.allow).toContain('GET')
      expect(oversized.statusCode).toBe(413)
    } finally {
      await closeServer(edc.server)
    }
  })

  it('returns a gateway timeout when the provider does not respond in time', async () => {
    const provider = await startServer(async (_request, reply) => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (!reply.destroyed) reply.writeHead(200).end('late')
    })
    const edc = await startEdrServer(() => ({
      endpoint: `${provider.url}/public`,
      authorization: 'Bearer token',
    }))
    config.edc.managementApiUrl = `${edc.url}/management/`
    config.dataProxy.timeoutMs = 20

    try {
      const app = createApp()
      const response = await app.inject({ method: 'GET', url: '/api/data/transfer-1' })
      await app.close()

      expect(response.statusCode).toBe(504)
    } finally {
      await closeServer(edc.server)
      await closeServer(provider.server)
    }
  })

  it('prevents path escape and rewrites only redirects inside the EDR base path', () => {
    const endpoint = new URL('https://provider.example/api/public')

    expect(() => buildDataProxyTarget(endpoint, '/api/data/transfer-1/%2e%2e/token', 'transfer-1')).toThrow(
      'escapes the negotiated endpoint',
    )
    expect(
      rewriteRedirect(
        '/api/public/orders/2?view=full',
        endpoint,
        new URL('https://provider.example/api/public/orders/1'),
        'transfer-1',
      ),
    ).toBe('/api/data/transfer-1/orders/2?view=full')
    expect(() => rewriteRedirect('https://attacker.example/data', endpoint, endpoint, 'transfer-1')).toThrow(
      'unsafe redirect',
    )
  })
})

interface CapturedRequest {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: string
}

async function startEdrServer(
  address: (request: IncomingMessage, forceRefresh: boolean) => { endpoint: string; authorization: string },
) {
  return startServer(async (request, reply) => {
    const forceRefresh = request.method === 'POST' && request.url?.endsWith('/refresh') === true
    if (!forceRefresh && !request.url?.includes('/dataaddress?auto_refresh=true')) {
      reply.writeHead(404).end()
      return
    }
    reply.writeHead(200, { 'content-type': 'application/json' })
    reply.end(JSON.stringify(address(request, forceRefresh)))
  })
}

async function startServer(handler: (request: IncomingMessage, reply: ServerResponse) => Promise<void>) {
  const server = createServer((request, reply) => {
    void handler(request, reply).catch((error) => {
      reply.writeHead(500).end(String(error))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const { port } = server.address() as AddressInfo
  return { server, url: `http://127.0.0.1:${port}` }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
