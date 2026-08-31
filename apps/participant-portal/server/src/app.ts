import { createStandardFastifyApp, type StandardFastifyApp } from '@tx-bootstrap/core/server/fastify/app.js'
import type { FastifyRequest } from 'fastify'
import { config } from './config/index.js'
import { registerAppPlugins } from './plugins.js'
import { onboardingRouter } from './routes/onboarding-routes.js'
import { errorHandler } from './routes/error-handler.js'
import { ensureDb } from './db/state-repository.js'
import { serveSanitizedPortalConfig } from './services/portal-config-service.js'
import {
  getDataAccessLifecycle,
  getDataAccessLifecycles,
  getDataAccessRelatedRecords,
} from './services/data-access-service.js'
import { getDataProductNegotiations } from './services/data-product-service.js'
import { proxyToFederatedCatalog, proxyToManagementApi } from './services/portal-proxy-service.js'
import { serveStaticApp } from './services/static-app-service.js'
import { prepareApiDescriptionOpenApi } from './services/api-description-service.js'
import { getNetworkParticipants } from './services/network-participant-service.js'
import { previewHttpPullTransfer } from './services/transfer-preview-service.js'
import { resolvePrincipal, requireAdmin } from './services/auth-service.js'
import { apiClientRouter } from './routes/api-client-routes.js'
import participantApiOpenApi from './openapi/participant-api.openapi.json' with { type: 'json' }

export function createApp() {
  const app = createStandardFastifyApp({ logLevel: config.logLevel })
  registerAppPlugins(app, config)
  app.after(() => registerRoutes(app))
  return app
}

function registerRoutes(app: StandardFastifyApp): void {
  app.addContentTypeParser(
    ['application/sparql-query', 'application/x-www-form-urlencoded'],
    { parseAs: 'string' },
    (_request, body, done) => done(null, body),
  )

  app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
    await ensureDb()
    return reply.send({ status: 'ok' })
  })

  app.register(onboardingRouter, { prefix: '/api/onboarding' })

  app.get('/config.js', async (_req, reply) => serveSanitizedPortalConfig(reply))

  app.get('/api/openapi.json', async (_req, reply) => {
    return reply.header('Cache-Control', 'public, max-age=300').send(participantApiOpenApi)
  })

  app.get('/api/portal/userinfo', async (request, reply) => {
    const principal = await resolvePrincipal(request)
    if (principal.kind !== 'admin') {
      throw Object.assign(new Error('Portal administrator access required'), { status: 403 })
    }
    return reply.header('Cache-Control', 'no-store').send({
      id: principal.id,
      fullName: principal.name,
      authMode: config.auth.mode,
      scopeWarning: config.auth.mode === 'none',
    })
  })
  app.register(
    async (portal) => {
      portal.addHook('preHandler', adminOnly)
      portal.get('/network-participants', getNetworkParticipants)
      portal.post('/api-description/openapi', prepareApiDescriptionOpenApi)
      portal.get('/data-access', getDataAccessLifecycles)
      portal.get('/data-access/:lifecycleId/:relation', getDataAccessRelatedRecords)
      portal.get('/data-access/:lifecycleId', getDataAccessLifecycle)
      portal.get('/data-products/:assetId/negotiations', getDataProductNegotiations)
      portal.get('/transfers/:transferId/preview', previewHttpPullTransfer)
    },
    { prefix: '/api/portal' },
  )
  app.register(apiClientRouter, { prefix: '/api/portal' })

  app.all('/api/management', proxyToManagementApi)
  app.all('/api/management/*', proxyToManagementApi)
  app.all('/api/federated-catalog', proxyToFederatedCatalog)
  app.all('/api/federated-catalog/*', proxyToFederatedCatalog)

  app.setNotFoundHandler(async (request, reply) => {
    return serveStaticApp(request, reply)
  })

  app.setErrorHandler(errorHandler)
}

async function adminOnly(request: FastifyRequest): Promise<void> {
  await requireAdmin(request)
}
