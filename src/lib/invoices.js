import { isCalendarDate, today } from "./domain.js";

const MAX_AMOUNT = 100000000000;
const roundRatio = (value, rate) =>
  Number((BigInt(value) * BigInt(rate) + 5000n) / 10000n);
export function invoiceAmounts(doc) {
  const subtotal = doc.items.reduce(
    (sum, item) => sum + item.quantity * item.rate,
    0,
  );
  const kind = doc.discountType ?? "fixed";
  const value = doc.discountValue ?? 0;
  const taxRate = doc.taxRate ?? 0; // basis points: 1800 = 18.00%
  if (
    !Number.isSafeInteger(subtotal) ||
    subtotal < 0 ||
    subtotal > MAX_AMOUNT ||
    !["fixed", "percent"].includes(kind) ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > (kind === "percent" ? 10000 : subtotal) ||
    !Number.isSafeInteger(taxRate) ||
    taxRate < 0 ||
    taxRate > 10000
  )
    throw Error("Check the discount, tax rate and line-item amounts.");
  const discount = kind === "percent" ? roundRatio(subtotal, value) : value;
  const taxable = subtotal - discount;
  const tax = roundRatio(taxable, taxRate);
  const total = taxable + tax;
  if (total > MAX_AMOUNT)
    throw Error("Invoice total exceeds the supported amount.");
  return { subtotal, discount, taxable, tax, total };
}
export function invoiceBalance(doc, online = []) {
  const manual = (doc.receipts ?? [])
    .filter((r) => !r.voidedAt)
    .reduce((sum, r) => sum + r.amount, 0);
  const paidOnline = online
    .filter((r) => r.invoice_id === doc.id && r.payment_id)
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const paid = manual + paidOnline;
  const remaining = invoiceAmounts(doc).total - paid;
  return {
    paid,
    remaining,
    status: remaining === 0 ? "Paid" : paid > 0 ? "Partially paid" : "Unpaid",
  };
}
export function validateInvoiceReceipts(doc) {
  const receipts = doc.receipts ?? [];
  if (
    !Array.isArray(receipts) ||
    receipts.length > 1000 ||
    new Set(receipts.map((r) => r?.id)).size !== receipts.length
  )
    throw Error("Invalid invoice receipt history.");
  for (const r of receipts) {
    if (
      !r ||
      typeof r.id !== "string" ||
      !r.id ||
      r.id.length > 200 ||
      !Number.isSafeInteger(r.amount) ||
      r.amount <= 0 ||
      r.amount > MAX_AMOUNT ||
      !isCalendarDate(r.date) ||
      r.date > today() ||
      r.date < doc.date ||
      typeof r.note !== "string" ||
      r.note.length > 500
    )
      throw Error(
        "Invalid invoice payment. Check the amount and received date.",
      );
    if (
      r.voidedAt !== undefined &&
      (typeof r.voidedAt !== "string" ||
        !Number.isFinite(Date.parse(r.voidedAt)) ||
        typeof r.voidReason !== "string" ||
        !r.voidReason.trim() ||
        r.voidReason.length > 500)
    )
      throw Error("A voided receipt needs a date and reason.");
    if (r.voidReason !== undefined && r.voidedAt === undefined)
      throw Error("Missing void timestamp.");
  }
  if (invoiceBalance(doc).remaining < 0)
    throw Error("Payments cannot exceed the invoice total.");
}
export function addInvoiceReceipt(doc, receipt) {
  const next = { ...doc, receipts: [...(doc.receipts ?? []), receipt] };
  validateInvoiceReceipts(next);
  return next;
}
export function voidInvoiceReceipt(doc, id, reason) {
  const original = (doc.receipts ?? []).find((r) => r.id === id);
  if (!original || original.voidedAt)
    throw Error("Receipt is missing or already voided.");
  const next = {
    ...doc,
    receipts: doc.receipts.map((r) =>
      r.id === id
        ? {
            ...r,
            voidedAt: new Date().toISOString(),
            voidReason: reason.trim(),
          }
        : r,
    ),
  };
  validateInvoiceReceipts(next);
  return next;
}
export function parsePercent(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw Error("Enter a percentage with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const rate = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (rate > 10000) throw Error("Percentage must be between 0 and 100.");
  return rate;
}
