import type { FastifyPluginAsync } from "fastify";
import type { OperatorController } from "../controllers/operator-controller.js";
import type { Auth } from "../http/auth.js";

export const createAdminRoutes: FastifyPluginAsync<{
  controller: OperatorController;
  auth: Auth;
}> = async (app, { controller, auth }) => {
  app.addHook("preHandler", async (request, reply) => {
    try {
      auth.requireAdmin(request.raw);
    } catch (error) {
      const err = error as { status?: number; message?: string };
      reply.status(err.status || 401).send({
        error: err.message || "Unauthorized",
      });
    }
  });

  app.get(
    "/admin/dashboard",
    {
      schema: {
        tags: ["admin"],
        description:
          "Get dashboard statistics including total participants, status breakdown, and recent activity",
      },
    },
    async (_request, reply) => {
      const result = await controller.getDashboardStats();
      reply.send(result);
    },
  );

  app.get(
    "/admin/participants",
    {
      schema: {
        tags: ["admin"],
        description:
          "List participants with optional search and filters (query params: search, status, sort, order, limit, offset)",
      },
    },
    async (request, reply) => {
      const query = request.query as {
        search?: string;
        status?: string;
        sort?: "created_at" | "updated_at" | "legal_name";
        order?: "asc" | "desc";
        limit?: number;
        offset?: number;
      };
      const result = await controller.listParticipants(query);
      reply.send(result);
    },
  );

  app.get(
    "/admin/participants/export",
    {
      schema: {
        tags: ["admin"],
        description:
          "Export participants to CSV with optional filters (query params: search, status, sort, order)",
      },
    },
    async (request, reply) => {
      const query = request.query as {
        search?: string;
        status?: string;
        sort?: "created_at" | "updated_at" | "legal_name";
        order?: "asc" | "desc";
      };
      const csv = await controller.exportParticipantsCsv(query);
      reply
        .type("text/csv")
        .header(
          "Content-Disposition",
          'attachment; filename="participants.csv"',
        )
        .send(csv);
    },
  );

  app.post("/admin/participants", async (request, reply) => {
    await controller.createParticipant(request.raw, reply.raw, request.body);
  });

  app.get("/admin/participants/:participantId", async (request, reply) => {
    const { participantId } = request.params as { participantId: string };
    await controller.handleAdminParticipant(
      request.raw,
      reply.raw,
      participantId,
      undefined,
    );
  });

  app.get(
    "/admin/participants/:participantId/events",
    {
      schema: {
        tags: ["admin"],
        description: "Get audit log events for a participant",
      },
    },
    async (request, reply) => {
      const { participantId } = request.params as { participantId: string };
      const result = await controller.getParticipantEvents(participantId);
      reply.send(result);
    },
  );

  app.patch("/admin/participants/:participantId", async (request, reply) => {
    const { participantId } = request.params as { participantId: string };
    await controller.handleAdminParticipant(
      request.raw,
      reply.raw,
      participantId,
      "organization",
      request.body,
    );
  });

  app.patch(
    "/admin/participants/:participantId/:action",
    async (request, reply) => {
      const { participantId, action } = request.params as {
        participantId: string;
        action: string;
      };
      await controller.handleAdminParticipant(
        request.raw,
        reply.raw,
        participantId,
        action,
        request.body,
      );
    },
  );

  app.post(
    "/admin/participants/:participantId/:action",
    async (request, reply) => {
      const { participantId, action } = request.params as {
        participantId: string;
        action: string;
      };
      await controller.handleAdminParticipant(
        request.raw,
        reply.raw,
        participantId,
        action,
        request.body,
      );
    },
  );
};
