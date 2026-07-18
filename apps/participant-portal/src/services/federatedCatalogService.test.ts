import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFederatedCatalogParticipants, searchFederatedCatalog } from './federatedCatalogService'

afterEach(() => vi.restoreAllMocks())

describe('federated catalog service', () => {
  it('performs one bounded search request with application filters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, offset: 20, limit: 20 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      searchFederatedCatalog({
        q: 'mobility',
        participantBpn: 'BPNL1',
        theme: 'Geospatial',
        contentType: 'application/json',
        offset: 20,
        limit: 20,
      }),
    ).resolves.toMatchObject({ total: 0, offset: 20 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/federated-catalog/v1/datasets?q=mobility&participantBpn=BPNL1&theme=Geospatial&contentType=application%2Fjson&offset=20&limit=20',
    )
  })

  it('loads crawl status and surfaces gateway errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ state: 'fresh' }] }), { status: 200 }),
    )
    await expect(getFederatedCatalogParticipants()).resolves.toHaveLength(1)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'catalog unavailable' }), { status: 503 }),
    )
    await expect(getFederatedCatalogParticipants()).rejects.toThrow('catalog unavailable')
  })
})
