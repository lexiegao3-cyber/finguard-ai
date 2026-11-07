"""Throughput benchmarks for the FinGuard analytics core.

Run from the backend directory:

    python -m benchmarks.bench_analytics            # default sizes
    python -m benchmarks.bench_analytics --sizes 100000 1000000 --repeat 5

Inputs are generated with a fixed seed so results are comparable across
machines and commits. Each measurement is the median of --repeat runs,
timed with time.perf_counter and excluding data generation.
"""

from __future__ import annotations

import argparse
import platform
import random
import statistics
import sys
import time
from collections.abc import Callable

from app.analytics import anomalies, benford, mdna_diff


def log_uniform(n: int, seed: int) -> list[float]:
    """Amounts spanning seven orders of magnitude, like a real ledger."""
    rng = random.Random(seed)
    return [round(10 ** rng.uniform(0, 7), 2) for _ in range(n)]


def mdna_pair(paragraphs: int, seed: int) -> tuple[str, str]:
    """Two filings where every 10th paragraph is reworded and figures change."""
    rng = random.Random(seed)
    words = "revenue growth margin liquidity risk supplier customer segment cash debt guidance outlook".split()
    old = [" ".join(rng.choice(words) for _ in range(60)) + f" totaled ${rng.randint(1, 900)} million." for _ in range(paragraphs)]
    new = list(old)
    for i in range(0, paragraphs, 10):
        new[i] = new[i].replace("million", "billion") + " Management expects this to continue."
    return "\n\n".join(old), "\n\n".join(new)


def median_seconds(fn: Callable[[], object], repeat: int) -> float:
    fn()  # warm-up
    samples = []
    for _ in range(repeat):
        start = time.perf_counter()
        fn()
        samples.append(time.perf_counter() - start)
    return statistics.median(samples)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sizes", type=int, nargs="+", default=[100_000, 1_000_000], help="number of amounts")
    parser.add_argument("--paragraphs", type=int, nargs="+", default=[100, 300], help="MD&A paragraphs per filing")
    parser.add_argument("--repeat", type=int, default=3, help="timed runs per case (median reported)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)

    print(f"Python {platform.python_version()} on {platform.machine()} ({platform.system()}), median of {args.repeat} runs\n")
    print(f"{'case':<38}{'input':>18}{'seconds':>10}{'throughput':>20}")
    print("-" * 86)

    for n in args.sizes:
        values = log_uniform(n, args.seed)
        t = median_seconds(lambda: benford.analyze(values, digits=1), args.repeat)
        print(f"{'Benford first-digit test':<38}{n:>18,}{t:>10.3f}{n / t / 1e6:>14.2f} M val/s")
        t = median_seconds(lambda: benford.analyze(values, digits=2), args.repeat)
        print(f"{'Benford first-two-digit test':<38}{n:>18,}{t:>10.3f}{n / t / 1e6:>14.2f} M val/s")
        t = median_seconds(lambda: anomalies.screen(values), args.repeat)
        print(f"{'Anomaly screen (all four screens)':<38}{n:>18,}{t:>10.3f}{n / t / 1e6:>14.2f} M val/s")

    for p in args.paragraphs:
        before, after = mdna_pair(p, args.seed)
        t = median_seconds(lambda: mdna_diff.compare(before, after), args.repeat)
        print(f"{'MD&A comparison':<38}{f'{p} vs {p} paragraphs':>18}{t:>10.3f}{'':>20}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
