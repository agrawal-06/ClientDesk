import express from "express";
import { handleWorkspace } from "./workspace.js";

export function createApp(dependencies, allowedOrigins) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    const origin = req.get("origin");
    if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: "Origin not allowed." });
    if (origin) res.set("Access-Control-Allow-Origin", origin).set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "authorization, content-type, x-workspace-owner");
    res.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(async (req, res) => {
    const result = await handleWorkspace({
      method: req.method, path: req.path, body: req.body, authorization: req.get("authorization"), expectedOwner: req.get("x-workspace-owner"),
    }, dependencies);
    res.status(result.status).json(result.body);
  });
  app.use((error, req, res, next) => {
    const status = error.type === "entity.too.large" ? 413 : error instanceof SyntaxError ? 400 : 503;
    res.status(status).json({ error: status === 503 ? "Cloud storage is temporarily unavailable. Your changes have not been confirmed." : "Invalid or oversized request." });
  });
  return app;
}
