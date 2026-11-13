import { useState } from "react";
import { correctPayment, money, parseMoney, today } from "../lib/domain.js";
export default function PaymentCorrection({
  data,
  payment,
  onSave,
  onCancel,
  disabled,
}) {
  const [mode, setMode] = useState("replace");
  const [error, setError] = useState("");
  return (
    <>
      <div className="eyebrow">PAYMENT HISTORY</div>
      <h2>Correct payment</h2>
      <p className="muted">
        Original: {money(payment.amount)} received on {payment.date}. The
        original record stays in your history. This only updates your records;
        it does not move or refund money.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            const replacement =
              mode === "replace"
                ? {
                    amount: parseMoney(String(form.get("amount"))),
                    date: String(form.get("date")),
                    note: String(form.get("note")).trim(),
                  }
                : null;
            await onSave(
              correctPayment(
                data,
                payment.id,
                replacement,
                String(form.get("reason")),
              ),
            );
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Check the payment details.",
            );
          }
        }}
      >
        <label>
          Correction type
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="replace">Replace with corrected details</option>
            <option value="void">Void this record (no replacement)</option>
          </select>
        </label>
        {mode === "replace" && (
          <>
            <div className="formGrid">
              <label>
                Correct amount (₹)
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max="1000000000"
                  defaultValue={payment.amount / 100}
                  required
                />
              </label>
              <label>
                Date received
                <input
                  name="date"
                  type="date"
                  defaultValue={payment.date}
                  max={today()}
                  required
                />
              </label>
            </div>
            <label>
              Note
              <input name="note" defaultValue={payment.note} maxLength={200} />
            </label>
          </>
        )}
        <label>
          Reason for correction
          <textarea
            name="reason"
            placeholder="e.g. Entered the wrong amount"
            maxLength={500}
            required
          />
        </label>
        {error && (
          <p role="alert" className="formError">
            {error}
          </p>
        )}
        <div className="modalActions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button disabled={disabled} className="primary">
            {mode === "void" ? "Void payment record" : "Save correction"}
          </button>
        </div>
      </form>
    </>
  );
}
