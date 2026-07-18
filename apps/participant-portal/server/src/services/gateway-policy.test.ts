import { describe, expect, it } from 'vitest'
import { federatedCatalogScope, managementScope } from './gateway-policy.js'

describe('participant gateway policy', () => {
  it.each([
    ['POST', '/api/management/v3/catalog/request', 'catalog:read'],
    ['POST', '/api/management/v3/assets/request', 'assets:read'],
    ['GET', '/api/management/v3/assets/asset-1', 'assets:read'],
    ['POST', '/api/management/v3/assets', 'assets:write'],
    ['POST', '/api/management/v3/contractnegotiations/request', 'contract-negotiations:read'],
    ['POST', '/api/management/v3/contractnegotiations/id/terminate', 'contract-negotiations:write'],
    ['POST', '/api/management/v3/contractagreements/retirements/request', 'contract-agreements:read'],
    ['DELETE', '/api/management/v3/contractagreements/retirements/id', 'contract-agreements:retire'],
    ['GET', '/api/management/v3/edrs/id/dataaddress', 'edr:data-address:read'],
  ])('maps %s %s to %s', (method, path, scope) => {
    expect(managementScope(method, path)).toBe(scope)
  })

  it.each([
    ['DELETE', '/api/management/v3/contractnegotiations/id'],
    ['PUT', '/api/management/v3/transferprocesses'],
    ['POST', '/api/management/v3/contractagreements'],
    ['GET', '/api/management/v3/dsp'],
    ['POST', '/api/management/v4/assets/request'],
  ])('rejects unmapped operation %s %s', (method, path) => {
    expect(managementScope(method, path)).toBeNull()
  })

  it('separates REST search from SPARQL scopes', () => {
    expect(federatedCatalogScope('GET', '/api/federated-catalog/v1/datasets?q=mobility')).toBe('federated-catalog:read')
    expect(federatedCatalogScope('POST', '/api/federated-catalog/v1/sparql')).toBe('federated-catalog:sparql')
    expect(federatedCatalogScope('DELETE', '/api/federated-catalog/v1/datasets/id')).toBeNull()
  })
})
