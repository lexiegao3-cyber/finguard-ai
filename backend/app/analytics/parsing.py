"""Extract numeric values from pasted financial text or CSV cells.

Handles thousands separators, currency symbols, accounting-style negatives
"(1,234)", and magnitude words or suffixes (thousand / million / billion,
K / M / B / bn). Arithmetic is done in Decimal so "$4.1 billion" becomes
exactly 4100000000 rather than 4099999999.9999995.

By default percentages and bare four-digit years (1900-2100, written
without a thousands separator) are skipped: they carry no Benford signal
and would bias the digit distribution. MD&A comparison opts in to
percentages because a changed growth rate is exactly what a reviewer wants
to see.
"""

from __future__ import annotations

import re
from decimal import Decimal

_NUMBER = re.compile(
    r"""
    (?P<open>\()?
    (?P<sign>-)?
    [$€£¥]?\s*
    (?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)
    (?:\s*(?P<suffix>thousand|million|billion|bn|[kKmMbB])\b)?
    (?P<pct>\s*%)?
    (?P<close>\))?
    """,
    re.VERBOSE | re.IGNORECASE,
)

_MULTIPLIER = {
    "k": Decimal(10**3),
    "thousand": Decimal(10**3),
    "m": Decimal(10**6),
    "million": Decimal(10**6),
    "b": Decimal(10**9),
    "bn": Decimal(10**9),
    "billion": Decimal(10**9),
}


def extract_numbers(text: str, *, skip_years: bool = True, include_percent: bool = False) -> list[float]:
    values: list[float] = []
    for match in _NUMBER.finditer(text):
        if match.group("pct") and not include_percent:
            continue
        literal = match.group("num")
        raw = literal.replace(",", "")
        value = Decimal(raw)
        suffix = match.group("suffix")
        if suffix:
            value *= _MULTIPLIER[suffix.lower()]
        elif skip_years and literal.isdigit() and len(literal) == 4 and 1900 <= value <= 2100:
            continue
        if (match.group("open") and match.group("close")) or match.group("sign"):
            value = -value
        values.append(float(value))
    return values
