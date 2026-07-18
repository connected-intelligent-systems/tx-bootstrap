export function sendJson(response, status, payload) {
  addCors(response);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

export function sendJavaScript(response, body) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "application/javascript; charset=utf-8",
  });
  response.end(body);
}

export function addCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, x-participant-token",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
}
