import { dataspaceFetch } from '../clients/dataspace-admin-client.js'
import { loadStateRow } from '../db/state-repository.js'

export interface NetworkParticipant {
  name: string
  bpn: string
  did: string
  dspEndpoint: string
}

interface NetworkParticipantResponse {
  participants: NetworkParticipant[]
}

export async function getNetworkParticipants(): Promise<NetworkParticipantResponse> {
  const response = await dataspaceFetch<NetworkParticipantResponse>('/network/participants')
  const state = await loadStateRow()
  const ownBpn = state?.assigned_bpn?.trim()
  return {
    participants: response.participants.filter((participant) => !ownBpn || participant.bpn !== ownBpn),
  }
}
