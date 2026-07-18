import { GetListParams, GetOneParams, DeleteParams, CreateParams, UpdateParams, GetManyParams } from 'react-admin'
import { httpClient } from '../../shared/httpClient'
import {
  parseBpnGroupFromJsonLd,
  parseGroupBpnsFromJsonLd,
  parseGroupsList,
  serializeBpnGroupToJsonLd,
} from './transformer'
import { BusinessPartnerGroup } from '../../../types/businessPartnerGroup'

const BASE_PATH = '/api/management/v3/business-partner-groups'

async function fetchAllBpnGroups(): Promise<BusinessPartnerGroup[]> {
  const groupsResponse = await httpClient(`${BASE_PATH}/groups`)
  const groupNames = parseGroupsList(groupsResponse.json)

  const groupBpns = await Promise.all(
    groupNames.map(async (group) => {
      const response = await httpClient(`${BASE_PATH}/group/${encodeURIComponent(group)}`)
      return parseGroupBpnsFromJsonLd(response.json)
    }),
  )

  const groupsByBpn = new Map<string, Set<string>>()
  for (const { group, bpns } of groupBpns) {
    for (const bpn of bpns) {
      if (!groupsByBpn.has(bpn)) {
        groupsByBpn.set(bpn, new Set())
      }
      groupsByBpn.get(bpn)!.add(group)
    }
  }

  return Array.from(groupsByBpn.entries()).map(([id, groups]) => ({
    id,
    groups: Array.from(groups),
  }))
}

export async function getList(params: GetListParams) {
  const { page = 1, perPage = 10 } = params.pagination || {}
  const all = await fetchAllBpnGroups()

  const query = (params.filter?.q || params.filter?.id || '').toString().toLowerCase()
  const filtered = query ? all.filter((entry) => entry.id.toLowerCase().includes(query)) : all

  const sortField = params.sort?.field
  const sortOrder = params.sort?.order === 'DESC' ? -1 : 1
  const sorted = sortField
    ? [...filtered].sort((a: any, b: any) => {
        const aValue = String(a[sortField] ?? '')
        const bValue = String(b[sortField] ?? '')
        return aValue.localeCompare(bValue) * sortOrder
      })
    : filtered

  const start = (page - 1) * perPage
  const paged = sorted.slice(start, start + perPage)

  return {
    data: paged,
    total: sorted.length,
  }
}

export async function getOne(params: GetOneParams) {
  const response = await httpClient(`${BASE_PATH}/${encodeURIComponent(params.id)}`)
  const entry = parseBpnGroupFromJsonLd(response.json)

  return { data: entry }
}

export async function create(params: CreateParams) {
  const jsonLdEntry = serializeBpnGroupToJsonLd(params.data)
  await httpClient(BASE_PATH, {
    method: 'POST',
    body: JSON.stringify(jsonLdEntry),
  })

  return {
    data: {
      id: params.data.id,
      groups: params.data.groups || [],
    },
  }
}

export async function update(params: UpdateParams) {
  const jsonLdEntry = serializeBpnGroupToJsonLd(params.data)
  await httpClient(BASE_PATH, {
    method: 'PUT',
    body: JSON.stringify(jsonLdEntry),
  })

  return {
    data: {
      ...params.data,
      id: params.id,
    },
  }
}

export async function remove(params: DeleteParams) {
  await httpClient(`${BASE_PATH}/${encodeURIComponent(params.id)}`, {
    method: 'DELETE',
  })

  return {
    data: { id: params.id },
  }
}

export async function getMany(params: GetManyParams) {
  const results = await Promise.all(
    params.ids.map((id: any) =>
      httpClient(`${BASE_PATH}/${encodeURIComponent(id)}`)
        .then((response) => parseBpnGroupFromJsonLd(response.json))
        .catch(() => null),
    ),
  )

  return {
    data: results.filter((entry): entry is BusinessPartnerGroup => !!entry),
  }
}
