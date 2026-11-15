import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  signatureValid,
  validateFile,
  recordCapture,
  businessHandler,
} from "./business.js";
import { seed } from "../src/lib/domain.js";
test("payment signatures require exact bytes and reject malformed input", () => {
  const secret = "test-secret",
    body = Buffer.from('{"event":"payment.captured"}');
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(signatureValid(body, signature, secret), true);
  assert.equal(
    signatureValid(Buffer.concat([body, Buffer.from(" ")]), signature, secret),
    false,
  );
  for (const value of [null, "", "xyz", signature.slice(2), "0".repeat(64)])
    assert.equal(signatureValid(body, value, secret), false);
  assert.equal(signatureValid(body, signature, ""), false);
});
test("uploads enforce size, filenames, types and file signatures", () => {
  assert.equal(
    validateFile(
      "note.txt",
      Buffer.from("hello").toString("base64"),
    ).toString(),
    "hello",
  );
  assert.throws(() => validateFile("../secret.txt", "YQ=="));
  assert.throws(() => validateFile("fake.pdf", "YQ=="));
  assert.throws(() => validateFile("x.txt", "@@"));
  assert.throws(() => validateFile("x.html", "YQ=="));
  assert.throws(() =>
    validateFile("x.txt", Buffer.alloc(1048577, 65).toString("base64")),
  );
});
test("captures check currency, amount and replay identity before recording", async () => {
  const order = { order_id: "order_1", amount: "100", payment_id: null };
  let writes = 0;
  const db = {
    release() {},
    async query(sql, args) {
      if (sql.startsWith("SELECT")) return { rows: [order] };
      if (sql.startsWith("UPDATE")) {
        order.payment_id = args[1];
        writes++;
      }
      return { rows: [] };
    },
  };
  const pool = { connect: async () => db };
  const p = {
    id: "pay_1",
    order_id: "order_1",
    status: "captured",
    currency: "INR",
    amount: 100,
  };
  await assert.rejects(recordCapture(pool, { ...p, amount: 101 }));
  await assert.rejects(recordCapture(pool, { ...p, status: "authorized" }));
  await assert.rejects(recordCapture(pool, { ...p, currency: "USD" }));
  assert.equal(writes, 0);
  await recordCapture(pool, p);
  await recordCapture(pool, p);
  assert.equal(order.payment_id, "pay_1");
  await assert.rejects(recordCapture(pool, { ...p, id: "pay_2" }));
});
async function invoke(path, body, deps, headers = {}) {
  let status = 200,
    result;
  const res = {
    status(s) {
      status = s;
      return this;
    },
    json(r) {
      result = r;
    },
  };
  await businessHandler(
    { path, method: "POST", body, get: (k) => headers[k] },
    res,
    deps,
    {},
  );
  return { status, result };
}
test("business endpoints reject unauthenticated and switched accounts before querying data", async () => {
  const pool = {
    query() {
      throw Error("Must not query");
    },
    connect() {
      throw Error("Must not connect");
    },
  };
  assert.equal(
    (
      await invoke(
        "/api/business",
        {},
        {
          pool,
          verify: async () => {
            throw Error();
          },
        },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await invoke(
        "/api/business",
        {},
        { pool, verify: async () => "owner" },
        { "x-workspace-owner": "other" },
      )
    ).status,
    409,
  );
  assert.equal(
    (await invoke("/api/portal", { token: "bad" }, { pool })).status,
    401,
  );
});
test("portal cannot download private files, other client files or invoke owner actions", async () => {
  const data = seed();
  const db = {
    release() {},
    async query(sql) {
      if (sql.includes("FROM clientdesk_workspaces"))
        return { rows: [{ data, version: 1 }] };
      if (sql.includes("FROM clientdesk_files"))
        return {
          rows: [
            {
              name: "private.txt",
              project_id: "p2",
              shared: true,
              content: Buffer.from("secret"),
            },
          ],
        };
      return { rows: [] };
    },
  };
  const pool = {
    query: async () => ({ rows: [{ owner_id: "owner", client_id: "c1" }] }),
    connect: async () => db,
  };
  const token = "a".repeat(64);
  assert.equal(
    (
      await invoke(
        "/api/portal",
        { token, action: "download", id: "file" },
        { pool },
      )
    ).status,
    404,
  );
  assert.equal(
    (await invoke("/api/portal", { token, action: "upload" }, { pool })).status,
    403,
  );
});
