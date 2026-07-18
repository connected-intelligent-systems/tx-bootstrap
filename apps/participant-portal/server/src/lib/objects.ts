import type { JsonRecord } from '../types.js'

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object')
}

export function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function parsePayload(value: string): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function pruneUndefined<T extends JsonRecord>(value: T): JsonRecord {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

export function text(value: unknown, fallback = ''): string {
  return String(value ?? fallback ?? '').trim()
}
