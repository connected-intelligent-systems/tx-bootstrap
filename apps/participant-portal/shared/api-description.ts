export type OpenApiDocument = Record<string, unknown>

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

export interface OpenApiDescriptionValidation {
  valid: boolean
  value?: OpenApiDocument
  errors?: Array<{ instancePath: string; message: string }>
}

export function parseOpenApiDocument(document: unknown): OpenApiDescriptionValidation {
  if (!isRecord(document)) return invalid('', 'OpenAPI description must be a JSON object')

  const errors: Array<{ instancePath: string; message: string }> = []
  if (typeof document.openapi !== 'string' || !/^3\.\d+\.\d+(?:[-+].*)?$/.test(document.openapi)) {
    errors.push({ instancePath: '/openapi', message: 'must declare an OpenAPI 3.x version' })
  }
  if (
    !isRecord(document.info) ||
    typeof document.info.title !== 'string' ||
    typeof document.info.version !== 'string'
  ) {
    errors.push({ instancePath: '/info', message: 'must contain string title and version fields' })
  }
  if (!isRecord(document.paths)) {
    errors.push({ instancePath: '/paths', message: 'must be an object' })
  } else {
    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!isSafeApiPath(path)) {
        errors.push({ instancePath: `/paths/${escapePointer(path)}`, message: 'must be a relative API path' })
      }
      validatePathItemReference(pathItem, `/paths/${escapePointer(path)}`, errors)
    }
  }
  if (isRecord(document.components) && isRecord(document.components.pathItems)) {
    for (const [name, pathItem] of Object.entries(document.components.pathItems)) {
      validatePathItemReference(pathItem, `/components/pathItems/${escapePointer(name)}`, errors)
    }
  }

  visitJson(document, (key, child, path) => {
    if (key === '__proto__') {
      errors.push({ instancePath: path, message: 'unsafe object keys are not allowed' })
    }
    if (key === '$id' || key === '$schema' || key === 'externalValue') {
      errors.push({ instancePath: path, message: 'external schema or example metadata is not allowed' })
    }
    if (key === '$ref' || key === '$dynamicRef' || key === '$recursiveRef' || key === 'operationRef') {
      if (typeof child !== 'string' || !child.startsWith('#/')) {
        errors.push({ instancePath: path, message: 'external references are not allowed' })
      }
    }
  })
  assertSafeDiscriminatorMappings(document, errors)

  if (errors.length > 0) return { valid: false, errors }
  return { valid: true, value: stripOpenApiDeploymentMetadata(document) }
}

function stripOpenApiDeploymentMetadata(document: OpenApiDocument): OpenApiDocument {
  const result = cloneJson(document)
  delete result.servers
  delete result.security
  delete result.externalDocs
  delete result.webhooks

  if (isRecord(result.info)) {
    delete result.info.termsOfService
    if (isRecord(result.info.contact)) delete result.info.contact.url
    if (isRecord(result.info.license)) delete result.info.license.url
  }
  if (isRecord(result.components)) {
    delete result.components.securitySchemes
    delete result.components.callbacks
    if (isRecord(result.components.pathItems)) {
      Object.values(result.components.pathItems).forEach(stripPathItemDeploymentMetadata)
    }
  }
  if (Array.isArray(result.tags)) {
    result.tags.forEach((tag) => {
      if (isRecord(tag)) delete tag.externalDocs
    })
  }

  if (isRecord(result.paths)) {
    Object.values(result.paths).forEach(stripPathItemDeploymentMetadata)
  }

  return result
}

function stripPathItemDeploymentMetadata(value: unknown): void {
  if (!isRecord(value)) return

  delete value.servers
  for (const method of HTTP_METHODS) {
    const operation = value[method]
    if (!isRecord(operation)) continue
    delete operation.servers
    delete operation.security
    delete operation.externalDocs
    delete operation.callbacks
  }
}

function validatePathItemReference(
  value: unknown,
  path: string,
  errors: Array<{ instancePath: string; message: string }>,
): void {
  if (!isRecord(value) || typeof value.$ref !== 'string') return
  if (!/^#\/(?:paths|components\/pathItems)\/[^/]+$/.test(value.$ref)) {
    errors.push({ instancePath: `${path}/$ref`, message: 'must reference a sanitized OpenAPI Path Item' })
  }
}

function assertSafeDiscriminatorMappings(
  value: unknown,
  errors: Array<{ instancePath: string; message: string }>,
  path = '',
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertSafeDiscriminatorMappings(child, errors, `${path}/${index}`))
    return
  }
  if (!isRecord(value)) return

  if (isRecord(value.discriminator) && isRecord(value.discriminator.mapping)) {
    for (const [name, mapping] of Object.entries(value.discriminator.mapping)) {
      if (typeof mapping !== 'string' || (!mapping.startsWith('#/') && !/^[a-zA-Z0-9._-]+$/.test(mapping))) {
        errors.push({
          instancePath: `${path}/discriminator/mapping/${escapePointer(name)}`,
          message: 'external discriminator mappings are not allowed',
        })
      }
    }
  }

  for (const [key, child] of Object.entries(value)) {
    assertSafeDiscriminatorMappings(child, errors, `${path}/${escapePointer(key)}`)
  }
}

function isSafeApiPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#')) return false

  let decoded = path
  try {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
  } catch {
    return false
  }

  return (
    decoded.startsWith('/') &&
    !decoded.startsWith('//') &&
    !/[\\?#]/.test(decoded) &&
    !decoded.split('/').some((segment) => segment === '.' || segment === '..')
  )
}

function visitJson(value: unknown, visitor: (key: string, value: unknown, path: string) => void, path = ''): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => visitJson(child, visitor, `${path}/${index}`))
    return
  }
  if (!isRecord(value)) return

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${escapePointer(key)}`
    visitor(key, child, childPath)
    visitJson(child, visitor, childPath)
  }
}

function cloneJson<T extends OpenApiDocument>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalid(instancePath: string, message: string): OpenApiDescriptionValidation {
  return { valid: false, errors: [{ instancePath, message }] }
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}
