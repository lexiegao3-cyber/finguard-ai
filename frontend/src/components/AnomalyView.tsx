import { motion, useReducedMotion } from "motion/react";
import type { AnomalyResult } from "../types";
import { Figure } from "./BenfordView";
import { CountUp } from "./CountUp";

const LABEL: Record<string, string> = {
  outlier: "Outliers by modified z-score",
  duplicate: "Amounts that repeat too often",
  round_number: "Too many round thousands",
  last_digit: "Final digits are not uniform",
};

const int = (n: number) => Math.round(n).toLocaleString();
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function AnomalyView({ result }: { result: AnomalyResult }) {
  const reduce = useReducedMotion();
  return (
    <div className="result">
      <p className={`verdict ${result.findings.some((f) => f.severity === "high") ? "bad" : result.findings.length ? "warn" : "ok"}`}>
        {result.findings.length === 0 ? "Nothing stood out" : `${result.findings.length} screen${result.findings.length > 1 ? "s" : ""} raised a finding`}
        <span>
          {result.findings.length === 0
            ? "All four screens passed at the current thresholds."
            : "Findings are listed from most to least severe."}
        </span>
      </p>
      <dl className="figures">
        <Figure term="Values screened"><CountUp value={result.n} format={int} /></Figure>
        <Figure term="Median amount"><CountUp value={result.median} format={money} /></Figure>
        <Figure term="Outliers"><CountUp value={result.outlier_indices.length} format={int} /></Figure>
      </dl>
      {result.findings.length > 0 && (
        <ol className="findings">
          {result.findings.map((f, i) => (
            <motion.li
              key={f.screen}
              className={`finding sev-${f.severity}`}
              initial={reduce ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
            >
              <h3>
                {LABEL[f.screen] ?? f.screen}
                <span className={`sev sev-${f.severity}`}>{f.severity === "high" ? "High severity" : "Medium severity"}</span>
              </h3>
              <p>{f.message}</p>
              {f.values.length > 0 && <p className="values">{f.values.map((v) => v.toLocaleString()).join("   ")}</p>}
            </motion.li>
          ))}
        </ol>
      )}
    </div>
  );
}
