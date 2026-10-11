import React, {
  useState,
  useEffect,
  type ReactNode,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Task = { id: number; title: string; status: string; priority: string };
type Product = {
  id: number;
  sku: string;
  name: string;
  quantity: number;
  threshold: number;
  low_stock: number;
};
type Movement = { id: number; name: string; note: string; delta: number };
type BookingRecord = {
  id: number;
  resource: string;
  guest: string;
  starts_at: string;
  ends_at: string;
};
type Expense = {
  id: number;
  label: string;
  payer: string;
  cents: number;
  participants: string[];
};
type Balance = { person: string; cents: number };
type Settlement = { from: string; to: string; cents: number };
type Inbox = { id: string; name: string; secret: string };
type CapturedEvent = {
  id: number;
  event_key: string;
  body: string;
  received_at: string;
};
type DocumentRecord = { id: number; title: string; body: string };
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api" + path, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
function useLoad<T>(path: string, revision: number) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api" + path, { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error };
}
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="notice" role="alert">
      {children}
    </p>
  );
}
function Field({
  label,
  name,
  type = "text",
  placeholder,
  required = true,
  min,
  step,
  children,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string;
  step?: string;
  children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children ? (
        <select aria-label={label} name={name} required={required}>
          {children}
        </select>
      ) : type === "textarea" ? (
        <textarea
          aria-label={label}
          name={name}
          placeholder={placeholder}
          required={required}
          rows={5}
        />
      ) : (
        <input
          aria-label={label}
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          min={min}
          step={step}
        />
      )}
    </label>
  );
}
function Form({
  title,
  children,
  submit,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  submit: string;
  onSubmit: (f: FormData) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await onSubmit(new FormData(form));
      form.reset();
      setSuccess("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>{title}</h2>
      <form onSubmit={send}>
        {children}
        {error && <Notice>{error}</Notice>}
        <div className="form-footer">
          <button disabled={busy}>{busy ? "Saving…" : submit}</button>
          {success && <span role="status">{success}</span>}
        </div>
      </form>
    </section>
  );
}
type Props = { revision: number; refresh: () => void };
function Webhooks({ revision, refresh }: Props) {
  const inboxes = useLoad<Inbox[]>("/inboxes", revision),
    [chosen, setChosen] = useState(""),
    [actionError, setError] = useState("");
  const current = chosen || inboxes.data?.[0]?.id || "";
  const events = useLoad<CapturedEvent[]>(
    "/inboxes/" + encodeURIComponent(current) + "/events",
    revision,
  );
  const inbox = inboxes.data?.find((i) => i.id === current);
  return (
    <>
      <Form
        title="Create a local event inbox"
        submit="Create inbox"
        onSubmit={async (f) => {
          const inbox = await api("/inboxes", "POST", { name: f.get("name") });
          setChosen(inbox.id);
          refresh();
        }}
      >
        <Field label="Inbox name" name="name" placeholder="Order events" />
      </Form>
      {inboxes.error && <Notice>{inboxes.error}</Notice>}
      {inbox && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Inspect deliveries</h2>
              <select
                aria-label="Active inbox"
                value={current}
                onChange={(e) => setChosen(e.target.value)}
              >
                {inboxes.data?.map((i) => (
                  <option value={i.id} key={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="hint">Local capture endpoint</p>
            <code className="code">POST /api/hooks/{inbox.id}</code>
            <details>
              <summary>Show demo signing secret</summary>
              <code className="code">{inbox.secret}</code>
              <p className="hint">
                Use HMAC SHA-256 over the exact JSON bytes in
                X-Webhook-Signature, plus a unique X-Event-ID header. This demo
                has no user authentication.
              </p>
            </details>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await api("/inboxes/" + current + "/sample", "POST", {});
                  setError("");
                  refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Add fixture event
            </button>
            {actionError && <Notice>{actionError}</Notice>}
            <p className="hint">
              Fixtures are inserted locally. Real ingestion uses the separate
              signature-verified endpoint.
            </p>
          </section>
          <section className="panel">
            <h2>Captured events</h2>
            {events.error && <Notice>{events.error}</Notice>}
            {!events.data?.length ? (
              <p className="hint">
                Add a fixture, or run the signing script documented in this
                project's README.
              </p>
            ) : (
              events.data.map((e) => (
                <details className="event" key={e.id}>
                  <summary>
                    <span className="mono">{e.event_key}</span>
                    <span>{e.received_at} UTC</span>
                  </summary>
                  <pre>{JSON.stringify(JSON.parse(e.body), null, 2)}</pre>
                </details>
              ))
            )}
          </section>
        </>
      )}
    </>
  );
}
function App(){
      const [revision,setRevision]=useState(0);
      return <div className="shell"><aside><a className="brand" href="#"><span className="brand-mark">H</span><span>Hookbox<small>OPEN SOURCE APPLICATION</small></span></a><p className="nav-label">DEVELOPER TOOLS</p><div className="sidebar-note"><b>Built to explore.</b><p>React · TypeScript · Node.js<br/>SQLite · Playwright</p><span>v0.1 · Local demo</span></div></aside><main><div className="topline"><span>HOOKBOX / DEVELOPER TOOLS</span><span className="local-tag">LOCAL DEMO</span></div><header><p className="eyebrow">OPEN SOURCE / DEVELOPER TOOLS</p><h1>Hookbox</h1><p className="lead">Local signed webhook capture with idempotent event ingestion.</p></header><Webhooks revision={revision} refresh={()=>setRevision(v=>v+1)}/><footer>Hookbox · MIT licensed source · AI-assisted local demo</footer></main></div>;
    }
    createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
    