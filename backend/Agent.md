# AGENT.md — OttoMech
> Read this file completely before writing a single line of code.
> This is the project's institutional memory. Every decision here was made deliberately.
> v2 — supersedes prior SERIAL/no-map/no-registration decisions where noted below.

---

## What This Project Is

OttoMech is a PWA (no app install) that connects stranded users in Lucknow with nearby verified mechanics in under 5 minutes. Think Rapido/Uber/Porter/Ola but for roadside mechanic dispatch. User opens browser, registers, picks issue type, system finds nearest 3 mechanics via GPS, first to accept gets the job. Payment is cash on completion — no payment gateway in any stage.

**Tagline:** Your mechanic. One tap away.
**Hackathon:** CODESLAYER2k25, DevSphere India, Open Innovation track.
**Team:** GrootForce (4 members). Demo day requires a **live, real-time walkthrough** of user registration and mechanic registration in front of judges — both flows must be fast, visibly working, and error-free.

---

## ⚠️ Decisions Superseded in This Version

| Old decision | New decision | Why |
|---|---|---|
| SERIAL integer PKs | **UUID PKs** for `users` and `mechanics` | Explicit requirement: `user_id (UUID)` in registration schema. `jobs`, `job_broadcasts`, `mri_events`, `receipts` now reference UUID foreign keys. |
| Google Maps JS SDK | **Leaflet.js + OpenStreetMap tiles** | No API key, no billing risk on demo day. Zero-config, zero-failure-mode map. |
| Paytm/PhonePe SDK (sandbox) | **Cash only — no payment integration at all** | Explicit instruction. Remove all payment SDK references from every stage. |
| Simple phone-only auth | **Full registration profile** (name, email, country, gender for mechanics, workshop name, etc.) | Explicit registration schema provided below. |
| 10-digit phone, no country code | **E.164 format**, country auto-derived via ISO 3166-1 alpha-2 on registration, OTP-verified | Explicit instruction. |

---

## Build Stages (re-scoped)

| Stage | Description | Status |
|---|---|---|
| 1 | Flask + Neon DB foundation, basic auth routes, 5 seed garages | ✅ Complete |
| 2 | **Registration overhaul**: UUID schema, full user/mechanic profiles, E.164 + country code OTP, 20-garage seed (10 real + 10 dummy) | ✅ Complete |
| 3 | Core dispatch API: job broadcast to 3 mechanics, `job_broadcasts` table, auth middleware on protected routes | ✅ Complete |
| 4 | Real-time: Socket.IO, mechanic GPS ping → user map (Leaflet), `match_confirmed` event, `rejoin_job`, `socket-status` debug route | ✅ Complete |
| 5 | Frontend (PWA): registration → OTP login → issue select → mechanic match, Leaflet map integrated | ✅ Complete |
| 6 | Mechanic dashboard: registration flow, job accept UI, GPS emit loop | 🔄 Current |
| 7 | MRI scoring (ReportLab PDF receipt — cash amount entered manually by mechanic, no gateway) | ⏳ |
| 8 | Demo polish: 8 garages live, offline mode, **live registration demo readiness** (this is the demo-day centerpiece) | ⏳ |

**Never work ahead of the current stage.** Do not add Stage 7 features while in Stage 6.

---

## Tech Stack (do not change any of these)

| Layer | Choice | Reason — do not suggest alternatives |
|---|---|---|
| Backend | Python + Flask | Team knows it. Stable on free Render. |
| Database | Neon PostgreSQL + PostGIS | Free tier, PostGIS for geo queries, no ORM complexity |
| DB driver | psycopg2 (raw SQL) | PostGIS types are cleaner in raw SQL than ORM |
| Primary keys | **UUID** (`gen_random_uuid()`, requires `pgcrypto` extension) | Matches required registration schema |
| Real-time | Socket.IO (Stage 4) | Bidirectional — needed for both user map AND in-app chat |
| Frontend | Vanilla JS PWA (single HTML file) | No build step, no npm, works on any browser, no install |
| **Map** | **Leaflet.js + OpenStreetMap tile layer** | No API key, no billing, zero demo-day failure risk |
| PDF | ReportLab (Python, server-side) | Free, no external service |
| Hosting | Render free tier (Flask) + Neon free tier (DB) | Zero cost constraint — non-negotiable |
| Auth | Custom hex token (`secrets.token_hex`) stored in `_token_store` dict | Simple, works for demo |
| OTP | Terminal print only | No SMS budget. Twilio free = 1 number only |
| Payments | **None. Cash only.** Mechanic manually enters amount collected at job completion | Explicit instruction — no Paytm/PhonePe in any stage |

---

## Phone & Country Standard

- Stored as **E.164**: `+91XXXXXXXXXX` (country code + 10-digit number, no spaces/dashes)
- `country` column stores **ISO 3166-1 alpha-2** code (e.g. `IN`, `US`, `GB`) — set automatically based on the country the user selects at registration (one country picker drives both the dial code prefix and this column — do not ask for them separately)
- OTP is now sent to the user's **email** via Gmail SMTP (Stage 5 decision). `otp_store` is keyed by **email**, not phone.
- **Country picker (Stage 5 status):** Currently a free-text `<input type="text" maxlength="2">` with a hint label. Stage 6+ should replace this with a `<select>` country list so the E.164 dial-code prefix auto-fills. For demo day judges can type `IN` manually — acceptable.

---

## Database Schema (v2 — full registration)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS postgis;

-- ═══════════════ USERS ═══════════════
CREATE TABLE IF NOT EXISTS users (
    user_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name       VARCHAR(50) NOT NULL,
    last_name        VARCHAR(50),
    display_name     VARCHAR(100),
    email            VARCHAR(255) UNIQUE,
    phone_number     VARCHAR(20) UNIQUE NOT NULL,     -- E.164, e.g. +919876543210
    country          CHAR(2) NOT NULL,                -- ISO 3166-1 alpha-2, e.g. IN
    language         VARCHAR(10) DEFAULT 'en',
    profile_photo    TEXT,                            -- base64 or URL, nullable
    date_created     TIMESTAMPTZ DEFAULT NOW(),
    status           VARCHAR(20) DEFAULT 'active',     -- active | suspended | deleted

    -- Authentication
    password_hash    TEXT,                             -- nullable, only if email login added later
    phone_verified   BOOLEAN DEFAULT TRUE,     -- Stage 5: verification moved to email; phone_verified is always TRUE on insert and carries no gate logic
    email_verified   BOOLEAN DEFAULT FALSE,
    last_login       TIMESTAMPTZ,
    two_fa_enabled   BOOLEAN DEFAULT FALSE,
    two_fa_method    VARCHAR(20)                       -- 'sms' | 'totp' | NULL
);

-- ═══════════════ MECHANICS ═══════════════
CREATE TABLE IF NOT EXISTS mechanics (
    mechanic_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name       VARCHAR(50) NOT NULL,
    last_name        VARCHAR(50),
    display_name     VARCHAR(100),
    gender           VARCHAR(20),                      -- male | female | other | prefer_not_to_say
    email            VARCHAR(255) UNIQUE,
    phone_number     VARCHAR(20) UNIQUE NOT NULL,       -- E.164
    country          CHAR(2) NOT NULL,                  -- ISO 3166-1 alpha-2
    language         VARCHAR(10) DEFAULT 'en',
    profile_photo    TEXT,
    workshop_name    VARCHAR(150) NOT NULL,
    address          TEXT,
    zone             VARCHAR(50),                       -- Gomti Nagar, Lalbagh, etc.
    lat              NUMERIC(9,6),
    lng              NUMERIC(9,6),
    location         GEOGRAPHY(POINT, 4326),
    is_available     BOOLEAN DEFAULT FALSE,
    rating           NUMERIC(3,2) DEFAULT 0.00,
    review_count     INT DEFAULT 0,
    mri_score        NUMERIC(5,2) DEFAULT 50.00,
    date_created     TIMESTAMPTZ DEFAULT NOW(),
    status           VARCHAR(20) DEFAULT 'active',

    -- Authentication
    password_hash    TEXT,
    phone_verified   BOOLEAN DEFAULT TRUE,     -- Stage 5: same as users — always TRUE on insert; email is the verification gate
    email_verified   BOOLEAN DEFAULT FALSE,
    last_login       TIMESTAMPTZ,
    two_fa_enabled   BOOLEAN DEFAULT FALSE,
    two_fa_method    VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_mechanics_location ON mechanics USING GIST(location);

-- ═══════════════ OTP (shared by users + mechanics, keyed on email — Stage 5 change) ═══════════════
CREATE TABLE IF NOT EXISTS otp_store (
    email        VARCHAR(255) PRIMARY KEY,   -- keyed on email since Stage 5 (was E.164 phone in Stage 4)
    otp_code     CHAR(6) NOT NULL,
    purpose      VARCHAR(20) DEFAULT 'login', -- 'registration' | 'login'
    expires_at   TIMESTAMPTZ NOT NULL
);

-- ═══════════════ JOBS ═══════════════
CREATE TABLE IF NOT EXISTS jobs (
    job_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id        UUID REFERENCES users(user_id),
    mechanic_id      UUID REFERENCES mechanics(mechanic_id),
    issue_type       VARCHAR(30) NOT NULL,        -- flat_tyre|battery|engine|overheating|other
    status           VARCHAR(30) DEFAULT 'pending',-- pending|accepted|in_progress|completed|cancelled
    lat              NUMERIC(9,6),
    lng              NUMERIC(9,6),
    driver_location  GEOGRAPHY(POINT, 4326),
    photo_base64     TEXT,
    cash_amount      NUMERIC(8,2),                 -- entered by mechanic at completion, nullable
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    accepted_at      TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS job_broadcasts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id       UUID REFERENCES jobs(job_id),
    mechanic_id  UUID REFERENCES mechanics(mechanic_id),
    sent_at      TIMESTAMPTZ DEFAULT NOW(),
    responded    BOOLEAN DEFAULT FALSE,
    accepted     BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_job_broadcasts_job ON job_broadcasts(job_id);

CREATE TABLE IF NOT EXISTS mri_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mechanic_id   UUID REFERENCES mechanics(mechanic_id),
    event_type    VARCHAR(30) NOT NULL,   -- ON_TIME|LATE|COMPLETED|ABANDONED|RATED|WARRANTY_CLAIM
    value         NUMERIC(5,2),
    recorded_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mri_events_mechanic ON mri_events(mechanic_id);

CREATE TABLE IF NOT EXISTS receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(job_id) UNIQUE,
    pdf_base64      TEXT,
    cash_amount     NUMERIC(8,2),
    warranty_days   INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration note for Cursor:** Stage 1's tables used SERIAL ids and a smaller `mechanics`/`jobs` shape. Since this is a hackathon DB with only test data, Stage 2 should **drop and recreate** `users`, `mechanics`, `jobs`, `job_broadcasts`, `mri_events`, `receipts`, `otp_store` rather than attempt an in-place ALTER from int to UUID. This is a one-time reset — confirm with the team before running on the shared Neon instance.

---

## API Contracts (v2)

```
POST /auth/register/user
  body: {first_name, last_name, phone_number, country, email?, language?}
  → sends OTP to phone_number, creates user with phone_verified=false
  response: {user_id, message, expires_in_seconds}

POST /auth/register/mechanic
  body: {first_name, last_name, gender, phone_number, country,
         workshop_name, address, zone, lat, lng, email?}
  → sends OTP, creates mechanic with phone_verified=false, is_available=false
  response: {mechanic_id, message, expires_in_seconds}

POST /auth/verify-otp
  body: {phone_number, otp, role}      role: 'user' | 'mechanic'
  → sets phone_verified=true, last_login=now(), returns session_token
  response: {message, session_token, role, id}

GET  /mechanics/nearby
  params: lat, lng, radius_km
  response: {count, mechanics: [...]}    -- LIMIT 3, only is_available=true

POST /jobs/create
  body: {driver_id, issue_type, lat, lng, photo_base64?}
  response: {job: {...}}

PATCH /jobs/:job_id/accept
  body: {mechanic_id}
  response: {job: {...}}

PATCH /jobs/:job_id/complete
  body: {cash_amount, warranty_days?}
  response: {job: {...}}

GET  /jobs/:job_id
GET  /health
GET  /socket-status        → {connected_jobs: N}    # no auth, Stage 4 debug route
```

### Stage 4 Socket.IO Events

```
Client → Server:
  connect         auth: {token: <session_token>}
  mechanic_location  {job_id, lat, lng}
  rejoin_job      {job_id, token}

Server → Client (room-targeted):
  new_job         {job_id, issue_type, lat, lng, mechanic_ids[], accept_deadline}
  match_confirmed {job_id, mechanic: {name, workshop_name, mri_score, phone, distance_km}}
  location_update {job_id, lat, lng, distance_m}
```

---

## Prior Decisions (carried forward, unchanged)

- **Raw SQL over SQLAlchemy** — PostGIS types are cleaner in raw psycopg2.
- **No connection pooling** — fresh connection per request; Neon's own pooler handles this.
- **No JWT** — hex token in `_token_store` dict, acceptable for demo.
- **No ORM migrations** — schema changes via `init_db()` with `IF NOT EXISTS`.
- **`ST_MakePoint(lng, lat)`** — PostGIS convention, do not swap.
- **`LIMIT 3` on /mechanics/nearby** — SOS broadcasts to exactly 3.
- **Free-tier only** — every choice must survive Render free + Neon free.
- **`is_available`** is the demo toggle — no separate `demo_mode` flag.

## New Prior Decisions (v2)

- **UUID over SERIAL** — required by the registration schema handed down for this stage. Do not revert.
- **Leaflet + OpenStreetMap over Google Maps** — zero API key, zero billing, zero demo-day failure mode. Do not suggest Google Maps or Mapbox.
- **Cash only, no payment gateway, in any stage** — `cash_amount` is a plain numeric field the mechanic types in at job completion. No Paytm, no PhonePe, no UPI deep link, no sandbox.
- **Country auto-derived from country picker at registration** — store as ISO 3166-1 alpha-2 in `country`. Do not add a separate "select your country code" dropdown; the country picker drives both the E.164 prefix and this column from one selection.
- **Separate registration routes per role** — `/auth/register/user` and `/auth/register/mechanic` are distinct because mechanic registration needs workshop_name, gender, zone, lat/lng that user registration doesn't. Do not merge them into one generic `/auth/register`.
- **OTP purpose field** distinguishes `registration` vs `login` OTPs so expired registration OTPs don't accidentally authorize a login elsewhere.

## New Decisions (Stage 3 — complete)

- **Auth middleware via `require_auth` decorator** — reads `Authorization: Bearer <token>` from request headers, validates against `_token_store`, attaches `g.auth = {id, role}`. Applied to all `/jobs/*` routes.
- **Concurrency guard**: `UPDATE jobs SET mechanic_id=... WHERE status='pending' RETURNING job_id` — atomic single-statement optimistic lock. No `SELECT FOR UPDATE`, no transactions beyond the single statement. Exactly one mechanic wins per job.
- **`job_broadcasts` closed out on accept** — the winning mechanic's row gets `responded=True, accepted=True`; all losing rows get `responded=True, accepted=False`. Done in the same DB connection, same transaction as the job UPDATE.
- **`cash_amount` validated server-side** — must be ≥ 0 at `/jobs/:id/complete`. Negative values return 400.
- **`PATCH /jobs/:id/complete` guards** — only the job's assigned mechanic (matched by `g.auth['id']`) may mark complete; calling on a non-accepted job returns 400.

## New Decisions (Stage 4 — complete)

- **Socket.IO async_mode — two environments, intentionally different:**
  - **Production (Railway/Render):** `eventlet` — `app.py` monkey-patches at startup (`import eventlet; eventlet.monkey_patch()`), gunicorn runs with `--worker-class eventlet -w 1`. Python is pinned to **3.11** because eventlet breaks on 3.12+.
  - **Tests (Flask test client):** implicitly uses `threading` because the test client bypasses gunicorn entirely. Do not add `async_mode='eventlet'` to the `SocketIO()` constructor — it would break the test client.
  - This split is intentional and acceptable. Do not collapse it. If Stage 6+ introduces async behaviour, test both paths.
  - Single global `SocketIO` instance created at module level in `app.py`, `init_app()`-ed inside `create_app()`, stored in `app.extensions['socketio']` for route access.
- **`register_socket_events()` idempotency** — handlers registered once per `socketio` instance via inner closures. Flask-SocketIO deduplicates at the server level; calling `create_app()` twice (tests) does not double-register.
- **Stable rooms over ephemeral SIDs** — on connect, users join `driver_{user_id}` and mechanics join `mechanic_{mechanic_id}`. REST handlers emit to these rooms with `socketio.emit(..., room=...)` — never raw SIDs.
- **`active_jobs` dict** — in-process dict `{job_id: {driver_sid, mechanic_sid}}` populated by `rejoin_job` event and referenced by `mechanic_location` for forwarding pings. No DB reads for GPS forwarding.
- **Distance formula** — Spherical Law of Cosines: `R * acos(sin(lat1)*sin(lat2) + cos(lat1)*cos(lat2)*cos(Δlng))`. Not Haversine. Accurate to ±1 m at 771 m baseline.
- **GPS pings are not written to DB** — `mechanic_location` events compute distance in memory and emit `location_update` to the user's room. Zero `mri_events` rows written per ping.
- **`emit_match_confirmed` fires after DB commit** — called from `job.py` inside a separate `try/except` after the `with get_db()` block closes. A socket failure never rolls back the accepted job.
- **`/socket-status` route** — `GET`, no auth. Returns `{"connected_jobs": len(active_jobs)}`. For demo-day debugging only. Defined in `app.py`, imports `active_jobs` at call time to avoid circular imports.
- **51 tests across Stages 2–4** — Stage 4 has 16 tests (10 AC-labelled spec tests + 6 additional edge/regression cases). All 51 pass.

## New Decisions (Stage 5 — complete)

- **Deleted React/TypeScript frontend entirely** — Replaced with Jinja2 + Vanilla JS served directly by the Flask app (`render_template`).
- **No Build Step** — Zero npm, package.json, or vite. Avoids multi-origin issues and redundant cold starts on Render.
- **Unified Mobile-First Palette** — Light theme applied (white background, dark text, `#F5A623` accent). SVG logo asset `oLogo.svg` added.
- **Email OTP via Gmail SMTP** — OTPs are now sent via email using Python's `smtplib`. `otp_store` is keyed by email. A terminal-print fallback is kept for demo robustness.
- **Geolocation Mechanic Capture** — Mechanic registration captures coordinates silently via browser `navigator.geolocation` instead of typed lat/lng inputs. The values are optional in the API.
- **`phone_verified` Static Default** — Since verification shifted to email, `phone_verified` is a static default `TRUE` inserted by DB rather than a verification gate.
- **No LocalStorage Auth** — Tokens are kept strictly in JS variables per explicit instruction. State reset on reload.
- **Client-Side Validations & Demo Mode OTP** — Inline form errors match `{error: "..."}` responses. OTP countdown is handled in JS (300s limit).

---

## Demo Day Requirement (Stage 8 centerpiece)

Judges will watch a **live, real-time** user registration and mechanic registration. This means:
- Registration → OTP (visible in terminal, acceptable for free-tier) → verified → redirected to next screen, all within seconds, on stage, with no visible errors
- Test this flow at least 10 times before demo day with different phone numbers
- Have 2–3 backup phone numbers pre-registered in case live registration hits a Neon cold-start during the demo
- Add a `/health` keep-alive ping (every 5 min) starting at least 10 minutes before the demo slot to avoid Render cold start mid-pitch

---

## Issue Types (exact strings)

```
flat_tyre | battery | engine | overheating | other
```

---

## Seed Data — 20 Garages (10 real, 10 dummy, Stage 2)

**Real garages keep their actual `garage_name`/`workshop_name`. Dummy garages get a randomly assigned Indian owner name plus a placeholder workshop name.**

Geocoded approximate coordinates added for the 10 real entries (from their listed addresses):

| Workshop | Zone | Lat | Lng | Phone | Rating | Available |
|---|---|---|---|---|---|---|
| The Car Garage - 24x7 Car Repair | Gomti Nagar | 26.8520 | 81.0050 | +919532934337 | 4.8 | ✅ |
| GoMechanic - Motor Garage & Repaires | Gomti Nagar | 26.8430 | 80.9960 | +918853973725 | 4.9 | ✅ |
| Car Medic Motors | Gomti Nagar | 26.8475 | 81.0085 | +917703934785 | 4.9 | ✅ |
| Bosch Car Service - Shivkunj | Gomti Nagar | 26.8505 | 81.0110 | +917703000451 | 4.7 | ✅ |
| GoMechanic - Avadh Automobiles | Lalbagh | 26.8390 | 80.9215 | +919319926699 | 4.7 | ✅ |
| GoMechanic - Car Workshop (Hazratganj)* | Hazratganj | 26.8505 | 80.9460 | +918853973726† | 4.8 | ✅ |
| Golden Motor Works | Hazratganj | 26.8485 | 80.9480 | +918299281087 | 4.7 | ✅ |
| Car Zone | Hazratganj | 26.8460 | 80.9505 | +919838397274 | 4.3 | ✅ |
| Shivam Motors | Alambagh | 26.8060 | 80.9112 | +919415087864 | 4.3 | ✅ |
| Mangalam Motors | Alambagh | 26.8082 | 80.9075 | +919472808434 | 3.2 | ❌ (low rating, kept offline for demo) |

`†` — original source data had this listing sharing a phone number with "GoMechanic - Motor Garage & Repaires" (duplicate `+918853973725`, which violates the UNIQUE constraint on `phone_number`). Last digit bumped to `...3726` as a placeholder — **flag this to the team to get the correct number before the real demo.**

Dummy entries (random Indian names, fictional workshop names, to fill remaining zones to 20 total):

| Name | Workshop | Zone | Lat | Lng | Available |
|---|---|---|---|---|---|
| Deepak Singh | Indira Nagar Car Clinic | Indira Nagar | 26.8700 | 80.9950 | ✅ |
| Pradeep Rawat | Rawat Auto Electricals | Indira Nagar | 26.8730 | 80.9920 | ❌ |
| Kamlesh Patel | Patel Puncture & Service | Indira Nagar | 26.8680 | 80.9980 | ❌ |
| Harish Chauhan | Transport Nagar Heavy Works | Transport Nagar | 26.8880 | 80.9120 | ✅ |
| Brijesh Pal | Pal Diesel & Petrol | Transport Nagar | 26.8860 | 80.9090 | ❌ |
| Aakash Verma | Chinhat Highway Garage | Chinhat | 26.8450 | 81.0600 | ✅ |
| Rahul Bajpai | Bajpai Auto Accessories | Chinhat | 26.8430 | 81.0640 | ❌ |
| Vivek Tripathi | Tripathi Car & Bike Works | Chinhat | 26.8470 | 81.0570 | ❌ |
| Mohit Tiwari | Lalbagh Express Service | Lalbagh | 26.8380 | 80.9200 | ✅ |
| Nitin Chaudhary | Chaudhary Motor Garage | Lalbagh | 26.8360 | 80.9230 | ❌ |

**Total: 20 mechanics, 13 `is_available=true`** (flip a few to `false` in `seed.py` if you want to land closer to "8 online for demo" — the real-data ratings pushed more above the bar than originally planned, judgment call left to the team).

All dummy entries use `phone_number` in the `+91900000XXXX` placeholder range and `country = 'IN'` — clearly fake numbers, never real people's, safe to seed.

---

## What "Done" Means for Each Stage

A stage is done when:
1. All curl commands in that stage's README return expected responses
2. `python seed.py` runs without error and reports "20 mechanics seeded"
3. `python app.py` starts without error
4. No existing curl commands from previous stages break
5. (Stage 8 only) registration → OTP → verify flow has been manually tested 10+ times

---

## Things That Look Like Improvements But Are Not

- Google Maps / Mapbox: explicitly rejected — see decisions above.
- Payment gateway integration of any kind: explicitly rejected — cash only.
- Celery + Redis: not needed until Stage 7 MRI at scale.
- Firebase Auth: out of scope for all stages — custom OTP flow is the system of record.
- CORS headers: add only when Stage 5 frontend is hitting the backend, not before.
- Switching SERIAL back from UUID "for simplicity": do not — explicit requirement.