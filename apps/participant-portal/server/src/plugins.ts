import { registerStandardFastifyPlugins, type StandardFastifyApp } from '@tx-bootstrap/core/server/fastify/app.js'
import type { Config } from './config/index.js'

export function registerAppPlugins(app: StandardFastifyApp, config: Config): void {
  registerStandardFastifyPlugins(app, {
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          'upgrade-insecure-requests': config.enableHttpsHeaders ? [] : null,
        },
      },
      hsts: config.enableHttpsHeaders
        ? {
            maxAge: 31_536_000,
            includeSubDomains: true,
          }
        : false,
    },
    rateLimit: config.enableRateLimit
      ? {
          global: true,
          max: config.rateLimit.max,
          timeWindow: config.rateLimit.timeWindow,
          keyGenerator: (request) => {
            const forwardedUser = request.headers[config.auth.header]
            return config.auth.mode === 'forwarded-header' && typeof forwardedUser === 'string' && forwardedUser
              ? `user:${forwardedUser}`
              : request.ip
          },
        }
      : false,
  })
}
