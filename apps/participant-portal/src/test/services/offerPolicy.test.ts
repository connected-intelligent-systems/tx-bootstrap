import { describe, expect, it } from 'vitest'
import {
  buildAccessConstraints,
  buildUsageConstraints,
  FRAMEWORK_AGREEMENT,
  invalidBpns,
  isFutureEndDate,
  isValidDurationDays,
  isValidUsagePurpose,
  USAGE_PURPOSES,
  parseBpns,
  toDateInputValue,
} from '../../pages/dataProducts/offerPolicy'

describe('data product offer policies', () => {
  it('requires active Catena-X membership for member offers', () => {
    expect(buildAccessConstraints({ audience: 'members', partners: '', group: '' })).toEqual([
      { leftOperand: 'Membership', operator: 'eq', rightOperand: 'active' },
    ])
  })

  it('combines membership with normalized, unique partner BPNLs', () => {
    expect(
      buildAccessConstraints({
        audience: 'partners',
        partners: ' bpnl00000003ayre, BPNL00000003AYRE, BPNL00000003CSGV ',
        group: '',
      }),
    ).toEqual([
      { leftOperand: 'Membership', operator: 'eq', rightOperand: 'active' },
      {
        leftOperand: 'BusinessPartnerNumber',
        operator: 'isAnyOf',
        rightOperand: ['BPNL00000003AYRE', 'BPNL00000003CSGV'],
      },
    ])
  })

  it('uses the Tractus-X list operator for business partner groups', () => {
    expect(buildAccessConstraints({ audience: 'group', partners: '', group: 'gold-partners' })).toEqual([
      { leftOperand: 'Membership', operator: 'eq', rightOperand: 'active' },
      {
        leftOperand: 'BusinessPartnerGroup',
        operator: 'isAnyOf',
        rightOperand: ['gold-partners'],
      },
    ])
  })

  it('always emits the mandatory usage constraints', () => {
    expect(buildUsageConstraints({ purpose: 'cx.core.industrycore:1', endDate: '' })).toEqual([
      { leftOperand: 'FrameworkAgreement', operator: 'eq', rightOperand: FRAMEWORK_AGREEMENT },
      { leftOperand: 'UsagePurpose', operator: 'isAnyOf', rightOperand: ['cx.core.industrycore:1'] },
    ])
  })

  it('emits a schema-compatible usage end timestamp', () => {
    expect(buildUsageConstraints({ purpose: 'cx.logistics.base:1', endDate: '2027-01-31' })).toContainEqual({
      leftOperand: 'DataUsageEndDate',
      operator: 'eq',
      rightOperand: '2027-01-31T23:59:59Z',
    })
    expect(toDateInputValue('2027-01-31T23:59:59Z')).toBe('2027-01-31')
  })

  it('validates and normalizes constrained dialog values', () => {
    expect(parseBpns('bpnl00000003ayre,\nBPNL00000003AYRE')).toEqual(['BPNL00000003AYRE'])
    expect(invalidBpns('BPNL00000003AYRE, invalid')).toEqual(['INVALID'])
    expect(isValidUsagePurpose('cx.core.industrycore:1')).toBe(true)
    expect(isValidUsagePurpose('industrycore')).toBe(false)
    expect(isValidUsagePurpose('cx.core.industryCore:1')).toBe(false)
  })

  it('offers the usage purposes of the Tractus-X policy schema', () => {
    expect(USAGE_PURPOSES).toHaveLength(33)
    expect(USAGE_PURPOSES).toContain('cx.pcf.base:1')
  })

  it('ends usage a number of days after the agreement', () => {
    expect(
      buildUsageConstraints({
        purpose: 'cx.core.industrycore:1',
        endDate: '',
        usageEnd: 'duration',
        durationDays: '30',
      }),
    ).toContainEqual({ leftOperand: 'DataUsageEndDurationDays', operator: 'eq', rightOperand: '30' })
    expect(
      buildUsageConstraints({ purpose: 'cx.core.industrycore:1', endDate: '2027-01-31', usageEnd: 'none' }),
    ).toHaveLength(2)
    expect(isValidDurationDays('30')).toBe(true)
    expect(isValidDurationDays('0')).toBe(false)
    expect(isValidDurationDays('1.5')).toBe(false)
  })

  it('accepts only usage end dates that have not passed', () => {
    const now = new Date('2026-11-13T12:00:00Z')
    expect(isFutureEndDate('2026-11-13', now)).toBe(true)
    expect(isFutureEndDate('2026-11-12', now)).toBe(false)
    expect(isFutureEndDate('', now)).toBe(false)
  })
})
