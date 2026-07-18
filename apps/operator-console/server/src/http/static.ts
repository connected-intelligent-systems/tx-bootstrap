import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import {
  sendJavaScript,
  sendJson,
} from "@tx-bootstrap/core/server/http/responses.js";

export function createStaticHandlers(config) {
  async function serveStatic(request, response) {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const safePath = normalize(decodeURIComponent(url.pathname)).replace(
      /^(\.\.[/\\])+/,
      "",
    );
    const filePath =
      safePath === "/"
        ? join(config.distRoot, "index.html")
        : join(config.distRoot, safePath);
    const target =
      existsSync(filePath) && !filePath.endsWith("/")
        ? filePath
        : join(config.distRoot, "index.html");

    if (!existsSync(target)) {
      sendJson(response, 404, { error: "Frontend build not found" });
      return;
    }

    response.writeHead(200, { "Content-Type": contentType(target) });
    createReadStream(target).pipe(response);
  }

  function serveConsoleConfig(response) {
    sendJavaScript(
      response,
      `window.config = ${JSON.stringify({
        title: config.console.title,
        subtitle: config.console.subtitle,
        theme: config.console.theme ?? undefined,
      })};\n`,
    );
  }

  return { serveStatic, serveConsoleConfig };
}

function contentType(filePath) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".json": "application/json; charset=utf-8",
    }[extname(filePath)] ?? "application/octet-stream"
  );
}
