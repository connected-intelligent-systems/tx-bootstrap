import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readHeadscaleConfig } from "./headscale.js";

const enabled = {
  HEADSCALE_ENABLED: "true",
  HEADSCALE_URL: "https://headscale.example.org/",
  HEADSCALE_API_KEY: "admin-secret",
  HEADSCALE_PARTICIPANT_DOMAIN: "tunnel.example.org",
};

describe("Headscale configuration", () => {
  it("stays disabled without reading credentials or requiring a server", () => {
    expect(
      readHeadscaleConfig({ HEADSCALE_API_KEY_FILE: "/missing" }),
    ).toMatchObject({ enabled: false, apiKey: "" });
  });
  it("normalizes the HTTPS origin and bounds enrollment lifetimes", () => {
    expect(readHeadscaleConfig(enabled)).toMatchObject({
      enabled: true,
      url: "https://headscale.example.org",
      enrollmentTtlSeconds: 900,
      invitationTtlSeconds: 604800,
      staleNodeSeconds: 604800,
    });
    expect(() =>
      readHeadscaleConfig({ ...enabled, HEADSCALE_STALE_NODE_SECONDS: "60" }),
    ).toThrow("HEADSCALE_STALE_NODE_SECONDS");
    expect(
      readHeadscaleConfig({
        ...enabled,
        HEADSCALE_INVITATION_TTL_SECONDS: "86400",
      }).invitationTtlSeconds,
    ).toBe(86400);
    expect(() =>
      readHeadscaleConfig({
        ...enabled,
        HEADSCALE_INVITATION_TTL_SECONDS: "31536000",
      }),
    ).toThrow("HEADSCALE_INVITATION_TTL_SECONDS");
    expect(() =>
      readHeadscaleConfig({
        ...enabled,
        HEADSCALE_ENROLLMENT_TTL_SECONDS: "86400",
      }),
    ).toThrow("HEADSCALE_ENROLLMENT_TTL_SECONDS");
    expect(() =>
      readHeadscaleConfig({ ...enabled, HEADSCALE_TIMEOUT_MS: "NaN" }),
    ).toThrow("HEADSCALE_TIMEOUT_MS");
    expect(() =>
      readHeadscaleConfig({ ...enabled, HEADSCALE_ENABLED: "yes" }),
    ).toThrow("HEADSCALE_ENABLED");
  });
  it.each([
    "http://headscale.example.org",
    "https://user:secret@headscale.example.org",
    "https://headscale.example.org/api",
    "https://headscale.example.org/?token=secret",
  ])("rejects unsafe origins: %s", (url) => {
    expect(() =>
      readHeadscaleConfig({ ...enabled, HEADSCALE_URL: url }),
    ).toThrow("HTTPS origin");
  });
  it("requires credentials and an operator-controlled tag", () => {
    expect(() =>
      readHeadscaleConfig({ ...enabled, HEADSCALE_API_KEY: "" }),
    ).toThrow("API key");
    expect(() =>
      readHeadscaleConfig({ ...enabled, HEADSCALE_PARTICIPANT_TAG: "*" }),
    ).toThrow("valid tag");
  });
  it("reads a mounted secret without exposing its path or contents on failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "txb-headscale-config-"));
    try {
      const path = join(dir, "token");
      writeFileSync(path, "file-secret\n", { mode: 0o600 });
      expect(
        readHeadscaleConfig({
          ...enabled,
          HEADSCALE_API_KEY: undefined,
          HEADSCALE_API_KEY_FILE: path,
        }).apiKey,
      ).toBe("file-secret");
      expect(() =>
        readHeadscaleConfig({ ...enabled, HEADSCALE_API_KEY_FILE: path }),
      ).toThrow("only one");
      expect(() =>
        readHeadscaleConfig({
          ...enabled,
          HEADSCALE_API_KEY: undefined,
          HEADSCALE_API_KEY_FILE: "/missing/private-path",
        }),
      ).toThrow(/^Cannot read HEADSCALE_API_KEY_FILE$/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("requires the public tunnel DNS zone when enabled", () => {
    expect(
      readHeadscaleConfig({
        ...enabled,
        HEADSCALE_PARTICIPANT_DOMAIN: "Tunnel.Example.org.",
      }).participantDomain,
    ).toBe("tunnel.example.org");
    for (const value of [
      undefined,
      "",
      "localhost",
      "-bad.example.org",
      "a/b.example.org",
    ]) {
      expect(() =>
        readHeadscaleConfig({
          ...enabled,
          HEADSCALE_PARTICIPANT_DOMAIN: value,
        }),
      ).toThrow("HEADSCALE_PARTICIPANT_DOMAIN");
    }
  });

  it("accepts plain HTTP only with the explicit local opt-in", () => {
    const local = {
      ...enabled,
      HEADSCALE_URL: "http://headscale.tunnel.test",
    };
    expect(() => readHeadscaleConfig(local)).toThrow("HEADSCALE_URL");
    expect(
      readHeadscaleConfig({ ...local, HEADSCALE_ALLOW_INSECURE_HTTP: "true" })
        .url,
    ).toBe("http://headscale.tunnel.test");
    expect(() =>
      readHeadscaleConfig({
        ...local,
        HEADSCALE_URL: "ftp://headscale.tunnel.test",
        HEADSCALE_ALLOW_INSECURE_HTTP: "true",
      }),
    ).toThrow("HEADSCALE_URL");
  });
});
