import { BusinessPartnerGroup, BusinessPartnerGroupFormData } from '../../../types/businessPartnerGroup'
import { removeUndefinedValues } from '../../shared/helpers'
import { BUSINESS_PARTNER_GROUP_CONTEXT, CoreBpnGroupSchema, CoreGroupBpnsSchema } from './schema'

const TX_NAMESPACE = 'https://w3id.org/tractusx/v0.0.1/ns/'
const TX_PREFIX = 'tx:'

// The connector embeds a remote JSON-LD @context in its responses (e.g.
// https://w3id.org/catenax/2025/9/policy/context.jsonld). Expanding that via
// the `jsonld` library would require fetching it over the network on every
// request, so fields are read directly by trying both the compacted
// ("tx:groups") and fully expanded (IRI) key forms instead -- same approach
// resources/policy/transformer.ts uses for the same reason.
function getTxField(entry: Record<string, any>, localName: string): unknown {
  const compactKey = `${TX_PREFIX}${localName}`
  if (compactKey in entry) return entry[compactKey]
  return entry[`${TX_NAMESPACE}${localName}`]
}

// JSON-LD collapses a single-value property to a bare scalar instead of a
// 1-element array, so callers must normalize before treating it as a list.
function toStringArray(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map(String)
  return [String(value)]
}

export function parseBpnGroupFromJsonLd(jsonLdEntry: any): BusinessPartnerGroup {
  const entry = CoreBpnGroupSchema.parse(jsonLdEntry)

  return {
    id: entry['@id'],
    groups: toStringArray(getTxField(entry, 'groups')),
    raw: jsonLdEntry,
  }
}

export function serializeBpnGroupToJsonLd(data: BusinessPartnerGroupFormData): any {
  return removeUndefinedValues({
    '@context': BUSINESS_PARTNER_GROUP_CONTEXT,
    '@id': data.id,
    'tx:groups': data.groups || [],
  })
}

export function parseGroupBpnsFromJsonLd(jsonLdEntry: any): {
  group: string
  bpns: string[]
} {
  const entry = CoreGroupBpnsSchema.parse(jsonLdEntry)

  return {
    group: entry['@id'],
    bpns: toStringArray(getTxField(entry, 'bpns')),
  }
}

export function parseGroupsList(jsonLdEntry: any): string[] {
  return toStringArray(getTxField(jsonLdEntry, 'groups'))
}
