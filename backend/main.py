import os
import sqlite3
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import admin, commute, map, stations

app = FastAPI(title="Citi Bike Probability API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(stations.router)
app.include_router(map.router)
app.include_router(commute.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    db_path = os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "data" / "citibike.db"))
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT COUNT(*) AS total, MAX(timestamp) AS latest FROM station_snapshots"
        ).fetchone()
        conn.close()
        return {
            "status": "ok",
            "snapshot_count": row["total"],
            "latest_timestamp": row["latest"],
        }
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}
