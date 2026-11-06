"""Numerical anomaly screening for a set of reported amounts.

Four independent screens, each producing findings with a severity:
  1. Outliers via the robust modified z-score (Iglewicz & Hoaglin, 1993),
     which uses the median and MAD so a few extreme values cannot hide
     themselves by inflating the standard deviation.
  2. Exact duplicate amounts that repeat more often than expected.
  3. Round-number bias: share of amounts that are multiples of 1,000 / 100.
  4. Last-digit uniformity: chi-square test that the final integer digit
     of amounts >= 10 is uniform on 0-9 (fabricated numbers often are not).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass, field
from typing import Literal

from .stats import chi2_sf, median

METHOD_VERSION = "anomalies-1.2"
MIN_SAMPLE = 20

Severity = Literal["info", "low", "medium", "high"]


@dataclass
class Finding:
    screen: str
    severity: Severity
    message: str
    values: list[float] = field(default_factory=list)
    metric: float | None = None


@dataclass
class AnomalyReport:
    n: int
    median: float
    mad: float
    findings: list[Finding]
    outlier_indices: list[int]
    method_version: str = METHOD_VERSION

    def to_dict(self) -> dict:
        data = asdict(self)
        data["summary"] = dict(Counter(f.severity for f in self.findings))
        return data


def modified_z_scores(values: list[float]) -> tuple[list[float], float, float]:
    med = median(values)
    mad = median([abs(v - med) for v in values])
    if mad == 0:
        # Fall back to mean absolute deviation (scaled) when over half the
        # values are identical; otherwise every non-median value is infinite.
        mean_ad = sum(abs(v - med) for v in values) / len(values)
        if mean_ad == 0:
            return [0.0] * len(values), med, 0.0
        return [(v - med) / (1.253314 * mean_ad) for v in values], med, 0.0
    return [0.6745 * (v - med) / mad for v in values], med, mad


def _screen_outliers(values, threshold) -> tuple[list[Finding], list[int]]:
    scores, _, _ = modified_z_scores(values)
    idx = [i for i, z in enumerate(scores) if abs(z) > threshold]
    if not idx:
        return [], []
    worst = max(abs(scores[i]) for i in idx)
    severity: Severity = "high" if worst > 2 * threshold else "medium"
    return [
        Finding(
            screen="outlier",
            severity=severity,
            message=f"{len(idx)} value(s) exceed |modified z| > {threshold}.",
            values=[values[i] for i in sorted(idx, key=lambda i: -abs(scores[i]))][:20],
            metric=round(worst, 3),
        )
    ], idx


def _screen_duplicates(values) -> list[Finding]:
    counts = Counter(v for v in values if abs(v) >= 100)
    n = len(values)
    # A repeated non-trivial amount is notable when it accounts for more than
    # 2% of the sample and appears at least three times.
    repeated = [(v, c) for v, c in counts.items() if c >= 3 and c / n > 0.02]
    if not repeated:
        return []
    repeated.sort(key=lambda vc: (-vc[1], vc[0]))
    top_share = repeated[0][1] / n
    return [
        Finding(
            screen="duplicate",
            severity="high" if top_share > 0.1 else "medium",
            message=(
                f"{len(repeated)} amount(s) repeat unusually often; most common "
                f"appears {repeated[0][1]} times ({top_share:.1%} of sample)."
            ),
            values=[v for v, _ in repeated[:10]],
            metric=round(top_share, 4),
        )
    ]


def _screen_round_numbers(values) -> list[Finding]:
    big = [abs(v) for v in values if abs(v) >= 1000 and float(v).is_integer()]
    if len(big) < 10:
        return []
    share_1000 = sum(1 for v in big if v % 1000 == 0) / len(big)
    # For naturally occurring amounts roughly 1 in 1000 are exact thousands;
    # flag anything an order of magnitude above a generous 2% baseline.
    if share_1000 <= 0.2:
        return []
    return [
        Finding(
            screen="round_number",
            severity="high" if share_1000 > 0.5 else "medium",
            message=f"{share_1000:.0%} of amounts >= 1,000 are exact multiples of 1,000.",
            metric=round(share_1000, 4),
        )
    ]


def _screen_last_digit(values) -> list[Finding]:
    ints = [int(abs(v)) for v in values if abs(v) >= 10 and float(v).is_integer()]
    if len(ints) < 50:
        return []
    counts = Counter(v % 10 for v in ints)
    expected = len(ints) / 10
    chi = sum((counts.get(d, 0) - expected) ** 2 / expected for d in range(10))
    p = chi2_sf(chi, 9)
    if p >= 0.01:
        return []
    return [
        Finding(
            screen="last_digit",
            severity="medium" if p > 1e-4 else "high",
            message=f"Final digits deviate from uniform (chi-square={chi:.1f}, p={p:.2g}).",
            metric=round(p, 8),
        )
    ]


def screen(values: list[float], z_threshold: float = 3.5) -> AnomalyReport:
    clean = [float(v) for v in values]
    if len(clean) < MIN_SAMPLE:
        raise ValueError(f"At least {MIN_SAMPLE} values are required; got {len(clean)}.")
    _, med, mad = modified_z_scores(clean)

    findings, outlier_idx = _screen_outliers(clean, z_threshold)
    findings += _screen_duplicates(clean)
    findings += _screen_round_numbers(clean)
    findings += _screen_last_digit(clean)

    order = {"high": 0, "medium": 1, "low": 2, "info": 3}
    findings.sort(key=lambda f: order[f.severity])
    return AnomalyReport(
        n=len(clean),
        median=med,
        mad=mad,
        findings=findings,
        outlier_indices=sorted(outlier_idx),
    )
