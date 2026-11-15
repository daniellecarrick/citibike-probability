FROM python:3.11-slim

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

ENV DB_PATH=/data/citibike.db

# Frozen dataset: collection was stopped to avoid ongoing hosting costs, so the
# deployed app serves the last station_slot_rollup as-is.
#   RUN_COLLECTOR=0  -> no GBFS polling, no rollup rebuilds, no startup scan
#   DATA_END_TS      -> last snapshot collected (Unix UTC); any query that still
#                       looks back "90 days" counts from here instead of today,
#                       so results don't age out of an empty window.
# Remove both to resume live collection.
ENV RUN_COLLECTOR=0
ENV DATA_END_TS=1794747487

CMD ["sh", "-c", "mkdir -p /data && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
