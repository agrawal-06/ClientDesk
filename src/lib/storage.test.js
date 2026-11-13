import test from "node:test";
import assert from "node:assert/strict";
import {
  commitWorkspace,
  decode,
  STORAGE_KEY,
  StorageConflict,
} from "./storage.js";
import {
  seed,
  correctPayment,
  received,
  activePayments,
  isCalendarDate,
} from "./domain.js";
import { validateBackup } from "./backup.js";
function memory(raw) {
  const values = new Map();
  if (raw !== null) values.set(STORAGE_KEY, raw);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
function locks() {
  let queue = Promise.resolve();
  return {
    request: (_name, callback) => {
      const next = queue.then(callback);
      queue = next.then(
        () => {},
        () => {},
      );
      return next;
    },
  };
}
test("legacy data loads without migration or mutation", () => {
  const d = seed();
  assert.deepEqual(decode(JSON.stringify(d)), d);
});
test("corrupt and malformed data do not turn into demo data", () => {
  for (const raw of ["bad", "{}", "null", '{"clients":[]}'])
    assert.throws(() => decode(raw));
});
test("concurrent tabs cannot overwrite each other", async () => {
  const d = seed(),
    raw = JSON.stringify(d),
    storage = memory(raw),
    lock = locks();
  const first = {
    ...d,
    clients: d.clients.map((c) => ({ ...c, name: "First change" })),
  };
  const results = await Promise.allSettled([
    commitWorkspace(storage, lock, raw, first),
    commitWorkspace(storage, lock, raw, { ...d, demo: false }),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  if (results[1].status === "rejected")
    assert.ok(results[1].reason instanceof StorageConflict);
  assert.equal(
    decode(storage.getItem(STORAGE_KEY)).clients[0].name,
    "First change",
  );
});
test("recovery preserves exact corrupt bytes before replacing", async () => {
  const storage = memory("{broken");
  await commitWorkspace(storage, locks(), "{broken", seed(), true);
  assert.ok(
    [...storage.values.entries()].some(
      ([key, value]) =>
        key.startsWith(STORAGE_KEY + ".recovery.") && value === "{broken",
    ),
  );
  validateBackup(decode(storage.getItem(STORAGE_KEY)));
});
test("failed recovery copy leaves original untouched", async () => {
  const storage = memory("{broken");
  storage.setItem = () => {
    throw Error("quota");
  };
  await assert.rejects(
    commitWorkspace(storage, locks(), "{broken", seed(), true),
  );
  assert.equal(storage.getItem(STORAGE_KEY), "{broken");
});
test("failed main write leaves prior data intact", async () => {
  const raw = JSON.stringify(seed()),
    storage = memory(raw);
  storage.setItem = () => {
    throw Error("quota");
  };
  await assert.rejects(commitWorkspace(storage, locks(), raw, seed()));
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});
test("missing locks and stale reset refuse unsafe writes", async () => {
  const raw = JSON.stringify(seed()),
    storage = memory(raw);
  await assert.rejects(commitWorkspace(storage, undefined, raw, seed()));
  await assert.rejects(
    commitWorkspace(storage, locks(), "stale", seed(), true),
    StorageConflict,
  );
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(storage.values.size, 1);
});
test("dates reject rollover and future received dates", () => {
  assert.ok(isCalendarDate("2024-02-29"));
  assert.equal(isCalendarDate("2026-02-31"), false);
  for (const date of ["2026-02-31", "9999-01-01"]) {
    const d = seed();
    d.payments[0].date = date;
    assert.throws(() => validateBackup(d));
  }
});
test("correction preserves original details and updates active total", () => {
  const d = seed(),
    original = structuredClone(d.payments[0]);
  const next = correctPayment(
    d,
    original.id,
    { amount: 500000, date: original.date, note: "Corrected" },
    "Wrong amount",
  );
  assert.deepEqual(d.payments[0], original);
  assert.equal(next.payments[0].amount, original.amount);
  assert.equal(next.payments[0].date, original.date);
  assert.equal(next.payments[0].voidReason, "Wrong amount");
  assert.equal(next.payments.at(-1)?.replacesId, original.id);
  assert.equal(received(next, original.projectId), 500000);
  assert.equal(activePayments(next).length, 2);
  validateBackup(JSON.parse(JSON.stringify(next)));
});
test("void restores balance, cannot void twice or omit a reason", () => {
  const d = seed(),
    next = correctPayment(d, "pay1", null, "Duplicate");
  assert.equal(received(next, "p1"), 0);
  assert.throws(() => correctPayment(next, "pay1", null, "Again"));
  assert.throws(() => correctPayment(d, "pay1", null, "  "));
  validateBackup(next);
});
test("invalid correction leaves source unchanged", () => {
  const d = seed(),
    raw = JSON.stringify(d);
  assert.throws(() =>
    correctPayment(
      d,
      "pay1",
      { amount: 1500001, date: d.payments[0].date, note: "" },
      "Wrong amount",
    ),
  );
  assert.equal(JSON.stringify(d), raw);
});
test("backup rejects duplicate replacement history", () => {
  const d = correctPayment(
    seed(),
    "pay1",
    { amount: 100, date: "2024-02-29", note: "" },
    "Fix",
  );
  d.payments.push({ ...d.payments.at(-1), id: "duplicate" });
  assert.throws(() => validateBackup(d));
});

