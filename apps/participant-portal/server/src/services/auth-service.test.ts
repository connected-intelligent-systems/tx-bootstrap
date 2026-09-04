import type { FastifyRequest } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { config, parseAuthMode } from '../config/index.js'
import { authenticateApiClientToken } from './api-client-service.js'
import { requireAdmin, requireScope, resolvePrincipal } from './auth-service.js'

vi.mock('./api-client-service.js', () => ({ authenticateApiClientToken: vi.fn() }))

const authenticateMock = vi.mocked(authenticateApiClientToken)
const originalAuth = { ...config.auth, allowedUsers: [...config.auth.allowedUsers] }

afterEach(() => {
  Object.assign(config.auth, originalAuth, { allowedUsers: [...originalAuth.allowedUsers] })
  vi.clearAllMocks()
})

describe('participant portal authentication', () => {
  it('defaults production deployments to forwarded-header authentication', () => {
    expect(parseAuthMode(undefined, { production: true })).toBe('forwarded-header')
  })

  it('requires an explicit acknowledgement for unauthenticated production mode', () => {
    expect(() => parseAuthMode('none', { production: true })).toThrow('PARTICIPANT_PORTAL_ALLOW_INSECURE_AUTH=true')
    expect(parseAuthMode('none', { production: true, allowInsecure: true })).toBe('none')
  })

  it('treats an unauthenticated request as local admin in none mode', async () => {
    config.auth.mode = 'none'
    await expect(resolvePrincipal(request({}))).resolves.toMatchObject({ kind: 'admin', id: 'local-user' })
  })

  it('trusts only configured users in forwarded-header mode', async () => {
    config.auth.mode = 'forwarded-header'
    config.auth.header = 'x-forwarded-user'
    config.auth.allowedUsers = ['alice']

    await expect(
      requireAdmin(request({ 'x-forwarded-user': 'alice', authorization: 'Bearer oauth2-proxy-token' })),
    ).resolves.toMatchObject({ id: 'alice' })
    await expect(requireAdmin(request({ 'x-forwarded-user': 'mallory' }))).rejects.toMatchObject({ status: 401 })
  })

  it('checks bearer scopes before falling back to none mode', async () => {
    config.auth.mode = 'none'
    authenticateMock.mockResolvedValue({ id: 'client', name: 'Client', scopes: new Set(['assets:read']) })
    const clientRequest = request({ authorization: `Bearer txb_${'a'.repeat(36)}.${'b'.repeat(43)}` })

    await expect(requireScope(clientRequest, 'assets:read')).resolves.toMatchObject({ kind: 'api-client' })
    await expect(requireScope(clientRequest, 'assets:write')).rejects.toMatchObject({ status: 403 })
    await expect(requireAdmin(clientRequest)).rejects.toMatchObject({ status: 403 })
  })

  it('enforces the application data proxy scope', async () => {
    config.auth.mode = 'none'
    const clientRequest = request({ authorization: `Bearer txb_${'a'.repeat(36)}.${'b'.repeat(43)}` })
    authenticateMock.mockResolvedValueOnce({ id: 'client', name: 'Client', scopes: new Set(['data:proxy']) })
    await expect(requireScope(clientRequest, 'data:proxy')).resolves.toMatchObject({ kind: 'api-client' })

    authenticateMock.mockResolvedValueOnce({ id: 'client', name: 'Client', scopes: new Set(['transfers:read']) })
    await expect(requireScope(clientRequest, 'data:proxy')).rejects.toMatchObject({ status: 403 })
  })

  it('rejects invalid bearer tokens even when human authentication is disabled', async () => {
    config.auth.mode = 'none'
    authenticateMock.mockResolvedValue(null)
    await expect(resolvePrincipal(request({ authorization: 'Bearer txb_invalid' }))).rejects.toMatchObject({
      status: 401,
    })
  })
})

function request(headers: Record<string, string>): FastifyRequest {
  return { headers } as unknown as FastifyRequest
}
