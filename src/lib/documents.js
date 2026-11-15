import { money } from "./domain.js";
import { total } from "./business.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function printDocument(doc, client, proposal = false) {
  const popup = window.open("", "_blank");
  if (!popup)
    throw Error("Allow pop-ups to print or save this document as PDF.");
  popup.opener = null;
  popup.document
    .write(`<!doctype html><html><head><meta charset="UTF-8"><title>${escape(doc.number)}</title><style>
  body{font:15px/1.6 system-ui;color:#303a34;max-width:800px;margin:48px auto;padding:24px}header{display:flex;justify-content:space-between;border-bottom:3px solid #bd603b;padding-bottom:24px}h1{font-size:32px;margin:0}p{white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin:32px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}th:last-child,td:last-child{text-align:right}.total{text-align:right;font-size:22px}button{padding:12px;margin-bottom:24px}footer{margin-top:48px;color:#666;font-size:12px}@media print{button{display:none}body{margin:0;padding:12mm}tr{break-inside:avoid}}</style></head><body>
  <button onclick="window.print()">Print / Save as PDF</button><header><div><h1>${proposal ? "Proposal" : "Invoice"}</h1><strong>${escape(doc.number)}</strong></div><p>${escape(doc.issuer)}</p></header>
  <p><strong>Prepared for</strong><br>${escape(client?.name)}<br>${escape(client?.business)}</p><p>Date: ${escape(doc.date)} · ${proposal ? "Valid until" : "Due"}: ${escape(doc.due)}</p>
  <table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${doc.items.map((i) => `<tr><td>${escape(i.description)}</td><td>${i.quantity}</td><td>${money(i.rate)}</td><td>${money(i.rate * i.quantity)}</td></tr>`).join("")}</tbody></table><p class="total"><strong>Total ${money(total(doc))}</strong></p><p>${escape(doc.terms)}</p><footer>Prepared with ClientDesk · Amounts in INR</footer></body></html>`);
  popup.document.close();
}
export function downloadFile(file) {
  const bytes = Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/octet-stream" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let checkoutScript;
export async function checkout(request, id) {
  if (!window.Razorpay) {
    checkoutScript ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = resolve;
      script.onerror = () => {
        checkoutScript = null;
        reject(Error("Could not load checkout. Try again."));
      };
      document.head.appendChild(script);
    });
    await checkoutScript;
  }
  const order = await request({ action: "order", id });
  return new Promise((resolve, reject) => {
    const popup = new window.Razorpay({
      key: order.key,
      order_id: order.orderId,
      amount: order.amount,
      currency: "INR",
      name: "ClientDesk",
      description: order.number,
      handler: async (result) => {
        try {
          await request({
            action: "verify",
            orderId: result.razorpay_order_id,
            paymentId: result.razorpay_payment_id,
            signature: result.razorpay_signature,
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      modal: {
        ondismiss: () =>
          reject(
            Error(
              "Checkout closed. Refresh to check whether a payment completed.",
            ),
          ),
      },
      theme: { color: "#bd603b" },
    });
    popup.on("payment.failed", () =>
      reject(Error("Payment failed. You can try again.")),
    );
    popup.open();
  });
}
