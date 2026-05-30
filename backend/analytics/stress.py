"""
Stress score: measures how frequently a station has critically low inventory,
even when overall availability is high.

Score is 0-100. Higher = more stressed.
Example: a station with 99% availability but 95% of observations < 3 bikes
scores near 95 on the bike stress metric.
"""
import sqlite3
from typing import Optional

from analytics.probability import DEFAULT_LOOKBACK_DAYS, EPOCH_MONDAY_OFFSET, METRIC_COLUMN, SECONDS_PER_DAY, SECONDS_PER_WEEK, Metric, _since

DEFAULT_THRESHOLDS: dict[str, int] = {
    "bikes": 3,
    "classic": 2,
    "ebikes": 2,
    "docks": 3,
}


def get_stress_score(
    conn: sqlite3.Connection,
    station_id: str,
    day_of_week: int,
    time_of_day: int,
    metric: Metric = "bikes",
    window_minutes: int = 15,
    low_threshold: Optional[int] = None,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> dict:
    """
    Returns stress score (0-100) = 100 × fraction of observations below threshold.
    Only considers snapshots within the lookback window.
    """
    col = METRIC_COLUMN[metric]
    threshold = low_threshold if low_threshold is not None else DEFAULT_THRESHOLDS[metric]

    dow_start = (day_of_week * SECONDS_PER_DAY + EPOCH_MONDAY_OFFSET) % SECONDS_PER_WEEK
    dow_end = dow_start + SECONDS_PER_DAY - 1
    tod_center = time_of_day * 60
    tod_start = max(0, tod_center - window_minutes * 60)
    tod_end = min(SECONDS_PER_DAY - 1, tod_center + window_minutes * 60)
    since = _since(lookback_days)

    row = conn.execute(
        f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN {col} < ? THEN 1 ELSE 0 END) AS low_count
        FROM station_snapshots
        WHERE station_id = ?
          AND timestamp >= ?
          AND (timestamp % {SECONDS_PER_WEEK}) BETWEEN ? AND ?
          AND (timestamp % {SECONDS_PER_DAY}) BETWEEN ? AND ?
        """,
        (threshold, station_id, since, dow_start, dow_end, tod_start, tod_end),
    ).fetchone()

    total = row["total"] or 0
    low = row["low_count"] or 0
    score = round((low / total) * 100, 1) if total > 0 else None

    return {
        "stress_score": score,
        "threshold": threshold,
        "low_count": low,
        "sample_count": total,
        "metric": metric,
    }
