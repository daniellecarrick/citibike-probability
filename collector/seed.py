"""
Mock data seeder for development.

Fetches real station metadata from GBFS, then generates synthetic historical
snapshots with realistic demand patterns so the full UI can be tested before
real data has accumulated.

Usage:
    python seed.py              # generates 90 days of data
    python seed.py --days 30    # generates 30 days
    python seed.py --clear      # removes existing snapshots first
"""
import argparse
import math
import random
import sys
import time
from datetime import datetime, timezone

import httpx

from database import get_connection, init_db

STATION_INFO_URL = "https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_information.json"

# Seconds of week that correspond to Mon 00:00 UTC (Unix epoch was a Thursday,
# so Monday = day index 0 = (4 days back from epoch mod 7) * 86400)
# We use Monday=0 throughout (matching Python's datetime.weekday())
SECONDS_PER_DAY = 86400
SECONDS_PER_WEEK = 604800
POLL_INTERVAL = 300  # 5 minutes


def _demand_curve(seconds_into_day: int, is_weekend: bool, capacity: int) -> tuple[int, int]:
    """
    Return (available_bikes, available_docks) for a moment in the day.
    Models rush-hour demand troughs and overnight recovery.
    """
    h = seconds_into_day / 3600.0  # hour as float (0-24)

    if is_weekend:
        # Gentle midday usage, fuller overnight
        base_bike_frac = (
            0.75
            - 0.25 * math.exp(-((h - 13) ** 2) / 8)  # midday trough
        )
    else:
        # Morning rush drain, evening rush drain
        morning_drain = 0.55 * math.exp(-((h - 8.5) ** 2) / 1.2)
        evening_drain = 0.40 * math.exp(-((h - 18.0) ** 2) / 1.5)
        base_bike_frac = 0.75 - morning_drain - evening_drain

    base_bike_frac = max(0.03, min(0.97, base_bike_frac))

    # Add per-station noise: each station has a mild random offset baked in
    bikes = int(round(capacity * base_bike_frac))
    bikes = max(0, min(capacity, bikes))
    docks = capacity - bikes

    return bikes, docks


def _ebike_fraction(bikes: int) -> int:
    """Roughly 30-40% of available bikes are e-bikes."""
    if bikes == 0:
        return 0
    frac = random.gauss(0.33, 0.08)
    frac = max(0.0, min(1.0, frac))
    return int(round(bikes * frac))


def fetch_stations() -> list[dict]:
    print("Fetching station metadata from GBFS...")
    resp = httpx.get(STATION_INFO_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    stations = data["data"]["stations"]
    print(f"  Found {len(stations)} stations")
    return stations


def upsert_stations(stations: list[dict]) -> None:
    conn = get_connection()
    with conn:
        conn.executemany(
            """
            INSERT INTO stations (station_id, station_name, lat, lng, capacity)
            VALUES (:id, :name, :lat, :lon, :capacity)
            ON CONFLICT(station_id) DO UPDATE SET
                station_name = excluded.station_name,
                lat = excluded.lat,
                lng = excluded.lng,
                capacity = excluded.capacity
            """,
            [
                {
                    "id": s["station_id"],
                    "name": s["name"],
                    "lat": s["lat"],
                    "lon": s["lon"],
                    "capacity": s.get("capacity") or 25,
                }
                for s in stations
            ],
        )
    conn.close()


def generate_snapshots(stations: list[dict], days: int) -> None:
    now = int(time.time())
    start = now - days * SECONDS_PER_DAY
    # Align to poll interval boundary
    start = (start // POLL_INTERVAL) * POLL_INTERVAL

    total_polls = (now - start) // POLL_INTERVAL
    total_rows = total_polls * len(stations)
    print(f"Generating {total_polls} polls × {len(stations)} stations = {total_rows:,} rows...")

    # Per-station random offsets so stations behave differently
    rng_offsets = {s["station_id"]: random.gauss(0, 0.08) for s in stations}

    conn = get_connection()
    batch: list[tuple] = []
    BATCH_SIZE = 50_000

    inserted = 0
    t = start
    poll_count = 0

    while t < now:
        dt = datetime.fromtimestamp(t, tz=timezone.utc)
        is_weekend = dt.weekday() >= 5
        seconds_into_day = dt.hour * 3600 + dt.minute * 60 + dt.second

        for s in stations:
            capacity = s.get("capacity") or 25
            bikes, docks = _demand_curve(seconds_into_day, is_weekend, capacity)

            # Apply per-station offset + Gaussian noise
            offset = rng_offsets[s["station_id"]]
            noise = random.gauss(0, 0.06)
            adjusted_bikes = int(round(bikes + (offset + noise) * capacity))
            adjusted_bikes = max(0, min(capacity, adjusted_bikes))
            adjusted_docks = capacity - adjusted_bikes

            ebikes = _ebike_fraction(adjusted_bikes)
            classic = adjusted_bikes - ebikes

            batch.append((
                t,
                s["station_id"],
                adjusted_bikes,
                classic,
                ebikes,
                adjusted_docks,
            ))

        if len(batch) >= BATCH_SIZE:
            with conn:
                conn.executemany(
                    """
                    INSERT INTO station_snapshots
                        (timestamp, station_id, available_bikes,
                         available_classic_bikes, available_ebikes, available_docks)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    batch,
                )
            inserted += len(batch)
            batch.clear()
            pct = 100 * poll_count / total_polls
            print(f"  {inserted:,} rows inserted ({pct:.1f}%)...", end="\r", flush=True)

        t += POLL_INTERVAL
        poll_count += 1

    # Flush remaining
    if batch:
        with conn:
            conn.executemany(
                """
                INSERT INTO station_snapshots
                    (timestamp, station_id, available_bikes,
                     available_classic_bikes, available_ebikes, available_docks)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                batch,
            )
        inserted += len(batch)

    conn.close()
    print(f"\n  Done. {inserted:,} total rows inserted.")


def clear_snapshots() -> None:
    print("Clearing existing snapshots...")
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM station_snapshots")
    conn.close()
    print("  Done.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed CitiBike mock historical data")
    parser.add_argument("--days", type=int, default=90, help="Days of history to generate (default: 90)")
    parser.add_argument("--clear", action="store_true", help="Clear existing snapshots before seeding")
    args = parser.parse_args()

    init_db()

    if args.clear:
        clear_snapshots()

    stations = fetch_stations()
    upsert_stations(stations)

    t0 = time.time()
    generate_snapshots(stations, args.days)
    elapsed = time.time() - t0
    print(f"Seeding complete in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
