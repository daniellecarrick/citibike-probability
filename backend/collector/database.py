import os
import sqlite3
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent.parent.parent / "data" / "citibike.db"))


def get_connection() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    conn = get_connection()
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS stations (
                station_id   TEXT PRIMARY KEY,
                station_name TEXT NOT NULL,
                lat          REAL NOT NULL,
                lng          REAL NOT NULL,
                capacity     INTEGER,
                borough      TEXT,
                neighborhood TEXT
            );

            CREATE TABLE IF NOT EXISTS station_snapshots (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp               INTEGER NOT NULL,
                station_id              TEXT NOT NULL,
                available_bikes         INTEGER NOT NULL,
                available_classic_bikes INTEGER NOT NULL,
                available_ebikes        INTEGER NOT NULL,
                available_docks         INTEGER NOT NULL,
                is_seeded               INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (station_id) REFERENCES stations(station_id)
            );

            CREATE INDEX IF NOT EXISTS idx_snap_station_time
                ON station_snapshots(station_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_snap_time
                ON station_snapshots(timestamp);

            CREATE INDEX IF NOT EXISTS idx_snap_epoch_week
                ON station_snapshots((timestamp % 604800), station_id);

            -- Pre-aggregated (station, day-of-week, 5-min slot) rollup, rebuilt
            -- periodically from station_snapshots. Fixed size (~stations * 2016
            -- slots) regardless of how much raw history accumulates — read
            -- endpoints query this instead of scanning station_snapshots.
            -- station_snapshots itself is never modified by the rollup.
            CREATE TABLE IF NOT EXISTS station_slot_rollup (
                station_id     TEXT NOT NULL,
                day_of_week    INTEGER NOT NULL,
                raw_slot       INTEGER NOT NULL,
                total          INTEGER NOT NULL,
                bikes_avail    INTEGER NOT NULL,
                bikes_low      INTEGER NOT NULL,
                bikes_sum      REAL NOT NULL,
                bikes_h0       INTEGER NOT NULL DEFAULT 0,
                bikes_h1_2     INTEGER NOT NULL DEFAULT 0,
                bikes_h3_5     INTEGER NOT NULL DEFAULT 0,
                bikes_h6_10    INTEGER NOT NULL DEFAULT 0,
                bikes_h11_15   INTEGER NOT NULL DEFAULT 0,
                bikes_h16p     INTEGER NOT NULL DEFAULT 0,
                classic_avail  INTEGER NOT NULL,
                classic_low    INTEGER NOT NULL,
                classic_sum    REAL NOT NULL,
                classic_h0     INTEGER NOT NULL DEFAULT 0,
                classic_h1_2   INTEGER NOT NULL DEFAULT 0,
                classic_h3_5   INTEGER NOT NULL DEFAULT 0,
                classic_h6_10  INTEGER NOT NULL DEFAULT 0,
                classic_h11_15 INTEGER NOT NULL DEFAULT 0,
                classic_h16p   INTEGER NOT NULL DEFAULT 0,
                ebikes_avail   INTEGER NOT NULL,
                ebikes_low     INTEGER NOT NULL,
                ebikes_sum     REAL NOT NULL,
                ebikes_h0      INTEGER NOT NULL DEFAULT 0,
                ebikes_h1_2    INTEGER NOT NULL DEFAULT 0,
                ebikes_h3_5    INTEGER NOT NULL DEFAULT 0,
                ebikes_h6_10   INTEGER NOT NULL DEFAULT 0,
                ebikes_h11_15  INTEGER NOT NULL DEFAULT 0,
                ebikes_h16p    INTEGER NOT NULL DEFAULT 0,
                docks_avail    INTEGER NOT NULL,
                docks_low      INTEGER NOT NULL,
                docks_sum      REAL NOT NULL,
                docks_h0       INTEGER NOT NULL DEFAULT 0,
                docks_h1_2     INTEGER NOT NULL DEFAULT 0,
                docks_h3_5     INTEGER NOT NULL DEFAULT 0,
                docks_h6_10    INTEGER NOT NULL DEFAULT 0,
                docks_h11_15   INTEGER NOT NULL DEFAULT 0,
                docks_h16p     INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (station_id, day_of_week, raw_slot)
            );

            CREATE INDEX IF NOT EXISTS idx_rollup_day_slot
                ON station_slot_rollup(day_of_week, raw_slot);
        """)

    # Migration: add is_seeded column to existing databases that predate this change.
    # All pre-existing rows are seeded data, so they correctly default to is_seeded = 1.
    cols = {row[1] for row in conn.execute("PRAGMA table_info(station_snapshots)")}
    if "is_seeded" not in cols:
        conn.execute("ALTER TABLE station_snapshots ADD COLUMN is_seeded INTEGER NOT NULL DEFAULT 1")
        conn.commit()

    conn.execute("CREATE INDEX IF NOT EXISTS idx_snap_is_seeded ON station_snapshots(is_seeded, timestamp)")
    conn.commit()

    # Migration: add borough/neighborhood columns for existing databases that
    # predate this change. Both start NULL ("not yet geocoded") — there's no
    # valid default, and NULL is exactly what the geocoding backfill queries for.
    station_cols = {row[1] for row in conn.execute("PRAGMA table_info(stations)")}
    if "borough" not in station_cols:
        conn.execute("ALTER TABLE stations ADD COLUMN borough TEXT")
        conn.commit()
    if "neighborhood" not in station_cols:
        conn.execute("ALTER TABLE stations ADD COLUMN neighborhood TEXT")
        conn.commit()

    # Migration: add per-metric histogram bucket columns to station_slot_rollup
    # for existing databases that predate this change. Zero-filled — stale
    # until the next hourly rebuild_rollup() pass repopulates every row anyway.
    rollup_cols = {row[1] for row in conn.execute("PRAGMA table_info(station_slot_rollup)")}
    bucket_suffixes = ["h0", "h1_2", "h3_5", "h6_10", "h11_15", "h16p"]
    for metric in ("bikes", "classic", "ebikes", "docks"):
        for suffix in bucket_suffixes:
            col = f"{metric}_{suffix}"
            if col not in rollup_cols:
                conn.execute(f"ALTER TABLE station_slot_rollup ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0")
                conn.commit()

    conn.close()
