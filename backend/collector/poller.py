"""
Citi Bike GBFS polling + rollup maintenance, scheduled with APScheduler.
Started as a background asyncio task from backend/main.py's lifespan.

Jobs, each independently scheduled (max_instances=1 so a slow run can't
overlap itself, coalesce=True so a missed tick catches up once instead of
firing a backlog):
  - poll (5 min):        fetch live GBFS status, append station_snapshots
  - station_refresh (1h): refresh station metadata + geocode new stations
  - rollup_incremental (1h): advance station_slot_rollup's 90-day window by
    one interval — touches only newly-arrived + newly-aged-out data, not
    the whole table (see collector/rollup.py)
  - rollup_full_rebuild (24h): full from-scratch recompute, as a
    correctness safety net under the incremental updates

Both rollup jobs also force-refresh every (day, metric) bulk-endpoint cache
entry afterward, so /api/map/bulk requests never pay for a live recompute
except the very first time a combination is ever requested.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from analytics.probability import refresh_bulk_day_probabilities
from collector.database import get_connection, init_db
from collector.geocode import geocode_missing_stations
from collector.rollup import incremental_update, rebuild_rollup

log = logging.getLogger(__name__)

STATION_INFO_URL = "https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_information.json"
STATION_STATUS_URL = "https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_status.json"
POLL_INTERVAL_SECONDS = 300  # 5 minutes
STATION_REFRESH_INTERVAL = 3600  # refresh station metadata hourly
ROLLUP_INCREMENTAL_INTERVAL = 3600  # advance the rollup window hourly
ROLLUP_FULL_REBUILD_INTERVAL = 86400  # full correctness-pass rebuild daily
BULK_METRICS = ("bikes", "classic", "ebikes", "docks")

# Timestamp incremental_update() should advance from. Set once by the
# startup bootstrap rebuild, then kept current by every incremental tick —
# a plain module global is fine here since this whole module represents one
# single background task in one process, same as the rest of this file.
_last_rollup_update_ts: Optional[float] = None


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


async def poll_status(client: httpx.AsyncClient) -> tuple[int, int]:
    """Returns (saved, skipped) — skipped counts snapshots for station_ids
    not yet in the stations table, which the caller uses to decide whether
    to refresh station metadata early."""
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
            INSERT OR IGNORE INTO station_snapshots
                (timestamp, station_id, available_bikes,
                 available_classic_bikes, available_ebikes, available_docks,
                 is_seeded)
            VALUES (?, ?, ?, ?, ?, ?, 0)
            """,
            rows,
        )
        saved = conn.execute(
            "SELECT COUNT(*) FROM station_snapshots WHERE timestamp = ?", (now,)
        ).fetchone()[0]
    conn.close()

    skipped = len(rows) - saved
    ts = datetime.fromtimestamp(now, tz=timezone.utc).strftime("%H:%M:%S UTC")
    log.info(f"Stored {saved}/{len(rows)} snapshots at {ts}")
    return saved, skipped


async def _refresh_stations_and_geocode(client: httpx.AsyncClient) -> None:
    await refresh_stations(client)
    # Self-heals any newly-added stations; near-zero cost when nothing's new.
    await geocode_missing_stations(client)


async def _poll_job(client: httpx.AsyncClient) -> None:
    try:
        saved, skipped = await poll_status(client)
        if saved == 0 or skipped:
            log.warning(f"Skipped {skipped} snapshots with unknown station_ids — refreshing station metadata now")
            await _refresh_stations_and_geocode(client)
    except httpx.HTTPError as exc:
        log.error(f"HTTP error during poll: {exc}")
    except Exception:
        log.exception("Unexpected error during poll")


async def _station_refresh_job(client: httpx.AsyncClient) -> None:
    try:
        await _refresh_stations_and_geocode(client)
    except httpx.HTTPError as exc:
        log.error(f"HTTP error during station refresh: {exc}")
    except Exception:
        log.exception("Unexpected error during station refresh")


def _refresh_all_bulk_combinations(conn) -> None:
    t0 = time.monotonic()
    for day in range(7):
        for metric in BULK_METRICS:
            refresh_bulk_day_probabilities(conn, day, metric)  # type: ignore[arg-type]
    log.info(f"Refreshed bulk cache for all day/metric combinations in {time.monotonic() - t0:.1f}s")


def _rollup_incremental_job() -> None:
    global _last_rollup_update_ts
    now = time.time()
    conn = get_connection()
    try:
        incremental_update(conn, last_update_ts=int(_last_rollup_update_ts), now_ts=int(now))
        _refresh_all_bulk_combinations(conn)
    except Exception:
        log.exception("Incremental rollup update failed — will retry next tick; daily full rebuild self-heals any drift")
        return
    finally:
        conn.close()
    _last_rollup_update_ts = now


def _rollup_full_rebuild_job() -> None:
    global _last_rollup_update_ts
    conn = get_connection()
    try:
        rebuild_rollup(conn)
        _refresh_all_bulk_combinations(conn)
    finally:
        conn.close()
    _last_rollup_update_ts = time.time()


async def run() -> None:
    global _last_rollup_update_ts
    init_db()
    log.info("Database initialized")

    # Build the rollup once before serving reads rely on it — backend falls
    # back to scanning station_snapshots directly if this hasn't run yet,
    # but that's much slower, so don't leave it to the first scheduled tick.
    # Also establishes the baseline incremental_update() advances from.
    try:
        await asyncio.to_thread(_rollup_full_rebuild_job)
    except Exception:
        log.exception("Initial rollup rebuild failed — backend will use its raw-scan fallback")
        _last_rollup_update_ts = time.time()

    async with httpx.AsyncClient() as client:
        # Backfills every station missing borough/neighborhood — on first
        # deploy that's all of them (a few minutes, one time only).
        try:
            await geocode_missing_stations(client)
        except Exception:
            log.exception("Initial geocoding pass failed — will retry after the next station refresh")

        scheduler = AsyncIOScheduler()
        scheduler.add_job(
            _poll_job, "interval", seconds=POLL_INTERVAL_SECONDS, args=[client],
            id="poll", max_instances=1, coalesce=True,
        )
        scheduler.add_job(
            _station_refresh_job, "interval", seconds=STATION_REFRESH_INTERVAL, args=[client],
            id="station_refresh", max_instances=1, coalesce=True,
        )
        scheduler.add_job(
            _rollup_incremental_job, "interval", seconds=ROLLUP_INCREMENTAL_INTERVAL,
            id="rollup_incremental", max_instances=1, coalesce=True,
        )
        scheduler.add_job(
            _rollup_full_rebuild_job, "interval", seconds=ROLLUP_FULL_REBUILD_INTERVAL,
            id="rollup_full_rebuild", max_instances=1, coalesce=True,
        )
        scheduler.start()

        try:
            await asyncio.Event().wait()  # scheduler runs jobs independently; just keep this task alive
        finally:
            scheduler.shutdown(wait=False)
