import cors, { type FastifyCorsOptions } from "@fastify/cors";
import helmet, { type FastifyHelmetOptions } from "@fastify/helmet";
import rateLimit, { type RateLimitPluginOptions } from "@fastify/rate-limit";
import swagger, { type SwaggerOptions } from "@fastify/swagger";
import swaggerUi, { type FastifySwaggerUiOptions } from "@fastify/swagger-ui";
import fastify, { LogController, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { LogLevel } from "../config/env.js";
import { toHttpValidationError } from "../http/body.js";

export type StandardFastifyApp = ReturnType<typeof createStandardFastifyApp>;

type StandardErrorHandlerApp = Pick<StandardFastifyApp, "setErrorHandler">;

export type CreateStandardFastifyAppOptions = {
  logLevel: LogLevel;
  prettyLogs?: boolean;
  disableRequestLogging?: boolean | ((request: FastifyRequest) => boolean);
};

export type StandardErrorHandlerOptions = {
  includeValidationDetails?: boolean;
  includeStack?: boolean;
};

export type StandardFastifyPluginOptions = {
  helmet?: FastifyHelmetOptions | false;
  cors?: FastifyCorsOptions | false;
  rateLimit?: RateLimitPluginOptions | false;
  swagger?: SwaggerOptions | false;
  swaggerUi?: FastifySwaggerUiOptions | false;
};

export const standardSwaggerUiOptions = {
  routePrefix: "/api/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: false,
  },
} satisfies FastifySwaggerUiOptions;

export function createStandardFastifyApp({
  logLevel,
  prettyLogs = process.env.NODE_ENV === "development",
  disableRequestLogging = false,
}: CreateStandardFastifyAppOptions) {
  const app = fastify({
    logger: {
      level: logLevel,
      transport: prettyLogs
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              ignore: "pid,hostname",
              translateTime: "HH:MM:ss.l",
            },
          }
        : undefined,
    },
    logController: new LogController({
      requestIdLogLabel: "reqId",
      disableRequestLogging,
    }),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  return app;
}

export function registerStandardFastifyPlugins(
  app: StandardFastifyApp,
  options: StandardFastifyPluginOptions,
): void {
  if (options.helmet !== false && options.helmet) {
    app.register(helmet, options.helmet);
  }

  if (options.cors !== false && options.cors) {
    app.register(cors, options.cors);
  }

  if (options.rateLimit !== false && options.rateLimit) {
    app.register(rateLimit, options.rateLimit);
  }

  if (options.swagger !== false && options.swagger) {
    app.register(swagger, options.swagger);
  }

  if (options.swaggerUi !== false && options.swaggerUi) {
    app.register(swaggerUi, options.swaggerUi);
  }
}

export function registerStandardErrorHandler(
  app: StandardErrorHandlerApp,
  options: StandardErrorHandlerOptions = {},
): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const validationError = toHttpValidationError(error);
      if (validationError) {
        request.log.warn({ err: error, reqId: request.id }, "Validation error");
        return reply.status(400).send({
          error: validationError.message,
          ...(options.includeValidationDetails && { details: error.issues }),
          requestId: request.id,
        });
      }
    }

    const err = error as {
      statusCode?: number;
      status?: number;
      message?: string;
      stack?: string;
    };
    const status = validHttpErrorStatus(err.statusCode)
      ? Number(err.statusCode)
      : validHttpErrorStatus(err.status)
        ? Number(err.status)
        : 500;
    const serverError = status >= 500;

    if (serverError) {
      request.log.error(
        { err: error, reqId: request.id },
        "Internal server error",
      );
    } else {
      request.log.warn({ err: error, reqId: request.id }, "Client error");
    }

    return reply.status(status).send({
      error: serverError
        ? "Internal server error"
        : err.message || "Request failed",
      ...(options.includeStack && { stack: err.stack }),
      requestId: request.id,
    });
  });
}

function validHttpErrorStatus(value: unknown): boolean {
  return (
    Number.isInteger(value) && Number(value) >= 400 && Number(value) <= 599
  );
}
