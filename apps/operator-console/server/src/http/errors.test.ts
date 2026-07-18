import { describe, it, expect } from "vitest";
import {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  notFound,
  unauthorized,
  configurationError,
} from "@tx-bootstrap/core/server/http/errors.js";

describe("HttpError", () => {
  it("should create error with correct status and message", () => {
    const error = new HttpError("Test error", 418);
    expect(error.message).toBe("Test error");
    expect(error.status).toBe(418);
    expect(error.name).toBe("HttpError");
  });
});

describe("BadRequestError", () => {
  it("should create 400 error", () => {
    const error = new BadRequestError("Invalid input");
    expect(error.message).toBe("Invalid input");
    expect(error.status).toBe(400);
    expect(error.name).toBe("BadRequestError");
  });
});

describe("UnauthorizedError", () => {
  it("should create 401 error with default message", () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe("Unauthorized");
    expect(error.status).toBe(401);
    expect(error.name).toBe("UnauthorizedError");
  });

  it("should create 401 error with custom message", () => {
    const error = new UnauthorizedError("Invalid credentials");
    expect(error.message).toBe("Invalid credentials");
    expect(error.status).toBe(401);
  });
});

describe("NotFoundError", () => {
  it("should create 404 error with default message", () => {
    const error = new NotFoundError();
    expect(error.message).toBe("Resource not found");
    expect(error.status).toBe(404);
    expect(error.name).toBe("NotFoundError");
  });

  it("should create 404 error with custom message", () => {
    const error = new NotFoundError("Case not found");
    expect(error.message).toBe("Case not found");
    expect(error.status).toBe(404);
  });
});

describe("ConflictError", () => {
  it("should create 409 error", () => {
    const error = new ConflictError("Resource already exists");
    expect(error.message).toBe("Resource already exists");
    expect(error.status).toBe(409);
    expect(error.name).toBe("ConflictError");
  });
});

describe("InternalServerError", () => {
  it("should create 500 error", () => {
    const error = new InternalServerError("Something went wrong");
    expect(error.message).toBe("Something went wrong");
    expect(error.status).toBe(500);
    expect(error.name).toBe("InternalServerError");
  });
});

describe("factory functions", () => {
  it("notFound() should create NotFoundError with default message", () => {
    const error = notFound();
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe("Onboarding case not found");
    expect(error.status).toBe(404);
  });

  it("notFound(message) should create NotFoundError with custom message", () => {
    const error = notFound("Custom not found");
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe("Custom not found");
  });

  it("unauthorized() should create UnauthorizedError", () => {
    const error = unauthorized();
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.status).toBe(401);
  });

  it("configurationError() should create InternalServerError", () => {
    const error = configurationError("Config missing");
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.message).toBe("Config missing");
    expect(error.status).toBe(500);
  });
});
