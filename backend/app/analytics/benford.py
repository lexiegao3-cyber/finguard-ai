"""Benford's Law conformity tests (first-digit and first-two-digit).

Implements the tests described in Nigrini, *Benford's Law* (2012):
  * mean absolute deviation (MAD) with Nigrini's conformity bands,
  * Pearson chi-square goodness of fit with an exact p-value,
  * per-digit z-statistics with continuity correction.

Results are descriptive. A nonconforming distribution is a reason to look
closer, never a determination of fraud.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Literal

from .stats import chi2_sf

METHOD_VERSION = "benford-2.0"

# Nigrini (2012), Table 7.1: MAD conformity ranges.
_MAD_BANDS: dict[int, list[tuple[float, str]]] = {
    1: [(0.006, "close"), (0.012, "acceptable"), (0.015, "marginal")],
    2: [(0.0012, "close"), (0.0018, "acceptable"), (0.0022, "marginal")],
}

MIN_SAMPLE = {1: 50, 2: 100}
Z_CRITICAL = 1.96  # two-sided 5% level


def expected_proportions(digits: Literal[1, 2]) -> dict[int, float]:
    lo, hi = (1, 9) if digits == 1 else (10, 99)
    return {d: math.log10(1 + 1 / d) for d in range(lo, hi + 1)}


def leading_digits(value: float, digits: Literal[1, 2]) -> int | None:
    """Return the first `digits` significant digits of `value`.

    Uses a fixed-precision scientific representation instead of log10 so that
    values such as 1000 or 0.001 are not misread through floating-point error.
    Values below 10 are excluded from the first-two-digit test (Nigrini).
    """
    if not math.isfinite(value) or value == 0:
        return None
    magnitude = abs(value)
    if digits == 2 and magnitude < 10:
        return None
    mantissa = f"{magnitude:.14e}".split("e")[0].replace(".", "")
    return int(mantissa[:digits])


@dataclass
class DigitRow:
    digit: int
    count: int
    observed: float
    expected: float
    z: float
    significant: bool


@dataclass
class BenfordResult:
    digits: int
    n: int
    excluded: int
    mad: float
    conformity: str
    chi_square: float
    dof: int
    p_value: float
    rows: list[DigitRow] = field(default_factory=list)
    flagged_digits: list[int] = field(default_factory=list)
    method_version: str = METHOD_VERSION
    note: str = (
        "Descriptive digit-distribution test only; nonconformity is not a "
        "fraud probability or determination."
    )

    def to_dict(self) -> dict:
        return asdict(self)


def _conformity(mad: float, digits: int) -> str:
    for upper, label in _MAD_BANDS[digits]:
        if mad <= upper:
            return label
    return "nonconformity"


def _z_statistic(observed: float, expected: float, n: int) -> float:
    diff = abs(observed - expected)
    correction = 1 / (2 * n)
    if correction < diff:
        diff -= correction
    return diff / math.sqrt(expected * (1 - expected) / n)


def analyze(values: list[float], digits: Literal[1, 2] = 1) -> BenfordResult:
    if digits not in (1, 2):
        raise ValueError("digits must be 1 or 2")

    extracted = [leading_digits(v, digits) for v in values]
    usable = [d for d in extracted if d is not None]
    n = len(usable)
    if n < MIN_SAMPLE[digits]:
        raise ValueError(
            f"At least {MIN_SAMPLE[digits]} usable values are required for the "
            f"{'first' if digits == 1 else 'first-two'}-digit test; got {n}."
        )

    expected = expected_proportions(digits)
    counts = {d: 0 for d in expected}
    for d in usable:
        counts[d] += 1

    rows: list[DigitRow] = []
    chi_square = 0.0
    abs_dev_total = 0.0
    for d, p_exp in expected.items():
        p_obs = counts[d] / n
        abs_dev_total += abs(p_obs - p_exp)
        exp_count = p_exp * n
        chi_square += (counts[d] - exp_count) ** 2 / exp_count
        z = _z_statistic(p_obs, p_exp, n)
        rows.append(
            DigitRow(
                digit=d,
                count=counts[d],
                observed=round(p_obs, 6),
                expected=round(p_exp, 6),
                z=round(z, 4),
                significant=z > Z_CRITICAL,
            )
        )

    mad = abs_dev_total / len(expected)
    dof = len(expected) - 1
    return BenfordResult(
        digits=digits,
        n=n,
        excluded=len(values) - n,
        mad=round(mad, 6),
        conformity=_conformity(mad, digits),
        chi_square=round(chi_square, 4),
        dof=dof,
        p_value=round(chi2_sf(chi_square, dof), 6),
        rows=rows,
        flagged_digits=[r.digit for r in rows if r.significant],
    )

