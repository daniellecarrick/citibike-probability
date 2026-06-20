import os
import sqlite3
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "data" / "citibike.db"))


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
                capacity     INTEGER
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
        """)

    # Migration: add is_seeded column to existing databases that predate this change.
    # All pre-existing rows are seeded data, so they correctly default to is_seeded = 1.
    cols = {row[1] for row in conn.execute("PRAGMA table_info(station_snapshots)")}
    if "is_seeded" not in cols:
        conn.execute("ALTER TABLE station_snapshots ADD COLUMN is_seeded INTEGER NOT NULL DEFAULT 1")
        conn.commit()

    conn.execute("CREATE INDEX IF NOT EXISTS idx_snap_is_seeded ON station_snapshots(is_seeded, timestamp)")
    conn.commit()

    conn.close()
