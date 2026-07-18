import type { Pool } from "pg";

interface NetworkParticipantRow {
  name: string;
  bpn: string;
  did: string;
  dsp_endpoint: string;
}

export interface NetworkParticipant {
  name: string;
  bpn: string;
  did: string;
  dspEndpoint: string;
}

export function createNetworkParticipantService(pool: Pool) {
  return {
    async list(): Promise<NetworkParticipant[]> {
      const result = await pool.query<NetworkParticipantRow>(
        "SELECT name, bpn, did, dsp_endpoint FROM onboarding_public_list_network_participants()",
      );
      return result.rows.map((row) => ({
        name: row.name,
        bpn: row.bpn,
        did: row.did,
        dspEndpoint: row.dsp_endpoint,
      }));
    },
  };
}

export type NetworkParticipantService = ReturnType<
  typeof createNetworkParticipantService
>;
