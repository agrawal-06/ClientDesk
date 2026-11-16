import test from "node:test";
import assert from "node:assert/strict";
import { seed, today } from "./domain.js";
import { business, generateDue, portalData } from "./business.js";
import { validateBackup } from "./backup.js";
import {
  invoiceAmounts,
  invoiceBalance,
  addInvoiceReceipt,
  voidInvoiceReceipt,
  parsePercent,
} from "./invoices.js";
import { convertLead, calendarEvents, monthDays } from "./planning.js";
const invoice = () => ({
  id: "inv1",
  clientId: "c1",
  number: "INV1",
  issuer: "Studio",
  terms: "",
  date: today(),
  due: today(),
  items: [{ description: "Design", quantity: 1, rate: 100000 }],
});
const lead = () => ({
  id: "lead1",
  name: "New contact",
  business: "Shop",
  email: "new@example.com",
  phone: "",
  notes: "Private lead note",
  source: "Instagram",
  stage: "Qualified",
  value: 500000,
  nextFollowup: today(),
  created: today(),
});
test("discount precedes tax, integer rounding, zero totals and legacy totals", () => {
  const doc = {
    ...invoice(),
    discountType: "percent",
    discountValue: 1000,
    taxRate: 1800,
  };
  assert.deepEqual(invoiceAmounts(doc), {
    subtotal: 100000,
    discount: 10000,
    taxable: 90000,
    tax: 16200,
    total: 106200,
  });
  assert.equal(
    invoiceAmounts({
      ...invoice(),
      discountType: "fixed",
      discountValue: 10000,
      taxRate: 1800,
    }).total,
    106200,
  );
  assert.equal(invoiceAmounts(invoice()).total, 100000);
  assert.equal(
    invoiceAmounts({
      ...invoice(),
      discountType: "percent",
      discountValue: 10000,
    }).total,
    0,
  );
  assert.equal(
    invoiceAmounts({
      ...invoice(),
      items: [{ description: "Small", quantity: 1, rate: 3 }],
      taxRate: 5000,
    }).tax,
    2,
  );
  assert.throws(() => invoiceAmounts({ ...doc, discountValue: 10001 }));
  assert.throws(() => invoiceAmounts({ ...doc, taxRate: -1 }));
  assert.throws(() =>
    invoiceAmounts({ ...doc, discountType: "fixed", discountValue: 100001 }),
  );
  assert.equal(parsePercent("18.25"), 1825);
  assert.throws(() => parsePercent("18.255"));
  assert.throws(() => parsePercent("1e2"));
});
test("partial receipts, final receipt, void history, overpayment and invalid dates", () => {
  const receipt = {
    id: "r1",
    date: today(),
    amount: 25000,
    note: "UPI advance",
  };
  const partial = addInvoiceReceipt(invoice(), receipt);
  assert.deepEqual(invoiceBalance(partial), {
    paid: 25000,
    remaining: 75000,
    status: "Partially paid",
  });
  const paid = addInvoiceReceipt(partial, {
    ...receipt,
    id: "r2",
    amount: 75000,
  });
  assert.equal(invoiceBalance(paid).status, "Paid");
  assert.throws(() =>
    addInvoiceReceipt(paid, { ...receipt, id: "r3", amount: 1 }),
  );
  assert.throws(() => addInvoiceReceipt(partial, receipt));
  assert.throws(() =>
    addInvoiceReceipt(invoice(), { ...receipt, date: "2099-01-01" }),
  );
  const voided = voidInvoiceReceipt(paid, "r1", "Duplicate bank entry");
  assert.equal(voided.receipts.length, 2);
  assert.equal(invoiceBalance(voided).remaining, 25000);
  assert.throws(() => voidInvoiceReceipt(voided, "r1", "again"));
  assert.equal(
    invoiceBalance(partial, [
      { invoice_id: "inv1", payment_id: "pay1", amount: "75000" },
    ]).remaining,
    0,
  );
});
test("lead conversion creates or links once and rejects duplicates and invalid stages", () => {
  const d = { ...seed(), business: { leads: [lead()] } };
  const converted = convertLead(d, "lead1", "", "new-client");
  validateBackup(converted);
  assert.equal(converted.clients.length, 4);
  assert.equal(converted.business.leads[0].stage, "Won");
  assert.equal(converted.business.leads[0].nextFollowup, "");
  assert.deepEqual(convertLead(converted, "lead1", "", "another"), converted);
  assert.equal(convertLead(d, "lead1", "c1", "unused").clients.length, 3);
  assert.throws(() =>
    convertLead(
      { ...d, business: { leads: [{ ...lead(), email: d.clients[0].email }] } },
      "lead1",
      "",
      "new",
    ),
  );
  assert.throws(() =>
    validateBackup({
      ...d,
      business: { leads: [{ ...lead(), stage: "made-up" }] },
    }),
  );
  assert.throws(() => validateBackup({ ...d, business: { leads: null } }));
  assert.equal(d.clients.length, 3);
});
test("calendar includes active deadlines and follow-ups, handles leap months and completed filters", () => {
  const d = {
    ...seed(),
    business: {
      leads: [lead()],
      followups: [
        { id: "f1", clientId: "c1", note: "Call", date: today(), done: true },
      ],
    },
  };
  assert.equal(calendarEvents(d).filter((e) => e.type === "Lead").length, 1);
  assert.equal(
    calendarEvents(d).filter((e) => e.type === "Follow-up").length,
    0,
  );
  assert.equal(
    calendarEvents(d, true).filter((e) => e.type === "Follow-up").length,
    1,
  );
  assert.equal(monthDays("2028-02").length, 42);
  assert.ok(monthDays("2028-02").includes("2028-02-29"));
  assert.equal(monthDays("2026-11")[0], "2026-10-26");
  assert.throws(() => monthDays("2026-13"));
});
test("backup, recurrence and client portal preserve totals but never expose receipt notes or leads", () => {
  const doc = addInvoiceReceipt(
    { ...invoice(), discountValue: 1000, taxRate: 1800 },
    { id: "r1", amount: 10000, date: today(), note: "PRIVATE bank reference" },
  );
  const d = {
    ...seed(),
    business: {
      leads: [lead()],
      invoices: [doc],
      recurring: [
        {
          ...invoice(),
          id: "rec1",
          number: "REC",
          nextDate: today(),
          anchorDay: Number(today().slice(-2)),
          dueDays: 14,
          active: true,
          discountValue: 1000,
          taxRate: 1800,
        },
      ],
    },
  };
  validateBackup(d);
  const generated = generateDue(d);
  validateBackup(generated);
  assert.equal(business(generated).invoices[1].taxRate, 1800);
  assert.equal(business(generated).leads.length, 1);
  const portal = portalData(d, "c1");
  assert.equal(
    invoiceBalance(portal.invoices[0]).remaining,
    invoiceBalance(doc).remaining,
  );
  assert.equal(JSON.stringify(portal).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(portal).includes("Private lead"), false);
  assert.equal(portalData(d, "c2").invoices.length, 0);
});
