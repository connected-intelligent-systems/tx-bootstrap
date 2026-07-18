import {
  headerValue,
  requireParticipant,
} from "@tx-bootstrap/core/server/http/auth.js";
import {
  configurationError,
  unauthorized,
} from "@tx-bootstrap/core/server/http/errors.js";

export function createAuth(config) {
  const { mode, apiKey, header, allowedUsers } = config.adminAuth;

  function requireAdmin(request) {
    if (mode === "network" || mode === "none") return;

    if (mode === "api-key") {
      if (!apiKey)
        throw configurationError(
          "OPERATOR_CONSOLE_API_KEY is required when OPERATOR_CONSOLE_AUTH_MODE=api-key",
        );
      if (request.headers["x-api-key"] === apiKey) return;
      throw unauthorized();
    }

    if (mode === "forwarded-header" || mode === "forwarded") {
      const user = headerValue(request.headers[header]);
      if (user && (!allowedUsers.size || allowedUsers.has(user))) return;
      throw unauthorized();
    }

    throw configurationError(`Unsupported OPERATOR_CONSOLE_AUTH_MODE: ${mode}`);
  }

  function eventActor(request) {
    const forwardedUser = headerValue(request.headers[header]);
    if (forwardedUser) return forwardedUser;
    if (request.headers["x-api-key"]) return "api-key";
    return "operator";
  }

  return { requireAdmin, eventActor };
}

export type Auth = ReturnType<typeof createAuth>;

export { headerValue, requireParticipant };
