import { useMemo } from 'react'
import { useGetList, useGetMany, useGetOne } from 'react-admin'
import type { Asset } from '../../types/asset'
import type { ContractAgreement } from '../../types/contractAgreement'
import type { ContractAgreementRetirement } from '../../types/contractAgreementRetirement'
import type { ContractDefinition } from '../../types/contractDefinition'
import type { ContractNegotiation } from '../../types/contractNegotiation'
import type { Policy } from '../../types/policy'
import type { TransferProcess } from '../../types/transferProcess'
import { toDataProduct } from '../../services/dataProductViewModels'

const PAGE_SIZE = 100

export const useDataProductDetails = (assetId?: string) => {
  const queryEnabled = Boolean(assetId)
  const assetQuery = useGetOne<Asset>('assets', { id: assetId || '' }, { enabled: queryEnabled })
  const definitions = useGetList<ContractDefinition>(
    'contractdefinitions',
    {
      pagination: { page: 1, perPage: PAGE_SIZE },
      sort: { field: 'id', order: 'ASC' },
      filter: { assetId },
    },
    { enabled: queryEnabled },
  )
  const agreements = useGetList<ContractAgreement>(
    'contractagreements',
    {
      pagination: { page: 1, perPage: PAGE_SIZE },
      sort: { field: 'contractSigningDate', order: 'DESC' },
      filter: { assetId },
    },
    { enabled: queryEnabled },
  )
  const transfers = useGetList<TransferProcess>(
    'transferprocesses',
    {
      pagination: { page: 1, perPage: PAGE_SIZE },
      sort: { field: 'stateTimestamp', order: 'DESC' },
      filter: { assetId },
    },
    { enabled: queryEnabled },
  )
  const negotiations = useGetList<ContractNegotiation>(
    'contractnegotiations',
    {
      pagination: { page: 1, perPage: PAGE_SIZE },
      sort: { field: 'createdAt', order: 'DESC' },
      filter: { assetId },
    },
    { enabled: queryEnabled },
  )
  const policyIds = useMemo(
    () =>
      [...new Set((definitions.data || []).flatMap((item) => [item.accessPolicyId, item.contractPolicyId]))].filter(
        Boolean,
      ),
    [definitions.data],
  )
  const policies = useGetMany<Policy>('policies', { ids: policyIds })
  const agreementIds = useMemo(() => (agreements.data || []).map((item) => item.id), [agreements.data])
  const retirements = useGetList<ContractAgreementRetirement>(
    'contractagreementretirements',
    {
      pagination: { page: 1, perPage: PAGE_SIZE },
      sort: { field: 'id', order: 'ASC' },
      filter: { agreementIds },
    },
    { enabled: agreementIds.length > 0, placeholderData: { data: [], total: 0 } },
  )

  const asset = assetQuery.data
  const product = useMemo(
    () =>
      asset
        ? toDataProduct(
            asset,
            definitions.data || [],
            policies.data || [],
            agreements.data || [],
            transfers.data || [],
            negotiations.data || [],
          )
        : undefined,
    [agreements.data, asset, definitions.data, negotiations.data, policies.data, transfers.data],
  )
  const retiredIds = useMemo(
    () => new Set((retirements.data || []).map((item) => item.agreementId)),
    [retirements.data],
  )
  const relatedPending =
    definitions.isPending ||
    policies.isPending ||
    agreements.isPending ||
    transfers.isPending ||
    negotiations.isPending ||
    retirements.isPending
  const relatedErrors = [
    definitions.error,
    policies.error,
    agreements.error,
    transfers.error,
    negotiations.error,
    retirements.error,
  ].filter(Boolean)
  const refresh = () => {
    assetQuery.refetch()
    definitions.refetch()
    policies.refetch()
    agreements.refetch()
    transfers.refetch()
    negotiations.refetch()
    retirements.refetch()
  }

  return {
    asset,
    assetQuery,
    product,
    retiredIds,
    relatedPending,
    relatedErrors,
    refresh,
    refetchDefinitions: definitions.refetch,
    refetchPolicies: policies.refetch,
    refetchAgreements: agreements.refetch,
    refetchTransfers: transfers.refetch,
    refetchNegotiations: negotiations.refetch,
    refetchRetirements: retirements.refetch,
  }
}
