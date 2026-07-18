import { describe, expect, it } from 'vitest'
import participantApiOpenApi from './participant-api.openapi.json' with { type: 'json' }
import { gatewayOperations } from '../services/gateway-policy.js'

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'])

describe('participant API OpenAPI', () => {
  it('documents exactly the scoped gateway operations', () => {
    const documented = Object.entries(participantApiOpenApi.paths).flatMap(([path, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method]) => httpMethods.has(method))
        .map(([method, operation]) => ({
          method: method.toUpperCase(),
          path,
          scope: operation['x-required-scope'],
        })),
    )

    expect(sortOperations(documented)).toEqual(sortOperations(gatewayOperations))
  })

  it('uses bearer authentication and resolves every local reference', () => {
    expect(participantApiOpenApi.components.securitySchemes.apiClientToken).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'txb_',
    })

    for (const reference of collectReferences(participantApiOpenApi)) {
      expect(resolveReference(participantApiOpenApi, reference), `unresolved reference ${reference}`).toBeDefined()
    }
  })

  it('records the pinned native EDC schema source', () => {
    expect(participantApiOpenApi['x-upstream']).toMatchObject({
      distribution: 'Tractus-X EDC',
      distributionVersion: '0.12.1',
      eclipseEdcManagementApiVersion: '3.1.4',
    })
  })
})

function sortOperations<T extends { method: string; path: string; scope: string }>(operations: T[]) {
  return operations
    .map(({ method, path, scope }) => ({ method, path, scope }))
    .sort((left, right) => `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`))
}

function collectReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectReferences)
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  return [
    ...(typeof record.$ref === 'string' && record.$ref.startsWith('#/') ? [record.$ref] : []),
    ...Object.values(record).flatMap(collectReferences),
  ]
}

function resolveReference(document: unknown, reference: string): unknown {
  return reference
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((value, part) => {
      if (!value || typeof value !== 'object') return undefined
      return (value as Record<string, unknown>)[part]
    }, document)
}
