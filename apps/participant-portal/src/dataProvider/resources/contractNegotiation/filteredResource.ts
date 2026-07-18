import type { GetListParams } from 'react-admin'
import { httpClient } from '../../shared/httpClient'
import { getList as getUnfilteredList } from './resource'
import { parseContractNegotiationFromJsonLdArray } from './transformer'

export async function getList(params: GetListParams) {
  const assetId = params.filter?.assetId
  if (!assetId) return getUnfilteredList(params)

  const { page = 1, perPage = 100 } = params.pagination || {}
  const query = new URLSearchParams({
    offset: String((page - 1) * perPage),
    limit: String(perPage),
  })
  const response = await httpClient(
    `/api/portal/data-products/${encodeURIComponent(String(assetId))}/negotiations?${query}`,
  )
  const data = await parseContractNegotiationFromJsonLdArray(response.json.data)

  return {
    data,
    total: response.json.total,
  }
}
