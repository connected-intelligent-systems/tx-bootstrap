import { afterEach, describe, expect, it, vi } from 'vitest'
import { getManyReference } from '../../dataProvider/resources/dataset/resource'
import { CatalogConnectionService } from '../../services/catalogConnectionService'

describe('network catalog connections', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the directory DSP endpoint and DID for catalog requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            participants: [
              {
                name: 'Provider',
                bpn: 'BPNLPROVIDER0001',
                did: 'did:web:provider',
                dspEndpoint: 'https://provider.test/dsp',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'catalog unavailable' }), { status: 502 }))
    vi.stubGlobal('fetch', fetchMock)
    CatalogConnectionService.invalidate()

    await expect(
      getManyReference({
        id: 'https://provider.test/dsp',
        pagination: { page: 1, perPage: 10 },
        sort: { field: 'title', order: 'ASC' },
        filter: {},
        target: 'catalog',
      } as never),
    ).rejects.toThrow('catalog unavailable')

    const request = fetchMock.mock.calls[1][1] as { body?: unknown }
    expect(JSON.parse(String(request.body))).toMatchObject({
      counterPartyAddress: 'https://provider.test/dsp',
      counterPartyId: 'did:web:provider',
    })
  })
})
