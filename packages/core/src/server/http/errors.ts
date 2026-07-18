export class HttpError extends Error {
  public details?: unknown;

  constructor(
    message: string,
    public status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Resource not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(message, 409, details);
    this.name = "ConflictError";
  }
}

export class InternalServerError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(message, 500, details);
    this.name = "InternalServerError";
  }
}

// Legacy factory functions for backward compatibility
export function notFound(message = "Onboarding case not found"): NotFoundError {
  return new NotFoundError(message);
}

export function unauthorized(): UnauthorizedError {
  return new UnauthorizedError();
}

export function configurationError(message: string): InternalServerError {
  return new InternalServerError(message);
}

// Generic factory function for creating HTTP errors
export function httpError(
  status: number,
  message: string,
  details?: unknown,
): HttpError {
  return new HttpError(message, status, details);
}

// Helper to check if a value is a record object
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Factory function for creating upstream service errors
export function upstreamError(
  status: number,
  upstreamName: string,
  payload: unknown,
  responseText: string,
): HttpError {
  const defaultMessage = upstreamName + " returned " + status;
  const message = isRecord(payload)
    ? String(payload.error || payload.message || defaultMessage)
    : responseText || defaultMessage;
  return httpError(status >= 400 && status < 500 ? status : 502, message, payload);
}
