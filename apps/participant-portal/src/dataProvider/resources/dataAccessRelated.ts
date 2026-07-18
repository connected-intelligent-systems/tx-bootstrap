import type { GetListParams } from 'react-admin'
import { httpClient } from '../shared/httpClient'

type Relation = 'negotiations' | 'agreements' | 'transfers'

const getRelatedList = (relation: Relation) => async (params: GetListParams) => {
  const lifecycleId = String(params.filter?.lifecycleId || '')
  if (!lifecycleId) return { data: [], total: 0 }
  const { page = 1, perPage = 10 } = params.pagination || {}
  const query = new URLSearchParams({
    offset: String((page - 1) * perPage),
    limit: String(perPage),
  })
  const response = await httpClient(`/api/portal/data-access/${encodeURIComponent(lifecycleId)}/${relation}?${query}`)
  return response.json
}

export const getNegotiationList = getRelatedList('negotiations')
export const getAgreementList = getRelatedList('agreements')
export const getTransferList = getRelatedList('transfers')
