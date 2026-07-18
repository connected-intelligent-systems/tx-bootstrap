import type { FastifyRequest } from 'fastify'
import { config } from '../config/index.js'
import { authenticateApiClientToken, type ApiClientScope } from './api-client-service.js'

export type Principal =
  | { kind: 'admin'; id: string; name: string }
  | { kind: 'api-client'; id: string; name: string; scopes: Set<ApiClientScope> }

export async function resolvePrincipal(request: FastifyRequest): Promise<Principal> {
  const authorization = request.headers.authorization
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization)
    if (match?.[1].startsWith('txb_')) {
      const client = await authenticateApiClientToken(match[1])
      if (!client) throw authorizationError(401, 'Invalid, expired, or revoked API client token')
      return { kind: 'api-client', ...client }
    }
  }
  if (config.auth.mode === 'none') return { kind: 'admin', id: 'local-user', name: 'Local User' }
  const headerValue = request.headers[config.auth.header]
  const user = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (!user || (config.auth.allowedUsers.length > 0 && !config.auth.allowedUsers.includes(user))) {
    throw authorizationError(401, 'Portal authentication required')
  }
  return { kind: 'admin', id: user, name: user }
}

export async function requireAdmin(request: FastifyRequest): Promise<Principal & { kind: 'admin' }> {
  const principal = await resolvePrincipal(request)
  if (principal.kind !== 'admin') throw authorizationError(403, 'Portal administrator access required')
  return principal
}

export async function requireScope(request: FastifyRequest, scope: ApiClientScope): Promise<Principal> {
  const principal = await resolvePrincipal(request)
  if (principal.kind === 'api-client' && !principal.scopes.has(scope)) {
    throw authorizationError(403, `Missing required scope: ${scope}`)
  }
  return principal
}

function authorizationError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}
