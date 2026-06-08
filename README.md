# Citi Bike Probability Explorer

A full-stack web application that predicts the probability of successfully completing a Citi Bike commute based on historical station availability data.

## What it does

The app answers questions like:

- What are my chances of finding a bike at a given station at 8:15 AM on Thursdays?
- What are my chances of finding an e-bike specifically?
- What are my chances of finding an open dock when I arrive at my destination?
- What is the overall probability that my commute succeeds end-to-end?
- What time should I leave to maximize my chances?

It pulls live data from the Citi Bike GBFS feed every 5 minutes and builds up a historical record. Over time, the app learns the availability patterns at each station and surfaces probabilities, stress scores, and recommendations based on that history.

---

## Features

- **Station probability map** — All 2,400+ NYC Citi Bike stations shown as circles. Color and size reflect the probability of finding a bike (or dock) at the selected time. Pink = low probability, blue = high.
- **Heat surface** — A smooth interpolated probability layer across the city, showing availability gradients between stations.
- **Time animation** — Scrub or play through any day of the week to watch how availability patterns shift from overnight through morning rush, midday, and evening rush.
- **Station detail panel** — Click any station to see bike, classic bike, e-bike, and dock probabilities; a stress score; inventory distribution chart; and nearby alternatives.
- **Commute planner** — Enter an origin and destination to get your end-to-end commute success probability and alternative departure time recommendations.

---

## Architecture

Three independent services:

```
citibike-probability/
├── collector/      # Polls the Citi Bike GBFS feed every 5 minutes
├── backend/        # FastAPI — probability analytics and REST API
├── frontend/       # React + TypeScript + Mapbox GL
└── data/
    └── citibike.db # Shared SQLite database
```

The collector and backend share the same SQLite file. The collector writes; the backend reads. SQLite WAL mode allows both to run concurrently without blocking.

---

## Prerequisites

- Python 3.9+
- Node.js 18+
- A Mapbox account (free tier is sufficient)

---

## API Tokens

### Mapbox

The map requires a Mapbox public access token.

1. Go to [mapbox.com](https://www.mapbox.com) and create a free account
2. From your account dashboard, copy the **Default public token** (starts with `pk.`)
3. You'll paste this into `frontend/.env` in the setup steps below

---

## Setup

### 1. Install Python dependencies

```bash
pip install -r collector/requirements.txt
pip install -r backend/requirements.txt
```

### 2. Seed the database with historical mock data

The app needs historical data to calculate probabilities. This command generates 90 days of synthetic data using real station locations and realistic demand patterns (morning rush, evening rush, weekends). It takes about 6 minutes to run.

```bash
python3 collector/seed.py --days 90
```

To re-seed from scratch at any point:

```bash
python3 collector/seed.py --days 90 --clear
```

### 3. Configure the frontend environment

```bash
cp frontend/.env.example frontend/.env
```

Open `frontend/.env` and add your Mapbox token:

```
VITE_MAPBOX_TOKEN=pk.your_token_here
VITE_API_URL=
```

Leave `VITE_API_URL` blank — Vite's dev server automatically proxies `/api` requests to the backend.

### 4. Install frontend dependencies

```bash
cd frontend
npm install
```

---

## Running locally

You need three processes running: the backend, the data collector, and the frontend. Open three terminal tabs.

**Terminal 1 — Backend API**

```bash
cd backend
DB_PATH=../data/citibike.db python3 -m uvicorn main:app --port 8000 --reload
```

The API will be available at `http://localhost:8000`. You can view the auto-generated docs at `http://localhost:8000/docs`.

**Terminal 2 — Data collector** (optional while developing; required to accumulate real data)

```bash
cd collector
DB_PATH=../data/citibike.db python3 collector.py
```

This polls the live Citi Bike feed every 5 minutes and appends to the database. Leave it running in the background to build up real historical data over time. Probabilities become meaningful after 2–3 weeks of collection and reliable after 4–8 weeks.

**Terminal 3 — Frontend**

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Data source

Live data comes from the Citi Bike GBFS feed (hosted by Lyft):

- Station metadata (name, location, capacity): `https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_information.json`
- Station status (available bikes, e-bikes, docks): `https://gbfs.lyft.com/gbfs/2.3/bkn/en/station_status.json`

The status feed updates every minute. The collector polls it every 5 minutes.

---

## Verifying data collection

There are three ways to confirm the collector is running and data is being saved.

**Admin page** (requires backend + frontend running)

Click **Admin** in the top-right of the header. The admin page shows a timestamped log of every poll cycle, a coverage heatmap of all 2,016 five-minute windows in the week, and summary stats including the most recent poll time and total row count.

**Health endpoint** (requires backend running)

Open in a browser or run with curl:

```
http://localhost:8000/api/health
```

Returns the total snapshot count and the timestamp of the most recent poll. Refresh it a few minutes apart to confirm the count is growing.

**Direct SQLite query** (no services required)

```bash
sqlite3 data/citibike.db "SELECT datetime(timestamp,'unixepoch','localtime') AS time, COUNT(*) AS stations FROM station_snapshots GROUP BY (timestamp/300)*300 ORDER BY timestamp DESC LIMIT 10;"
```

Shows the 10 most recent polls with a timestamp and station count. A complete poll captures all ~2,400 active stations. This works even when the backend and frontend are not running.

---

## API endpoints

The backend exposes a REST API. Interactive docs are available at `/docs` on the backend URL.

**Health**
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | DB status, snapshot count, latest poll timestamp |

**Stations**
| Method | Path | Query params | Description |
|---|---|---|---|
| GET | `/api/stations` | — | List all stations |
| GET | `/api/stations/{id}` | — | Single station metadata |
| GET | `/api/stations/{id}/detail` | `day`, `time` | Full detail: probabilities, distributions, stress score, nearby stations |

**Map**
| Method | Path | Query params | Description |
|---|---|---|---|
| GET | `/api/map` | `day`, `time`, `metric` | Probability snapshot for all stations (used to render the map) |
| GET | `/api/map/bulk` | `day`, `metric` | All 288 time slots for a day in one response (used for time animation) |

**Commute**
| Method | Path | Query params | Description |
|---|---|---|---|
| GET | `/api/commute/success` | `origin`, `destination`, `day`, `departure_time` | End-to-end commute success probability |
| GET | `/api/commute/recommendations` | `origin`, `destination`, `day`, `departure_time` | Ranked list of departure times by success probability |

**Admin**
| Method | Path | Query params | Description |
|---|---|---|---|
| GET | `/api/admin/summary` | — | Collection stats: real vs seeded rows, polls last 24h |
| GET | `/api/admin/polls` | `limit` | Recent poll log |
| GET | `/api/admin/coverage` | — | Per-slot coverage data for the heatmap |

---

## Docker (optional)

To run all three services together:

```bash
cp .env.example .env  # add your MAPBOX_TOKEN
docker compose up
```

---

## Tech stack

| Layer | Technologies |
|---|---|
| Data collection | Python, httpx, asyncio |
| Database | SQLite (WAL mode) |
| Backend | Python, FastAPI, uvicorn |
| Frontend | React, TypeScript, Vite, Zustand |
| Map | Mapbox GL JS |
| Charts | D3 |
| Spatial interpolation | Inverse Distance Weighting (IDW), Web Worker |
