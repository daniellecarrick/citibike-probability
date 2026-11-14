"""
Read-side access to station_range — pre-computed EXACT percentiles of how many
bikes / e-bikes / docks a station holds at each 5-minute time of day.

Why this exists: the station side panel's "typical range" needs exact
percentiles, which the bucketed station_slot_rollup can't give (its percentiles
are bucket midpoints and top out at 18). Computing them exactly needs the raw
station_snapshots table. This table is that computation done once, ahead of
time (collector/station_ranges.py), so the raw table can be dropped from a
frozen dataset without losing the panel.

Layout: one row per (station, day_of_week, metric) holding a packed blob of 288
slots x 6 little-endian uint16 values:
    p10, p25, median, p75, p90   (each x10, so 0.1 resolution — exactly what
                                  the live path rounds to)
    sample_count                 (0 = no data in that slot's window)
Slot s is the ±15-minute window centred on minute s*5 of the day, the same
window get_stability_metrics(exact=True) uses. A request for a minute that
isn't a multiple of 5 is served from the nearest 5-minute centre.

Only used while the dataset is frozen (DATA_END_TS set): while collecting live,
this table would go stale, so the router reads the raw snapshots instead.
"""
import os
import sqlite3
import struct
from typing import Optional

SLOTS_PER_DAY = 288
FIELDS_PER_SLOT = 6  # p10, p25, median, p75, p90, sample_count
SLOT_STRUCT = struct.Struct("<6H")
BLOB_BYTES = SLOTS_PER_DAY * SLOT_STRUCT.size
RANGE_METRICS = ("bikes", "ebikes", "docks")

CREATE_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS station_range (
        station_id  TEXT    NOT NULL,
        day_of_week INTEGER NOT NULL,
        metric      TEXT    NOT NULL,
        data        BLOB    NOT NULL,
        PRIMARY KEY (station_id, day_of_week, metric)
    ) WITHOUT ROWID
"""


def precomputed_ranges_enabled() -> bool:
    """True once the dataset is frozen (see Dockerfile's DATA_END_TS)."""
    return bool(os.environ.get("DATA_END_TS"))


def slot_for_minute(time_of_day: int) -> int:
    """Nearest 5-minute centre for a minute-of-day (0-1439)."""
    return min(SLOTS_PER_DAY - 1, (time_of_day + 2) // 5)


def _empty(metric: str) -> dict:
    return {
        "metric": metric, "sample_count": 0,
        "p10": None, "p25": None, "median": None, "p75": None, "p90": None,
    }


def fetch_station_range(
    conn: sqlite3.Connection, station_id: str, day_of_week: int, time_of_day: int, metric: str,
) -> Optional[dict]:
    """The typical-range stats for one station/day/time/metric, or None if the
    station_range table hasn't been built (caller should fall back to a raw
    scan). A built table with no data for this slot returns an empty result."""
    try:
        row = conn.execute(
            "SELECT data FROM station_range WHERE station_id = ? AND day_of_week = ? AND metric = ?",
            (station_id, day_of_week, metric),
        ).fetchone()
        if row is None:
            built = conn.execute("SELECT 1 FROM station_range LIMIT 1").fetchone()
            return _empty(metric) if built else None
    except sqlite3.OperationalError:  # table doesn't exist
        return None

    p10, p25, median, p75, p90, count = SLOT_STRUCT.unpack_from(
        row[0], slot_for_minute(time_of_day) * SLOT_STRUCT.size
    )
    if count == 0:
        return _empty(metric)
    return {
        "metric": metric, "sample_count": count,
        "p10": p10 / 10, "p25": p25 / 10, "median": median / 10, "p75": p75 / 10, "p90": p90 / 10,
    }
