import ProjectCalendar from "./ProjectCalendar.jsx";
import LeadPipeline from "./LeadPipeline.jsx";
import InvoiceDetails from "./InvoiceDetails.jsx";
import { invoiceBalance } from "../lib/invoices.js";
import { useEffect, useState } from "react";
import {
  FileText,
  NotebookPen,
  CalendarClock,
  Receipt,
  Timer,
  Repeat2,
  Link,
  Paperclip,
} from "lucide-react";
import {
  business,
  total,
  generateDue,
  validateBusiness,
  addDays,
} from "../lib/business.js";
import { today, money, parseMoney, activePayments } from "../lib/domain.js";
import { cloudRequest } from "../lib/auth.js";
import { printDocument, downloadFile } from "../lib/documents.js";
import "../styles/business.css";

const tabs = [
  ["calendar", "Calendar", CalendarClock],
  ["leads", "Lead pipeline", NotebookPen],
  ["invoices", "Invoices", FileText],
  ["notes", "Project notes", NotebookPen],
  ["followups", "Follow-ups", CalendarClock],
  ["proposals", "Proposals", FileText],
  ["expenses", "Expenses", Receipt],
  ["timeEntries", "Time tracker", Timer],
  ["recurring", "Recurring", Repeat2],
  ["portal", "Client portal", Link],
  ["files", "Attachments", Paperclip],
];
const uid = () => crypto.randomUUID();
export function Reminders({ data }) {
  const date = today(),
    end = addDays(date, 7);
  const projects = data.projects.filter(
    (p) => p.status !== "Completed" && p.deadline <= end,
  );
  const followups = business(data).followups.filter(
    (f) => !f.done && f.date <= end,
  );
  if (!projects.length && !followups.length) return null;
  return (
    <section
      className="business-reminders"
      aria-label="Upcoming and overdue reminders"
    >
      <strong>On your radar · next 7 days</strong>
      <div>
        {projects.map((p) => (
          <span key={p.id} className={p.deadline < date ? "overdue" : ""}>
            {p.name} · {p.deadline < date ? "Overdue" : "Due"} {p.deadline}
          </span>
        ))}
        {followups.map((f) => (
          <span key={f.id} className={f.date < date ? "overdue" : ""}>
            Follow up: {data.clients.find((c) => c.id === f.clientId)?.name} ·{" "}
            {f.date}
          </span>
        ))}
      </div>
    </section>
  );
}
function Field({ label, children }) {
  return (
    <label className="business-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export default function BusinessTools({ workspace, account }) {
  const d = workspace.data,
    b = business(d);
  const [tab, setTab] = useState("invoices"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [cloud, setCloud] = useState(null),
    [link, setLink] = useState("");
  const [invoiceId, setInvoiceId] = useState(null);
  const [form, setForm] = useState(null),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const request = (body) =>
    cloudRequest(
      "/api/business",
      { method: "POST", body: JSON.stringify(body) },
      account?.id,
    );
  async function load() {
    if (account) setCloud(await request({ action: "list" }));
  }
  useEffect(() => {
    let alive = true;
    if (account)
      request({ action: "list" })
        .then((r) => {
          if (alive) setCloud(r);
        })
        .catch((e) => {
          if (alive) setMessage(e.message);
        });
    return () => {
      alive = false;
    };
  }, [account?.id]);
  async function run(action) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(next) {
    validateBusiness(next);
    if (!(await workspace.save(next)))
      throw Error("Not saved. Check the workspace notice above.");
  }
  async function change(key, rows) {
    await save({ ...d, business: { ...b, [key]: rows } });
  }
  const clientName = (id) =>
    d.clients.find((c) => c.id === id)?.name || "Client";
  const projectName = (id) =>
    d.projects.find((p) => p.id === id)?.name || "Project";
  const patch = (key, value) => setForm({ ...form, [key]: value });
  function startForm() {
    setForm({
      id: uid(),
      clientId: d.clients[0]?.id || "",
      projectId: d.projects[0]?.id || "",
      date: today(),
      due: addDays(today(), 14),
      nextDate: today(),
      dueDays: 14,
      number:
        (tab === "proposals" ? "QUO" : tab === "recurring" ? "REC" : "INV") +
        "-" +
        Date.now().toString().slice(-8),
      issuer: account?.name || "",
      terms: "",
      items: [{ description: "", quantity: 1, rate: "" }],
      body: "",
      note: "",
      category: "Software",
      amount: "",
      minutes: "",
      status: "Draft",
    });
    setMessage("");
  }
  async function submit(event) {
    event.preventDefault();
    await run(async () => {
      let row;
      if (["invoices", "proposals", "recurring"].includes(tab)) {
        row = {
          id: form.id,
          clientId: form.clientId,
          number: form.number.trim(),
          issuer: form.issuer,
          terms: form.terms,
          items: form.items.map((i) => ({
            ...i,
            quantity: Number(i.quantity),
            rate: parseMoney(i.rate),
          })),
        };
        if (tab === "recurring")
          Object.assign(row, {
            nextDate: form.nextDate,
            anchorDay: Number(form.nextDate.slice(-2)),
            dueDays: Number(form.dueDays),
            active: true,
          });
        else
          Object.assign(row, {
            date: form.date,
            due: form.due,
            ...(tab === "proposals" ? { status: form.status } : {}),
          });
      } else if (tab === "notes")
        row = {
          id: form.id,
          projectId: form.projectId,
          body: form.body,
          date: form.date,
        };
      else if (tab === "followups")
        row = {
          id: form.id,
          clientId: form.clientId,
          note: form.note,
          date: form.date,
          done: false,
        };
      else if (tab === "expenses")
        row = {
          id: form.id,
          projectId: form.projectId,
          note: form.note,
          date: form.date,
          category: form.category,
          amount: parseMoney(form.amount),
        };
      else if (tab === "timeEntries") {
        const minutes = Number(form.minutes);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
          throw Error("Enter between 1 and 1440 minutes.");
        const endedAt = Date.parse(form.date + "T12:00:00+05:30");
        row = {
          id: form.id,
          projectId: form.projectId,
          note: form.note,
          startedAt: endedAt - minutes * 60000,
          endedAt,
        };
      }
      await change(tab, [...b[tab], row]);
      setForm(null);
      setMessage("Saved.");
    });
  }
  const running = b.timeEntries.find((t) => t.endedAt === null);
  const expenseTotal = b.expenses.reduce((n, e) => n + e.amount, 0);
  const collected = activePayments(d).reduce((n, p) => n + p.amount, 0);
  const blocked = busy || workspace.saving || workspace.stale;
  return (
    <section className="business-tools">
      <div className="business-cover">
        <div>
          <span className="eyebrow">THE BUSINESS SIDE OF GOOD WORK</span>
          <h2>Your work, from quote to paid.</h2>
          <p>Keep the paperwork, small details and next steps together.</p>
        </div>
        <span className="business-stamp">
          MADE FOR
          <br />
          INDEPENDENTS
        </span>
      </div>
      <Reminders data={d} />
      <nav className="business-tabs" aria-label="Business tools">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            aria-current={tab === key ? "page" : undefined}
            className={tab === key ? "selected" : ""}
            onClick={() => {
              setTab(key);
              setForm(null);
              setMessage("");
            }}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <div className="business-paper">
        {tab === "calendar" && <ProjectCalendar data={d} />}
        {tab === "leads" && (
          <LeadPipeline data={d} onSave={save} disabled={blocked} />
        )}
        {tab === "invoices" &&
          invoiceId &&
          b.invoices.some((i) => i.id === invoiceId) && (
            <InvoiceDetails
              key={invoiceId}
              invoice={b.invoices.find((i) => i.id === invoiceId)}
              online={cloud?.receipts ?? []}
              disabled={blocked}
              onClose={() => setInvoiceId(null)}
              onSave={(row) =>
                change(
                  "invoices",
                  b.invoices.map((i) => (i.id === row.id ? row : i)),
                )
              }
            />
          )}

        <header
          className="business-heading"
          hidden={["calendar", "leads"].includes(tab)}
        >
          <div>
            <h2>{tabs.find((t) => t[0] === tab)[1]}</h2>
            <p>
              {tab === "invoices"
                ? "Itemised invoices with a printable PDF layout."
                : tab === "recurring"
                  ? "Monthly invoices, generated daily in the cloud. No automatic charges."
                  : tab === "portal"
                    ? "Revocable links expire after 30 days. Anyone with a link can view that client’s shared information."
                    : tab === "files"
                      ? "PDF, PNG, JPEG or TXT · 1 MB per file · 20 MB total."
                      : tab === "expenses"
                        ? "Cash profit = recorded project payments minus expenses. Online invoice receipts are shown separately."
                        : tab === "timeEntries"
                          ? "Timers keep running across page refreshes. One timer at a time."
                          : "Small details, kept in one place."}
            </p>
          </div>
          {!["portal", "files", "calendar", "leads"].includes(tab) && (
            <button className="primary" disabled={blocked} onClick={startForm}>
              + Add {tab === "timeEntries" ? "manual time" : "new"}
            </button>
          )}
        </header>
        {message && (
          <p className="business-message" role="status">
            {message}
          </p>
        )}
        {form && (
          <form className="business-form" onSubmit={submit}>
            <h3>New {tabs.find((t) => t[0] === tab)[1].toLowerCase()}</h3>
            <div className="business-form-grid">
              {["invoices", "proposals", "recurring", "followups"].includes(
                tab,
              ) ? (
                <Field label="Client">
                  <select
                    required
                    value={form.clientId}
                    onChange={(e) => patch("clientId", e.target.value)}
                  >
                    <option value="">Select client</option>
                    {d.clients.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Project">
                  <select
                    required
                    value={form.projectId}
                    onChange={(e) => patch("projectId", e.target.value)}
                  >
                    <option value="">Select project</option>
                    {d.projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field
                label={tab === "recurring" ? "First invoice date" : "Date"}
              >
                <input
                  required
                  type="date"
                  value={tab === "recurring" ? form.nextDate : form.date}
                  onChange={(e) =>
                    patch(
                      tab === "recurring" ? "nextDate" : "date",
                      e.target.value,
                    )
                  }
                  max={
                    ["expenses", "timeEntries"].includes(tab)
                      ? today()
                      : undefined
                  }
                />
              </Field>
              {["invoices", "proposals", "recurring"].includes(tab) && (
                <>
                  <Field
                    label={
                      tab === "recurring" ? "Number prefix" : "Document number"
                    }
                  >
                    <input
                      required
                      maxLength={120}
                      value={form.number}
                      onChange={(e) => patch("number", e.target.value)}
                    />
                  </Field>
                  {tab === "recurring" ? (
                    <Field label="Payment due in (days)">
                      <input
                        required
                        type="number"
                        min="0"
                        max="365"
                        value={form.dueDays}
                        onChange={(e) => patch("dueDays", e.target.value)}
                      />
                    </Field>
                  ) : (
                    <Field
                      label={tab === "proposals" ? "Valid until" : "Due date"}
                    >
                      <input
                        required
                        type="date"
                        min={form.date}
                        value={form.due}
                        onChange={(e) => patch("due", e.target.value)}
                      />
                    </Field>
                  )}
                  <Field label="Your business name, address and contact">
                    <textarea
                      required
                      maxLength={1000}
                      value={form.issuer}
                      onChange={(e) => patch("issuer", e.target.value)}
                    />
                  </Field>
                  <Field label="Scope, terms and payment instructions">
                    <textarea
                      maxLength={4000}
                      value={form.terms}
                      onChange={(e) => patch("terms", e.target.value)}
                    />
                  </Field>
                </>
              )}
              {tab === "expenses" && (
                <>
                  <Field label="Amount (₹)">
                    <input
                      required
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(e) => patch("amount", e.target.value)}
                    />
                  </Field>
                  <Field label="Category">
                    <input
                      required
                      maxLength={100}
                      value={form.category}
                      onChange={(e) => patch("category", e.target.value)}
                    />
                  </Field>
                </>
              )}
              {tab === "timeEntries" && (
                <Field label="Duration (minutes)">
                  <input
                    required
                    type="number"
                    min="1"
                    max="1440"
                    value={form.minutes}
                    onChange={(e) => patch("minutes", e.target.value)}
                  />
                </Field>
              )}
              {!["invoices", "proposals", "recurring"].includes(tab) && (
                <Field label={tab === "notes" ? "Project note" : "Details"}>
                  <textarea
                    required
                    maxLength={4000}
                    value={tab === "notes" ? form.body : form.note}
                    onChange={(e) =>
                      patch(tab === "notes" ? "body" : "note", e.target.value)
                    }
                  />
                </Field>
              )}
            </div>
            {["invoices", "proposals", "recurring"].includes(tab) && (
              <>
                <h4>Line items</h4>
                {form.items.map((item, index) => (
                  <div className="business-line" key={index}>
                    <Field label="Description">
                      <input
                        required
                        maxLength={500}
                        value={item.description}
                        onChange={(e) =>
                          patch(
                            "items",
                            form.items.map((i, n) =>
                              n === index
                                ? { ...i, description: e.target.value }
                                : i,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Quantity">
                      <input
                        required
                        type="number"
                        min="1"
                        max="10000"
                        value={item.quantity}
                        onChange={(e) =>
                          patch(
                            "items",
                            form.items.map((i, n) =>
                              n === index
                                ? { ...i, quantity: e.target.value }
                                : i,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Rate (₹)">
                      <input
                        required
                        inputMode="decimal"
                        value={item.rate}
                        onChange={(e) =>
                          patch(
                            "items",
                            form.items.map((i, n) =>
                              n === index ? { ...i, rate: e.target.value } : i,
                            ),
                          )
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      disabled={form.items.length === 1}
                      onClick={() =>
                        patch(
                          "items",
                          form.items.filter((_, n) => n !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={form.items.length >= 50}
                  onClick={() =>
                    patch("items", [
                      ...form.items,
                      { description: "", quantity: 1, rate: "" },
                    ])
                  }
                >
                  + Line item
                </button>
              </>
            )}
            <div className="business-actions">
              <button className="primary" disabled={blocked}>
                Save
              </button>
              <button type="button" onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {tab === "expenses" && (
          <div className="business-stats">
            <div>
              <small>Project payments recorded</small>
              <strong>{money(collected)}</strong>
            </div>
            <div>
              <small>Expenses</small>
              <strong>{money(expenseTotal)}</strong>
            </div>
            <div>
              <small>Cash profit</small>
              <strong>{money(collected - expenseTotal)}</strong>
            </div>
          </div>
        )}
        {tab === "timeEntries" && (
          <div className="business-timer">
            {running ? (
              <>
                <strong>{projectName(running.projectId)}</strong>
                <output>
                  {Math.floor(Math.max(0, now - running.startedAt) / 60000)}{" "}
                  minutes running
                </output>
                <button
                  className="primary"
                  disabled={blocked}
                  onClick={() =>
                    run(() =>
                      change(
                        "timeEntries",
                        b.timeEntries.map((t) =>
                          t.id === running.id
                            ? {
                                ...t,
                                endedAt: Math.max(Date.now(), t.startedAt),
                              }
                            : t,
                        ),
                      ),
                    )
                  }
                >
                  Stop & save
                </button>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const values = new FormData(e.currentTarget);
                  run(() =>
                    change("timeEntries", [
                      ...b.timeEntries,
                      {
                        id: uid(),
                        projectId: values.get("project"),
                        note: values.get("note"),
                        startedAt: Date.now(),
                        endedAt: null,
                      },
                    ]),
                  ).then(() => {});
                }}
              >
                <Field label="Project">
                  <select required name="project">
                    <option value="">Select project</option>
                    {d.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="What are you working on?">
                  <input name="note" maxLength={4000} />
                </Field>
                <button className="primary" disabled={blocked}>
                  Start timer
                </button>
              </form>
            )}
            <small>
              Total tracked:{" "}
              {Math.round(
                b.timeEntries.reduce(
                  (n, t) => n + Math.max(0, (t.endedAt ?? now) - t.startedAt),
                  0,
                ) / 60000,
              )}{" "}
              minutes
            </small>
          </div>
        )}
        {tab === "recurring" && (
          <button
            disabled={blocked}
            onClick={() =>
              run(async () => {
                const next = generateDue(d);
                const count =
                  business(next).invoices.length - b.invoices.length;
                await save(next);
                setMessage(count + " invoices generated.");
              })
            }
          >
            Generate due invoices now
          </button>
        )}
        {!["portal", "files", "calendar", "leads"].includes(tab) && (
          <div className="business-records">
            {b[tab].length === 0 && (
              <div className="business-empty">
                <FileText size={32} />
                <h3>A fresh page.</h3>
                <p>Add your first record using the button above.</p>
              </div>
            )}
            {[...b[tab]].reverse().map((row) => (
              <article className="business-record" key={row.id}>
                <div>
                  <strong>
                    {row.number ||
                      (row.clientId
                        ? clientName(row.clientId)
                        : projectName(row.projectId))}
                  </strong>
                  <p>{row.body || row.note || clientName(row.clientId)}</p>
                  <small>
                    {row.nextDate
                      ? "Next: " + row.nextDate
                      : row.date ||
                        new Date(row.startedAt).toLocaleDateString("en-IN")}
                    {row.amount ? " · " + money(row.amount) : ""}
                    {row.items ? " · " + money(total(row)) : ""}
                    {tab === "timeEntries"
                      ? " · " +
                        Math.round(
                          Math.max(0, (row.endedAt ?? now) - row.startedAt) /
                            60000,
                        ) +
                        " min"
                      : ""}
                    {tab === "followups"
                      ? " · " +
                        (row.done
                          ? "Done"
                          : row.date < today()
                            ? "Overdue"
                            : "Upcoming")
                      : ""}
                    {tab === "invoices"
                      ? " · " +
                        invoiceBalance(row, cloud?.receipts ?? []).status +
                        " · Due " +
                        money(
                          invoiceBalance(row, cloud?.receipts ?? []).remaining,
                        )
                      : ""}
                  </small>
                </div>
                <div className="business-actions">
                  {tab === "invoices" && (
                    <button onClick={() => setInvoiceId(row.id)}>
                      Details / payments
                    </button>
                  )}
                  {["invoices", "proposals"].includes(tab) && (
                    <button
                      onClick={() =>
                        run(() =>
                          printDocument(
                            row,
                            d.clients.find((c) => c.id === row.clientId),
                            tab === "proposals",
                            cloud?.receipts ?? [],
                          ),
                        )
                      }
                    >
                      Print / PDF
                    </button>
                  )}
                  {tab === "proposals" && (
                    <select
                      aria-label={"Status for " + row.number}
                      value={row.status}
                      disabled={blocked}
                      onChange={(e) =>
                        run(() =>
                          change(
                            tab,
                            b[tab].map((r) =>
                              r.id === row.id
                                ? { ...r, status: e.target.value }
                                : r,
                            ),
                          ),
                        )
                      }
                    >
                      {["Draft", "Sent", "Accepted", "Declined"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  )}
                  {tab === "followups" && (
                    <button
                      disabled={blocked}
                      onClick={() =>
                        run(() =>
                          change(
                            tab,
                            b[tab].map((r) =>
                              r.id === row.id ? { ...r, done: !r.done } : r,
                            ),
                          ),
                        )
                      }
                    >
                      {row.done ? "Reopen" : "Mark done"}
                    </button>
                  )}
                  {tab === "recurring" && (
                    <button
                      disabled={blocked}
                      onClick={() =>
                        run(() =>
                          change(
                            tab,
                            b[tab].map((r) =>
                              r.id === row.id ? { ...r, active: !r.active } : r,
                            ),
                          ),
                        )
                      }
                    >
                      {row.active ? "Pause" : "Resume"}
                    </button>
                  )}
                  {!["invoices", "recurring"].includes(tab) && (
                    <button
                      disabled={blocked}
                      onClick={() => {
                        if (window.confirm("Delete this record?"))
                          run(() =>
                            change(
                              tab,
                              b[tab].filter((r) => r.id !== row.id),
                            ),
                          );
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {tab === "invoices" && account && (
          <button disabled={blocked} onClick={() => run(load)}>
            Refresh online payment status
          </button>
        )}
        {tab === "invoices" && (
          <p className="business-footnote">
            {account
              ? cloud?.paymentsReady
                ? "Online checkout is available in each client portal."
                : "Online checkout needs Razorpay credentials. PDF invoices work now."
              : "Sign in for client portals and online checkout."}{" "}
            Invoices and online receipts are separate from manually recorded
            project payments; record project receipts once for cash profit
            reporting.
          </p>
        )}
        {["portal", "files"].includes(tab) &&
          (!account ? (
            <p>
              Sign in to your cloud workspace to use secure client links and
              attachments.
            </p>
          ) : (
            <>
              <button disabled={blocked} onClick={() => run(load)}>
                Refresh cloud records
              </button>
              {tab === "portal" && (
                <>
                  <form
                    className="business-inline"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const clientId = new FormData(e.currentTarget).get(
                        "client",
                      );
                      run(async () => {
                        const r = await request({ action: "link", clientId });
                        setLink(window.location.origin + "/#portal=" + r.token);
                        await load();
                      });
                    }}
                  >
                    <Field label="Client">
                      <select name="client" required>
                        <option value="">Select client</option>
                        {d.clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button className="primary" disabled={blocked}>
                      Create private link
                    </button>
                  </form>
                  {link && (
                    <Field label="Copy this private link and share it with the client">
                      <input
                        readOnly
                        value={link}
                        onFocus={(e) => e.target.select()}
                      />
                    </Field>
                  )}
                  {cloud?.links?.map((l) => (
                    <article className="business-record" key={l.id}>
                      <div>
                        <strong>{clientName(l.client_id)}</strong>
                        <small>
                          Expires {new Date(l.expires_at).toLocaleDateString()}{" "}
                          · {l.revoked ? "Revoked" : "Active"}
                        </small>
                      </div>
                      <button
                        disabled={blocked || l.revoked}
                        onClick={() =>
                          run(async () => {
                            await request({ action: "revoke", id: l.id });
                            setLink("");
                            await load();
                          })
                        }
                      >
                        Revoke
                      </button>
                    </article>
                  ))}
                </>
              )}
              {tab === "files" && (
                <>
                  <form
                    className="business-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const element = e.currentTarget;
                      const values = new FormData(element);
                      run(async () => {
                        const file = values.get("file");
                        if (!file.size || file.size > 1048576)
                          throw Error("Choose a file up to 1 MB.");
                        const content = await new Promise((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () =>
                            resolve(reader.result.split(",")[1]);
                          reader.onerror = () =>
                            reject(Error("Could not read file."));
                          reader.readAsDataURL(file);
                        });
                        await request({
                          action: "upload",
                          name: file.name,
                          content,
                          projectId: values.get("project"),
                          shared: values.get("shared") === "on",
                        });
                        element.reset();
                        await load();
                        setMessage("File uploaded.");
                      });
                    }}
                  >
                    <Field label="Project">
                      <select required name="project">
                        <option value="">Select project</option>
                        {d.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Attachment">
                      <input
                        required
                        name="file"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.txt"
                      />
                    </Field>
                    <label>
                      <input type="checkbox" name="shared" /> Share with this
                      project’s client portal
                    </label>
                    <button className="primary" disabled={blocked}>
                      Upload
                    </button>
                  </form>
                  {cloud?.files?.map((f) => (
                    <article className="business-record" key={f.id}>
                      <div>
                        <strong>{f.name}</strong>
                        <small>
                          {projectName(f.project_id)} ·{" "}
                          {Math.ceil(f.size / 1024)} KB ·{" "}
                          {f.shared ? "Shared with client" : "Private"}
                        </small>
                      </div>
                      <div className="business-actions">
                        <button
                          disabled={blocked}
                          onClick={() =>
                            run(async () =>
                              downloadFile(
                                await request({ action: "download", id: f.id }),
                              ),
                            )
                          }
                        >
                          Download
                        </button>
                        <button
                          disabled={blocked}
                          onClick={() =>
                            run(async () => {
                              await request({
                                action: "share",
                                id: f.id,
                                shared: !f.shared,
                              });
                              await load();
                            })
                          }
                        >
                          {f.shared ? "Make private" : "Share"}
                        </button>
                        <button
                          disabled={blocked}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Permanently delete this attachment?",
                              )
                            )
                              run(async () => {
                                await request({
                                  action: "delete-file",
                                  id: f.id,
                                });
                                await load();
                              });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </>
              )}
            </>
          ))}
      </div>
    </section>
  );
}
