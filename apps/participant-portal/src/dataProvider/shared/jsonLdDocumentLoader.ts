import catenaxPolicyContext from './contexts/catenax-policy.json'
import dataspaceContext from './contexts/dataspace-2025-1.json'
import edcDataspaceContext from './contexts/edc-dspace.json'
import tractusxAuthContext from './contexts/tractusx-auth.json'
import dataspaceOdrlProfileContext from './contexts/dataspace-odrl-profile.json'
import odrlContext from './contexts/odrl.json'

export const JSON_LD_CONTEXT_URLS = {
  catenaxPolicy: 'https://w3id.org/catenax/2025/9/policy/context.jsonld',
  dataspaceOdrlProfile: 'https://w3id.org/dspace/2025/1/odrl-profile.jsonld',
  // DSP 2025-1 responses are compacted with these (copies from Tractus-X EDC 0.13).
  dataspace: 'https://w3id.org/dspace/2025/1/context.jsonld',
  edcDataspace: 'https://w3id.org/edc/dspace/v0.0.1',
  tractusxAuth: 'https://w3id.org/tractusx/auth/v1.0.0',
  odrlHttp: 'http://www.w3.org/ns/odrl.jsonld',
  odrlHttps: 'https://www.w3.org/ns/odrl.jsonld',
} as const

export type JsonLdDocumentLoader = (url: string) => Promise<any>

const BUNDLED_JSON_LD_DOCUMENTS: Readonly<Record<string, object>> = {
  [JSON_LD_CONTEXT_URLS.catenaxPolicy]: catenaxPolicyContext,
  [JSON_LD_CONTEXT_URLS.dataspaceOdrlProfile]: dataspaceOdrlProfileContext,
  [JSON_LD_CONTEXT_URLS.dataspace]: dataspaceContext,
  [JSON_LD_CONTEXT_URLS.edcDataspace]: edcDataspaceContext,
  [JSON_LD_CONTEXT_URLS.tractusxAuth]: tractusxAuthContext,
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
