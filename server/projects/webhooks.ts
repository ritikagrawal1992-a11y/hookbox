import type { Express, Request } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Store } from "../store";
import { fail, text } from "../validation";

export function registerWebhooks(app: Express, { all, one, run }: Store) {
  app.get("/api/inboxes", (_req, res) =>
    res.json(all("SELECT * FROM inboxes ORDER BY rowid DESC")),
  );
  app.post("/api/inboxes", (req, res) => {
    const name = text(req.body.name, "Inbox name", 80),
      id = randomBytes(12).toString("hex"),
      secret = randomBytes(24).toString("hex");
    run("INSERT INTO inboxes(id,name,secret) VALUES(?,?,?)", id, name, secret);
    res.status(201).json({ id, name, secret });
  });
  app.get("/api/inboxes/:id/events", (req, res) =>
    res.json(
      all(
        "SELECT * FROM events WHERE inbox_id=? ORDER BY id DESC LIMIT 100",
        req.params.id,
      ),
    ),
  );
  app.post("/api/hooks/:id", (req, res) => {
    const inbox = one("SELECT * FROM inboxes WHERE id=?", req.params.id);
    if (!inbox) fail(404, "Inbox not found.");
    const raw =
      (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    const expected = createHmac("sha256", inbox.secret as string)
      .update(raw)
      .digest();
    const signature = req.get("X-Webhook-Signature") ?? "";
    if (!/^[a-f0-9]{64}$/i.test(signature))
      fail(401, "A valid HMAC SHA-256 signature is required.");
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
      fail(401, "Signature does not match.");
    const eventKey = text(req.get("X-Event-ID"), "Event ID", 120);
    const existing = one(
      "SELECT id FROM events WHERE inbox_id=? AND event_key=?",
      req.params.id,
      eventKey,
    );
    if (existing) {
      res.json({ id: existing.id, duplicate: true });
      return;
    }
    const result = run(
      "INSERT INTO events(inbox_id,event_key,body) VALUES(?,?,?)",
      req.params.id,
      eventKey,
      raw.toString("utf8"),
    );
    res
      .status(201)
      .json({ id: Number(result.lastInsertRowid), duplicate: false });
  });
  // This endpoint inserts a LOCAL fixture. It never contacts a remote URL.
  app.post("/api/inboxes/:id/sample", (req, res) => {
    const inbox = one("SELECT id FROM inboxes WHERE id=?", req.params.id);
    if (!inbox) fail(404, "Inbox not found.");
    const eventKey = randomBytes(8).toString("hex");
    const body = JSON.stringify({
      type: "order.created",
      order_id: "DEMO-1042",
      total_cents: 4900,
      fixture: true,
    });
    const id = Number(
      run(
        "INSERT INTO events(inbox_id,event_key,body) VALUES(?,?,?)",
        req.params.id,
        eventKey,
        body,
      ).lastInsertRowid,
    );
    res.status(201).json({ id, fixture: true });
  });
}
