import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createNetworkParticipantService } from "./network-participant-service.js";

describe("network participant service", () => {
  it("maps only the public directory fields", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          name: "Example GmbH",
          bpn: "BPNL000000000001",
          did: "did:web:example:BPNL000000000001",
          dsp_endpoint: "https://example.test/api/v1/dsp",
          contact_email: "must-not-leak@example.test",
        },
      ],
    });
    const service = createNetworkParticipantService({
      query,
    } as unknown as Pool);

    await expect(service.list()).resolves.toEqual([
      {
        name: "Example GmbH",
        bpn: "BPNL000000000001",
        did: "did:web:example:BPNL000000000001",
        dspEndpoint: "https://example.test/api/v1/dsp",
      },
    ]);
  });
});
