// Optional live smoke check. Creates a synthetic QA account, never uses client data.
// Run: node --use-env-proxy server/cloud-check.js
import assert from "node:assert/strict";
import { createAuthClient } from "@neon/auth";
import { BetterAuthVanillaAdapter } from "@neon/auth/vanilla/adapters";
import { seed, today } from "../src/lib/domain.js";
import { generateDue, business } from "../src/lib/business.js";
const base =
  "https://ep-damp-hat-az0isqf9.neonauth.c-3.ap-southeast-1.aws.neon.tech/clientdesk/auth";
const api =
  process.env.CLIENTDESK_API_URL || "https://clientdesk-eta.vercel.app";
const origin = "https://clientdesk-eta.vercel.app";
const cookies = new Map();
setTimeout(() => {
  console.error("Smoke check timed out");
  process.exit(1);
}, 600000).unref();
// Node has no browser cookie jar. Keep synthetic test cookies in memory only.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith(base)) return nativeFetch(url, options);
  const headers = new Headers(options?.headers);
  headers.set("origin", origin);
  if (cookies.size)
    headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
  const response = await nativeFetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(30000),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const first = cookie.split(";")[0];
    const i = first.indexOf("=");
    cookies.set(first.slice(0, i), first.slice(i + 1));
  }
  return response;
};
const auth = createAuthClient(base, {
  adapter: BetterAuthVanillaAdapter({ fetchOptions: { headers: { origin } } }),
});
const email = `clientdesk-qa-${crypto.randomUUID()}@example.com`;
const password = crypto.randomUUID() + "Aa1!";
try {
  const signup = await auth.signUp.email({
    email,
    password,
    name: "ClientDesk QA",
    callbackURL: origin,
  });
  assert.equal(signup.error, null, signup.error?.message);
  console.log("Synthetic signup passed");
  const owner = signup.data.user.id;
  assert.equal((await auth.getSession()).data.user.id, owner);
  const tokenResult = await auth.token();
  const token = tokenResult.data?.token || tokenResult.data?.session?.token;
  assert.ok(token, tokenResult.error?.message);
  console.log("JWT acquired");
  const call = async (
    method,
    body,
    expected = owner,
    path = "/api/workspace",
  ) => {
    const r = await fetch(api + path, {
      method,
      headers: {
        origin,
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        "X-Workspace-Owner": expected,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    console.log("API", method, path, r.status);
    return { status: r.status, data: await r.json() };
  };
  const initial = await call("GET");
  assert.equal(initial.status, 200);
  assert.equal(initial.data.version, 0);
  const baseData = seed();
  baseData.demo = false;
  const invoice = {
    id: "qa-invoice",
    clientId: "c1",
    number: "QA-001",
    issuer: "QA Studio",
    terms: "Synthetic test only",
    date: today(),
    due: today(),
    items: [{ description: "Test service", quantity: 1, rate: 100 }],
  };
  const data = {
    ...baseData,
    business: {
      invoices: [invoice],
      notes: [
        {
          id: "private-note",
          projectId: "p1",
          date: today(),
          body: "PRIVATE_QA_NOTE",
        },
      ],
      followups: [
        {
          id: "f1",
          clientId: "c1",
          date: today(),
          note: "QA follow-up",
          done: false,
        },
      ],
      expenses: [
        {
          id: "e1",
          projectId: "p1",
          amount: 100,
          date: today(),
          category: "QA",
          note: "Test",
        },
      ],
      timeEntries: [
        {
          id: "t1",
          projectId: "p1",
          note: "QA",
          startedAt: Date.now() - 60000,
          endedAt: Date.now(),
        },
      ],
      proposals: [{ ...invoice, id: "q1", number: "QUOTE-1", status: "Draft" }],
      recurring: [
        {
          ...invoice,
          id: "r1",
          number: "RECUR-1",
          nextDate: today(),
          anchorDay: Number(today().slice(-2)),
          dueDays: 14,
          active: false,
        },
      ],
    },
  };
  assert.equal((await call("PUT", { version: 0, data })).status, 200);
  const callBusiness = (body) => call("POST", body, owner, "/api/business");
  const listed = await callBusiness({ action: "list" });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.paymentsReady, false);
  const content = Buffer.from("Synthetic attachment").toString("base64");
  assert.equal(
    (
      await callBusiness({
        action: "upload",
        projectId: "p1",
        name: "qa-private.txt",
        content,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await callBusiness({
        action: "upload",
        projectId: "p1",
        name: "qa-shared.txt",
        content,
        shared: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await callBusiness({
        action: "upload",
        projectId: "p2",
        name: "qa-other-client.txt",
        content,
        shared: true,
      })
    ).status,
    200,
  );
  const files = (await callBusiness({ action: "list" })).data.files;
  const privateFile = files.find((f) => f.name === "qa-private.txt"),
    sharedFile = files.find((f) => f.name === "qa-shared.txt"),
    otherFile = files.find((f) => f.name === "qa-other-client.txt");
  assert.equal(
    (await callBusiness({ action: "download", id: privateFile.id })).data
      .content,
    content,
  );
  const link = await callBusiness({ action: "link", clientId: "c1" });
  assert.equal(link.status, 200);
  assert.ok(link.data.token);
  const portal = async (body) => {
    const r = await nativeFetch(api + "/api/portal", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.data.token, ...body }),
    });
    return { status: r.status, data: await r.json() };
  };
  const view = await portal({ action: "list" });
  assert.equal(view.status, 200);
  assert.equal(view.data.projects.length, 1);
  assert.equal(view.data.files.length, 1);
  assert.equal(view.data.files[0].id, sharedFile.id);
  assert.equal(JSON.stringify(view.data).includes("PRIVATE_QA_NOTE"), false);
  assert.equal(view.data.invoices.length, 1);
  assert.equal(
    (await portal({ action: "download", id: privateFile.id })).status,
    404,
  );
  assert.equal(
    (await portal({ action: "download", id: otherFile.id })).status,
    404,
  );
  assert.equal(
    (await portal({ action: "download", id: sharedFile.id })).data.content,
    content,
  );
  assert.equal((await portal({ action: "link", clientId: "c2" })).status, 403);
  assert.equal(
    (await portal({ action: "order", id: "qa-invoice" })).status,
    503,
  );
  const links = (await callBusiness({ action: "list" })).data.links;
  assert.equal(
    (await callBusiness({ action: "revoke", id: links[0].id })).status,
    200,
  );
  assert.equal((await portal({ action: "list" })).status, 401);
  assert.equal((await call("PUT", { version: 0, data })).status, 409);
  const loaded = await call("GET");
  assert.deepEqual(loaded.data.data, data);
  console.log(
    "Business live checks passed: all collections persist, attachment privacy, client isolation, revoked link rejection, unconfigured checkout and stale-write protection.",
  );
  console.log("Signing out");
  await auth.signOut();
  const signin = await auth.signIn.email({
    email,
    password,
    callbackURL: origin,
  });
  assert.equal(signin.error, null, signin.error?.message);
  assert.equal((await auth.getSession()).data.user.id, owner);
  console.log("Signing out");
  await auth.signOut();
  console.log("Business live smoke check complete.");
  process.exit(0);
} catch (error) {
  console.error("Live smoke check failed:", error.message);
  process.exitCode = 1;
}
