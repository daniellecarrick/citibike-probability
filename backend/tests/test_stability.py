"""
Tests for analytics/stability.py:
  - Raw-scan path (station_snapshots) when the rollup table is empty/unavailable
  - Rollup-backed path when station_slot_rollup has matching rows
  - Both paths return the same result shape, including the empty case
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from analytics.stability import get_stability_metrics
from tests.conftest import insert_snapshots, insert_rollup_row


# ── Raw-scan path (no rollup rows present) ─────────────────────────────────

def test_raw_scan_histogram_and_mean(db):
    # 3 snapshots with 0 bikes, 2 with 4 bikes -> mean = 8/5 = 1.6
    insert_snapshots(db, "S1", day_of_week=1, minute_of_day=8 * 60, count=3, bikes=0)
    insert_snapshots(db, "S1", day_of_week=1, minute_of_day=8 * 60, count=2, bikes=4)

    result = get_stability_metrics(db, "S1", day_of_week=1, time_of_day=8 * 60, metric="bikes")

    assert result["sample_count"] == 5
    assert result["mean"] == pytest.approx(1.6)
    hist = {b["label"]: b["count"] for b in result["histogram"]}
    assert hist["0"] == 3
    assert hist["3–5"] == 2


def test_raw_scan_no_data_returns_empty_shape(db):
    result = get_stability_metrics(db, "NONEXISTENT", day_of_week=0, time_of_day=480, metric="bikes")
    assert result["sample_count"] == 0
    assert result["mean"] is None
    assert result["histogram"] == []


# ── Rollup-backed path ──────────────────────────────────────────────────────

def test_rollup_path_used_when_available(db):
    """When station_slot_rollup has a matching row, get_stability_metrics
    reads it instead of scanning station_snapshots (which stays empty here) —
    proving the rollup path, not the raw fallback, produced the result."""
    insert_rollup_row(
        db, "S1", day_of_week=1, raw_slot=96, total=10,
        bikes_sum=23.0, bikes_h0=3, bikes_h1_2=2, bikes_h3_5=5,
    )

    result = get_stability_metrics(db, "S1", day_of_week=1, time_of_day=8 * 60, metric="bikes")

    assert result["sample_count"] == 10
    assert result["mean"] == pytest.approx(2.3)
    hist = {b["label"]: b["count"] for b in result["histogram"]}
    assert hist["0"] == 3
    assert hist["1–2"] == 2
    assert hist["3–5"] == 5
    assert hist["6–10"] == 0


def test_rollup_path_no_matching_slot_returns_empty_shape(db):
    """Rollup table has rows, but none for this station/day/window —
    should return the same empty shape as the no-data raw-scan case."""
    insert_rollup_row(db, "S2", day_of_week=1, raw_slot=96, total=5, bikes_sum=5.0, bikes_h1_2=5)

    result = get_stability_metrics(db, "S1", day_of_week=1, time_of_day=8 * 60, metric="bikes")

    assert result["sample_count"] == 0
    assert result["histogram"] == []


def test_rollup_path_sums_across_window_slots(db):
    """±15 min window = 7 raw_slots (93-99 for time_of_day=480); rows in
    multiple slots within that window should be summed together."""
    insert_rollup_row(db, "S1", day_of_week=2, raw_slot=95, total=4, bikes_sum=4.0, bikes_h1_2=4)
    insert_rollup_row(db, "S1", day_of_week=2, raw_slot=96, total=6, bikes_sum=12.0, bikes_h3_5=6)

    result = get_stability_metrics(db, "S1", day_of_week=2, time_of_day=8 * 60, metric="bikes")

    assert result["sample_count"] == 10
    assert result["mean"] == pytest.approx(1.6)
    hist = {b["label"]: b["count"] for b in result["histogram"]}
    assert hist["1–2"] == 4
    assert hist["3–5"] == 6
