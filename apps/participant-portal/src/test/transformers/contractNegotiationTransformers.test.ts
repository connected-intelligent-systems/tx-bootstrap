import { describe, expect, it } from 'vitest'
import {
  parseContractNegotiationFromJsonLd,
  serializeContractNegotiationToJsonLd,
} from '../../dataProvider/resources/contractNegotiation'

describe('contractNegotiationTransformers', () => {
  const mockJsonLdNegotiation = {
    '@id': 'neg-123',
    '@type': 'ContractNegotiation',
    type: 'CONSUMER',
    state: 'FINALIZED',
    protocol: 'dataspace-protocol-http',
    counterPartyAddress: 'http://some-connector.com/api/v1/ids/data',
    counterPartyId: 'some-connector',
    errorDetail: undefined,
    createdAt: 1672531200000,
    updatedAt: 1672531260000,
  }

  it('should parse contract negotiation from JSON-LD', async () => {
    const result = await parseContractNegotiationFromJsonLd(mockJsonLdNegotiation)

    expect(result.id).toBe('neg-123')
    expect(result.type).toBe('CONSUMER')
    expect(result.state).toBe('FINALIZED')
    expect(result.protocol).toBe('dataspace-protocol-http')
    expect(result.counterPartyAddress).toBe('http://some-connector.com/api/v1/ids/data')
    expect(result.createdAt).toBe('2023-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2023-01-01T00:01:00.000Z')
  })

  it('should serialize compact catalog policy terms to valid JSON-LD ids', async () => {
    const result = await serializeContractNegotiationToJsonLd({
      counterPartyAddress: 'http://provider-controlplane:8084/api/v1/dsp',
      counterPartyId: 'did:web:provider-did:BPNL00000003AYRE',
      policy: {
        id: 'offer-id',
        type: 'odrl:Offer',
        assigner: 'BPNL00000003AYRE',
        target: 'test-asset-1',
        obligations: [],
        prohibitions: [],
        permissions: [
          {
            action: 'use',
            constraints: [
              {
                leftOperand: 'Membership',
                operator: 'eq',
                rightOperand: 'active',
              },
              {
                leftOperand: 'FrameworkAgreement',
                operator: 'eq',
                rightOperand: 'DataExchangeGovernance:1.0',
              },
              {
                leftOperand: 'UsagePurpose',
                operator: 'isAnyOf',
                rightOperand: 'cx.core.industrycore:1',
              },
            ],
          },
        ],
      },
    })

    expect(result.policy.permission[0].constraint).toHaveLength(3)
    expect(result.policy.permission[0].constraint).toEqual([
      {
        '@type': 'odrl:Constraint',
        leftOperand: {
          '@id': 'https://w3id.org/catenax/2025/9/policy/Membership',
        },
        operator: { '@id': 'odrl:eq' },
        rightOperand: 'active',
      },
      {
        '@type': 'odrl:Constraint',
        leftOperand: {
          '@id': 'https://w3id.org/catenax/2025/9/policy/FrameworkAgreement',
        },
        operator: { '@id': 'odrl:eq' },
        rightOperand: 'DataExchangeGovernance:1.0',
      },
      {
        '@type': 'odrl:Constraint',
        leftOperand: {
          '@id': 'https://w3id.org/catenax/2025/9/policy/UsagePurpose',
        },
        operator: { '@id': 'odrl:isAnyOf' },
        rightOperand: 'cx.core.industrycore:1',
      },
    ])
  })

  it('preserves the exact grouped catalog offer when creating a contract request', async () => {
    const rawOffer = {
      '@id': 'offer-id',
      '@type': 'odrl:Offer',
      'odrl:permission': {
        'odrl:action': { '@id': 'odrl:use' },
        'odrl:constraint': {
          'odrl:and': [
            {
              'odrl:leftOperand': {
                '@id': 'https://w3id.org/catenax/2025/9/policy/Membership',
              },
              'odrl:operator': { '@id': 'odrl:eq' },
              'odrl:rightOperand': 'active',
            },
            {
              'odrl:leftOperand': {
                '@id': 'https://w3id.org/catenax/2025/9/policy/UsagePurpose',
              },
              'odrl:operator': { '@id': 'odrl:isAnyOf' },
              'odrl:rightOperand': 'cx.core.industrycore:1',
            },
          ],
        },
      },
      'odrl:prohibition': [],
      'odrl:obligation': [],
    }

    const result = await serializeContractNegotiationToJsonLd({
      counterPartyAddress: 'http://provider-controlplane:8084/api/v1/dsp',
      counterPartyId: 'BPNL00000003AYRE',
      policy: {
        raw: rawOffer,
        assigner: 'BPNL00000003AYRE',
        target: 'test-asset-1',
      },
    })

    expect(result.policy).toMatchObject(rawOffer)
    expect(result.policy['odrl:permission']['odrl:constraint']).toEqual(rawOffer['odrl:permission']['odrl:constraint'])
    expect(result.policy.assigner).toBe('BPNL00000003AYRE')
    expect(result.policy.target).toBe('test-asset-1')
  })
})
