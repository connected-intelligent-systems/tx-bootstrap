import { describe, it, expect, vi } from "vitest";
import type { ServerResponse } from "node:http";
import {
  addCors,
  sendJavaScript,
  sendJson,
} from "@tx-bootstrap/core/server/http/responses.js";

// Mock response type for testing
type MockResponse = Pick<ServerResponse, "writeHead" | "end" | "setHeader">;

describe("sendJson", () => {
  it("should send JSON response with correct headers and status", () => {
    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as MockResponse;

    const payload = { message: "test", count: 42 };
    sendJson(response, 200, payload);

    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "*",
    );
    expect(response.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(response.end).toHaveBeenCalledWith(JSON.stringify(payload));
  });

  it("should handle error responses", () => {
    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as MockResponse;

    const payload = { error: "Not found" };
    sendJson(response, 404, payload);

    expect(response.writeHead).toHaveBeenCalledWith(404, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(response.end).toHaveBeenCalledWith(JSON.stringify(payload));
  });
});

describe("sendJavaScript", () => {
  it("should send JavaScript with correct headers", () => {
    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as MockResponse;

    const body = 'console.log("test");';
    sendJavaScript(response, body);

    expect(response.writeHead).toHaveBeenCalledWith(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    });
    expect(response.end).toHaveBeenCalledWith(body);
  });
});

describe("addCors", () => {
  it("should add CORS headers", () => {
    const response = {
      setHeader: vi.fn(),
    } as unknown as MockResponse;

    addCors(response);

    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "*",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Headers",
      "Content-Type, x-api-key, x-participant-token",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,OPTIONS",
    );
  });
});
