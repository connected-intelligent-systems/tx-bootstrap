import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import {
  readJson,
  toHttpValidationError,
} from "@tx-bootstrap/core/server/http/body.js";

// Helper to create a mock request with body
function createMockRequest(body: string): IncomingMessage {
  const readable = Readable.from([body]);
  return readable as unknown as IncomingMessage;
}

describe("readJson", () => {
  it("should parse valid JSON without schema", async () => {
    const request = createMockRequest('{"name":"test","count":42}');
    const result = await readJson(request);
    expect(result).toEqual({ name: "test", count: 42 });
  });

  it("should parse empty body as empty object", async () => {
    const request = createMockRequest("");
    const result = await readJson(request);
    expect(result).toEqual({});
  });

  it("should throw error for invalid JSON", async () => {
    const request = createMockRequest("not valid json");
    await expect(readJson(request)).rejects.toThrow("Invalid JSON body");
  });

  it("should reject JSON bodies larger than the configured limit", async () => {
    const request = createMockRequest('{"value":"too-large"}');
    await expect(
      readJson(request, undefined, { maxBytes: 8 }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("should validate with Zod schema", async () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    });
    const request = createMockRequest('{"name":"test","count":42}');
    const result = await readJson(request, schema);
    expect(result).toEqual({ name: "test", count: 42 });
  });

  it("should throw ZodError for invalid data", async () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    });
    const request = createMockRequest('{"name":"test","count":"not a number"}');
    await expect(readJson(request, schema)).rejects.toThrow();
  });

  it("should throw ZodError for missing required fields", async () => {
    const schema = z.object({
      name: z.string(),
      email: z.string().email(),
    });
    const request = createMockRequest('{"name":"test"}');
    await expect(readJson(request, schema)).rejects.toThrow();
  });

  it("should apply schema defaults", async () => {
    const schema = z.object({
      name: z.string(),
      role: z.string().default("participant"),
    });
    const request = createMockRequest('{"name":"test"}');
    const result = await readJson(request, schema);
    expect(result).toEqual({ name: "test", role: "participant" });
  });

  it("should strip unknown fields with strict schema", async () => {
    const schema = z
      .object({
        name: z.string(),
      })
      .strict();
    const request = createMockRequest('{"name":"test","unknown":"field"}');
    await expect(readJson(request, schema)).rejects.toThrow();
  });
});

describe("toHttpValidationError", () => {
  it("should convert ZodError to HTTP error with formatted message", () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().min(18),
    });
    try {
      schema.parse({ email: "not-an-email", age: 15 });
    } catch (error) {
      const httpError = toHttpValidationError(error);
      expect(httpError).toBeTruthy();
      expect(httpError?.message).toContain("email");
      expect(httpError?.message).toContain("age");
      expect((httpError as Error & { status?: number }).status).toBe(400);
    }
  });

  it("should return null for non-ZodError", () => {
    const error = new Error("Regular error");
    const result = toHttpValidationError(error);
    expect(result).toBeNull();
  });

  it("should format nested field errors", () => {
    const schema = z.object({
      user: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    });
    try {
      schema.parse({ user: { name: "", email: "invalid" } });
    } catch (error) {
      const httpError = toHttpValidationError(error);
      expect(httpError).toBeTruthy();
      expect(httpError?.message).toContain("user.name");
      expect(httpError?.message).toContain("user.email");
    }
  });

  it("should handle array field errors", () => {
    const schema = z.object({
      items: z.array(z.string()).min(1),
    });
    try {
      schema.parse({ items: [] });
    } catch (error) {
      const httpError = toHttpValidationError(error);
      expect(httpError).toBeTruthy();
      expect(httpError?.message).toContain("items");
    }
  });
});
