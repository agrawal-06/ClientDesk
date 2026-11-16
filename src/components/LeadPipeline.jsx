import { useState } from "react";
import { business } from "../lib/business.js";
import { leadStages, convertLead } from "../lib/planning.js";
import { today, money, parseMoney } from "../lib/domain.js";
export default function LeadPipeline({ data, onSave, disabled }) {
  const leads = business(data).leads;
  const [form, setForm] = useState(null),
    [stage, setStage] = useState("All"),
    [search, setSearch] = useState(""),
    [converting, setConverting] = useState(null),
    [existing, setExisting] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const blocked = disabled || busy;
  const filtered = leads.filter(
    (l) =>
      (stage === "All" || l.stage === stage) &&
      (l.name + " " + l.business + " " + l.source)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const save = (rows) =>
    onSave({ ...data, business: { ...business(data), leads: rows } });
  function edit(lead) {
    setError("");
    setForm(
      lead
        ? { ...lead, value: String(lead.value / 100) }
        : {
            id: crypto.randomUUID(),
            name: "",
            business: "",
            email: "",
            phone: "",
            source: "Instagram",
            value: "0",
            notes: "",
            stage: "New",
            nextFollowup: "",
            created: today(),
          },
    );
  }
  function field(key, label, type = "text") {
    return (
      <label className="business-field">
        <span>{label}</span>
        <input
          type={type}
          required={key === "name"}
          maxLength={200}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </label>
    );
  }
  return (
    <section className="lead-pipeline">
      <div className="business-actions">
        <button
          className="primary"
          disabled={blocked}
          onClick={() => edit(null)}
        >
          + Add lead
        </button>
        <label className="business-field">
          <span>Search leads</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, business or source"
          />
        </label>
        <label className="business-field">
          <span>Stage filter</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {["All", ...leadStages].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="business-stats">
        <div>
          <small>Open leads</small>
          <strong>
            {leads.filter((l) => !["Won", "Lost"].includes(l.stage)).length}
          </strong>
        </div>
        <div>
          <small>Potential value · not revenue</small>
          <strong>
            {money(
              leads
                .filter((l) => !["Won", "Lost"].includes(l.stage))
                .reduce((sum, l) => sum + l.value, 0),
            )}
          </strong>
        </div>
        <div>
          <small>Won leads</small>
          <strong>{leads.filter((l) => l.stage === "Won").length}</strong>
        </div>
      </div>
      {error && (
        <p role="alert" className="business-message">
          {error}
        </p>
      )}
      {form && (
        <form
          className="business-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const row = {
                ...form,
                name: form.name.trim(),
                email: form.email.trim(),
                value: Number(form.value) === 0 ? 0 : parseMoney(form.value),
              };
              await save(
                leads.some((l) => l.id === row.id)
                  ? leads.map((l) => (l.id === row.id ? row : l))
                  : [...leads, row],
              );
              setForm(null);
            });
          }}
        >
          <h3>
            {leads.some((l) => l.id === form.id) ? "Edit lead" : "New lead"}
          </h3>
          <div className="business-form-grid">
            {field("name", "Contact name")}
            {field("business", "Business name")}
            {field("email", "Email", "email")}
            {field("phone", "Phone", "tel")}
            {field("source", "Lead source")}
            {field("value", "Estimated value (₹)")}
            {field("nextFollowup", "Next follow-up", "date")}
            <label className="business-field">
              <span>Stage</span>
              <select
                disabled={!!form.clientId}
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value })}
              >
                {leadStages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="business-field">
              <span>Notes</span>
              <textarea
                maxLength={4000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </div>
          <div className="business-actions">
            <button className="primary" disabled={blocked}>
              Save lead
            </button>
            <button type="button" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {converting && (
        <form
          className="business-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await onSave(
                convertLead(data, converting, existing, crypto.randomUUID()),
              );
              setConverting(null);
            });
          }}
        >
          <h3>Convert to client</h3>
          <p>
            This marks the lead won and keeps its history. It does not create a
            project.
          </p>
          <label className="business-field">
            <span>Client record</span>
            <select
              value={existing}
              onChange={(e) => setExisting(e.target.value)}
            >
              <option value="">Create a new client</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  Link to {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="business-actions">
            <button className="primary" disabled={blocked}>
              Confirm conversion
            </button>
            <button type="button" onClick={() => setConverting(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="lead-board">
        {leadStages
          .filter((s) => stage === "All" || s === stage)
          .map((s) => (
            <section className="lead-column" key={s}>
              <h3>
                {s}{" "}
                <small>{filtered.filter((l) => l.stage === s).length}</small>
              </h3>
              {filtered
                .filter((l) => l.stage === s)
                .map((l) => (
                  <article className="lead-card" key={l.id}>
                    <strong>{l.name}</strong>
                    <p>{l.business || "Independent contact"}</p>
                    <small>
                      {l.source} · {money(l.value)}
                    </small>
                    {l.nextFollowup && (
                      <p
                        className={
                          l.nextFollowup < today() &&
                          !["Won", "Lost"].includes(l.stage)
                            ? "lead-overdue"
                            : ""
                        }
                      >
                        Follow up {l.nextFollowup}
                      </p>
                    )}
                    {l.notes && <p>{l.notes}</p>}
                    <label className="business-field">
                      <span>Move {l.name} to</span>
                      <select
                        value={l.stage}
                        disabled={blocked || !!l.clientId}
                        onChange={(e) =>
                          run(() =>
                            save(
                              leads.map((row) =>
                                row.id === l.id
                                  ? { ...row, stage: e.target.value }
                                  : row,
                              ),
                            ),
                          )
                        }
                      >
                        {leadStages.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <div className="business-actions">
                      <button disabled={blocked} onClick={() => edit(l)}>
                        Edit
                      </button>
                      {l.clientId ? (
                        <small>
                          Linked to{" "}
                          {data.clients.find((c) => c.id === l.clientId)?.name}
                        </small>
                      ) : (
                        <button
                          disabled={blocked}
                          onClick={() => {
                            setConverting(l.id);
                            setExisting("");
                            setError("");
                          }}
                        >
                          Convert to client
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              {!filtered.some((l) => l.stage === s) && (
                <p className="business-footnote">No leads here.</p>
              )}
            </section>
          ))}
      </div>
    </section>
  );
}
