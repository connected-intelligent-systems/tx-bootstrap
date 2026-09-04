import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../config/index.js'
import { resolveHttpEndpointDataReference } from './edr-service.js'

describe('EDR service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and auto-refreshes a JSON-LD-prefixed HTTP data address', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          'edc:endpoint': 'https://provider.example/api/public',
          'edc:authorization': 'Bearer edr-token',
        }),
      ),
    )

    const resolved = await resolveHttpEndpointDataReference('transfer/one', { requireAuthorization: true })

    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      new URL('v3/edrs/transfer%2Fone/dataaddress?auto_refresh=true', config.edc.managementApiUrl).toString(),
    )
    expect(resolved).toEqual({
      endpoint: new URL('https://provider.example/api/public'),
      authorization: 'Bearer edr-token',
    })
  })

  it('uses the explicit refresh operation when requested', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ endpoint: 'https://provider.example/data', authorization: 'Bearer fresh' })),
      )

    await resolveHttpEndpointDataReference('transfer-1', { forceRefresh: true, requireAuthorization: true })

    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      new URL('v3/edrs/transfer-1/refresh', config.edc.managementApiUrl).toString(),
    )
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })

  it('rejects missing credentials and unsafe endpoint schemes', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ endpoint: 'https://provider.example/data' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ endpoint: 'file:///etc/passwd', authorization: 'Bearer token' })),
      )

    await expect(resolveHttpEndpointDataReference('transfer-1', { requireAuthorization: true })).rejects.toMatchObject({
      status: 422,
    })
    await expect(resolveHttpEndpointDataReference('transfer-2', { requireAuthorization: true })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('does not expose internal EDC authentication failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unauthorized', { status: 401 }))

    await expect(resolveHttpEndpointDataReference('transfer-1')).rejects.toMatchObject({
      status: 502,
      message: 'Could not resolve transfer access details',
    })
  })
})
