"""
Stability metrics: distribution statistics for a station+time window.
SQLite lacks percentile functions, so we fetch raw values and compute in Python.
"""
import sqlite3
import statistics

from analytics import rollup
from analytics.probability import DEFAULT_LOOKBACK_DAYS, EPOCH_MONDAY_OFFSET, METRIC_COLUMN, SECONDS_PER_DAY, SECONDS_PER_WEEK, Metric, _since

# Histogram buckets: 0, 1-2, 3-5, 6-10, 11-15, 16+ — must match
# collector/rollup.py's HISTOGRAM_BUCKETS and rollup.HISTOGRAM_BUCKET_SUFFIXES.
BUCKET_LOWER_BOUNDS = [0, 1, 3, 6, 11, 16]
BUCKET_LABELS = ["0", "1–2", "3–5", "6–10", "11–15", "16+"]
# One representative value per bucket, used only to approximate
# median/std_dev/percentiles when the exact per-observation values aren't
# available (the rollup path only stores bucketed counts, not raw values).
BUCKET_MIDPOINTS = [0, 1.5, 4, 8, 13, 18]


def _percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * p / 100
    lo = int(k)
    hi = lo + 1
    if hi >= len(sorted_vals):
        return sorted_vals[-1]
    frac = k - lo
    return sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo])


def _stats_from_values(metric: str, sample_count: int, mean: float, vals_for_spread: list[float], hist_counts: list[int]) -> dict:
    """Shared result shape for both the rollup and raw-scan paths.
    `vals_for_spread` is sorted and used for median/std_dev/percentiles —
    exact raw observations when scanning station_snapshots directly, or a
    synthetic per-bucket-midpoint reconstruction when reading the rollup
    (which only stores bucketed counts, not individual values)."""
    median = statistics.median(vals_for_spread)
    std_dev = statistics.stdev(vals_for_spread) if len(vals_for_spread) > 1 else 0.0
    return {
        "metric": metric,
        "sample_count": sample_count,
        "mean": round(mean, 2),
        "median": round(median, 2),
        "std_dev": round(std_dev, 2),
        "min": int(vals_for_spread[0]),
        "max": int(vals_for_spread[-1]),
        "p10": round(_percentile(vals_for_spread, 10), 1),
        "p25": round(_percentile(vals_for_spread, 25), 1),
        "p75": round(_percentile(vals_for_spread, 75), 1),
        "p90": round(_percentile(vals_for_spread, 90), 1),
        "histogram": [{"label": l, "count": c} for l, c in zip(BUCKET_LABELS, hist_counts)],
    }


_EMPTY_RESULT_FIELDS = {
    "sample_count": 0, "mean": None, "median": None, "std_dev": None,
    "min": None, "max": None, "p10": None, "p25": None, "p75": None, "p90": None,
    "histogram": [],
}


def get_stability_metrics(
    conn: sqlite3.Connection,
    station_id: str,
    day_of_week: int,
    time_of_day: int,
    metric: Metric = "bikes",
    window_minutes: int = 15,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> dict:
    if rollup.rollup_available(conn):
        total, _, sum_inventory = rollup.fetch_station_probability_window(
            conn, station_id, day_of_week, time_of_day, metric, window_minutes  # type: ignore[arg-type]
        )
        if total == 0:
            return {"metric": metric, **_EMPTY_RESULT_FIELDS}

        hist_counts = rollup.fetch_station_histogram_window(
            conn, station_id, day_of_week, time_of_day, metric, window_minutes  # type: ignore[arg-type]
        )
        # Reconstruct a representative sorted value list from the bucketed
        # counts (exact values aren't stored in the rollup) so median/std_dev/
        # percentiles can reuse the same interpolation as the raw-scan path.
        synthetic_vals = [
            v for v, count in zip(BUCKET_MIDPOINTS, hist_counts) for v in [v] * count
        ]
        mean = sum_inventory / total
        return _stats_from_values(metric, total, mean, synthetic_vals, hist_counts)

    col = METRIC_COLUMN[metric]
    dow_start = (day_of_week * SECONDS_PER_DAY + EPOCH_MONDAY_OFFSET) % SECONDS_PER_WEEK
    dow_end = dow_start + SECONDS_PER_DAY - 1
    tod_center = time_of_day * 60
    tod_start = max(0, tod_center - window_minutes * 60)
    tod_end = min(SECONDS_PER_DAY - 1, tod_center + window_minutes * 60)
    since = _since(lookback_days)

    rows = conn.execute(
        f"""
        SELECT {col} AS val
        FROM station_snapshots
        WHERE station_id = ?
          AND timestamp >= ?
          AND (timestamp % {SECONDS_PER_WEEK}) BETWEEN ? AND ?
          AND (timestamp % {SECONDS_PER_DAY}) BETWEEN ? AND ?
        """,
        (station_id, since, dow_start, dow_end, tod_start, tod_end),
    ).fetchall()

    vals = sorted(float(r["val"]) for r in rows)

    if not vals:
        return {"metric": metric, **_EMPTY_RESULT_FIELDS}

    hist_counts = [0] * len(BUCKET_LABELS)
    for v in vals:
        for i in range(len(BUCKET_LOWER_BOUNDS) - 1):
            if BUCKET_LOWER_BOUNDS[i] <= v < BUCKET_LOWER_BOUNDS[i + 1]:
                hist_counts[i] += 1
                break
        else:
            hist_counts[-1] += 1

    return _stats_from_values(metric, len(vals), statistics.mean(vals), vals, hist_counts)
