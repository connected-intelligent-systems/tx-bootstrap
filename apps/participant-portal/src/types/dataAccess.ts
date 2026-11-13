import type { Dataset } from './catalog'
import type { TransferProcess } from './transferProcess'

export interface DataAccessLifecycleRecord {
  id: string
  assetId: string
  title?: string
  dataset?: Dataset
  catalogUrl?: string
  providerId: string
  status: 'pending' | 'active' | 'expired' | 'issues'
  updatedAt?: string
  usageEndsAt?: string
  accessTransfer?: TransferProcess
  errorDetail?: string
  negotiationState?: string
  latestTransferState?: string
  counterPartyAddress?: string
  protocol?: string
  agreementId?: string
  negotiationIds: string[]
  agreementCount: number
  requestCount: number
  transferCount: number
  canUseData: boolean
}
