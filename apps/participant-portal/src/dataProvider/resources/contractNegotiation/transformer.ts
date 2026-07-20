import { ContractNegotiation } from '../../../types/contractNegotiation'
import { removeUndefinedValues, stripUndefinedValues } from '../../shared/helpers'
import { CoreContractNegotiationSchema } from './schema'

const CATENAX_2025_POLICY_NAMESPACE = 'https://w3id.org/catenax/2025/9/policy/'
const CATENAX_POLICY_NAMESPACE = 'https://w3id.org/catenax/policy/'
const ODRL_NAMESPACE = 'http://www.w3.org/ns/odrl/2/'
const ODRL_HTTPS_NAMESPACE = 'https://www.w3.org/ns/odrl/2/'

const TRACTUSX_LEFT_OPERANDS = new Set([
  'AffiliatesBpnl',
  'AffiliatesRegion',
  'BusinessPartnerGroup',
  'BusinessPartnerNumber',
  'ConfidentialInformationMeasures',
  'ConfidentialInformationSharing',
  'ContractReference',
  'ContractTermination',
  'DataFrequency',
  'DataUsageEndDate',
  'DataUsageEndDefinition',
  'DataUsageEndDurationDays',
  'DataProvisioningEndDurationDays',
  'DataProvisioningEndDate',
  'ExclusiveUsage',
  'FrameworkAgreement',
  'JurisdictionLocation',
  'JurisdictionLocationReference',
  'Liability',
  'Membership',
  'Precedence',
  'UsagePurpose',
  'UsageRestriction',
  'VersionChanges',
  'Warranty',
  'WarrantyDefinition',
  'WarrantyDurationMonths',
])

const isAbsoluteIri = (value: string) => /^https?:\/\//.test(value)

const stripKnownTermPrefix = (value: string) => value.replace(/^(odrl:|cx-policy:|catenax:)/, '')

const toOdrlId = (value: string) => {
  if (isAbsoluteIri(value)) return value
  if (value.startsWith('odrl:')) return value
  if (value.startsWith(ODRL_NAMESPACE)) return value
  if (value.startsWith(ODRL_HTTPS_NAMESPACE)) return value

  return `odrl:${stripKnownTermPrefix(value)}`
}

const toLeftOperandId = (value: string) => {
  if (isAbsoluteIri(value)) return value

  const compactValue = stripKnownTermPrefix(value)
  if (TRACTUSX_LEFT_OPERANDS.has(compactValue)) {
    return `${CATENAX_2025_POLICY_NAMESPACE}${compactValue}`
  }

  if (value.startsWith('cx-policy:') || value.startsWith('catenax:')) {
    return `${CATENAX_POLICY_NAMESPACE}${compactValue}`
  }

  return toOdrlId(value)
}

export async function parseContractNegotiationFromJsonLd(jsonLd: any): Promise<ContractNegotiation> {
  try {
    const parsed = CoreContractNegotiationSchema.parse(jsonLd)
    const negotiation: ContractNegotiation = {
      id: parsed['@id'],
      type: parsed.type,
      state: parsed.state,
      protocol: parsed.protocol,
      counterPartyAddress: parsed.counterPartyAddress,
      counterPartyId: parsed.counterPartyId,
      datasetId: parsed.datasetId || parsed.policy?.target || parsed.assetId,
      errorDetail: parsed.errorDetail,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt ?? parsed.createdAt,
      contractAgreementId: parsed.contractAgreementId,
    }
    return stripUndefinedValues(negotiation)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to transform JSON-LD contract negotiation: ${errorMessage}`, { cause: error })
  }
}

export async function parseContractNegotiationFromJsonLdArray(jsonLdArray: any[]): Promise<ContractNegotiation[]> {
  return Promise.all(jsonLdArray.map((jsonLd) => parseContractNegotiationFromJsonLd(jsonLd)))
}

export async function serializeContractNegotiationToJsonLd(data: any): Promise<any> {
  const rawPolicy = data.policy?.raw
  const hasRawPolicy = rawPolicy && typeof rawPolicy === 'object' && !Array.isArray(rawPolicy)
  const policy: any = hasRawPolicy
    ? {
        '@context': 'http://www.w3.org/ns/odrl.jsonld',
        ...rawPolicy,
      }
    : {
        '@context': 'http://www.w3.org/ns/odrl.jsonld',
        '@type': data.policy?.type,
        '@id': data.policy?.id,
        assigner: data.policy?.assigner,
        target: data.policy?.target,
      }

  if (hasRawPolicy && policy.assigner === undefined && policy['odrl:assigner'] === undefined && data.policy?.assigner) {
    policy['odrl:assigner'] = { '@id': data.policy.assigner }
  }

  if (hasRawPolicy && policy.target === undefined && policy['odrl:target'] === undefined && data.policy?.target) {
    policy['odrl:target'] = { '@id': data.policy.target }
  }

  if (!hasRawPolicy && data.policy?.obligations) {
    policy.obligation = data.policy.obligations
  }

  if (!hasRawPolicy && data.policy?.permissions) {
    policy.permission = data.policy.permissions.map((permission: any) => {
      return {
        action: {
          '@id': toOdrlId(permission.action || 'use'),
        },
        constraint: permission.constraints.map((constraint: any) => ({
          '@type': 'odrl:Constraint',
          leftOperand: {
            '@id': toLeftOperandId(constraint.leftOperand),
          },
          operator: {
            '@id': toOdrlId(constraint.operator),
          },
          rightOperand: constraint.rightOperand,
        })),
      }
    })
  }

  if (!hasRawPolicy && data.policy?.prohibitions) {
    policy.prohibition = data.policy.prohibitions
  }

  const jsonLd = {
    '@context': {
      '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
      edc: 'https://w3id.org/edc/v0.0.1/ns/',
    },
    '@type': 'ContractRequest',
    counterPartyAddress: data.counterPartyAddress,
    counterPartyId: data.counterPartyId,
    protocol: data.protocol || 'dataspace-protocol-http',
    policy: removeUndefinedValues(policy),
  }

  return removeUndefinedValues(jsonLd)
}
