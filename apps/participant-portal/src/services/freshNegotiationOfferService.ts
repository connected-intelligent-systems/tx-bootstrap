import type { Dataset, DatasetPolicy } from '../types/catalog'

type DataProviderLike = {
  getOne: (resource: string, params: { id: string; meta?: Record<string, unknown> }) => Promise<{ data: Dataset }>
}

const policyTerms = (policy: DatasetPolicy) =>
  JSON.stringify({
    type: policy.type,
    permissions: policy.permissions || [],
    prohibitions: policy.prohibitions || [],
    obligations: policy.obligations || [],
  })

export async function getFreshNegotiationPolicy(
  dataProvider: DataProviderLike,
  input: {
    counterPartyAddress: string
    counterPartyId?: string
    datasetId: string
    selectedPolicy: DatasetPolicy
  },
): Promise<DatasetPolicy> {
  const catalogId = btoa(input.counterPartyAddress)
  const response = await dataProvider.getOne('datasets', {
    id: `${catalogId}--${input.datasetId}`,
    meta: input.counterPartyId ? { counterPartyId: input.counterPartyId } : undefined,
  })
  const selectedTerms = policyTerms(input.selectedPolicy)
  const currentPolicy = response.data.policies?.find((policy) => policyTerms(policy) === selectedTerms)

  if (!currentPolicy?.raw) {
    throw new Error('The selected offer changed. Review the refreshed offer and try again.')
  }

  return currentPolicy
}
