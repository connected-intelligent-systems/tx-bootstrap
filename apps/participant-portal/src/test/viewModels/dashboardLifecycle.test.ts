import { describe, expect, it } from 'vitest'
import {
  buildDashboardSummary,
  buildDataAccessLifecycles,
  lifecycleMatchesFilter,
} from '../../services/dataProductViewModels'

const asset = (id: string) => ({ id, title: id, abstract: '' })
const negotiation = (id: string, state: string, datasetId: string) => ({
  id,
  type: 'CONSUMER',
  state,
  datasetId,
  counterPartyId: 'provider-1',
  counterPartyAddress: 'https://provider.example/dsp',
  protocol: 'dataspace-protocol-http',
  createdAt: '2026-01-01T00:00:00.000Z',
})

describe('dashboard and lifecycle projections', () => {
  it('summarizes private products, published products, pending requests, access and failures', () => {
    const summary = buildDashboardSummary(
      [asset('private'), asset('published')] as any,
      [{ id: 'offer', assetsSelector: ['published'] }] as any,
      [negotiation('pending', 'REQUESTED', 'dataset-1'), negotiation('done', 'FINALIZED', 'dataset-2')] as any,
      [{ id: 'agreement-1' }] as any,
      [{ id: 'transfer-1', state: 'FAILED' }] as any,
    )

    expect(summary).toEqual({
      privateProducts: 1,
      publishedProducts: 1,
      pendingRequests: 1,
      activeAccess: 1,
      failedTransfers: 1,
    })
  })

  it('maps agreements and transfers back to one data product lifecycle', () => {
    const lifecycles = buildDataAccessLifecycles(
      [
        {
          ...negotiation('request-1', 'FINALIZED', 'dataset-1'),
          contractAgreementId: 'agreement-1',
        },
      ] as any,
      [{ id: 'agreement-1', assetId: 'dataset-1', providerId: 'provider-1' }] as any,
      [{ id: 'transfer-1', contractId: 'agreement-1', assetId: 'dataset-1', state: 'COMPLETED' }] as any,
    )

    expect(lifecycles).toHaveLength(1)
    expect(lifecycles[0]).toMatchObject({ datasetId: 'dataset-1', status: 'granted' })
    expect(lifecycles[0].agreements).toHaveLength(1)
    expect(lifecycles[0].transfers).toHaveLength(1)
    expect(lifecycleMatchesFilter(lifecycles[0], 'active')).toBe(true)
    expect(lifecycleMatchesFilter(lifecycles[0], 'pending')).toBe(false)
  })

  it('keeps requests without dataset metadata visible', () => {
    const lifecycles = buildDataAccessLifecycles(
      [{ ...negotiation('request-unknown', 'DECLINED', ''), datasetId: undefined }] as any,
      [],
      [],
    )

    expect(lifecycles[0]).toMatchObject({ key: 'provider-1|unknown', datasetId: undefined, status: 'rejected' })
    expect(lifecycleMatchesFilter(lifecycles[0], 'issues')).toBe(true)
  })
})
