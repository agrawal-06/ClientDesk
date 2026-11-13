import { createApp } from "../server/app.js";
import { dependencies, allowedOrigins } from "../server/runtime.js";

// Vercel invokes Express directly; no port listener is needed.
export default createApp(dependencies, allowedOrigins);
