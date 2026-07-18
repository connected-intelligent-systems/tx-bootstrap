export interface RegistrationTokenPayload {
  caseId: string;
  participantToken: string;
}

type RuntimeGlobals = typeof globalThis & {
  atob?: (value: string) => string;
  btoa?: (value: string) => string;
  Buffer?: {
    from(
      value: string,
      encoding: "base64" | "utf8",
    ): { toString(encoding: "base64" | "utf8"): string };
  };
};

export function encodeRegistrationToken({
  caseId,
  participantToken,
}: RegistrationTokenPayload): string {
  return encodeBase64Url(JSON.stringify({ caseId, participantToken }));
}

export function decodeRegistrationToken(
  value: string,
): RegistrationTokenPayload {
  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as Record<
      string,
      unknown
    >;
    const caseId =
      typeof parsed.caseId === "string" ? parsed.caseId.trim() : "";
    const participantToken =
      typeof parsed.participantToken === "string"
        ? parsed.participantToken.trim()
        : "";
    if (!caseId || !participantToken) throw new Error("Missing fields");
    return { caseId, participantToken };
  } catch {
    throw new Error("Invalid registration token");
  }
}

function encodeBase64Url(value: string): string {
  const runtime = globalThis as RuntimeGlobals;
  const base64 = runtime.btoa
    ? runtime.btoa(value)
    : runtime.Buffer?.from(value, "utf8").toString("base64");
  if (!base64) throw new Error("Base64 encoding is unavailable");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const runtime = globalThis as RuntimeGlobals;
  const normalized = value
    .replace(/\s/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = normalized + padding;
  if (runtime.atob) return runtime.atob(base64);
  const decoded = runtime.Buffer?.from(base64, "base64").toString("utf8");
  if (!decoded) throw new Error("Base64 decoding is unavailable");
  return decoded;
}
