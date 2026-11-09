import { describe, expect, it } from "vitest";
import { formatDuration, tunnelSetupText } from "./network-api";

describe("tunnel setup text", () => {
  it("lists deployment-neutral settings and the key", () => {
    const text = tunnelSetupText(
      {
        deploymentId: "2b0d5a3e-0d0c-4a8e-9c55-0d8e3c3b8f11",
        controlUrl: "https://headscale.example.org",
        hostname: "bpnl000000000001",
        publicHost: "bpnl000000000001.tunnel.example.org",
        tag: "tag:txb-participant",
        state: "ISSUED",
        enrollmentExpiresAt: "2026-11-15T12:00:00.000Z",
        createdAt: "2026-11-08T12:00:00.000Z",
        authKey: "hskey-auth-abc",
        participantEnv: {
          HEADSCALE_URL: "https://headscale.example.org",
          TAILNET_HOSTNAME: "bpnl000000000001",
        },
      },
      ["# Registration token: secret"],
    );
    expect(text.split("\n")).toEqual([
      "# Registration token: secret",
      "# Operator tunnel for bpnl000000000001.tunnel.example.org",
      "# TAILNET_AUTHKEY is secret, single-use and valid until 2026-11-15T12:00:00.000Z.",
      "HEADSCALE_URL=https://headscale.example.org",
      "TAILNET_HOSTNAME=bpnl000000000001",
      "TAILNET_AUTHKEY=hskey-auth-abc",
    ]);
  });

  it("formats TTLs", () => {
    expect(formatDuration(604800)).toBe("7 days");
    expect(formatDuration(3600)).toBe("1 hour");
    expect(formatDuration(900)).toBe("15 minutes");
  });
});
