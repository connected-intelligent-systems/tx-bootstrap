import { describe, expect, it } from "vitest";
import {
  createStandardFastifyApp,
  registerStandardErrorHandler,
} from "./app.js";

describe("standard Fastify error handler", () => {
  it("redacts unexpected server-error details from responses", async () => {
    const app = createTestApp();
    app.get("/failure", async () => {
      throw new Error("database password appeared in an upstream error");
    });

    const response = await app.inject({ method: "GET", url: "/failure" });
    await app.close();

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "Internal server error",
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain("database password");
  });

  it("retains actionable client-error messages", async () => {
    const app = createTestApp();
    app.get("/conflict", async () => {
      throw Object.assign(new Error("Participant already exists"), {
        status: 409,
      });
    });

    const response = await app.inject({ method: "GET", url: "/conflict" });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "Participant already exists",
      requestId: expect.any(String),
    });
  });
});

function createTestApp() {
  const app = createStandardFastifyApp({
    logLevel: "fatal",
    prettyLogs: false,
  });
  registerStandardErrorHandler(app);
  return app;
}
