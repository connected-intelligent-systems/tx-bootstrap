import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { pool } from '../db/pool.js'

export const API_CLIENT_SCOPES = [
  'federated-catalog:read',
  'federated-catalog:sparql',
  'catalog:read',
  'assets:read',
  'assets:write',
  'policies:read',
  'policies:write',
  'business-partner-groups:read',
  'business-partner-groups:write',
  'contract-definitions:read',
  'contract-definitions:write',
  'contract-negotiations:read',
  'contract-negotiations:write',
  'contract-agreements:read',
  'contract-agreements:retire',
  'transfers:read',
  'transfers:write',
  'data:proxy',
  'edr:data-address:read',
] as const

export type ApiClientScope = (typeof API_CLIENT_SCOPES)[number]

export interface ApiClient {
  id: string
  name: string
  scopes: ApiClientScope[]
  tokenHint: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

interface ApiClientRow {
  id: string
  name: string
  scopes: string[]
  token_hash: string
  token_hint: string
  expires_at: Date | string | null
  last_used_at: Date | string | null
  revoked_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

interface CreateApiClientInput {
  name: string
  scopes: unknown
  expiresInDays?: number | null
}

interface PatchApiClientInput {
  name?: string
  scopes?: unknown
  expiresAt?: string | null
}

const knownScopes = new Set<string>(API_CLIENT_SCOPES)

export async function listApiClients(): Promise<ApiClient[]> {
  const result = await pool.query<ApiClientRow>(
    `SELECT id, name, scopes, token_hash, token_hint, expires_at, last_used_at, revoked_at, created_at, updated_at
       FROM api_clients ORDER BY lower(name), created_at`,
  )
  return result.rows.map(toApiClient)
}

export async function createApiClient(input: CreateApiClientInput): Promise<{ client: ApiClient; token: string }> {
  const id = randomUUID()
  const name = validateName(input.name)
  const scopes = validateScopes(input.scopes)
  const expiresAt = expiryFromDays(input.expiresInDays)
  const token = generateToken(id)
  const result = await pool.query<ApiClientRow>(
    `INSERT INTO api_clients (id, name, scopes, token_hash, token_hint, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, name, scopes, hashToken(token), tokenHint(token), expiresAt],
  )
  return { client: toApiClient(result.rows[0]), token }
}

export async function patchApiClient(id: string, input: PatchApiClientInput): Promise<ApiClient> {
  const existing = await getRow(id)
  if (!existing) throw httpError(404, 'API client not found')
  const name = input.name === undefined ? existing.name : validateName(input.name)
  const scopes = input.scopes === undefined ? validateScopes(existing.scopes) : validateScopes(input.scopes)
  const expiresAt = input.expiresAt === undefined ? existing.expires_at : parseExpiry(input.expiresAt)
  const result = await pool.query<ApiClientRow>(
    `UPDATE api_clients
        SET name = $2, scopes = $3, expires_at = $4, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, name, scopes, expiresAt],
  )
  return toApiClient(result.rows[0])
}

export async function rotateApiClient(id: string): Promise<{ client: ApiClient; token: string }> {
  const existing = await getRow(id)
  if (!existing) throw httpError(404, 'API client not found')
  if (existing.revoked_at) throw httpError(409, 'Revoked API clients cannot be rotated')
  const token = generateToken(id)
  const result = await pool.query<ApiClientRow>(
    `UPDATE api_clients
        SET token_hash = $2, token_hint = $3, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, hashToken(token), tokenHint(token)],
  )
  return { client: toApiClient(result.rows[0]), token }
}

export async function revokeApiClient(id: string): Promise<void> {
  const result = await pool.query(`UPDATE api_clients SET revoked_at = now(), updated_at = now() WHERE id = $1`, [id])
  if (result.rowCount === 0) throw httpError(404, 'API client not found')
}

export async function authenticateApiClientToken(
  token: string,
): Promise<{ id: string; name: string; scopes: Set<ApiClientScope> } | null> {
  const id = tokenId(token)
  if (!id) return null
  const row = await getRow(id)
  if (!row || row.revoked_at || (row.expires_at && new Date(row.expires_at) <= new Date())) return null
  const expected = Buffer.from(row.token_hash, 'hex')
  const actual = Buffer.from(hashToken(token), 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  void pool.query(`UPDATE api_clients SET last_used_at = now() WHERE id = $1`, [id]).catch(() => undefined)
  return { id: row.id, name: row.name, scopes: new Set(validateScopes(row.scopes)) }
}

async function getRow(id: string): Promise<ApiClientRow | null> {
  const result = await pool.query<ApiClientRow>(`SELECT * FROM api_clients WHERE id = $1`, [id])
  return result.rows[0] ?? null
}

function validateName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw httpError(400, 'Client name must contain between 1 and 120 characters')
  }
  return value.trim()
}

function validateScopes(value: unknown): ApiClientScope[] {
  if (!Array.isArray(value)) throw httpError(400, 'Scopes must be an array')
  const scopes = [...new Set(value)]
  if (scopes.some((scope) => typeof scope !== 'string' || !knownScopes.has(scope))) {
    throw httpError(400, 'One or more API client scopes are unknown')
  }
  return scopes.sort() as ApiClientScope[]
}

function expiryFromDays(value: number | null | undefined): Date | null {
  if (value === null) return null
  const days = value ?? 90
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw httpError(400, 'Expiry must be between 1 and 3650 days or disabled')
  }
  return new Date(Date.now() + days * 86_400_000)
}

function parseExpiry(value: string | null): Date | null {
  if (value === null) return null
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) throw httpError(400, 'Invalid expiry date')
  return date
}

function generateToken(id: string): string {
  return `txb_${id}.${randomBytes(32).toString('base64url')}`
}

function tokenId(token: string): string | null {
  const match = /^txb_([0-9a-f-]{36})\.[A-Za-z0-9_-]{43}$/.exec(token)
  return match?.[1] ?? null
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function tokenHint(token: string): string {
  return `${token.slice(0, 12)}…${token.slice(-4)}`
}

function toApiClient(row: ApiClientRow): ApiClient {
  return {
    id: row.id,
    name: row.name,
    scopes: validateScopes(row.scopes),
    tokenHint: row.token_hint,
    expiresAt: toIso(row.expires_at),
    lastUsedAt: toIso(row.last_used_at),
    revokedAt: toIso(row.revoked_at),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
  }
}

function toIso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null
}

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}
