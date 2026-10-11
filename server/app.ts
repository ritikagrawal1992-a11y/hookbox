import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { DatabaseSync } from "node:sqlite";
import { HttpError } from "./validation";
import { registerWebhooks } from "./projects/webhooks";
import path from "node:path";

export function createApp(filename = ":memory:", seed = true) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS inboxes(id TEXT PRIMARY KEY,name TEXT NOT NULL,secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,inbox_id TEXT NOT NULL REFERENCES inboxes(id),event_key TEXT NOT NULL,body TEXT NOT NULL,received_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(inbox_id,event_key));
  `);
  const run = (sql: string, ...args: (string | number)[]) =>
    db.prepare(sql).run(...args);
  const all = (sql: string, ...args: (string | number)[]) =>
    db.prepare(sql).all(...args);
  const one = (sql: string, ...args: (string | number)[]) =>
    db.prepare(sql).get(...args);
  const transaction = <T>(fn: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  void seed;
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  // Capture exact bytes: signatures must be checked before payload normalization.
  app.use(
    express.json({
      limit: "64kb",
      verify: (req, _res, buffer) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", applications: 1 }),
  );
  registerWebhooks(app, { all, one, run, transaction });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  app.use(
    (
      error: Error & { status?: number; type?: string },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error.type === "entity.parse.failed") {
        res.status(400).json({ error: "Malformed JSON." });
        return;
      }
      if (error.type === "entity.too.large") {
        res.status(413).json({ error: "Request body exceeds 64 KB." });
        return;
      }
      console.error(error.message);
      res.status(500).json({ error: "Unexpected server error." });
    },
  );
  return { app, db };
}
