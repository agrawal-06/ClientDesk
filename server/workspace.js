import { validateBackup } from "../src/lib/backup.js";

export const emptyWorkspace = () => ({ clients: [], projects: [], payments: [], demo: false });

// ponytail: one JSON document per user, capped at 1 MB. Split into relational
// client/project/payment tables when workspaces need larger data or shared editing.
export function workspaceStore(pool) {
  return {
    async read(owner) {
      const { rows } = await pool.query(
        "SELECT data, version, updated_at FROM clientdesk_workspaces WHERE owner_id = $1", [owner],
      );
      return rows[0] ?? { data: emptyWorkspace(), version: 0, updated_at: null };
    },
    async previous(owner) {
      const { rows } = await pool.query(
        "SELECT previous_data AS data FROM clientdesk_workspaces WHERE owner_id = $1", [owner],
      );
      return rows[0]?.data ?? null;
    },
    async save(owner, data, version) {
      // Insert once; all later saves compare the version in one atomic UPDATE.
      if (version === 0) {
        const { rows } = await pool.query(
          "INSERT INTO clientdesk_workspaces (owner_id, data, version) VALUES ($1, $2::jsonb, 1) ON CONFLICT (owner_id) DO NOTHING RETURNING data, version, updated_at",
          [owner, JSON.stringify(data)],
        );
        return rows[0] ?? null;
      }
      const updated = await pool.query(
        `UPDATE clientdesk_workspaces SET previous_data = data, data = $2::jsonb,
          version = version + 1, updated_at = now()
         WHERE owner_id = $1 AND version = $3 RETURNING data, version, updated_at`,
        [owner, JSON.stringify(data), version],
      );
      return updated.rows[0] ?? null;
    },
  };
}

export async function handleWorkspace({ method, path, body, authorization, expectedOwner }, { verify, store }) {
  let user;
  try { user = await verify(authorization); } catch { return { status: 401, body: { error: "Sign in to access your cloud workspace." } }; }
  if (!user || typeof user !== "string") return { status: 401, body: { error: "Sign in required." } };
  if (expectedOwner !== user) return { status: 409, body: { error: "Your signed-in account changed. Reload the page before continuing." } };
  if (path === "/api/workspace/previous" && method === "GET") {
    const data = await store.previous(user);
    return data ? { status: 200, body: { data } } : { status: 404, body: { error: "No previous cloud version is available yet." } };
  }
  if (path !== "/api/workspace") return { status: 404, body: { error: "Not found." } };
  if (method === "GET") return { status: 200, body: await store.read(user) };
  if (method !== "PUT") return { status: 405, body: { error: "Method not allowed." } };
  try {
    if (!Number.isSafeInteger(body?.version) || body.version < 0 || body.version >= 2147483647) throw Error("Invalid workspace version.");
    validateBackup(body.data);
    if (Buffer.byteLength(JSON.stringify(body.data)) > 1000000) throw Error("Workspace exceeds the 1 MB limit.");
  } catch (error) { return { status: 400, body: { error: error.message } }; }
  const saved = await store.save(user, body.data, body.version);
  return saved
    ? { status: 200, body: saved }
    : { status: 409, body: { error: "Your cloud workspace changed on another tab or device. Reload before saving." } };
}
