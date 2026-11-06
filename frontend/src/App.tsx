import { useCallback, useEffect, useState } from "react";
import { api, ApiError, tokenStore } from "./api";
import { AnomalyView } from "./components/AnomalyView";
import { BenfordView } from "./components/BenfordView";
import { DiffView } from "./components/DiffView";
import type { Analysis, AnomalyResult, BenfordResult, DiffResult, Kind, ListItem, Params, Version } from "./types";

const KIND_LABEL: Record<Kind, string> = {
  benford: "Benford test",
  anomalies: "Anomaly screen",
  mdna_diff: "MD&A comparison",
};

export default function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.me().then((u) => setEmail(u.email)).catch(() => setEmail(null)).finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="center">Loading…</div>;
  if (!email) return <AuthScreen onAuthed={setEmail} />;
  return (
    <Workspace
      email={email}
      onLogout={() => {
        tokenStore.set(null);
        setEmail(null);
      }}
    />
  );
}

function AuthScreen({ onAuthed }: { onAuthed: (email: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(mode, email, password);
      onAuthed(email.toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth" onSubmit={submit}>
      <h1>FinGuard AI</h1>
      <p className="muted">Forensic screening for financial disclosures</p>
      <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{mode === "login" ? "Sign in" : "Create account"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
      </button>
    </form>
  );
}

function Workspace({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [filter, setFilter] = useState<Kind | "">("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [shown, setShown] = useState<Version | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const page = await api.list(filter || undefined, query || undefined);
      setItems(page.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onLogout();
      else setError(String(err));
    }
  }, [filter, query, onLogout]);

  useEffect(() => {
    const t = setTimeout(refresh, 200);
    return () => clearTimeout(t);
  }, [refresh]);

  async function open(id: number) {
    const a = await api.get(id);
    setSelected(a);
    setShown(a.latest);
  }

  async function exportAll() {
    const data = await api.export();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "finguard-history.json" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="layout">
      <aside>
        <div className="aside-head">
          <strong>History</strong>
          <button className="link" onClick={() => { setSelected(null); setShown(null); }}>+ New</button>
        </div>
        <input placeholder="Search titles" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Kind | "")}>
          <option value="">All types</option>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <ul className="history">
          {items.map((it) => (
            <li key={it.id} className={selected?.id === it.id ? "active" : ""} onClick={() => open(it.id)}>
              <span>{it.title}</span>
              <small>{KIND_LABEL[it.kind]} · v{it.latest_version} · {new Date(it.updated_at).toLocaleDateString()}</small>
            </li>
          ))}
          {items.length === 0 && <li className="empty">No saved analyses</li>}
        </ul>
        <div className="aside-foot">
          <button className="link" onClick={exportAll}>Export JSON</button>
          <span className="muted">{email}</span>
          <button className="link" onClick={onLogout}>Sign out</button>
        </div>
      </aside>

      <main>
        {error && <p className="error">{error}</p>}
        {selected && shown ? (
          <AnalysisDetail
            analysis={selected}
            version={shown}
            onPickVersion={async (v) => setShown(await api.version(selected.id, v))}
            onRerun={async (params) => {
              await api.rerun(selected.id, params);
              await open(selected.id);
              await refresh();
            }}
            onDelete={async () => {
              await api.remove(selected.id);
              setSelected(null);
              setShown(null);
              await refresh();
            }}
          />
        ) : (
          <NewAnalysis
            onCreated={async (a) => {
              setSelected(a);
              setShown(a.latest);
              await refresh();
            }}
          />
        )}
      </main>
    </div>
  );
}

function ParamsForm({ kind, onSubmit, submitLabel }: { kind: Kind; onSubmit: (p: Params) => Promise<void>; submitLabel: string }) {
  const [text, setText] = useState("");
  const [before, setBefore] = useState("");
  const [digits, setDigits] = useState<1 | 2>(1);
  const [z, setZ] = useState(3.5);
  const [sim, setSim] = useState(0.6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const params: Params =
      kind === "benford"
        ? { kind, text, digits }
        : kind === "anomalies"
          ? { kind, text, z_threshold: z }
          : { kind, before, after: text, similarity_threshold: sim };
    setBusy(true);
    setError(null);
    try {
      await onSubmit(params);
      setText("");
      setBefore("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="params" onSubmit={submit}>
      {kind === "mdna_diff" ? (
        <div className="two-col">
          <label>Prior-period MD&A<textarea required rows={10} value={before} onChange={(e) => setBefore(e.target.value)} /></label>
          <label>Current-period MD&A<textarea required rows={10} value={text} onChange={(e) => setText(e.target.value)} /></label>
        </div>
      ) : (
        <label>
          Amounts — paste a ledger column, CSV or report text
          <textarea required rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="1,204.55&#10;(3,120.00)&#10;$4.1 million …" />
        </label>
      )}
      <div className="row">
        {kind === "benford" && (
          <label>Test
            <select value={digits} onChange={(e) => setDigits(Number(e.target.value) as 1 | 2)}>
              <option value={1}>First digit</option>
              <option value={2}>First two digits</option>
            </select>
          </label>
        )}
        {kind === "anomalies" && (
          <label>Outlier threshold |z| &gt;
            <input type="number" min={2} max={10} step={0.5} value={z} onChange={(e) => setZ(Number(e.target.value))} />
          </label>
        )}
        {kind === "mdna_diff" && (
          <label>"Modified" similarity ≥
            <input type="number" min={0.3} max={0.95} step={0.05} value={sim} onChange={(e) => setSim(Number(e.target.value))} />
          </label>
        )}
        <button disabled={busy}>{busy ? "Running…" : submitLabel}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function NewAnalysis({ onCreated }: { onCreated: (a: Analysis) => Promise<void> }) {
  const [kind, setKind] = useState<Kind>("benford");
  const [title, setTitle] = useState("");
  return (
    <section>
      <h2>New analysis</h2>
      <div className="tabs">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button key={k} className={k === kind ? "tab on" : "tab"} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
        ))}
      </div>
      <label>Title<input value={title} maxLength={200} placeholder="e.g. ACME FY2025 accounts payable" onChange={(e) => setTitle(e.target.value)} /></label>
      <ParamsForm
        key={kind}
        kind={kind}
        submitLabel="Run and save"
        onSubmit={async (params) => onCreated(await api.create(title.trim() || KIND_LABEL[kind], params))}
      />
    </section>
  );
}

function AnalysisDetail(props: {
  analysis: Analysis;
  version: Version;
  onPickVersion: (v: number) => void;
  onRerun: (p: Params) => Promise<void>;
  onDelete: () => void;
}) {
  const { analysis, version } = props;
  const [rerunOpen, setRerunOpen] = useState(false);
  return (
    <section>
      <div className="detail-head">
        <div>
          <h2>{analysis.title}</h2>
          <p className="muted">
            {KIND_LABEL[analysis.kind]} · method {version.method_version} · input {version.input_sha256.slice(0, 10)}…
          </p>
        </div>
        <div className="row">
          <select value={version.version} onChange={(e) => props.onPickVersion(Number(e.target.value))}>
            {analysis.versions.map((v) => (
              <option key={v.version} value={v.version}>v{v.version} · {new Date(v.created_at).toLocaleString()}</option>
            ))}
          </select>
          <button onClick={() => setRerunOpen(!rerunOpen)}>New version</button>
          <button className="danger" onClick={() => confirm("Delete this analysis and all versions?") && props.onDelete()}>Delete</button>
        </div>
      </div>
      {rerunOpen && (
        <ParamsForm kind={analysis.kind} submitLabel="Save as new version" onSubmit={async (p) => { await props.onRerun(p); setRerunOpen(false); }} />
      )}
      {analysis.kind === "benford" && <BenfordView result={version.result as BenfordResult} />}
      {analysis.kind === "anomalies" && <AnomalyView result={version.result as AnomalyResult} />}
      {analysis.kind === "mdna_diff" && <DiffView result={version.result as DiffResult} />}
    </section>
  );
}
