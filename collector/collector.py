"""
Citi Bike GBFS polling service.
Polls station_status every 5 minutes and writes snapshots to SQLite.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx

from database import get_connection, init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [collector] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)

STATION_INFO_URL = "https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_information.json"
STATION_STATUS_URL = "https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_status.json"
POLL_INTERVAL_SECONDS = 300  # 5 minutes
STATION_REFRESH_INTERVAL = 86400  # refresh station metadata daily


def _parse_ebikes(station: dict) -> int:
    """Handle both flat num_ebikes_available and GBFS 2.x vehicle_types_available."""
    if "num_ebikes_available" in station:
        return int(station["num_ebikes_available"])
    for vt in station.get("vehicle_types_available", []):
        # Citi Bike e-bike vehicle_type_id is typically "2" or contains "electric"
        vid = str(vt.get("vehicle_type_id", ""))
        if vid in ("2", "electric") or "electric" in vid.lower():
            return int(vt.get("count", 0))
    return 0


async def refresh_stations(client: httpx.AsyncClient) -> int:
    log.info("Refreshing station metadata...")
    resp = await client.get(STATION_INFO_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    stations = data["data"]["stations"]

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
                    "capacity": s.get("capacity"),
                }
                for s in stations
            ],
        )
    conn.close()
    log.info(f"Upserted {len(stations)} stations")
    return len(stations)


async def poll_status(client: httpx.AsyncClient) -> int:
    resp = await client.get(STATION_STATUS_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    stations = data["data"]["stations"]
    now = int(time.time())

    rows = []
    for s in stations:
        if not s.get("is_installed") or not s.get("is_renting"):
            continue
        total_bikes = int(s.get("num_bikes_available", 0))
        ebikes = _parse_ebikes(s)
        classic = max(0, total_bikes - ebikes)
        docks = int(s.get("num_docks_available", 0))
        rows.append((now, s["station_id"], total_bikes, classic, ebikes, docks))

    conn = get_connection()
    with conn:
        conn.executemany(
            """
            INSERT INTO station_snapshots
                (timestamp, station_id, available_bikes,
                 available_classic_bikes, available_ebikes, available_docks,
                 is_seeded)
            VALUES (?, ?, ?, ?, ?, ?, 0)
            """,
            rows,
        )
    conn.close()

    ts = datetime.fromtimestamp(now, tz=timezone.utc).strftime("%H:%M:%S UTC")
    log.info(f"Stored {len(rows)} snapshots at {ts}")
    return len(rows)


async def run() -> None:
    init_db()
    log.info("Database initialized")

    last_station_refresh = 0

    async with httpx.AsyncClient() as client:
        while True:
            loop_start = time.monotonic()

            try:
                # Refresh station metadata daily
                if time.time() - last_station_refresh > STATION_REFRESH_INTERVAL:
                    await refresh_stations(client)
                    last_station_refresh = time.time()

                await poll_status(client)

            except httpx.HTTPError as exc:
                log.error(f"HTTP error during poll: {exc}")
            except Exception as exc:
                log.exception(f"Unexpected error during poll: {exc}")

            elapsed = time.monotonic() - loop_start
            sleep_for = max(0, POLL_INTERVAL_SECONDS - elapsed)
            log.debug(f"Sleeping {sleep_for:.1f}s until next poll")
            await asyncio.sleep(sleep_for)


if __name__ == "__main__":
    asyncio.run(run())
