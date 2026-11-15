import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import {
  business,
  generateDue,
  nextMonth,
  portalData,
  validateBusiness,
} from "./business.js";
import { validateBackup } from "./backup.js";
const template = {
  id: "rec",
  clientId: "c1",
  number: "RET",
  issuer: "Studio",
  terms: "Monthly care",
  items: [{ description: "Maintenance", quantity: 1, rate: 10000 }],
  nextDate: "2026-01-31",
  anchorDay: 31,
  dueDays: 14,
  active: true,
};
test("monthly billing retains anchor day, catches up once and can pause", () => {
  assert.equal(nextMonth("2026-01-31", 31), "2026-02-28");
  assert.equal(nextMonth("2026-02-28", 31), "2026-03-31");
  assert.equal(nextMonth("2028-01-31", 31), "2028-02-29");
  const original = { ...seed(), business: { recurring: [template] } };
  const next = generateDue(original, "2026-03-31");
  assert.equal(business(next).invoices.length, 3);
  assert.equal(next.business.recurring[0].nextDate, "2026-04-30");
  assert.equal(next.business.invoices[0].due, "2026-02-14");
  assert.deepEqual(generateDue(next, "2026-03-31"), next);
  assert.equal(original.business.recurring[0].nextDate, "2026-01-31");
  assert.equal(
    generateDue(
      {
        ...original,
        business: { recurring: [{ ...template, active: false }] },
      },
      "2026-03-31",
    ).business.invoices.length,
    0,
  );
});
test("client portal projection excludes private data and other clients", () => {
  const d = generateDue(
    {
      ...seed(),
      business: {
        recurring: [template],
        notes: [
          { id: "n", projectId: "p1", date: "2026-01-01", body: "PRIVATE" },
        ],
      },
    },
    "2026-01-31",
  );
  const projected = portalData(d, "c1");
  assert.equal(projected.projects.length, 1);
  assert.equal(projected.invoices.length, 1);
  assert.deepEqual(Object.keys(projected.client), ["name", "business"]);
  assert.equal(JSON.stringify(projected).includes("PRIVATE"), false);
  assert.equal(projected.projects[0].budget, undefined);
  assert.equal(projected.projects[0].description, undefined);
  assert.equal(portalData(d, "c2").invoices.length, 0);
});
test("business backup validates references, line totals, dates, and one active timer", () => {
  validateBackup(seed());
  const d = { ...seed(), business: { recurring: [template] } };
  validateBusiness(d);
  assert.throws(() =>
    validateBusiness({
      ...d,
      business: { recurring: [{ ...template, clientId: "missing" }] },
    }),
  );
  assert.throws(() =>
    validateBusiness({
      ...d,
      business: {
        recurring: [
          {
            ...template,
            items: [
              { description: "Bad", quantity: 10000, rate: 100000000000 },
            ],
          },
        ],
      },
    }),
  );
  assert.throws(() =>
    validateBusiness({
      ...d,
      business: {
        timeEntries: [
          { id: "a", projectId: "p1", note: "", startedAt: 1, endedAt: null },
          { id: "b", projectId: "p1", note: "", startedAt: 2, endedAt: null },
        ],
      },
    }),
  );
  assert.throws(() =>
    validateBusiness({
      ...d,
      business: {
        invoices: [{ ...template, date: "2026-04-01", due: "2026-03-31" }],
      },
    }),
  );
});
