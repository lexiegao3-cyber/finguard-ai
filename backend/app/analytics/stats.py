"""Small numerical helpers so the analytics core has no SciPy dependency.

The chi-square survival function is computed through the regularized
upper incomplete gamma function Q(a, x), using the series expansion for
x < a + 1 and a Lentz continued fraction otherwise (Numerical Recipes, 6.2).
"""

from __future__ import annotations

import math

_EPS = 1e-14
_MAX_ITER = 500


def _gamma_series(a: float, x: float) -> float:
    """Regularized lower incomplete gamma P(a, x) via series expansion."""
    term = 1.0 / a
    total = term
    ap = a
    for _ in range(_MAX_ITER):
        ap += 1.0
        term *= x / ap
        total += term
        if abs(term) < abs(total) * _EPS:
            break
    return total * math.exp(-x + a * math.log(x) - math.lgamma(a))


def _gamma_continued_fraction(a: float, x: float) -> float:
    """Regularized upper incomplete gamma Q(a, x) via modified Lentz."""
    tiny = 1e-300
    b = x + 1.0 - a
    c = 1.0 / tiny
    d = 1.0 / b
    h = d
    for i in range(1, _MAX_ITER):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < tiny:
            d = tiny
        c = b + an / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < _EPS:
            break
    return math.exp(-x + a * math.log(x) - math.lgamma(a)) * h


def chi2_sf(statistic: float, dof: int) -> float:
    """P(X >= statistic) for X ~ chi-square(dof)."""
    if dof <= 0:
        raise ValueError("dof must be positive")
    if statistic <= 0:
        return 1.0
    a = dof / 2.0
    x = statistic / 2.0
    if x < a + 1.0:
        return max(0.0, min(1.0, 1.0 - _gamma_series(a, x)))
    return max(0.0, min(1.0, _gamma_continued_fraction(a, x)))


def normal_sf(z: float) -> float:
    """Upper-tail probability of the standard normal distribution."""
    return 0.5 * math.erfc(z / math.sqrt(2.0))


def median(values: list[float]) -> float:
    if not values:
        raise ValueError("median of empty sequence")
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0
