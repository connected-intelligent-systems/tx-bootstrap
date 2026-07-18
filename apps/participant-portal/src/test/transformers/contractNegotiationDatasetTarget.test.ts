import { describe, expect, it } from 'vitest'
import { parseContractNegotiationFromJsonLd } from '../../dataProvider/resources/contractNegotiation'

describe('contract negotiation dataset linkage', () => {
  it('retains the dataset target from the negotiation policy', async () => {
    const result = await parseContractNegotiationFromJsonLd({
      '@id': 'neg-1',
      '@type': 'ContractNegotiation',
      type: 'CONSUMER',
      state: 'REQUESTED',
      protocol: 'dataspace-protocol-http',
      counterPartyAddress: 'https://provider.example/dsp',
      counterPartyId: 'provider',
      policy: { target: 'dataset-1' },
      createdAt: 1767225600000,
    })

    expect(result.datasetId).toBe('dataset-1')
  })
})
