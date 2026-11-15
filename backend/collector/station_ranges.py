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

Pure standard library. The table is stored in time order, so reading one
station at a time through idx_snap_station_time is a random read per row
(measured ~13 s/station on the production volume, ~9.5 h in all). Instead the
90-day window is read sequentially, in a few passes: each pass streams the
table once and keeps only a shard of stations (SHARD_SIZE; ~16 bytes per row,
so ~250 MB for 700 stations at ~23k rows each) in compact arrays, then builds
those stations.

The table is built under a temporary name (station_range_new) and swapped in
only after a station-count check passes, so an interrupted run never leaves
the live station_range half-filled. Re-run with --resume to continue an
interrupted build instead of starting over (same --end-ts / DATA_END_TS).

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
from array import array
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
COMMIT_EVERY_STATIONS = 25
SHARD_SIZE = 700          # stations buffered per sequential pass (~16 bytes/row)
FETCH_ROWS = 100_000
NEW_TABLE = "station_range_new"

# NOT INDEXED forces a rowid-ordered table scan (the table is in time order, so
# this is sequential I/O); otherwise the planner may pick idx_snap_time and
# fetch table rows through the index. Rows are filtered by timestamp in Python.
_SCAN_QUERY = """
    SELECT station_id, timestamp, available_bikes, available_ebikes, available_docks
    FROM station_snapshots NOT INDEXED
    WHERE rowid >= ?
"""


def _enc(x: float) -> int:
    # Clamped to the uint16 range so one odd value (e.g. a negative count from
    # the feed) can't abort a multi-hour build.
    return max(0, min(0xFFFF, int(round(x * 10))))


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


def build_station_ranges(
    conn: sqlite3.Connection, end_ts: Optional[int] = None, resume: bool = False, shard_size: int = SHARD_SIZE,
) -> int:
    """Builds station_range and swaps it in; returns the number of rows written."""
    if end_ts is None:
        env_end = os.environ.get("DATA_END_TS")
        end_ts = int(env_end) if env_end else conn.execute(
            "SELECT MAX(timestamp) FROM station_snapshots"
        ).fetchone()[0]
    if end_ts is None:
        raise RuntimeError("station_snapshots is empty — nothing to build from")
    since = end_ts - LOOKBACK_DAYS * SECONDS_PER_DAY

    # Wait for a lock instead of failing the build if the app writes meanwhile.
    conn.execute("PRAGMA busy_timeout = 60000")
    station_ids = [r[0] for r in conn.execute("SELECT station_id FROM stations ORDER BY station_id")]
    create_new = CREATE_TABLE_SQL.replace("IF NOT EXISTS station_range", f"IF NOT EXISTS {NEW_TABLE}")
    with conn:
        if not resume:
            conn.execute(f"DROP TABLE IF EXISTS {NEW_TABLE}")
        conn.execute(create_new)
    done = {r[0] for r in conn.execute(f"SELECT DISTINCT station_id FROM {NEW_TABLE}")} if resume else set()
    if done:
        log.info(f"Resuming: {len(done)} stations already built")

    t0 = time.monotonic()
    todo = [sid for sid in station_ids if sid not in done]
    first_rowid = conn.execute(
        "SELECT MIN(rowid) FROM station_snapshots WHERE timestamp >= ?", (since,)
    ).fetchone()[0]
    if first_rowid is None:
        todo = []
    shards = [todo[i:i + shard_size] for i in range(0, len(todo), shard_size)]
    for shard_no, shard in enumerate(shards, start=1):
        buffers = {sid: (array("q"), array("i"), array("i"), array("i")) for sid in shard}
        scanned = 0
        cursor = conn.execute(_SCAN_QUERY, (first_rowid,))
        while True:
            batch = cursor.fetchmany(FETCH_ROWS)
            if not batch:
                break
            scanned += len(batch)
            for sid, ts, bikes, ebikes, docks in batch:
                if ts >= since:
                    buf = buffers.get(sid)
                    if buf is not None:
                        buf[0].append(ts)
                        buf[1].append(bikes)
                        buf[2].append(ebikes)
                        buf[3].append(docks)
        cursor.close()
        log.info(f"pass {shard_no}/{len(shards)}: scanned {scanned:,} rows in {time.monotonic() - t0:.0f}s")

        for n, station_id in enumerate(shard, start=1):
            ts_a, b_a, e_a, d_a = buffers.pop(station_id)
            if len(ts_a):
                blobs = _station_blobs(zip(ts_a, b_a, e_a, d_a))
                conn.executemany(
                    f"INSERT OR REPLACE INTO {NEW_TABLE} (station_id, day_of_week, metric, data) VALUES (?, ?, ?, ?)",
                    [(station_id, dow, metric, blob) for (dow, metric), blob in blobs.items()],
                )
                done.add(station_id)
            if n % COMMIT_EVERY_STATIONS == 0:
                conn.commit()
        conn.commit()
        log.info(f"pass {shard_no}/{len(shards)} built; {len(done)} stations with data, {time.monotonic() - t0:.0f}s")
    conn.commit()

    built_stations, written = conn.execute(
        f"SELECT COUNT(DISTINCT station_id), COUNT(*) FROM {NEW_TABLE}"
    ).fetchone()
    if built_stations == 0:
        raise RuntimeError("No station had snapshots in the window; leaving station_range untouched")
    if built_stations != len(done):
        raise RuntimeError(f"{NEW_TABLE} has {built_stations} stations but {len(done)} were processed; not swapping")

    # Atomic swap: readers see the old table or the complete new one, never a partial.
    with conn:
        conn.execute("DROP TABLE IF EXISTS station_range")
        conn.execute(f"ALTER TABLE {NEW_TABLE} RENAME TO station_range")
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except sqlite3.Error as exc:  # best effort: only shrinks the -wal file
        log.warning(f"wal_checkpoint failed: {exc}")
    log.info(f"Built station_range: {written} rows for {built_stations} stations in {time.monotonic() - t0:.0f}s")
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    parser = argparse.ArgumentParser(description="Build the station_range table from station_snapshots.")
    parser.add_argument("--end-ts", type=int, default=None,
                        help="Unix UTC end of the 90-day window (default: DATA_END_TS, else newest snapshot)")
    parser.add_argument("--shard-size", type=int, default=SHARD_SIZE,
                        help="Stations buffered per sequential pass; fewer passes = more memory (default %(default)s)")
    parser.add_argument("--resume", action="store_true",
                        help="Continue an interrupted build (keeps station_range_new; use the same end timestamp)")
    args = parser.parse_args()
    connection = get_connection()
    try:
        build_station_ranges(connection, args.end_ts, resume=args.resume, shard_size=args.shard_size)
    finally:
        connection.close()
