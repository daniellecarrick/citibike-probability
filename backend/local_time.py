"""
Shared New York local-time bucketing.

Every day-of-week / time-of-day bucket in the app is meant to be read in the
rider's clock time (America/New_York), not UTC — the UI sends "8:00 AM" and
means 8am Eastern. Snapshots are stored as UTC epoch seconds, so bucketing
SQL first shifts the timestamp by the UTC offset in effect at that instant
(-4h during daylight time, -5h otherwise) and then does the usual
`% 86400` / `% 604800` arithmetic on the shifted value.

The offset is inlined as a CASE over precomputed DST transitions instead of
a registered SQLite function, so it works on any connection (API, collector,
tests) without setup, and has no tz database dependency. US rules since 2007:
DST starts the second Sunday of March at 2:00 local (07:00 UTC) and ends the
first Sunday of November at 2:00 local (06:00 UTC).

Durable rollup rows keep whatever bucketing was in force when they were
built, so changing anything here requires a full rebuild_rollup().
"""
from datetime import datetime, timedelta, timezone

EST_OFFSET_SECONDS = -5 * 3600
EDT_OFFSET_SECONDS = -4 * 3600

FIRST_YEAR = 2020
LAST_YEAR = 2050  # covers the whole plausible life of the dataset


def _nth_sunday(year: int, month: int, n: int) -> datetime:
    first = datetime(year, month, 1, tzinfo=timezone.utc)
    first_sunday = first + timedelta(days=(6 - first.weekday()) % 7)
    return first_sunday + timedelta(weeks=n - 1)


def dst_ranges() -> list[tuple[int, int]]:
    """[(dst_start_utc, dst_end_utc), ...] epoch seconds; DST applies to [start, end)."""
    ranges = []
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        start = _nth_sunday(year, 3, 2).replace(hour=7)
        end = _nth_sunday(year, 11, 1).replace(hour=6)
        ranges.append((int(start.timestamp()), int(end.timestamp())))
    return ranges


def utc_offset_seconds(ts: int) -> int:
    for start, end in dst_ranges():
        if start <= ts < end:
            return EDT_OFFSET_SECONDS
    return EST_OFFSET_SECONDS


def to_local_ts(ts: int) -> int:
    """UTC epoch seconds -> "local epoch" seconds (same instant, shifted so
    that % 86400 is the New York time of day and % 604800 the New York day
    of week). Python twin of local_ts_sql()."""
    return ts + utc_offset_seconds(ts)


def local_ts_sql(column: str = "timestamp") -> str:
    """SQL expression equivalent to to_local_ts(column)."""
    whens = " ".join(
        f"WHEN {column} >= {start} AND {column} < {end} THEN {EDT_OFFSET_SECONDS}"
        for start, end in dst_ranges()
    )
    return f"({column} + CASE {whens} ELSE {EST_OFFSET_SECONDS} END)"


# Ready-made expressions for the two column spellings the queries use.
LOCAL_TS = local_ts_sql("timestamp")
LOCAL_TS_SS = local_ts_sql("ss.timestamp")
