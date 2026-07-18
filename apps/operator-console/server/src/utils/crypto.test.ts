import { describe, it, expect } from "vitest";
import {
  base64,
  hashToken,
  randomToken,
} from "@tx-bootstrap/core/server/utils/crypto.js";
import {
  decodeRegistrationToken,
  encodeRegistrationToken,
} from "@tx-bootstrap/core/api/registration-token.js";

describe("hashToken", () => {
  it("should produce consistent hash for same input", () => {
    const token = "test-token-123";
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different inputs", () => {
    const hash1 = hashToken("token1");
    const hash2 = hashToken("token2");
    expect(hash1).not.toBe(hash2);
  });

  it("should produce hex string output", () => {
    const hash = hashToken("test");
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("should produce 64-character hash (SHA-256)", () => {
    const hash = hashToken("test");
    expect(hash).toHaveLength(64);
  });
});

describe("randomToken", () => {
  it("should generate token from 32 bytes", () => {
    const token = randomToken();
    // 32 bytes encoded as base64url should be 43 characters
    expect(token.length).toBe(43);
  });

  it("should generate different tokens on each call", () => {
    const token1 = randomToken();
    const token2 = randomToken();
    expect(token1).not.toBe(token2);
  });

  it("should generate URL-safe base64", () => {
    const token = randomToken();
    // URL-safe base64 uses - and _ instead of + and /, no padding
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("base64", () => {
  it("should encode string to base64", () => {
    const encoded = base64("hello");
    expect(encoded).toBe("aGVsbG8=");
  });

  it("should handle empty string", () => {
    const encoded = base64("");
    expect(encoded).toBe("");
  });

  it("should handle unicode characters", () => {
    const encoded = base64("Hello 世界");
    expect(encoded).toBeTruthy();
    // Just verify it encodes without error
    expect(typeof encoded).toBe("string");
  });

  it("should produce reversible encoding", () => {
    const original = "test data 123";
    const encoded = base64(original);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    expect(decoded).toBe(original);
  });
});

describe("registration tokens", () => {
  it("should encode and decode registration token payloads", () => {
    const token = encodeRegistrationToken({
      caseId: "case-1",
      participantToken: "participant-secret",
    });

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeRegistrationToken(token)).toEqual({
      caseId: "case-1",
      participantToken: "participant-secret",
    });
  });

  it("should reject malformed registration tokens", () => {
    expect(() => decodeRegistrationToken("not-json-or-base64url")).toThrow(
      "Invalid registration token",
    );
  });
});
