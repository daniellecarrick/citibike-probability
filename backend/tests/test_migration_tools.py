"""
Tests for the frozen-dataset migration tooling: collector/export_snapshots.py
(archive raw snapshots), collector/slim_db.py (build the small database the
frozen app serves from), and the app's behaviour once station_snapshots is gone.
"""
import csv
import gzip
import json
import random
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest

from collector.export_snapshots import export_snapshots, verify_export
from collector.slim_db import build_slim_db
from collector.station_ranges import build_station_ranges
from tests.conftest import SCHEMA


def _utc(y, m, d, h=12):
    return int(datetime(y, m, d, h, tzinfo=timezone.utc).timestamp())


@pytest.fixture
def file_db(tmp_path) -> Path:
    """On-disk database with real + seeded snapshots across three UTC months."""
    path = tmp_path / "source.db"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.executemany(
        "INSERT INTO stations (station_id, station_name, lat, lng, capacity) VALUES (?,?,?,?,?)",
        [("S1", "Alpha", 40.75, -73.98, 20), ("S2", "Beta", 40.76, -73.97, 15)],
    )
    rng = random.Random(3)
    rows = []
    for station in ("S1", "S2"):
        for day_ts in (_utc(2026, 8, 31, 23), _utc(2026, 9, 1, 0), _utc(2026, 9, 15), _utc(2026, 10, 2)):
            rows.append((day_ts, station, rng.randint(0, 9), 1, 2, rng.randint(0, 9), 0))
        rows.append((_utc(2026, 5, 25), station, 5, 1, 1, 5, 1))  # seeded: must not be exported
    conn.executemany(
        """INSERT INTO station_snapshots
           (timestamp, station_id, available_bikes, available_classic_bikes,
            available_ebikes, available_docks, is_seeded) VALUES (?,?,?,?,?,?,?)""",
        rows,
    )
    conn.commit()
    conn.close()
    return path


def _open_ro(path):
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    return conn


# ── export ────────────────────────────────────────────────────────────────────

def test_export_writes_monthly_files_excluding_seeded(file_db, tmp_path):
    out = tmp_path / "export"
    conn = _open_ro(file_db)
    manifest = export_snapshots(conn, out)
    conn.close()

    assert manifest["total_rows"] == 8  # 2 stations x 4 real timestamps; seeded excluded
    assert sorted(f["name"] for f in manifest["files"]) == [
        "snapshots_2026-08.csv.gz", "snapshots_2026-09.csv.gz", "snapshots_2026-10.csv.gz",
    ]
    # Month boundaries are UTC: Aug 31 23:00 stays in August, Sep 1 00:00 starts September.
    by_name = {f["name"]: f["rows"] for f in manifest["files"]}
    assert by_name == {"snapshots_2026-08.csv.gz": 2, "snapshots_2026-09.csv.gz": 4, "snapshots_2026-10.csv.gz": 2}

    with gzip.open(out / "snapshots_2026-09.csv.gz", "rt", newline="") as f:
        rows = list(csv.reader(f))
    assert rows[0] == manifest["columns"]
    timestamps = [int(r[0]) for r in rows[1:]]
    assert timestamps == sorted(timestamps)

    assert (out / "stations.csv").read_text().splitlines()[0].startswith("station_id,station_name")
    assert "Alpha" in (out / "stations.csv").read_text()
    assert "2026-08-31 23:00:00 UTC" in (out / "README.md").read_text()
    assert json.loads((out / "manifest.json").read_text())["total_rows"] == 8


def test_export_is_reproducible_and_verifies(file_db, tmp_path):
    first, second = tmp_path / "a", tmp_path / "b"
    conn = _open_ro(file_db)
    m1 = export_snapshots(conn, first)
    m2 = export_snapshots(conn, second)
    conn.close()
    assert [f["sha256"] for f in m1["files"]] == [f["sha256"] for f in m2["files"]]
    verify_export(first)  # raises on any mismatch


def test_verify_detects_corruption(file_db, tmp_path):
    out = tmp_path / "export"
    conn = _open_ro(file_db)
    export_snapshots(conn, out)
    conn.close()
    victim = out / "snapshots_2026-09.csv.gz"
    victim.write_bytes(victim.read_bytes()[:-8] + b"corrupt!")
    with pytest.raises(RuntimeError, match="checksum mismatch"):
        verify_export(out)


def test_export_never_modifies_the_database(file_db, tmp_path):
    before = file_db.read_bytes()
    conn = _open_ro(file_db)
    export_snapshots(conn, tmp_path / "export")
    conn.close()
    assert file_db.read_bytes() == before


# ── slim database ─────────────────────────────────────────────────────────────

@pytest.fixture
def ready_to_slim(file_db, monkeypatch):
    """Source DB with station_range built, as the real migration requires."""
    end_ts = _utc(2026, 10, 2)
    monkeypatch.setenv("DATA_END_TS", str(end_ts))
    conn = sqlite3.connect(file_db)
    conn.row_factory = sqlite3.Row
    conn.execute(
        "INSERT INTO station_slot_rollup (station_id, day_of_week, raw_slot, total, bikes_avail, bikes_low, bikes_sum,"
        " classic_avail, classic_low, classic_sum, ebikes_avail, ebikes_low, ebikes_sum, docks_avail, docks_low, docks_sum)"
        " VALUES ('S1', 1, 96, 10, 8, 1, 40, 5, 1, 20, 3, 2, 10, 7, 1, 35)"
    )
    conn.commit()
    build_station_ranges(conn, end_ts)
    conn.close()
    return file_db


def test_slim_db_keeps_only_what_the_app_reads(ready_to_slim, tmp_path):
    dest = tmp_path / "slim.db"
    result = build_slim_db(ready_to_slim, dest)

    conn = sqlite3.connect(dest)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert tables == {"stations", "station_slot_rollup", "station_range"}
    for table, n in result["counts"].items():
        assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == n > 0
    assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    conn.close()
    assert dest.stat().st_size < ready_to_slim.stat().st_size * 3  # sanity: not a runaway copy


def test_slim_db_leaves_source_untouched_and_refuses_overwrite(ready_to_slim, tmp_path):
    before = ready_to_slim.read_bytes()
    dest = tmp_path / "slim.db"
    build_slim_db(ready_to_slim, dest)
    assert ready_to_slim.read_bytes() == before
    with pytest.raises(FileExistsError):
        build_slim_db(ready_to_slim, dest)


def test_slim_db_requires_station_range(file_db, tmp_path):
    dest = tmp_path / "slim.db"
    with pytest.raises(RuntimeError, match="station_range"):
        build_slim_db(file_db, dest)
    assert not dest.exists()


# ── the app without station_snapshots ────────────────────────────────────────

def test_admin_endpoints_answer_503_when_raw_snapshots_archived(client, db):
    db.execute("DROP TABLE station_snapshots")
    db.commit()
    for path in ("/api/admin/summary", "/api/admin/polls", "/api/admin/coverage"):
        r = client.get(path)
        assert r.status_code == 503, path
        assert "archived" in r.json()["detail"]


def test_health_ok_on_slim_db_and_reports_data_end(ready_to_slim, tmp_path, monkeypatch, client):
    dest = tmp_path / "slim.db"
    build_slim_db(ready_to_slim, dest)
    monkeypatch.setenv("DB_PATH", str(dest))
    monkeypatch.setenv("DATA_END_TS", "1794616529")
    body = client.get("/api/health").json()
    assert body == {"status": "ok", "latest_timestamp": 1794616529}


def test_health_reports_latest_snapshot_when_table_present(file_db, monkeypatch, client):
    monkeypatch.setenv("DB_PATH", str(file_db))
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["latest_timestamp"] == _utc(2026, 10, 2)


def test_context_endpoint_works_with_no_raw_table(client, db, monkeypatch):
    # Build ranges from real-looking data, then archive the raw table.
    from tests.conftest import insert_snapshots
    end_ts = int(time.time())
    monkeypatch.setenv("DATA_END_TS", str(end_ts))
    insert_snapshots(db, "S1", day_of_week=1, minute_of_day=8 * 60, count=6, bikes=7, docks=13)
    build_station_ranges(db, end_ts)
    db.execute("DROP TABLE station_snapshots")
    db.commit()

    r = client.get("/api/stations/S1/context", params={"day": 1, "time": 480, "metric": "bikes"})
    assert r.status_code == 200
    assert r.json()["range"]["median"] == 7
