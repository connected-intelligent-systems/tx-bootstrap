import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchUpstream } from './http-client.js'

describe('participant upstream HTTP client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('turns an upstream deadline into a safe gateway timeout', async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchUpstream('http://controlplane.test/management', {}, { upstreamName: 'EDC', timeoutMs: 5 }),
    ).rejects.toMatchObject({
      status: 504,
      message: 'EDC request timed out',
    })
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('does not hide non-timeout network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('connection refused'))),
    )

    await expect(
      fetchUpstream('http://controlplane.test/management', {}, { upstreamName: 'EDC', timeoutMs: 100 }),
    ).rejects.toThrow('connection refused')
  })
})
