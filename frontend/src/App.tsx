import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, tokenStore } from "./api";
import { AnomalyView } from "./components/AnomalyView";
import { BenfordView } from "./components/BenfordView";
import { BENFORD_FIRST, DigitChart } from "./components/DigitChart";
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

  return (
    <MotionConfig reducedMotion="user">
      {checking ? (
        <div className="center">Opening your workpapers</div>
      ) : !email ? (
        <AuthScreen onAuthed={setEmail} />
      ) : (
        <Workspace
          email={email}
          onLogout={() => {
            tokenStore.set(null);
            setEmail(null);
          }}
        />
      )}
    </MotionConfig>
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
    <div className="landing">
      <section className="pitch">
        <p className="wordmark">FinGuard</p>
        <h1>Do these numbers look like they happened naturally?</h1>
        <p className="lede">
          In real ledgers, about 30% of amounts start with a 1 and fewer than 5% start with a 9. Invented figures
          rarely follow that pattern. FinGuard tests your data against it, screens for outliers and suspicious
          repeats, and shows exactly what changed between two years of MD&amp;A.
        </p>
        <DigitChart
          label="Benford's Law: expected share of each leading digit"
          from="uniform"
          delay={0.3}
          height={300}
          data={BENFORD_FIRST.map((p, i) => ({ digit: i + 1, observed: p, expected: p }))}
        />
      </section>
      <form className="auth" onSubmit={submit}>
        <h2>{mode === "login" ? "Sign in to your workpapers" : "Create an account"}</h2>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New to FinGuard? Create an account" : "Already registered? Sign in"}
        </button>
      </form>
    </div>
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
          <strong>Workpapers</strong>
          <button className="link" onClick={() => { setSelected(null); setShown(null); }}>New analysis</button>
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
              <small>{KIND_LABEL[it.kind]}, version {it.latest_version}, {new Date(it.updated_at).toLocaleDateString()}</small>
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
        <AnimatePresence mode="wait">
        {selected && shown ? (
          <motion.div key={`a-${selected.id}-v${shown.version}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
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
          </motion.div>
        ) : (
          <motion.div key="new" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <NewAnalysis
            onCreated={async (a) => {
              setSelected(a);
              setShown(a.latest);
              await refresh();
            }}
          />
          </motion.div>
        )}
        </AnimatePresence>
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
          Paste amounts: a ledger column, CSV rows or report text
          <textarea required rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"1,204.55\n(3,120.00)\n$4.1 million"} />
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
          <label>Flag values with |modified z| above
            <input type="number" min={2} max={10} step={0.5} value={z} onChange={(e) => setZ(Number(e.target.value))} />
          </label>
        )}
        {kind === "mdna_diff" && (
          <label>Treat paragraphs as reworded above this similarity
            <input type="number" min={0.3} max={0.95} step={0.05} value={sim} onChange={(e) => setSim(Number(e.target.value))} />
          </label>
        )}
        <button className="primary" disabled={busy}>{busy ? "Running" : submitLabel}</button>
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
      <h2>Start an analysis</h2>
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
            {KIND_LABEL[analysis.kind]} run with {version.method_version}. Input fingerprint {version.input_sha256.slice(0, 10)}.
          </p>
        </div>
        <div className="row">
          <select value={version.version} onChange={(e) => props.onPickVersion(Number(e.target.value))}>
            {analysis.versions.map((v) => (
              <option key={v.version} value={v.version}>Version {v.version}, {new Date(v.created_at).toLocaleString()}</option>
            ))}
          </select>
          <button className="primary" onClick={() => setRerunOpen(!rerunOpen)}>Run with new data</button>
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
