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
      contentSecurityPolicy: false,
      hsts:
        process.env.NODE_ENV === "production"
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
    },
    cors: {
      origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
      credentials: false,
      methods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-participant-token"],
    },
    rateLimit: config.enableRateLimit
      ? {
          global: true,
          max: config.rateLimit.max,
          timeWindow: config.rateLimit.timeWindow,
          allowList: ["127.0.0.1", "::1"],
        }
      : false,
    swagger: {
      openapi: {
        info: {
          title: "Operator Onboarding Service API",
          description:
            "Public API for participant registration and onboarding status",
          version: "1.0.0",
        },
        servers: [
          {
            url: "http://localhost:3010",
            description: "Development server",
          },
        ],
        tags: [
          {
            name: "onboarding",
            description: "Operator onboarding service operations",
          },
          { name: "health", description: "Health check endpoints" },
        ],
        components: {
          securitySchemes: {
            participantToken: {
              type: "apiKey",
              name: "x-participant-token",
              in: "header",
            },
          },
        },
      },
    },
    swaggerUi: standardSwaggerUiOptions,
  });
}
