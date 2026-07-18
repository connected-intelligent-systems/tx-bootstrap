import catenaxPolicyContext from './contexts/catenax-policy.json'
import dataspaceOdrlProfileContext from './contexts/dataspace-odrl-profile.json'
import odrlContext from './contexts/odrl.json'

export const JSON_LD_CONTEXT_URLS = {
  catenaxPolicy: 'https://w3id.org/catenax/2025/9/policy/context.jsonld',
  dataspaceOdrlProfile: 'https://w3id.org/dspace/2025/1/odrl-profile.jsonld',
  odrlHttp: 'http://www.w3.org/ns/odrl.jsonld',
  odrlHttps: 'https://www.w3.org/ns/odrl.jsonld',
} as const

export type JsonLdDocumentLoader = (url: string) => Promise<any>

const BUNDLED_JSON_LD_DOCUMENTS: Readonly<Record<string, object>> = {
  [JSON_LD_CONTEXT_URLS.catenaxPolicy]: catenaxPolicyContext,
  [JSON_LD_CONTEXT_URLS.dataspaceOdrlProfile]: dataspaceOdrlProfileContext,
  [JSON_LD_CONTEXT_URLS.odrlHttp]: odrlContext,
  [JSON_LD_CONTEXT_URLS.odrlHttps]: odrlContext,
}

export function createBundledJsonLdDocumentLoader(
  documents: Readonly<Record<string, object>> = BUNDLED_JSON_LD_DOCUMENTS,
): JsonLdDocumentLoader {
  return async (url) => {
    const document = documents[url]
    if (!document) {
      throw new Error(`Remote JSON-LD context is not bundled: ${url}`)
    }

    return {
      contextUrl: null,
      documentUrl: url,
      document,
    }
  }
}
