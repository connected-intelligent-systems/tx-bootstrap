import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { config } from '../config/index.js'

const originalEdcConfig = { ...config.edc }

describe('data product related data', () => {
  afterEach(() => {
    Object.assign(config.edc, originalEdcConfig)
    vi.unstubAllGlobals()
  })

  it('filters negotiations by asset on the server before returning a page', async () => {
    config.edc.managementApiUrl = 'http://controlplane.test/management/'
    config.edc.apiKey = 'test-key'
    const upstream = [
      { '@id': 'negotiation-1', assetId: 'asset-a' },
      { '@id': 'negotiation-2', assetId: 'asset-b' },
      { '@id': 'negotiation-3', assetId: 'asset-a' },
    ]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(upstream), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const app = createApp()

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/portal/data-products/asset-a/negotiations?offset=1&limit=1',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ data: [{ '@id': 'negotiation-3', assetId: 'asset-a' }], total: 2 })
      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, request] = fetchMock.mock.calls[0]
      expect(String(url)).toBe('http://controlplane.test/management/v3/contractnegotiations/request')
      expect((request as RequestInit).headers).toMatchObject({ 'x-api-key': 'test-key' })
      expect(JSON.parse(String((request as RequestInit).body))).toMatchObject({ offset: 0, limit: 100 })
    } finally {
      await app.close()
    }
  })
})
