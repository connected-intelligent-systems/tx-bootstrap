import type { PolicyConstraint } from '../../types/policy'
import { parseBpns } from '../../utils/bpn'

export { invalidBpns, parseBpns } from '../../utils/bpn'

export type OfferAudience = 'members' | 'partners' | 'group'

export const FRAMEWORK_AGREEMENT = 'DataExchangeGovernance:1.0'
export const DEFAULT_USAGE_PURPOSE = 'cx.core.industrycore:1'

const USAGE_PURPOSE_PATTERN = /^cx\.[A-Za-z0-9][A-Za-z0-9._-]*:[1-9]\d*$/

export const isValidUsagePurpose = (value: string): boolean => USAGE_PURPOSE_PATTERN.test(value.trim())

export const toDateInputValue = (value: unknown): string => {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || ''
}

export const toPolicyEndDate = (date: string): string => `${date}T23:59:59Z`

export const buildAccessConstraints = ({
  audience,
  partners,
  group,
}: {
  audience: OfferAudience
  partners: string
  group: string
}): PolicyConstraint[] => {
  const membership: PolicyConstraint = {
    leftOperand: 'Membership',
    operator: 'eq',
    rightOperand: 'active',
  }

  if (audience === 'partners') {
    return [
      membership,
      {
        leftOperand: 'BusinessPartnerNumber',
        operator: 'isAnyOf',
        rightOperand: parseBpns(partners),
      },
    ]
  }

  if (audience === 'group') {
    return [
      membership,
      {
        leftOperand: 'BusinessPartnerGroup',
        operator: 'isAnyOf',
        rightOperand: [group.trim()],
      },
    ]
  }

  return [membership]
}

export const buildUsageConstraints = ({
  purpose,
  endDate,
}: {
  purpose: string
  endDate: string
}): PolicyConstraint[] => [
  {
    leftOperand: 'FrameworkAgreement',
    operator: 'eq',
    rightOperand: FRAMEWORK_AGREEMENT,
  },
  {
    leftOperand: 'UsagePurpose',
    operator: 'isAnyOf',
    rightOperand: [purpose.trim()],
  },
  ...(endDate
    ? [
        {
          leftOperand: 'DataUsageEndDate',
          operator: 'eq',
          rightOperand: toPolicyEndDate(endDate),
        },
      ]
    : []),
]
