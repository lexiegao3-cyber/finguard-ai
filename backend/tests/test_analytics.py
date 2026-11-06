import math
import random

import pytest

from app.analytics import anomalies, benford, mdna_diff
from app.analytics.parsing import extract_numbers
from app.analytics.stats import chi2_sf


def log_uniform(n, seed=7, lo=1, hi=7):
    rng = random.Random(seed)
    return [round(10 ** rng.uniform(lo, hi), 2) for _ in range(n)]


# --- statistics -------------------------------------------------------------

@pytest.mark.parametrize(
    "stat,dof,expected",
    [(3.841459, 1, 0.05), (15.507313, 8, 0.05), (20.090235, 8, 0.01), (0.0, 8, 1.0), (122.1, 89, 0.0115)],
)
def test_chi2_survival_matches_reference_tables(stat, dof, expected):
    assert chi2_sf(stat, dof) == pytest.approx(expected, abs=5e-4)


# --- parsing ----------------------------------------------------------------

def test_extract_numbers_handles_financial_formats():
    text = "Revenue was $1,234.5 million vs (2,000) in 2023; margin 12%; capex 3.2M and 45k."
    assert extract_numbers(text) == [1_234_500_000.0, -2000.0, 3.2e6, 45e3]
    assert extract_numbers("growth of 12% in 2024", include_percent=True) == [12.0]
    assert extract_numbers("$4.1 billion") == [4_100_000_000.0]


# --- Benford ----------------------------------------------------------------

def test_leading_digits_avoid_float_error():
    assert benford.leading_digits(1000, 1) == 1
    assert benford.leading_digits(0.000999, 1) == 9
    assert benford.leading_digits(-47.2, 2) == 47
    assert benford.leading_digits(7.5, 2) is None  # < 10 excluded from 2-digit test
    assert benford.leading_digits(0, 1) is None


def test_log_uniform_data_conforms():
    res = benford.analyze(log_uniform(5000), digits=1)
    assert res.conformity in {"close", "acceptable"}
    assert res.p_value > 0.01
    assert sum(r.count for r in res.rows) == res.n == 5000


def test_uniform_data_is_flagged_nonconforming():
    rng = random.Random(1)
    res = benford.analyze([rng.uniform(100, 999) for _ in range(2000)], digits=1)
    assert res.conformity == "nonconformity"
    assert res.p_value < 1e-6
    assert 1 in res.flagged_digits  # digit 1 heavily under-represented


def test_first_two_digit_test_and_minimum_sample():
    res = benford.analyze(log_uniform(3000, seed=3), digits=2)
    assert len(res.rows) == 90 and res.dof == 89
    with pytest.raises(ValueError, match="At least 50"):
        benford.analyze([1, 2, 3, 0, 0], digits=1)


# --- anomalies ---------------------------------------------------------------

def test_anomaly_screens_detect_outliers_duplicates_and_round_numbers():
    rng = random.Random(11)
    values = [round(rng.gauss(5000, 300), 2) for _ in range(200)]
    values += [250_000.0, 5000.0 * 40]          # outliers
    values += [4999.99] * 15                    # repeated amount
    values += [float(1000 * rng.randint(2, 9)) for _ in range(80)]  # round numbers
    report = anomalies.screen(values)
    screens = {f.screen for f in report.findings}
    assert {"outlier", "duplicate", "round_number"} <= screens
    assert report.findings[0].severity == "high"
    assert len(values) - 1 in report.outlier_indices or 200 in report.outlier_indices


def test_constant_values_do_not_divide_by_zero():
    scores, med, mad = anomalies.modified_z_scores([10.0] * 30)
    assert scores == [0.0] * 30 and med == 10.0 and mad == 0.0
    assert all(math.isfinite(z) for z in anomalies.modified_z_scores([10.0] * 29 + [11.0])[0])


# --- MD&A diff ----------------------------------------------------------------

BEFORE = """Revenue increased 12% to $4.1 billion driven by subscription growth.

We face risks related to supply chain disruptions.

Our liquidity remains strong.

Our liquidity remains strong."""

AFTER = """Revenue increased 7% to $4.4 billion driven by subscription growth.

Our liquidity remains strong.

We are subject to a pending SEC investigation regarding revenue recognition."""


def test_mdna_diff_classifies_paragraphs():
    res = mdna_diff.compare(BEFORE, AFTER)
    kinds = [i.kind for i in res.items]
    assert res.counts == {"Matched": 1, "Modified": 1, "Added": 1, "Deleted": 2}
    assert kinds[0] == "Modified"
    modified = res.items[0]
    assert {"before": 12.0, "after": 7.0, "pct_change": -0.4167} in modified.changed_numbers
    assert "7%" in modified.inserted_words


def test_mdna_diff_duplicate_paragraph_multiset_semantics():
    res = mdna_diff.compare("A para.\n\nA para.", "A para.")
    assert res.counts["Matched"] == 1 and res.counts["Deleted"] == 1


def test_mdna_diff_identical_documents():
    res = mdna_diff.compare(BEFORE, BEFORE)
    assert res.counts["Matched"] == 4 and sum(res.counts.values()) == 4
