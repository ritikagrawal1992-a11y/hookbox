import { createHmac } from "node:crypto";
// Local demo only: no caller-supplied network destination.
const [id, secret] = process.argv.slice(2);
if (!id || !secret) {
  console.error("Usage: node scripts/send-webhook.mjs INBOX_ID DEMO_SECRET");
  process.exit(1);
}
const body = JSON.stringify({
  type: "order.created",
  order_id: "DEMO-2048",
  total_cents: 12900,
});
const signature = createHmac("sha256", secret).update(body).digest("hex");
const response = await fetch(
  "http://127.0.0.1:4312/api/hooks/" + encodeURIComponent(id),
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
      "X-Event-ID": "demo-event-2048",
    },
    body,
  },
);
console.log(response.status, await response.json());
if (!response.ok) process.exitCode = 1;
