import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  API_CLIENT_SCOPES,
  createApiClient,
  listApiClients,
  patchApiClient,
  revokeApiClient,
  rotateApiClient,
} from '../services/api-client-service.js'
import { requireAdmin } from '../services/auth-service.js'

export async function apiClientRouter(app: FastifyInstance) {
  app.addHook('preHandler', async (request) => {
    await requireAdmin(request)
  })

  app.get('/api-client-scopes', async (_request, reply) => reply.send({ items: API_CLIENT_SCOPES }))
  app.get('/api-clients', async (_request, reply) => reply.send({ items: await listApiClients() }))
  app.post('/api-clients', async (request: FastifyRequest<{ Body: CreateBody }>, reply) => {
    const result = await createApiClient(request.body ?? ({} as CreateBody))
    return noStore(reply).code(201).send(result)
  })
  app.patch('/api-clients/:id', async (request: FastifyRequest<{ Params: IdParams; Body: PatchBody }>, reply) => {
    return reply.send(await patchApiClient(request.params.id, request.body ?? {}))
  })
  app.post('/api-clients/:id/rotate', async (request: FastifyRequest<{ Params: IdParams }>, reply) => {
    return noStore(reply).send(await rotateApiClient(request.params.id))
  })
  app.delete('/api-clients/:id', async (request: FastifyRequest<{ Params: IdParams }>, reply) => {
    await revokeApiClient(request.params.id)
    return reply.code(204).send()
  })
}

interface IdParams {
  id: string
}

interface CreateBody {
  name: string
  scopes: unknown
  expiresInDays?: number | null
}

interface PatchBody {
  name?: string
  scopes?: unknown
  expiresAt?: string | null
}

function noStore(reply: FastifyReply): FastifyReply {
  return reply.header('Cache-Control', 'no-store')
}
