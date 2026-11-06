import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BenfordResult } from "../types";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const BADGE: Record<BenfordResult["conformity"], string> = {
  close: "ok",
  acceptable: "ok",
  marginal: "warn",
  nonconformity: "bad",
};

export function BenfordView({ result }: { result: BenfordResult }) {
  const data = result.rows.map((r) => ({ ...r, observedPct: r.observed * 100, expectedPct: r.expected * 100 }));
  return (
    <div className="result">
      <div className="stats">
        <Stat label="Values tested" value={result.n.toLocaleString()} hint={`${result.excluded} excluded`} />
        <Stat label="MAD" value={result.mad.toFixed(4)} hint={<span className={`badge ${BADGE[result.conformity]}`}>{result.conformity}</span>} />
        <Stat label="χ²" value={result.chi_square.toFixed(1)} hint={`df = ${result.dof}`} />
        <Stat label="p-value" value={result.p_value < 1e-4 ? "< 0.0001" : result.p_value.toFixed(4)} />
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="digit" interval={result.digits === 2 ? 9 : 0} />
            <YAxis unit="%" width={48} />
            <Tooltip
              formatter={(v, name) => [`${Number(v).toFixed(2)}%`, name]}
              labelFormatter={(d) => `Leading digit${result.digits === 2 ? "s" : ""} ${d}`}
            />
            <Legend />
            <Bar dataKey="observedPct" name="Observed" fill="#3b6fd8" />
            <Line dataKey="expectedPct" name="Benford expected" stroke="#e0662b" strokeWidth={2} dot={false} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {result.flagged_digits.length > 0 && (
        <table>
          <thead>
            <tr><th>Digit</th><th>Count</th><th>Observed</th><th>Expected</th><th>z</th></tr>
          </thead>
          <tbody>
            {result.rows.filter((r) => r.significant).map((r) => (
              <tr key={r.digit}>
                <td>{r.digit}</td><td>{r.count}</td><td>{pct(r.observed)}</td><td>{pct(r.expected)}</td><td>{r.z.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="note">{result.note}</p>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
