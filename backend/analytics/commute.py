"""
Commute success modeling.

P(success) = P(bike available at origin) × P(dock available at destination at arrival)

Travel time is estimated via Haversine distance / average cycling speed.
Structured so a routing API can replace estimate_travel_time() later without
touching the probability logic.
"""
import math
import sqlite3
from typing import Optional

from analytics.probability import get_availability_probability


AVG_CYCLING_SPEED_MPH = 12.0
EARTH_RADIUS_MILES = 3958.8


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(a))


def estimate_travel_time(
    origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float
) -> int:
    """Returns estimated travel time in minutes."""
    dist = haversine_miles(origin_lat, origin_lng, dest_lat, dest_lng)
    minutes = (dist / AVG_CYCLING_SPEED_MPH) * 60
    return max(1, round(minutes))


def _get_station(conn: sqlite3.Connection, station_id: str) -> Optional[dict]:
    row = conn.execute(
        "SELECT station_id, station_name, lat, lng FROM stations WHERE station_id = ?",
        (station_id,),
    ).fetchone()
    return dict(row) if row else None


def get_commute_success(
    conn: sqlite3.Connection,
    origin_id: str,
    dest_id: str,
    day_of_week: int,
    departure_minute: int,
) -> dict:
    """
    departure_minute: minutes since midnight (e.g., 495 = 8:15 AM)
    Returns probabilities and the estimated arrival time.
    """
    origin = _get_station(conn, origin_id)
    dest = _get_station(conn, dest_id)

    if not origin or not dest:
        return {"error": "Station not found"}

    travel_minutes = estimate_travel_time(
        origin["lat"], origin["lng"], dest["lat"], dest["lng"]
    )
    arrival_minute = (departure_minute + travel_minutes) % (24 * 60)

    bike_result = get_availability_probability(conn, origin_id, day_of_week, departure_minute, "bikes")
    dock_result = get_availability_probability(conn, dest_id, day_of_week, arrival_minute, "docks")

    p_bike = bike_result["probability"]
    p_dock = dock_result["probability"]

    if p_bike is not None and p_dock is not None:
        p_success = p_bike * p_dock
    else:
        p_success = None

    departure_h, departure_m = divmod(departure_minute, 60)
    arrival_h, arrival_m = divmod(arrival_minute, 60)

    return {
        "origin": {"id": origin_id, "name": origin["station_name"]},
        "destination": {"id": dest_id, "name": dest["station_name"]},
        "day_of_week": day_of_week,
        "departure_time": f"{departure_h:02d}:{departure_m:02d}",
        "arrival_time": f"{arrival_h:02d}:{arrival_m:02d}",
        "travel_minutes": travel_minutes,
        "bike_probability": p_bike,
        "dock_probability": p_dock,
        "success_probability": p_success,
        "bike_sample_count": bike_result["sample_count"],
        "dock_sample_count": dock_result["sample_count"],
    }


def get_recommendations(
    conn: sqlite3.Connection,
    origin_id: str,
    dest_id: str,
    day_of_week: int,
    departure_minute: int,
    window_minutes: int = 60,
    step_minutes: int = 5,
    top_n: int = 5,
) -> list[dict]:
    """
    Sweep departure times ±window_minutes around the requested time.
    Find local maxima of success probability and return top results.
    """
    origin = _get_station(conn, origin_id)
    dest = _get_station(conn, dest_id)
    if not origin or not dest:
        return []

    travel_minutes = estimate_travel_time(
        origin["lat"], origin["lng"], dest["lat"], dest["lng"]
    )

    sweep_range = range(
        departure_minute - window_minutes,
        departure_minute + window_minutes + step_minutes,
        step_minutes,
    )

    scores: list[dict] = []
    for dep in sweep_range:
        dep_clamped = dep % (24 * 60)
        arr = (dep_clamped + travel_minutes) % (24 * 60)

        bike = get_availability_probability(conn, origin_id, day_of_week, dep_clamped, "bikes")
        dock = get_availability_probability(conn, dest_id, day_of_week, arr, "docks")

        p_bike = bike["probability"]
        p_dock = dock["probability"]
        p_success = (p_bike * p_dock) if (p_bike is not None and p_dock is not None) else None

        dep_h, dep_m = divmod(dep_clamped, 60)
        arr_h, arr_m = divmod(arr, 60)
        offset = dep - departure_minute

        scores.append({
            "departure_minute": dep_clamped,
            "departure_time": f"{dep_h:02d}:{dep_m:02d}",
            "arrival_time": f"{arr_h:02d}:{arr_m:02d}",
            "offset_minutes": offset,
            "success_probability": p_success,
            "bike_probability": p_bike,
            "dock_probability": p_dock,
        })

    # Find local maxima (score > both neighbors)
    local_maxima = []
    for i, s in enumerate(scores):
        if s["success_probability"] is None:
            continue
        prev_p = scores[i - 1]["success_probability"] if i > 0 else -1
        next_p = scores[i + 1]["success_probability"] if i < len(scores) - 1 else -1
        if (prev_p is None or s["success_probability"] >= prev_p) and \
           (next_p is None or s["success_probability"] >= next_p):
            local_maxima.append(s)

    # Sort by probability descending, return top N (excluding exact match if covered by maxima)
    local_maxima.sort(key=lambda x: x["success_probability"] or 0, reverse=True)
    return local_maxima[:top_n]
