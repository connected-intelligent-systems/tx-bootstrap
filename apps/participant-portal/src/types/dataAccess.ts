import type { Dataset } from './catalog'

export interface DataAccessLifecycleRecord {
  id: string
  assetId: string
  title?: string
  dataset?: Dataset
  catalogUrl?: string
  providerId: string
  status: 'pending' | 'active' | 'issues'
  updatedAt?: string
  errorDetail?: string
  negotiationState?: string
  latestTransferState?: string
  counterPartyAddress?: string
  agreementId?: string
  negotiationIds: string[]
  agreementCount: number
  requestCount: number
  transferCount: number
  canUseData: boolean
}
