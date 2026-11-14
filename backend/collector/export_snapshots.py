"""
Exports the raw station_snapshots (real rows only, not the synthetic seed) to
monthly gzipped CSV files plus a manifest, so the data can be archived off the
server (GitHub Releases, Hugging Face, ...) before station_snapshots is dropped
from a frozen dataset.

    python -m collector.export_snapshots --out /data/export
    python -m collector.export_snapshots --verify /data/export

Output directory:
    snapshots_YYYY-MM.csv.gz   one file per UTC month, rows ordered by timestamp
    stations.csv               station id, name, lat, lng, capacity, borough, neighborhood
    manifest.json              per-file row counts + SHA-256, totals, collection dates
    README.md                  dataset card (columns, dates, caveats)

Read-only against the database. Standard library only, streamed row by row, so
memory stays flat however large the table is. `--verify` re-reads every file
and checks it against the manifest (row counts and checksums).
"""
import argparse
import csv
import gzip
import hashlib
import io
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

COLUMNS = [
    "timestamp", "station_id", "available_bikes", "available_classic_bikes",
    "available_ebikes", "available_docks",
]
STATION_COLUMNS = ["station_id", "station_name", "lat", "lng", "capacity", "borough", "neighborhood"]

_ROWS_QUERY = f"""
    SELECT {', '.join(COLUMNS)}
    FROM station_snapshots
    WHERE is_seeded = 0 AND timestamp >= ? AND timestamp < ?
    ORDER BY timestamp
"""


def _month_starts(first_ts: int, last_ts: int) -> list[int]:
    """UTC month boundaries covering [first_ts, last_ts], as epoch seconds,
    including the boundary just after the last month."""
    first = datetime.fromtimestamp(first_ts, tz=timezone.utc)
    year, month = first.year, first.month
    bounds = []
    while True:
        start = int(datetime(year, month, 1, tzinfo=timezone.utc).timestamp())
        bounds.append(start)
        if start > last_ts:
            return bounds
        month += 1
        if month == 13:
            year, month = year + 1, 1


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def export_snapshots(conn: sqlite3.Connection, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    first_ts, last_ts = conn.execute(
        "SELECT MIN(timestamp), MAX(timestamp) FROM station_snapshots WHERE is_seeded = 0"
    ).fetchone()
    if first_ts is None:
        raise RuntimeError("No real (non-seeded) snapshots to export")

    files = []
    total = 0
    bounds = _month_starts(first_ts, last_ts)
    for lo, hi in zip(bounds, bounds[1:]):
        name = f"snapshots_{datetime.fromtimestamp(lo, tz=timezone.utc):%Y-%m}.csv.gz"
        path = out_dir / name
        rows = 0
        # mtime=0 keeps the gzip bytes (and so the checksum) reproducible.
        with open(path, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as gz:
            text = io.TextIOWrapper(gz, encoding="utf-8", newline="")
            writer = csv.writer(text)
            writer.writerow(COLUMNS)
            for row in conn.execute(_ROWS_QUERY, (lo, hi)):
                writer.writerow(tuple(row))
                rows += 1
            text.flush()
            text.detach()
        if rows == 0:
            path.unlink()
            continue
        total += rows
        files.append({"name": name, "rows": rows, "sha256": _sha256(path), "bytes": path.stat().st_size})
        print(f"{name}: {rows:,} rows", flush=True)

    stations_path = out_dir / "stations.csv"
    with open(stations_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(STATION_COLUMNS)
        writer.writerows(tuple(r) for r in conn.execute(
            f"SELECT {', '.join(STATION_COLUMNS)} FROM stations ORDER BY station_id"
        ))

    expected = conn.execute("SELECT COUNT(*) FROM station_snapshots WHERE is_seeded = 0").fetchone()[0]
    if expected != total:
        raise RuntimeError(f"Exported {total:,} rows but the table has {expected:,} real rows")

    manifest = {
        "columns": COLUMNS,
        "total_rows": total,
        "first_snapshot_utc": _iso(first_ts),
        "last_snapshot_utc": _iso(last_ts),
        "first_snapshot_ts": first_ts,
        "last_snapshot_ts": last_ts,
        "files": files,
        "stations_file": {"name": "stations.csv", "sha256": _sha256(stations_path)},
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (out_dir / "README.md").write_text(_readme(manifest))
    print(f"Done: {total:,} rows in {len(files)} files -> {out_dir}")
    return manifest


def verify_export(out_dir: Path) -> None:
    """Re-reads every exported file and checks it against manifest.json.
    Raises on the first mismatch."""
    manifest = json.loads((out_dir / "manifest.json").read_text())
    counted = 0
    for entry in manifest["files"]:
        path = out_dir / entry["name"]
        if _sha256(path) != entry["sha256"]:
            raise RuntimeError(f"{entry['name']}: checksum mismatch")
        with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            if next(reader) != manifest["columns"]:
                raise RuntimeError(f"{entry['name']}: unexpected header")
            rows = sum(1 for _ in reader)
        if rows != entry["rows"]:
            raise RuntimeError(f"{entry['name']}: {rows:,} rows, manifest says {entry['rows']:,}")
        counted += rows
    if counted != manifest["total_rows"]:
        raise RuntimeError(f"Total {counted:,} rows, manifest says {manifest['total_rows']:,}")
    if _sha256(out_dir / manifest["stations_file"]["name"]) != manifest["stations_file"]["sha256"]:
        raise RuntimeError("stations.csv: checksum mismatch")
    print(f"Verified OK: {counted:,} rows across {len(manifest['files'])} files")


def _readme(manifest: dict) -> str:
    return f"""# Citi Bike station availability snapshots

Raw station-status snapshots collected from Citi Bike's public GBFS feed
(`station_status.json`), polled about every 5 minutes.

- **Collected:** {manifest['first_snapshot_utc']} to {manifest['last_snapshot_utc']}
- **Rows:** {manifest['total_rows']:,}
- **Collection stopped** on the last date above to avoid ongoing hosting costs.
- Synthetic seed data used to bootstrap the app is **not** included.

## Files

- `snapshots_YYYY-MM.csv.gz`: one file per UTC month, gzipped CSV, ordered by `timestamp`.
- `stations.csv`: station metadata (name, location, capacity, borough, neighborhood).
- `manifest.json`: row counts and SHA-256 checksums for every file.

## Columns (snapshots)

| column | meaning |
|---|---|
| `timestamp` | Unix time (UTC seconds) when the poll was stored |
| `station_id` | Citi Bike station id (join to `stations.csv`) |
| `available_bikes` | all bikes available (classic + e-bikes) |
| `available_classic_bikes` | classic bikes available |
| `available_ebikes` | e-bikes available |
| `available_docks` | open docks available |

Only stations that were installed and renting at poll time are recorded, so a
station can be missing from a poll. Day-of-week and time-of-day analysis in the
original app uses America/New_York local time.

## Source and terms

Data comes from Citi Bike's public GBFS feed. Check Citi Bike's data license
terms before redistributing or building on it.
"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export raw station snapshots to monthly gzipped CSVs.")
    parser.add_argument("--out", type=Path, help="Directory to write the export into")
    parser.add_argument("--verify", type=Path, help="Verify an existing export directory against its manifest")
    parser.add_argument("--db", default=os.environ.get("DB_PATH"), help="SQLite database (default: $DB_PATH)")
    args = parser.parse_args()

    if args.verify:
        verify_export(args.verify)
        sys.exit(0)
    if not args.out or not args.db:
        parser.error("--out and a database (--db or $DB_PATH) are required")
    # Read-only: this script must never modify the live database.
    connection = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    try:
        export_snapshots(connection, args.out)
    finally:
        connection.close()
