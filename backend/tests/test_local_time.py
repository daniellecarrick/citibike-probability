"""
Day/time buckets are New York local time, DST-aware — not UTC. These tests pin
that down at three levels: the offset math itself, the rollup's SQL bucketing,
and the raw-scan fallback used when no rollup exists.
"""
from datetime import datetime, timedelta, timezone

import pytest

from analytics.probability import get_availability_probability
from collector.rollup import rebuild_rollup
from local_time import local_ts_sql, to_local_ts, utc_offset_seconds

# (UTC instant, expected local weekday 0=Mon, expected local minute-of-day)
CASES = [
    # Summer (EDT, UTC-4): Tue 2025-07-15 12:00 UTC == 08:00 ET
    (datetime(2025, 7, 15, 12, 0, tzinfo=timezone.utc), 1, 8 * 60),
    # Winter (EST, UTC-5): Tue 2025-01-14 13:00 UTC == 08:00 ET
    (datetime(2025, 1, 14, 13, 0, tzinfo=timezone.utc), 1, 8 * 60),
    # Local evening that is already "tomorrow" in UTC: Wed 01:00 UTC == Tue 21:00 EDT
    (datetime(2025, 7, 16, 1, 0, tzinfo=timezone.utc), 1, 21 * 60),
    # Local early morning that is still "yesterday" in UTC is not a case; the
    # opposite (UTC Sunday 03:00 == Sat 23:00 EDT) crosses the weekend boundary:
    (datetime(2025, 7, 20, 3, 0, tzinfo=timezone.utc), 5, 23 * 60),
]


def _ids(cases):
    return [c[0].isoformat() for c in cases]


def test_offset_matches_tz_database():
    zoneinfo = pytest.importorskip("zoneinfo")
    ny = zoneinfo.ZoneInfo("America/New_York")
    start = datetime(2021, 1, 1, tzinfo=timezone.utc)
    # Hourly across five years covers every transition and both sides of it.
    for hours in range(0, 5 * 366 * 24):
        dt = start + timedelta(hours=hours)
        expected = int(dt.astimezone(ny).utcoffset().total_seconds())
        assert utc_offset_seconds(int(dt.timestamp())) == expected, dt


def test_local_ts_sql_matches_python(db):
    for year in (2024, 2025, 2026):
        for month in range(1, 13):
            for day in (1, 8, 15, 22, 28):
                for hour in (0, 5, 6, 7, 12, 23):
                    ts = int(datetime(year, month, day, hour, tzinfo=timezone.utc).timestamp())
                    got = db.execute(f"SELECT {local_ts_sql(str(ts))}").fetchone()[0]
                    assert got == to_local_ts(ts), (year, month, day, hour)


@pytest.mark.parametrize("instant,day,minute", CASES, ids=_ids(CASES))
def test_rollup_buckets_by_local_time(db, instant, day, minute):
    db.execute(
        "INSERT INTO station_snapshots (timestamp, station_id, available_bikes, available_classic_bikes, "
        "available_ebikes, available_docks, is_seeded) VALUES (?,?,?,?,?,?,0)",
        (int(instant.timestamp()), "S1", 5, 5, 0, 5),
    )
    db.commit()
    rebuild_rollup(db, lookback_days=36500)

    row = db.execute("SELECT day_of_week, raw_slot FROM station_slot_rollup").fetchone()
    assert (row["day_of_week"], row["raw_slot"]) == (day, minute // 5)


@pytest.mark.parametrize("instant,day,minute", CASES, ids=_ids(CASES))
def test_raw_scan_buckets_by_local_time(db, instant, day, minute):
    """No rollup rows -> get_availability_probability scans station_snapshots."""
    db.execute(
        "INSERT INTO station_snapshots (timestamp, station_id, available_bikes, available_classic_bikes, "
        "available_ebikes, available_docks, is_seeded) VALUES (?,?,?,?,?,?,0)",
        (int(instant.timestamp()), "S1", 5, 5, 0, 5),
    )
    db.commit()

    hit = get_availability_probability(db, "S1", day, minute, "bikes", window_minutes=0, lookback_days=36500)
    assert hit["sample_count"] == 1 and hit["probability"] == 1.0

    # The same instant must NOT show up at its UTC clock time.
    utc_minute = instant.hour * 60 + instant.minute
    utc_day = instant.weekday()
    if (utc_day, utc_minute) != (day, minute):
        miss = get_availability_probability(db, "S1", utc_day, utc_minute, "bikes", window_minutes=0, lookback_days=36500)
        assert miss["sample_count"] == 0
