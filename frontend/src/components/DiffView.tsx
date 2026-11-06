import { useState } from "react";
import type { DiffItem, DiffResult } from "../types";
import { Stat } from "./BenfordView";

const KINDS: DiffItem["kind"][] = ["Modified", "Added", "Deleted", "Matched"];

export function DiffView({ result }: { result: DiffResult }) {
  const [show, setShow] = useState<Set<DiffItem["kind"]>>(new Set(["Modified", "Added", "Deleted"]));
  const toggle = (k: DiffItem["kind"]) =>
    setShow((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="result">
      <div className="stats">
        {KINDS.map((k) => (
          <button key={k} className={`stat toggle kind-${k} ${show.has(k) ? "on" : ""}`} onClick={() => toggle(k)}>
            <span className="stat-label">{k}</span>
            <span className="stat-value">{result.counts[k]}</span>
          </button>
        ))}
        <Stat label="Paragraphs" value={`${result.old_paragraphs} → ${result.new_paragraphs}`} />
      </div>
      <ol className="diff">
        {result.items.filter((i) => show.has(i.kind)).map((item, idx) => (
          <li key={idx} className={`para kind-${item.kind}`}>
            <span className="para-kind">{item.kind}{item.similarity != null && item.kind === "Modified" ? ` · ${(item.similarity * 100).toFixed(0)}% similar` : ""}</span>
            {item.kind === "Modified" ? <WordDiff item={item} /> : <p>{item.text}</p>}
            {item.changed_numbers.length > 0 && (
              <ul className="numbers">
                {item.changed_numbers.map((c, i) => (
                  <li key={i}>
                    {c.before.toLocaleString()} → {c.after.toLocaleString()}
                    {c.pct_change != null && ` (${c.pct_change > 0 ? "+" : ""}${(c.pct_change * 100).toFixed(1)}%)`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function WordDiff({ item }: { item: DiffItem }) {
  return (
    <>
      <p className="prev">{item.previous_text}</p>
      <p>{item.text}</p>
      <p className="words">
        {item.removed_words.length > 0 && <span className="del">− {item.removed_words.join(" ")}</span>}
        {item.inserted_words.length > 0 && <span className="ins">+ {item.inserted_words.join(" ")}</span>}
      </p>
    </>
  );
}
