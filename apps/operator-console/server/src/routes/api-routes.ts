import type { FastifyPluginAsync } from "fastify";
import type { OperatorController } from "../controllers/operator-controller.js";
import type { Auth } from "../http/auth.js";
import type { HealthService } from "@tx-bootstrap/core/server/services/health-service.js";
import { createAdminRoutes } from "./admin-routes.js";
import { createHealthRoutes } from "./health-routes.js";

export const createApiRoutes: FastifyPluginAsync<{
  controller: OperatorController;
  auth: Auth;
  healthService: HealthService;
}> = async (app, { controller, auth, healthService }) => {
  await app.register(createHealthRoutes, { healthService });
  await app.register(createAdminRoutes, { controller, auth });
};
