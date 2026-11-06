import type { BenfordResult } from "../types";
import { CountUp } from "./CountUp";
import { DigitChart } from "./DigitChart";

const VERDICT: Record<BenfordResult["conformity"], { tone: string; text: string }> = {
  close: { tone: "ok", text: "Close conformity" },
  acceptable: { tone: "ok", text: "Acceptable conformity" },
  marginal: { tone: "warn", text: "Marginal conformity" },
  nonconformity: { tone: "bad", text: "Nonconformity" },
};

const fixed = (d: number) => (n: number) => n.toFixed(d);
const int = (n: number) => Math.round(n).toLocaleString();

export function BenfordView({ result }: { result: BenfordResult }) {
  const verdict = VERDICT[result.conformity];
  const flagged = new Set(result.flagged_digits);
  return (
    <div className="result">
      <p className={`verdict ${verdict.tone}`}>
        {verdict.text}
        <span>
          {result.flagged_digits.length === 0
            ? "No single digit deviates significantly."
            : `${result.flagged_digits.length} digit${result.flagged_digits.length > 1 ? "s" : ""} deviate at the 5% level and are circled.`}
        </span>
      </p>

      <dl className="figures">
        <Figure term="Values tested" note={result.excluded ? `${result.excluded} zero or excluded` : "none excluded"}>
          <CountUp value={result.n} format={int} />
        </Figure>
        <Figure term="Mean absolute deviation" note="Nigrini bands">
          <CountUp value={result.mad} format={fixed(4)} />
        </Figure>
        <Figure term="Chi-square" note={`${result.dof} degrees of freedom`}>
          <CountUp value={result.chi_square} format={fixed(1)} />
        </Figure>
        <Figure term="p-value" note="goodness of fit">
          {result.p_value < 1e-4 ? "< 0.0001" : <CountUp value={result.p_value} format={fixed(4)} />}
        </Figure>
      </dl>

      <DigitChart
        key={`${result.digits}-${result.n}-${result.chi_square}`}
        label={`${result.digits === 1 ? "First" : "First-two"} digit distribution against Benford's Law`}
        data={result.rows.map((r) => ({ ...r, flagged: flagged.has(r.digit) }))}
        height={result.digits === 2 ? 260 : 320}
      />

      <p className="note">{result.note}</p>
    </div>
  );
}

export function Figure({ term, note, children }: { term: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="figure">
      <dt>{term}</dt>
      <dd>
        <span className="num">{children}</span>
        {note && <small>{note}</small>}
      </dd>
    </div>
  );
}
