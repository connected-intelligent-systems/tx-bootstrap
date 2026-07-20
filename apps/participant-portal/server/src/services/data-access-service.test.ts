import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { config } from '../config/index.js'

const originalEdcConfig = { ...config.edc }

describe('consumer data access lifecycles', () => {
  afterEach(() => {
    Object.assign(config.edc, originalEdcConfig)
    vi.unstubAllGlobals()
  })

  it('queries and paginates consumer lifecycle data on the server', async () => {
    config.edc.managementApiUrl = 'http://controlplane.test/management/'
    config.edc.apiKey = 'test-key'
    const bodies: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      bodies.push(JSON.parse(String(init?.body)))
      const upstream = path.endsWith('/contractnegotiations/request')
        ? [
            {
              '@id': 'negotiation-1',
              type: 'CONSUMER',
              assetId: 'asset-a',
              counterPartyId: 'provider-a',
              counterPartyAddress: 'http://provider.test/protocol',
              contractAgreementId: 'agreement-1',
              state: 'FINALIZED',
              updatedAt: '2026-07-10T12:00:00.000Z',
            },
            {
              '@id': 'failed-retry',
              type: 'CONSUMER',
              assetId: 'asset-a',
              counterPartyId: 'provider-a',
              counterPartyAddress: 'http://provider.test/protocol',
              state: 'TERMINATED',
              updatedAt: '2026-07-11T13:00:00.000Z',
            },
            { '@id': 'provider-negotiation', type: 'PROVIDER', assetId: 'asset-b', counterPartyId: 'consumer-b' },
          ]
        : path.endsWith('/contractagreements/request')
          ? [
              {
                '@id': 'agreement-1',
                assetId: 'asset-a',
                providerId: 'provider-a',
                contractSigningDate: 1_752_148_800,
              },
            ]
          : path.endsWith('/transferprocesses/request')
            ? [
                {
                  '@id': 'transfer-1',
                  contractId: 'agreement-1',
                  assetId: 'asset-a',
                  state: 'STARTED',
                  updatedAt: '2026-07-11T12:00:00.000Z',
                },
              ]
            : []
      return new Response(JSON.stringify(upstream), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const app = createApp()

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/portal/data-access?status=active&offset=0&limit=10',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        data: [
          expect.objectContaining({
            id: 'provider-a|asset-a',
            assetId: 'asset-a',
            providerId: 'provider-a',
            status: 'active',
            agreementId: 'agreement-1',
            negotiationIds: ['failed-retry', 'negotiation-1'],
            negotiationState: 'TERMINATED',
            requestCount: 2,
            agreementCount: 1,
            transferCount: 1,
            canUseData: true,
          }),
        ],
        total: 1,
      })
      expect(fetchMock).toHaveBeenCalledTimes(4)
      expect(bodies[0]).toMatchObject({
        offset: 0,
        limit: 100,
        filterExpression: [{ operandLeft: 'type', operator: '=', operandRight: 'CONSUMER' }],
      })
      expect(bodies[1]).toMatchObject({
        filterExpression: [{ operandLeft: 'id', operator: 'in', operandRight: ['agreement-1'] }],
      })
      expect(bodies[2]).toMatchObject({
        filterExpression: [{ operandLeft: 'contractId', operator: 'in', operandRight: ['agreement-1'] }],
      })
      expect(bodies[3]).toMatchObject({
        filterExpression: [{ operandLeft: 'agreementId', operator: 'in', operandRight: ['agreement-1'] }],
      })
    } finally {
      await app.close()
    }
  })

  it('resolves a DID-based lifecycle URL to its canonical BPN lifecycle', async () => {
    config.edc.managementApiUrl = 'http://controlplane.test/management/'
    config.edc.apiKey = 'test-key'
    const bodies: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      bodies.push(JSON.parse(String(init?.body)))
      const upstream = path.endsWith('/contractnegotiations/request')
        ? [
            {
              '@id': 'negotiation-1',
              type: 'CONSUMER',
              assetId: 'asset-a',
              counterPartyId: 'BPNL00000003AYRE',
              state: 'REQUESTED',
              updatedAt: '2026-07-20T10:03:35.000Z',
            },
          ]
        : []
      return new Response(JSON.stringify(upstream), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const app = createApp()

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/portal/data-access/did%3Aweb%3Aprovider-did%3ABPNL00000003AYRE%7Casset-a',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        data: expect.objectContaining({
          id: 'BPNL00000003AYRE|asset-a',
          providerId: 'BPNL00000003AYRE',
          assetId: 'asset-a',
          status: 'pending',
        }),
      })
      expect(bodies[0]).toMatchObject({
        filterExpression: [{ operandLeft: 'type', operator: '=', operandRight: 'CONSUMER' }],
      })
    } finally {
      await app.close()
    }
  })
})
