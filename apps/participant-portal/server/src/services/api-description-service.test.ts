import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

describe('OpenAPI description preparation', () => {
  it('binds an OpenAPI contract to the negotiated endpoint', async () => {
    const app = createApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/portal/api-description/openapi',
        payload: {
          endpoint: 'https://data-plane.example/api/public/token',
          apiDescription: {
            openapi: '3.1.0',
            info: {
              title: 'Weather',
              version: '1.0.0',
              termsOfService: 'https://evil.example/terms',
              contact: { name: 'Support', url: 'https://evil.example/contact' },
              license: { name: 'MIT', url: 'https://evil.example/license' },
            },
            servers: [{ url: 'https://evil.example' }],
            paths: {
              '/forecast': {
                get: {
                  servers: [{ url: 'https://evil.example' }],
                  responses: { 200: { description: 'ok' } },
                },
              },
            },
            components: {
              pathItems: {
                Shared: {
                  servers: [{ url: 'https://evil.example' }],
                  get: {
                    security: [{ catalogCredential: [] }],
                    externalDocs: { url: 'https://evil.example/reusable-operation' },
                    responses: { 200: { description: 'ok' } },
                  },
                },
              },
            },
          },
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        data: {
          servers: [{ url: 'https://data-plane.example/api/public/token' }],
          paths: { '/forecast': { get: expect.not.objectContaining({ servers: expect.anything() }) } },
        },
      })
      expect(response.json().data.info).not.toHaveProperty('termsOfService')
      expect(response.json().data.info.contact).not.toHaveProperty('url')
      expect(response.json().data.info.license).not.toHaveProperty('url')
      expect(response.json().data.components.pathItems.Shared.get).not.toHaveProperty('security')
      expect(response.json().data.components.pathItems.Shared.get).not.toHaveProperty('externalDocs')
      expect(JSON.stringify(response.json())).not.toContain('evil.example')
    } finally {
      await app.close()
    }
  })

  it('rejects external OpenAPI references', async () => {
    const app = createApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/portal/api-description/openapi',
        payload: {
          endpoint: 'https://data-plane.example/api/public/token',
          apiDescription: {
            openapi: '3.1.0',
            info: { title: 'Unsafe', version: '1.0.0' },
            paths: {},
            components: { schemas: { Result: { $ref: 'https://evil.example/schema.json' } } },
          },
        },
      })

      expect(response.statusCode).toBe(422)
      expect(response.json().message).toContain('external references are not allowed')
    } finally {
      await app.close()
    }
  })

  it('rejects Path Item references outside sanitized OpenAPI path locations', async () => {
    const app = createApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/portal/api-description/openapi',
        payload: {
          endpoint: 'https://data-plane.example/api/public/token',
          apiDescription: {
            openapi: '3.1.0',
            info: { title: 'Unsafe', version: '1.0.0' },
            paths: { '/orders': { $ref: '#/x-path-item' } },
            'x-path-item': {
              servers: [{ url: 'https://evil.example' }],
              get: { responses: { 200: { description: 'ok' } } },
            },
          },
        },
      })

      expect(response.statusCode).toBe(422)
      expect(response.json().message).toContain('must reference a sanitized OpenAPI Path Item')
    } finally {
      await app.close()
    }
  })

  it('rejects documents without an OpenAPI 3.x version', async () => {
    const app = createApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/portal/api-description/openapi',
        payload: {
          endpoint: 'https://data-plane.example/api/public/token',
          apiDescription: {
            title: 'Not an OpenAPI document',
          },
        },
      })
      expect(response.statusCode).toBe(422)
    } finally {
      await app.close()
    }
  })

  it('rejects a missing API description', async () => {
    const app = createApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/portal/api-description/openapi',
        payload: {},
      })
      expect(response.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('rejects malformed OpenAPI versions', async () => {
    const app = createApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/portal/api-description/openapi',
        payload: {
          endpoint: 'https://data-plane.example/api/public/token',
          apiDescription: {
            openapi: '3.invalid',
            info: { title: 'Unsafe', version: '1.0.0' },
            paths: {},
          },
        },
      })
      expect(response.statusCode).toBe(422)
    } finally {
      await app.close()
    }
  })

  it.each(['/../admin', '/%2e%2e/admin', '/%252e%252e/admin', '/safe%2f..%2fadmin', '/items?target=admin'])(
    'rejects an API path that can escape the negotiated endpoint: %s',
    async (path) => {
      const app = createApp()
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/portal/api-description/openapi',
          payload: {
            endpoint: 'https://data-plane.example/api/public/token',
            apiDescription: {
              openapi: '3.1.0',
              info: { title: 'Unsafe', version: '1.0.0' },
              paths: { [path]: { get: { responses: { 200: { description: 'ok' } } } } },
            },
          },
        })

        expect(response.statusCode).toBe(422)
        expect(response.json().message).toContain('must be a relative API path')
      } finally {
        await app.close()
      }
    },
  )

  it('requires a negotiated endpoint for runtime preparation', async () => {
    const app = createApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/portal/api-description/openapi',
        payload: {
          apiDescription: {
            openapi: '3.1.0',
            info: { title: 'Orders', version: '1.0.0' },
            paths: {},
          },
        },
      })

      expect(response.statusCode).toBe(422)
      expect(response.json().message).toContain('endpoint must be an HTTP(S) URL')
    } finally {
      await app.close()
    }
  })
})
