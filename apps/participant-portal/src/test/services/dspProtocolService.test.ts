import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearDspParamsCache, DSP_0_8, DSP_2025_1, resolveDspParams } from '../../services/dspProtocolService'

const discovered = () =>
  new Response(
    JSON.stringify({
      counterPartyAddress: 'https://provider.test/api/v1/dsp/2025-1',
      protocol: DSP_2025_1,
      counterPartyId: 'did:web:provider',
    }),
    { status: 200 },
  )

describe('DSP protocol selection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearDspParamsCache()
  })

  it('uses the version found by connector discovery and caches it', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => discovered())
    vi.stubGlobal('fetch', fetchMock)

    const first = await resolveDspParams('https://provider.test/api/v1/dsp', 'did:web:provider')
    const second = await resolveDspParams('https://provider.test/api/v1/dsp', 'did:web:provider')

    expect(first).toEqual({ counterPartyAddress: 'https://provider.test/api/v1/dsp/2025-1', protocol: DSP_2025_1 })
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as { body?: unknown }).body))).toMatchObject({
      counterPartyAddress: 'https://provider.test/api/v1/dsp',
      counterPartyId: 'did:web:provider',
    })
  })

  it('falls back to DSP 0.8 and retries discovery later', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unreachable', { status: 502 }))
      .mockResolvedValueOnce(discovered())
    vi.stubGlobal('fetch', fetchMock)

    expect(await resolveDspParams('https://provider.test/api/v1/dsp', 'did:web:provider')).toEqual({
      counterPartyAddress: 'https://provider.test/api/v1/dsp',
      protocol: DSP_0_8,
    })
    expect((await resolveDspParams('https://provider.test/api/v1/dsp', 'did:web:provider')).protocol).toBe(DSP_2025_1)
  })

  it('keeps an explicit protocol or a versioned address without discovery', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await resolveDspParams('https://provider.test/api/v1/dsp', 'did:web:provider', DSP_0_8)).toEqual({
      counterPartyAddress: 'https://provider.test/api/v1/dsp',
      protocol: DSP_0_8,
    })
    expect((await resolveDspParams('https://provider.test/api/v1/dsp/2025-1')).protocol).toBe(DSP_2025_1)
    expect((await resolveDspParams('https://provider.test/api/v1/dsp')).protocol).toBe(DSP_0_8)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
