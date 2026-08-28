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

from analytics import rollup
from analytics.stale_cache import StaleWhileRevalidateCache

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

    Reads the pre-aggregated rollup table when it's available (fast, indexed)
    and falls back to scanning station_snapshots directly otherwise (fresh
    deploy before the collector's first rebuild, or a test DB without the
    rollup table).
    """
    if rollup.rollup_available(conn):
        total, avail, sum_inventory = rollup.fetch_station_probability_window(
            conn, station_id, day_of_week, time_of_day, metric, window_minutes  # type: ignore[arg-type]
        )
        return {
            "probability": (avail / total) if total > 0 else None,
            "mean_inventory": (sum_inventory / total) if total > 0 else None,
            "sample_count": total,
            "metric": metric,
        }

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
    mean_inventory = rows["mean_inventory"]

    return {
        "probability": (avail / total) if total > 0 else None,
        "mean_inventory": mean_inventory if total > 0 else None,
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
    if rollup.rollup_available(conn):
        by_station = rollup.fetch_all_stations_probability_window(
            conn, day_of_week, time_of_day, metric, window_minutes  # type: ignore[arg-type]
        )
        station_rows = conn.execute("SELECT station_id, station_name, lat, lng, capacity FROM stations").fetchall()
        result = []
        for s in station_rows:
            total, avail, sum_inv = by_station.get(s["station_id"], (0, 0, 0.0))
            result.append({
                "station_id": s["station_id"],
                "station_name": s["station_name"],
                "lat": s["lat"],
                "lng": s["lng"],
                "capacity": s["capacity"],
                "probability": (avail / total) if total > 0 else None,
                "mean_inventory": (sum_inv / total) if total > 0 else None,
                "sample_count": total,
            })
        return result

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


# This reads station_slot_rollup (via rollup.fetch_day_slot_data), which the
# collector updates roughly hourly (collector/poller.py's incremental
# rollup job), not every 5-minute poll — that only touches the raw
# station_snapshots table. TTL just marks entries stale for the scheduler
# below to notice; it never gates what a live request gets back (see
# StaleWhileRevalidateCache) — a request only ever computes synchronously
# the first time a (day, metric) combination is ever requested.
BULK_CACHE_TTL_SECONDS = 3600
_bulk_cache: StaleWhileRevalidateCache[dict] = StaleWhileRevalidateCache(BULK_CACHE_TTL_SECONDS)


def _bulk_cache_key(day_of_week: int, metric: Metric, window_minutes: int, lookback_days: int) -> tuple:
    return (day_of_week, metric, window_minutes, lookback_days)


def get_bulk_day_probabilities(
    conn: sqlite3.Connection,
    day_of_week: int,
    metric: Metric = "bikes",
    window_minutes: int = 15,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> dict:
    """
    All 288 five-minute time slots for a given day/metric, cached in memory.
    Returns {"station_ids": [...], "slots": {"0": {...}, ..., "287": {...}}} —
    see _compute_bulk_day_probabilities for the columnar per-slot shape.

    Never blocks on recomputation except the very first time a given
    (day, metric) combination is requested — see StaleWhileRevalidateCache.
    Refreshing stale entries is the scheduler's job (poller.py calls
    refresh_bulk_day_probabilities after every rollup update), not this
    function's.
    """
    key = _bulk_cache_key(day_of_week, metric, window_minutes, lookback_days)
    return _bulk_cache.get_or_compute(
        key, lambda: _compute_bulk_day_probabilities(conn, day_of_week, metric, window_minutes, lookback_days)
    )


def refresh_bulk_day_probabilities(
    conn: sqlite3.Connection,
    day_of_week: int,
    metric: Metric = "bikes",
    window_minutes: int = 15,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> dict:
    """Forces a recompute of one (day, metric) bulk cache entry. Called by
    the collector's scheduler after every rollup update — readers keep
    getting the old value via get_bulk_day_probabilities until this returns."""
    key = _bulk_cache_key(day_of_week, metric, window_minutes, lookback_days)
    return _bulk_cache.refresh(
        key, lambda: _compute_bulk_day_probabilities(conn, day_of_week, metric, window_minutes, lookback_days)
    )


def _slot_data_from_raw(
    conn: sqlite3.Connection, day_of_week: int, metric: Metric, lookback_days: int,
) -> dict[str, dict[int, tuple[int, int, float]]]:
    """Same shape as rollup.fetch_day_slot_data, computed directly from
    station_snapshots — used when the rollup table isn't available yet."""
    from collections import defaultdict

    col = METRIC_COLUMN[metric]
    dow_start = (day_of_week * SECONDS_PER_DAY + EPOCH_MONDAY_OFFSET) % SECONDS_PER_WEEK
    dow_end = dow_start + SECONDS_PER_DAY - 1
    since = _since(lookback_days)

    rows = conn.execute(
        f"""
        SELECT
            station_id,
            CAST((timestamp % {SECONDS_PER_DAY}) / 300 AS INTEGER) AS raw_slot,
            COUNT(*)                                       AS total,
            SUM(CASE WHEN {col} >= 1 THEN 1 ELSE 0 END)   AS avail_count,
            SUM(CAST({col} AS REAL))                       AS sum_inventory
        FROM station_snapshots
        WHERE timestamp >= ?
          AND (timestamp % {SECONDS_PER_WEEK}) BETWEEN ? AND ?
        GROUP BY station_id, raw_slot
        """,
        (since, dow_start, dow_end),
    ).fetchall()

    slot_data: dict[str, dict[int, tuple[int, int, float]]] = defaultdict(dict)
    for r in rows:
        slot_data[r["station_id"]][r["raw_slot"]] = (
            r["total"], r["avail_count"], r["sum_inventory"] or 0.0
        )
    return slot_data


def _compute_bulk_day_probabilities(
    conn: sqlite3.Connection,
    day_of_week: int,
    metric: Metric,
    window_minutes: int,
    lookback_days: int,
) -> dict:
    """
    Uses a single SQL aggregation instead of 288 per-slot queries, then a
    circular sliding window (not a per-slot recompute) to aggregate the
    ±window_slots neighbourhood for all 288 target slots in one pass per
    station — O(288 + window) per station instead of O(288 * window).

    Response is columnar, not one object per (station, slot): a single
    ordered station_ids list plus, per slot, parallel value arrays indexed
    to that same order. The previous shape repeated each station's full
    UUID string (and every field name) 288 times — with ~2,500 stations
    that put the raw JSON over 100MB. Columnar format states each station_id
    once and gzips far better besides, since repeated numbers-in-arrays
    compress better than the same values scattered across repeated keyed
    objects. The frontend looks stations up by index into station_ids
    instead of by station_id equality.

    stress_score is omitted entirely — it was always None here (this
    endpoint doesn't compute it), so it was pure dead weight in every one of
    those records. Real per-slot stress scores are only available via the
    non-bulk endpoints (/api/map, /api/stations/{id}/detail).

    Slot data comes from the pre-aggregated rollup table when available
    (indexed lookup instead of a multi-million-row scan) and falls back to
    scanning station_snapshots directly otherwise.
    """
    window_slots = window_minutes // 5  # 3 slots for a 15-min window
    station_ids = [r[0] for r in conn.execute("SELECT station_id FROM stations").fetchall()]

    if rollup.rollup_available(conn):
        slot_data = rollup.fetch_day_slot_data(conn, day_of_week, metric)  # type: ignore[arg-type]
    else:
        slot_data = _slot_data_from_raw(conn, day_of_week, metric, lookback_days)

    slots: dict[int, dict[str, list]] = {
        slot: {"probability": [], "mean_inventory": [], "sample_count": []}
        for slot in range(288)
    }
    zero = (0, 0, 0.0)

    for station_id in station_ids:
        sdata = slot_data.get(station_id, {})

        # Prime the window for target_slot 0: raw slots [-window_slots .. window_slots]
        total = avail = 0
        sum_inv = 0.0
        for offset in range(-window_slots, window_slots + 1):
            t, a, s = sdata.get(offset % 288, zero)
            total += t
            avail += a
            sum_inv += s

        for target_slot in range(288):
            if target_slot > 0:
                # Slide the window forward by one slot: drop the one that fell
                # off the back, add the one that entered the front.
                leave_t, leave_a, leave_s = sdata.get((target_slot - 1 - window_slots) % 288, zero)
                enter_t, enter_a, enter_s = sdata.get((target_slot + window_slots) % 288, zero)
                total += enter_t - leave_t
                avail += enter_a - leave_a
                sum_inv += enter_s - leave_s

            slot = slots[target_slot]
            slot["probability"].append(round(avail / total, 4) if total > 0 else None)
            slot["mean_inventory"].append(round(sum_inv / total, 3) if total > 0 else None)
            slot["sample_count"].append(total)

    return {"station_ids": station_ids, "slots": slots}
