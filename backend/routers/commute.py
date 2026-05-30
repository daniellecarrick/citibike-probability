import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from analytics.commute import get_commute_success, get_recommendations
from database import get_db

router = APIRouter(prefix="/api/commute", tags=["commute"])

DayParam = Annotated[int, Query(ge=0, le=6, description="Day of week: 0=Mon … 6=Sun")]
TimeParam = Annotated[int, Query(ge=0, le=1439, description="Departure time in minutes since midnight")]


@router.get("/success")
def commute_success(
    origin: str = Query(..., description="Origin station ID"),
    destination: str = Query(..., description="Destination station ID"),
    day: DayParam = 0,
    departure_time: TimeParam = 480,
    conn: sqlite3.Connection = Depends(get_db),
):
    return get_commute_success(conn, origin, destination, day, departure_time)


@router.get("/recommendations")
def commute_recommendations(
    origin: str = Query(..., description="Origin station ID"),
    destination: str = Query(..., description="Destination station ID"),
    day: DayParam = 0,
    departure_time: TimeParam = 480,
    conn: sqlite3.Connection = Depends(get_db),
):
    return get_recommendations(conn, origin, destination, day, departure_time)
