import type { ApiClientScope } from './api-client-service.js'
import operationManifest from '../openapi/gateway-operations.json' with { type: 'json' }

export interface GatewayOperation {
  method: string
  path: string
  scope: ApiClientScope
}

export const gatewayOperations = operationManifest.operations as GatewayOperation[]
export const managementOperations = gatewayOperations.filter((operation) =>
  operation.path.startsWith('/api/management/'),
)
export const federatedCatalogOperations = gatewayOperations.filter((operation) =>
  operation.path.startsWith('/api/federated-catalog/'),
)

export function managementScope(method: string, originalUrl: string): ApiClientScope | null {
  return operationScope(managementOperations, method, originalUrl)
}

export function federatedCatalogScope(method: string, originalUrl: string): ApiClientScope | null {
  return operationScope(federatedCatalogOperations, method, originalUrl)
}

function operationScope(operations: GatewayOperation[], method: string, originalUrl: string): ApiClientScope | null {
  const pathname = new URL(originalUrl, 'http://localhost').pathname
  const normalizedMethod = method.toUpperCase()
  return (
    operations.find((operation) => operation.method === normalizedMethod && pathPattern(operation.path).test(pathname))
      ?.scope ?? null
  )
}

function pathPattern(path: string): RegExp {
  const segments = path
    .split('/')
    .map((segment) => (/^\{[^{}]+\}$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  return new RegExp(`^${segments.join('/')}$`)
}
