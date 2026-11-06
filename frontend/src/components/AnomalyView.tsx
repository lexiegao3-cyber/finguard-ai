import type { AnomalyResult } from "../types";
import { Stat } from "./BenfordView";

const LABEL: Record<string, string> = {
  outlier: "Outliers (modified z-score)",
  duplicate: "Repeated amounts",
  round_number: "Round-number bias",
  last_digit: "Last-digit distribution",
};

export function AnomalyView({ result }: { result: AnomalyResult }) {
  return (
    <div className="result">
      <div className="stats">
        <Stat label="Values screened" value={result.n.toLocaleString()} />
        <Stat label="Median" value={result.median.toLocaleString()} />
        <Stat label="Findings" value={String(result.findings.length)} hint={Object.entries(result.summary).map(([k, v]) => `${v} ${k}`).join(" · ")} />
      </div>
      {result.findings.length === 0 ? (
        <p className="empty">No screen raised a finding at the current thresholds.</p>
      ) : (
        <ul className="findings">
          {result.findings.map((f, i) => (
            <li key={i} className={`finding sev-${f.severity}`}>
              <div className="finding-head">
                <span className={`badge ${f.severity === "high" ? "bad" : "warn"}`}>{f.severity}</span>
                <strong>{LABEL[f.screen] ?? f.screen}</strong>
              </div>
              <p>{f.message}</p>
              {f.values.length > 0 && (
                <p className="values">{f.values.map((v) => v.toLocaleString()).join(", ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
