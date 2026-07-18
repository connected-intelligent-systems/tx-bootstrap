import { describe, expect, it } from 'vitest'
import { dataAccessDetailPath, dataAccessLifecycleId } from '../../services/dataAccessRoutes'

describe('data access routes', () => {
  it('uses the provider and asset identity expected by the lifecycle API', () => {
    expect(dataAccessLifecycleId('BPNL00000003AYRE', 'test-asset-1')).toBe('BPNL00000003AYRE|test-asset-1')
    expect(dataAccessDetailPath('BPNL00000003AYRE', 'test-asset-1')).toBe(
      '/data-access/BPNL00000003AYRE%7Ctest-asset-1',
    )
  })
})
