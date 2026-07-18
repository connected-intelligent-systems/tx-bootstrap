import fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { Auth } from "../http/auth.js";
import type { OperatorController } from "../controllers/operator-controller.js";
import type { HealthService } from "@tx-bootstrap/core/server/services/health-service.js";
import { createApiRoutes } from "./api-routes.js";

describe("operator console routes", () => {
  it("passes Fastify parsed JSON bodies to participant actions", async () => {
    const handleAdminParticipant = vi.fn(async () => {
      const error = new Error("captured") as Error & { statusCode?: number };
      error.statusCode = 418;
      throw error;
    });
    const app = fastify({ logger: false });
    await app.register(createApiRoutes, {
      prefix: "/api",
      auth: fakeAuth(),
      controller: {
        listParticipants: vi.fn(),
        createParticipant: vi.fn(),
        handleAdminParticipant,
      } as unknown as OperatorController,
      healthService: fakeHealthService(),
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/admin/participants/participant-1/organization",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ legalName: "New Org GmbH" }),
    });
    await app.close();

    expect(response.statusCode).toBe(418);
    expect(handleAdminParticipant).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "participant-1",
      "organization",
      { legalName: "New Org GmbH" },
    );
  });
  it("returns participant audit events without route-schema validation errors", async () => {
    const getParticipantEvents = vi
      .fn()
      .mockResolvedValue([{ action: "participant.technical_setup_completed" }]);
    const app = fastify({ logger: false });
    await app.register(createApiRoutes, {
      prefix: "/api",
      auth: fakeAuth(),
      controller: { getParticipantEvents } as unknown as OperatorController,
      healthService: fakeHealthService(),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/participants/participant-1/events",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { action: "participant.technical_setup_completed" },
    ]);
    expect(getParticipantEvents).toHaveBeenCalledWith("participant-1");
  });

  it("returns 503 when a health dependency is unhealthy", async () => {
    const app = fastify({ logger: false });
    await app.register(createApiRoutes, {
      prefix: "/api",
      auth: fakeAuth(),
      controller: {} as OperatorController,
      healthService: fakeHealthService("unhealthy"),
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe("unhealthy");
  });
});

function fakeAuth(): Auth {
  return {
    requireAdmin: vi.fn(),
    eventActor: vi.fn(() => "operator"),
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
