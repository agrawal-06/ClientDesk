import { useState, useEffect, useRef } from "react";
import { money, parseMoney, today } from "../lib/domain.js";
import {
  invoiceAmounts,
  invoiceBalance,
  parsePercent,
  addInvoiceReceipt,
  voidInvoiceReceipt,
} from "../lib/invoices.js";
export default function InvoiceDetails({
  invoice,
  onSave,
  onClose,
  disabled,
  online = [],
}) {
  const panel = useRef(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "start" });
    panel.current?.focus({ preventScroll: true });
  }, []);
  const [discountType, setDiscountType] = useState(
      invoice.discountType ?? "fixed",
    ),
    [discount, setDiscount] = useState(
      String((invoice.discountValue ?? 0) / 100),
    ),
    [tax, setTax] = useState(String((invoice.taxRate ?? 0) / 100)),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(today()),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [voidId, setVoidId] = useState(""),
    [reason, setReason] = useState("");
  const amounts = invoiceAmounts(invoice),
    balance = invoiceBalance(invoice, online);
  const locked = online.some((r) => r.invoice_id === invoice.id),
    blocked = disabled || busy;
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
  function adjustments() {
    return {
      ...invoice,
      discountType,
      discountValue:
        discountType === "percent"
          ? parsePercent(discount)
          : /^0(?:\.0{1,2})?$/.test(discount.trim())
            ? 0
            : parseMoney(discount),
      taxRate: parsePercent(tax),
    };
  }
  let preview;
  try {
    preview = invoiceAmounts(adjustments());
  } catch {
    preview = null;
  }
  return (
    <section
      className="invoice-details business-form"
      ref={panel}
      tabIndex={-1}
      aria-label={"Invoice details " + invoice.number}
    >
      <div className="business-heading">
        <div>
          <h3>{invoice.number}</h3>
          <p>
            {balance.status} · Due {invoice.due}
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Close details
        </button>
      </div>
      <div className="business-stats">
        <div>
          <small>Invoice total</small>
          <strong>{money(amounts.total)}</strong>
        </div>
        <div>
          <small>Received</small>
          <strong>{money(balance.paid)}</strong>
        </div>
        <div>
          <small>Balance due</small>
          <strong>{money(balance.remaining)}</strong>
        </div>
      </div>
      {error && (
        <p className="business-message" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const next = adjustments();
            invoiceAmounts(next);
            await onSave(next);
          });
        }}
      >
        <h4>Discount and tax</h4>
        <p className="business-footnote">
          Tax is applied after the discount and rounded to the nearest paise.
          Enter the applicable rate yourself; this is not a GST filing tool.
        </p>
        <fieldset
          disabled={blocked || locked || (invoice.receipts ?? []).length > 0}
          className="invoice-fieldset"
        >
          <div className="business-form-grid">
            <label className="business-field">
              <span>Discount type</span>
              <select
                value={discountType}
                onChange={(e) => {
                  setDiscountType(e.target.value);
                  setDiscount("0");
                }}
              >
                <option value="fixed">Fixed amount (₹)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </label>
            <label className="business-field">
              <span>Discount {discountType === "fixed" ? "(₹)" : "(%)"}</span>
              <input
                required
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </label>
            <label className="business-field">
              <span>Tax rate (%)</span>
              <input
                required
                inputMode="decimal"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            </label>
          </div>
          {preview && (
            <p>
              Subtotal {money(preview.subtotal)} − Discount{" "}
              {money(preview.discount)} + Tax {money(preview.tax)} ={" "}
              <strong>{money(preview.total)}</strong>
            </p>
          )}
          <button className="primary">Save discount and tax</button>
        </fieldset>
      </form>
      {(locked || (invoice.receipts ?? []).length > 0) && (
        <p className="business-footnote">
          Discount and tax are locked after the first receipt or online order to
          preserve the invoice history.
        </p>
      )}
      {locked ? (
        <p className="business-message">
          This invoice has an online order. Manual receipts are locked to
          prevent duplicate collection.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await onSave(
                addInvoiceReceipt(invoice, {
                  id: crypto.randomUUID(),
                  date,
                  amount: parseMoney(amount),
                  note: note.trim(),
                }),
              );
              setAmount("");
              setNote("");
            });
          }}
        >
          <h4>Record a payment already received</h4>
          <p className="business-footnote">
            Record UPI, cash or bank payments here. This records a receipt; it
            does not collect money or add another entry to project Payments.
          </p>
          <fieldset
            className="invoice-fieldset"
            disabled={blocked || balance.remaining === 0}
          >
            <div className="business-form-grid">
              <label className="business-field">
                <span>Received amount (₹)</span>
                <input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="business-field">
                <span>Received date</span>
                <input
                  required
                  type="date"
                  min={invoice.date}
                  max={today()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="business-field">
                <span>Method or reference</span>
                <input
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. UPI advance"
                />
              </label>
            </div>
            <button className="primary">Record receipt</button>
          </fieldset>
        </form>
      )}
      <h4>Receipt history</h4>
      {!(invoice.receipts ?? []).length &&
        !online.some((r) => r.invoice_id === invoice.id && r.payment_id) && (
          <p>No payments recorded yet.</p>
        )}
      {(invoice.receipts ?? []).map((r) => (
        <article className="business-record" key={r.id}>
          <div>
            <strong>
              {money(r.amount)} · {r.voidedAt ? "Voided" : "Received"}
            </strong>
            <p>
              {r.date} · {r.note || "Manual receipt"}
            </p>
            {r.voidedAt && <small>Reason: {r.voidReason}</small>}
          </div>
          {!r.voidedAt && !locked && (
            <button
              disabled={blocked}
              onClick={() => {
                setVoidId(r.id);
                setReason("");
              }}
            >
              Void receipt
            </button>
          )}
        </article>
      ))}
      {online
        .filter((r) => r.invoice_id === invoice.id && r.payment_id)
        .map((r) => (
          <article className="business-record" key={r.payment_id}>
            <strong>{money(Number(r.amount))} · Verified online payment</strong>
          </article>
        ))}
      {voidId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await onSave(voidInvoiceReceipt(invoice, voidId, reason));
              setVoidId("");
            });
          }}
        >
          <label className="business-field">
            <span>Reason for voiding this receipt</span>
            <input
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="business-actions">
            <button disabled={blocked}>Confirm void</button>
            <button type="button" onClick={() => setVoidId("")}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
