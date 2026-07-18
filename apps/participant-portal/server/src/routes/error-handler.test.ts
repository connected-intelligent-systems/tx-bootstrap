import { createStandardFastifyApp } from '@tx-bootstrap/core/server/fastify/app.js'
import { describe, expect, it } from 'vitest'
import { errorHandler } from './error-handler.js'

describe('participant portal error handler', () => {
  it('redacts unexpected server-error details from responses', async () => {
    const app = createTestApp()
    app.get('/failure', async () => {
      throw new Error('database password appeared in an upstream error')
    })

    const response = await app.inject({ method: 'GET', url: '/failure' })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      error: 'Internal server error',
      requestId: expect.any(String),
    })
    expect(response.body).not.toContain('database password')
  })

  it('retains actionable client-error messages and details', async () => {
    const app = createTestApp()
    app.get('/invalid', async () => {
      throw Object.assign(new Error('Invalid participant input'), {
        status: 400,
        details: { field: 'participantBpn' },
      })
    })

    const response = await app.inject({ method: 'GET', url: '/invalid' })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'Invalid participant input',
      details: { field: 'participantBpn' },
      requestId: expect.any(String),
    })
  })
})

function createTestApp() {
  const app = createStandardFastifyApp({ logLevel: 'fatal', prettyLogs: false })
  app.setErrorHandler(errorHandler)
  return app
}
