import type { DataAccessLifecycleRecord } from '../types/dataAccess'
import type { TransferProcess } from '../types/transferProcess'

// Using data means one HTTP-pull transfer per agreement: once started, the
// participant's data proxy serves the data and refreshes its credentials.
export const HTTP_PULL = 'HttpData-PULL'
export const PUSH_TRANSFER_TYPES = ['HttpData-PUSH', 'AmazonS3-PUSH', 'AzureStorage-PUSH']

export type DataAccessState = 'none' | 'preparing' | 'ready' | 'failed'

const ENDED_STATES = new Set([
  'COMPLETING',
  'COMPLETING_REQUESTED',
  'COMPLETED',
  'SUSPENDING',
  'SUSPENDING_REQUESTED',
  'SUSPENDED',
  'DEPROVISIONING',
  'DEPROVISIONING_REQUESTED',
  'DEPROVISIONED',
])
const TERMINATED_STATES = new Set(['TERMINATING', 'TERMINATING_REQUESTED', 'TERMINATED'])

export function dataAccessState(transfer?: TransferProcess): DataAccessState {
  const state = transfer?.state?.toUpperCase()
  if (!state) return 'none'
  if (state === 'STARTED') return 'ready'
  if (state === 'FAILED') return 'failed'
  // A refused transfer is terminated with the provider's reason; one ended by
  // the consumer has none and can simply be started again.
  if (TERMINATED_STATES.has(state)) return transfer?.errorDetail ? 'failed' : 'none'
  if (ENDED_STATES.has(state)) return 'none'
  return 'preparing'
}

type TransferCreator = {
  create: (resource: string, params: { data: Record<string, unknown> }) => Promise<{ data: { id?: unknown } }>
}

export async function startDataAccess(dataProvider: TransferCreator, lifecycle: DataAccessLifecycleRecord) {
  const response = await dataProvider.create('transferprocesses', {
    data: {
      counterPartyAddress: lifecycle.counterPartyAddress,
      counterPartyId: lifecycle.providerId,
      protocol: lifecycle.protocol,
      contractId: lifecycle.agreementId,
      assetId: lifecycle.assetId,
      transferType: HTTP_PULL,
    },
  })
  return response.data
}
