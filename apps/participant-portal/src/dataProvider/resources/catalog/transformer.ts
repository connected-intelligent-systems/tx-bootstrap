import { Catalog, Dataset } from '../../../types/catalog'
import { stripUndefinedValues } from '../../shared/helpers'
import {
  extractCreator,
  extractDate,
  extractPrivacySettings,
  extractProvenance,
  extractQualityMeasurements,
  extractString,
  extractApiDescription,
  extractMultiLanguageString,
} from '../../shared/transformerHelpers'
import { CatalogSchema, DatasetSchema } from './schema'

export function parseDatasetFromJsonLd(jsonLdDataset: any): Dataset {
  try {
    const parsed = DatasetSchema.parse(jsonLdDataset) as any
    const { _rawApiDescription, _datasetResource, ...rest } = parsed
    const apiDescription = extractApiDescription(_rawApiDescription)

    const titlesMultiLang =
      extractMultiLanguageString(_datasetResource, 'dct:title') ??
      extractMultiLanguageString(_datasetResource, 'aas:Referable/displayName')

    const titleString =
      titlesMultiLang?.find((t) => t.language === 'en')?.value ||
      titlesMultiLang?.[0]?.value ||
      rest.title ||
      extractString(_datasetResource, 'aas:Identifiable/id') ||
      ''

    const abstractsMultiLang =
      extractMultiLanguageString(_datasetResource, 'dct:abstract') ??
      extractMultiLanguageString(_datasetResource, 'aas:Referable/description')

    const abstractString =
      abstractsMultiLang?.find((t) => t.language === 'en')?.value ||
      abstractsMultiLang?.[0]?.value ||
      rest.abstract ||
      ''

    const dataset: Dataset = {
      ...rest,
      title: titleString,
      titles: titlesMultiLang,
      abstract: abstractString,
      abstracts: abstractsMultiLang,
      apiDescription,
      creator: extractCreator(_datasetResource),
      created: extractDate(_datasetResource, 'dct:created'),
      modified: extractDate(_datasetResource, 'dct:modified'),
      version: extractString(_datasetResource, 'dcat:version'),
      provenance: extractProvenance(_datasetResource),
      qualityMeasurements: extractQualityMeasurements(_datasetResource),
      privacySettings: extractPrivacySettings(_datasetResource),
      raw: jsonLdDataset,
    }

    return stripUndefinedValues(dataset)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to transform JSON-LD dataset: ${errorMessage}`, { cause: error })
  }
}

export function parseDatasetFromJsonLdArray(jsonLdDatasets: any[]): Dataset[] {
  return jsonLdDatasets.map((dataset) => parseDatasetFromJsonLd(dataset))
}

export function parseCatalogFromJsonLd(jsonLdCatalog: any, catalogId: string): Catalog {
  try {
    const parsed = CatalogSchema.parse(jsonLdCatalog)

    const datasetsWithApiDescriptions = (parsed['dcat:dataset'] || []).map((dataset: any, index: number) => {
      const { _rawApiDescription, _datasetResource, ...rest } = dataset
      const apiDescription = extractApiDescription(_rawApiDescription)
      const titlesMultiLang =
        extractMultiLanguageString(_datasetResource, 'dct:title') ??
        extractMultiLanguageString(_datasetResource, 'aas:Referable/displayName')

      const titleString =
        titlesMultiLang?.find((t) => t.language === 'en')?.value ||
        titlesMultiLang?.[0]?.value ||
        rest.title ||
        extractString(_datasetResource, 'aas:Identifiable/id') ||
        ''

      const abstractsMultiLang =
        extractMultiLanguageString(_datasetResource, 'dct:abstract') ??
        extractMultiLanguageString(_datasetResource, 'aas:Referable/description')

      const abstractString =
        abstractsMultiLang?.find((t) => t.language === 'en')?.value ||
        abstractsMultiLang?.[0]?.value ||
        rest.abstract ||
        ''

      return {
        ...rest,
        title: titleString,
        titles: titlesMultiLang,
        abstract: abstractString,
        abstracts: abstractsMultiLang,
        apiDescription,
        creator: extractCreator(_datasetResource),
        created: extractDate(_datasetResource, 'dct:created'),
        modified: extractDate(_datasetResource, 'dct:modified'),
        version: extractString(_datasetResource, 'dcat:version'),
        provenance: extractProvenance(_datasetResource),
        qualityMeasurements: extractQualityMeasurements(_datasetResource),
        privacySettings: extractPrivacySettings(_datasetResource),
        raw: (parsed['dcat:dataset'] || [])[index],
      }
    })

    const catalog: Catalog = {
      id: catalogId,
      title: parsed['dct:title'],
      description: parsed['dct:description'],
      participantId: parsed['dspace:participantId'],
      datasets: datasetsWithApiDescriptions,
    }
    return stripUndefinedValues(catalog)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to transform JSON-LD catalog: ${errorMessage}`, { cause: error })
  }
}
