import type { FastifyInstance } from 'fastify'
import { proxyTransferData } from '../services/data-proxy-service.js'

export async function dataProxyRouter(app: FastifyInstance): Promise<void> {
  app.removeAllContentTypeParsers()
  // A regular-expression parser is intentional: Fastify does not invoke its
  // `*` catch-all parser for DELETE, while the proxy must preserve DELETE
  // request bodies too.
  app.addContentTypeParser(/^.+$/, (_request, payload, done) => done(null, payload))
  app.addContentTypeParser('*', (_request, payload, done) => done(null, payload))

  app.all('/:transferProcessId', proxyTransferData)
  app.all('/:transferProcessId/*', proxyTransferData)
}
