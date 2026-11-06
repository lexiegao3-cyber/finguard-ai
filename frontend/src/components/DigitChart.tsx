import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState } from "react";

export interface DigitDatum {
  digit: number;
  observed: number;
  expected: number;
  flagged?: boolean;
  count?: number;
  z?: number;
}

interface Props {
  data: DigitDatum[];
  /** Observed bars start at this share (e.g. uniform 1/9) and settle to their value. */
  from?: "zero" | "uniform";
  height?: number;
  delay?: number;
  showCurve?: boolean;
  label: string;
}

const W = 720;
const PAD = { top: 26, right: 12, bottom: 34, left: 40 };

/**
 * Hand-drawn digit distribution chart. Observed shares are solid ink
 * columns, Benford's expectation is a blue-pencil line, and digits whose
 * deviation is statistically significant get a red-pencil ring drawn
 * around them, the way an auditor marks a working paper.
 */
export function DigitChart({ data, from = "zero", height = 300, delay = 0, showCurve = true, label }: Props) {
  const reduce = useReducedMotion();
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const many = data.length > 20;

  const { x, y, bw, max, ticks } = useMemo(() => {
    const max = Math.max(...data.flatMap((d) => [d.observed, d.expected])) * 1.12;
    const innerW = W - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const step = innerW / data.length;
    const bw = Math.max(2, step * (many ? 0.7 : 0.56));
    const ticks = niceTicks(max);
    return {
      max,
      bw,
      ticks,
      x: (i: number) => PAD.left + step * i + step / 2,
      y: (v: number) => PAD.top + innerH * (1 - v / max),
    };
  }, [data, height, many]);

  const base = y(0);
  const curve = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.expected).toFixed(1)}`).join(" ");
  const uniform = 1 / data.length;
  const dur = reduce ? 0 : 0.9;
  const hovered = hover === null ? null : data[hover];

  return (
    <figure className="digit-chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={W} height={base} />
          </clipPath>
        </defs>
        {ticks.map((t) => (
          <g key={t} className="tick">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {data.map((d, i) => {
            const startH = from === "uniform" ? base - y(Math.min(uniform, max)) : 0;
            const endH = base - y(d.observed);
            return (
              <motion.rect
                key={d.digit}
                className={`bar${d.flagged ? " flagged" : ""}${hover === i ? " hover" : ""}`}
                x={x(i) - bw / 2}
                width={bw}
                initial={{ y: base - startH, height: startH }}
                animate={{ y: base - endH, height: endH }}
                transition={{ duration: dur, delay: reduce ? 0 : delay + (many ? i * 0.006 : i * 0.05), ease: [0.2, 0.7, 0.2, 1] }}
              />
            );
          })}
        </g>

        {showCurve && (
          <motion.path
            className="expected"
            d={curve}
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduce ? 0 : 1.1, delay: reduce ? 0 : delay + 0.35, ease: "easeInOut" }}
          />
        )}

        {data.map((d, i) =>
          d.flagged ? (
            <motion.ellipse
              key={`ring-${d.digit}`}
              className="ring"
              cx={x(i)}
              cy={y(d.observed) - 4}
              rx={many ? 6 : Math.min(bw * 0.62, 30)}
              ry={many ? 9 : 13}
              transform={`rotate(-8 ${x(i)} ${y(d.observed) - 4})`}
              initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : delay + dur + 0.2 + i * 0.04 }}
            />
          ) : null,
        )}

        {data.map((d, i) =>
          !many || d.digit % 10 === 0 ? (
            <text key={`lbl-${d.digit}`} className="digit-label" x={x(i)} y={height - 10} textAnchor="middle">
              {d.digit}
            </text>
          ) : null,
        )}

        {/* invisible hit areas for hover / keyboard inspection */}
        {data.map((d, i) => (
          <rect
            key={`hit-${d.digit}`}
            className="hit"
            x={x(i) - (W - PAD.left - PAD.right) / data.length / 2}
            y={PAD.top}
            width={(W - PAD.left - PAD.right) / data.length}
            height={base - PAD.top}
            tabIndex={many ? -1 : 0}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <title>{`Digit ${d.digit}: observed ${(d.observed * 100).toFixed(1)}%, expected ${(d.expected * 100).toFixed(1)}%`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="chart-readout" aria-live="polite">
        {hovered ? (
          <>
            Leading digit <strong>{hovered.digit}</strong>: {(hovered.observed * 100).toFixed(1)}% observed against{" "}
            {(hovered.expected * 100).toFixed(1)}% expected
            {hovered.z !== undefined && <>, z = {hovered.z.toFixed(2)}</>}
          </>
        ) : (
          <>
            <span className="key ink" /> observed <span className="key pencil" /> Benford's expectation
            {data.some((d) => d.flagged) && (
              <>
                <span className="key red" /> significant at 5%
              </>
            )}
          </>
        )}
      </figcaption>
    </figure>
  );
}

function niceTicks(max: number): number[] {
  const step = max > 0.25 ? 0.1 : max > 0.1 ? 0.05 : max > 0.04 ? 0.01 : 0.005;
  const out: number[] = [];
  for (let t = step; t < max; t += step) out.push(Number(t.toFixed(4)));
  return out;
}

export const BENFORD_FIRST = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));
