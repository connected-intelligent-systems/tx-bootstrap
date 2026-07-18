import type { IncomingHttpHeaders } from "node:http";
import type { URL } from "node:url";
import { hashToken } from "../utils/crypto.js";
import { unauthorized } from "./errors.js";

export function requireParticipant(
  request: { headers: IncomingHttpHeaders },
  _url: URL,
  row: { participant_token_hash: string },
) {
  const token = request.headers["x-participant-token"];
  if (!token || hashToken(String(token)) !== row.participant_token_hash) {
    throw unauthorized();
  }
}

export function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
