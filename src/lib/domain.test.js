import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoney, validPayment, balance } from "./domain.js";
test("money is exact in integer paise", () => {
  assert.equal(parseMoney("7500.01"), 750001);
  assert.equal(parseMoney("0.10") + parseMoney("0.20"), 30);
  for (const s of ["0", "-5", "1.001", "NaN", "1e3", "9007199254740991"])
    assert.throws(() => parseMoney(s));
});
const data = {
  demo: false,
  clients: [],
  projects: [
    {
      id: "p",
      clientId: "c",
      name: "Test",
      budget: 1500000,
      deadline: "2026-12-01",
      status: "Discussion",
      description: "",
      tasks: [],
    },
  ],
  payments: [
    { id: "x", projectId: "p", amount: 750000, date: "2026-11-01", note: "" },
  ],
};
test("remaining balance and overpayment protection", () => {
  assert.equal(balance(data, data.projects[0]), 750000);
  validPayment(data, "p", 750000);
  assert.throws(() => validPayment(data, "p", 750001));
  assert.throws(() => validPayment(data, "unknown", 100));
  assert.throws(() => validPayment(data, "p", -100));
});

