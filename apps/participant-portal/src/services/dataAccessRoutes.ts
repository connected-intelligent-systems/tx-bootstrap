export const dataAccessLifecycleId = (providerId: string, assetId: string) => `${providerId}|${assetId}`

export const dataAccessDetailPath = (providerId: string, assetId: string) =>
  `/data-access/${encodeURIComponent(dataAccessLifecycleId(providerId, assetId))}`
