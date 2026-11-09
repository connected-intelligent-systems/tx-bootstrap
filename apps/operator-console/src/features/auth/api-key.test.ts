import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiKeyHeaders,
  clearApiKey,
  getApiKey,
  handleUnauthorized,
  setApiKey,
  subscribeApiKey,
  UnauthorizedError,
  wasApiKeyRejected,
} from "./api-key";

describe("console API key", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    clearApiKey();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends no header until a key is set", () => {
    expect(apiKeyHeaders()).toEqual({});
    setApiKey("secret");
    expect(apiKeyHeaders()).toEqual({ "x-api-key": "secret" });
  });

  it("forgets a rejected key and notifies listeners", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeApiKey(listener);
    setApiKey("secret");
    expect(() => handleUnauthorized(401)).toThrow(UnauthorizedError);
    expect(getApiKey()).toBeNull();
    expect(wasApiKeyRejected()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("does not report a key the user forgot as rejected", () => {
    setApiKey("secret");
    clearApiKey();
    expect(wasApiKeyRejected()).toBe(false);
    setApiKey("other");
    expect(() => handleUnauthorized(401)).toThrow(UnauthorizedError);
    setApiKey("new");
    expect(wasApiKeyRejected()).toBe(false);
  });

  it("ignores other statuses", () => {
    setApiKey("secret");
    expect(() => handleUnauthorized(403)).not.toThrow();
    expect(() => handleUnauthorized(200)).not.toThrow();
    expect(getApiKey()).toBe("secret");
  });

  it("keeps the key in memory when browser storage is blocked", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    setApiKey("secret");
    expect(getApiKey()).toBe("secret");
    clearApiKey();
    expect(getApiKey()).toBeNull();
  });
});
