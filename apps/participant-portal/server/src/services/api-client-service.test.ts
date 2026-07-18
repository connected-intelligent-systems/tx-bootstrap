import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pool } from '../db/pool.js'
import { authenticateApiClientToken, createApiClient } from './api-client-service.js'

vi.mock('../db/pool.js', () => ({ pool: { query: vi.fn() } }))

const queryMock = vi.mocked(pool.query)

afterEach(() => vi.clearAllMocks())

describe('API client tokens', () => {
  it('returns the complete 256-bit token once and persists only its hash', async () => {
    queryMock.mockImplementationOnce(async (_query, values) => {
      const parameters = values as unknown[]
      return result(
        row({
          id: String(parameters[0]),
          name: String(parameters[1]),
          scopes: parameters[2] as string[],
          token_hash: String(parameters[3]),
          token_hint: String(parameters[4]),
          expires_at: parameters[5] as Date,
        }),
      )
    })

    const created = await createApiClient({ name: 'Consumer app', scopes: ['federated-catalog:read'] })

    expect(created.token).toMatch(/^txb_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/)
    const parameters = queryMock.mock.calls[0][1] as unknown[]
    expect(parameters[3]).toBe(createHash('sha256').update(created.token).digest('hex'))
    expect(String(parameters)).not.toContain(created.token)
    expect(created.client.tokenHint).not.toBe(created.token)
  })

  it('authenticates active tokens and rejects revoked tokens', async () => {
    const token = `txb_00000000-0000-0000-0000-000000000001.${'a'.repeat(43)}`
    queryMock
      .mockResolvedValueOnce(
        result(
          row({
            id: '00000000-0000-0000-0000-000000000001',
            token_hash: createHash('sha256').update(token).digest('hex'),
            scopes: ['assets:read'],
          }),
        ),
      )
      .mockResolvedValueOnce(result())

    await expect(authenticateApiClientToken(token)).resolves.toMatchObject({
      id: '00000000-0000-0000-0000-000000000001',
    })

    queryMock.mockResolvedValueOnce(result(row({ revoked_at: new Date() })))
    await expect(authenticateApiClientToken(token)).resolves.toBeNull()
  })
})

function row(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-17T12:00:00Z')
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Client',
    scopes: ['assets:read'],
    token_hash: '0'.repeat(64),
    token_hint: 'txb_hint…aaaa',
    expires_at: null,
    last_used_at: null,
    revoked_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function result(rowValue?: ReturnType<typeof row>) {
  return { rows: rowValue ? [rowValue] : [], rowCount: rowValue ? 1 : 0 } as never
}
