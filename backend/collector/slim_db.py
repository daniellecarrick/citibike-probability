"""
Builds a slim copy of the database for a frozen dataset: stations,
station_slot_rollup and station_range only — everything the deployed app reads —
without the multi-GB station_snapshots table or its indexes.

    python -m collector.slim_db --dest /data/citibike-slim.db

The source database is opened read-only and never modified. Refuses to run
unless station_range has been built (python -m collector.station_ranges),
since the station side panel needs it once the raw snapshots are gone. It does
not delete or swap anything: after verifying the slim file, point DB_PATH at it
(or move it into place) yourself.

Copying into a fresh file, rather than DROP TABLE + VACUUM on the original,
avoids VACUUM's need for free disk roughly equal to the whole database.
"""
import argparse
import os
import sqlite3
import sys
from pathlib import Path

KEEP_TABLES = ("stations", "station_slot_rollup", "station_range")


def _quote_path(path: Path) -> str:
    return path.resolve().as_uri()


def build_slim_db(src: Path, dest: Path) -> dict:
    if dest.exists():
        raise FileExistsError(f"{dest} already exists; refusing to overwrite")

    dest_conn = sqlite3.connect(f"{_quote_path(dest)}?mode=rwc", uri=True)
    try:
        dest_conn.execute("ATTACH DATABASE ? AS src", (f"{_quote_path(src)}?mode=ro",))

        existing = {r[0] for r in dest_conn.execute("SELECT name FROM src.sqlite_master WHERE type = 'table'")}
        missing = [t for t in KEEP_TABLES if t not in existing]
        if missing:
            raise RuntimeError(
                f"Source is missing {', '.join(missing)}. "
                "Build station_range first: python -m collector.station_ranges"
            )
        for table in ("station_slot_rollup", "station_range", "stations"):
            if dest_conn.execute(f"SELECT 1 FROM src.{table} LIMIT 1").fetchone() is None:
                raise RuntimeError(f"Source table {table} is empty; refusing to build a slim copy")

        for table in KEEP_TABLES:
            ddl = dest_conn.execute(
                "SELECT sql FROM src.sqlite_master WHERE type = 'table' AND name = ?", (table,)
            ).fetchone()[0]
            dest_conn.execute(ddl)
            dest_conn.execute(f"INSERT INTO main.{table} SELECT * FROM src.{table}")
            for (index_sql,) in dest_conn.execute(
                "SELECT sql FROM src.sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL",
                (table,),
            ).fetchall():
                dest_conn.execute(index_sql)
            dest_conn.commit()

        counts = {}
        for table in KEEP_TABLES:
            copied = dest_conn.execute(f"SELECT COUNT(*) FROM main.{table}").fetchone()[0]
            original = dest_conn.execute(f"SELECT COUNT(*) FROM src.{table}").fetchone()[0]
            if copied != original:
                raise RuntimeError(f"{table}: copied {copied:,} rows but source has {original:,}")
            counts[table] = copied

        dest_conn.execute("DETACH DATABASE src")
        integrity = dest_conn.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"Integrity check failed: {integrity}")
    except Exception:
        dest_conn.close()
        dest.unlink(missing_ok=True)  # don't leave a half-built file behind
        raise
    dest_conn.close()
    return {"counts": counts, "bytes": dest.stat().st_size}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Copy only what the frozen app reads into a new, small database file.")
    parser.add_argument("--src", type=Path, default=os.environ.get("DB_PATH"), help="Source database (default: $DB_PATH)")
    parser.add_argument("--dest", type=Path, required=True, help="New database file to create")
    args = parser.parse_args()
    if not args.src:
        parser.error("--src or $DB_PATH is required")
    result = build_slim_db(Path(args.src), args.dest)
    for table, n in result["counts"].items():
        print(f"{table}: {n:,} rows")
    print(f"Wrote {args.dest} ({result['bytes'] / 1_048_576:,.0f} MB). The source was not modified.")
    sys.exit(0)
