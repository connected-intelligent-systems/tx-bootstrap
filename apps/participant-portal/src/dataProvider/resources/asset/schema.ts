import { z } from 'zod'

export const AssetFrame = {
  '@context': {
    '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
    dct: 'http://purl.org/dc/terms/',
    dcat: 'http://www.w3.org/ns/dcat#',
    prov: 'http://www.w3.org/ns/prov#',
    odrl: 'http://www.w3.org/ns/odrl/2/',
    dqv: 'http://www.w3.org/ns/dqv#',
    txb: 'https://github.com/connected-intelligent-systems/tx-bootstrap/ns/',
    dpv: 'https://w3id.org/dpv#',
    schema: 'http://schema.org/',
    owl: 'http://www.w3.org/2002/07/owl#',
    aas: 'https://admin-shell.io/aas/3/0/',
  },
}

export const CoreAssetSchema = z
  .object({
    '@id': z.string(),
    properties: z.record(z.string(), z.unknown()).optional(),
    dataAddress: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

export type CoreAsset = z.infer<typeof CoreAssetSchema>

const TITLE_PATH = "properties.'http://purl.org/dc/terms/title'"
const THEME_PATH = "properties.'http://www.w3.org/ns/dcat#theme'"

// Note: the `q` filter key is always dropped by buildQuerySpec before filterMapping
// runs, so free-text search is wired up under the `title` key instead.
export const assetFilterMapping = (key: string, value: any) => {
  switch (key) {
    case 'title':
      return { field: TITLE_PATH, operator: 'like', value: `%${value}%` }
    case 'category':
      return { field: THEME_PATH, operator: '=', value }
    default:
      return { field: key, operator: '=', value }
  }
}
