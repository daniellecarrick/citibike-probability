FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt /tmp/backend-req.txt
COPY collector/requirements.txt /tmp/collector-req.txt
RUN pip install --no-cache-dir -r /tmp/backend-req.txt -r /tmp/collector-req.txt

COPY backend/  /app/backend/
COPY collector/ /app/collector/

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV DB_PATH=/data/citibike.db

CMD ["/app/start.sh"]
