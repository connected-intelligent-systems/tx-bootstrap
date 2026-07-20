import type { BusinessPartnerGroup } from '../../types/businessPartnerGroup'

export interface PartnerGroupView {
  name: string
  members: string[]
}

export type PartnerGroupOperation =
  | { kind: 'create'; data: BusinessPartnerGroup }
  | { kind: 'update'; id: string; data: BusinessPartnerGroup; previousData: BusinessPartnerGroup }
  | { kind: 'delete'; id: string; previousData: BusinessPartnerGroup }

const normalizedGroups = (groups: string[]) =>
  Array.from(new Set(groups.map((group) => group.trim()).filter(Boolean))).sort()

export const toPartnerGroups = (entries: BusinessPartnerGroup[]): PartnerGroupView[] => {
  const membersByGroup = new Map<string, Set<string>>()

  for (const entry of entries) {
    for (const group of entry.groups || []) {
      if (!membersByGroup.has(group)) membersByGroup.set(group, new Set())
      membersByGroup.get(group)!.add(entry.id)
    }
  }

  return Array.from(membersByGroup, ([name, members]) => ({
    name,
    members: Array.from(members).sort(),
  })).sort((left, right) => left.name.localeCompare(right.name))
}

export const planPartnerGroupChanges = ({
  entries,
  previousName,
  name,
  members,
}: {
  entries: BusinessPartnerGroup[]
  previousName?: string
  name?: string
  members: string[]
}): PartnerGroupOperation[] => {
  const before = new Map(entries.map((entry) => [entry.id, normalizedGroups(entry.groups || [])]))
  const after = new Map(Array.from(before, ([bpn, groups]) => [bpn, [...groups]]))

  if (previousName) {
    for (const [bpn, groups] of after) {
      after.set(
        bpn,
        groups.filter((group) => group !== previousName),
      )
    }
  }

  const nextName = name?.trim()
  if (nextName) {
    for (const bpn of members) {
      after.set(bpn, normalizedGroups([...(after.get(bpn) || []), nextName]))
    }
  }

  const affectedBpns = Array.from(new Set([...before.keys(), ...after.keys()])).sort()
  return affectedBpns.flatMap((bpn): PartnerGroupOperation[] => {
    const previousGroups = before.get(bpn)
    const nextGroups = normalizedGroups(after.get(bpn) || [])

    if (previousGroups && previousGroups.join('\0') === nextGroups.join('\0')) return []

    const previousData: BusinessPartnerGroup | undefined = previousGroups
      ? { id: bpn, groups: previousGroups }
      : undefined

    if (!previousData) {
      return nextGroups.length ? [{ kind: 'create', data: { id: bpn, groups: nextGroups } }] : []
    }

    if (!nextGroups.length) return [{ kind: 'delete', id: bpn, previousData }]

    return [
      {
        kind: 'update',
        id: bpn,
        data: { id: bpn, groups: nextGroups },
        previousData,
      },
    ]
  })
}
