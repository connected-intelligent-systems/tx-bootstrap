import type { FastifyPluginAsync } from 'fastify'
import {
  attachOnboardingCase,
  buildStateResponse,
  refreshOnboarding,
  requestCredentials,
} from '../services/onboarding-service.js'
import { isRecord } from '../lib/objects.js'

export const onboardingRouter: FastifyPluginAsync = async (app) => {
  app.get('/state', async () => buildStateResponse({ autoProgress: true }))

  app.post('/attach', async (request) => attachOnboardingCase(isRecord(request.body) ? request.body : {}))

  app.post('/cases', async (_request, reply) =>
    reply.code(410).send({
      error:
        'Public participant registration has been removed. Configure ONBOARDING_REGISTRATION_TOKEN from the operator invite.',
    }),
  )

  app.post('/credentials/request', async () => requestCredentials())

  app.post('/refresh', async () => refreshOnboarding())
}
