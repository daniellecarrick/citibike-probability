import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from analytics.commute import (
    get_commute_availability_series,
    get_commute_matrix,
    get_commute_success,
    get_recommendations,
)
from database import get_db

router = APIRouter(prefix="/api/commute", tags=["commute"])

DayParam = Annotated[int, Query(ge=0, le=6, description="Day of week: 0=Mon … 6=Sun")]
TimeParam = Annotated[int, Query(ge=0, le=1439, description="Departure time in minutes since midnight")]
BikeTypeParam = Annotated[
    Literal["any", "ebike"],
    Query(description="Restrict origin bike availability to e-bikes only, or count all bike types"),
]


@router.get("/success")
def commute_success(
    origin: str = Query(..., description="Origin station ID"),
    destination: str = Query(..., description="Destination station ID"),
    day: DayParam = 0,
    departure_time: TimeParam = 480,
    bike_type: BikeTypeParam = "any",
    conn: sqlite3.Connection = Depends(get_db),
):
    return get_commute_success(conn, origin, destination, day, departure_time, bike_type)


@router.get("/recommendations")
def commute_recommendations(
    origin: str = Query(..., description="Origin station ID"),
    destination: str = Query(..., description="Destination station ID"),
    day: DayParam = 0,
    departure_time: TimeParam = 480,
    bike_type: BikeTypeParam = "any",
    conn: sqlite3.Connection = Depends(get_db),
):
    return get_recommendations(conn, origin, destination, day, departure_time, bike_type=bike_type)


@router.get("/matrix")
def commute_matrix(
    origin: str = Query(..., description="Origin station ID"),
    destination: str = Query(..., description="Destination station ID"),
    bucket_minutes: int = Query(30, ge=5, le=60, description="Time-of-day bucket width in minutes"),
    bike_type: BikeTypeParam = "any",
    conn: sqlite3.Connection = Depends(get_db),
):
    return get_commute_matrix(conn, origin, destination, bucket_minutes, bike_type=bike_type)


@router.get("/availability-series")
def commute_availability_series(
    origin: str = Query(..., description="Origin station ID"),
    destination: str = Query(..., description="Destination station ID"),
    day: DayParam = 0,
    bike_type: BikeTypeParam = "any",
    conn: sqlite3.Connection = Depends(get_db),
):
    return get_commute_availability_series(conn, origin, destination, day, bike_type)
