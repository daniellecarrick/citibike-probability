"""
Read-side access to station_slot_rollup — the pre-aggregated
(station, day-of-week, 5-min slot) table that collector/rollup.py rebuilds
periodically from station_snapshots.

Every function here is a fast, indexed read against a table sized
~stations * 2016 slots (fixed), instead of a scan over station_snapshots
(millions of rows and growing). Callers must check rollup_available() first
and fall back to scanning station_snapshots directly if it's False — the
rollup may not exist yet (fresh deploy, before the collector's first
rebuild) or the table may exist but be pre-population-empty.
"""
import sqlite3
from collections import defaultdict
from typing import Literal

Metric = Literal["bikes", "classic", "ebikes", "docks"]

METRIC_COLUMNS: dict[str, dict[str, str]] = {
    "bikes":   {"avail": "bikes_avail",   "low": "bikes_low",   "sum": "bikes_sum"},
    "classic": {"avail": "classic_avail", "low": "classic_low", "sum": "classic_sum"},
    "ebikes":  {"avail": "ebikes_avail",  "low": "ebikes_low",  "sum": "ebikes_sum"},
    "docks":   {"avail": "docks_avail",   "low": "docks_low",   "sum": "docks_sum"},
}


def rollup_available(conn: sqlite3.Connection) -> bool:
    """True if station_slot_rollup exists and has at least one row.
    An empty-but-existing table means the first rebuild hasn't landed yet —
    treated the same as "not available" so callers fall back to raw scans."""
    try:
        row = conn.execute("SELECT EXISTS(SELECT 1 FROM station_slot_rollup)").fetchone()
        return bool(row[0])
    except sqlite3.OperationalError:
        return False


def slots_in_window(time_of_day: int, window_minutes: int) -> list[int]:
    """5-min raw_slot indices (0-287) within ±window_minutes of time_of_day, wrapping at midnight."""
    target_slot = time_of_day // 5
    window_slots = window_minutes // 5
    return [(target_slot + offset) % 288 for offset in range(-window_slots, window_slots + 1)]


def fetch_day_slot_data(
    conn: sqlite3.Connection, day_of_week: int, metric: Metric
) -> dict[str, dict[int, tuple[int, int, float]]]:
    """station_id -> {raw_slot -> (total, avail_count, sum_inventory)} for a whole day.
    Same shape the bulk endpoint's sliding-window pass already consumes."""
    cols = METRIC_COLUMNS[metric]
    rows = conn.execute(
        f"""
        SELECT station_id, raw_slot, total, {cols['avail']} AS avail_count, {cols['sum']} AS sum_inventory
        FROM station_slot_rollup
        WHERE day_of_week = ?
        """,
        (day_of_week,),
    ).fetchall()

    slot_data: dict[str, dict[int, tuple[int, int, float]]] = defaultdict(dict)
    for r in rows:
        slot_data[r["station_id"]][r["raw_slot"]] = (r["total"], r["avail_count"], r["sum_inventory"] or 0.0)
    return slot_data


def fetch_station_probability_window(
    conn: sqlite3.Connection, station_id: str, day_of_week: int, time_of_day: int,
    metric: Metric, window_minutes: int,
) -> tuple[int, int, float]:
    """(total, avail_count, sum_inventory) for one station over the ±window."""
    cols = METRIC_COLUMNS[metric]
    slots = slots_in_window(time_of_day, window_minutes)
    placeholders = ",".join("?" * len(slots))
    row = conn.execute(
        f"""
        SELECT SUM(total) AS total, SUM({cols['avail']}) AS avail_count, SUM({cols['sum']}) AS sum_inventory
        FROM station_slot_rollup
        WHERE station_id = ? AND day_of_week = ? AND raw_slot IN ({placeholders})
        """,
        (station_id, day_of_week, *slots),
    ).fetchone()
    return row["total"] or 0, row["avail_count"] or 0, row["sum_inventory"] or 0.0


def fetch_all_stations_probability_window(
    conn: sqlite3.Connection, day_of_week: int, time_of_day: int, metric: Metric, window_minutes: int,
) -> dict[str, tuple[int, int, float]]:
    """station_id -> (total, avail_count, sum_inventory) for every station over the ±window."""
    cols = METRIC_COLUMNS[metric]
    slots = slots_in_window(time_of_day, window_minutes)
    placeholders = ",".join("?" * len(slots))
    rows = conn.execute(
        f"""
        SELECT station_id, SUM(total) AS total, SUM({cols['avail']}) AS avail_count, SUM({cols['sum']}) AS sum_inventory
        FROM station_slot_rollup
        WHERE day_of_week = ? AND raw_slot IN ({placeholders})
        GROUP BY station_id
        """,
        (day_of_week, *slots),
    ).fetchall()
    return {r["station_id"]: (r["total"] or 0, r["avail_count"] or 0, r["sum_inventory"] or 0.0) for r in rows}


def fetch_station_low_window(
    conn: sqlite3.Connection, station_id: str, day_of_week: int, time_of_day: int,
    metric: Metric, window_minutes: int,
) -> tuple[int, int]:
    """(total, low_count) for one station over the ±window — feeds stress score."""
    cols = METRIC_COLUMNS[metric]
    slots = slots_in_window(time_of_day, window_minutes)
    placeholders = ",".join("?" * len(slots))
    row = conn.execute(
        f"""
        SELECT SUM(total) AS total, SUM({cols['low']}) AS low_count
        FROM station_slot_rollup
        WHERE station_id = ? AND day_of_week = ? AND raw_slot IN ({placeholders})
        """,
        (station_id, day_of_week, *slots),
    ).fetchone()
    return row["total"] or 0, row["low_count"] or 0


def fetch_all_stations_low_window(
    conn: sqlite3.Connection, day_of_week: int, time_of_day: int, metric: Metric, window_minutes: int,
) -> dict[str, tuple[int, int]]:
    """station_id -> (total, low_count) for every station over the ±window — feeds stress score."""
    cols = METRIC_COLUMNS[metric]
    slots = slots_in_window(time_of_day, window_minutes)
    placeholders = ",".join("?" * len(slots))
    rows = conn.execute(
        f"""
        SELECT station_id, SUM(total) AS total, SUM({cols['low']}) AS low_count
        FROM station_slot_rollup
        WHERE day_of_week = ? AND raw_slot IN ({placeholders})
        GROUP BY station_id
        """,
        (day_of_week, *slots),
    ).fetchall()
    return {r["station_id"]: (r["total"] or 0, r["low_count"] or 0) for r in rows}
