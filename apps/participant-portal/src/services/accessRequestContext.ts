import type { AccessRequest } from '../types/dataProduct'
import type { Dataset } from '../types/catalog'

const STORAGE_KEY = 'portal.data-product.access-request-context'

export interface AccessRequestContext {
  negotiationId: string
  datasetId?: string
  datasetTitle?: string
  dataset?: Dataset
  providerId?: string
  catalogId?: string
  offerId?: string
  createdAt: string
}

const read = (): Record<string, AccessRequestContext> => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value ? JSON.parse(value) : {}
  } catch {
    return {}
  }
}

const write = (contexts: Record<string, AccessRequestContext>) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(contexts))
  } catch {
    // Local context is only an enhancement; the connector remains authoritative.
  }
}

export const saveAccessRequestContext = (context: AccessRequestContext) => {
  write({ ...read(), [context.negotiationId]: context })
}

export const getAccessRequestContext = (negotiationId: string) => read()[negotiationId]

export const mergeAccessRequestContext = (request: AccessRequest): AccessRequest => {
  const context = getAccessRequestContext(request.id)
  if (!context) return request

  return {
    ...request,
    datasetId: request.datasetId || context.datasetId,
    datasetTitle: request.datasetTitle || context.datasetTitle,
    providerId: request.providerId || context.providerId,
    offerId: request.offerId || context.offerId,
  }
}
