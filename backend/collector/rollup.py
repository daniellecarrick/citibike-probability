"""
Maintains station_slot_rollup — a pre-aggregated (station, day-of-week,
5-min slot) summary of station_snapshots, sized ~stations * 2016 slots
regardless of how much raw history accumulates. backend/analytics/rollup.py
queries this instead of scanning station_snapshots directly.

station_snapshots is never modified here — this is a derived/disposable
cache table, safe to drop and rebuild at any time from raw data.

Two maintenance modes:

- rebuild_rollup(): a full recompute from scratch. This is what poller.py
  schedules — once at startup, then daily. It runs entirely inside SQLite,
  so its memory cost doesn't grow with the size of the table.

- incremental_update(): advances the 90-day trailing window by one
  interval — adds the newly-arrived slice of station_snapshots and
  subtracts the equal-width slice that just aged out. Not currently
  scheduled: it was the hourly path, but hourly freshness isn't needed for
  90-day averages, and over a whole day's interval its fetchall() of delta
  rows costs more memory than a full rebuild does.

Day-of-week/slot constants must match backend/analytics/probability.py —
duplicated here rather than imported because this module intentionally has
no dependency on the read-side analytics package.
"""
import logging
import sqlite3
import time
from local_time import LOCAL_TS

log = logging.getLogger(__name__)

EPOCH_MONDAY_OFFSET = 345600  # seconds from Unix epoch to Monday 00:00 (epoch was a Thursday)
SECONDS_PER_DAY = 86400
SECONDS_PER_WEEK = 604800
DEFAULT_LOOKBACK_DAYS = 90

# Must match analytics/stress.py DEFAULT_THRESHOLDS
LOW_THRESHOLDS = {"bikes": 3, "classic": 2, "ebikes": 2, "docks": 3}

# Must match analytics/probability.py's AVAILABILITY_THRESHOLD.
AVAILABILITY_THRESHOLD = 2

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
        f"SUM(CASE WHEN {_col} >= {AVAILABILITY_THRESHOLD} THEN 1 ELSE 0 END) AS {_metric}_avail"
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
        CAST((CAST(({LOCAL_TS} % {SECONDS_PER_WEEK}) AS INTEGER) / {SECONDS_PER_DAY} + 3) % 7 AS INTEGER)
            AS day_of_week,
        CAST(({LOCAL_TS} % {SECONDS_PER_DAY}) / 300 AS INTEGER) AS raw_slot,
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
    cols = ','.join(_insert_columns)

    # The aggregation stays inside SQLite end to end. Pulling its ~3.4M
    # result rows into Python via fetchall() peaked at ~1.6GB of RSS, which
    # the process then held onto for good. The minutes-long scan writes to a
    # TEMP table (a separate database file), so it holds no write lock on the
    # main DB and the 5-minute poller keeps writing snapshots meanwhile; only
    # the final copy-over below takes the write lock, as before. temp_store
    # is pinned to FILE so that scratch table (~300MB) never lands in RAM.
    conn.execute("PRAGMA temp_store=FILE")
    conn.execute("DROP TABLE IF EXISTS temp.rollup_rebuild")
    conn.execute(f"CREATE TEMP TABLE rollup_rebuild AS {REBUILD_QUERY}", (since,))
    try:
        with conn:
            conn.execute("DELETE FROM station_slot_rollup")
            n = conn.execute(
                f"INSERT INTO station_slot_rollup ({cols}) SELECT {cols} FROM temp.rollup_rebuild"
            ).rowcount
    finally:
        conn.execute("DROP TABLE temp.rollup_rebuild")

    log.info(
        f"Rebuilt station_slot_rollup: {n} rows in {time.monotonic() - t0:.1f}s"
    )
    return n


def _delta_query(sign: int) -> str:
    """Same aggregation as REBUILD_QUERY, scoped to [?, ?) instead of the
    whole window and with every aggregate scaled by `sign` — so the result
    can be added onto existing rollup rows via UPSERT instead of replacing
    them. sign=+1 to add a newly-arrived slice, sign=-1 to remove a slice
    that's aged out."""
    lines = []
    for metric, col in METRIC_COLUMN.items():
        lines.append(f"{sign} * SUM(CASE WHEN {col} >= {AVAILABILITY_THRESHOLD} THEN 1 ELSE 0 END) AS {metric}_avail")
        lines.append(f"{sign} * SUM(CASE WHEN {col} < {LOW_THRESHOLDS[metric]} THEN 1 ELSE 0 END) AS {metric}_low")
        lines.append(f"{sign} * SUM(CAST({col} AS REAL)) AS {metric}_sum")
        for suffix, cond in HISTOGRAM_BUCKETS:
            lines.append(f"{sign} * SUM(CASE WHEN {col} {cond} THEN 1 ELSE 0 END) AS {metric}_{suffix}")

    return f"""
        SELECT
            station_id,
            CAST((CAST(({LOCAL_TS} % {SECONDS_PER_WEEK}) AS INTEGER) / {SECONDS_PER_DAY} + 3) % 7 AS INTEGER)
                AS day_of_week,
            CAST(({LOCAL_TS} % {SECONDS_PER_DAY}) / 300 AS INTEGER) AS raw_slot,
            {sign} * COUNT(*) AS total,
            {','.join(lines)}
        FROM station_snapshots
        WHERE timestamp >= ? AND timestamp < ?
        GROUP BY station_id, day_of_week, raw_slot
    """


_UPSERT_UPDATE_SET = ','.join(
    f"{c} = {c} + excluded.{c}" for c in _insert_columns if c not in ("station_id", "day_of_week", "raw_slot")
)

UPSERT_DELTA_ROW = f"""
    INSERT INTO station_slot_rollup ({','.join(_insert_columns)})
    VALUES ({','.join('?' * len(_insert_columns))})
    ON CONFLICT(station_id, day_of_week, raw_slot) DO UPDATE SET
        {_UPSERT_UPDATE_SET}
"""


def apply_window_delta(conn: sqlite3.Connection, since_ts: int, until_ts: int, sign: int) -> int:
    """
    Adds (sign=+1) or removes (sign=-1) the contribution of station_snapshots
    in [since_ts, until_ts) to/from station_slot_rollup, incrementing each
    existing bucket via UPSERT rather than replacing it.

    Subtracting assumes the bucket already exists from a prior add (initial
    rebuild or an earlier incremental add) — if it doesn't for some reason,
    the UPSERT's INSERT branch would land negative values, which is harmless
    in practice (read paths already treat total<=0 as "no data", identically
    to a missing row) and self-heals at the next periodic full rebuild.
    """
    rows = conn.execute(_delta_query(sign), (since_ts, until_ts)).fetchall()
    if rows:
        with conn:
            conn.executemany(UPSERT_DELTA_ROW, rows)
    return len(rows)


def incremental_update(
    conn: sqlite3.Connection,
    last_update_ts: int,
    now_ts: int,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> int:
    """
    Advances station_slot_rollup's 90-day trailing window forward by
    [last_update_ts, now_ts) instead of rescanning the whole window: adds
    newly-arrived snapshots in that range, and subtracts the equal-width
    slice that is now aging out (the same range shifted back by
    `lookback_days`). Touches only ~one interval's worth of raw data
    (thousands of rows) instead of the full multi-million-row scan
    rebuild_rollup() does. Returns the number of (station, slot) buckets
    touched by either side.
    """
    t0 = time.monotonic()
    window_seconds = lookback_days * SECONDS_PER_DAY

    added = apply_window_delta(conn, last_update_ts, now_ts, sign=1)
    removed = apply_window_delta(conn, last_update_ts - window_seconds, now_ts - window_seconds, sign=-1)

    # A bucket whose last remaining contribution just aged out lands at
    # total=0 rather than disappearing (UPSERT only ever updates in place).
    # Read paths already treat total<=0 identically to a missing row, but
    # drop it here anyway so the table doesn't accumulate zero-value rows
    # forever between periodic full rebuilds.
    with conn:
        conn.execute("DELETE FROM station_slot_rollup WHERE total <= 0")

    log.info(
        f"Incremental rollup update: +{added}/-{removed} buckets touched in {time.monotonic() - t0:.2f}s"
    )
    return added + removed
