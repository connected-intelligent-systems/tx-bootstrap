import type { Asset } from './asset'
import type { ContractAgreement } from './contractAgreement'
import type { ContractDefinition } from './contractDefinition'
import type { ContractNegotiation } from './contractNegotiation'
import type { Dataset, DatasetPolicy } from './catalog'
import type { Policy } from './policy'
import type { TransferProcess } from './transferProcess'

export type AccessRequestStatus =
  'request-sent' | 'in-progress' | 'waiting' | 'granted' | 'rejected' | 'ended' | 'unknown'
export type LifecycleFilter = 'all' | 'pending' | 'active' | 'issues'

export interface DataProductOffer {
  id: string
  name: string
  description?: string
  assetIds: string[]
  accessPolicyId?: string
  contractPolicyId?: string
  accessPolicy?: Policy
  contractPolicy?: Policy
  isAdvanced: boolean
  source: ContractDefinition
}

export interface DataProduct {
  id: string
  title: string
  description?: string
  asset: Asset
  offers: DataProductOffer[]
  agreements: ContractAgreement[]
  transfers: TransferProcess[]
  negotiations: ContractNegotiation[]
}

export interface DiscoveredDataProduct {
  id: string
  title: string
  description?: string
  providerId?: string
  catalogId?: string
  dataset: Dataset
  offers: DatasetPolicy[]
  stale?: boolean
  providerName?: string
  participantBpn?: string
  crawledAt?: string
}

export interface AccessRequest {
  id: string
  datasetId?: string
  datasetTitle?: string
  providerId?: string
  offerId?: string
  status: AccessRequestStatus
  negotiation: ContractNegotiation
  agreement?: ContractAgreement
}

export interface DataAccessLifecycle {
  key: string
  datasetId?: string
  title?: string
  providerId?: string
  status: AccessRequestStatus
  requests: AccessRequest[]
  agreements: ContractAgreement[]
  transfers: TransferProcess[]
  updatedAt?: string
  errorDetail?: string
}

export interface DashboardSummary {
  privateProducts: number
  publishedProducts: number
  pendingRequests: number
  activeAccess: number
  failedTransfers: number
}
