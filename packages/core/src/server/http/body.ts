import type { IncomingMessage } from "node:http";
import { ZodError, type ZodType } from "zod";

const DEFAULT_MAX_JSON_BODY_BYTES = 1024 * 1024;

export type ReadJsonOptions = {
  maxBytes?: number;
};

export async function readJson<T = Record<string, unknown>>(
  request: IncomingMessage,
  schema?: ZodType<T>,
  options: ReadJsonOptions = {},
): Promise<T> {
  const maxBytes = options.maxBytes ?? configuredMaxJsonBodyBytes();
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) throw payloadTooLarge(maxBytes);
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  const parsed = raw ? parseJson(raw) : {};
  return schema ? schema.parse(parsed) : (parsed as T);
}

function configuredMaxJsonBodyBytes() {
  const parsed = Number.parseInt(
    process.env.OPERATOR_MAX_JSON_BODY_BYTES ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_JSON_BODY_BYTES;
}

function payloadTooLarge(maxBytes: number) {
  const error = new Error(
    "JSON body exceeds " + maxBytes + " bytes",
  ) as Error & { status?: number };
  error.status = 413;
  return error;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body") as Error & { status?: number };
    error.status = 400;
    throw error;
  }
}

export function toHttpValidationError(error: unknown): Error | null {
  if (!(error instanceof ZodError)) return null;
  const message = error.issues
    .map((issue) => (issue.path.join(".") || "body") + ": " + issue.message)
    .join("; ");
  const httpError = new Error(message || "Invalid request body") as Error & {
    status?: number;
  };
  httpError.status = 400;
  return httpError;
}
