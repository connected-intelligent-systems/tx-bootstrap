import type { Asset } from '../types/asset'
import type { ContractAgreement } from '../types/contractAgreement'
import type { ContractDefinition } from '../types/contractDefinition'
import type { ContractNegotiation } from '../types/contractNegotiation'
import type { Dataset, DatasetPolicy } from '../types/catalog'
import type {
  AccessRequest,
  AccessRequestStatus,
  DashboardSummary,
  DataAccessLifecycle,
  DataProduct,
  DataProductOffer,
  DiscoveredDataProduct,
  LifecycleFilter,
} from '../types/dataProduct'
import type { Policy } from '../types/policy'
import type { TransferProcess } from '../types/transferProcess'
import { mergeAccessRequestContext } from './accessRequestContext'

const pendingStates = new Set([
  'INITIAL',
  'REQUESTING',
  'REQUESTED',
  'OFFERING',
  'OFFERED',
  'ACCEPTING',
  'ACCEPTED',
  'AGREEING',
  'AGREED',
  'VERIFYING',
  'VERIFIED',
  'FINALIZING',
])
const issueTransferStates = new Set(['FAILED', 'ERROR', 'TERMINATED'])
const supportedOperands = new Set([
  'Membership',
  'BusinessPartnerNumber',
  'BusinessPartnerGroup',
  'FrameworkAgreement',
  'UsagePurpose',
  'DataUsageEndDate',
])

export const getAccessRequestStatus = (negotiation: ContractNegotiation): AccessRequestStatus => {
  if (negotiation.contractAgreementId || negotiation.state === 'FINALIZED') return 'granted'
  if (['DECLINING', 'DECLINED'].includes(negotiation.state)) return 'rejected'
  if (['TERMINATING', 'TERMINATED'].includes(negotiation.state)) return 'ended'
  if (pendingStates.has(negotiation.state))
    return ['REQUESTING', 'REQUESTED'].includes(negotiation.state) ? 'request-sent' : 'in-progress'
  return 'unknown'
}

export const isBusinessEditableOffer = (offer: DataProductOffer) => {
  if (!offer.accessPolicy || !offer.contractPolicy || offer.assetIds.length !== 1) return false
  const rules = [...(offer.accessPolicy.rules?.permissions ?? []), ...(offer.contractPolicy.rules?.permissions ?? [])]
  return rules
    .flatMap((rule) => rule.constraints ?? [])
    .every((constraint) => supportedOperands.has(constraint.leftOperand))
}

export const toDataProductOffer = (definition: ContractDefinition, policies: Policy[]): DataProductOffer => {
  const accessPolicy = policies.find((policy) => policy.id === definition.accessPolicyId)
  const contractPolicy = policies.find((policy) => policy.id === definition.contractPolicyId)
  const offer: DataProductOffer = {
    id: definition.id,
    name: definition.privateProperties?.name || 'Published offer',
    description: definition.privateProperties?.description,
    assetIds: definition.assetsSelector || [],
    accessPolicyId: definition.accessPolicyId,
    contractPolicyId: definition.contractPolicyId,
    accessPolicy,
    contractPolicy,
    isAdvanced: false,
    source: definition,
  }
  offer.isAdvanced = !isBusinessEditableOffer(offer)
  return offer
}

export const toDataProduct = (
  asset: Asset,
  definitions: ContractDefinition[],
  policies: Policy[],
  agreements: ContractAgreement[],
  transfers: TransferProcess[],
  negotiations: ContractNegotiation[],
): DataProduct => ({
  id: asset.id,
  title: asset.title || 'Untitled data product',
  description: asset.abstract || asset.description,
  asset,
  offers: definitions
    .filter((definition) => definition.assetsSelector?.includes(asset.id))
    .map((definition) => toDataProductOffer(definition, policies)),
  agreements: agreements.filter((agreement) => agreement.assetId === asset.id),
  transfers: transfers.filter((transfer) => transfer.assetId === asset.id),
  negotiations: negotiations.filter((negotiation) => negotiation.datasetId === asset.id),
})

export const toDiscoveredDataProduct = (dataset: Dataset, catalogId?: string): DiscoveredDataProduct => ({
  id: `${catalogId || 'catalog'}--${dataset.id}`,
  title: dataset.title || 'Untitled data product',
  description: dataset.abstract || dataset.description,
  providerId: dataset.participantId,
  catalogId,
  dataset,
  offers: dataset.policies || [],
})

export const toAccessRequest = (negotiation: ContractNegotiation): AccessRequest =>
  mergeAccessRequestContext({
    id: negotiation.id,
    datasetId: negotiation.datasetId,
    providerId: negotiation.counterPartyId,
    status: getAccessRequestStatus(negotiation),
    negotiation,
  })

const requestTime = (request: AccessRequest) => request.negotiation.updatedAt || request.negotiation.createdAt

export const buildDataAccessLifecycles = (
  negotiations: ContractNegotiation[],
  agreements: ContractAgreement[],
  transfers: TransferProcess[],
): DataAccessLifecycle[] => {
  const requests = negotiations.filter((item) => item.type === 'CONSUMER').map(toAccessRequest)
  const groups = new Map<string, DataAccessLifecycle>()

  const ensure = (providerId?: string, datasetId?: string, title?: string) => {
    const key = `${providerId || 'unknown'}|${datasetId || 'unknown'}`
    if (!groups.has(key))
      groups.set(key, {
        key,
        providerId,
        datasetId,
        title,
        status: 'unknown',
        requests: [],
        agreements: [],
        transfers: [],
      })
    const group = groups.get(key)!
    group.title ||= title
    return group
  }

  for (const request of requests) {
    const group = ensure(request.providerId, request.datasetId, request.datasetTitle)
    group.requests.push(request)
  }

  for (const agreement of agreements) {
    const request = requests.find((candidate) => candidate.negotiation.contractAgreementId === agreement.id)
    const group = ensure(agreement.providerId, request?.datasetId || agreement.assetId, request?.datasetTitle)
    group.agreements.push(agreement)
  }

  for (const transfer of transfers) {
    const agreement = agreements.find(
      (candidate) => candidate.id === transfer.contractId || candidate.assetId === transfer.assetId,
    )
    const request = agreement
      ? requests.find((candidate) => candidate.negotiation.contractAgreementId === agreement.id)
      : undefined
    const group = ensure(agreement?.providerId, request?.datasetId || transfer.assetId, request?.datasetTitle)
    group.transfers.push(transfer)
  }

  for (const group of groups.values()) {
    group.requests.sort((a, b) => String(requestTime(b)).localeCompare(String(requestTime(a))))
    const latest = group.requests[0]
    group.status =
      group.agreements.length > 0 ? 'granted' : latest?.status || (group.transfers.length > 0 ? 'granted' : 'unknown')
    group.updatedAt = [
      latest && requestTime(latest),
      ...group.agreements.map((item) => item.contractSigningDate),
      ...group.transfers.map((item) => item.updatedAt || item.createdAt || item.stateTimestamp),
    ]
      .filter(Boolean)
      .sort()
      .at(-1)
    group.errorDetail = latest?.negotiation.errorDetail || group.transfers.find((item) => item.errorDetail)?.errorDetail
  }

  return [...groups.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export const lifecycleMatchesFilter = (lifecycle: DataAccessLifecycle, filter: LifecycleFilter) => {
  if (filter === 'all') return true
  if (filter === 'active') return lifecycle.status === 'granted'
  if (filter === 'issues')
    return ['rejected', 'ended', 'unknown'].includes(lifecycle.status) || Boolean(lifecycle.errorDetail)
  return ['request-sent', 'in-progress', 'waiting'].includes(lifecycle.status)
}

export const buildDashboardSummary = (
  assets: Asset[],
  definitions: ContractDefinition[],
  negotiations: ContractNegotiation[],
  agreements: ContractAgreement[],
  transfers: TransferProcess[],
): DashboardSummary => {
  const publishedIds = new Set(definitions.flatMap((definition) => definition.assetsSelector || []))
  const consumerRequests = negotiations.filter((item) => item.type === 'CONSUMER')
  return {
    privateProducts: assets.filter((asset) => !publishedIds.has(asset.id)).length,
    publishedProducts: assets.filter((asset) => publishedIds.has(asset.id)).length,
    pendingRequests: consumerRequests.filter((item) =>
      ['request-sent', 'in-progress', 'waiting'].includes(getAccessRequestStatus(item)),
    ).length,
    activeAccess: agreements.length,
    failedTransfers: transfers.filter((item) => issueTransferStates.has(item.state)).length,
  }
}

export const policySummary = (policy?: Policy | DatasetPolicy) => {
  if (!policy) return 'policy.none'
  const rules = 'rules' in policy ? policy.rules?.permissions || [] : policy.permissions || []
  if (rules.length === 0) return 'policy.unrestricted'
  return rules
    .flatMap((rule: any) => rule.constraints || [])
    .map((constraint: any) => {
      const label = String(constraint.leftOperand).replace(/([a-z])([A-Z])/g, '$1 $2')
      const value = Array.isArray(constraint.rightOperand)
        ? constraint.rightOperand.join(', ')
        : constraint.rightOperand
      return `${label}: ${value}`
    })
    .join(' · ')
}
