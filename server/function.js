// Neon Functions accepts Fetch requests. The same validation, auth and database
// service is used by our local Express server.
import { dependencies, allowedOrigins } from "./runtime.js";
import { handleWorkspace } from "./workspace.js";

export default {
  async fetch(request) {
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
    const reply = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers });
    const origin = request.headers.get("origin");
    if (origin && !allowedOrigins.has(origin)) return reply(403, { error: "Origin not allowed." });
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, content-type, x-workspace-owner";
    headers["Access-Control-Allow-Methods"] = "GET, PUT, OPTIONS";
    if (request.method === "OPTIONS") return reply(204, null);
    try {
      let body;
      if (request.method === "PUT") {
        const reader = request.body?.getReader();
        let size = 0;
        const chunks = [];
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1048576) { await reader.cancel(); return reply(413, { error: "Workspace too large." }); }
            chunks.push(value);
          }
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { return reply(400, { error: "Invalid JSON." }); }
      }
      const result = await handleWorkspace({
        method: request.method, path: new URL(request.url).pathname,
        body, authorization: request.headers.get("authorization"), expectedOwner: request.headers.get("x-workspace-owner"),
      }, dependencies);
      return reply(result.status, result.body);
    } catch { return reply(503, { error: "Cloud storage is temporarily unavailable. Your changes have not been confirmed." }); }
  },
};
