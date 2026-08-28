import asyncio
import logging
import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from collector.poller import run as run_collector
from routers import admin, commute, map, stations

# Without this, collector.poller's log.info() calls are silently dropped —
# uvicorn configures its own loggers but never touches the root logger, and
# the root's default "last resort" handler only surfaces WARNING and above.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

# Tests set this to "0" — a raw TestClient(app) startup must not spin up a
# background task that hits the live GBFS feed and writes to the real DB_PATH.
RUN_COLLECTOR = os.environ.get("RUN_COLLECTOR", "1") != "0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # run_collector()'s own poll loop already catches and logs every
    # exception per cycle, so this task only ever ends via the cancel below.
    task = asyncio.create_task(run_collector()) if RUN_COLLECTOR else None
    yield
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Citi Bike Probability API", version="1.0.0", lifespan=lifespan)

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
