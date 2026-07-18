import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOne } from '../../dataProvider/resources/dataset/resource'

describe('Data access dataset request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the lifecycle counterPartyId when no local catalog entry exists', async () => {
    const fetchMock = vi.fn(
      async (..._args: unknown[]) =>
        new Response(
          JSON.stringify({
            '@context': {
              '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
              dcat: 'http://www.w3.org/ns/dcat#',
            },
            '@id': 'asset-1',
            '@type': 'dcat:Dataset',
            name: 'Dataset one',
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const catalogUrl = 'http://provider.test/api/v1/dsp'

    await getOne({
      id: `${btoa(catalogUrl)}--asset-1`,
      meta: { counterPartyId: 'BPNL00000003AYRE' },
    })

    const request = fetchMock.mock.calls[0][1] as { body?: unknown }
    expect(JSON.parse(String(request.body))).toMatchObject({
      '@id': 'asset-1',
      counterPartyAddress: catalogUrl,
      counterPartyId: 'BPNL00000003AYRE',
    })
  })
})
