import type { GetListParams, GetOneParams } from 'react-admin'
import type { DataAccessLifecycleRecord } from '../../../types/dataAccess'
import { getAccessRequestContext } from '../../../services/accessRequestContext'
import { httpClient } from '../../shared/httpClient'

interface LifecycleResponse {
  data: DataAccessLifecycleRecord[]
  total: number
}

export async function getList(params: GetListParams) {
  const { page = 1, perPage = 10 } = params.pagination || {}
  const query = paginationQuery(page, perPage)
  if (params.filter?.status) query.set('status', String(params.filter.status))
  const response = await httpClient(`/api/portal/data-access?${query}`)
  const result = response.json as LifecycleResponse
  return { data: result.data.map(enrichWithLocalContext), total: result.total }
}

export async function getOne(params: GetOneParams) {
  const response = await httpClient(`/api/portal/data-access/${encodeURIComponent(String(params.id))}`)
  return { data: enrichWithLocalContext(response.json.data as DataAccessLifecycleRecord) }
}

function paginationQuery(page: number, perPage: number) {
  return new URLSearchParams({ offset: String((page - 1) * perPage), limit: String(perPage) })
}

function enrichWithLocalContext(record: DataAccessLifecycleRecord): DataAccessLifecycleRecord {
  const context = record.negotiationIds.map(getAccessRequestContext).find(Boolean)
  if (!context) return record
  return {
    ...record,
    title: context.datasetTitle,
    dataset: context.dataset,
    catalogUrl: context.catalogId,
    assetId: record.assetId || context.datasetId || '',
    providerId: record.providerId || context.providerId || '',
  }
}
