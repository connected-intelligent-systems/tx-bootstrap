import {
  parseOpenApiDocument,
  type OpenApiDescriptionValidation,
  type OpenApiDocument,
} from '../../shared/api-description'

export { parseOpenApiDocument }
export type { OpenApiDescriptionValidation }

export const API_DESCRIPTION_NAMESPACE = 'https://github.com/connected-intelligent-systems/tx-bootstrap/ns/'
export const API_DESCRIPTION_PROPERTY = `${API_DESCRIPTION_NAMESPACE}apiDescription`
export const API_DESCRIPTION_COMPACT_PROPERTY = 'txb:apiDescription'

export function parseStoredApiDescription(value: unknown): OpenApiDocument | undefined {
  const literal = extractJsonLdLiteral(value)
  if (literal === undefined) return undefined

  try {
    const parsed = typeof literal === 'string' ? JSON.parse(literal) : literal
    return parseOpenApiDocument(parsed).value
  } catch {
    return undefined
  }
}

export function serializeApiDescription(value: unknown): string {
  const normalized = parseOpenApiDocument(value)
  if (!normalized.valid || !normalized.value) {
    const message = normalized.errors?.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')
    throw new Error(`Invalid OpenAPI description: ${message || 'unknown validation error'}`)
  }
  return JSON.stringify(normalized.value)
}

function extractJsonLdLiteral(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const literal = extractJsonLdLiteral(item)
      if (literal !== undefined) return literal
    }
    return undefined
  }
  if (isRecord(value) && '@value' in value) return value['@value']
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isRequestWithinEndpoint(requestUrl: string, endpoint: string): boolean {
  try {
    const baseOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    const requested = new URL(requestUrl, baseOrigin)
    const allowed = new URL(endpoint, baseOrigin)
    if (
      !['http:', 'https:'].includes(requested.protocol) ||
      !['http:', 'https:'].includes(allowed.protocol) ||
      requested.username ||
      requested.password ||
      requested.origin !== allowed.origin
    ) {
      return false
    }

    const allowedPath = allowed.pathname.replace(/\/+$/, '')
    return requested.pathname === allowedPath || requested.pathname.startsWith(`${allowedPath}/`)
  } catch {
    return false
  }
}
