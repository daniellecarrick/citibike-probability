import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from analytics.probability import get_availability_probability
from analytics.stability import get_stability_metrics
from analytics.stress import get_stress_score
from database import get_db

router = APIRouter(prefix="/api/stations", tags=["stations"])

DayParam = Annotated[int, Query(ge=0, le=6, description="Day of week: 0=Mon … 6=Sun")]
TimeParam = Annotated[int, Query(ge=0, le=1439, description="Minutes since midnight")]


@router.get("")
def list_stations(conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute(
        "SELECT station_id, station_name, lat, lng, capacity FROM stations ORDER BY station_name"
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/{station_id}")
def get_station(station_id: str, conn: sqlite3.Connection = Depends(get_db)):
    row = conn.execute(
        "SELECT station_id, station_name, lat, lng, capacity FROM stations WHERE station_id = ?",
        (station_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Station not found")
    return dict(row)


@router.get("/{station_id}/detail")
def get_station_detail(
    station_id: str,
    day: DayParam = 0,
    time: TimeParam = 0,
    conn: sqlite3.Connection = Depends(get_db),
):
    row = conn.execute(
        "SELECT station_id, station_name, lat, lng, capacity FROM stations WHERE station_id = ?",
        (station_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Station not found")

    station = dict(row)

    metrics = ["bikes", "classic", "ebikes", "docks"]
    probabilities = {}
    stress_scores = {}
    distributions = {}

    for metric in metrics:
        probabilities[metric] = get_availability_probability(
            conn, station_id, day, time, metric  # type: ignore[arg-type]
        )
        stress_scores[metric] = get_stress_score(
            conn, station_id, day, time, metric  # type: ignore[arg-type]
        )
        distributions[metric] = get_stability_metrics(
            conn, station_id, day, time, metric  # type: ignore[arg-type]
        )

    # Nearby stations (3 closest by Euclidean distance — good enough for NYC)
    nearby = conn.execute(
        """
        SELECT station_id, station_name, lat, lng,
               ((lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)) AS dist_sq
        FROM stations
        WHERE station_id != ?
        ORDER BY dist_sq
        LIMIT 3
        """,
        (station["lat"], station["lat"], station["lng"], station["lng"], station_id),
    ).fetchall()

    return {
        **station,
        "probabilities": probabilities,
        "stress_scores": stress_scores,
        "distributions": distributions,
        "nearby_stations": [dict(r) for r in nearby],
    }
