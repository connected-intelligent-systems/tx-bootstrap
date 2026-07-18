export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

const logLevels = new Set<LogLevel>([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
]);

export function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

export function parseCsvEnv(
  name: string,
  fallback: string | readonly string[],
): string[] {
  const value = process.env[name];
  const raw =
    value ?? (typeof fallback === "string" ? fallback : fallback.join(","));
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseJsonEnv<T>(name: string, fallback: T): T {
  const raw = process.env[name];
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Ignoring invalid ${name}: ${message}`);
    return fallback;
  }
}

export function parseLogLevelEnv(
  name = "LOG_LEVEL",
  fallback: LogLevel = "info",
): LogLevel {
  const value = (process.env[name] ?? fallback).toLowerCase();
  return logLevels.has(value as LogLevel) ? (value as LogLevel) : fallback;
}
