FROM python:3.11-slim

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

ENV DB_PATH=/data/citibike.db

CMD ["sh", "-c", "mkdir -p /data && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
