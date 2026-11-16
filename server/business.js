import { invoiceBalance } from "../src/lib/invoices.js";
import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import {
  business,
  generateDue,
  portalData,
  total,
} from "../src/lib/business.js";
import { validateBackup } from "../src/lib/backup.js";

const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function signatureValid(body, signature, secret) {
  if (
    !secret ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    createHmac("sha256", secret).update(body).digest(),
  );
}
const ready = (env) =>
  !!(
    env.RAZORPAY_KEY_ID &&
    env.RAZORPAY_KEY_SECRET &&
    env.RAZORPAY_WEBHOOK_SECRET
  );
export function validateFile(name, encoded) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 180 ||
    /[\x00-\x1f/\\]/.test(name) ||
    typeof encoded !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  )
    fail("Invalid file.");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > 1048576)
    fail("Files must be between 1 byte and 1 MB.");
  const ext = name.split(".").pop().toLowerCase();
  const valid =
    ext === "pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : ext === "png"
        ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
        : ["jpg", "jpeg"].includes(ext)
          ? bytes.subarray(0, 3).toString("hex") === "ffd8ff"
          : ext === "txt" && !bytes.includes(0);
  if (!valid)
    fail(
      "Upload a PDF, PNG, JPEG or plain text file with a matching extension.",
    );
  return bytes;
}
export async function transaction(pool, action) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await action(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
async function workspace(db, owner) {
  const { rows } = await db.query(
    "SELECT data, version FROM clientdesk_workspaces WHERE owner_id=$1 FOR UPDATE",
    [owner],
  );
  if (!rows[0]) fail("Save your cloud workspace first.", 409);
  return rows[0];
}
async function saveSnapshot(db, owner, data) {
  validateBackup(data);
  if (Buffer.byteLength(JSON.stringify(data)) > 1000000)
    fail(
      "Workspace exceeds 1 MB. Export and archive records before continuing.",
    );
  await db.query(
    "UPDATE clientdesk_workspaces SET previous_data=data, data=$2::jsonb, version=version+1, updated_at=now() WHERE owner_id=$1",
    [owner, JSON.stringify(data)],
  );
}
async function gateway(env, path, body) {
  if (!ready(env)) fail("Online payments are not configured yet.", 503);
  const response = await fetch("https://api.razorpay.com/v1/" + path, {
    method: body ? "POST" : "GET",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET,
        ).toString("base64"),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    fail("Payment provider could not complete the request. Try again.", 502);
  return response.json();
}
export async function recordCapture(pool, payment) {
  if (
    !payment ||
    payment.status !== "captured" ||
    payment.currency !== "INR" ||
    typeof payment.id !== "string" ||
    !Number.isSafeInteger(payment.amount)
  )
    fail("Payment is not captured in INR.");
  return transaction(pool, async (db) => {
    const { rows } = await db.query(
      "SELECT * FROM clientdesk_orders WHERE order_id=$1 FOR UPDATE",
      [payment.order_id],
    );
    const order = rows[0];
    if (!order || Number(order.amount) !== payment.amount)
      fail("Payment does not match an invoice order.");
    if (order.payment_id && order.payment_id !== payment.id)
      fail("This invoice already has a recorded payment.", 409);
    await db.query(
      "UPDATE clientdesk_orders SET payment_id=$2, captured_at=COALESCE(captured_at,now()) WHERE order_id=$1",
      [order.order_id, payment.id],
    );
    return { paid: true };
  });
}
export async function webhook(req, res, { pool }, env = process.env) {
  try {
    if (
      !Buffer.isBuffer(req.body) ||
      !signatureValid(
        req.body,
        req.get("x-razorpay-signature"),
        env.RAZORPAY_WEBHOOK_SECRET,
      )
    )
      fail("Invalid webhook signature.", 401);
    const event = JSON.parse(req.body.toString("utf8"));
    if (event.event === "payment.captured")
      await recordCapture(pool, event.payload?.payment?.entity);
    res.json({ received: true });
  } catch (e) {
    res.status(e.status || 503).json({
      error: e.status ? e.message : "Could not process payment event.",
    });
  }
}
export async function businessHandler(
  req,
  res,
  { pool, verify },
  env = process.env,
) {
  try {
    if (req.path === "/api/cron") {
      if (req.method !== "GET") fail("Method not allowed.", 405);
      if (
        !env.CRON_SECRET ||
        req.get("authorization") !== "Bearer " + env.CRON_SECRET
      )
        fail("Unauthorized.", 401);
      const owners = await pool.query(
        "SELECT owner_id FROM clientdesk_workspaces WHERE data->'business'->'recurring' IS NOT NULL",
      );
      let generated = 0;
      for (const { owner_id } of owners.rows)
        await transaction(pool, async (db) => {
          const { data } = await workspace(db, owner_id);
          const next = generateDue(data);
          const count =
            business(next).invoices.length - business(data).invoices.length;
          if (count) {
            await saveSnapshot(db, owner_id, next);
            generated += count;
          }
        });
      return res.json({ generated });
    }
    if (req.method !== "POST") fail("Method not allowed.", 405);
    const body = req.body || {};
    const publicPortal = req.path === "/api/portal";
    let owner, clientId;
    if (publicPortal) {
      if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
        fail("Invalid or expired client link.", 401);
      const links = await pool.query(
        "SELECT owner_id,client_id FROM clientdesk_portal_links WHERE token_hash=$1 AND NOT revoked AND expires_at>now()",
        [digest(body.token)],
      );
      if (!links.rows[0]) fail("Invalid or expired client link.", 401);
      owner = links.rows[0].owner_id;
      clientId = links.rows[0].client_id;
    } else {
      try {
        owner = await verify(req.get("authorization"));
      } catch {
        fail("Sign in to access business tools.", 401);
      }
      if (!owner) fail("Sign in required.", 401);
      if (req.get("x-workspace-owner") !== owner)
        fail("Your account changed. Reload before continuing.", 409);
    }
    const result = await transaction(pool, async (db) => {
      const { data } = await workspace(db, owner);
      if (publicPortal && !data.clients.some((c) => c.id === clientId))
        fail("Client no longer exists.", 410);
      const b = business(data);
      const project = (id) =>
        data.projects.find(
          (p) => p.id === id && (!publicPortal || p.clientId === clientId),
        );
      const invoice = (id) =>
        b.invoices.find(
          (i) => i.id === id && (!publicPortal || i.clientId === clientId),
        );
      const action = body.action || "list";
      if (action === "list") {
        const files = await db.query(
          "SELECT id,project_id,name,shared,octet_length(content) AS size,created_at FROM clientdesk_files WHERE owner_id=$1",
          [owner],
        );
        const orders = await db.query(
          "SELECT invoice_id,amount,payment_id,captured_at FROM clientdesk_orders WHERE owner_id=$1",
          [owner],
        );
        const receipts = orders.rows.filter((o) => invoice(o.invoice_id));
        if (publicPortal)
          return {
            ...portalData(data, clientId),
            files: files.rows.filter((f) => f.shared && project(f.project_id)),
            receipts,
            paymentsReady: ready(env),
          };
        const links = await db.query(
          "SELECT id,client_id,expires_at,revoked FROM clientdesk_portal_links WHERE owner_id=$1 ORDER BY created_at DESC",
          [owner],
        );
        return {
          files: files.rows,
          links: links.rows,
          receipts,
          paymentsReady: ready(env),
        };
      }
      if (action === "download") {
        const files = await db.query(
          "SELECT name,project_id,shared,content FROM clientdesk_files WHERE id=$1 AND owner_id=$2",
          [body.id, owner],
        );
        const file = files.rows[0];
        if (
          !file ||
          !project(file.project_id) ||
          (publicPortal && !file.shared)
        )
          fail("File not found.", 404);
        return { name: file.name, content: file.content.toString("base64") };
      }
      if (action === "order") {
        const doc = invoice(body.id);
        if (!doc) fail("Invoice not found.", 404);
        if (!ready(env)) fail("Online payments are not configured yet.", 503);
        const existing = await db.query(
          "SELECT * FROM clientdesk_orders WHERE owner_id=$1 AND invoice_id=$2",
          [owner, doc.id],
        );
        if (existing.rows[0]?.payment_id)
          fail("This invoice is already paid.", 409);
        const due = invoiceBalance(doc).remaining;
        if (due <= 0) fail("This invoice is already paid.", 409);
        let orderId = existing.rows[0]?.order_id;
        if (existing.rows[0] && Number(existing.rows[0].amount) !== due)
          fail(
            "Invoice total changed after checkout was created. Contact the workspace owner.",
            409,
          );
        if (!orderId) {
          const order = await gateway(env, "orders", {
            amount: due,
            currency: "INR",
            receipt: randomUUID(),
          });
          orderId = order.id;
          await db.query(
            "INSERT INTO clientdesk_orders(order_id,owner_id,invoice_id,amount) VALUES($1,$2,$3,$4)",
            [orderId, owner, doc.id, due],
          );
        }
        return {
          orderId,
          amount: due,
          key: env.RAZORPAY_KEY_ID,
          number: doc.number,
        };
      }
      if (action === "verify") {
        const found = await db.query(
          "SELECT * FROM clientdesk_orders WHERE order_id=$1 AND owner_id=$2",
          [body.orderId, owner],
        );
        const order = found.rows[0];
        if (!order || !invoice(order.invoice_id)) fail("Order not found.", 404);
        if (
          typeof body.paymentId !== "string" ||
          !/^pay_[A-Za-z0-9]+$/.test(body.paymentId) ||
          !signatureValid(
            order.order_id + "|" + body.paymentId,
            body.signature,
            env.RAZORPAY_KEY_SECRET,
          )
        )
          fail("Invalid payment signature.", 401);
        const payment = await gateway(env, "payments/" + body.paymentId);
        if (
          payment.status !== "captured" ||
          payment.order_id !== order.order_id ||
          payment.amount !== Number(order.amount) ||
          payment.currency !== "INR"
        )
          fail(
            "Payment is awaiting capture. Refresh after it is captured.",
            409,
          );
        if (order.payment_id && order.payment_id !== payment.id)
          fail("Payment already recorded.", 409);
        await db.query(
          "UPDATE clientdesk_orders SET payment_id=$2,captured_at=COALESCE(captured_at,now()) WHERE order_id=$1",
          [order.order_id, payment.id],
        );
        return { paid: true };
      }
      if (publicPortal) fail("Action not allowed.", 403);
      if (action === "link") {
        if (!data.clients.some((c) => c.id === body.clientId))
          fail("Client not found.", 404);
        const count = await db.query(
          "SELECT count(*) FROM clientdesk_portal_links WHERE owner_id=$1 AND NOT revoked AND expires_at>now()",
          [owner],
        );
        if (Number(count.rows[0].count) >= 100)
          fail("Revoke an existing link first (100 active links maximum).");
        const token = randomBytes(32).toString("hex");
        await db.query(
          "INSERT INTO clientdesk_portal_links(id,owner_id,client_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 days')",
          [randomUUID(), owner, body.clientId, digest(token)],
        );
        return { token };
      }
      if (action === "revoke") {
        await db.query(
          "UPDATE clientdesk_portal_links SET revoked=true WHERE id=$1 AND owner_id=$2",
          [body.id, owner],
        );
        return { ok: true };
      }
      if (action === "upload") {
        if (!project(body.projectId)) fail("Project not found.", 404);
        const bytes = validateFile(body.name, body.content);
        const size = await db.query(
          "SELECT COALESCE(sum(octet_length(content)),0) AS bytes FROM clientdesk_files WHERE owner_id=$1",
          [owner],
        );
        if (Number(size.rows[0].bytes) + bytes.length > 20 * 1048576)
          fail("Attachment storage is full (20 MB per workspace).");
        await db.query(
          "INSERT INTO clientdesk_files(id,owner_id,project_id,name,content,shared) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            owner,
            body.projectId,
            body.name,
            bytes,
            body.shared === true,
          ],
        );
        return { ok: true };
      }
      if (action === "share") {
        await db.query(
          "UPDATE clientdesk_files SET shared=$3 WHERE id=$1 AND owner_id=$2",
          [body.id, owner, body.shared === true],
        );
        return { ok: true };
      }
      if (action === "delete-file") {
        await db.query(
          "DELETE FROM clientdesk_files WHERE id=$1 AND owner_id=$2",
          [body.id, owner],
        );
        return { ok: true };
      }
      fail("Unknown action.", 404);
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 503).json({
      error: e.status
        ? e.message
        : "Business tools are temporarily unavailable. Try again.",
    });
  }
}
