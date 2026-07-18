import {
  registerStandardFastifyPlugins,
  standardSwaggerUiOptions,
  type StandardFastifyApp,
} from "@tx-bootstrap/core/server/fastify/app.js";
import type { Config } from "./config/index.js";

export function registerAppPlugins(
  app: StandardFastifyApp,
  config: Config,
): void {
  registerStandardFastifyPlugins(app, {
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          "upgrade-insecure-requests": config.enableHttpsHeaders ? [] : null,
        },
      },
      hsts: config.enableHttpsHeaders
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
          }
        : false,
    },
    cors: {
      origin: config.corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-api-key", "x-participant-token"],
    },
    rateLimit: config.enableRateLimit
      ? {
          global: true,
          max: 100,
          timeWindow: "15 minutes",
          allowList: ["127.0.0.1", "::1"],
        }
      : false,
    swagger: {
      openapi: {
        info: {
          title: `${config.console.title} API`,
          description:
            "API for managing participant onboarding, connector setup, and credential issuance",
          version: "1.0.0",
        },
        servers: [
          {
            url: "http://localhost:3000",
            description: "Development server",
          },
        ],
        tags: [
          { name: "admin", description: "Admin operations" },
          { name: "health", description: "Health check endpoints" },
        ],
        components: {
          securitySchemes: {
            apiKey: {
              type: "apiKey",
              name: "x-api-key",
              in: "header",
            },
          },
        },
      },
    },
    swaggerUi: standardSwaggerUiOptions,
  });
}
