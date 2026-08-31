import { MultiLanguageValue } from '../dataProvider/shared/transformerHelpers'
import type { OpenApiDocument } from '../../shared/api-description'

export type { OpenApiDocument } from '../../shared/api-description'

export interface AssetDataAddress {
  type: string
  headers?: Array<{ name: string; value: string }>
  [key: string]: any
}

export interface AssetQualityMeasurement {
  measurementOf: {
    title: string
  }
  value: string | number
  unit?: string
}

export interface AssetCreator {
  name: string
  id?: string
}

export interface AssetProvenance {
  derivedFromId?: string
  generatedByDescription?: string
  attributedToId?: string
}

export interface AssetTheme {
  title: string
}

export interface Asset {
  id: string

  // Basic Information
  title: string
  titles?: MultiLanguageValue[]
  abstract: string
  abstracts?: MultiLanguageValue[]
  description?: string
  keywords?: string[]
  theme?: AssetTheme
  mediaType?: string

  // Data Address
  dataAddress?: AssetDataAddress

  // Versioning
  version?: string
  creator?: AssetCreator
  created?: string
  modified?: string

  // Provenance
  provenance?: AssetProvenance

  // Data Quality
  qualityMeasurements?: AssetQualityMeasurement[]

  // Privacy/Legal (extend as needed)
  privacySettings?: {
    [key: string]: any
  }

  // Endpoint-neutral API contract. Runtime endpoints belong to the transfer data address.
  apiDescription?: OpenApiDocument

  // Raw JSON-LD representation
  raw?: any
}

// Form data interface for create/edit operations
export interface AssetFormData extends Partial<Asset> {
  // Allow additional fields during form editing
  [key: string]: any
}
