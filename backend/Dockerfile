FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Frozen dataset: collection was stopped to avoid ongoing hosting costs, so the
# deployed app serves the last station_slot_rollup as-is.
# Railway's root directory for this service is /backend, so THIS is the
# Dockerfile it builds (the repo-root Dockerfile is not used there).
#   RUN_COLLECTOR=0  -> no GBFS polling, no rollup rebuilds, no startup scan
#   DATA_END_TS      -> last snapshot collected (Unix UTC); any query that still
#                       looks back "90 days" counts from here instead of today.
#                       Set to the final /api/health latest_timestamp after deploy.
# Remove both to resume live collection.
ENV RUN_COLLECTOR=0
ENV DATA_END_TS=1794747487

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
