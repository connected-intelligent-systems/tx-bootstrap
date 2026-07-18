import { z } from 'zod'
import type { CoreResource } from '../../shared/transformerHelpers'

type CatalogPolicyConstraint = {
  leftOperand: string
  operator: string
  rightOperand: string | number | Date
}

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const asArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

const jsonLdString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(jsonLdString).find(Boolean)
  if (isRecord(value)) return jsonLdString(value['@value'] ?? value['dct:title'] ?? value['@id'])
  return undefined
}

const jsonLdStrings = (value: unknown): string[] =>
  asArray(value)
    .map(jsonLdString)
    .filter((item): item is string => Boolean(item))

const KNOWN_NAMESPACES = [
  'https://w3id.org/catenax/2025/9/policy/',
  'https://w3id.org/catenax/policy/',
  'http://www.w3.org/ns/odrl/2/',
  'https://www.w3.org/ns/odrl/2/',
]

const KNOWN_PREFIXES = ['cx-policy:', 'catenax:', 'odrl:']

const compactTerm = (value: string): string => {
  const namespace = KNOWN_NAMESPACES.find((ns) => value.startsWith(ns))
  if (namespace) return value.slice(namespace.length)

  const prefix = KNOWN_PREFIXES.find((candidate) => value.startsWith(candidate))
  if (prefix) return value.slice(prefix.length)

  return value
}

const getJsonLdField = (source: any, term: string): any => {
  if (!isRecord(source)) return undefined
  return source[`odrl:${term}`] ?? source[term]
}

const getJsonLdValue = (value: any): any => {
  if (isRecord(value)) {
    if ('@id' in value) return value['@id']
    if ('@value' in value) return value['@value']
    if ('@list' in value) return value['@list']
  }

  return value
}

const parseAtomicConstraint = (constraint: any): CatalogPolicyConstraint | undefined => {
  const leftOperand = getJsonLdValue(getJsonLdField(constraint, 'leftOperand'))
  const operator = getJsonLdValue(getJsonLdField(constraint, 'operator'))
  const rightOperand = getJsonLdValue(getJsonLdField(constraint, 'rightOperand'))

  if (
    typeof leftOperand !== 'string' ||
    typeof operator !== 'string' ||
    rightOperand === undefined ||
    rightOperand === null
  ) {
    return undefined
  }

  return {
    leftOperand: compactTerm(leftOperand),
    operator: compactTerm(operator),
    rightOperand,
  }
}

const parseConstraints = (constraintValue: any): CatalogPolicyConstraint[] => {
  if (isRecord(constraintValue) && '@list' in constraintValue) {
    return parseConstraints(constraintValue['@list'])
  }

  return asArray(constraintValue).flatMap((constraint) => {
    const andConstraints = getJsonLdField(constraint, 'and')
    if (andConstraints !== undefined) return parseConstraints(andConstraints)

    const parsed = parseAtomicConstraint(constraint)
    return parsed ? [parsed] : []
  })
}

const PolicyRuleSchema = z
  .object({
    'odrl:action': z
      .union([z.object({ '@id': z.string() }), z.string()])
      .transform((v) => (typeof v === 'object' ? v['@id'] : v)),
    'odrl:constraint': z.any().optional().transform(parseConstraints),
  })
  .transform((r) => ({
    action: r['odrl:action'],
    constraints: r['odrl:constraint'],
  }))

export const PolicySchema = z.preprocess(
  (value) => (isRecord(value) ? { ...value, _rawPolicy: value } : value),
  z
    .object({
      _rawPolicy: z.record(z.string(), z.any()),
      '@id': z.string(),
      '@type': z.string(),
      'odrl:permission': z
        .union([PolicyRuleSchema, z.array(PolicyRuleSchema)])
        .optional()
        .transform((p) => (p ? (Array.isArray(p) ? p : [p]) : [])),
      'odrl:prohibition': z
        .union([PolicyRuleSchema, z.array(PolicyRuleSchema)])
        .optional()
        .transform((p) => (p ? (Array.isArray(p) ? p : [p]) : [])),
      'odrl:obligation': z
        .union([PolicyRuleSchema, z.array(PolicyRuleSchema)])
        .optional()
        .transform((p) => (p ? (Array.isArray(p) ? p : [p]) : [])),
    })
    .transform((p) => ({
      id: p['@id'],
      type: p['@type'],
      permissions: p['odrl:permission'],
      prohibitions: p['odrl:prohibition'],
      obligations: p['odrl:obligation'],
      raw: p._rawPolicy,
    })),
)

const DistributionSchema = z
  .object({
    '@type': z.string().optional(),
    'dct:format': z
      .object({
        '@id': z.string().optional(),
      })
      .optional(),
    'dcat:accessService': z
      .object({
        '@id': z.string().optional(),
        '@type': z.string().optional(),
        'dcat:endpointDescription': z.string().optional(),
        'dcat:endpointUrl': z.string().optional(),
        'dcat:endpointURL': z.string().optional(),
      })
      .optional(),
  })
  .passthrough()
  .transform((dist) => ({
    type: dist['@type'],
    format: dist['dct:format']?.['@id'],
    accessService: dist['dcat:accessService']
      ? {
          id: dist['dcat:accessService']['@id'],
          type: dist['dcat:accessService']['@type'],
          endpointDescription: dist['dcat:accessService']['dcat:endpointDescription'],
          endpointUrl: dist['dcat:accessService']['dcat:endpointUrl'] || dist['dcat:accessService']['dcat:endpointURL'],
        }
      : undefined,
  }))

export const DatasetSchema = z
  .object({
    '@id': z
      .string()
      .nullish()
      .transform((val) => val || 'unknown-id'),
    'dct:title': z.any().optional(),
    'dct:abstract': z.any().optional(),
    'dct:description': z.any().optional(),
    '@type': z.string().optional(),
    type: z.string().optional(),
    contenttype: z.any().optional(),
    'dcat:mediaType': z.any().optional(),
    'dcat:theme': z.any().optional(),
    'dcat:keyword': z.any().optional(),
    'odrl:hasPolicy': z
      .union([PolicySchema, z.array(PolicySchema)])
      .optional()
      .transform((p) => (p ? (Array.isArray(p) ? p : [p]) : [])),
    'dcat:distribution': z
      .union([DistributionSchema, z.array(DistributionSchema)])
      .optional()
      .transform((d) => (d ? (Array.isArray(d) ? d : [d]) : [])),
  })
  .passthrough()
  .transform((d) => {
    const datasetResource: CoreResource = {
      '@id': d['@id'],
      properties: d as Record<string, unknown>,
    }

    return {
      id: d['@id'],
      title: jsonLdString(d['dct:title']) || (typeof d.name === 'string' ? d.name : undefined),
      abstract: jsonLdString(d['dct:abstract']) || (typeof d.abstract === 'string' ? d.abstract : undefined),
      description:
        jsonLdString(d['dct:description']) || (typeof d.description === 'string' ? d.description : undefined),
      type: d.type || d['@type'],
      contenttype: jsonLdString(d.contenttype),
      mediaType: jsonLdString(d['dcat:mediaType']),
      theme: d['dcat:theme']
        ? {
            title: jsonLdString(d['dcat:theme']),
          }
        : undefined,
      keywords: d['dcat:keyword'] ? jsonLdStrings(d['dcat:keyword']) : undefined,
      policies: d['odrl:hasPolicy'],
      distributions: d['dcat:distribution'],
      _rawThingDescription: d['td:hasThingDescription'],
      _datasetResource: datasetResource,
    }
  })

export const CatalogSchema = z.object({
  'dct:title': z.string().optional(),
  'dct:description': z.string().optional(),
  'dspace:participantId': z.string().optional(),
  'dcat:dataset': z
    .union([DatasetSchema, z.array(DatasetSchema)])
    .optional()
    .transform((d) => (d ? (Array.isArray(d) ? d : [d]) : [])),
})
