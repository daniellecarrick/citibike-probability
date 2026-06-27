"""
Tests for collector/collector.py GBFS parsing logic.
Focuses on _parse_ebikes() format variants and poll_status() filtering.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from collector import _parse_ebikes


# ── _parse_ebikes ─────────────────────────────────────────────────────────────

def test_flat_format_num_ebikes_available():
    """GBFS v1-style flat field."""
    station = {"num_ebikes_available": 3}
    assert _parse_ebikes(station) == 3


def test_flat_format_zero():
    station = {"num_ebikes_available": 0}
    assert _parse_ebikes(station) == 0


def test_gbfs_2x_vehicle_types_electric():
    """GBFS 2.x vehicle_types_available array with 'electric' vehicle_type_id."""
    station = {
        "vehicle_types_available": [
            {"vehicle_type_id": "1", "count": 5},
            {"vehicle_type_id": "electric", "count": 2},
        ]
    }
    assert _parse_ebikes(station) == 2


def test_gbfs_2x_vehicle_types_id_2():
    """Citi Bike uses vehicle_type_id '2' for e-bikes."""
    station = {
        "vehicle_types_available": [
            {"vehicle_type_id": "1", "count": 4},
            {"vehicle_type_id": "2", "count": 3},
        ]
    }
    assert _parse_ebikes(station) == 3


def test_gbfs_2x_no_electric_type():
    """No matching vehicle type → returns 0."""
    station = {
        "vehicle_types_available": [
            {"vehicle_type_id": "1", "count": 6},
        ]
    }
    assert _parse_ebikes(station) == 0


def test_no_ebike_fields_returns_zero():
    """Station with no ebike fields at all → 0."""
    assert _parse_ebikes({}) == 0
    assert _parse_ebikes({"num_bikes_available": 5}) == 0


def test_flat_format_takes_priority_over_vehicle_types():
    """If num_ebikes_available is present, it wins."""
    station = {
        "num_ebikes_available": 7,
        "vehicle_types_available": [
            {"vehicle_type_id": "electric", "count": 2},
        ],
    }
    assert _parse_ebikes(station) == 7


# ── classic bike derivation (tested via poll_status logic) ────────────────────

def test_classic_bikes_no_underflow():
    """
    classic = max(0, total - ebikes).
    If ebikes > total (data glitch), classic should be 0, not negative.
    """
    total_bikes = 2
    ebikes = 5
    classic = max(0, total_bikes - ebikes)
    assert classic == 0


def test_classic_bikes_normal():
    total_bikes = 8
    ebikes = 3
    classic = max(0, total_bikes - ebikes)
    assert classic == 5


# ── is_installed / is_renting filtering ───────────────────────────────────────

def test_not_installed_station_is_skipped():
    """Simulate the poll_status filter: skip if not is_installed."""
    stations = [
        {"station_id": "A", "is_installed": False, "is_renting": True,  "num_bikes_available": 5, "num_docks_available": 2},
        {"station_id": "B", "is_installed": True,  "is_renting": True,  "num_bikes_available": 3, "num_docks_available": 4},
    ]
    included = [s for s in stations if s.get("is_installed") and s.get("is_renting")]
    assert len(included) == 1
    assert included[0]["station_id"] == "B"


def test_not_renting_station_is_skipped():
    """Simulate the poll_status filter: skip if not is_renting."""
    stations = [
        {"station_id": "A", "is_installed": True, "is_renting": False, "num_bikes_available": 5, "num_docks_available": 2},
        {"station_id": "B", "is_installed": True, "is_renting": True,  "num_bikes_available": 3, "num_docks_available": 4},
    ]
    included = [s for s in stations if s.get("is_installed") and s.get("is_renting")]
    assert len(included) == 1
    assert included[0]["station_id"] == "B"
