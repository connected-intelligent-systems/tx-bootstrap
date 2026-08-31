import type { OpenApiDocument } from '../types/asset'

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

export interface OpenApiOperationSummary {
  method: string
  path: string
  label?: string
  description?: string
  responseMediaTypes: string[]
}

export interface ApiDescriptionSummary {
  title?: string
  description?: string
  specificationVersion?: string
  version?: string
  operations: OpenApiOperationSummary[]
}

export function summarizeApiDescription(document: OpenApiDocument): ApiDescriptionSummary {
  const info = asRecord(document.info)
  const paths = asRecord(document.paths)
  const operations: OpenApiOperationSummary[] = []

  for (const [path, pathItemValue] of Object.entries(paths)) {
    const pathItem = resolvePathItem(document, pathItemValue)
    for (const method of HTTP_METHODS) {
      const operation = asRecord(pathItem[method])
      if (Object.keys(operation).length === 0) continue

      operations.push({
        method: method.toUpperCase(),
        path,
        label: text(operation.summary) || text(operation.operationId),
        description: text(operation.description),
        responseMediaTypes: collectResponseMediaTypes(document, operation),
      })
    }
  }

  return {
    title: text(info.title),
    description: text(info.description),
    specificationVersion: text(document.openapi),
    version: text(info.version),
    operations,
  }
}

export function apiDescriptionDownloadName(title?: string): string {
  const baseName = (title || 'api-description')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${baseName || 'api-description'}.openapi.json`
}

function collectResponseMediaTypes(document: OpenApiDocument, operation: Record<string, unknown>): string[] {
  const mediaTypes = new Set<string>()
  for (const responseValue of Object.values(asRecord(operation.responses))) {
    const response = resolveLocalObject(document, responseValue)
    const content = asRecord(response.content)
    Object.keys(content).forEach((mediaType) => mediaTypes.add(mediaType))
  }
  return [...mediaTypes]
}

function resolvePathItem(
  document: OpenApiDocument,
  value: unknown,
  visited = new Set<string>(),
): Record<string, unknown> {
  const pathItem = asRecord(value)
  const reference = text(pathItem.$ref)
  if (!reference || visited.has(reference)) return pathItem

  visited.add(reference)
  return { ...resolvePathItem(document, resolveJsonPointer(document, reference), visited), ...pathItem }
}

function resolveLocalObject(document: OpenApiDocument, value: unknown): Record<string, unknown> {
  const object = asRecord(value)
  const reference = text(object.$ref)
  return reference ? asRecord(resolveJsonPointer(document, reference)) : object
}

function resolveJsonPointer(document: OpenApiDocument, reference: string): unknown {
  if (!reference.startsWith('#/')) return undefined

  let value: unknown = document
  for (const segment of reference.slice(2).split('/')) {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
