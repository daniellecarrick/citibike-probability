"""
Rebuilds station_slot_rollup — a pre-aggregated (station, day-of-week, 5-min
slot) summary of station_snapshots, sized ~stations * 2016 slots regardless
of how much raw history accumulates. Read endpoints in backend/ query this
instead of scanning station_snapshots directly.

station_snapshots is never modified here — this is a derived/disposable
cache table, safe to drop and rebuild at any time from raw data. It's
rebuilt on a timer (see collector.py), not updated incrementally, because a
90-day *rolling* window can't be maintained with simple running counters
without keeping per-snapshot detail — a periodic full rebuild is the honest
way to keep it both fast and correct.

Day-of-week/slot constants must match backend/analytics/probability.py —
duplicated here rather than imported because the collector and backend are
deployed and run as separate processes/packages.
"""
import logging
import sqlite3
import time

log = logging.getLogger(__name__)

EPOCH_MONDAY_OFFSET = 345600  # seconds from Unix epoch to Monday 00:00 (epoch was a Thursday)
SECONDS_PER_DAY = 86400
SECONDS_PER_WEEK = 604800
DEFAULT_LOOKBACK_DAYS = 90

# Must match analytics/stress.py DEFAULT_THRESHOLDS
LOW_THRESHOLDS = {"bikes": 3, "classic": 2, "ebikes": 2, "docks": 3}

REBUILD_QUERY = f"""
    SELECT
        station_id,
        CAST((CAST((timestamp % {SECONDS_PER_WEEK}) AS INTEGER) / {SECONDS_PER_DAY} + 3) % 7 AS INTEGER)
            AS day_of_week,
        CAST((timestamp % {SECONDS_PER_DAY}) / 300 AS INTEGER) AS raw_slot,
        COUNT(*) AS total,
        SUM(CASE WHEN available_bikes         >= 1 THEN 1 ELSE 0 END) AS bikes_avail,
        SUM(CASE WHEN available_bikes         < {LOW_THRESHOLDS["bikes"]}   THEN 1 ELSE 0 END) AS bikes_low,
        SUM(CAST(available_bikes AS REAL))                                   AS bikes_sum,
        SUM(CASE WHEN available_classic_bikes >= 1 THEN 1 ELSE 0 END) AS classic_avail,
        SUM(CASE WHEN available_classic_bikes < {LOW_THRESHOLDS["classic"]} THEN 1 ELSE 0 END) AS classic_low,
        SUM(CAST(available_classic_bikes AS REAL))                          AS classic_sum,
        SUM(CASE WHEN available_ebikes        >= 1 THEN 1 ELSE 0 END) AS ebikes_avail,
        SUM(CASE WHEN available_ebikes        < {LOW_THRESHOLDS["ebikes"]}  THEN 1 ELSE 0 END) AS ebikes_low,
        SUM(CAST(available_ebikes AS REAL))                                  AS ebikes_sum,
        SUM(CASE WHEN available_docks         >= 1 THEN 1 ELSE 0 END) AS docks_avail,
        SUM(CASE WHEN available_docks         < {LOW_THRESHOLDS["docks"]}   THEN 1 ELSE 0 END) AS docks_low,
        SUM(CAST(available_docks AS REAL))                                   AS docks_sum
    FROM station_snapshots
    WHERE timestamp >= ?
    GROUP BY station_id, day_of_week, raw_slot
"""

INSERT_ROW = """
    INSERT INTO station_slot_rollup (
        station_id, day_of_week, raw_slot, total,
        bikes_avail, bikes_low, bikes_sum,
        classic_avail, classic_low, classic_sum,
        ebikes_avail, ebikes_low, ebikes_sum,
        docks_avail, docks_low, docks_sum
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""


def rebuild_rollup(conn: sqlite3.Connection, lookback_days: int = DEFAULT_LOOKBACK_DAYS) -> int:
    """
    Recomputes station_slot_rollup from scratch over the last `lookback_days`
    of station_snapshots and replaces its contents in one transaction.
    Returns the number of rollup rows written.
    """
    since = int(time.time()) - lookback_days * SECONDS_PER_DAY
    t0 = time.monotonic()

    rows = conn.execute(REBUILD_QUERY, (since,)).fetchall()

    with conn:
        conn.execute("DELETE FROM station_slot_rollup")
        conn.executemany(INSERT_ROW, rows)

    log.info(
        f"Rebuilt station_slot_rollup: {len(rows)} rows in {time.monotonic() - t0:.1f}s"
    )
    return len(rows)
