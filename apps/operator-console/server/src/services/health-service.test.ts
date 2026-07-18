import { describe, expect, it, vi } from "vitest";
import { createHealthService } from "@tx-bootstrap/core/server/services/health-service.js";

describe("health service", () => {
  it("reports healthy when the database check succeeds", async () => {
    const service = createHealthService({
      healthRepository: { checkDatabase: vi.fn().mockResolvedValue(undefined) },
    });

    const report = await service.getHealth();

    expect(report.status).toBe("healthy");
    expect(report.checks.database.status).toBe("healthy");
  });

  it("reports unhealthy when the database check fails", async () => {
    const service = createHealthService({
      healthRepository: {
        checkDatabase: vi.fn().mockRejectedValue(new Error("database down")),
      },
    });

    const report = await service.getHealth();

    expect(report.status).toBe("unhealthy");
    expect(report.checks.database).toMatchObject({
      status: "unhealthy",
      error: "database down",
    });
  });
});
