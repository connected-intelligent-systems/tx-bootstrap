export interface FederatedCatalogParticipant {
  name: string
  bpn: string
  did: string
  dspEndpoint: string
}

export interface FederatedCatalogEntry {
  id: string
  datasetId: string
  participant: FederatedCatalogParticipant
  counterPartyAddress: string
  counterPartyId: string
  crawledAt: string
  stale: boolean
  dataset: Record<string, unknown>
}

export interface FederatedCatalogSearchResult {
  items: FederatedCatalogEntry[]
  total: number
  offset: number
  limit: number
}

export interface ParticipantCrawlStatus {
  participant: FederatedCatalogParticipant
  state: 'pending' | 'fresh' | 'degraded' | 'error' | 'inactive'
  datasetCount: number
  lastAttemptAt?: string
  lastSuccessAt?: string
  lastError?: string
  stale: boolean
  active: boolean
}

export async function searchFederatedCatalog(parameters: {
  q?: string
  participantBpn?: string
  theme?: string
  contentType?: string
  offset: number
  limit: number
}): Promise<FederatedCatalogSearchResult> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return requestJson<FederatedCatalogSearchResult>(`/api/federated-catalog/v1/datasets?${query}`)
}

export async function getFederatedCatalogParticipants(): Promise<ParticipantCrawlStatus[]> {
  const response = await requestJson<{ items: ParticipantCrawlStatus[] }>('/api/federated-catalog/v1/participants')
  return response.items
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; detail?: string }
  if (!response.ok) throw new Error(payload.error || payload.detail || `Request failed with HTTP ${response.status}`)
  return payload
}
