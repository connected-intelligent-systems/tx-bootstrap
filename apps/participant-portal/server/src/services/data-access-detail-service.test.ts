import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { config } from '../config/index.js'

const originalEdcConfig = { ...config.edc }

describe('data access detail relations', () => {
  afterEach(() => {
    Object.assign(config.edc, originalEdcConfig)
    vi.unstubAllGlobals()
  })

  it('returns only server-filtered transfer history for a consumer lifecycle', async () => {
    config.edc.managementApiUrl = 'http://controlplane.test/management/'
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
        const path = new URL(String(input)).pathname
        bodies.push(JSON.parse(String(init?.body)))
        const upstream = path.endsWith('/contractnegotiations/request')
          ? [
              {
                '@id': 'negotiation-1',
                type: 'CONSUMER',
                assetId: 'asset-a',
                counterPartyId: 'provider-a',
                contractAgreementId: 'agreement-1',
              },
              { '@id': 'unrelated', type: 'CONSUMER', assetId: 'asset-b', counterPartyId: 'provider-b' },
            ]
          : path.endsWith('/contractagreements/request')
            ? [{ '@id': 'agreement-1', assetId: 'asset-a' }]
            : [
                {
                  '@id': 'transfer-1',
                  state: 'COMPLETED',
                  type: 'CONSUMER',
                  contractId: 'agreement-1',
                  assetId: 'asset-a',
                  updatedAt: '2026-07-11T12:00:00.000Z',
                },
              ]
        return new Response(JSON.stringify(upstream), { status: 200 })
      }),
    )
    const app = createApp()

    try {
      const lifecycleId = encodeURIComponent('provider-a|asset-a')
      const response = await app.inject({
        method: 'GET',
        url: `/api/portal/data-access/${lifecycleId}/transfers?offset=0&limit=10`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        data: [
          expect.objectContaining({
            id: 'transfer-1',
            contractId: 'agreement-1',
            assetId: 'asset-a',
            state: 'COMPLETED',
          }),
        ],
        total: 1,
      })
      expect(bodies[0].filterExpression).toEqual([{ operandLeft: 'type', operator: '=', operandRight: 'CONSUMER' }])
      expect(bodies[1].filterExpression).toEqual([{ operandLeft: 'id', operator: 'in', operandRight: ['agreement-1'] }])
      expect(bodies[2].filterExpression).toEqual([
        { operandLeft: 'contractId', operator: 'in', operandRight: ['agreement-1'] },
      ])
    } finally {
      await app.close()
    }
  })
})
