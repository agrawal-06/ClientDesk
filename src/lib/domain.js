export const statuses = ["Discussion", "In Progress", "Review", "Completed"];
export const money = (paise) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
export function parseMoney(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter an amount with up to two decimal places.");
  const [a, b = ""] = value.trim().split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n <= 0 || n > 100000000000)
    throw new Error("Enter an amount between ₹0.01 and ₹1 billion.");
  return n;
}
export const received = (d, id) =>
  d.payments
    .filter((x) => x.projectId === id && !x.voidedAt)
    .reduce((n, x) => n + x.amount, 0);
export const balance = (d, p) => p.budget - received(d, p.id);
export function validPayment(d, id, amount) {
  const p = d.projects.find((x) => x.id === id);
  if (!p) throw new Error("Select a project.");
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Payment must be a positive amount.");
  if (amount > balance(d, p))
    throw new Error("Payment cannot exceed the outstanding balance.");
}
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const formatDate = (s) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
export function seed() {
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  };
  const tasks = (done) =>
    [
      "Content & requirements",
      "Design approval",
      "Development",
      "Testing & handover",
    ].map((title, i) => ({ id: crypto.randomUUID(), title, done: i < done }));
  return {
    demo: true,
    clients: [
      {
        id: "c1",
        name: "Aarav Sharma",
        business: "Northstar Movers",
        email: "aarav@example.com",
        phone: "",
        notes: "Demo client · website redesign",
      },
      {
        id: "c2",
        name: "Meera Joshi",
        business: "The Green Room",
        email: "meera@example.com",
        phone: "",
        notes: "Demo client · local café",
      },
      {
        id: "c3",
        name: "Rohan Singh",
        business: "Studio Forma",
        email: "rohan@example.com",
        phone: "",
        notes: "Demo client · design studio",
      },
    ],
    projects: [
      {
        id: "p1",
        clientId: "c1",
        name: "Northstar website",
        budget: 1500000,
        deadline: day(5),
        status: "In Progress",
        description:
          "A mobile-friendly moving company website with service pages and a quote enquiry form.",
        tasks: tasks(2),
      },
      {
        id: "p2",
        clientId: "c2",
        name: "Café landing page",
        budget: 800000,
        deadline: day(2),
        status: "Review",
        description:
          "A warm, welcoming website with a menu, location and contact information.",
        tasks: tasks(3),
      },
      {
        id: "p3",
        clientId: "c3",
        name: "Studio portfolio",
        budget: 2200000,
        deadline: day(14),
        status: "Discussion",
        description:
          "A project-led portfolio for an independent design studio.",
        tasks: tasks(1),
      },
    ],
    payments: [
      {
        id: "pay1",
        projectId: "p1",
        amount: 750000,
        date: day(-8),
        note: "50% advance",
      },
      {
        id: "pay2",
        projectId: "p2",
        amount: 400000,
        date: day(-5),
        note: "Project advance",
      },
    ],
  };
}
export const activePayments = (d) => d.payments.filter((p) => !p.voidedAt);
export function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00.000Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function correctPayment(d, id, replacement, reason) {
  const original = d.payments.find((p) => p.id === id);
  if (!original || original.voidedAt)
    throw new Error("This payment is missing or already voided.");
  if (!reason.trim() || reason.trim().length > 500)
    throw new Error("Enter a correction reason (up to 500 characters).");
  const next = {
    ...d,
    payments: d.payments.map((p) =>
      p.id === id
        ? {
            ...p,
            voidedAt: new Date().toISOString(),
            voidReason: reason.trim(),
          }
        : p,
    ),
  };
  if (replacement) {
    if (!isCalendarDate(replacement.date) || replacement.date > today())
      throw new Error("Enter a valid received date that is not in the future.");
    validPayment(next, original.projectId, replacement.amount);
    next.payments.push({
      ...replacement,
      id: crypto.randomUUID(),
      projectId: original.projectId,
      replacesId: id,
    });
  }
  return next;
}

