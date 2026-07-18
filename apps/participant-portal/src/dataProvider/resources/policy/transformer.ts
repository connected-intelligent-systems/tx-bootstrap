import { Policy, PolicyConstraint, PolicyFormData, PolicyRightOperand, PolicyRule } from '../../../types/policy'
import { removeUndefinedValues, stripUndefinedValues } from '../../shared/helpers'
import { CorePolicySchema } from './schema'

const TRACTUSX_CONTEXT = [
  'https://w3id.org/dspace/2025/1/odrl-profile.jsonld',
  'https://w3id.org/catenax/2025/9/policy/context.jsonld',
  { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
]

const EDC_NAMESPACE = 'https://w3id.org/edc/v0.0.1/ns/'
const ODRL_NAMESPACE = 'http://www.w3.org/ns/odrl/2/'
const ODRL_HTTPS_NAMESPACE = 'https://www.w3.org/ns/odrl/2/'
const CATENAX_POLICY_NAMESPACE = 'https://w3id.org/catenax/policy/'
const CATENAX_2025_POLICY_NAMESPACE = 'https://w3id.org/catenax/2025/9/policy/'

const KNOWN_NAMESPACES = [
  EDC_NAMESPACE,
  ODRL_NAMESPACE,
  ODRL_HTTPS_NAMESPACE,
  CATENAX_POLICY_NAMESPACE,
  CATENAX_2025_POLICY_NAMESPACE,
]

const KNOWN_PREFIXES = ['edc:', 'odrl:', 'cx-policy:', 'catenax:']

const LIST_OPERATORS = new Set(['isAnyOf', 'isAllOf', 'isNoneOf', 'isPartOf'])

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const asArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

const firstValue = (value: any): any => (Array.isArray(value) ? value[0] : value)

const compactTerm = (value: string): string => {
  const namespace = KNOWN_NAMESPACES.find((ns) => value.startsWith(ns))
  if (namespace) return value.slice(namespace.length)

  const prefix = KNOWN_PREFIXES.find((candidate) => value.startsWith(candidate))
  if (prefix) return value.slice(prefix.length)

  return value
}

const getRawJsonLdValue = (value: any): any => {
  const rawValue = firstValue(value)

  if (isRecord(rawValue)) {
    if ('@id' in rawValue) return rawValue['@id']
    if ('@value' in rawValue) return rawValue['@value']
  }

  return rawValue
}

const normalizeIdentifier = (value: any): string | undefined => {
  const rawValue = getRawJsonLdValue(value)
  return typeof rawValue === 'string' ? compactTerm(rawValue) : undefined
}

const normalizeLiteral = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(normalizeLiteral)
  }

  if (isRecord(value)) {
    if ('@list' in value) return normalizeLiteral(value['@list'])
    if ('@value' in value) return value['@value']
    if ('@id' in value) return compactTerm(value['@id'])
  }

  return value
}

const getTextValue = (value: any): string | undefined => {
  const rawValue = getRawJsonLdValue(value)
  return typeof rawValue === 'string' ? rawValue : undefined
}

const getObjectValue = (value: any): Record<string, any> => {
  const rawValue = firstValue(value)
  return isRecord(rawValue) ? rawValue : {}
}

const keyCandidates = (term: string): string[] => {
  if (term.startsWith('@')) return [term]

  return [
    term,
    `odrl:${term}`,
    `edc:${term}`,
    `${EDC_NAMESPACE}${term}`,
    `${ODRL_NAMESPACE}${term}`,
    `${ODRL_HTTPS_NAMESPACE}${term}`,
    `${CATENAX_POLICY_NAMESPACE}${term}`,
    `${CATENAX_2025_POLICY_NAMESPACE}${term}`,
  ]
}

const getJsonLdField = (source: any, term: string): any => {
  if (!isRecord(source)) return undefined

  for (const key of keyCandidates(term)) {
    if (source[key] !== undefined) return source[key]
  }

  return undefined
}

const normalizeRightOperand = (value: any, operator?: string): PolicyRightOperand | undefined => {
  let operand = normalizeLiteral(value)

  if (Array.isArray(operand) && operand.length === 1) {
    operand = LIST_OPERATORS.has(operator || '') ? operand.flat() : operand[0]
  }

  if (LIST_OPERATORS.has(operator || '') && !Array.isArray(operand)) {
    operand = operand === undefined ? [] : [operand]
  }

  return operand
}

const parseAtomicConstraint = (constraint: any): PolicyConstraint | undefined => {
  const leftOperand = normalizeIdentifier(getJsonLdField(constraint, 'leftOperand'))
  const operator = normalizeIdentifier(getJsonLdField(constraint, 'operator'))
  const rightOperand = normalizeRightOperand(getJsonLdField(constraint, 'rightOperand'), operator)

  if (!leftOperand || !operator || rightOperand === undefined) return undefined
  return { leftOperand, operator, rightOperand }
}

const parseConstraints = (constraintValue: any): PolicyConstraint[] => {
  if (isRecord(constraintValue) && '@list' in constraintValue) {
    return parseConstraints(constraintValue['@list'])
  }

  return asArray(constraintValue).flatMap((constraint: any) => {
    const andConstraints = getJsonLdField(constraint, 'and')
    if (andConstraints !== undefined) {
      return parseConstraints(andConstraints)
    }

    const parsed = parseAtomicConstraint(constraint)
    return parsed ? [parsed] : []
  })
}

const parseRule = (rule: any) => {
  const ruleRecord = getObjectValue(rule)

  return {
    action: normalizeIdentifier(getJsonLdField(ruleRecord, 'action')) || 'use',
    constraints: parseConstraints(getJsonLdField(ruleRecord, 'constraint')),
  }
}

const parseRuleArray = (policy: Record<string, any>, ruleKey: string) =>
  asArray(getJsonLdField(policy, ruleKey)).map(parseRule)

const buildTractusXConstraint = (constraint: PolicyConstraint) => ({
  leftOperand: constraint.leftOperand,
  operator: constraint.operator,
  rightOperand: constraint.rightOperand,
})

const buildTractusXRule = (rule: any) => {
  const constraints = (rule.constraints || []).map(buildTractusXConstraint)
  return {
    action: rule.action || 'use',
    constraint: constraints.length > 1 ? { and: constraints } : constraints.length === 1 ? constraints[0] : undefined,
  }
}

const parseCreatedAt = (value: any): string | undefined => {
  const rawValue = getRawJsonLdValue(value)
  if (rawValue === undefined || rawValue === null) return undefined

  const date = new Date(rawValue)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export async function parsePolicyFromJsonLd(jsonLdPolicy: any): Promise<Policy> {
  try {
    const core = CorePolicySchema.parse(jsonLdPolicy) as Record<string, any>
    const policyBody = getObjectValue(getJsonLdField(core, 'policy'))
    const privateProperties = getObjectValue(getJsonLdField(core, 'privateProperties'))

    const rules: PolicyRule = {
      permissions: parseRuleArray(policyBody, 'permission'),
      prohibitions: parseRuleArray(policyBody, 'prohibition'),
      obligations: parseRuleArray(policyBody, 'obligation'),
      target: getTextValue(getJsonLdField(policyBody, 'target')),
    }

    const policy: Policy = {
      id: getTextValue(core['@id'] ?? core.id) || '',
      type: normalizeIdentifier(getJsonLdField(core, '@type')) || 'PolicyDefinition',
      name: getTextValue(getJsonLdField(privateProperties, 'name')) || 'Untitled Policy',
      description: getTextValue(getJsonLdField(privateProperties, 'description')),
      createdAt: parseCreatedAt(getJsonLdField(core, 'createdAt')),
      policyType: normalizeIdentifier(getJsonLdField(policyBody, '@type')),
      rules: rules,
      privateProperties,
    }

    return stripUndefinedValues(policy)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to transform JSON-LD policy: ${errorMessage}`, { cause: error })
  }
}

export async function parsePolicyFromJsonLdArray(jsonLdPolicies: any[]): Promise<Policy[]> {
  return Promise.all(jsonLdPolicies.map((policy) => parsePolicyFromJsonLd(policy)))
}

export async function serializePolicyToJsonLd(policy: PolicyFormData): Promise<any> {
  const buildRules = (rules: any[] | undefined) => rules?.map(buildTractusXRule)

  const jsonLd = {
    '@context': TRACTUSX_CONTEXT,
    '@type': policy.type || 'PolicyDefinition',
    '@id': policy.id,
    createdAt: policy.createdAt ? new Date(policy.createdAt).getTime() : undefined,
    privateProperties: {
      name: policy.name,
      description: policy.description,
    },
    policy: {
      '@type': policy.policyType || 'Set',
      permission: buildRules(policy.rules?.permissions),
      prohibition: buildRules(policy.rules?.prohibitions),
      obligation: buildRules(policy.rules?.obligations),
      target: policy.rules?.target,
    },
  }

  return removeUndefinedValues(jsonLd)
}
