import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from analytics.probability import EPOCH_MONDAY_OFFSET, SECONDS_PER_DAY, SECONDS_PER_WEEK
from database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])

SLOTS_PER_WEEK = 2016
SLOTS_PER_DAY = 288
MONDAY_SLOT_OFFSET = EPOCH_MONDAY_OFFSET // 300  # 1152

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _slot_to_day_time(raw_slot: int) -> tuple[int, int]:
    adjusted = (raw_slot - MONDAY_SLOT_OFFSET + SLOTS_PER_WEEK) % SLOTS_PER_WEEK
    day = adjusted // SLOTS_PER_DAY
    minutes = (adjusted % SLOTS_PER_DAY) * 5
    return day, minutes


@router.get("/summary")
def get_summary(conn: sqlite3.Connection = Depends(get_db)):
    """
    Collection health stats split into real vs seeded rows.
    The admin page only highlights real data; seeded totals are included
    for context so users understand the full database size.
    """
    # Real (live collector) data only
    real = conn.execute("""
        SELECT
            COUNT(*)                 AS total_rows,
            COUNT(DISTINCT timestamp) AS total_polls,
            MIN(timestamp)           AS first_ts,
            MAX(timestamp)           AS last_ts,
            COUNT(DISTINCT station_id) AS station_count
        FROM station_snapshots
        WHERE is_seeded = 0
    """).fetchone()

    # Seeded totals (for context)
    seeded = conn.execute("""
        SELECT COUNT(*) AS total_rows, COUNT(DISTINCT timestamp) AS total_polls
        FROM station_snapshots WHERE is_seeded = 1
    """).fetchone()

    # Real polls in the last 24 hours
    since_24h = int(datetime.now(timezone.utc).timestamp()) - 86400
    recent = conn.execute(
        "SELECT COUNT(DISTINCT timestamp) AS n FROM station_snapshots WHERE is_seeded = 0 AND timestamp >= ?",
        (since_24h,),
    ).fetchone()

    real_first = datetime.fromtimestamp(real["first_ts"], tz=timezone.utc).isoformat() if real["first_ts"] else None
    real_last  = datetime.fromtimestamp(real["last_ts"],  tz=timezone.utc).isoformat() if real["last_ts"]  else None
    span_days  = ((real["last_ts"] or 0) - (real["first_ts"] or 0)) / SECONDS_PER_DAY if real["first_ts"] else 0

    return {
        # Real data — the numbers shown prominently
        "real_rows":          real["total_rows"],
        "real_polls":         real["total_polls"],
        "real_station_count": real["station_count"],
        "real_first_poll":    real_first,
        "real_last_poll":     real_last,
        "real_span_days":     round(span_days, 1),
        "real_polls_last_24h": recent["n"],
        # Seeded data — shown as context note
        "seeded_rows":        seeded["total_rows"],
        "seeded_polls":       seeded["total_polls"],
        # Constants
        "expected_polls_per_day": 288,
    }


@router.get("/polls")
def get_polls(
    limit: int = Query(default=100, le=500),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Most recent REAL polls only (is_seeded = 0)."""
    rows = conn.execute(
        """
        SELECT
            (timestamp / 300) * 300  AS poll_ts,
            COUNT(*)                 AS station_count
        FROM station_snapshots
        WHERE is_seeded = 0
        GROUP BY poll_ts
        ORDER BY poll_ts DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()

    result = []
    for r in rows:
        ts = r["poll_ts"]
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        result.append({
            "timestamp": ts,
            "datetime_utc": dt.isoformat(),
            "datetime_local": datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M"),
            "station_count": r["station_count"],
            "complete": r["station_count"] >= 2300,
        })

    return result


@router.get("/coverage")
def get_coverage(conn: sqlite3.Connection = Depends(get_db)):
    """
    Per-slot coverage using REAL data only (is_seeded = 0).
    poll_count = how many distinct real collection cycles have hit this window.
    After week 1 most slots will show 1; after week 2, 2; etc.
    """
    rows = conn.execute(f"""
        SELECT
            ((timestamp % {SECONDS_PER_WEEK}) / 300)              AS raw_slot,
            COUNT(DISTINCT (timestamp / 300) * 300)                AS poll_count,
            AVG(CASE WHEN available_ebikes >= 1 THEN 1.0 ELSE 0.0 END) AS avg_ebike_prob,
            AVG(CASE WHEN available_bikes  >= 1 THEN 1.0 ELSE 0.0 END) AS avg_bike_prob,
            AVG(CASE WHEN available_docks  >= 1 THEN 1.0 ELSE 0.0 END) AS avg_dock_prob,
            AVG(CAST(available_ebikes AS REAL))                    AS mean_ebikes
        FROM station_snapshots
        WHERE is_seeded = 0
        GROUP BY raw_slot
        ORDER BY raw_slot
    """).fetchall()

    result = []
    for r in rows:
        day, minutes = _slot_to_day_time(r["raw_slot"])
        h, m = divmod(minutes, 60)
        result.append({
            "raw_slot":      r["raw_slot"],
            "day_of_week":   day,
            "day_name":      DAY_NAMES[day],
            "time_minutes":  minutes,
            "time_label":    f"{h:02d}:{m:02d}",
            "poll_count":    r["poll_count"],
            "avg_ebike_prob": round(r["avg_ebike_prob"], 3) if r["avg_ebike_prob"] is not None else None,
            "avg_bike_prob":  round(r["avg_bike_prob"],  3) if r["avg_bike_prob"]  is not None else None,
            "avg_dock_prob":  round(r["avg_dock_prob"],  3) if r["avg_dock_prob"]  is not None else None,
            "mean_ebikes":    round(r["mean_ebikes"],    2) if r["mean_ebikes"]    is not None else None,
        })

    return result
