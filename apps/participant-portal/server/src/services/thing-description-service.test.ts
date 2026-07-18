import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

describe('Thing Description conversion', () => {
  it('converts an HTTP Thing Description to OpenAPI on the backend', async () => {
    const app = createApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/portal/thing-description/convert',
        payload: {
          thingDescription: {
            title: 'Thermometer',
            base: 'https://example.test/',
            securityDefinitions: { nosec_sc: { scheme: 'nosec' } },
            security: ['nosec_sc'],
            properties: {
              temperature: {
                type: 'number',
                forms: [{ href: 'properties/temperature', op: ['readproperty'] }],
              },
            },
          },
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        data: {
          openapi: '3.0.3',
          info: { title: 'Thermometer' },
          paths: { '/properties/temperature': expect.any(Object) },
        },
      })
    } finally {
      await app.close()
    }
  })

  it('rejects a missing Thing Description', async () => {
    const app = createApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/portal/thing-description/convert',
        payload: {},
      })
      expect(response.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })
})
