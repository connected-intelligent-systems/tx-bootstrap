import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { config } from './config/index.js'
import { attachOnboardingCase, isOnboarded } from './services/onboarding-service.js'
import { buildProxyTargetUrl } from './services/portal-proxy-service.js'

vi.mock('./db/state-repository.js', () => ({
  ensureDb: vi.fn(async () => undefined),
  loadStateRow: vi.fn(async () => null),
}))

vi.mock('./services/onboarding-service.js', () => ({
  attachOnboardingCase: vi.fn(async () => ({ message: 'Operator invite attached.' })),
  isOnboarded: vi.fn(async () => false),
}))

const originalConfig = {
  staticDir: config.staticDir,
  portalStaticDir: config.portalStaticDir,
  edc: { ...config.edc },
  federatedCatalog: { ...config.federatedCatalog },
  publicConfig: { ...config.publicConfig },
  rateLimit: { ...config.rateLimit },
}

const attachOnboardingCaseMock = vi.mocked(attachOnboardingCase)
const isOnboardedMock = vi.mocked(isOnboarded)
let tempRoot = ''

describe('portal gateway runtime', () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'portal-gateway-'))
    const gatewayDir = join(tempRoot, 'gateway')
    const portalDir = join(tempRoot, 'portal')
    await mkdir(join(gatewayDir, 'assets'), { recursive: true })
    await mkdir(join(portalDir, 'assets'), { recursive: true })
    await writeFile(join(gatewayDir, 'index.html'), '<html><body>onboarding app</body></html>')
    await writeFile(join(gatewayDir, 'assets/gateway.js'), 'console.log("gateway")')
    await writeFile(
      join(gatewayDir, 'config.js'),
      `window.config = {
        title: 'Bundled Gateway',
        participantPortalName: 'Bundled Participant Portal',
        publicEdcEndpoint: 'https://bundled.example/api/v1/dsp',
        identityHubApiKey: 'secret-value',
        deploymentLinks: [
          { label: 'Docs', href: 'https://docs.example' },
          { label: 'Broken link' }
        ],
        theme: {
          light: {
            palette: {
              primary: { main: '#123456', contrastText: 7 },
              text: { primary: '#101010' }
            },
            typography: { fontFamily: 'Inter' },
            logo: { src: '/logo.svg', alt: 'Logo', sx: { height: 40 } }
          }
        }
      }`,
    )
    await writeFile(join(portalDir, 'index.html'), '<html><body>portal app</body></html>')
    await writeFile(join(portalDir, 'assets/app.js'), 'console.log("portal")')

    config.staticDir = gatewayDir
    config.portalStaticDir = portalDir
    Object.assign(config.edc, originalConfig.edc)
    Object.assign(config.federatedCatalog, originalConfig.federatedCatalog)
    Object.assign(config.publicConfig, {
      title: 'Env Portal',
      participantPortalName: 'Env Participant Portal',
      publicEdcEndpoint: 'https://participant.example/api/v1/dsp',
    })
    Object.assign(config.rateLimit, originalConfig.rateLimit)
    isOnboardedMock.mockResolvedValue(false)
  })

  afterEach(async () => {
    config.staticDir = originalConfig.staticDir
    config.portalStaticDir = originalConfig.portalStaticDir
    Object.assign(config.edc, originalConfig.edc)
    Object.assign(config.federatedCatalog, originalConfig.federatedCatalog)
    Object.assign(config.publicConfig, originalConfig.publicConfig)
    Object.assign(config.rateLimit, originalConfig.rateLimit)
    vi.clearAllMocks()
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('serves the onboarding app before onboarding completes', async () => {
    isOnboardedMock.mockResolvedValue(false)

    const response = await appRequest('/datasets')

    expect(response.status).toBe(200)
    expect(response.body).toContain('onboarding app')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('serves the embedded portal app after onboarding completes', async () => {
    isOnboardedMock.mockResolvedValue(true)

    const rootResponse = await appRequest('/datasets')
    const assetResponse = await appRequest('/assets/app.js')

    expect(rootResponse.status).toBe(200)
    expect(rootResponse.body).toContain('portal app')
    expect(assetResponse.status).toBe(200)
    expect(assetResponse.body).toBe('console.log("portal")')
    expect(assetResponse.headers.get('cache-control')).toContain('immutable')
  })

  it('serves a sanitized shared runtime config', async () => {
    const response = await appRequest('/config.js')
    const runtimeConfig = parseConfigScript(response.body)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(runtimeConfig).toMatchObject({
      title: 'Env Portal',
      participantPortalName: 'Env Participant Portal',
      publicEdcEndpoint: 'https://participant.example/api/v1/dsp',
      deploymentLinks: [{ label: 'Docs', href: 'https://docs.example' }],
      theme: {
        light: {
          palette: {
            primary: { main: '#123456' },
            text: { primary: '#101010' },
          },
        },
      },
    })
    const theme = runtimeConfig.theme as { light: { palette: { primary: { contrastText?: unknown } } } }
    expect(runtimeConfig.identityHubApiKey).toBeUndefined()
    expect(theme.light.palette.primary.contrastText).toBeUndefined()
  })

  it('serves the local portal userinfo endpoint', async () => {
    const response = await appRequest('/api/portal/userinfo')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(JSON.parse(response.body)).toEqual({
      id: 'local-user',
      fullName: 'Local User',
      authMode: 'none',
      scopeWarning: true,
    })
  })

  it('serves the participant-facing OpenAPI document without authentication', async () => {
    const response = await appRequest('/api/openapi.json')
    const document = JSON.parse(response.body)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(document.info.title).toBe('tx-bootstrap Participant API')
    expect(document.paths['/api/management/v3/assets'].post['x-required-scope']).toBe('assets:write')
    expect(document.paths['/api/federated-catalog/v1/datasets'].get['x-required-scope']).toBe('federated-catalog:read')
    expect(document.paths['/api/management/v3/contractagreements']).toBeUndefined()
  })

  it('rate limits portal requests while leaving health probes available', async () => {
    config.rateLimit.max = 1
    const app = createApp()

    try {
      const first = await app.inject({ method: 'GET', url: '/api/openapi.json' })
      const limited = await app.inject({ method: 'GET', url: '/api/openapi.json' })
      const health = await app.inject({ method: 'GET', url: '/health' })

      expect(first.statusCode).toBe(200)
      expect(limited.statusCode).toBe(429)
      expect(health.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('passes registration tokens to the attach endpoint', async () => {
    const response = await appRequest('/api/onboarding/attach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ registrationToken: 'registration-token' }),
    })

    expect(response.status).toBe(200)
    expect(attachOnboardingCaseMock).toHaveBeenCalledWith({ registrationToken: 'registration-token' })
    expect(JSON.parse(response.body)).toEqual({ message: 'Operator invite attached.' })
  })

  it('builds EDC proxy target URLs with prefix replacement', () => {
    expect(
      buildProxyTargetUrl(
        '/api/management/v3/assets/request?limit=10',
        '/api/management',
        'http://controlplane:8081/management/',
      ).toString(),
    ).toBe('http://controlplane:8081/management/v3/assets/request?limit=10')
  })

  it('proxies EDC API requests with body, query, and API key', async () => {
    const captured: CapturedRequest[] = []
    const upstream = await startUpstream(async (req, body) => {
      captured.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
    })
    config.edc.managementApiUrl = upstream.url + '/management/'
    config.edc.apiKey = 'test-api-key'

    try {
      const response = await appRequest('/api/management/v3/assets?limit=1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=caller',
          'x-api-key': 'caller-api-key',
          'x-forwarded-user': 'caller',
          'proxy-authorization': 'client-secret',
        },
        body: JSON.stringify({ hello: 'world' }),
      })

      expect(response.status).toBe(201)
      expect(response.headers.get('x-upstream')).toBe('ok')
      expect(response.headers.get('proxy-authenticate')).toBeNull()
      expect(JSON.parse(response.body)).toEqual({ ok: true })
      expect(captured).toHaveLength(1)
      expect(captured[0]).toMatchObject({
        method: 'POST',
        url: '/management/v3/assets?limit=1',
        body: JSON.stringify({ hello: 'world' }),
      })
      expect(captured[0].headers['x-api-key']).toBe('test-api-key')
      expect(captured[0].headers['content-type']).toContain('application/json')
      expect(captured[0].headers['proxy-authorization']).toBeUndefined()
      expect(captured[0].headers.cookie).toBeUndefined()
      expect(captured[0].headers['x-forwarded-user']).toBeUndefined()
    } finally {
      await closeServer(upstream.server)
    }
  })

  it('proxies SPARQL text to the private catalog with only the service key', async () => {
    const captured: CapturedRequest[] = []
    const upstream = await startUpstream(async (req, body) => {
      captured.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
    })
    config.federatedCatalog.apiUrl = upstream.url + '/'
    config.federatedCatalog.apiKey = 'catalog-service-key'

    try {
      const query = 'SELECT * WHERE { ?s ?p ?o } LIMIT 10'
      const response = await appRequest('/api/federated-catalog/v1/sparql', {
        method: 'POST',
        headers: {
          'content-type': 'application/sparql-query',
          cookie: 'portal=session',
          'x-api-key': 'caller-key',
        },
        body: query,
      })

      expect(response.status).toBe(201)
      expect(captured[0]).toMatchObject({ method: 'POST', url: '/v1/sparql', body: query })
      expect(captured[0].headers['content-type']).toContain('application/sparql-query')
      expect(captured[0].headers['x-api-key']).toBe('catalog-service-key')
      expect(captured[0].headers.cookie).toBeUndefined()
    } finally {
      await closeServer(upstream.server)
    }
  })

  it('rejects unmapped EDC operations before proxying', async () => {
    const response = await appRequest('/api/management/v3/contractnegotiations/id', { method: 'DELETE' })

    expect(response.status).toBe(404)
    expect(JSON.parse(response.body).error).toContain('not exposed')
  })

  it('marks EDR credential responses as non-cacheable', async () => {
    const upstream = await startUpstream(async () => undefined)
    config.edc.managementApiUrl = upstream.url + '/management/'

    try {
      const response = await appRequest('/api/management/v3/edrs/transfer-1/dataaddress')
      expect(response.status).toBe(201)
      expect(response.headers.get('cache-control')).toBe('no-store')
    } finally {
      await closeServer(upstream.server)
    }
  })
})

interface AppResponse {
  status: number
  headers: Headers
  body: string
}

interface CapturedRequest {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: string
}

async function appRequest(path: string, init?: Parameters<typeof fetch>[1]): Promise<AppResponse> {
  const app = createApp()
  try {
    const response = await app.inject({
      method: init?.method ?? 'GET',
      url: path,
      headers: toRequestHeaders(init?.headers),
      payload: init?.body as string | Buffer | undefined,
    })
    return {
      status: response.statusCode,
      headers: toResponseHeaders(response.headers),
      body: response.payload,
    }
  } finally {
    await app.close()
  }
}

async function startUpstream(onRequest: (req: IncomingMessage, body: string) => Promise<void>) {
  const server = createServer(async (req, res) => {
    const body = await readBody(req)
    await onRequest(req, body)
    res.writeHead(201, {
      'content-type': 'application/json',
      'proxy-authenticate': 'Basic realm="upstream"',
      'x-upstream': 'ok',
    })
    res.end(JSON.stringify({ ok: true }))
  })
  await listen(server)
  const { port } = server.address() as AddressInfo
  return { server, url: `http://127.0.0.1:${port}` }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

function parseConfigScript(source: string): Record<string, unknown> {
  const match = /^window\.config = (.*);\n?$/s.exec(source)
  if (!match) throw new Error('unexpected config script: ' + source)
  return JSON.parse(match[1])
}

function toRequestHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined
  return Object.fromEntries(new Headers(headers).entries())
}

function toResponseHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item)
    } else if (value !== undefined) {
      result.set(key, value)
    }
  }
  return result
}
