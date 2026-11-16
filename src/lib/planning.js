import { isCalendarDate } from "./domain.js";
export const leadStages = [
  "New",
  "Contacted",
  "Qualified",
  "Proposal",
  "Won",
  "Lost",
];
export function validateLeads(data, leads) {
  for (const lead of leads) {
    if (
      !["name", "business", "email", "phone", "source", "notes"].every(
        (k) =>
          typeof lead[k] === "string" &&
          lead[k].length <= (k === "notes" ? 4000 : 200),
      ) ||
      !lead.name.trim() ||
      !leadStages.includes(lead.stage) ||
      !Number.isSafeInteger(lead.value) ||
      lead.value < 0 ||
      lead.value > 100000000000 ||
      !isCalendarDate(lead.created) ||
      (lead.nextFollowup !== "" && !isCalendarDate(lead.nextFollowup)) ||
      (lead.clientId !== undefined &&
        !data.clients.some((c) => c.id === lead.clientId))
    )
      throw Error(
        "Invalid lead. Check its contact, value, stage and follow-up date.",
      );
    if (lead.clientId && lead.stage !== "Won")
      throw Error("Converted leads must remain won.");
  }
}
export function convertLead(data, id, existingClientId, newId) {
  const b = { leads: [], ...data.business },
    lead = b.leads.find((l) => l.id === id);
  if (!lead) throw Error("Lead not found.");
  if (lead.clientId) return data;
  const existing = data.clients.find((c) => c.id === existingClientId);
  if (existingClientId && !existing) throw Error("Select an existing client.");
  if (
    !existing &&
    lead.email &&
    data.clients.some((c) => c.email.toLowerCase() === lead.email.toLowerCase())
  )
    throw Error(
      "A client already has this email. Select that client to avoid a duplicate.",
    );
  if (!existing && (!newId || data.clients.some((c) => c.id === newId)))
    throw Error("New client ID is missing or already used.");
  const clientId = existing?.id || newId;
  const clients = existing
    ? data.clients
    : [
        ...data.clients,
        {
          id: clientId,
          name: lead.name,
          business: lead.business,
          email: lead.email,
          phone: lead.phone,
          notes: lead.notes,
        },
      ];
  return {
    ...data,
    clients,
    business: {
      ...b,
      leads: b.leads.map((l) =>
        l.id === id ? { ...l, stage: "Won", clientId, nextFollowup: "" } : l,
      ),
    },
  };
}
export function calendarEvents(data, includeCompleted = false) {
  const b = { followups: [], leads: [], ...data.business };
  const events = [
    ...data.projects
      .filter((p) => includeCompleted || p.status !== "Completed")
      .map((p) => ({
        id: "project:" + p.id,
        type: "Project",
        date: p.deadline,
        title: p.name,
        detail: p.status,
        done: p.status === "Completed",
      })),
    ...b.followups
      .filter((f) => includeCompleted || !f.done)
      .map((f) => ({
        id: "followup:" + f.id,
        type: "Follow-up",
        date: f.date,
        title: data.clients.find((c) => c.id === f.clientId)?.name || "Client",
        detail: f.note,
        done: f.done,
      })),
    ...b.leads
      .filter(
        (l) =>
          l.nextFollowup &&
          (includeCompleted || !["Won", "Lost"].includes(l.stage)),
      )
      .map((l) => ({
        id: "lead:" + l.id,
        type: "Lead",
        date: l.nextFollowup,
        title: l.name,
        detail: l.stage + " · " + l.notes,
        done: ["Won", "Lost"].includes(l.stage),
      })),
  ];
  return events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}
export function monthDays(month) {
  if (!/^\d{4}-\d{2}$/.test(month) || !isCalendarDate(month + "-01"))
    throw Error("Choose a valid month.");
  const first = new Date(month + "-01T00:00:00Z");
  const offset = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - offset);
  return Array.from({ length: 42 }, (_, i) =>
    new Date(first.getTime() + i * 86400000).toISOString().slice(0, 10),
  );
}
