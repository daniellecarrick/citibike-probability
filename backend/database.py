import os
import sqlite3
from pathlib import Path
from typing import Generator

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "data" / "citibike.db"))


def raw_snapshots_available(conn: sqlite3.Connection) -> bool:
    """False once station_snapshots has been archived out of a frozen dataset
    (the slim database keeps only stations, station_slot_rollup and station_range)."""
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'station_snapshots'"
    ).fetchone() is not None


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA query_only=ON")
    try:
        yield conn
    finally:
        conn.close()
