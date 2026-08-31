import { describe, expect, it } from 'vitest'
import { apiDescriptionDownloadName, summarizeApiDescription } from './apiDescriptionSummary'

describe('OpenAPI description summaries', () => {
  it('summarizes operations and response formats', () => {
    const summary = summarizeApiDescription({
      openapi: '3.1.0',
      info: { title: 'Order API', version: '2.0.0', description: 'Manage orders' },
      paths: {
        '/orders': {
          parameters: [],
          get: {
            summary: 'List orders',
            responses: {
              200: {
                description: 'ok',
                content: { 'application/json': {}, 'text/csv': {} },
              },
            },
          },
        },
      },
    })

    expect(summary).toMatchObject({
      title: 'Order API',
      description: 'Manage orders',
      specificationVersion: '3.1.0',
      version: '2.0.0',
      operations: [
        {
          method: 'GET',
          path: '/orders',
          label: 'List orders',
          responseMediaTypes: ['application/json', 'text/csv'],
        },
      ],
    })
  })

  it('creates a safe JSON download name', () => {
    expect(apiDescriptionDownloadName('../../Order API: Europe')).toBe('order-api-europe.openapi.json')
  })

  it('summarizes referenced path items and responses', () => {
    const summary = summarizeApiDescription({
      openapi: '3.1.0',
      info: { title: 'Order API', version: '1.0.0' },
      paths: {
        '/orders': { $ref: '#/components/pathItems/Orders' },
      },
      components: {
        pathItems: {
          Orders: {
            get: {
              summary: 'List orders',
              responses: { 200: { $ref: '#/components/responses/Orders' } },
            },
          },
        },
        responses: {
          Orders: {
            description: 'ok',
            content: { 'application/json': {} },
          },
        },
      },
    })

    expect(summary.operations).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/orders',
        label: 'List orders',
        responseMediaTypes: ['application/json'],
      }),
    ])
  })
})
