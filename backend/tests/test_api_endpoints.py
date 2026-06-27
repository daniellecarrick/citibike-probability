"""
Integration tests for the FastAPI endpoints.
Uses an in-memory SQLite DB injected via dependency override.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from tests.conftest import insert_snapshots


def test_stations_list(client):
    resp = client.get("/api/stations")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 2
    ids = {s["station_id"] for s in data}
    assert "S1" in ids and "S2" in ids


def test_stations_required_fields(client):
    resp = client.get("/api/stations")
    station = resp.json()[0]
    for field in ("station_id", "station_name", "lat", "lng"):
        assert field in station, f"Missing field: {field}"


def test_station_get_single(client):
    resp = client.get("/api/stations/S1")
    assert resp.status_code == 200
    assert resp.json()["station_id"] == "S1"


def test_station_get_missing(client):
    resp = client.get("/api/stations/NOTREAL")
    assert resp.status_code == 404


def test_map_snapshot(client, db):
    insert_snapshots(db, "S1", day_of_week=1, minute_of_day=8*60, count=5, bikes=2)
    resp = client.get("/api/map", params={"day": 1, "time": 480, "metric": "bikes"})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    station = next((s for s in data if s["station_id"] == "S1"), None)
    assert station is not None
    assert "probability" in station


def test_map_bulk_has_288_keys(client, db):
    insert_snapshots(db, "S1", day_of_week=1, minute_of_day=8*60, count=5, bikes=2)
    resp = client.get("/api/map/bulk", params={"day": 1, "metric": "bikes"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 288
    assert "0" in data and "287" in data


def test_commute_success(client, db):
    insert_snapshots(db, "S1", day_of_week=1, minute_of_day=8*60,    count=5, bikes=3, docks=0)
    insert_snapshots(db, "S2", day_of_week=1, minute_of_day=8*60+15, count=5, bikes=0, docks=5)
    resp = client.get("/api/commute/success", params={
        "origin": "S1", "destination": "S2", "day": 1, "departure_time": 480,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "success_probability" in data


def test_commute_success_probability_range(client, db):
    insert_snapshots(db, "S1", day_of_week=1, minute_of_day=8*60,    count=10, bikes=3, docks=0)
    insert_snapshots(db, "S2", day_of_week=1, minute_of_day=8*60+15, count=10, bikes=0, docks=5)
    resp = client.get("/api/commute/success", params={
        "origin": "S1", "destination": "S2", "day": 1, "departure_time": 480,
    })
    p = resp.json()["success_probability"]
    if p is not None:
        assert 0.0 <= p <= 1.0


def test_commute_recommendations(client, db):
    insert_snapshots(db, "S1", day_of_week=1, minute_of_day=8*60,    count=5, bikes=3, docks=0)
    insert_snapshots(db, "S2", day_of_week=1, minute_of_day=8*60+15, count=5, bikes=0, docks=5)
    resp = client.get("/api/commute/recommendations", params={
        "origin": "S1", "destination": "S2", "day": 1, "departure_time": 480,
    })
    assert resp.status_code == 200
    recs = resp.json()
    assert isinstance(recs, list)
    assert len(recs) > 0
    assert "departure_minute" in recs[0]
    assert "success_probability" in recs[0]
