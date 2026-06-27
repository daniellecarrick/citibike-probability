"""
Tests for analytics/commute.py:
  - Haversine distance and travel time estimation
  - Arrival time calculation (including midnight wrap)
  - P(success) = P(bike) × P(dock)
  - Missing station returns error
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
import math
from analytics.commute import haversine_miles, estimate_travel_time, get_commute_success
from tests.conftest import insert_snapshots


# ── Haversine ─────────────────────────────────────────────────────────────────

def test_haversine_same_point():
    assert haversine_miles(40.75, -73.98, 40.75, -73.98) == pytest.approx(0.0)


def test_haversine_reasonable_distance():
    # Alpha (40.750, -73.980) → Beta (40.760, -73.970): ~0.8 miles
    d = haversine_miles(40.750, -73.980, 40.760, -73.970)
    assert 0.5 < d < 1.5


def test_estimate_travel_time_minimum_1_minute():
    # Same point → 0 distance → clamp to 1 min
    t = estimate_travel_time(40.75, -73.98, 40.75, -73.98)
    assert t == 1


def test_estimate_travel_time_proportional():
    t_near = estimate_travel_time(40.750, -73.980, 40.751, -73.980)
    t_far  = estimate_travel_time(40.750, -73.980, 40.800, -73.980)
    assert t_far > t_near


# ── Arrival time wrap ─────────────────────────────────────────────────────────

def test_arrival_wraps_at_midnight(db, monkeypatch):
    """
    A departure at 23:55 (1435 min) with 15 min of travel should arrive at
    00:10 (10 min), not 1450.
    """
    # Patch travel time to a fixed 15 minutes so the test is deterministic
    import analytics.commute as commute_mod
    monkeypatch.setattr(commute_mod, "estimate_travel_time", lambda *_: 15)

    insert_snapshots(db, "S1", day_of_week=0, minute_of_day=23*60+55, count=5, bikes=3, docks=0)
    insert_snapshots(db, "S2", day_of_week=0, minute_of_day=0*60+10, count=5, bikes=0, docks=5)

    result = get_commute_success(db, "S1", "S2", day_of_week=0, departure_minute=23*60+55)
    assert result["arrival_time"] == "00:10", f"Expected 00:10, got {result['arrival_time']}"
    assert result["travel_minutes"] == 15


# ── P(success) math ───────────────────────────────────────────────────────────

def test_success_probability_product(db, monkeypatch):
    """P(success) = P(bike) × P(dock) when both are non-None."""
    import analytics.commute as commute_mod
    monkeypatch.setattr(commute_mod, "estimate_travel_time", lambda *_: 10)

    # Origin: 10 snapshots, all with bikes → P(bike) = 1.0
    insert_snapshots(db, "S1", day_of_week=1, minute_of_day=8*60, count=10, bikes=2, docks=0)
    # Destination: 10 snapshots, 5 with docks → P(dock) = 0.5
    insert_snapshots(db, "S2", day_of_week=1, minute_of_day=8*60+10, count=5, bikes=0, docks=3)
    insert_snapshots(db, "S2", day_of_week=1, minute_of_day=8*60+10, count=5, bikes=0, docks=0)

    result = get_commute_success(db, "S1", "S2", day_of_week=1, departure_minute=8*60)
    assert result["bike_probability"] == pytest.approx(1.0)
    assert result["dock_probability"] == pytest.approx(0.5)
    assert result["success_probability"] == pytest.approx(0.5)


def test_success_probability_none_when_no_dock_data(db, monkeypatch):
    import analytics.commute as commute_mod
    monkeypatch.setattr(commute_mod, "estimate_travel_time", lambda *_: 5)

    insert_snapshots(db, "S1", day_of_week=2, minute_of_day=10*60, count=5, bikes=1, docks=0)
    # No dock data for S2 at arrival time → P(dock) = None → P(success) = None

    result = get_commute_success(db, "S1", "S2", day_of_week=2, departure_minute=10*60)
    assert result["success_probability"] is None


def test_missing_origin_returns_error(db):
    result = get_commute_success(db, "NONEXISTENT", "S2", day_of_week=0, departure_minute=480)
    assert "error" in result


def test_missing_dest_returns_error(db):
    result = get_commute_success(db, "S1", "NONEXISTENT", day_of_week=0, departure_minute=480)
    assert "error" in result
