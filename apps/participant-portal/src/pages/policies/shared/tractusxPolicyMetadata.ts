export type TractusXValueType = 'text' | 'text-list' | 'choice' | 'choice-list' | 'date' | 'number'

export type TractusXAction = 'access' | 'use'
export type TractusXRuleType = 'permission' | 'prohibition' | 'obligation'

export interface TractusXConstraintDefinition {
  id: string
  label: string
  actions: TractusXAction[]
  defaultAction: TractusXAction
  ruleTypes: TractusXRuleType[]
  operators: string[]
  valueType: TractusXValueType
  /** The only right operands Tractus-X EDC accepts (choice and choice-list). */
  values?: string[]
}

// Mirrors the constraint functions of Tractus-X EDC 0.13 (cx-policy, Catena-X
// policy context 2025-09): the connector rejects other operators and values.
const constraint = (
  id: string,
  label: string,
  operators: string[],
  valueType: TractusXValueType,
  options: Partial<TractusXConstraintDefinition> = {},
): TractusXConstraintDefinition => ({
  id,
  label,
  actions: ['use'],
  defaultAction: 'use',
  ruleTypes: ['permission'],
  operators,
  valueType,
  ...options,
})

// Usage purposes accepted by the Tractus-X EDC 0.13.0 policy schema
// (jsonschema/cx-policy/usage-purpose-constraint-schema.json).
export const USAGE_PURPOSES = [
  'cx.bpdm.gate.download:1',
  'cx.bpdm.gate.upload:1',
  'cx.bpdm.pool:1',
  'cx.bpdm.poolAll:1',
  'cx.bpdm.vas.bdv.download:1',
  'cx.bpdm.vas.bdv.upload:1',
  'cx.bpdm.vas.countryrisk:1',
  'cx.bpdm.vas.dataquality.download:1',
  'cx.bpdm.vas.dataquality.upload:1',
  'cx.bpdm.vas.fpd.download:1',
  'cx.bpdm.vas.fpd.upload:1',
  'cx.bpdm.vas.nps.download:1',
  'cx.bpdm.vas.nps.upload:1',
  'cx.bpdm.vas.swd.download:1',
  'cx.bpdm.vas.swd.upload:1',
  'cx.ccm.base:1',
  'cx.circular.dpp:1',
  'cx.circular.marketplace:1',
  'cx.circular.materialaccounting:1',
  'cx.circular.smc:1',
  'cx.core.digitalTwinRegistry:1',
  'cx.core.industrycore:1',
  'cx.core.legalRequirementForThirdparty:1',
  'cx.core.qualityNotifications:1',
  'cx.dcm.base:1',
  'cx.ecu.base:1',
  'cx.engineering.base:1',
  'cx.esdscom.base:1',
  'cx.logistics.base:1',
  'cx.materialaccounting.base:1',
  'cx.pcf.base:1',
  'cx.puris.base:1',
  'cx.quality.base:1',
]

export const TRACTUSX_CONSTRAINTS: TractusXConstraintDefinition[] = [
  constraint('AffiliatesBpnl', 'Affiliates BPNL', ['isAnyOf'], 'text-list', {
    ruleTypes: ['permission', 'prohibition'],
  }),
  constraint('AffiliatesRegion', 'Affiliates Region', ['isAnyOf'], 'choice-list', {
    ruleTypes: ['permission', 'prohibition'],
    values: [
      'cx.region.all:1',
      'cx.region.europe:1',
      'cx.region.northAmerica:1',
      'cx.region.southAmerica:1',
      'cx.region.africa:1',
      'cx.region.asia:1',
      'cx.region.oceania:1',
      'cx.region.antarctica:1',
    ],
  }),
  constraint('BusinessPartnerGroup', 'Business Partner Group', ['isAnyOf', 'isNoneOf'], 'text-list', {
    actions: ['access'],
    defaultAction: 'access',
  }),
  constraint('BusinessPartnerNumber', 'Business Partner Number', ['isAnyOf', 'isNoneOf'], 'text-list', {
    actions: ['access'],
    defaultAction: 'access',
  }),
  constraint('ConfidentialInformationMeasures', 'Confidential Information Measures', ['eq'], 'choice', {
    values: ['cx.confidentiality.measures:1'],
  }),
  constraint('ConfidentialInformationSharing', 'Confidential Information Sharing', ['isAnyOf'], 'choice-list', {
    values: ['cx.sharing.affiliates:1', 'cx.sharing.managedLegalEntity:1'],
  }),
  constraint('ContractReference', 'Contract Reference', ['isAllOf'], 'text-list'),
  constraint('ContractTermination', 'Contract Termination', ['eq'], 'choice', {
    values: ['cx.data.deletion:1', 'cx.data.keeping:1'],
  }),
  constraint('DataFrequency', 'Data Frequency', ['eq'], 'choice', {
    values: ['cx.dataFrequency.once:1', 'cx.dataFrequency.unlimited:1'],
  }),
  // Enforced since 0.13: transfers start only before the end, and the policy
  // monitor ends running transfers when it passes.
  constraint('DataUsageEndDate', 'Data Usage End Date', ['eq'], 'date'),
  constraint('DataUsageEndDefinition', 'Data Usage End Definition', ['eq'], 'choice', {
    values: ['cx.dataUsageEnd.unlimited:1'],
  }),
  constraint('DataUsageEndDurationDays', 'Data Usage End Duration Days', ['eq'], 'number'),
  constraint('DataProvisioningEndDurationDays', 'Data Provisioning End Duration Days', ['eq'], 'number', {
    ruleTypes: ['obligation'],
  }),
  constraint('DataProvisioningEndDate', 'Data Provisioning End Date', ['eq'], 'date', {
    ruleTypes: ['obligation'],
  }),
  constraint('ExclusiveUsage', 'Exclusive Usage', ['eq'], 'choice', {
    values: ['cx.exclusiveUsage.dataConsumer:1'],
  }),
  constraint('FrameworkAgreement', 'Framework Agreement', ['eq'], 'choice', {
    actions: ['access', 'use'],
    values: ['DataExchangeGovernance:1.0'],
  }),
  constraint('JurisdictionLocation', 'Jurisdiction Location', ['eq'], 'text'),
  constraint('JurisdictionLocationReference', 'Jurisdiction Location Reference', ['eq'], 'choice', {
    values: ['cx.location.dataConsumer:1', 'cx.location.contractReference:1'],
  }),
  constraint('Liability', 'Liability', ['eq'], 'choice', {
    values: ['cx.grossNegligence:1', 'cx.slightNegligence:1'],
  }),
  constraint('Membership', 'Membership', ['eq'], 'choice', {
    actions: ['access', 'use'],
    defaultAction: 'access',
    values: ['active'],
  }),
  constraint('Precedence', 'Precedence', ['eq'], 'choice', {
    values: ['cx.precedence.contractReference:1', 'cx.precedence.rcAgreement:1'],
  }),
  constraint('UsagePurpose', 'Usage Purpose', ['isAnyOf'], 'choice-list', { values: USAGE_PURPOSES }),
  constraint('UsageRestriction', 'Usage Restriction', ['isAllOf'], 'choice-list', {
    ruleTypes: ['prohibition'],
    values: [
      'cx.thirdParty.forbidden:1',
      'cx.manipulation.forbidden:1',
      'cx.derivations.forbidden:1',
      'cx.extraordinaryAnalytics.forbidden:1',
      'cx.dataProviderRemoval.forbidden:1',
    ],
  }),
  constraint('VersionChanges', 'Version Changes', ['eq'], 'choice', {
    values: ['cx.versionChanges.minor:1', 'cx.versionChanges.major:1'],
  }),
  constraint('Warranty', 'Warranty', ['eq'], 'choice', {
    values: ['cx.warranty.none:1', 'cx.warranty.contractReference:1', 'cx.warranty.dataQualityIssues:1'],
  }),
  constraint('WarrantyDefinition', 'Warranty Definition', ['eq'], 'choice', {
    values: ['cx.warranty.contractEndDate:1'],
  }),
  constraint('WarrantyDurationMonths', 'Warranty Duration Months', ['eq'], 'number'),
]

export const TRACTUSX_CONSTRAINT_IDS = new Set(TRACTUSX_CONSTRAINTS.map((constraint) => constraint.id))

export const getTractusXConstraint = (id?: string) => TRACTUSX_CONSTRAINTS.find((constraint) => constraint.id === id)

export const getTractusXConstraintChoices = (ruleType?: TractusXRuleType, action?: TractusXAction) =>
  TRACTUSX_CONSTRAINTS.filter((constraint) => {
    const matchesRuleType = ruleType ? constraint.ruleTypes.includes(ruleType) : true
    const matchesAction = action ? constraint.actions.includes(action) : true
    return matchesRuleType && matchesAction
  }).map((constraint) => ({ id: constraint.id, name: constraint.label }))

export const getTractusXActionChoices = (ruleType?: TractusXRuleType) => {
  const actions = new Set<TractusXAction>()

  TRACTUSX_CONSTRAINTS.forEach((constraint) => {
    if (!ruleType || constraint.ruleTypes.includes(ruleType)) {
      constraint.actions.forEach((action) => actions.add(action))
    }
  })

  return Array.from(actions).map((action) => ({ id: action, name: action }))
}
