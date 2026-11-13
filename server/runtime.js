import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { workspaceStore } from "./workspace.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
const issuer = new URL(process.env.NEON_AUTH_BASE_URL).origin;
export const dependencies = {
  store: workspaceStore(pool),
  async verify(authorization) {
    if (!authorization?.startsWith("Bearer ")) throw Error("Missing token");
    const { payload } = await jwtVerify(authorization.slice(7), jwks, { issuer, algorithms: ["EdDSA"] });
    if (!payload.sub || !payload.exp) throw Error("Invalid token");
    return payload.sub;
  },
};
export const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean),
);
