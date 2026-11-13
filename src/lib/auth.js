import { createAuthClient } from "@neon/auth";
import { BetterAuthReactAdapter } from "@neon/auth/react/adapters";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL || "https://ep-damp-hat-az0isqf9.neonauth.c-3.ap-southeast-1.aws.neon.tech/clientdesk/auth";
const apiUrl = import.meta.env.VITE_API_URL || "https://br-autumn-shape-azzp8wry-clientdesk.compute.c-3.ap-southeast-1.aws.neon.tech";

export const cloudEnabled = import.meta.env.VITE_LOCAL_ONLY !== "true";
export const auth = cloudEnabled ? createAuthClient(authUrl, {
  adapter: BetterAuthReactAdapter(),
}) : null;

export async function cloudRequest(path, options = {}, expectedOwner) {
  const { data, error } = await auth.token();
  // Neon SDK 0.8 can serve its cached session for the token endpoint.
  // Its session token is the JWT injected by the SDK; the API verifies it.
  const token = data?.token || data?.session?.token;
  if (error || !token) throw Object.assign(new Error("Your session has expired. Sign in again."), { status: 401 });
  const response = await fetch(apiUrl.replace(/\/$/, "") + path, {
    ...options, cache: "no-store",
    headers: { "X-Workspace-Owner": expectedOwner, "Content-Type": "application/json", Authorization: "Bearer " + token },
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || "Could not reach cloud storage."), { status: response.status });
  return result;
}
