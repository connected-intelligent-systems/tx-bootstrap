import { createHash, randomBytes } from "node:crypto";

export function base64(value) {
  return Buffer.from(value).toString("base64");
}

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
