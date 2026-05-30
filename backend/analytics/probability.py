"""
Core probability calculations over the time-series snapshot data.

Time is bucketed by:
  - day_of_week: 0=Monday … 6=Sunday (matches Python datetime.weekday())
  - time_of_day: minutes since midnight (0-1439)

All queries include a lookback window (default 90 days) so that mock seeded
data is naturally phased out as real collected data covers the same period.
After 90 days of live collection, only real data is used.

The SQL uses (timestamp % 604800) to extract seconds-into-week.
Python's datetime epoch (Jan 1, 1970) was a Thursday, so:
  Monday offset = 4 * 86400 = 345600
"""
import sqlite3
import time
from typing import Literal

Metric = Literal["bikes", "classic", "ebikes", "docks"]

EPOCH_MONDAY_OFFSET = 345600  # seconds from Unix epoch to Monday 00:00
SECONDS_PER_WEEK = 604800
SECONDS_PER_DAY = 86400
DEFAULT_LOOKBACK_DAYS = 90

METRIC_COLUMN: dict[str, str] = {
    "bikes": "available_bikes",
    "classic": "available_classic_bikes",
    "ebikes": "available_ebikes",
    "docks": "available_docks",
}


def _since(lookback_days: int) -> int:
    return int(time.time()) - lookback_days * SECONDS_PER_DAY


def _week_window(day_of_week: int, time_of_day: int, window_minutes: int) -> tuple[int, int, int, int]:
    day_seconds = day_of_week * SECONDS_PER_DAY + EPOCH_MONDAY_OFFSET
    time_seconds = time_of_day * 60
    window_seconds = window_minutes * 60

    dow_start = day_seconds % SECONDS_PER_WEEK
    dow_end = dow_start + SECONDS_PER_DAY - 1

    tod_start = time_seconds - window_seconds
    tod_end = time_seconds + window_seconds

    return dow_start, dow_end, tod_start, tod_end


def get_availability_probability(
    conn: sqlite3.Connection,
    station_id: str,
    day_of_week: int,
    time_of_day: int,
    metric: Metric = "bikes",
    window_minutes: int = 15,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> dict:
    """
    Probability that `metric` >= 1 for the given station, day, and time.
    Only considers snapshots within the lookback window.
    """
    col = METRIC_COLUMN[metric]
    dow_start, dow_end, tod_start, tod_end = _week_window(day_of_week, time_of_day, window_minutes)
    since = _since(lookback_days)

    if tod_start < 0:
        rows = conn.execute(
            f"""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN {col} >= 1 THEN 1 ELSE 0 END) AS avail_count,
                AVG({col}) AS mean_inventory
            FROM station_snapshots
            WHERE station_id = ?
              AND timestamp >= ?
              AND (timestamp % {SECONDS_PER_WEEK}) BETWEEN ? AND ?
              AND (
                  (timestamp % {SECONDS_PER_DAY}) >= ?
                  OR (timestamp % {SECONDS_PER_DAY}) <= ?
              )
            """,
            (station_id, since, dow_start, dow_end, tod_start + SECONDS_PER_DAY, tod_end),
        ).fetchone()
    else:
        tod_start_clamp = max(0, tod_start)
        tod_end_clamp = min(SECONDS_PER_DAY - 1, tod_end)
        rows = conn.execute(
            f"""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN {col} >= 1 THEN 1 ELSE 0 END) AS avail_count,
                AVG({col}) AS mean_inventory
            FROM station_snapshots
            WHERE station_id = ?
              AND timestamp >= ?
              AND (timestamp % {SECONDS_PER_WEEK}) BETWEEN ? AND ?
              AND (timestamp % {SECONDS_PER_DAY}) BETWEEN ? AND ?
            """,
            (station_id, since, dow_start, dow_end, tod_start_clamp, tod_end_clamp),
        ).fetchone()

    total = rows["total"] or 0
    avail = rows["avail_count"] or 0

    return {
        "probability": (avail / total) if total > 0 else None,
        "sample_count": total,
        "metric": metric,
    }


def get_all_stations_probability(
    conn: sqlite3.Connection,
    day_of_week: int,
    time_of_day: int,
    metric: Metric = "bikes",
    window_minutes: int = 15,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> list[dict]:
    """
    Probability for all stations at once — used for map rendering.
    """
    col = METRIC_COLUMN[metric]
    dow_start, dow_end, tod_start, tod_end = _week_window(day_of_week, time_of_day, window_minutes)
    tod_start_clamp = max(0, tod_start)
    tod_end_clamp = min(SECONDS_PER_DAY - 1, tod_end)
    since = _since(lookback_days)

    if tod_start < 0:
        time_filter = f"""
            (
              (ss.timestamp % {SECONDS_PER_DAY}) >= {tod_start + SECONDS_PER_DAY}
              OR (ss.timestamp % {SECONDS_PER_DAY}) <= {tod_end}
            )
        """
    else:
        time_filter = f"(ss.timestamp % {SECONDS_PER_DAY}) BETWEEN {tod_start_clamp} AND {tod_end_clamp}"

    rows = conn.execute(
        f"""
        SELECT
            st.station_id,
            st.station_name,
            st.lat,
            st.lng,
            st.capacity,
            COUNT(ss.id)                                     AS total,
            SUM(CASE WHEN ss.{col} >= 1 THEN 1 ELSE 0 END)  AS avail_count,
            AVG(CAST(ss.{col} AS REAL))                      AS mean_inventory
        FROM stations st
        LEFT JOIN station_snapshots ss
            ON ss.station_id = st.station_id
           AND ss.timestamp >= ?
           AND (ss.timestamp % {SECONDS_PER_WEEK}) BETWEEN ? AND ?
           AND {time_filter}
        GROUP BY st.station_id
        """,
        (since, dow_start, dow_end),
    ).fetchall()

    result = []
    for r in rows:
        total = r["total"] or 0
        avail = r["avail_count"] or 0
        result.append({
            "station_id": r["station_id"],
            "station_name": r["station_name"],
            "lat": r["lat"],
            "lng": r["lng"],
            "capacity": r["capacity"],
            "probability": (avail / total) if total > 0 else None,
            "mean_inventory": r["mean_inventory"],
            "sample_count": total,
        })

    return result


def get_bulk_day_probabilities(
    conn: sqlite3.Connection,
    day_of_week: int,
    metric: Metric = "bikes",
    window_minutes: int = 15,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> dict[int, list[dict]]:
    """
    All 288 five-minute time slots for a given day/metric.
    Frontend caches this for smooth animation.
    """
    slots: dict[int, list[dict]] = {}
    for slot in range(288):
        slots[slot] = get_all_stations_probability(
            conn, day_of_week, slot * 5, metric, window_minutes, lookback_days
        )
    return slots
