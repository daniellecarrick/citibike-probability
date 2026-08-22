"""
Derives borough + neighborhood per station via Mapbox's reverse-geocoding
API, since neither is present in the GBFS station data. Runs once at
collector startup (backfills every existing station, since all start with
borough IS NULL) and again after every hourly station refresh (self-heals
any newly-added stations) — see collector.py.

Results are stored permanently in stations.borough/neighborhood and never
re-geocoded once populated.
"""
import asyncio
import logging
import os
from typing import Optional

import httpx

from database import get_connection

log = logging.getLogger(__name__)

MAPBOX_TOKEN = os.environ.get("MAPBOX_TOKEN")
GEOCODE_URL = "https://api.mapbox.com/search/geocode/v6/reverse"
CONCURRENCY = 5  # stays well under Mapbox's ~600 req/min limit


async def reverse_geocode(client: httpx.AsyncClient, lat: float, lng: float) -> tuple[Optional[str], Optional[str]]:
    """
    Returns (borough, neighborhood), or (None, None) on any failure or
    no-result — never raises, so one bad station can't sink a batch.

    borough = context.locality.name (NYC boroughs, e.g. "Brooklyn") if
    present, else context.place.name (covers NJ stations like Jersey City,
    where Mapbox has no "locality" and reports the city under "place" instead).
    """
    try:
        resp = await client.get(
            GEOCODE_URL,
            params={"longitude": lng, "latitude": lat, "access_token": MAPBOX_TOKEN},
            timeout=10,
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
        if not features:
            return None, None

        ctx = features[0]["properties"].get("context", {})
        locality = ctx.get("locality", {}).get("name")
        place = ctx.get("place", {}).get("name")
        neighborhood = ctx.get("neighborhood", {}).get("name")
        borough = locality or place
        return borough, neighborhood
    except Exception as exc:
        log.warning(f"Reverse geocode failed for ({lat}, {lng}): {exc}")
        return None, None


async def geocode_missing_stations(client: httpx.AsyncClient) -> int:
    """Geocodes every station with borough IS NULL. Returns count updated."""
    if not MAPBOX_TOKEN:
        log.warning("MAPBOX_TOKEN not set — skipping borough/neighborhood geocoding")
        return 0

    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT station_id, lat, lng FROM stations WHERE borough IS NULL"
        ).fetchall()
        if not rows:
            return 0

        log.info(f"Geocoding {len(rows)} station(s) missing borough/neighborhood...")
        sem = asyncio.Semaphore(CONCURRENCY)

        async def geocode_one(row):
            async with sem:
                borough, neighborhood = await reverse_geocode(client, row["lat"], row["lng"])
                return row["station_id"], borough, neighborhood

        results = await asyncio.gather(*(geocode_one(r) for r in rows))
        updates = [(borough, neighborhood, sid) for sid, borough, neighborhood in results if borough]

        with conn:
            conn.executemany(
                "UPDATE stations SET borough = ?, neighborhood = ? WHERE station_id = ?",
                updates,
            )

        log.info(f"Geocoded {len(updates)}/{len(rows)} station(s)")
        return len(updates)
    finally:
        conn.close()
