import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createApp } from "../server/app";
async function fixture(t: TestContext) {
  const { app, db } = createApp(":memory:", false),
    server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  return async (
    path: string,
    method = "GET",
    body?: unknown,
    headers?: Record<string, string>,
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
      {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
    };
  };
}
test("webhook requires signature, rejects tampering, and deduplicates valid delivery", async (t) => {
  const call = await fixture(t),
    inbox = (await call("/inboxes", "POST", { name: "Orders" })).data,
    payload = { type: "order.created", cents: 1200 };
  const signature = createHmac("sha256", inbox.secret)
    .update(JSON.stringify(payload))
    .digest("hex");
  const headers = { "X-Webhook-Signature": signature, "X-Event-ID": "evt-1" };
  assert.equal((await call("/hooks/" + inbox.id, "POST", payload)).status, 401);
  assert.equal(
    (
      await call(
        "/hooks/" + inbox.id,
        "POST",
        { ...payload, cents: 1 },
        headers,
      )
    ).status,
    401,
  );
  const first = await call("/hooks/" + inbox.id, "POST", payload, headers);
  assert.equal(first.status, 201);
  const second = await call("/hooks/" + inbox.id, "POST", payload, headers);
  assert.equal(second.status, 200);
  assert.equal(second.data.duplicate, true);
  assert.equal(first.data.id, second.data.id);
  assert.equal((await call("/inboxes/" + inbox.id + "/events")).data.length, 1);
});
