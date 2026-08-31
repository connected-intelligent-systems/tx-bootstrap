import { Asset, AssetDataAddress, AssetFormData } from '../../../types/asset'
import { removeUndefinedValues, stripUndefinedValues } from '../../shared/helpers'
import {
  extractCreator,
  extractDate,
  extractPrivacySettings,
  extractProvenance,
  extractQualityMeasurements,
  extractString,
  normalizeStringArray,
  serializePrivacySettings,
  extractApiDescription,
  extractMultiLanguageString,
  type MultiLanguageValue,
} from '../../shared/transformerHelpers'
import {
  API_DESCRIPTION_COMPACT_PROPERTY,
  API_DESCRIPTION_PROPERTY,
  serializeApiDescription,
} from '../../../utils/apiDescriptionUtils'
import { CoreAssetSchema, type CoreAsset } from './schema'

const HEADER_PREFIX = 'header:'
const ACCEPT_HEADER = 'header:Accept'
const HTTP_PROXY_BOOLEAN_FIELDS = ['proxyPath', 'proxyQueryParams', 'proxyBody', 'proxyMethod'] as const

const isHttpDataAddressType = (type: string) => type === 'HttpData' || type === 'ProxyHttpData' || type === 'http'

const booleanForForm = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return value
}

function dataAddressForForm(dataAddress: unknown): AssetDataAddress | undefined {
  if (!dataAddress || typeof dataAddress !== 'object') return undefined

  const address = dataAddress as AssetDataAddress
  const formAddress = { ...address }
  if (isHttpDataAddressType(address.type)) {
    for (const field of HTTP_PROXY_BOOLEAN_FIELDS) {
      if (Object.hasOwn(address, field)) formAddress[field] = booleanForForm(address[field])
    }
  }
  const headers = Object.entries(address)
    .filter(([key]) => key.startsWith(HEADER_PREFIX) && key.toLowerCase() !== ACCEPT_HEADER.toLowerCase())
    .map(([key, value]) => ({
      name: key.slice(HEADER_PREFIX.length),
      value: String(value),
    }))

  return headers.length > 0 ? { ...formAddress, headers } : formAddress
}

function addCustomHeaders(processedAddress: AssetDataAddress, headers: AssetDataAddress['headers']): void {
  for (const header of headers ?? []) {
    const name = header?.name?.trim().replace(/^header:/i, '')
    if (!name || name.toLowerCase() === 'accept' || header.value === undefined || header.value === '') continue

    processedAddress[`${HEADER_PREFIX}${name}`] = header.value
  }
}

function serializeMultiLanguageString(value: string | MultiLanguageValue[] | undefined): string | any[] | undefined {
  if (!value) return undefined

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item.language) {
        return {
          '@value': item.value,
          '@language': item.language,
        }
      }
      return item.value
    })
  }

  return undefined
}

export function parseAssetFromJsonLd(jsonLdAsset: any): Asset {
  try {
    const coreAsset: CoreAsset = CoreAssetSchema.parse(jsonLdAsset)

    const titlesMultiLang =
      extractMultiLanguageString(coreAsset, 'dct:title') ??
      extractMultiLanguageString(coreAsset, 'aas:Referable/displayName')

    const titleString =
      titlesMultiLang?.find((t) => t.language === 'en')?.value ||
      titlesMultiLang?.[0]?.value ||
      extractString(coreAsset, 'aas:Identifiable/id') ||
      ''

    const abstractsMultiLang =
      extractMultiLanguageString(coreAsset, 'dct:abstract') ??
      extractMultiLanguageString(coreAsset, 'aas:Referable/description')

    const abstractString =
      abstractsMultiLang?.find((t) => t.language === 'en')?.value || abstractsMultiLang?.[0]?.value || ''

    const asset: Asset = {
      id: coreAsset['@id'],
      title: titleString,
      titles: titlesMultiLang,
      abstract: abstractString,
      abstracts: abstractsMultiLang,
      description: extractString(coreAsset, 'dct:description'),
      mediaType: extractString(coreAsset, 'dcat:mediaType'),
      keywords: normalizeStringArray(coreAsset, 'dcat:keyword'),
      theme: coreAsset.properties?.['dcat:theme']
        ? {
            title:
              typeof coreAsset.properties['dcat:theme'] === 'string'
                ? coreAsset.properties['dcat:theme']
                : (coreAsset.properties['dcat:theme'] as any)?.['dct:title'],
          }
        : undefined,
      dataAddress: dataAddressForForm(coreAsset.dataAddress),
      creator: extractCreator(coreAsset),
      created: extractDate(coreAsset, 'dct:created'),
      modified: extractDate(coreAsset, 'dct:modified'),
      version: extractString(coreAsset, 'dcat:version'),
      provenance: extractProvenance(coreAsset),
      qualityMeasurements: extractQualityMeasurements(coreAsset),
      privacySettings: extractPrivacySettings(coreAsset),
      apiDescription: extractApiDescription(
        coreAsset.properties?.[API_DESCRIPTION_COMPACT_PROPERTY] ?? coreAsset.properties?.[API_DESCRIPTION_PROPERTY],
      ),
    }

    return stripUndefinedValues(asset)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to transform JSON-LD asset: ${errorMessage}`, { cause: error })
  }
}

export function serializeAssetToJsonLd(asset: AssetFormData): any {
  const properties: Record<string, any> = {
    'dct:title': asset.titles && asset.titles.length > 0 ? serializeMultiLanguageString(asset.titles) : asset.title,
    'dct:abstract':
      asset.abstracts && asset.abstracts.length > 0 ? serializeMultiLanguageString(asset.abstracts) : asset.abstract,
    'dct:description': asset.description,
    'dcat:mediaType': asset.mediaType,
    'dcat:keyword': asset.keywords,
    'dcat:version': asset.version,
  }

  if (asset.created) {
    properties['dct:created'] = {
      '@value': asset.created,
      '@type': 'xsd:date',
    }
  }

  if (asset.modified) {
    properties['dct:modified'] = {
      '@value': asset.modified,
      '@type': 'xsd:date',
    }
  }

  if (asset.theme?.title) {
    properties['dcat:theme'] = asset.theme.title
  }

  if (asset.creator?.name) {
    properties['dct:creator'] = asset.creator.name
  }

  if (asset.provenance?.derivedFromId) {
    properties['prov:wasDerivedFrom'] = {
      '@id': asset.provenance.derivedFromId,
    }
  }
  if (asset.provenance?.generatedByDescription) {
    properties['prov:wasGeneratedBy'] = {
      'dct:description': asset.provenance.generatedByDescription,
    }
  }
  if (asset.provenance?.attributedToId) {
    properties['prov:wasAttributedTo'] = {
      '@id': asset.provenance.attributedToId,
    }
  }

  if (asset.qualityMeasurements) {
    properties['dqv:hasQualityMeasurement'] = asset.qualityMeasurements.map((m) => ({
      'dqv:isMeasurementOf': { 'dct:title': m.measurementOf.title },
      'dqv:value': m.value,
      'dqv:unit': m.unit,
    }))
  }

  let finalDataAddress = asset.dataAddress
  if (asset.dataAddress) {
    const dataAddressType = asset.dataAddress.type
    const processedAddress: AssetDataAddress = { type: dataAddressType }

    const httpDataFields = [
      'type',
      'baseUrl',
      'header:Accept',
      'proxyPath',
      'proxyQueryParams',
      'proxyBody',
      'proxyMethod',
      'authKey',
      'authCode',
      'authHeader',
      'headers',
    ]
    const amazonS3Fields = [
      'type',
      'region',
      'endpointOverride',
      'bucketName',
      'objectName',
      'objectPrefix',
      'accessKeyId',
      'secretAccessKey',
    ]

    const allowedFields = isHttpDataAddressType(dataAddressType)
      ? httpDataFields
      : dataAddressType === 'AmazonS3' || dataAddressType === 's3'
        ? amazonS3Fields
        : Object.keys(asset.dataAddress)

    for (const [key, value] of Object.entries(asset.dataAddress)) {
      if (key !== 'type' && key !== 'headers' && allowedFields.includes(key)) {
        processedAddress[key] = typeof value === 'boolean' ? String(value) : value
      }
    }
    if (isHttpDataAddressType(dataAddressType)) {
      addCustomHeaders(processedAddress, asset.dataAddress.headers)
    }
    finalDataAddress = processedAddress
  }

  const jsonLd = {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
      edc: 'https://w3id.org/edc/v0.0.1/ns/',
      dct: 'http://purl.org/dc/terms/',
      dcat: 'http://www.w3.org/ns/dcat#',
      prov: 'http://www.w3.org/ns/prov#',
      odrl: 'http://www.w3.org/ns/odrl/2/',
      dqv: 'http://www.w3.org/ns/dqv#',
      txb: 'https://github.com/connected-intelligent-systems/tx-bootstrap/ns/',
      dpv: 'https://w3id.org/dpv#',
      schema: 'http://schema.org/',
      owl: 'http://www.w3.org/2002/07/owl#',
      skos: 'http://www.w3.org/2004/02/skos/core#',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
    },
    '@type': 'dcat:Dataset',
    '@id': asset.id,
    properties: removeUndefinedValues(properties),
    dataAddress: finalDataAddress,
  }

  const privacyProps = serializePrivacySettings(asset.privacySettings)
  if (privacyProps) {
    jsonLd.properties = { ...jsonLd.properties, ...privacyProps }
  }

  if (asset.apiDescription) {
    jsonLd.properties = {
      ...jsonLd.properties,
      [API_DESCRIPTION_COMPACT_PROPERTY]: serializeApiDescription(asset.apiDescription),
    }
  }

  return removeUndefinedValues(jsonLd)
}
