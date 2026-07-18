import { describe, expect, it, vi } from 'vitest'
import { createCachedDocumentLoader } from '../../dataProvider/shared/helpers'

describe('createCachedDocumentLoader', () => {
  it('reuses one request for concurrent and subsequent loads of the same context', async () => {
    const remoteDocument = {
      contextUrl: undefined,
      documentUrl: 'https://example.com/context.jsonld',
      document: { '@context': { example: 'https://example.com/' } },
    }
    const loadDocument = vi.fn(async () => remoteDocument)
    const cachedLoader = createCachedDocumentLoader(loadDocument)

    const [first, second] = await Promise.all([
      cachedLoader(remoteDocument.documentUrl),
      cachedLoader(remoteDocument.documentUrl),
    ])
    const third = await cachedLoader(remoteDocument.documentUrl)

    expect(first).toBe(remoteDocument)
    expect(second).toBe(remoteDocument)
    expect(third).toBe(remoteDocument)
    expect(loadDocument).toHaveBeenCalledTimes(1)
  })

  it('evicts failed requests so a later load can retry', async () => {
    const remoteDocument = {
      documentUrl: 'https://example.com/context.jsonld',
      document: { '@context': {} },
    }
    const loadDocument = vi
      .fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(remoteDocument)
    const cachedLoader = createCachedDocumentLoader(loadDocument)

    await expect(cachedLoader(remoteDocument.documentUrl)).rejects.toThrow('network unavailable')
    await expect(cachedLoader(remoteDocument.documentUrl)).resolves.toBe(remoteDocument)
    expect(loadDocument).toHaveBeenCalledTimes(2)
  })
})
