import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from analytics.probability import Metric, get_all_stations_probability, get_bulk_day_probabilities
from analytics.stress import get_stress_score
from database import get_db

router = APIRouter(prefix="/api/map", tags=["map"])

DayParam = Annotated[int, Query(ge=0, le=6, description="Day of week: 0=Mon … 6=Sun")]
TimeParam = Annotated[int, Query(ge=0, le=1439, description="Minutes since midnight")]
MetricParam = Annotated[Metric, Query(description="bikes | classic | ebikes | docks")]


@router.get("")
def get_map_probabilities(
    day: DayParam = 0,
    time: TimeParam = 480,
    metric: MetricParam = "bikes",
    conn: sqlite3.Connection = Depends(get_db),
):
    """Probability + stress score for all stations at a given day/time/metric."""
    stations = get_all_stations_probability(conn, day, time, metric)

    # Augment with stress scores in a single pass
    result = []
    for s in stations:
        stress = get_stress_score(
            conn, s["station_id"], day, time, metric  # type: ignore[arg-type]
        ) if s["sample_count"] > 0 else {"stress_score": None}

        result.append({
            **s,
            "stress_score": stress["stress_score"],
        })

    return result


@router.get("/bulk")
def get_bulk_map_probabilities(
    day: DayParam = 0,
    metric: MetricParam = "bikes",
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    All 288 five-minute time slots for a given day/metric.
    Frontend caches this and scrubs locally for smooth animation.
    Returns: { slot_index: [station_prob_objects] }
    """
    return get_bulk_day_probabilities(conn, day, metric)
