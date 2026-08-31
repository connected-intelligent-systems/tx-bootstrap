import { describe, expect, it } from 'vitest'
import {
  isRequestWithinEndpoint,
  parseOpenApiDocument,
  parseStoredApiDescription,
  serializeApiDescription,
} from './apiDescriptionUtils'

describe('OpenAPI description validation', () => {
  it('normalizes OpenAPI into an endpoint-neutral contract', () => {
    const result = parseOpenApiDocument({
      openapi: '3.1.0',
      info: {
        title: 'Weather',
        version: '1.0.0',
        termsOfService: 'https://evil.example/terms',
        contact: { name: 'Support', url: 'https://evil.example/contact' },
        license: { name: 'MIT', url: 'https://evil.example/license' },
      },
      servers: [{ url: 'https://evil.example' }],
      security: [{ bearer: [] }],
      paths: {
        '/forecast': {
          get: {
            servers: [{ url: 'https://evil.example' }],
            security: [{ bearer: [] }],
            responses: { 200: { description: 'ok' } },
          },
        },
      },
      components: {
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
        pathItems: {
          Shared: {
            servers: [{ url: 'https://evil.example' }],
            get: {
              security: [{ bearer: [] }],
              externalDocs: { url: 'https://evil.example/reusable-operation' },
              responses: { 200: { description: 'ok' } },
            },
          },
        },
      },
    })

    expect(result.valid).toBe(true)
    expect(result.value).not.toHaveProperty('servers')
    expect(result.value).not.toHaveProperty('security')
    expect(result.value).not.toHaveProperty('components.securitySchemes')
    expect(result.value).not.toHaveProperty('paths./forecast.get.servers')
    expect(result.value).not.toHaveProperty('paths./forecast.get.security')
    expect(result.value).not.toHaveProperty('info.contact.url')
    expect(result.value).not.toHaveProperty('info.license.url')
    expect(result.value).not.toHaveProperty('components.pathItems.Shared.get.security')
    expect(result.value).not.toHaveProperty('components.pathItems.Shared.get.externalDocs')
    expect(JSON.stringify(result.value)).not.toContain('evil.example')
  })

  it('preserves schema properties that happen to use OpenAPI metadata names', () => {
    const result = parseOpenApiDocument({
      openapi: '3.1.0',
      info: { title: 'Infrastructure', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Infrastructure: {
            type: 'object',
            properties: {
              servers: { type: 'array', items: { type: 'string' } },
              callbacks: { type: 'boolean' },
              externalDocs: { type: 'string' },
            },
          },
        },
      },
    })

    expect(result.valid).toBe(true)
    expect(result.value).toHaveProperty('components.schemas.Infrastructure.properties.servers')
    expect(result.value).toHaveProperty('components.schemas.Infrastructure.properties.callbacks')
    expect(result.value).toHaveProperty('components.schemas.Infrastructure.properties.externalDocs')
  })

  it('rejects documents that are not OpenAPI 3.x', () => {
    const result = parseOpenApiDocument({
      title: 'Not an OpenAPI document',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ instancePath: '/openapi' })]))
  })

  it('rejects external OpenAPI references', () => {
    const result = parseOpenApiDocument({
      openapi: '3.1.0',
      info: { title: 'Unsafe', version: '1.0.0' },
      paths: {},
      components: { schemas: { Result: { $ref: 'https://evil.example/schema.json' } } },
    })

    expect(result.valid).toBe(false)
    expect(result.errors?.[0].message).toBe('external references are not allowed')
  })

  it('rejects external OpenAPI operation references', () => {
    const result = parseOpenApiDocument({
      openapi: '3.1.0',
      info: { title: 'Unsafe', version: '1.0.0' },
      paths: {
        '/orders': {
          get: {
            responses: {
              200: {
                description: 'ok',
                links: { details: { operationRef: 'https://evil.example/openapi.json#/paths/~1details/get' } },
              },
            },
          },
        },
      },
    })

    expect(result.valid).toBe(false)
    expect(result.errors?.[0]).toMatchObject({ message: 'external references are not allowed' })
  })

  it('rejects external JSON Schema references and discriminator mappings', () => {
    const dynamicReference = parseOpenApiDocument({
      openapi: '3.1.0',
      info: { title: 'Unsafe', version: '1.0.0' },
      paths: {},
      components: { schemas: { Result: { $dynamicRef: 'https://evil.example/schema.json' } } },
    })
    const discriminatorMapping = parseOpenApiDocument({
      openapi: '3.1.0',
      info: { title: 'Unsafe', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Pet: {
            discriminator: { propertyName: 'type', mapping: { dog: 'https://evil.example/dog.json' } },
          },
        },
      },
    })

    expect(dynamicReference.valid).toBe(false)
    expect(dynamicReference.errors?.[0].message).toBe('external references are not allowed')
    expect(discriminatorMapping.valid).toBe(false)
    expect(discriminatorMapping.errors?.[0].message).toBe('external discriminator mappings are not allowed')
  })

  it('rejects Path Item references outside sanitized OpenAPI path locations', () => {
    const result = parseOpenApiDocument({
      openapi: '3.1.0',
      info: { title: 'Unsafe', version: '1.0.0' },
      paths: { '/orders': { $ref: '#/x-path-item' } },
      'x-path-item': {
        servers: [{ url: 'https://evil.example' }],
        get: { responses: { 200: { description: 'ok' } } },
      },
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: 'must reference a sanitized OpenAPI Path Item' })]),
    )
  })

  it.each(['/../admin', '/%2e%2e/admin', '/%252e%252e/admin', '/safe%2f..%2fadmin', '/items?target=admin'])(
    'rejects an API path that can escape the runtime endpoint: %s',
    (path) => {
      const result = parseOpenApiDocument({
        openapi: '3.1.0',
        info: { title: 'Unsafe', version: '1.0.0' },
        paths: { [path]: { get: { responses: { 200: { description: 'ok' } } } } },
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ instancePath: expect.any(String) })]),
      )
    },
  )

  it('reads direct OpenAPI documents from JSON-LD literals', () => {
    const apiDescription = {
      openapi: '3.1.0',
      info: { title: 'Weather', version: '1.0.0' },
      paths: { '/forecast': { get: { responses: { 200: { description: 'ok' } } } } },
    }

    const stored = serializeApiDescription(apiDescription)
    expect(parseStoredApiDescription({ '@value': stored })).toEqual(apiDescription)
  })

  it('restricts authorized requests to the negotiated endpoint boundary', () => {
    const endpoint = 'https://data-plane.example/api/public/token'

    expect(isRequestWithinEndpoint(endpoint, endpoint)).toBe(true)
    expect(isRequestWithinEndpoint(`${endpoint}/forecast`, endpoint)).toBe(true)
    expect(isRequestWithinEndpoint('https://data-plane.example/api/public/token-evil', endpoint)).toBe(false)
    expect(isRequestWithinEndpoint('https://evil.example/api/public/token/forecast', endpoint)).toBe(false)
    expect(isRequestWithinEndpoint('https://attacker@data-plane.example/api/public/token/forecast', endpoint)).toBe(
      false,
    )
  })
})
