"""
Correctness test for collector/rollup.py's incremental_update(): it must
produce byte-for-byte the same station_slot_rollup contents as a full
rebuild_rollup() scoped to the same window endpoint. This is the property
that makes the incremental path safe to trust between periodic full
rebuilds — if it drifts from a full rebuild, the periodic correction masks
that until it's already been serving wrong probabilities for hours.
"""
import random
import sqlite3

import pytest

from collector.rollup import INSERT_ROW, REBUILD_QUERY, incremental_update

SCHEMA = """
CREATE TABLE station_snapshots (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp               INTEGER NOT NULL,
    station_id              TEXT NOT NULL,
    available_bikes         INTEGER NOT NULL,
    available_classic_bikes INTEGER NOT NULL,
    available_ebikes        INTEGER NOT NULL,
    available_docks         INTEGER NOT NULL,
    is_seeded               INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE station_slot_rollup (
    station_id     TEXT NOT NULL,
    day_of_week    INTEGER NOT NULL,
    raw_slot       INTEGER NOT NULL,
    total          INTEGER NOT NULL,
    bikes_avail    INTEGER NOT NULL, bikes_low INTEGER NOT NULL, bikes_sum REAL NOT NULL,
    bikes_h0 INTEGER NOT NULL DEFAULT 0, bikes_h1_2 INTEGER NOT NULL DEFAULT 0,
    bikes_h3_5 INTEGER NOT NULL DEFAULT 0, bikes_h6_10 INTEGER NOT NULL DEFAULT 0,
    bikes_h11_15 INTEGER NOT NULL DEFAULT 0, bikes_h16p INTEGER NOT NULL DEFAULT 0,
    classic_avail  INTEGER NOT NULL, classic_low INTEGER NOT NULL, classic_sum REAL NOT NULL,
    classic_h0 INTEGER NOT NULL DEFAULT 0, classic_h1_2 INTEGER NOT NULL DEFAULT 0,
    classic_h3_5 INTEGER NOT NULL DEFAULT 0, classic_h6_10 INTEGER NOT NULL DEFAULT 0,
    classic_h11_15 INTEGER NOT NULL DEFAULT 0, classic_h16p INTEGER NOT NULL DEFAULT 0,
    ebikes_avail   INTEGER NOT NULL, ebikes_low INTEGER NOT NULL, ebikes_sum REAL NOT NULL,
    ebikes_h0 INTEGER NOT NULL DEFAULT 0, ebikes_h1_2 INTEGER NOT NULL DEFAULT 0,
    ebikes_h3_5 INTEGER NOT NULL DEFAULT 0, ebikes_h6_10 INTEGER NOT NULL DEFAULT 0,
    ebikes_h11_15 INTEGER NOT NULL DEFAULT 0, ebikes_h16p INTEGER NOT NULL DEFAULT 0,
    docks_avail    INTEGER NOT NULL, docks_low INTEGER NOT NULL, docks_sum REAL NOT NULL,
    docks_h0 INTEGER NOT NULL DEFAULT 0, docks_h1_2 INTEGER NOT NULL DEFAULT 0,
    docks_h3_5 INTEGER NOT NULL DEFAULT 0, docks_h6_10 INTEGER NOT NULL DEFAULT 0,
    docks_h11_15 INTEGER NOT NULL DEFAULT 0, docks_h16p INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (station_id, day_of_week, raw_slot)
);
"""

POLL_INTERVAL = 300
LOOKBACK_DAYS = 1  # small window so the test doesn't need years of fake data
WINDOW = LOOKBACK_DAYS * 86400


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    return c


def _insert_snapshots(conn, station_ids, start_ts, end_ts, rng):
    rows = []
    t = start_ts
    while t < end_ts:
        for sid in station_ids:
            bikes = rng.randint(0, 20)
            ebikes = rng.randint(0, bikes)
            classic = bikes - ebikes
            docks = rng.randint(0, 20)
            rows.append((t, sid, bikes, classic, ebikes, docks))
        t += POLL_INTERVAL
    conn.executemany(
        "INSERT INTO station_snapshots (timestamp, station_id, available_bikes, "
        "available_classic_bikes, available_ebikes, available_docks) VALUES (?,?,?,?,?,?)",
        rows,
    )
    conn.commit()


def _dump_rollup(conn):
    """All rows, keyed by (station_id, day_of_week, raw_slot), for comparison."""
    rows = conn.execute("SELECT * FROM station_slot_rollup").fetchall()
    return {(r["station_id"], r["day_of_week"], r["raw_slot"]): dict(r) for r in rows}


def _full_rebuild_at(conn, since: int) -> None:
    """Populates station_slot_rollup from scratch for window [since, +inf) —
    same machinery as rebuild_rollup() but with an explicit `since` instead
    of one derived from time.time(), so it works against fake historical
    timestamps far from the real wall clock."""
    conn.execute("DELETE FROM station_slot_rollup")
    rows = conn.execute(REBUILD_QUERY, (since,)).fetchall()
    conn.executemany(INSERT_ROW, rows)
    conn.commit()


def test_incremental_matches_full_rebuild_after_one_step(conn):
    stations = ["S1", "S2"]
    t0 = 10 * WINDOW  # arbitrary anchor, far enough from epoch 0 to allow negative offsets
    rng = random.Random(1)

    # Data only through t0 — mirrors production, where station_snapshots
    # never contains rows from "the future" relative to the baseline.
    _insert_snapshots(conn, stations, t0 - WINDOW, t0, rng)
    _full_rebuild_at(conn, since=t0 - WINDOW)
    assert _dump_rollup(conn), "sanity: rebuild should have produced rows"

    # One interval's worth of new data arrives, then rollup advances to match.
    _insert_snapshots(conn, stations, t0, t0 + POLL_INTERVAL, rng)
    incremental_update(conn, last_update_ts=t0, now_ts=t0 + POLL_INTERVAL, lookback_days=LOOKBACK_DAYS)
    incremental_result = _dump_rollup(conn)

    # Ground truth: a full rebuild scoped to the same later window end, over
    # the exact same station_snapshots contents.
    _full_rebuild_at(conn, since=(t0 + POLL_INTERVAL) - WINDOW)
    ground_truth = _dump_rollup(conn)

    assert incremental_result == ground_truth


def test_incremental_over_several_steps_matches_full_rebuild(conn):
    """Same property, but advancing several intervals in a row — the
    scenario that actually happens hourly in production."""
    stations = ["S1", "S2", "S3"]
    t0 = 10 * WINDOW
    steps = 5
    rng = random.Random(2)

    _insert_snapshots(conn, stations, t0 - WINDOW, t0, rng)
    _full_rebuild_at(conn, since=t0 - WINDOW)

    t = t0
    for _ in range(steps):
        _insert_snapshots(conn, stations, t, t + POLL_INTERVAL, rng)
        incremental_update(conn, last_update_ts=t, now_ts=t + POLL_INTERVAL, lookback_days=LOOKBACK_DAYS)
        t += POLL_INTERVAL
    incremental_result = _dump_rollup(conn)

    _full_rebuild_at(conn, since=t - WINDOW)
    ground_truth = _dump_rollup(conn)

    assert incremental_result == ground_truth
