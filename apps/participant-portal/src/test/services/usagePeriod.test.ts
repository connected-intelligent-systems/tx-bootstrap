import { describe, expect, it } from 'vitest'
import { edcErrorReason, passedUsageEndDate } from '../../services/dataProductViewModels'
import { lifecycleStatusTone } from '../../services/dataAccessRoutes'
import { supportsPullAccess } from '../../pages/dataProducts/TransferAccessDetailsDialog'

const offer = (endDate: string) => ({
  id: 'offer-1',
  type: 'odrl:Offer',
  permissions: [
    {
      action: 'use',
      constraints: [
        { leftOperand: 'FrameworkAgreement', operator: 'eq', rightOperand: 'DataExchangeGovernance:1.0' },
        { leftOperand: 'DataUsageEndDate', operator: 'eq', rightOperand: endDate },
      ],
    },
  ],
})

describe('usage period', () => {
  const now = Date.parse('2026-11-13T12:00:00Z')

  it('reports a usage end date that has passed', () => {
    expect(passedUsageEndDate(offer('2020-01-01T00:00:00Z'), now)).toBe('2020-01-01T00:00:00.000Z')
    expect(passedUsageEndDate(offer('2027-01-01T00:00:00Z'), now)).toBeUndefined()
    expect(passedUsageEndDate(undefined, now)).toBeUndefined()
  })

  it('shows expired access as ended', () => {
    expect(lifecycleStatusTone('expired')).toBe('ended')
    expect(lifecycleStatusTone('active')).toBe('granted')
  })

  it('reads the reason of an EDC transfer error', () => {
    expect(
      edcErrorReason(
        JSON.stringify({
          '@type': 'TransferError',
          code: '409',
          reason: ['Cannot process TransferRequestMessage because agreement not found or not valid'],
        }),
      ),
    ).toBe('Cannot process TransferRequestMessage because agreement not found or not valid')
    expect(edcErrorReason('plain message')).toBe('plain message')
  })

  it('offers no access details for a terminated transfer', () => {
    const transfer = {
      id: 'transfer-1',
      state: 'TERMINATED',
      stateTimestamp: '',
      transferDirection: 'CONSUMER',
      transferType: 'HttpData-PULL',
    }
    expect(supportsPullAccess(transfer as never)).toBe(false)
    expect(supportsPullAccess({ ...transfer, state: 'STARTED' } as never)).toBe(true)
  })
})
