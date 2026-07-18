import { describe, expect, it, vi } from 'vitest'
import { compactJsonLd, createCachedDocumentLoader } from '../../dataProvider/shared/helpers'
import { createBundledJsonLdDocumentLoader, JSON_LD_CONTEXT_URLS } from '../../dataProvider/shared/jsonLdDocumentLoader'

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

describe('createBundledJsonLdDocumentLoader', () => {
  it('resolves the policy contexts without a remote request', async () => {
    const loader = createBundledJsonLdDocumentLoader()

    const catenaxPolicy = await loader(JSON_LD_CONTEXT_URLS.catenaxPolicy)
    const dataspaceOdrlProfile = await loader(JSON_LD_CONTEXT_URLS.dataspaceOdrlProfile)
    const odrlHttp = await loader(JSON_LD_CONTEXT_URLS.odrlHttp)
    const odrlHttps = await loader(JSON_LD_CONTEXT_URLS.odrlHttps)

    expect(catenaxPolicy.document['@context'].Membership).toEqual({ '@id': 'cx-policy:Membership' })
    expect(dataspaceOdrlProfile.document['@context'].permission).toMatchObject({
      '@id': 'odrl:permission',
      '@container': '@set',
    })
    expect(odrlHttp.document).toBe(odrlHttps.document)
  })

  it('rejects contexts that are not explicitly bundled', async () => {
    const loader = createBundledJsonLdDocumentLoader()

    await expect(loader('https://example.com/context.jsonld')).rejects.toThrow(
      'Remote JSON-LD context is not bundled: https://example.com/context.jsonld',
    )
  })

  it('compacts a Tractus-X policy without loading its contexts from the network', async () => {
    const compacted = await compactJsonLd(
      {
        '@context': [JSON_LD_CONTEXT_URLS.dataspaceOdrlProfile, JSON_LD_CONTEXT_URLS.catenaxPolicy],
        '@id': 'urn:policy:test',
        '@type': 'Policy',
        permission: {
          action: 'use',
          constraint: {
            leftOperand: 'Membership',
            operator: 'eq',
            rightOperand: 'active',
          },
        },
      },
      {
        '@context': {
          odrl: 'http://www.w3.org/ns/odrl/2/',
          'cx-policy': 'https://w3id.org/catenax/2025/9/policy/',
        },
      },
    )

    expect(compacted['@id']).toBe('urn:policy:test')
  })
})
