import { CreateParams, DeleteParams, GetListParams } from 'react-admin'
import type { ContractAgreementRetirement } from '../../../types/contractAgreementRetirement'
import { buildQuerySpec, compactJsonLdArray } from '../../shared/helpers'
import { httpClient } from '../../shared/httpClient'

const RETIREMENT_CONTEXT = {
  '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
  tx: 'https://w3id.org/tractusx/v0.0.1/ns/',
}

const frame = { '@context': RETIREMENT_CONTEXT }

function parseRetirement(entry: any): ContractAgreementRetirement {
  const agreementId = entry.agreementId || entry['edc:agreementId'] || entry['@id']
  return {
    id: agreementId,
    agreementId,
    reason: entry['tx:reason'] || entry.reason || '',
    retirementDate: entry['tx:agreementRetirementDate'] || entry.agreementRetirementDate,
  }
}

export async function getList(params: GetListParams) {
  const { page = 1, perPage = 100 } = params.pagination || {}
  // This endpoint rejects sortField, so only server-side pagination and filters are forwarded.
  const querySpec = buildQuerySpec({ pagination: params.pagination, filter: params.filter }, (key, value) =>
    key === 'agreementIds' ? { field: 'agreementId', operator: 'in', value } : { field: key, operator: '=', value },
  )
  const response = await httpClient(`/api/management/v3/contractagreements/retirements/request`, {
    method: 'POST',
    body: JSON.stringify(querySpec),
  })

  const entries = response.json
  const framedEntries = await compactJsonLdArray(entries, frame)
  const data = framedEntries.map(parseRetirement)
  return {
    data,
    pageInfo: {
      hasNextPage: entries.length === perPage,
      hasPreviousPage: page > 1,
    },
  }
}

export async function create(params: CreateParams) {
  const payload = {
    '@context': RETIREMENT_CONTEXT,
    '@type': 'AgreementsRetirementEntry',
    agreementId: params.data.id,
    'tx:reason': params.data.reason,
  }
  await httpClient(`/api/management/v3/contractagreements/retirements`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return {
    data: {
      id: params.data.id,
      agreementId: params.data.id,
      reason: params.data.reason || '',
      state: 'RETIRED',
    },
  }
}

export async function remove(params: DeleteParams) {
  await httpClient(`/api/management/v3/contractagreements/retirements/${params.id}`, { method: 'DELETE' })
  return { data: { id: params.id } }
}
