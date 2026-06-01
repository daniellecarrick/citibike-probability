#!/bin/sh
set -e

# Run collector in background — polls every 5 min and writes to $DB_PATH
python3 /app/collector/collector.py &

# Run backend in foreground — if it exits the container exits and Railway restarts
cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
