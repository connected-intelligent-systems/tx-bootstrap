import type { LocalCatalog } from '../types/catalog'

interface NetworkParticipant {
  name: string
  bpn: string
  did: string
  dspEndpoint: string
}

interface NetworkParticipantResponse {
  participants: NetworkParticipant[]
}

let networkCatalogs: LocalCatalog[] = []
let directoryError: string | undefined
let loadedAt = 0
let loading: Promise<LocalCatalog[]> | undefined

const normalizeUrl = (value: string) => value.trim().replace(/\/+$/, '').toLowerCase()

export function mapNetworkParticipants(participants: NetworkParticipant[]): LocalCatalog[] {
  return participants.map((participant) => ({
    id: `network:${participant.bpn}`,
    url: participant.dspEndpoint,
    counterPartyId: participant.did,
    participantBpn: participant.bpn,
    name: participant.name,
    description: '',
    isActive: false,
    source: 'network',
  }))
}

async function loadNetworkCatalogs(force = false): Promise<LocalCatalog[]> {
  if (!force && Date.now() - loadedAt < 60_000) return networkCatalogs
  if (loading) return loading
  loading = (async () => {
    try {
      const response = await fetch('/api/portal/network-participants', { headers: { Accept: 'application/json' } })
      const payload = (await response.json().catch(() => ({}))) as Partial<NetworkParticipantResponse> & {
        error?: string
      }
      if (!response.ok) throw new Error(payload.error || `Directory request failed with HTTP ${response.status}`)
      networkCatalogs = mapNetworkParticipants(payload.participants ?? [])
      directoryError = undefined
      loadedAt = Date.now()
      return networkCatalogs
    } catch (error) {
      networkCatalogs = []
      directoryError = error instanceof Error ? error.message : String(error)
      loadedAt = Date.now()
      return []
    } finally {
      loading = undefined
    }
  })()
  return loading
}

export class CatalogConnectionService {
  static async getCatalogs(force = false): Promise<LocalCatalog[]> {
    return loadNetworkCatalogs(force)
  }

  static async getCatalogById(id: string): Promise<LocalCatalog | null> {
    return (await this.getCatalogs()).find((catalog) => catalog.id === id) ?? null
  }

  static async getCatalogByUrl(url: string): Promise<LocalCatalog | null> {
    const normalized = normalizeUrl(url)
    return (await this.getCatalogs()).find((catalog) => normalizeUrl(catalog.url) === normalized) ?? null
  }

  static getDirectoryError(): string | undefined {
    return directoryError
  }

  static invalidate(): void {
    loadedAt = 0
  }
}
