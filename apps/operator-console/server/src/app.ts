import fastifyStatic from "@fastify/static";
import {
  createStandardFastifyApp,
  registerStandardErrorHandler,
} from "@tx-bootstrap/core/server/fastify/app.js";
import type { HealthService } from "@tx-bootstrap/core/server/services/health-service.js";
import { createApiRoutes } from "./routes/api-routes.js";
import type { Config } from "./config/index.js";
import type { OperatorController } from "./controllers/operator-controller.js";
import type { Auth } from "./http/auth.js";
import { registerAppPlugins } from "./plugins.js";

export function createApp({
  config,
  controller,
  auth,
  healthService,
}: {
  config: Config;
  controller: OperatorController;
  auth: Auth;
  healthService: HealthService;
}) {
  const app = createStandardFastifyApp({ logLevel: config.logLevel });

  registerAppPlugins(app, config);

  // Static files for frontend
  app.register(fastifyStatic, {
    root: config.distRoot,
    prefix: "/",
    index: "index.html",
    wildcard: false,
  });

  // Custom config.js endpoint for runtime configuration
  app.get("/config.js", async (_request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("Content-Type", "application/javascript; charset=utf-8")
      .send(
        `window.config = ${JSON.stringify({
          title: config.console.title,
          subtitle: config.console.subtitle,
          theme: config.console.theme ?? undefined,
        })};\n`,
      );
  });

  // Register API routes
  app.register(createApiRoutes, {
    prefix: "/api",
    controller,
    auth,
    healthService,
  });

  registerStandardErrorHandler(app, {
    includeValidationDetails: process.env.NODE_ENV === "development",
    includeStack: process.env.NODE_ENV === "development",
  });

  // 404 handler - serve index.html for SPA routes, 404 for API routes
  app.setNotFoundHandler(async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      // SPA fallback - serve index.html
      return reply.sendFile("index.html");
    } else {
      return reply.status(404).send({ error: "Not found" });
    }
  });

  return app;
}
