import os
import sqlite3
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "data" / "citibike.db"))


def get_connection() -> sqlite3.Connection:
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
                FOREIGN KEY (station_id) REFERENCES stations(station_id)
            );

            CREATE INDEX IF NOT EXISTS idx_snap_station_time
                ON station_snapshots(station_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_snap_time
                ON station_snapshots(timestamp);

            CREATE INDEX IF NOT EXISTS idx_snap_epoch_week
                ON station_snapshots((timestamp % 604800), station_id);
        """)
    conn.close()
