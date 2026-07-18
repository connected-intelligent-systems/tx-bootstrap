import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../config/index.js'
import { fetchPublicHttpPreview } from './public-http-preview.js'
import { previewHttpPullTransfer } from './transfer-preview-service.js'

vi.mock('./public-http-preview.js', () => ({ fetchPublicHttpPreview: vi.fn() }))

const fetchPublicHttpPreviewMock = vi.mocked(fetchPublicHttpPreview)

describe('transfer preview service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('resolves the EDR and previews the endpoint with its authorization', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ endpoint: 'https://data.test/public', authorization: 'Bearer token' }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    fetchPublicHttpPreviewMock.mockResolvedValue({
      status: 200,
      contentType: 'application/json',
      body: '{"value":42}',
      truncated: false,
    })
    const reply = replyStub()

    await previewHttpPullTransfer({ params: { transferId: 'transfer-1' } } as never, reply as never)

    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      new URL('v3/edrs/transfer-1/dataaddress', config.edc.managementApiUrl).toString(),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchPublicHttpPreviewMock).toHaveBeenCalledWith(new URL('https://data.test/public'), 'Bearer token')
    expect(reply.payload).toEqual({
      status: 200,
      contentType: 'application/json',
      body: '{"value":42}',
      truncated: false,
    })
  })
})

const replyStub = () => {
  const reply = {
    payload: undefined as unknown,
    status: 200,
    header: vi.fn(() => reply),
    code: vi.fn((status: number) => {
      reply.status = status
      return reply
    }),
    send: vi.fn((payload: unknown) => {
      reply.payload = payload
      return reply
    }),
  }
  return reply
}
