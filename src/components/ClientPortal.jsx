import { useEffect, useState } from "react";
import { apiUrl } from "../lib/auth.js";
import { money } from "../lib/domain.js";
import { total } from "../lib/business.js";
import { printDocument, downloadFile, checkout } from "../lib/documents.js";
import "../styles/business.css";
export default function ClientPortal() {
  const [token] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("portal"),
  );
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(body) {
    const response = await fetch(apiUrl.replace(/\/$/, "") + "/api/portal", {
      method: "POST",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token }),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error || "Could not load client portal.");
    return result;
  }
  async function load() {
    setData(await request({ action: "list" }));
  }
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
  useEffect(() => {
    run(load);
  }, []);
  return (
    <main className="client-portal">
      <header className="business-cover">
        <div>
          <span className="eyebrow">
            CLIENTDESK · YOUR PRIVATE PROJECT SPACE
          </span>
          <h1>
            {data ? "Hello, " + data.client.name + "." : "Your client portal"}
          </h1>
          <p>Project progress, invoices and shared files.</p>
        </div>
      </header>
      {error && (
        <p className="business-message" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} onClick={() => run(load)}>
        {busy ? "Loading…" : "Refresh"}
      </button>
      {data && (
        <>
          <section className="business-paper">
            <h2>Your projects</h2>
            {!data.projects.length && <p>No projects shared yet.</p>}
            {data.projects.map((p) => (
              <article className="business-record" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <p>
                    {p.status} · Due {p.deadline}
                  </p>
                  <small>
                    {p.completed} of {p.tasks} tasks complete
                  </small>
                </div>
                <progress
                  value={p.completed}
                  max={p.tasks || 1}
                  aria-label={p.name + " progress"}
                />
              </article>
            ))}
          </section>
          <section className="business-paper">
            <h2>Invoices</h2>
            {!data.invoices.length && <p>No invoices yet.</p>}
            {data.invoices.map((i) => {
              const paid = data.receipts.some(
                (r) => r.invoice_id === i.id && r.payment_id,
              );
              return (
                <article className="business-record" key={i.id}>
                  <div>
                    <strong>
                      {i.number} · {money(total(i))}
                    </strong>
                    <p>
                      Due {i.due} · {paid ? "Paid online" : "Awaiting payment"}
                    </p>
                  </div>
                  <div className="business-actions">
                    <button
                      onClick={() => run(() => printDocument(i, data.client))}
                    >
                      Print / PDF
                    </button>
                    {!paid && (
                      <button
                        className="primary"
                        disabled={busy || !data.paymentsReady}
                        onClick={() =>
                          run(async () => {
                            await checkout(request, i.id);
                            await load();
                          })
                        }
                      >
                        {data.paymentsReady
                          ? "Pay securely"
                          : "Online payment unavailable"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            <small>
              Use the payment instructions on your invoice if online checkout is
              unavailable.
            </small>
          </section>
          <section className="business-paper">
            <h2>Shared files</h2>
            {!data.files.length && <p>No shared files yet.</p>}
            {data.files.map((f) => (
              <article className="business-record" key={f.id}>
                <div>
                  <strong>{f.name}</strong>
                  <small>{Math.ceil(f.size / 1024)} KB</small>
                </div>
                <button
                  disabled={busy}
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
              </article>
            ))}
          </section>
        </>
      )}
      <footer className="business-footnote">
        This private link expires after 30 days and can be revoked by the
        workspace owner. Keep it private.
      </footer>
    </main>
  );
}
