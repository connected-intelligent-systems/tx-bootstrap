import { describe, expect, it, vi } from 'vitest'
import { dataAccessState, HTTP_PULL, startDataAccess } from '../../services/dataAccessTransfer'
import type { DataAccessLifecycleRecord } from '../../types/dataAccess'
import type { TransferProcess } from '../../types/transferProcess'

const transfer = (state: string, errorDetail?: string) =>
  ({
    id: 'transfer-1',
    state,
    errorDetail,
    transferDirection: 'CONSUMER',
    transferType: HTTP_PULL,
  }) as TransferProcess

describe('data access transfer', () => {
  it('classifies the access transfer', () => {
    expect(dataAccessState(undefined)).toBe('none')
    expect(dataAccessState(transfer('REQUESTED'))).toBe('preparing')
    expect(dataAccessState(transfer('STARTING'))).toBe('preparing')
    expect(dataAccessState(transfer('STARTED'))).toBe('ready')
    expect(dataAccessState(transfer('TERMINATED', '{"reason":["refused"]}'))).toBe('failed')
    expect(dataAccessState(transfer('TERMINATED'))).toBe('none')
    expect(dataAccessState(transfer('COMPLETED'))).toBe('none')
    expect(dataAccessState(transfer('FAILED'))).toBe('failed')
  })

  it('starts an HTTP-pull transfer for the agreement', async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: 'transfer-2' } })
    const lifecycle = {
      id: 'BPNL1|asset-1',
      assetId: 'asset-1',
      providerId: 'BPNL1',
      agreementId: 'agreement-1',
      counterPartyAddress: 'http://provider.test/api/v1/dsp/2025-1',
      protocol: 'dataspace-protocol-http:2025-1',
    } as DataAccessLifecycleRecord

    await expect(startDataAccess({ create }, lifecycle)).resolves.toEqual({ id: 'transfer-2' })
    expect(create).toHaveBeenCalledWith('transferprocesses', {
      data: {
        counterPartyAddress: 'http://provider.test/api/v1/dsp/2025-1',
        counterPartyId: 'BPNL1',
        protocol: 'dataspace-protocol-http:2025-1',
        contractId: 'agreement-1',
        assetId: 'asset-1',
        transferType: HTTP_PULL,
      },
    })
  })
})
