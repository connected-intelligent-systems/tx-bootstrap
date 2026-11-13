import type { PolicyConstraint } from '../../types/policy'
import { parseBpns } from '../../utils/bpn'
import { USAGE_PURPOSES } from '../policies/shared/tractusxPolicyMetadata'

export { invalidBpns, parseBpns } from '../../utils/bpn'

export type OfferAudience = 'members' | 'partners' | 'group'
export type UsageEnd = 'none' | 'date' | 'duration'

export const FRAMEWORK_AGREEMENT = 'DataExchangeGovernance:1.0'
export const DEFAULT_USAGE_PURPOSE = 'cx.core.industrycore:1'

export { USAGE_PURPOSES }

export const isValidUsagePurpose = (value: string): boolean => USAGE_PURPOSES.includes(value.trim())

// A whole number of days, at least one.
export const isValidDurationDays = (value: string): boolean => /^[1-9]\d*$/.test(value.trim())

// The last day of usage must not have passed: the provider would refuse every transfer.
export const isFutureEndDate = (date: string, now = new Date()): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && Date.parse(toPolicyEndDate(date)) > now.getTime()

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
  usageEnd = endDate ? 'date' : 'none',
  durationDays = '',
}: {
  purpose: string
  endDate: string
  usageEnd?: UsageEnd
  durationDays?: string
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
  ...(usageEnd === 'date' && endDate
    ? [
        {
          leftOperand: 'DataUsageEndDate',
          operator: 'eq',
          rightOperand: toPolicyEndDate(endDate),
        },
      ]
    : []),
  // Tractus-X EDC 0.13.0 fails with HTTP 500 on numeric right operands.
  ...(usageEnd === 'duration' && durationDays
    ? [
        {
          leftOperand: 'DataUsageEndDurationDays',
          operator: 'eq',
          rightOperand: String(Number(durationDays.trim())),
        },
      ]
    : []),
]
