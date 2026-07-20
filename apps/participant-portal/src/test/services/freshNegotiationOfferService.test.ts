import { describe, expect, it, vi } from 'vitest'
import { getFreshNegotiationPolicy } from '../../services/freshNegotiationOfferService'

const selectedPolicy = {
  id: 'cached-offer-id',
  type: 'odrl:Offer',
  permissions: [{ action: 'use', constraints: [] }],
  prohibitions: [],
  obligations: [],
  raw: { '@id': 'cached-offer-id' },
}

describe('fresh negotiation offer selection', () => {
  it('loads a fresh dataset offer and selects the policy with the reviewed terms', async () => {
    const freshPolicy = {
      ...selectedPolicy,
      id: 'fresh-offer-id',
      raw: { '@id': 'fresh-offer-id' },
    }
    const getOne = vi.fn().mockResolvedValue({ data: { id: 'asset-1', policies: [freshPolicy] } })

    const result = await getFreshNegotiationPolicy(
      { getOne },
      {
        counterPartyAddress: 'https://provider.example/api/v1/dsp',
        counterPartyId: 'did:web:provider.example:BPNL1',
        datasetId: 'asset-1',
        selectedPolicy,
      },
    )

    expect(result).toBe(freshPolicy)
    expect(getOne).toHaveBeenCalledWith('datasets', {
      id: `${btoa('https://provider.example/api/v1/dsp')}--asset-1`,
      meta: { counterPartyId: 'did:web:provider.example:BPNL1' },
    })
  })

  it('rejects changed terms instead of silently negotiating a different policy', async () => {
    const getOne = vi.fn().mockResolvedValue({
      data: {
        id: 'asset-1',
        policies: [
          {
            ...selectedPolicy,
            permissions: [
              {
                action: 'use',
                constraints: [{ leftOperand: 'Membership', operator: 'eq', rightOperand: 'active' }],
              },
            ],
          },
        ],
      },
    })

    await expect(
      getFreshNegotiationPolicy(
        { getOne },
        {
          counterPartyAddress: 'https://provider.example/api/v1/dsp',
          datasetId: 'asset-1',
          selectedPolicy,
        },
      ),
    ).rejects.toThrow('The selected offer changed')
  })
})
