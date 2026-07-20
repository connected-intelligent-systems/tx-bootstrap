import { describe, expect, it } from 'vitest'
import { planPartnerGroupChanges, toPartnerGroups } from '../../pages/settings/partnerGroupModel'

const first = 'BPNL00000003AYRE'
const second = 'BPNL00000003CSGV'
const third = 'BPNL00000003ZZZZ'

describe('partner group settings model', () => {
  it('presents the BPN-centric API response as group-centric settings data', () => {
    expect(
      toPartnerGroups([
        { id: first, groups: ['suppliers', 'priority'] },
        { id: second, groups: ['suppliers'] },
      ]),
    ).toEqual([
      { name: 'priority', members: [first] },
      { name: 'suppliers', members: [first, second] },
    ])
  })

  it('creates a group while preserving existing assignments', () => {
    expect(
      planPartnerGroupChanges({
        entries: [{ id: first, groups: ['existing'] }],
        name: 'priority',
        members: [first, second],
      }),
    ).toEqual([
      {
        kind: 'update',
        id: first,
        data: { id: first, groups: ['existing', 'priority'] },
        previousData: { id: first, groups: ['existing'] },
      },
      { kind: 'create', data: { id: second, groups: ['priority'] } },
    ])
  })

  it('renames a group and updates its members without touching other groups', () => {
    expect(
      planPartnerGroupChanges({
        entries: [
          { id: first, groups: ['suppliers', 'existing'] },
          { id: second, groups: ['suppliers'] },
          { id: third, groups: ['unrelated'] },
        ],
        previousName: 'suppliers',
        name: 'priority',
        members: [second, third],
      }),
    ).toEqual([
      {
        kind: 'update',
        id: first,
        data: { id: first, groups: ['existing'] },
        previousData: { id: first, groups: ['existing', 'suppliers'] },
      },
      {
        kind: 'update',
        id: second,
        data: { id: second, groups: ['priority'] },
        previousData: { id: second, groups: ['suppliers'] },
      },
      {
        kind: 'update',
        id: third,
        data: { id: third, groups: ['priority', 'unrelated'] },
        previousData: { id: third, groups: ['unrelated'] },
      },
    ])
  })

  it('deletes empty BPN assignments when deleting a group', () => {
    expect(
      planPartnerGroupChanges({
        entries: [
          { id: first, groups: ['priority'] },
          { id: second, groups: ['priority', 'suppliers'] },
        ],
        previousName: 'priority',
        members: [],
      }),
    ).toEqual([
      { kind: 'delete', id: first, previousData: { id: first, groups: ['priority'] } },
      {
        kind: 'update',
        id: second,
        data: { id: second, groups: ['suppliers'] },
        previousData: { id: second, groups: ['priority', 'suppliers'] },
      },
    ])
  })
})
