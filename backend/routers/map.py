import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import ORJSONResponse

from analytics.probability import Metric, get_all_stations_probability, get_bulk_day_probabilities
from analytics.stress import get_all_stations_stress
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

    # Single grouped query for all stations' stress scores, not one query per
    # station — that N+1 pattern was the dominant cost of this endpoint.
    stress_by_station = get_all_stations_stress(conn, day, time, metric)  # type: ignore[arg-type]

    result = [
        {**s, "stress_score": stress_by_station.get(s["station_id"])}
        for s in stations
    ]

    # Returning the Response directly skips FastAPI's default jsonable_encoder
    # pass (which walks every value recursively and is far slower than orjson
    # on a response this size) in favor of orjson's native serialization.
    return ORJSONResponse(content=result)


@router.get("/bulk")
def get_bulk_map_probabilities(
    day: DayParam = 0,
    metric: MetricParam = "bikes",
    conn: sqlite3.Connection = Depends(get_db),
):
    """
    All 288 five-minute time slots for a given day/metric.
    Frontend caches this and scrubs locally for smooth animation.
    Returns: { slot_index: [{ station_id, probability, mean_inventory,
    sample_count, stress_score }] } — join on station_id against
    GET /api/stations for name/lat/lng/capacity.
    """
    data = get_bulk_day_probabilities(conn, day, metric)
    return ORJSONResponse(content=data)
