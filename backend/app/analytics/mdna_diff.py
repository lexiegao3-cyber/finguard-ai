"""Paragraph-level comparison of two MD&A (Management's Discussion and
Analysis) disclosures, e.g. this year's 10-K against last year's.

Pipeline
  1. Split each document into paragraphs and normalise whitespace / case.
  2. Exact matching as a multiset, so a paragraph repeated twice in the old
     filing but once in the new one yields one Matched and one Deleted.
  3. Fuzzy matching of the leftovers: candidate pairs are scored with a
     token-level similarity ratio and assigned greedily from the highest
     score down, which is optimal enough for the near-1:1 structure of
     year-over-year filings. Pairs above the threshold become Modified and
     carry a word-level diff plus any numbers that changed.
  4. Everything still unpaired is Added (new doc) or Deleted (old doc).

Output is ordered as a reader would scan the new filing, with deleted
paragraphs placed after the paragraph that preceded them in the old one.
"""

from __future__ import annotations

import difflib
import re
from collections import defaultdict, deque
from dataclasses import asdict, dataclass, field
from typing import Literal

from .parsing import extract_numbers

METHOD_VERSION = "mdna-diff-2.0"

Kind = Literal["Matched", "Modified", "Added", "Deleted"]

_WS = re.compile(r"\s+")
_PARA_SPLIT = re.compile(r"\n\s*\n")
_TOKEN = re.compile(r"\w+(?:[.,]\d+)*|[^\w\s]")


@dataclass
class DiffItem:
    kind: Kind
    text: str
    old_index: int | None = None
    new_index: int | None = None
    previous_text: str | None = None
    similarity: float | None = None
    inserted_words: list[str] = field(default_factory=list)
    removed_words: list[str] = field(default_factory=list)
    changed_numbers: list[dict] = field(default_factory=list)


@dataclass
class DiffResult:
    items: list[DiffItem]
    counts: dict[str, int]
    old_paragraphs: int
    new_paragraphs: int
    similarity_threshold: float
    method_version: str = METHOD_VERSION

    def to_dict(self) -> dict:
        return asdict(self)


def split_paragraphs(text: str) -> list[str]:
    return [_WS.sub(" ", p).strip() for p in _PARA_SPLIT.split(text) if p.strip()]


def _key(paragraph: str) -> str:
    return paragraph.lower()


def _tokens(paragraph: str) -> list[str]:
    return _TOKEN.findall(paragraph.lower())


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, _tokens(a), _tokens(b), autojunk=False).ratio()


def _word_diff(old: str, new: str) -> tuple[list[str], list[str]]:
    old_words, new_words = old.split(), new.split()
    matcher = difflib.SequenceMatcher(None, old_words, new_words, autojunk=False)
    inserted, removed = [], []
    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op in ("replace", "delete"):
            removed.extend(old_words[i1:i2])
        if op in ("replace", "insert"):
            inserted.extend(new_words[j1:j2])
    return inserted, removed


def _changed_numbers(old: str, new: str) -> list[dict]:
    old_nums = extract_numbers(old, skip_years=False, include_percent=True)
    new_nums = extract_numbers(new, skip_years=False, include_percent=True)
    changes = []
    for before, after in zip(old_nums, new_nums):
        if before != after:
            pct = None if before == 0 else round((after - before) / abs(before), 4)
            changes.append({"before": before, "after": after, "pct_change": pct})
    return changes


def compare(before: str, after: str, similarity_threshold: float = 0.6) -> DiffResult:
    if not 0 < similarity_threshold < 1:
        raise ValueError("similarity_threshold must be between 0 and 1")
    old = split_paragraphs(before)
    new = split_paragraphs(after)

    # 1) exact multiset matching, first-come first-served in document order
    old_by_key: dict[str, deque[int]] = defaultdict(deque)
    for i, p in enumerate(old):
        old_by_key[_key(p)].append(i)

    old_to_new: dict[int, int] = {}
    items_by_new: dict[int, DiffItem] = {}
    for j, p in enumerate(new):
        bucket = old_by_key.get(_key(p))
        if bucket:
            i = bucket.popleft()
            old_to_new[i] = j
            items_by_new[j] = DiffItem("Matched", p, old_index=i, new_index=j, similarity=1.0)

    # 2) fuzzy matching between the remaining paragraphs
    old_left = [i for i in range(len(old)) if i not in old_to_new]
    new_left = [j for j in range(len(new)) if j not in items_by_new]
    candidates: list[tuple[float, int, int]] = []
    for i in old_left:
        for j in new_left:
            # Cheap length filter before the quadratic SequenceMatcher call.
            la, lb = len(old[i]), len(new[j])
            if min(la, lb) / max(la, lb) < similarity_threshold * 0.5:
                continue
            score = similarity(old[i], new[j])
            if score >= similarity_threshold:
                candidates.append((score, i, j))
    candidates.sort(key=lambda c: (-c[0], c[1], c[2]))

    used_old: set[int] = set()
    for score, i, j in candidates:
        if i in used_old or j in items_by_new:
            continue
        used_old.add(i)
        old_to_new[i] = j
        inserted, removed = _word_diff(old[i], new[j])
        items_by_new[j] = DiffItem(
            "Modified",
            new[j],
            old_index=i,
            new_index=j,
            previous_text=old[i],
            similarity=round(score, 4),
            inserted_words=inserted,
            removed_words=removed,
            changed_numbers=_changed_numbers(old[i], new[j]),
        )

    # 3) leftovers
    for j, p in enumerate(new):
        if j not in items_by_new:
            items_by_new[j] = DiffItem("Added", p, new_index=j)

    positioned: list[tuple[float, int, DiffItem]] = [
        (float(j), 0, item) for j, item in items_by_new.items()
    ]
    last_anchor = -1.0
    for i, p in enumerate(old):
        if i in old_to_new:
            last_anchor = float(old_to_new[i])
            continue
        positioned.append((last_anchor + 0.5, i + 1, DiffItem("Deleted", p, old_index=i)))

    positioned.sort(key=lambda t: (t[0], t[1]))
    items = [item for _, _, item in positioned]
    counts = {k: 0 for k in ("Matched", "Modified", "Added", "Deleted")}
    for item in items:
        counts[item.kind] += 1
    return DiffResult(
        items=items,
        counts=counts,
        old_paragraphs=len(old),
        new_paragraphs=len(new),
        similarity_threshold=similarity_threshold,
    )
