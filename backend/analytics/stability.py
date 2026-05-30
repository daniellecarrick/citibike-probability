"""
Stability metrics: distribution statistics for a station+time window.
SQLite lacks percentile functions, so we fetch raw values and compute in Python.
"""
import sqlite3
import statistics

from analytics.probability import DEFAULT_LOOKBACK_DAYS, EPOCH_MONDAY_OFFSET, METRIC_COLUMN, SECONDS_PER_DAY, SECONDS_PER_WEEK, Metric, _since


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


def get_stability_metrics(
    conn: sqlite3.Connection,
    station_id: str,
    day_of_week: int,
    time_of_day: int,
    metric: Metric = "bikes",
    window_minutes: int = 15,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> dict:
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
        return {
            "metric": metric,
            "sample_count": 0,
            "mean": None,
            "median": None,
            "std_dev": None,
            "min": None,
            "max": None,
            "p10": None,
            "p25": None,
            "p75": None,
            "p90": None,
            "histogram": [],
        }

    mean = statistics.mean(vals)
    median = statistics.median(vals)
    std_dev = statistics.stdev(vals) if len(vals) > 1 else 0.0

    # Histogram buckets: 0, 1-2, 3-5, 6-10, 11-15, 16+
    buckets = [0, 1, 3, 6, 11, 16]
    labels = ["0", "1–2", "3–5", "6–10", "11–15", "16+"]
    hist = [0] * len(labels)
    for v in vals:
        for i in range(len(buckets) - 1):
            if buckets[i] <= v < buckets[i + 1]:
                hist[i] += 1
                break
        else:
            hist[-1] += 1

    return {
        "metric": metric,
        "sample_count": len(vals),
        "mean": round(mean, 2),
        "median": round(median, 2),
        "std_dev": round(std_dev, 2),
        "min": int(vals[0]),
        "max": int(vals[-1]),
        "p10": round(_percentile(vals, 10), 1),
        "p25": round(_percentile(vals, 25), 1),
        "p75": round(_percentile(vals, 75), 1),
        "p90": round(_percentile(vals, 90), 1),
        "histogram": [{"label": l, "count": c} for l, c in zip(labels, hist)],
    }
