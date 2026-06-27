"""
Shared fixtures for backend tests.

Creates an in-memory SQLite database with the real schema and
seeds a pair of test stations plus configurable snapshots.
"""
import sqlite3
import time
import pytest
from fastapi.testclient import TestClient

# ── Schema ──────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS stations (
    station_id   TEXT PRIMARY KEY,
    station_name TEXT NOT NULL,
    lat          REAL NOT NULL,
    lng          REAL NOT NULL,
    capacity     INTEGER
);

CREATE TABLE IF NOT EXISTS station_snapshots (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp              INTEGER NOT NULL,
    station_id             TEXT NOT NULL REFERENCES stations(station_id),
    available_bikes        INTEGER NOT NULL DEFAULT 0,
    available_classic_bikes INTEGER NOT NULL DEFAULT 0,
    available_ebikes       INTEGER NOT NULL DEFAULT 0,
    available_docks        INTEGER NOT NULL DEFAULT 0,
    is_seeded              INTEGER NOT NULL DEFAULT 0
);
"""

# ── Helpers ──────────────────────────────────────────────────────────────────

EPOCH_MONDAY_OFFSET = 345600  # seconds from Unix epoch to Monday 00:00
SECONDS_PER_WEEK = 604800
SECONDS_PER_DAY = 86400


def timestamp_for(day_of_week: int, minute_of_day: int, weeks_ago: int = 1) -> int:
    """
    Construct a Unix timestamp that falls on the given day-of-week and
    minute-of-day, approximately `weeks_ago` weeks in the past.

    The analytics code uses (ts % SECONDS_PER_WEEK) to identify the day,
    with Monday at offset EPOCH_MONDAY_OFFSET (345600). So we need:
        ts % SECONDS_PER_WEEK == day_of_week * SECONDS_PER_DAY + EPOCH_MONDAY_OFFSET + minute_of_day * 60

    We build that by starting from the latest epoch-week boundary and adding
    the desired day/time offset.
    """
    now = int(time.time())
    # Start of the current epoch week (Thursday boundary — epoch was Thursday)
    current_epoch_week_start = (now // SECONDS_PER_WEEK) * SECONDS_PER_WEEK
    # Offset within the epoch week that corresponds to this day + time
    day_offset_in_epoch_week = day_of_week * SECONDS_PER_DAY + EPOCH_MONDAY_OFFSET + minute_of_day * 60
    target = current_epoch_week_start - weeks_ago * SECONDS_PER_WEEK + day_offset_in_epoch_week
    return target


# ── Core fixture ─────────────────────────────────────────────────────────────

@pytest.fixture
def db() -> sqlite3.Connection:
    """In-memory database with schema and two test stations."""
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.executemany(
        "INSERT INTO stations (station_id, station_name, lat, lng, capacity) VALUES (?,?,?,?,?)",
        [
            ("S1", "Alpha Station", 40.750, -73.980, 20),
            ("S2", "Beta Station",  40.760, -73.970, 15),
        ],
    )
    conn.commit()
    return conn


def insert_snapshots(
    conn: sqlite3.Connection,
    station_id: str,
    day_of_week: int,
    minute_of_day: int,
    count: int,
    bikes: int = 1,
    docks: int = 1,
    weeks_range: int = 10,
):
    """Insert `count` snapshots spread over `weeks_range` past weeks."""
    rows = []
    for i in range(count):
        ts = timestamp_for(day_of_week, minute_of_day, weeks_ago=i % weeks_range + 1)
        rows.append((ts, station_id, bikes, 0, 0, docks, 0))
    conn.executemany(
        """
        INSERT INTO station_snapshots
            (timestamp, station_id, available_bikes, available_classic_bikes,
             available_ebikes, available_docks, is_seeded)
        VALUES (?,?,?,?,?,?,?)
        """,
        rows,
    )
    conn.commit()


# ── FastAPI test client ───────────────────────────────────────────────────────

@pytest.fixture
def client(db):
    """TestClient with the real app wired to the in-memory DB."""
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

    from main import app
    from database import get_db

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
