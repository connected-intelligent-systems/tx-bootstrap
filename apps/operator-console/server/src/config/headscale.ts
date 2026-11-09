import { readFileSync } from "node:fs";

export type HeadscaleConfig = {
  enabled: boolean;
  url: string;
  apiKey: string;
  participantTag: string;
  /** Public DNS zone served by the tunnel ingress, e.g. tunnel.example.org. */
  participantDomain: string;
  enrollmentTtlSeconds: number;
  /** Lifetime of keys sent with a participant invitation. */
  invitationTtlSeconds: number;
  staleNodeSeconds: number;
  timeoutMs: number;
};

export function readHeadscaleConfig(
  env: NodeJS.ProcessEnv = process.env,
): HeadscaleConfig {
  const defaults = {
    enabled: false,
    url: "",
    apiKey: "",
    participantTag: "tag:txb-participant",
    participantDomain: "",
    enrollmentTtlSeconds: 900,
    invitationTtlSeconds: 604800,
    staleNodeSeconds: 604800,
    timeoutMs: 5000,
  };
  if (!env.HEADSCALE_ENABLED || env.HEADSCALE_ENABLED === "false")
    return defaults;
  if (env.HEADSCALE_ENABLED !== "true") {
    throw new Error("HEADSCALE_ENABLED must be true or false");
  }

  let url: URL;
  try {
    url = new URL(env.HEADSCALE_URL ?? "");
  } catch {
    throw new Error("HEADSCALE_URL must be an HTTPS origin");
  }
  // Plain HTTP is only for the local tunnel environment inside Docker; it
  // sends the administrative API key unencrypted.
  const allowHttp = env.HEADSCALE_ALLOW_INSECURE_HTTP === "true";
  if (
    (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "HEADSCALE_URL must be an HTTPS origin without credentials or a path",
    );
  }
  if (env.HEADSCALE_API_KEY && env.HEADSCALE_API_KEY_FILE) {
    throw new Error(
      "Set only one of HEADSCALE_API_KEY and HEADSCALE_API_KEY_FILE",
    );
  }
  let apiKey = env.HEADSCALE_API_KEY?.trim() ?? "";
  if (env.HEADSCALE_API_KEY_FILE) {
    try {
      apiKey = readFileSync(env.HEADSCALE_API_KEY_FILE, "utf8").trim();
    } catch {
      throw new Error("Cannot read HEADSCALE_API_KEY_FILE");
    }
  }
  if (!apiKey || /\s/.test(apiKey)) {
    throw new Error(
      "A nonempty Headscale API key is required when Headscale is enabled",
    );
  }
  const participantTag =
    env.HEADSCALE_PARTICIPANT_TAG ?? defaults.participantTag;
  if (!/^tag:[a-z][a-z0-9-]*$/.test(participantTag)) {
    throw new Error("HEADSCALE_PARTICIPANT_TAG must be a valid tag");
  }
  const participantDomain = (env.HEADSCALE_PARTICIPANT_DOMAIN ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (
    !/^(?=.{1,200}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      participantDomain,
    )
  ) {
    throw new Error(
      "HEADSCALE_PARTICIPANT_DOMAIN must be the public DNS zone served by the tunnel ingress",
    );
  }
  function integer(name: string, fallback: number, min: number, max: number) {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  }
  return {
    enabled: true,
    url: url.origin,
    apiKey,
    participantTag,
    participantDomain,
    enrollmentTtlSeconds: integer(
      "HEADSCALE_ENROLLMENT_TTL_SECONDS",
      900,
      60,
      3600,
    ),
    invitationTtlSeconds: integer(
      "HEADSCALE_INVITATION_TTL_SECONDS",
      604800,
      3600,
      2592000,
    ),
    // Offline nodes older than this are flagged as stale (never deleted).
    staleNodeSeconds: integer(
      "HEADSCALE_STALE_NODE_SECONDS",
      604800,
      3600,
      31536000,
    ),
    timeoutMs: integer("HEADSCALE_TIMEOUT_MS", 5000, 100, 30000),
  };
}
