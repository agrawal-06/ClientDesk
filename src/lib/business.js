import { invoiceAmounts, validateInvoiceReceipts } from "./invoices.js";
import { validateLeads } from "./planning.js";
import { isCalendarDate, today } from "./domain.js";

export const collections = [
  "leads",
  "notes",
  "followups",
  "expenses",
  "timeEntries",
  "invoices",
  "proposals",
  "recurring",
];
export function business(data) {
  return Object.fromEntries(
    collections.map((key) => [
      key,
      data.business?.[key] === undefined ? [] : data.business[key],
    ]),
  );
}
const text = (value, max = 4000) =>
  typeof value === "string" && value.length <= max;
const id = (value) => text(value, 200) && value.length > 0;
const amount = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= 100000000000;
export const total = (document) => invoiceAmounts(document).total;
export function validateBusiness(data) {
  if (data.business === undefined) return;
  if (
    !data.business ||
    typeof data.business !== "object" ||
    Array.isArray(data.business)
  )
    throw Error("Invalid business tools data.");
  const b = business(data);
  if (!Array.isArray(b.leads)) throw Error("Invalid leads.");
  validateLeads(data, b.leads);
  const clients = new Set(data.clients.map((c) => c.id));
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  for (const key of collections) {
    if (
      !Array.isArray(b[key]) ||
      b[key].length > 3000 ||
      new Set(b[key].map((x) => x?.id)).size !== b[key].length
    )
      throw Error("Invalid or oversized " + key);
    for (const row of b[key]) {
      if (!row || !id(row.id)) throw Error("Invalid record ID.");
      if (
        ["notes", "expenses", "timeEntries"].includes(key) &&
        !projects.has(row.projectId)
      )
        throw Error("Select an existing project.");
      if (
        ["followups", "invoices", "proposals", "recurring"].includes(key) &&
        !clients.has(row.clientId)
      )
        throw Error("Select an existing client.");
      if (
        key === "notes" &&
        (!text(row.body) || !row.body.trim() || !isCalendarDate(row.date))
      )
        throw Error("Enter a note and valid date.");
      if (
        key === "followups" &&
        (!text(row.note) ||
          !row.note.trim() ||
          !isCalendarDate(row.date) ||
          typeof row.done !== "boolean")
      )
        throw Error("Invalid follow-up.");
      if (
        key === "expenses" &&
        (!amount(row.amount) ||
          !isCalendarDate(row.date) ||
          row.date > today() ||
          !text(row.note) ||
          !text(row.category, 100))
      )
        throw Error("Invalid expense.");
      if (
        key === "timeEntries" &&
        (!text(row.note) ||
          !Number.isSafeInteger(row.startedAt) ||
          row.startedAt < 0 ||
          (row.endedAt !== null &&
            (!Number.isSafeInteger(row.endedAt) ||
              row.endedAt < row.startedAt)))
      )
        throw Error("Invalid time entry.");
      if (["invoices", "proposals", "recurring"].includes(key)) {
        if (
          !id(row.number) ||
          !text(row.issuer, 1000) ||
          !text(row.terms) ||
          !Array.isArray(row.items) ||
          !row.items.length ||
          row.items.length > 50 ||
          row.items.some(
            (i) =>
              !text(i.description, 500) ||
              !i.description.trim() ||
              !Number.isInteger(i.quantity) ||
              i.quantity < 1 ||
              i.quantity > 10000 ||
              !amount(i.rate),
          ) ||
          !Number.isSafeInteger(total(row)) ||
          total(row) < 0
        )
          throw Error("Invalid document. Check line items and totals.");
        if (key === "invoices") validateInvoiceReceipts(row);
        if (
          key !== "recurring" &&
          (!isCalendarDate(row.date) ||
            !isCalendarDate(row.due) ||
            row.due < row.date)
        )
          throw Error("Due date must be on or after document date.");
        if (
          key === "proposals" &&
          !["Draft", "Sent", "Accepted", "Declined"].includes(row.status)
        )
          throw Error("Invalid proposal status.");
        if (
          key === "recurring" &&
          (!isCalendarDate(row.nextDate) ||
            !Number.isInteger(row.anchorDay) ||
            row.anchorDay < 1 ||
            row.anchorDay > 31 ||
            !Number.isInteger(row.dueDays) ||
            row.dueDays < 0 ||
            row.dueDays > 365 ||
            typeof row.active !== "boolean")
        )
          throw Error("Invalid recurring schedule.");
      }
    }
  }
  if (b.timeEntries.filter((t) => t.endedAt === null).length > 1)
    throw Error("Stop the running timer first.");
  if (new Set(b.invoices.map((i) => i.number)).size !== b.invoices.length)
    throw Error("Invoice numbers must be unique.");
}
export function addDays(date, days) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function nextMonth(date, anchorDay) {
  const d = new Date(date + "T00:00:00Z");
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      Math.min(anchorDay, last),
    ),
  )
    .toISOString()
    .slice(0, 10);
}
export function generateDue(data, date = today()) {
  const b = business(data);
  const invoices = [...b.invoices];
  const recurring = b.recurring.map((template) => {
    let nextDate = template.nextDate;
    // ponytail: cap catch-up at 24 invoices per template per run; later runs resume.
    for (let n = 0; template.active && nextDate <= date && n < 24; n++) {
      const id = template.id + ":" + nextDate;
      if (!invoices.some((i) => i.id === id))
        invoices.push({
          id,
          clientId: template.clientId,
          number: template.number + "-" + nextDate,
          issuer: template.issuer,
          terms: template.terms,
          items: template.items,
          discountType: template.discountType ?? "fixed",
          discountValue: template.discountValue ?? 0,
          taxRate: template.taxRate ?? 0,
          date: nextDate,
          due: addDays(nextDate, template.dueDays),
        });
      nextDate = nextMonth(nextDate, template.anchorDay);
    }
    return { ...template, nextDate };
  });
  const next = { ...data, business: { ...b, invoices, recurring } };
  validateBusiness(next);
  return next;
}
export function portalData(data, clientId) {
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) throw Error("Client no longer exists.");
  return {
    client: { name: client.name, business: client.business },
    projects: data.projects
      .filter((p) => p.clientId === clientId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        deadline: p.deadline,
        completed: p.tasks.filter((t) => t.done).length,
        tasks: p.tasks.length,
      })),
    invoices: business(data)
      .invoices.filter((i) => i.clientId === clientId)
      .map((i) => ({
        id: i.id,
        number: i.number,
        issuer: i.issuer,
        terms: i.terms,
        items: i.items,
        date: i.date,
        due: i.due,
        discountType: i.discountType ?? "fixed",
        discountValue: i.discountValue ?? 0,
        taxRate: i.taxRate ?? 0,
        receipts: (i.receipts ?? []).map((r) => ({
          id: r.id,
          amount: r.amount,
          date: r.date,
          ...(r.voidedAt ? { voidedAt: r.voidedAt } : {}),
        })),
      })),
  };
}
