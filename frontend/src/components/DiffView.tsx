import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { DiffItem, DiffResult } from "../types";

const KINDS: { kind: DiffItem["kind"]; label: string }[] = [
  { kind: "Modified", label: "Reworded" },
  { kind: "Added", label: "New" },
  { kind: "Deleted", label: "Removed" },
  { kind: "Matched", label: "Unchanged" },
];

export function DiffView({ result }: { result: DiffResult }) {
  const reduce = useReducedMotion();
  const [show, setShow] = useState<Set<DiffItem["kind"]>>(new Set(["Modified", "Added", "Deleted"]));
  const toggle = (k: DiffItem["kind"]) =>
    setShow((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const visible = result.items.map((item, idx) => ({ item, idx })).filter(({ item }) => show.has(item.kind));

  return (
    <div className="result">
      <p className="verdict neutral">
        {result.old_paragraphs} paragraphs last period, {result.new_paragraphs} this period
        <span>Show or hide each kind of change.</span>
      </p>
      <div className="kind-toggles" role="group" aria-label="Filter paragraphs">
        {KINDS.map(({ kind, label }) => (
          <button key={kind} aria-pressed={show.has(kind)} className={`kind-toggle k-${kind}`} onClick={() => toggle(kind)}>
            <span className="count">{result.counts[kind]}</span>
            {label}
          </button>
        ))}
      </div>
      <ol className="diff">
        <AnimatePresence initial={false}>
          {visible.map(({ item, idx }) => (
            <motion.li
              key={idx}
              layout={!reduce}
              className={`para k-${item.kind}`}
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="para-inner">
                <span className="margin-mark">
                  {KINDS.find((k) => k.kind === item.kind)!.label}
                  {item.kind === "Modified" && item.similarity != null && <small>{Math.round(item.similarity * 100)}% same</small>}
                </span>
                <div>
                  {item.kind === "Modified" ? <WordDiff item={item} /> : <p>{item.text}</p>}
                  {item.changed_numbers.length > 0 && (
                    <ul className="numbers" aria-label="Figures that changed">
                      {item.changed_numbers.map((c, i) => (
                        <li key={i}>
                          <s>{c.before.toLocaleString()}</s> {c.after.toLocaleString()}
                          {c.pct_change != null && (
                            <em className={c.pct_change < 0 ? "down" : "up"}>
                              {c.pct_change > 0 ? "+" : ""}
                              {(c.pct_change * 100).toFixed(1)}%
                            </em>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}

function WordDiff({ item }: { item: DiffItem }) {
  return (
    <>
      <p className="prev">{item.previous_text}</p>
      <p>{item.text}</p>
    </>
  );
}
