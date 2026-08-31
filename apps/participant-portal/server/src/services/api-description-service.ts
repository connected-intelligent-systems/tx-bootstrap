import type { FastifyReply, FastifyRequest } from 'fastify'
import { parseOpenApiDocument } from '../../../shared/api-description.js'

type PrepareBody = {
  apiDescription?: unknown
  endpoint?: unknown
}

export async function prepareApiDescriptionOpenApi(
  request: FastifyRequest<{ Body: PrepareBody }>,
  reply: FastifyReply,
) {
  if (!isRecord(request.body?.apiDescription)) {
    return reply.code(400).send({ message: 'apiDescription must be an OpenAPI JSON object' })
  }

  try {
    const endpoint = parseEndpoint(request.body?.endpoint)
    return reply.send({ data: prepareOpenApiDocument(request.body.apiDescription, endpoint) })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(422).send({ message: `API description could not be prepared: ${message}` })
  }
}

export function prepareOpenApiDocument(document: Record<string, unknown>, endpoint: string): Record<string, unknown> {
  const normalized = parseOpenApiDocument(document)
  if (!normalized.valid || !normalized.value) {
    const message = normalized.errors?.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')
    throw new Error(`Invalid OpenAPI description: ${message || 'unknown validation error'}`)
  }

  return { ...normalized.value, servers: [{ url: endpoint }] }
}

function parseEndpoint(value: unknown): string {
  if (typeof value !== 'string') throw new Error('endpoint must be an HTTP(S) URL')

  const endpoint = new URL(value)
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('endpoint must be an HTTP(S) URL without credentials or a fragment')
  }
  return endpoint.toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
