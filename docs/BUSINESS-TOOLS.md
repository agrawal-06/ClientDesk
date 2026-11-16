# ClientDesk business tools

Open **Business tools** in the sidebar. The existing client/project/payment workspace still works, and old backups remain readable.

| Tool | How to use it |
| --- | --- |
| Project calendar | Browse monthly deadlines, client follow-ups and lead follow-ups. Filter event types, select a day for its agenda, or include completed records. |
| Lead pipeline | Track New, Contacted, Qualified, Proposal, Won and Lost stages. Save contacts, source, estimated value and next follow-up. Convert a lead into a new client or link an existing client, without creating duplicates. |
| Invoices | Add a client, invoice number, issuer details, dates and line items. Print / PDF opens a clean document; choose **Save as PDF** in your browser's print dialog. |
| Project notes | Save dated notes against a project. Notes stay private. |
| Deadline reminders | The overview and business tools show overdue work and the next seven days. These are in-app reminders, not email notifications. |
| Follow-ups | Record a client, due date and next step. Mark done or reopen. |
| Proposals | Save itemised quotes with scope/terms, export through Print / PDF, and record Draft, Sent, Accepted or Declined. Status is manually recorded by the owner. |
| Expenses | Record project expenses and categories. Cash profit is manually recorded project payments minus expenses. |
| Time tracker | Start/stop one timer or add manual time. The stored start timestamp survives refreshes. |
| Recurring invoices | Set a monthly billing day and payment terms. Daily cloud cron generates invoices; Generate due invoices now also works locally. Pause/resume as needed. It never charges a card automatically. |
| Client portal | Create a private client-specific link and share it yourself. It expires in 30 days and can be revoked. The portal shows only that client's project progress, invoices and shared attachments. |
| Attachments | Sign in, choose a project and upload PDF/PNG/JPEG/TXT. Files default to private. Sharing enables downloads through that client's portal. Limits: 1 MB/file and 20 MB/workspace. |
| Online payments | Razorpay checkout in the portal, server-created orders, callback verification, captured-payment verification and signed webhooks. Requires merchant configuration below. |

## Payment setup

Add these **server-only Production secrets** in the existing Vercel project. Never use a `VITE_` prefix and never commit their values:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

In Razorpay, configure automatic capture and a webhook for `payment.captured` at:

`https://clientdesk-eta.vercel.app/api/business/webhook`

Use the same webhook secret on both sides. Redeploy after setting environment variables. First validate with Razorpay test credentials and a test payment; then switch to live credentials. Until all three values exist the app reports online checkout as unavailable. No real payment has been verified without merchant credentials.

One provider order is reused per invoice. The amount and invoice content are protected against later workspace/backup edits once an order exists. Only captured INR payments with a matching order and amount are marked paid. A signed webhook records successful payments even if the client closes the checkout page. Repeated notifications do not create duplicate receipts.

**Accounting:** Online invoice receipts are stored separately from the original project payment ledger. They do not automatically create a second project payment. Record each project receipt exactly once in Payments if you want it included in the cash profit figure. Invoices support a fixed or percentage discount and a manually entered tax percentage. Tax is calculated after the discount, rounded to paise. This is not a GST return or tax-rate recommendation.

## Backend and data

- Apply `server/business-schema.sql` after the original `server/schema.sql` to the same Neon database. This adds three tables; it does not replace workspace records.
- The `business` field in workspace JSON holds the business collections. Missing collections default to empty, so old records need no migration.
- Attachments, portal tokens and online receipts are separate server records. A workspace JSON backup **does not include attachment bytes, portal links or online receipts**. Download important attachments separately.
- Portal tokens contain 256 bits of randomness; only their hashes are stored. Links carry the token in the URL fragment. Access is possession-based, not a client password account. Treat links as private credentials.
- File downloads require either owner authentication or a valid client link for a shared file belonging to that client. Downloads are forced to binary attachments rather than rendered as HTML.
- `CRON_SECRET` protects `/api/cron`. Vercel cron runs daily at 00:00 UTC (05:30 IST, with platform scheduling tolerance). Browser-only workspaces use the manual generate button.
- Monthly schedules preserve their anchor day (January 31 → February 28 → March 31). Catch-up is capped at 24 periods per template per run; subsequent runs continue. No mail or messages are sent automatically.
- Snapshot writes retain version checks. A background generation can make another open tab stale; reload before saving.

## Verification

Run `npm ci`, `npm test`, and `npm run build` with Node 24. Tests cover legacy data, concurrency, input validation, monthly billing, client data projection, attachment limits, signatures and duplicate captures.

`node --use-env-proxy server/business-cloud-check.js` runs an opt-in synthetic live test against the production API. It creates its own QA account, tests new collections and portal/file isolation, then revokes its portal links. It never reads or edits an existing user's workspace. Set `CLIENTDESK_API_URL` to test another deployment.

The application uses React, JavaScript, CSS, Motion, Express and Neon Postgres. No new runtime packages are needed for this feature set.


## Invoice discounts, tax and partial receipts

Open **Business tools → Invoices → Details / payments**. Set a fixed rupee or percentage discount and tax rate before recording receipts. The preview, printable document and client portal use the same calculation. Existing invoices default to zero discount and tax.

Record each payment already received with an amount, received date, and reference. Status changes from Unpaid to Partially paid to Paid, and the balance updates after each receipt. Overpayments and future payment dates are rejected. Void an incorrect receipt with a reason; its history stays visible. Discounts and tax are locked in the UI after the first receipt, and invoices with online orders remain protected by the backend.

Invoice receipts are separate from the original **Payments** project ledger and do not automatically affect its cash-profit figure. Avoid counting the same receipt twice when combining reports. Client portals show receipt amounts and dates but never private receipt notes or lead details. Receipt records are included in workspace JSON backups.

Payment activation remains paused. No Razorpay credentials or merchant settings were changed for these three features.
