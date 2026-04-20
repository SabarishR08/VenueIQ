# SmartCrowd AI (VenueIQ Lite)

SmartCrowd AI is a lightweight crowd optimization simulator for large sporting venues.
It demonstrates how event organizers can track crowd density, estimate queue times, and guide attendees toward less congested areas.

## Problem Statement
Large events face crowding at gates, food stalls, and exits. This causes delays and poor attendee experience.

## Solution
This project simulates real-time crowd movement on a stadium grid and exposes APIs for:
- crowd simulation updates
- heatmap density data
- queue time prediction
- route/gate suggestions

## Features
- Real-time crowd simulation (150+ moving users)
- Event phase engine: `ENTRY`, `MID_GAME`, `HALFTIME`, `EXIT`
- Mock sensor ingestion via `/ingest` for camera, Wi-Fi, ticket scanner, and staff observations
- Rolling history replay via `/history`
- Replay scrubber and operations event timeline in dashboard
- Attendee-facing route guidance at `/attendee`
- Flash-deal operator controls with live attendee offer sync
- Grid heatmap density visualization
- Queue prediction using `wait_time = crowd_count / capacity_per_minute`
- Trend tracking (`current - previous`) for congestion direction
- Rolling forecast model using recent tick history
- Explainable AI recommendations with savings comparison
- Alerting layer for overload, rising load, and stable flow
- Organizer-focused live dashboard panel

## Architecture
Simulation -> Backend Processing -> Frontend Visualization

Backend modules:
- `simulation.py`: movement + density + zone counts
- `predictor.py`: wait-time and recommendation logic
- `app.py`: Flask APIs

Runtime:
- Source-based Cloud Run build using `gcloud run deploy --source .`
- Startup command defined in `Procfile` (`web: gunicorn backend.app:app`)

## API Endpoints
- `GET /health` - service status
- `POST /ingest` - mock real-world observations from sensors or staff
- `GET /simulate` - user positions after one simulation tick
- `GET /heatmap` - density grid data
- `GET /predict` - zone-wise wait predictions + trends
- `GET /forecast` - 5-minute forecast using rolling trend history
- `GET /history` - recent replay snapshots
- `GET /suggest` - explainable suggestions + live alerts
- `GET /scenario` - read phase or set via `?phase=ENTRY|MID_GAME|HALFTIME|EXIT`
- `GET /fan/state` - unified attendee state (recommendation, KPIs, offer, escalations)
- `GET /ops/flash-deal` - flash deal status
- `POST /ops/flash-deal` - trigger or end flash deal
- `GET /ops/events` - merged operations + simulation event stream

## Run Locally
1. Create and activate a virtual environment.
2. Install dependencies:
   pip install -r requirements.txt
3. Start backend:
   python backend/app.py
4. Open `http://127.0.0.1:8080` in your browser.

## Deploy on Cloud Run
1. gcloud auth login
2. gcloud config set project YOUR_PROJECT_ID
3. gcloud services enable run.googleapis.com cloudbuild.googleapis.com
4. gcloud run deploy smartcrowd-ai --source . --region asia-south1 --allow-unauthenticated

This deployment path uses Google Cloud Build to build from source. No local Docker installation is required.

## One-Command Release (Push + Deploy)
Use the PowerShell automation script:

`./scripts/release.ps1 -CommitMessage "feat: timeline and event stream"`

Optional switches:
- `-SkipPush` to skip GitHub push
- `-SkipDeploy` to skip Cloud Run deployment

Optional overrides:
- `-ProjectId YOUR_PROJECT_ID`
- `-Service YOUR_CLOUD_RUN_SERVICE`
- `-Region asia-south1`

## Privacy Note
- This prototype uses simulated, anonymous data only.
- No personal identifiers, phone numbers, or user identities are collected.
- Architecture is privacy-first and can be extended with edge processing.
