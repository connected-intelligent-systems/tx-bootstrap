import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogConnectionService, mapNetworkParticipants } from './catalogConnectionService'

describe('catalog connection service', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('maps participants to read-only network catalog connections', () => {
    expect(
      mapNetworkParticipants([
        { name: 'Provider', bpn: 'BPNLPROVIDER0001', did: 'did:web:provider', dspEndpoint: 'https://provider/dsp' },
      ]),
    ).toEqual([
      {
        id: 'network:BPNLPROVIDER0001',
        url: 'https://provider/dsp',
        counterPartyId: 'did:web:provider',
        participantBpn: 'BPNLPROVIDER0001',
        name: 'Provider',
        description: '',
        isActive: false,
        source: 'network',
      },
    ])
  })

  it('returns no connections and records a warning when the directory is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('directory offline')))
    CatalogConnectionService.invalidate()

    await expect(CatalogConnectionService.getCatalogs(true)).resolves.toEqual([])
    expect(CatalogConnectionService.getDirectoryError()).toBe('directory offline')
  })
})
