import { afterEach, describe, expect, it, vi } from 'vitest'
import { create } from '../../dataProvider/resources/contractNegotiation/resource'
import { clearDspParamsCache, DSP_0_8, DSP_2025_1 } from '../../services/dspProtocolService'

const providerDid = 'did:web:provider.test:BPNL00000003AYRE'

function stubConnector(protocol: string) {
  const fetchMock = vi.fn(async (url: unknown, ..._args: unknown[]) =>
    String(url).endsWith('/dspversionparams')
      ? new Response(
          JSON.stringify({
            counterPartyAddress: `http://provider.test/api/v1/dsp${protocol === DSP_2025_1 ? '/2025-1' : ''}`,
            protocol,
          }),
          { status: 200 },
        )
      : new Response(JSON.stringify({}), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const negotiationBody = (fetchMock: ReturnType<typeof stubConnector>) =>
  JSON.parse(
    String(
      (
        fetchMock.mock.calls.find(([url]) => String(url).endsWith('/v3/contractnegotiations'))?.[1] as {
          body?: unknown
        }
      ).body,
    ),
  )

const request = {
  data: {
    counterPartyAddress: 'http://provider.test/api/v1/dsp',
    counterPartyId: providerDid,
    policy: {
      id: 'offer-1',
      type: 'odrl:Offer',
      assigner: 'BPNL00000003AYRE',
      target: 'asset-1',
      raw: { '@id': 'offer-1', '@type': 'odrl:Offer' },
    },
  },
}

describe('Contract negotiation request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearDspParamsCache()
  })

  it('names the provider DID as assigner over DSP 2025-1', async () => {
    const fetchMock = stubConnector(DSP_2025_1)

    await create(request)

    const body = negotiationBody(fetchMock)
    expect(body.protocol).toBe(DSP_2025_1)
    expect(body.policy['odrl:assigner']).toEqual({ '@id': providerDid })
  })

  it('keeps the BPN assigner over DSP 0.8', async () => {
    const fetchMock = stubConnector(DSP_0_8)

    await create(request)

    const body = negotiationBody(fetchMock)
    expect(body.protocol).toBe(DSP_0_8)
    expect(body.policy['odrl:assigner']).toEqual({ '@id': 'BPNL00000003AYRE' })
  })
})
