export const lifecycleStatusTone = (status: string) =>
  status === 'active' ? 'granted' : status === 'expired' ? 'ended' : status === 'issues' ? 'failed' : 'in-progress'

export const dataAccessLifecycleId = (providerId: string, assetId: string) => `${providerId}|${assetId}`

export const dataAccessDetailPath = (providerId: string, assetId: string) =>
  `/data-access/${encodeURIComponent(dataAccessLifecycleId(providerId, assetId))}`
