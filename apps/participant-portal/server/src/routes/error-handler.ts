import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import type { HttpError } from '../types.js'

export function errorHandler(error: FastifyError | HttpError, request: FastifyRequest, reply: FastifyReply) {
  const candidate = error as Partial<HttpError> & { statusCode?: number }
  const status = validHttpErrorStatus(candidate.status)
    ? Number(candidate.status)
    : validHttpErrorStatus(candidate.statusCode)
      ? Number(candidate.statusCode)
      : 500

  if (status >= 500) {
    request.log.error({ err: error, reqId: request.id }, 'Internal server error')
    return reply.code(status).send({
      error: 'Internal server error',
      requestId: request.id,
    })
  }

  request.log.warn({ err: error, reqId: request.id }, 'Client error')

  return reply.code(status).send({
    error: error.message || 'Request failed',
    ...(candidate.details !== undefined && { details: candidate.details }),
    requestId: request.id,
  })
}

function validHttpErrorStatus(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 400 && Number(value) <= 599
}
