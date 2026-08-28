"""
Rebuilds station_slot_rollup — a pre-aggregated (station, day-of-week, 5-min
slot) summary of station_snapshots, sized ~stations * 2016 slots regardless
of how much raw history accumulates. backend/analytics/rollup.py queries this
instead of scanning station_snapshots directly.

station_snapshots is never modified here — this is a derived/disposable
cache table, safe to drop and rebuild at any time from raw data. It's
rebuilt on a timer (see poller.py), not updated incrementally, because a
90-day *rolling* window can't be maintained with simple running counters
without keeping per-snapshot detail — a periodic full rebuild is the honest
way to keep it both fast and correct.

Day-of-week/slot constants must match backend/analytics/probability.py —
duplicated here rather than imported because this module intentionally has
no dependency on the read-side analytics package.
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

METRIC_COLUMN = {
    "bikes": "available_bikes",
    "classic": "available_classic_bikes",
    "ebikes": "available_ebikes",
    "docks": "available_docks",
}

# Bucket boundaries must match backend/analytics/stability.py's
# buckets = [0, 1, 3, 6, 11, 16] / labels = ["0","1–2","3–5","6–10","11–15","16+"].
HISTOGRAM_BUCKETS = [
    ("h0", "= 0"),
    ("h1_2", "BETWEEN 1 AND 2"),
    ("h3_5", "BETWEEN 3 AND 5"),
    ("h6_10", "BETWEEN 6 AND 10"),
    ("h11_15", "BETWEEN 11 AND 15"),
    ("h16p", ">= 16"),
]

_metric_select_lines = []
_insert_columns = ["station_id", "day_of_week", "raw_slot", "total"]
for _metric, _col in METRIC_COLUMN.items():
    _metric_select_lines.append(
        f"SUM(CASE WHEN {_col} >= 1 THEN 1 ELSE 0 END) AS {_metric}_avail"
    )
    _metric_select_lines.append(
        f"SUM(CASE WHEN {_col} < {LOW_THRESHOLDS[_metric]} THEN 1 ELSE 0 END) AS {_metric}_low"
    )
    _metric_select_lines.append(
        f"SUM(CAST({_col} AS REAL)) AS {_metric}_sum"
    )
    _insert_columns += [f"{_metric}_avail", f"{_metric}_low", f"{_metric}_sum"]
    for _suffix, _cond in HISTOGRAM_BUCKETS:
        _metric_select_lines.append(
            f"SUM(CASE WHEN {_col} {_cond} THEN 1 ELSE 0 END) AS {_metric}_{_suffix}"
        )
        _insert_columns.append(f"{_metric}_{_suffix}")

REBUILD_QUERY = f"""
    SELECT
        station_id,
        CAST((CAST((timestamp % {SECONDS_PER_WEEK}) AS INTEGER) / {SECONDS_PER_DAY} + 3) % 7 AS INTEGER)
            AS day_of_week,
        CAST((timestamp % {SECONDS_PER_DAY}) / 300 AS INTEGER) AS raw_slot,
        COUNT(*) AS total,
        {','.join(_metric_select_lines)}
    FROM station_snapshots
    WHERE timestamp >= ?
    GROUP BY station_id, day_of_week, raw_slot
"""

INSERT_ROW = f"""
    INSERT INTO station_slot_rollup ({','.join(_insert_columns)})
    VALUES ({','.join('?' * len(_insert_columns))})
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
