"""
Builds station_range (see analytics/station_ranges.py) from station_snapshots:
exact p10/p25/median/p75/p90 of bikes, e-bikes and docks for every station,
day of week and 5-minute time of day, over the 90 days ending at the last
collected snapshot.

Run once, before station_snapshots is dropped from a frozen dataset. From the
backend directory (e.g. in a Railway shell, where DB_PATH is already set):

    python -m collector.station_ranges            # window ends at DATA_END_TS,
                                                   # else at the newest snapshot
    python -m collector.station_ranges --end-ts 1794748387

Pure standard library, single pass per station via idx_snap_station_time, so
memory stays small (one station's ~26k rows at a time). Safe to re-run — it
replaces the table's contents.

Matches get_stability_metrics(exact=True) bucketing: New York local time,
day of week 0=Monday, and the ±15-minute window clamped (not wrapped) at
midnight.
"""
import argparse
import logging
import os
import sqlite3
import statistics
import time
from bisect import bisect_left, bisect_right
from collections import defaultdict
from typing import Optional

from analytics.stability import _percentile
from analytics.station_ranges import (
    BLOB_BYTES, CREATE_TABLE_SQL, RANGE_METRICS, SLOT_STRUCT, SLOTS_PER_DAY,
)
from collector.database import get_connection
from local_time import to_local_ts

log = logging.getLogger(__name__)

SECONDS_PER_DAY = 86400
SECONDS_PER_WEEK = 604800
LOOKBACK_DAYS = 90
WINDOW_SECONDS = 15 * 60
SLOT_SECONDS = 300
COMMIT_EVERY_STATIONS = 100

# Column order here is RANGE_METRICS order: bikes, ebikes, docks.
_SNAPSHOT_QUERY = """
    SELECT timestamp, available_bikes, available_ebikes, available_docks
    FROM station_snapshots
    WHERE station_id = ? AND timestamp >= ?
"""


def _enc(x: float) -> int:
    return int(round(x * 10))


def _slot_fields(sorted_vals: list[float]) -> tuple[int, ...]:
    if not sorted_vals:
        return (0, 0, 0, 0, 0, 0)
    return (
        _enc(round(_percentile(sorted_vals, 10), 1)),
        _enc(round(_percentile(sorted_vals, 25), 1)),
        _enc(round(statistics.median(sorted_vals), 2)),
        _enc(round(_percentile(sorted_vals, 75), 1)),
        _enc(round(_percentile(sorted_vals, 90), 1)),
        min(len(sorted_vals), 0xFFFF),
    )


def _station_blobs(rows) -> dict[tuple[int, str], bytes]:
    """(day_of_week, metric) -> packed 288-slot blob for one station's rows."""
    by_dow: dict[int, list[tuple[int, int, int, int]]] = defaultdict(list)
    for ts, bikes, ebikes, docks in rows:
        local = to_local_ts(ts)
        # Same day-of-week formula as collector/rollup.py: 0 = Monday.
        dow = ((local % SECONDS_PER_WEEK) // SECONDS_PER_DAY + 3) % 7
        by_dow[dow].append((local % SECONDS_PER_DAY, bikes, ebikes, docks))

    blobs: dict[tuple[int, str], bytes] = {}
    for dow, samples in by_dow.items():
        samples.sort()
        tods = [s[0] for s in samples]
        columns = [[s[1 + m] for s in samples] for m in range(len(RANGE_METRICS))]
        packed = [bytearray(BLOB_BYTES) for _ in RANGE_METRICS]

        for slot in range(SLOTS_PER_DAY):
            centre = slot * SLOT_SECONDS
            i = bisect_left(tods, max(0, centre - WINDOW_SECONDS))
            j = bisect_right(tods, min(SECONDS_PER_DAY - 1, centre + WINDOW_SECONDS))
            for m, col in enumerate(columns):
                vals = sorted(float(v) for v in col[i:j])
                SLOT_STRUCT.pack_into(packed[m], slot * SLOT_STRUCT.size, *_slot_fields(vals))

        for m, metric in enumerate(RANGE_METRICS):
            blobs[(dow, metric)] = bytes(packed[m])
    return blobs


def build_station_ranges(conn: sqlite3.Connection, end_ts: Optional[int] = None) -> int:
    """Rebuilds station_range; returns the number of rows written."""
    if end_ts is None:
        env_end = os.environ.get("DATA_END_TS")
        end_ts = int(env_end) if env_end else conn.execute(
            "SELECT MAX(timestamp) FROM station_snapshots"
        ).fetchone()[0]
    if end_ts is None:
        raise RuntimeError("station_snapshots is empty — nothing to build from")
    since = end_ts - LOOKBACK_DAYS * SECONDS_PER_DAY

    station_ids = [r[0] for r in conn.execute("SELECT station_id FROM stations ORDER BY station_id")]
    with conn:
        conn.execute(CREATE_TABLE_SQL)
        conn.execute("DELETE FROM station_range")

    t0 = time.monotonic()
    written = 0
    for n, station_id in enumerate(station_ids, start=1):
        rows = conn.execute(_SNAPSHOT_QUERY, (station_id, since)).fetchall()
        if rows:
            blobs = _station_blobs(rows)
            conn.executemany(
                "INSERT INTO station_range (station_id, day_of_week, metric, data) VALUES (?, ?, ?, ?)",
                [(station_id, dow, metric, blob) for (dow, metric), blob in blobs.items()],
            )
            written += len(blobs)
        if n % COMMIT_EVERY_STATIONS == 0:
            conn.commit()
            log.info(f"{n}/{len(station_ids)} stations, {written} rows, {time.monotonic() - t0:.0f}s")
    conn.commit()
    log.info(f"Built station_range: {written} rows in {time.monotonic() - t0:.0f}s")
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    parser = argparse.ArgumentParser(description="Build the station_range table from station_snapshots.")
    parser.add_argument("--end-ts", type=int, default=None,
                        help="Unix UTC end of the 90-day window (default: DATA_END_TS, else newest snapshot)")
    args = parser.parse_args()
    connection = get_connection()
    try:
        build_station_ranges(connection, args.end_ts)
    finally:
        connection.close()
