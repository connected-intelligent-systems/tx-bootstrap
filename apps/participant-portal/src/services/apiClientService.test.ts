import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClientRequest } from './apiClientService'

describe('apiClientRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not set a content type for bodyless rotate and revoke mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'txb_rotated' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiClientRequest('/api/portal/api-clients/client-1/rotate', { method: 'POST' })
    await apiClientRequest('/api/portal/api-clients/client-1', { method: 'DELETE' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init.headers)
      expect(headers.get('Accept')).toBe('application/json')
      expect(headers.has('Content-Type')).toBe(false)
    }
  })

  it('sets the JSON content type when a request has a body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'txb_created' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiClientRequest('/api/portal/api-clients', {
      method: 'POST',
      body: JSON.stringify({ name: 'client' }),
    })

    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('Content-Type')).toBe('application/json')
  })
})
