#!/bin/sh

# Ensure the data directory exists (volume may not be mounted yet on first boot)
mkdir -p /data

# Run collector in background — a crash here must not prevent the backend from starting
python3 /app/collector/collector.py &

# Run backend in foreground — Railway routes traffic here via $PORT
cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
