# OttoMech 🔧

> **Your mechanic. One tap away.**
>
> OttoMech connects stranded motorists in Lucknow with the nearest verified mechanics in under 5 minutes — no app install, no payment gateway, fully real-time.
> Features a fully responsive, brutalist minimalist UI with sharp corners and zero border radii.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [High-Level Architecture](#high-level-architecture)
3. [System Architecture Diagram](#system-architecture-diagram)
4. [Tech Stack](#tech-stack)
5. [Database Schema](#database-schema)
6. [API Reference](#api-reference)
7. [Real-Time Events (Socket.IO)](#real-time-events-socketio)
8. [User Flow](#user-flow)
9. [Mechanic Flow](#mechanic-flow)
10. [Core Logic: Dispatch & Concurrency](#core-logic-dispatch--concurrency)
11. [Scalability Design](#scalability-design)
12. [Local Setup Guide](#local-setup-guide)
13. [Deploying to Render](#deploying-to-render)
14. [Project Structure](#project-structure)
15. [Acknowledgements](#acknowledgements)

---

## What It Does

A stranded user opens the browser (no install), registers with their email and phone, selects their breakdown type, and the system:

1. Finds the **3 nearest available mechanics** via GPS using PostGIS spatial indexing.
2. Broadcasts the job to all 3 simultaneously over **Socket.IO**.
3. The **first mechanic to accept wins** — guaranteed by a single atomic SQL `UPDATE ... WHERE status='pending' RETURNING` (no race conditions).
4. The user gets a **live Leaflet map** showing the mechanic's GPS location updating in real time.
5. On arrival, the mechanic enters the **cash amount** and marks the job complete. The system records an MRI event.

No payment gateway. Cash only. This is intentional.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER (PWA)                            │
│                                                                  │
│   register_user.html  ─→  Flask REST API  ─→  Neon PostgreSQL   │
│   register_mechanic.html                       (PostGIS)         │
│                                                                  │
│   Job Flow (user)                                                │
│   POST /jobs/create ──────────────────────────────┐             │
│                                                   ↓             │
│   Socket.IO client ←── 'new_job' event ── Flask-SocketIO        │
│   (Leaflet map)     ←── 'match_confirmed'                        │
│                     ←── 'mechanic_ping' (GPS updates)            │
│                                                                  │
│   Job Flow (mechanic)                                            │
│   PATCH /jobs/:id/accept ──────── atomic UPDATE ────────────→ DB│
│   Socket.IO 'mechanic_location' ──→ server ──→ user's socket    │
└──────────────────────────────────────────────────────────────────┘
```

**Single process. Single deploy. No microservices.** Flask serves both the REST API and the Jinja2 frontend templates. Flask-SocketIO handles real-time events on the same process using `eventlet` in production (threading in dev/tests).

---

## System Architecture Diagram

```
                              ┌──────────────────┐
                              │  Neon (Neon.tech)│
                              │  PostgreSQL      │
                              │  + PostGIS       │
                              │                  │
                              │  users           │
                              │  mechanics       │
                              │  jobs            │
                              │  job_broadcasts  │
                              │  otp_store       │
                              │  mri_events      │
                              │  receipts        │
                              └───────┬──────────┘
                                      │ psycopg2 (raw SQL)
                                      │
┌─────────────┐   HTTP/WS    ┌────────┴───────────────────────────┐
│  Browser    │◄────────────►│  Flask + Flask-SocketIO            │
│  (any)      │              │  (Render free tier)                │
│             │              │                                    │
│  Jinja2     │              │  Blueprints:                       │
│  templates  │              │    /auth     → auth.py             │
│  Vanilla JS │              │    /mechanics→ mechanic.py         │
│  Leaflet.js │              │    /jobs     → job.py              │
│  Socket.IO  │              │    socket    → socket_events.py    │
│  client     │              │                                    │
└─────────────┘              │  In-memory:                        │
                             │    active_jobs dict                │
                             │    _token_store dict               │
                             └────────────────────────────────────┘
                                      │
                              ┌───────┴────────┐
                              │  Gmail SMTP    │
                              │  (OTP email    │
                              │   delivery)    │
                              └────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Backend** | Python 3.13 + Flask 3.0 | Team expertise. Stable on Render free tier. |
| **Real-time** | Flask-SocketIO 5.3 + eventlet | Bidirectional WebSocket for GPS tracking and job events. |
| **Database** | Neon PostgreSQL + PostGIS | Free tier, `ST_DWithin` for geo queries, `gen_random_uuid()` for UUIDs. |
| **DB Driver** | psycopg2 (raw SQL) | PostGIS geography types are cleaner in raw SQL than any ORM. |
| **Map** | Leaflet.js + OpenStreetMap | Zero API key. Zero billing. Zero demo-day failure risk. |
| **Frontend** | Jinja2 templates + Vanilla JS | No build step, no npm. Brutalist minimalist design. Works in any browser without install. |
| **Auth** | Custom hex token (`secrets.token_hex`) | Simple, stateless enough for hackathon demo. |
| **OTP** | Python `smtplib` → Gmail SMTP | No SMS budget. Email OTP with terminal-print fallback for demo. |
| **PDF** | ReportLab (Stage 7+) | Server-side, free, no external service. |
| **Production Server** | Gunicorn + eventlet worker | Required for Socket.IO concurrency in production. |
| **Hosting** | Render free tier + Neon free tier | Zero cost constraint — non-negotiable for hackathon. |

---

## Database Schema

### `users`
Registered motorists. UUID primary key.

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID PK | `gen_random_uuid()` |
| `first_name`, `last_name` | VARCHAR | |
| `email` | VARCHAR UNIQUE | Used as OTP key |
| `phone_number` | VARCHAR UNIQUE | E.164 format e.g. `+919876543210` |
| `country` | CHAR(2) | ISO 3166-1 alpha-2 e.g. `IN` |
| `phone_verified` | BOOLEAN | Default `TRUE` (email OTP is the gate) |

### `mechanics`
Registered service providers.

| Column | Type | Notes |
|---|---|---|
| `mechanic_id` | UUID PK | |
| `workshop_name`, `address`, `zone` | VARCHAR/TEXT | |
| `lat`, `lng` | NUMERIC(9,6) | Stored separately for display |
| `location` | GEOGRAPHY(POINT, 4326) | PostGIS column — `ST_DWithin` queries run on this |
| `is_available` | BOOLEAN | Toggle. Only `TRUE` mechanics receive job broadcasts. |
| `rating` | NUMERIC(3,2) | |
| `mri_score` | NUMERIC(5,2) | Default 50.0. Updated by MRI event system (Stage 7). |

**Index:** `GIST(location)` — enables fast `ST_DWithin` radius search.

### `otp_store`
Ephemeral OTP storage, keyed by email.

| Column | Type | Notes |
|---|---|---|
| `email` | VARCHAR PK | One active OTP per email at any time |
| `otp_code` | CHAR(6) | Random 6-digit code |
| `purpose` | VARCHAR | `'registration'` or `'login'` |
| `expires_at` | TIMESTAMPTZ | 300 seconds from generation |

### `jobs`
The core dispatch record.

| Column | Type | Notes |
|---|---|---|
| `job_id` | UUID PK | |
| `driver_id` | UUID FK → users | |
| `mechanic_id` | UUID FK → mechanics | NULL until accepted |
| `issue_type` | VARCHAR | `flat_tyre | battery | engine | overheating | other` |
| `status` | VARCHAR | `pending → accepted → completed` |
| `driver_location` | GEOGRAPHY | User's breakdown coordinates |
| `cash_amount` | NUMERIC(8,2) | Entered by mechanic on completion |
| `accepted_at`, `completed_at` | TIMESTAMPTZ | |

**Index:** Partial index `WHERE status='pending'` — makes concurrent accept lookups fast.

### `job_broadcasts`
Tracks which mechanics received a job notification.

| Column | Type | Notes |
|---|---|---|
| `job_id` | UUID FK | |
| `mechanic_id` | UUID FK | |
| `responded` | BOOLEAN | Set `TRUE` on accept/reject |
| `accepted` | BOOLEAN | `TRUE` for winner only |

### `mri_events`
Mechanic Reliability Index events (Stage 7).

| Column | Type | Notes |
|---|---|---|
| `mechanic_id` | UUID FK | |
| `event_type` | VARCHAR | `COMPLETED | ON_TIME | LATE | ABANDONED | RATED | WARRANTY_CLAIM` |
| `value` | NUMERIC | Weight for score computation |

### `receipts`
Job completion PDF store (Stage 7).

| Column | Type | Notes |
|---|---|---|
| `job_id` | UUID FK UNIQUE | One receipt per job |
| `pdf_base64` | TEXT | ReportLab-generated PDF |
| `cash_amount`, `warranty_days` | NUMERIC/INT | |

---

## API Reference

All protected routes require `Authorization: Bearer <session_token>`.

### Auth

```
POST /auth/register/user
  Body: { first_name, email, phone_number, country, last_name? }
  → Creates user row, sends 6-digit OTP to email
  Response 201: { user_id, message, expires_in_seconds, email_delivery }

POST /auth/register/mechanic
  Body: { first_name, last_name, gender, email, phone_number, country,
          workshop_name, address, zone, lat?, lng? }
  → lat/lng are optional; captured via browser geolocation on the frontend
  Response 201: { mechanic_id, message, expires_in_seconds, email_delivery }

POST /auth/verify-otp
  Body: { email, otp, role }       role: 'user' | 'mechanic'
  → Validates OTP, sets last_login, returns session token (memory-only, no DB)
  Response 200: { message, session_token, role, id }
```

### Mechanics

```
GET /mechanics/nearby?lat=&lng=&radius_km=
  → Returns up to 3 nearest available mechanics with PostGIS distances
  Response 200: { count, mechanics: [{ mechanic_id, workshop_name, distance_km, ... }] }
```

### Jobs

```
POST /jobs/create                  [requires user auth]
  Body: { issue_type, lat, lng, photo_base64? }
  → Creates job, broadcasts to ≤3 nearby mechanics via Socket.IO
  Response 201: { job: {...}, mechanics_notified: N }

PATCH /jobs/:job_id/accept         [requires mechanic auth]
  Body: { mechanic_id }
  → Atomic UPDATE WHERE status='pending' — exactly one mechanic wins
  → Closes out job_broadcasts, fires 'match_confirmed' to user's socket room
  Response 200: { job: {...} }
  Response 409: job already accepted

PATCH /jobs/:job_id/complete       [requires mechanic auth — assigned only]
  Body: { cash_amount }
  → Sets status='completed', records COMPLETED mri_event
  Response 200: { job: {...} }

GET /jobs/:job_id                  [requires auth]
  Response 200: { job: {...} }
```

### Utility

```
GET /health
  Response 200: { status: "ok" }

GET /socket-status
  Response 200: { connected_jobs: N }   (no auth — debug only)
```

---

## Real-Time Events (Socket.IO)

Socket connection requires an auth payload with the session token:
```js
const socket = io({ auth: { token: sessionToken } });
```

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `connect` | `{ token }` in auth | Validates token; joins `driver_<id>` or `mechanic_<id>` room |
| `mechanic_location` | `{ job_id, lat, lng }` | Mechanic emits GPS position; server computes distance and forwards |
| `rejoin_job` | `{ job_id, session_token }` | Reconnect/restore tracking after network drop or server restart |

### Server → Client

| Event | Room Target | Payload |
|---|---|---|
| `new_job` | `mechanic_<id>` | `{ job_id, issue_type, driver_lat, driver_lng, accept_deadline }` |
| `match_confirmed` | `driver_<id>` | `{ job_id, mechanic_name, workshop_name, mri_score, phone, distance_km }` |
| `mechanic_ping` | `driver_<sid>` | `{ lat, lng, timestamp, distance_remaining_m }` |
| `rejoined` | caller only | `{ job_id, role }` |
| `error` | caller only | `{ message }` |

**Room naming:** Users join `driver_{user_id}`. Mechanics join `mechanic_{mechanic_id}`. REST handlers emit to these stable rooms — never raw socket SIDs.

---

## User Flow

```
1. User opens browser → visits /register/user
   ↓
2. Fills in name, email, phone, country
   ↓
3. POST /auth/register/user
   → OTP sent to email (5-minute expiry)
   ↓
4. Enters OTP on same page
   ↓
5. POST /auth/verify-otp (role=user)
   → Receives session_token (held in JS memory — no localStorage)
   ↓
6. Selects issue type (flat_tyre / battery / engine / overheating / other)
   ↓
7. Browser requests GPS coordinates (native geolocation API)
   ↓
8. POST /jobs/create → { job_id, mechanics_notified: N }
   ↓
9. Socket.IO connects with session_token
   ↓
10. Waits for 'match_confirmed' event
    ↓
11. Leaflet map renders; 'mechanic_ping' events update marker in real time
    ↓
12. Mechanic arrives. Marks job complete. Cash exchanged.
```

---

## Mechanic Flow

```
1. Mechanic opens browser → visits /register/mechanic
   ↓
2. Fills in name, workshop, zone, phone, email
   (Browser silently captures GPS via navigator.geolocation)
   ↓
3. POST /auth/register/mechanic
   → OTP sent to email
   ↓
4. Enters OTP → POST /auth/verify-otp (role=mechanic)
   → Receives session_token
   ↓
5. Socket.IO connects → mechanic joins room 'mechanic_<id>'
   ↓
6. Incoming 'new_job' event appears in dashboard
   ↓
7. Mechanic taps Accept
   ↓
8. PATCH /jobs/:id/accept (atomic — first to hit wins)
   ↓
9. If winner: starts emitting mechanic_location every N seconds
   If loser: receives 409, returns to standby
   ↓
10. Arrives at user's location
    ↓
11. PATCH /jobs/:id/complete with cash_amount
    ↓
12. GPS emit loop cleared. Job marked complete.
```

---

## Core Logic: Dispatch & Concurrency

### Geo Query (PostGIS)

```sql
SELECT mechanic_id, ST_Distance(location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)
FROM mechanics
WHERE is_available = TRUE
  AND location IS NOT NULL
  AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s)
ORDER BY distance_m ASC
LIMIT 3;
```

Coordinates follow PostGIS convention: `ST_MakePoint(lng, lat)` — longitude first.

### Atomic Accept (No Race Condition)

The critical line in `job.py` — no `SELECT FOR UPDATE`, no application-level lock:

```sql
UPDATE jobs
SET mechanic_id = %s, status = 'accepted', accepted_at = NOW()
WHERE job_id = %s AND status = 'pending'
RETURNING job_id;
```

If this returns a row → winner. If it returns nothing → another mechanic already accepted → `409 Conflict`. PostgreSQL row-level locking guarantees exactly one winner under concurrent load. Verified by `TestJobAccept::test_concurrent_accept_exactly_one_wins` (3 threads hitting the same job simultaneously using a threading barrier).

### Distance Computation (GPS Pings)

Server-side Spherical Law of Cosines — no PostGIS needed for real-time GPS:

```python
R = 6371000.0  # metres
val = sin(lat1)*sin(lat2) + cos(lat1)*cos(lat2)*cos(Δlng)
distance_m = R * acos(clamp(val, -1.0, 1.0))
```

Accurate to ±1 m at sub-10 km distances. GPS pings are **never written to the database** — computed in memory and forwarded over the socket.

### OTP System

- 6-digit OTP generated server-side with `random.randint(0, 999999)` zero-padded.
- Stored in `otp_store` table keyed by email with a 300-second expiry.
- `ON CONFLICT (email) DO UPDATE` — only one live OTP per email at any time.
- Sent via Gmail SMTP (`smtplib.SMTP_SSL`). Falls back to terminal print if env vars are missing (demo-day safety net).
- OTP is consumed on successful verify — cannot be reused.

---

## Scalability Design

This is a hackathon project running on **free tier** infrastructure. The following decisions were made with explicit trade-offs in mind:

| Concern | Current Approach | Trade-off |
|---|---|---|
| **Concurrency** | `eventlet` + single Gunicorn worker | Works for demo. Multi-worker would require Redis pub/sub for Socket.IO rooms. |
| **Session state** | In-memory `_token_store` dict | Lost on restart. `rejoin_job` event handles reconnection. |
| **GPS tracking** | In-memory `active_jobs` dict | Lost on restart. Same reconnect recovery applies. |
| **DB connections** | Fresh psycopg2 connection per request | Neon's own connection pooler handles this at the DB side. |
| **Geo indexing** | PostGIS `GIST(location)` index | Supports thousands of mechanics. Scales well. |
| **Concurrency guard** | Single-row `UPDATE WHERE status='pending'` | Scales to any number of simultaneous acceptors. DB handles it. |
| **OTP** | Email via SMTP | No rate limiting on Gmail App Password. 500 emails/day on free Gmail. Sufficient for demo. |

**To scale to production:**
- Add Redis for Socket.IO message broker (`message_queue='redis://...'` in SocketIO constructor).
- Move `_token_store` to Redis with TTL matching the token lifetime.
- Add multiple Gunicorn workers behind a load balancer.
- Add `pg_bouncer` or switch to `asyncpg` for connection pooling.

---

## Local Setup Guide

### Prerequisites

- Python 3.11+
- PostgreSQL database with PostGIS extension (Neon free tier works out of the box)
- Gmail account with an [App Password](https://myaccount.google.com/apppasswords) configured

### 1. Clone and navigate

```bash
git clone https://github.com/LeeFred3042U/OttoMech.git
cd OttoMech/ottomech/backend
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in DATABASE_URL, GMAIL_ADDRESS, GMAIL_APP_PASSWORD
```

### 5. Initialise the database and seed mechanic data

```bash
python seed.py
# Expected output:
# 20 mechanics seeded
# 13 mechanics with is_available=true
```

### 6. Run the development server

```bash
python app.py
```

The app starts on `http://localhost:5000`.

| URL | Description |
|---|---|
| `http://localhost:5000/register/user` | User registration page |
| `http://localhost:5000/register/mechanic` | Mechanic registration page |
| `http://localhost:5000/health` | Health check |
| `http://localhost:5000/socket-status` | Live job tracking count |

### 7. Run the test suite

```bash
python -m pytest tests/test_stage2.py tests/test_stage3.py tests/test_stage4.py -v
# Expected: 51 passed
```

---

## Deploying to Render

### 1. Push your code to GitHub (already done).

### 2. Create a new Web Service on [Render.com](https://render.com)

- **Connect:** Your GitHub repository
- **Root Directory:** `backend`
- **Environment:** Python 3
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `gunicorn --worker-class eventlet -w 1 app:app`

### 3. Add Environment Variables in Render dashboard

| Key | Value |
|---|---|
| `DATABASE_URL` | Your Neon PostgreSQL connection string |
| `GMAIL_ADDRESS` | Your Gmail address |
| `GMAIL_APP_PASSWORD` | Your 16-character App Password |
| `SECRET_KEY` | Any random string |

### 4. Deploy

Click **Create Web Service**. Render will build and deploy automatically on every push to your connected branch.

---

## Project Structure

```
OttoMech/ottomech/
├── backend/
│   ├── app.py                  # Flask app factory, route registration, SocketIO setup
│   ├── db.py                   # Schema DDL, get_db() context manager, init_db()
│   ├── seed.py                 # Seeds 20 Lucknow mechanics (10 real + 10 dummy)
│   ├── requirements.txt        # All Python dependencies
│   ├── .env.example            # Template for required environment variables
│   ├── Agent.md                # Full architectural decisions and institutional memory
│   └── routes/
│       ├── auth.py             # Registration, OTP, verify, require_auth middleware
│       ├── mechanic.py         # GET /mechanics/nearby, PostGIS query
│       ├── job.py              # Create, accept (atomic), complete, get
│       ├── socket_events.py    # Socket.IO handlers: connect, location, rejoin
│       └── common.py           # Shared db_error_response helper
│
└── frontend/
    ├── templates/
    │   ├── base.html           # Shared layout (header, nav, CSS/JS links)
    │   ├── register_user.html  # User registration + OTP form
    │   └── register_mechanic.html  # Mechanic registration + geolocation capture
    └── static/
        ├── css/base.css        # Light-theme mobile-first styles
        ├── js/register.js      # Email OTP flow, geolocation, form handling
        └── img/oLogo.svg       # Brand logo
```

---

## Issue Types

```
flat_tyre | battery | engine | overheating | other
```

---

## Seed Data

20 mechanics across Lucknow zones — 10 real garages (geocoded) fron justdial + 10 dummy entries. 13 are `is_available=TRUE` by default. Run `python seed.py` to populate (idempotent — safe to run multiple times).
---

## Acknowledgements

The seed data used in this project was compiled from publicly available business listings on [**Justdial**](https://www.justdial.com) , [**Sulekha**](https://www.sulekha.com/lucknow-city) for demonstration purposes during this hackathon.

Business names, locations, and contact information are attributed to their respective owners and Justdial. This project is non-commercial and the data is used solely to showcase the application's functionality. Any inaccuracies or outdated information originate from the source listings.

If this project were to be developed beyond the hackathon prototype, the seed data would be replaced with business-owner onboarding, user submissions, or officially licensed data sources.

---