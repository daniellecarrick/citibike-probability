import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from analytics.probability import EPOCH_MONDAY_OFFSET, SECONDS_PER_DAY, SECONDS_PER_WEEK
from database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Slot 0 of (timestamp % SECONDS_PER_WEEK) / 300 lands on Thursday 00:00
# (because Unix epoch was a Thursday). Shift so slot 0 = Monday 00:00.
SLOTS_PER_WEEK = 2016          # 7 days × 288 slots
SLOTS_PER_DAY = 288            # 24 h × 12 slots
MONDAY_SLOT_OFFSET = EPOCH_MONDAY_OFFSET // 300  # 1152

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _slot_to_day_time(raw_slot: int) -> tuple[int, int]:
    """Convert raw (timestamp % week) / 300 slot to (day_of_week 0=Mon, minutes_since_midnight)."""
    adjusted = (raw_slot - MONDAY_SLOT_OFFSET + SLOTS_PER_WEEK) % SLOTS_PER_WEEK
    day = adjusted // SLOTS_PER_DAY
    minutes = (adjusted % SLOTS_PER_DAY) * 5
    return day, minutes


@router.get("/summary")
def get_summary(conn: sqlite3.Connection = Depends(get_db)):
    """High-level collection health stats."""
    row = conn.execute("""
        SELECT
            COUNT(*)                          AS total_rows,
            COUNT(DISTINCT timestamp)         AS total_polls,
            MIN(timestamp)                    AS first_ts,
            MAX(timestamp)                    AS last_ts,
            COUNT(DISTINCT station_id)        AS station_count
        FROM station_snapshots
    """).fetchone()

    # Rows from the last 24 hours = "live" indicator
    since_24h = int(datetime.now(timezone.utc).timestamp()) - 86400
    live_row = conn.execute(
        "SELECT COUNT(DISTINCT timestamp) AS recent_polls FROM station_snapshots WHERE timestamp >= ?",
        (since_24h,),
    ).fetchone()

    first_dt = datetime.fromtimestamp(row["first_ts"], tz=timezone.utc).isoformat() if row["first_ts"] else None
    last_dt = datetime.fromtimestamp(row["last_ts"], tz=timezone.utc).isoformat() if row["last_ts"] else None

    span_days = ((row["last_ts"] or 0) - (row["first_ts"] or 0)) / SECONDS_PER_DAY if row["first_ts"] else 0

    return {
        "total_rows": row["total_rows"],
        "total_polls": row["total_polls"],
        "station_count": row["station_count"],
        "first_poll": first_dt,
        "last_poll": last_dt,
        "span_days": round(span_days, 1),
        "polls_last_24h": live_row["recent_polls"],
        "expected_polls_per_day": 288,
    }


@router.get("/polls")
def get_polls(
    limit: int = Query(default=100, le=500),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Most recent polls — one row per 5-minute collection cycle."""
    rows = conn.execute(
        """
        SELECT
            (timestamp / 300) * 300  AS poll_ts,
            COUNT(*)                 AS station_count
        FROM station_snapshots
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
            "complete": r["station_count"] >= 2300,  # ~2410 active; flag if significantly fewer
        })

    return result


@router.get("/coverage")
def get_coverage(conn: sqlite3.Connection = Depends(get_db)):
    """
    For every 5-minute window in the week (2016 slots total), return:
    - how many distinct polls have been recorded
    - average e-bike probability across all stations
    - average bike probability

    The slot index maps to (day_of_week, time_of_day) so the frontend
    can render a 7×288 coverage heatmap.
    """
    rows = conn.execute(f"""
        SELECT
            ((timestamp % {SECONDS_PER_WEEK}) / 300)          AS raw_slot,
            COUNT(DISTINCT (timestamp / 300) * 300)            AS poll_count,
            AVG(CASE WHEN available_ebikes  >= 1 THEN 1.0 ELSE 0.0 END) AS avg_ebike_prob,
            AVG(CASE WHEN available_bikes   >= 1 THEN 1.0 ELSE 0.0 END) AS avg_bike_prob,
            AVG(CASE WHEN available_docks   >= 1 THEN 1.0 ELSE 0.0 END) AS avg_dock_prob,
            AVG(CAST(available_ebikes AS REAL))                AS mean_ebikes
        FROM station_snapshots
        GROUP BY raw_slot
        ORDER BY raw_slot
    """).fetchall()

    result = []
    for r in rows:
        day, minutes = _slot_to_day_time(r["raw_slot"])
        h, m = divmod(minutes, 60)
        result.append({
            "raw_slot": r["raw_slot"],
            "day_of_week": day,
            "day_name": DAY_NAMES[day],
            "time_minutes": minutes,
            "time_label": f"{h:02d}:{m:02d}",
            "poll_count": r["poll_count"],
            "avg_ebike_prob": round(r["avg_ebike_prob"], 3) if r["avg_ebike_prob"] is not None else None,
            "avg_bike_prob": round(r["avg_bike_prob"], 3) if r["avg_bike_prob"] is not None else None,
            "avg_dock_prob": round(r["avg_dock_prob"], 3) if r["avg_dock_prob"] is not None else None,
            "mean_ebikes": round(r["mean_ebikes"], 2) if r["mean_ebikes"] is not None else None,
        })

    return result
