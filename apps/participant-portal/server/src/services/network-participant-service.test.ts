import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dataspaceFetch } from '../clients/dataspace-admin-client.js'
import { loadStateRow } from '../db/state-repository.js'
import { getNetworkParticipants } from './network-participant-service.js'

vi.mock('../clients/dataspace-admin-client.js', () => ({ dataspaceFetch: vi.fn() }))
vi.mock('../db/state-repository.js', () => ({ loadStateRow: vi.fn() }))

const dataspaceFetchMock = vi.mocked(dataspaceFetch)
const loadStateRowMock = vi.mocked(loadStateRow)

describe('network participant service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches the public directory and removes the current participant', async () => {
    dataspaceFetchMock.mockResolvedValue({
      participants: [
        { name: 'Consumer', bpn: 'BPNLCONSUMER0001', did: 'did:web:consumer', dspEndpoint: 'https://consumer/dsp' },
        { name: 'Provider', bpn: 'BPNLPROVIDER0001', did: 'did:web:provider', dspEndpoint: 'https://provider/dsp' },
      ],
    })
    loadStateRowMock.mockResolvedValue({ assigned_bpn: 'BPNLCONSUMER0001' } as never)

    await expect(getNetworkParticipants()).resolves.toEqual({
      participants: [
        { name: 'Provider', bpn: 'BPNLPROVIDER0001', did: 'did:web:provider', dspEndpoint: 'https://provider/dsp' },
      ],
    })
    expect(dataspaceFetchMock).toHaveBeenCalledWith('/network/participants')
  })
})
