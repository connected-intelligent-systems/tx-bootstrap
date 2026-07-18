import { describe, it, expect, beforeEach } from "vitest";
import type { IncomingHttpHeaders } from "node:http";
import { createAuth, requireParticipant, headerValue } from "./auth.js";
import { hashToken } from "@tx-bootstrap/core/server/utils/crypto.js";
import type { Config } from "../config/index.js";

// Mock request type for testing
type MockRequest = { headers: IncomingHttpHeaders };
type MockRow = { participant_token_hash: string };

describe("createAuth", () => {
  describe("network mode", () => {
    it("should allow all requests in network mode", () => {
      const config = {
        adminAuth: {
          mode: "network",
          apiKey: "",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = { headers: {} } as MockRequest;

      expect(() => auth.requireAdmin(request)).not.toThrow();
    });

    it("should allow all requests in none mode", () => {
      const config = {
        adminAuth: {
          mode: "none",
          apiKey: "",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = { headers: {} } as MockRequest;

      expect(() => auth.requireAdmin(request)).not.toThrow();
    });
  });

  describe("api-key mode", () => {
    it("should allow requests with correct API key", () => {
      const config = {
        adminAuth: {
          mode: "api-key",
          apiKey: "test-api-key",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = {
        headers: {
          "x-api-key": "test-api-key",
        },
      } as MockRequest;

      expect(() => auth.requireAdmin(request)).not.toThrow();
    });

    it("should reject requests with incorrect API key", () => {
      const config = {
        adminAuth: {
          mode: "api-key",
          apiKey: "test-api-key",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = {
        headers: {
          "x-api-key": "wrong-key",
        },
      } as MockRequest;

      expect(() => auth.requireAdmin(request)).toThrow();
    });

    it("should reject requests without API key", () => {
      const config = {
        adminAuth: {
          mode: "api-key",
          apiKey: "test-api-key",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = { headers: {} } as MockRequest;

      expect(() => auth.requireAdmin(request)).toThrow();
    });

    it("should throw configuration error when API key not configured", () => {
      const config = {
        adminAuth: {
          mode: "api-key",
          apiKey: "",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = { headers: {} } as MockRequest;

      expect(() => auth.requireAdmin(request)).toThrow(
        "OPERATOR_CONSOLE_API_KEY is required",
      );
    });
  });

  describe("forwarded-header mode", () => {
    it("should allow requests with valid forwarded user when no allowedUsers set", () => {
      const config = {
        adminAuth: {
          mode: "forwarded-header",
          apiKey: "",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = {
        headers: {
          "x-forwarded-user": "alice@example.com",
        },
      } as MockRequest;

      expect(() => auth.requireAdmin(request)).not.toThrow();
    });

    it("should allow requests with user in allowedUsers list", () => {
      const config = {
        adminAuth: {
          mode: "forwarded-header",
          apiKey: "",
          header: "x-forwarded-user",
          allowedUsers: new Set(["alice@example.com", "bob@example.com"]),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = {
        headers: {
          "x-forwarded-user": "alice@example.com",
        },
      } as MockRequest;

      expect(() => auth.requireAdmin(request)).not.toThrow();
    });

    it("should reject requests with user not in allowedUsers list", () => {
      const config = {
        adminAuth: {
          mode: "forwarded-header",
          apiKey: "",
          header: "x-forwarded-user",
          allowedUsers: new Set(["alice@example.com"]),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = {
        headers: {
          "x-forwarded-user": "eve@example.com",
        },
      } as MockRequest;

      expect(() => auth.requireAdmin(request)).toThrow();
    });

    it("should reject requests without forwarded user header", () => {
      const config = {
        adminAuth: {
          mode: "forwarded-header",
          apiKey: "",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = { headers: {} } as MockRequest;

      expect(() => auth.requireAdmin(request)).toThrow();
    });

    it("should work with forwarded mode alias", () => {
      const config = {
        adminAuth: {
          mode: "forwarded",
          apiKey: "",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;

      const auth = createAuth(config);
      const request = {
        headers: {
          "x-forwarded-user": "alice@example.com",
        },
      } as MockRequest;

      expect(() => auth.requireAdmin(request)).not.toThrow();
    });
  });

  describe("eventActor", () => {
    let config: Config;

    beforeEach(() => {
      config = {
        adminAuth: {
          mode: "network",
          apiKey: "",
          header: "x-forwarded-user",
          allowedUsers: new Set<string>(),
        },
      } as Partial<Config> as Config;
    });

    it("should return forwarded user when present", () => {
      const auth = createAuth(config);
      const request = {
        headers: {
          "x-forwarded-user": "alice@example.com",
        },
      } as MockRequest;

      expect(auth.eventActor(request)).toBe("alice@example.com");
    });

    it('should return "api-key" when x-api-key header present', () => {
      const auth = createAuth(config);
      const request = {
        headers: {
          "x-api-key": "some-key",
        },
      } as MockRequest;

      expect(auth.eventActor(request)).toBe("api-key");
    });

    it('should return "operator" when no auth headers present', () => {
      const auth = createAuth(config);
      const request = { headers: {} } as MockRequest;

      expect(auth.eventActor(request)).toBe("operator");
    });

    it("should prefer forwarded user over api-key", () => {
      const auth = createAuth(config);
      const request = {
        headers: {
          "x-forwarded-user": "alice@example.com",
          "x-api-key": "some-key",
        },
      } as MockRequest;

      expect(auth.eventActor(request)).toBe("alice@example.com");
    });
  });
});

describe("requireParticipant", () => {
  const validToken = "test-token-123";
  const hashedToken = hashToken(validToken);

  it("should allow requests with valid token in header", () => {
    const request = {
      headers: {
        "x-participant-token": validToken,
      },
    } as MockRequest;
    const url = new URL("http://example.com");
    const row = { participant_token_hash: hashedToken } as MockRow;

    expect(() => requireParticipant(request, url, row)).not.toThrow();
  });

  it("should reject requests with valid token in query param", () => {
    const request = { headers: {} } as MockRequest;
    const url = new URL(`http://example.com?participantToken=${validToken}`);
    const row = { participant_token_hash: hashedToken } as MockRow;

    expect(() => requireParticipant(request, url, row)).toThrow();
  });

  it("should reject requests with invalid token", () => {
    const request = {
      headers: {
        "x-participant-token": "wrong-token",
      },
    } as MockRequest;
    const url = new URL("http://example.com");
    const row = { participant_token_hash: hashedToken } as MockRow;

    expect(() => requireParticipant(request, url, row)).toThrow();
  });

  it("should reject requests without token", () => {
    const request = { headers: {} } as MockRequest;
    const url = new URL("http://example.com");
    const row = { participant_token_hash: hashedToken } as MockRow;

    expect(() => requireParticipant(request, url, row)).toThrow();
  });

  it("should ignore query param when header token is valid", () => {
    const request = {
      headers: {
        "x-participant-token": validToken,
      },
    } as MockRequest;
    const url = new URL("http://example.com?participantToken=wrong-token");
    const row = { participant_token_hash: hashedToken } as MockRow;

    expect(() => requireParticipant(request, url, row)).not.toThrow();
  });
});

describe("headerValue", () => {
  it("should return string value as-is", () => {
    expect(headerValue("test-value")).toBe("test-value");
  });

  it("should return first value from array", () => {
    expect(headerValue(["first", "second"])).toBe("first");
  });

  it("should return empty string for empty array", () => {
    expect(headerValue([])).toBe("");
  });

  it("should return empty string for undefined", () => {
    expect(headerValue(undefined)).toBe("");
  });

  it("should return empty string for null", () => {
    expect(headerValue(null as unknown as string)).toBe("");
  });
});
