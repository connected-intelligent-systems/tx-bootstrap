import { describe, expect, it } from 'vitest'
import {
  buildDataAccessLifecycles,
  getAccessRequestStatus,
  policySummary,
  toAccessRequest,
} from '../../services/dataProductViewModels'

const negotiation = (state: string, extra: Record<string, any> = {}) => ({
  id: `neg-${state}`,
  type: 'CONSUMER',
  state,
  protocol: 'dataspace-protocol-http',
  counterPartyAddress: 'https://provider.example/dsp',
  counterPartyId: 'provider',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

describe('data product lifecycle view models', () => {
  it('maps connector states to user-facing request states', () => {
    expect(getAccessRequestStatus(negotiation('REQUESTED'))).toBe('request-sent')
    expect(getAccessRequestStatus(negotiation('AGREEING'))).toBe('in-progress')
    expect(getAccessRequestStatus(negotiation('FINALIZED'))).toBe('granted')
    expect(getAccessRequestStatus(negotiation('DECLINED'))).toBe('rejected')
    expect(getAccessRequestStatus(negotiation('TERMINATED'))).toBe('ended')
  })

  it('retains the dataset target on access requests', () => {
    const request = toAccessRequest(negotiation('REQUESTED', { datasetId: 'dataset-1' }))
    expect(request.datasetId).toBe('dataset-1')
    expect(request.providerId).toBe('provider')
  })

  it('groups repeated requests for the same provider and dataset', () => {
    const groups = buildDataAccessLifecycles(
      [
        negotiation('REQUESTED', { datasetId: 'dataset-1' }),
        negotiation('FINALIZED', {
          id: 'neg-finalized',
          datasetId: 'dataset-1',
          contractAgreementId: 'agreement-1',
        }),
        negotiation('REQUESTED', { id: 'neg-2', datasetId: 'dataset-2' }),
      ] as any,
      [],
      [],
    )

    expect(groups.find((group) => group.datasetId === 'dataset-1')?.requests).toHaveLength(2)
    expect(groups.find((group) => group.datasetId === 'dataset-2')?.requests).toHaveLength(1)
  })

  it('renders readable constraint summaries', () => {
    expect(
      policySummary({
        rules: {
          permissions: [
            {
              action: 'use',
              constraints: [
                {
                  leftOperand: 'UsagePurpose',
                  operator: 'isAnyOf',
                  rightOperand: ['cx.core.industrycore:1'],
                },
              ],
            },
          ],
        },
      } as any),
    ).toContain('Usage Purpose: cx.core.industrycore:1')
  })
})
