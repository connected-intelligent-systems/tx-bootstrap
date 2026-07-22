import { describe, expect, it } from "vitest";
import type { Config } from "../config/index.js";
import { credentialDefinitions } from "@tx-bootstrap/core/server/domain/credential-definitions.js";
import type { HealthService } from "@tx-bootstrap/core/server/services/health-service.js";
import type { PublicOnboardingService } from "../services/public-onboarding-service.js";
import type { NetworkParticipantService } from "../services/network-participant-service.js";
import { createApp } from "../app.js";

const config = {
  port: 0,
  logLevel: "fatal",
  corsOrigins: ["*"],
  enableRateLimit: false,
  rateLimit: { max: 10, timeWindow: "1 minute" },
  database: { url: "" },
  issuer: { did: "did:web:issuer:BPNL00000003CRHK", credentialDefinitions },
  email: {
    enabled: false,
    host: "localhost",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    from: "test@test.com",
    fromName: "Test",
  },
  publicUrl: "http://localhost:3000",
} as Config;

describe("operator onboarding service routes", () => {
  it("does not expose admin routes", async () => {
    const app = createApp({
      config,
      healthService: fakeHealthService(),
      publicOnboardingService: fakePublicOnboardingService(),
      networkParticipantService: fakeNetworkParticipantService(),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/participants",
    });
    await app.close();

    expect(response.statusCode).toBe(404);
  });

  it("exposes a health endpoint with database connectivity", async () => {
    const app = createApp({
      config,
      healthService: fakeHealthService(),
      publicOnboardingService: fakePublicOnboardingService(),
      networkParticipantService: fakeNetworkParticipantService(),
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("healthy");
  });

  it("returns 503 when a health dependency is unhealthy", async () => {
    const app = createApp({
      config,
      healthService: fakeHealthService("unhealthy"),
      publicOnboardingService: fakePublicOnboardingService(),
      networkParticipantService: fakeNetworkParticipantService(),
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe("unhealthy");
  });

  it("keeps health probes outside the global rate limit", async () => {
    const app = createApp({
      config: {
        ...config,
        enableRateLimit: true,
        rateLimit: { max: 1, timeWindow: "1 minute" },
      },
      healthService: fakeHealthService(),
      publicOnboardingService: fakePublicOnboardingService(),
      networkParticipantService: fakeNetworkParticipantService(),
    });

    const first = await app.inject({ method: "GET", url: "/api/health" });
    const second = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });

  it("exposes the cacheable public participant directory", async () => {
    const app = createApp({
      config,
      healthService: fakeHealthService(),
      publicOnboardingService: fakePublicOnboardingService(),
      networkParticipantService: fakeNetworkParticipantService(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/network/participants",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
    expect(response.json()).toEqual({
      participants: [
        {
          name: "Example GmbH",
          bpn: "BPNL000000000001",
          did: "did:web:example:BPNL000000000001",
          dspEndpoint: "https://example.test/api/v1/dsp",
        },
      ],
    });
  });
});

function fakeNetworkParticipantService(): NetworkParticipantService {
  return {
    list: async () => [
      {
        name: "Example GmbH",
        bpn: "BPNL000000000001",
        did: "did:web:example:BPNL000000000001",
        dspEndpoint: "https://example.test/api/v1/dsp",
      },
    ],
  };
}

function fakePublicOnboardingService(): PublicOnboardingService {
  return {
    handleParticipantCase: async () => undefined,
    resendToken: async () => undefined,
  };
}

function fakeHealthService(
  status: "healthy" | "unhealthy" = "healthy",
): HealthService {
  return {
    getHealth: async () => ({
      status,
      checks: {
        database: { status },
      },
      timestamp: "2026-01-01T00:00:00.000Z",
      responseTime: 1,
    }),
  };
}
