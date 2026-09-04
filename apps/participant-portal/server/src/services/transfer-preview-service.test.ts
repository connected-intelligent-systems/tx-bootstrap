import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../config/index.js'
import { fetchPublicHttpDownload, fetchPublicHttpPreview } from './public-http-preview.js'
import { downloadHttpPullTransfer, previewHttpPullTransfer } from './transfer-preview-service.js'

vi.mock('./public-http-preview.js', () => ({
  fetchPublicHttpDownload: vi.fn(),
  fetchPublicHttpPreview: vi.fn(),
}))

const fetchPublicHttpPreviewMock = vi.mocked(fetchPublicHttpPreview)
const fetchPublicHttpDownloadMock = vi.mocked(fetchPublicHttpDownload)

describe('transfer preview service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

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
      new URL('v3/edrs/transfer-1/dataaddress?auto_refresh=true', config.edc.managementApiUrl).toString(),
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

  it('streams a download with safe response headers and no caching', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ endpoint: 'https://data.test/public', authorization: 'Bearer token' })),
    )
    const download = Object.assign(Readable.from(['{"value":42}']), {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-length': '12',
      },
    }) as unknown as IncomingMessage
    fetchPublicHttpDownloadMock.mockResolvedValue(download)
    const reply = replyStub()

    await downloadHttpPullTransfer({ params: { transferId: 'transfer-1' } } as never, reply as never)

    expect(fetchPublicHttpDownloadMock).toHaveBeenCalledWith(new URL('https://data.test/public'), 'Bearer token')
    expect(reply.status).toBe(200)
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8')
    expect(reply.header).toHaveBeenCalledWith('Content-Length', '12')
    expect(reply.header).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="transfer-1.json"')
    expect(reply.payload).toBe(download)
  })

  it('preserves an upstream attachment filename', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ endpoint: 'https://data.test/report' })),
    )
    const download = Object.assign(Readable.from(['report']), {
      statusCode: 200,
      headers: {
        'content-type': 'text/csv',
        'content-disposition': 'attachment; filename="report.csv"',
      },
    }) as unknown as IncomingMessage
    fetchPublicHttpDownloadMock.mockResolvedValue(download)
    const reply = replyStub()

    await downloadHttpPullTransfer({ params: { transferId: 'transfer-1' } } as never, reply as never)

    expect(reply.header).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="report.csv"')
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
