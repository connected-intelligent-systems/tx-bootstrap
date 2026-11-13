import { afterEach, describe, expect, it, vi } from 'vitest'
import catalog from '../fixtures/dsp-2025-1-catalog.json'
import { getManyReference } from '../../dataProvider/resources/dataset/resource'
import { CatalogConnectionService } from '../../services/catalogConnectionService'
import { clearDspParamsCache } from '../../services/dspProtocolService'

const providerDid = 'did:web:provider-did:BPNL00000003AYRE'

describe('DSP 2025-1 catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearDspParamsCache()
  })

  // Fixture: a catalog response of Tractus-X EDC 0.13 over DSP 2025-1.
  it('parses datasets, offers and the provider DID', async () => {
    const fetchMock = vi.fn(async (url: unknown, ..._args: unknown[]) => {
      const target = String(url)
      if (target.includes('network-participants')) {
        return new Response(
          JSON.stringify({
            participants: [
              {
                name: 'Provider',
                bpn: 'BPNL00000003AYRE',
                did: providerDid,
                dspEndpoint: 'http://provider-did/api/v1/dsp',
              },
            ],
          }),
        )
      }
      if (target.endsWith('/dspversionparams')) {
        return new Response(
          JSON.stringify({
            counterPartyAddress: 'http://provider-did/api/v1/dsp/2025-1',
            protocol: 'dataspace-protocol-http:2025-1',
          }),
        )
      }
      return new Response(JSON.stringify(catalog))
    })
    vi.stubGlobal('fetch', fetchMock)
    CatalogConnectionService.invalidate()

    const result = await getManyReference({
      id: 'http://provider-did/api/v1/dsp',
      pagination: { page: 1, perPage: 10 },
      sort: { field: 'title', order: 'ASC' },
      filter: {},
      target: 'catalog',
    } as never)

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({ participantId: providerDid })
    const offers = (result.data[0] as { policies?: Array<{ id?: string }> }).policies ?? []
    expect(offers.map((offer) => offer.id)).toEqual([
      'dGVzdC1jb250cmFjdC1kZWYtMQ==:dGVzdC1hc3NldC0x:MjhlYjE2ZGQtNGI5Ni00Yzg4LWI0MGYtZWU0ZDJhMzNlNWFh',
    ])
    const catalogRequest = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/catalog/request'))
    expect(JSON.parse(String((catalogRequest?.[1] as { body?: unknown }).body))).toMatchObject({
      counterPartyAddress: 'http://provider-did/api/v1/dsp/2025-1',
      protocol: 'dataspace-protocol-http:2025-1',
    })
  })
})
