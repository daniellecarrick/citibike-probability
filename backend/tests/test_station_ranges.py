"""
Tests for the pre-computed typical-range table (collector/station_ranges.py
builds it, analytics/station_ranges.py reads it). The key property: for any
5-minute time, it matches get_stability_metrics(exact=True) over the raw
snapshots.
"""
import random
import time

import pytest

from analytics.stability import get_stability_metrics
from analytics.station_ranges import fetch_station_range, slot_for_minute
from collector.station_ranges import build_station_ranges
from tests.conftest import timestamp_for

FIELDS = ("sample_count", "p10", "p25", "median", "p75", "p90")


def _insert(db, station_id, ts, bikes, ebikes, docks):
    db.execute(
        """INSERT INTO station_snapshots
           (timestamp, station_id, available_bikes, available_classic_bikes,
            available_ebikes, available_docks, is_seeded)
           VALUES (?, ?, ?, 0, ?, ?, 0)""",
        (ts, station_id, bikes, ebikes, docks),
    )


@pytest.fixture
def frozen_db(db, monkeypatch):
    """db with random snapshots across days/times (including window edges and
    values over 18 that the bucketed rollup can't represent), plus the
    range table built and DATA_END_TS pinned so both paths share a window."""
    rng = random.Random(7)
    end_ts = int(time.time())
    monkeypatch.setenv("DATA_END_TS", str(end_ts))
    for station in ("S1", "S2"):
        for dow in range(7):
            for minute in (0, 5, 465, 470, 480, 495, 500, 725, 1435, 1439):
                for weeks_ago in range(1, 11):
                    _insert(
                        db, station, timestamp_for(dow, minute, weeks_ago),
                        rng.randint(0, 40), rng.randint(0, 25), rng.randint(0, 40),
                    )
    db.commit()
    build_station_ranges(db, end_ts)
    return db


@pytest.mark.parametrize("metric", ["bikes", "ebikes", "docks"])
def test_precomputed_matches_exact_raw_scan(frozen_db, metric):
    checked = 0
    for station in ("S1", "S2"):
        for dow in range(7):
            for minute in (0, 5, 465, 475, 480, 485, 495, 500, 720, 725, 730, 1435):
                fast = fetch_station_range(frozen_db, station, dow, minute, metric)
                exact = get_stability_metrics(frozen_db, station, dow, minute, metric, exact=True)
                for field in FIELDS:
                    assert fast[field] == exact[field], (station, dow, minute, metric, field)
                checked += 1
    assert checked > 100


def test_unaligned_minute_uses_nearest_five_minute_centre(frozen_db):
    assert slot_for_minute(482) == slot_for_minute(480) == 96
    assert slot_for_minute(483) == slot_for_minute(485) == 97
    assert slot_for_minute(1439) == 287
    assert fetch_station_range(frozen_db, "S1", 1, 482, "bikes") == fetch_station_range(frozen_db, "S1", 1, 480, "bikes")


def test_slot_without_data_returns_empty_result(frozen_db):
    # Samples only exist around the minutes inserted above; 3:00 AM has none.
    result = fetch_station_range(frozen_db, "S1", 2, 180, "bikes")
    assert result["sample_count"] == 0
    assert result["median"] is None and result["p90"] is None


def test_built_table_with_missing_row_returns_empty_not_none(frozen_db):
    frozen_db.execute("DELETE FROM station_range WHERE station_id = 'S2'")
    frozen_db.commit()
    result = fetch_station_range(frozen_db, "S2", 1, 480, "bikes")
    assert result is not None and result["sample_count"] == 0


def test_returns_none_when_table_not_built(db):
    assert fetch_station_range(db, "S1", 1, 480, "bikes") is None


def test_build_is_repeatable_and_replaces_contents(frozen_db):
    first = frozen_db.execute("SELECT COUNT(*) FROM station_range").fetchone()[0]
    build_station_ranges(frozen_db, int(time.time()))
    assert frozen_db.execute("SELECT COUNT(*) FROM station_range").fetchone()[0] == first


def test_context_endpoint_serves_precomputed_range_without_raw_snapshots(client, frozen_db):
    # Drop the raw data: in frozen mode the endpoint must still answer.
    expected = fetch_station_range(frozen_db, "S1", 1, 480, "ebikes")
    frozen_db.execute("DELETE FROM station_snapshots")
    frozen_db.commit()

    body = client.get("/api/stations/S1/context", params={"day": 1, "time": 480, "metric": "ebikes"}).json()
    assert body["range"]["median"] == expected["median"]
    assert body["range"]["p10"] == expected["p10"]
    assert body["range"]["p90"] == expected["p90"]
    assert body["range"]["sample_count"] == expected["sample_count"]


def test_context_endpoint_ignores_precomputed_when_not_frozen(client, frozen_db, monkeypatch):
    monkeypatch.delenv("DATA_END_TS", raising=False)
    # Table emptied and DATA_END_TS unset: not-frozen mode must read the live raw snapshots.
    frozen_db.execute("DELETE FROM station_range")
    frozen_db.commit()
    body = client.get("/api/stations/S1/context", params={"day": 1, "time": 480, "metric": "bikes"}).json()
    assert body["range"]["sample_count"] > 0
