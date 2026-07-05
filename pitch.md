# OttoMech — Complete System Design Document

> **"Your mechanic. One tap away."**
> A real-time roadside-assistance dispatch platform connecting stranded motorists in Lucknow with the nearest available mechanic — no app install, no payment gateway, fully live.

This document is written in two registers, clearly labeled throughout:
- **[AS-BUILT]** — what actually exists in the OttoMech codebase today (hackathon, free-tier, single-process).
- **[AT SCALE]** — how the same problem would be solved if this became a funded production product serving a whole city or country. This section exists so the document also works as interview / design-review prep.

---

## 1. Functional Design

### 1.1 Functional Requirements
1. A motorist can register with name, email, phone (E.164), and country, and verify identity via a 6-digit email OTP.
2. A mechanic can register a workshop profile (name, address, zone, GPS) and verify via the same OTP flow.
3. A verified motorist can raise a breakdown job by selecting an issue type (`flat_tyre`, `battery`, `engine`, `overheating`, `other`) and sharing GPS coordinates.
4. The system finds the 3 nearest **available** mechanics and broadcasts the job to all 3 simultaneously.
5. Exactly one mechanic can accept a job; all others are locked out atomically.
6. The motorist sees the assigned mechanic's live location on a map until arrival.
7. Motorist and mechanic can exchange real-time chat/status during the job.
8. On arrival, the mechanic enters the cash amount collected and marks the job complete.
9. Job completion updates the mechanic's **Mechanic Reliability Index (MRI)** and generates a PDF receipt.
10. A mechanic can toggle `is_available` on/off at will.

### 1.2 Non-Functional Requirements
| Attribute | Requirement | [AS-BUILT] status |
|---|---|---|
| Latency | Job → mechanic notified in < 2s | Achieved via Socket.IO push, in-memory Haversine matching |
| Availability | No single point of failure | Not met — single Flask process, single Gunicorn worker (accepted hackathon trade-off) |
| Consistency | Exactly one mechanic wins a job, never zero, never two | Guaranteed via atomic SQL `UPDATE ... WHERE status='pending' RETURNING` |
| Cost | $0 infra | Met — Render free tier + Neon free tier + Gmail SMTP |
| Portability | Works on any phone browser, no install | Met — PWA, vanilla JS, no build step |
| Data integrity | No lost jobs on reconnect | Partially met — `rejoin_job` socket event restores in-memory session state |
| Security | No plaintext secrets, verified identity before dispatch | Partially met — env-based secrets, OTP-gated email verification; token store is in-memory, not hardened for production |

### 1.3 User Stories
- *As a stranded motorist*, I want to describe my breakdown and get a mechanic dispatched within minutes so I'm not stuck on the roadside.
- *As a motorist*, I want to see the mechanic's live location so I know how far away help is.
- *As a mechanic*, I want to receive job alerts only when I'm marked available, so I'm not spammed while off-shift.
- *As a mechanic*, I want a fair, race-free way to claim jobs so the fastest tap wins, not a random assignment.
- *As a mechanic*, I want my reliability score to improve when I complete jobs on time, so good performance is rewarded.
- *As a motorist*, I want a receipt after paying cash, so I have proof of the transaction and any warranty.

### 1.4 Use Cases
| Use Case | Actor | Trigger | Outcome |
|---|---|---|---|
| Register & verify | Motorist / Mechanic | Fills form, submits | OTP emailed, account created in `pending-verification` state |
| Raise SOS job | Motorist | Selects issue type + shares GPS | Job created, ≤3 nearby mechanics notified |
| Accept job | Mechanic | Taps "Accept" on incoming alert | Atomic DB update; mechanic assigned; loser mechanics get `409` |
| Track mechanic | Motorist | Job accepted | Live GPS marker updates on Leaflet map via `mechanic_ping` |
| Complete job | Mechanic | Arrives, collects cash | Job closed, MRI event recorded, PDF receipt generated |
| Reconnect mid-job | Either | Network drop / tab refresh | `rejoin_job` restores socket room membership from `active_jobs` |

### 1.5 Edge Cases
- Two mechanics tap **Accept** at the exact same millisecond → only one `UPDATE` succeeds; the other receives `409 Conflict`.
- Motorist requests a job but no mechanic is within the 50 km radius → empty broadcast list, user shown a "no mechanics nearby" state.
- Mechanic accepts, then goes offline (phone dies) before arriving → job is stuck `accepted` with no completion (see Failure Scenarios).
- OTP requested twice in quick succession → `ON CONFLICT (email) DO UPDATE` ensures only the latest OTP is valid; old one is invalidated.
- Duplicate phone number/email at registration → blocked by `UNIQUE` DB constraints, returns `409`.
- Mechanic's browser GPS permission denied → registration proceeds with `lat/lng = NULL`; mechanic won't appear in nearby searches until updated.
- Cash amount entered as negative or non-numeric → rejected with `400` server-side validation.
- Server restarts mid-job → in-memory `active_jobs` and `_token_store` are wiped; motorist/mechanic must `rejoin_job` using the DB-backed `job_id`.

### 1.6 Failure Scenarios
| Scenario | Current Behavior [AS-BUILT] | Ideal Behavior [AT SCALE] |
|---|---|---|
| Gunicorn worker crashes mid-job | All in-memory state (`active_jobs`, tokens, socket rooms) is lost; users must reconnect | Redis-backed session/state store survives process restarts; multiple workers behind a load balancer |
| Mechanic never marks job complete | Job stays `accepted` forever | Timeout job to `stale`/`cancelled` after N hours, notify motorist, allow re-dispatch |
| Gmail SMTP quota exhausted (500/day) | OTP silently fails to send; terminal-print fallback used in dev only | Multi-provider transactional email/SMS with failover (SES + Twilio) |
| Neon DB connection spike | Each request opens a fresh psycopg2 connection; can exhaust Neon's connection limit under load | Connection pooling via `pgbouncer` or `asyncpg` pool |
| Socket disconnects during GPS tracking | `mechanic_ping` events stop; last known position frozen on map | Client auto-reconnect + `rejoin_job`; server timeout marks mechanic "signal lost" after N seconds of silence |

### 1.7 Acceptance Criteria (representative)
- **Given** a job is `pending` and 3 mechanics receive the broadcast, **when** two accept within the same second, **then** exactly one job row transitions to `accepted` and the other request returns `409`.
- **Given** a motorist has a valid session token, **when** they call `POST /jobs/create` with a supported `issue_type`, **then** a job row is created and up to 3 nearby available mechanics are notified via Socket.IO.
- **Given** an OTP was issued less than 300 seconds ago, **when** the correct code is submitted, **then** the account is verified and a session token is returned; a stale/expired OTP is rejected.

---

## 2. Users

### 2.1 Types of Users
1. **Motorist / Driver (User)** — raises breakdown jobs, tracks mechanics, pays cash.
2. **Mechanic** — registers a workshop, toggles availability, accepts/completes jobs.
3. *(Not implemented, natural next role)* **Admin/Ops** — would moderate mechanic onboarding, view disputes, monitor MRI scores.

### 2.2 Roles & Permissions (RBAC)
| Capability | Motorist | Mechanic | Admin (future) |
|---|:---:|:---:|:---:|
| Register / verify OTP | ✅ | ✅ | — |
| Create job | ✅ | ❌ | ❌ |
| View nearby mechanics | ✅ (indirect, via job create) | ❌ | ✅ |
| Accept a job | ❌ | ✅ | ❌ |
| Complete a job / enter cash amount | ❌ | ✅ (only if assigned) | ❌ |
| Toggle availability | ❌ | ✅ | ✅ (override) |
| View any job | Own jobs only | Own assigned jobs only | All jobs |
| View `/socket-status` debug route | Public (no auth, demo-only) | Public | Public |

**[AS-BUILT]** RBAC is enforced with a lightweight `require_auth` decorator that reads `Authorization: Bearer <token>`, looks the token up in an in-memory `_token_store`, and attaches `g.auth = {id, role}`. Route handlers additionally check `g.auth['role']` and ownership (e.g. `PATCH /jobs/:id/complete` verifies `mechanic_id == g.auth['id']`).

**[AT SCALE]** Role model would move to signed JWT claims (`role`, `sub`, `scope`) validated by middleware/API gateway, with a proper `admin` role and audit logging around any override actions (e.g. force-completing a stuck job).

### 2.3 User Workflow per Role

**Motorist:**
`Register → Email OTP verify → Select issue type → Share GPS → Job broadcast → Wait for match_confirmed → Track mechanic on map → Chat/wait → Mechanic arrives → Pay cash → Receive PDF receipt`

**Mechanic:**
`Register (GPS auto-captured) → Email OTP verify → Toggle "Available" → Receive new_job alert → Tap Accept (race) → If winner: emit GPS every 4s → Drive to motorist → Enter cash_amount → Mark complete → MRI score recalculated`

### 2.4 Authentication
- **[AS-BUILT]** Passwordless: identity is established via a 6-digit OTP emailed through Gmail SMTP (`smtplib.SMTP_SSL`), stored in `otp_store` keyed by email with a 300-second TTL and an `ON CONFLICT (email) DO UPDATE` so only one OTP is ever live per address. Successful verification issues an opaque `secrets.token_hex` session token held only in an in-memory dict and in JS memory client-side — **never in `localStorage`**, to reduce XSS token-theft risk.
- **[AT SCALE]** Replace bespoke OTP + hex token with a standards-based flow: short-lived **JWT access token** + **refresh token** rotation, OTP/SMS delivered via a provider with delivery guarantees (Twilio/SNS), optional password + 2FA (`two_fa_method` column already reserved in schema for this).

### 2.5 Authorization
Every protected route (`/jobs/*`) requires a valid bearer token; the `require_auth` decorator resolves it to a `(id, role)` pair, and handlers enforce **resource ownership** (a mechanic can only complete jobs assigned to them; a motorist can only view their own jobs). This is coarse-grained RBAC rather than fine-grained ABAC/policy engine — appropriate for two roles and a hackathon timeline.

### 2.6 Session Management
- **[AS-BUILT]** Sessions are a Python dict (`_token_store`) mapping `token → {id, role}`, living entirely in process memory. This means: (a) sessions do not survive a server restart or scale to multiple workers, and (b) there is no TTL/expiry — a token is valid until the process restarts. The `rejoin_job` Socket.IO event exists specifically to recover a user's room membership if their socket drops mid-job, using the still-valid session token.
- **[AT SCALE]** Move session state to Redis with a TTL matching token lifetime (e.g. sliding 24h expiry), enabling multi-worker deployment and horizontal scaling without losing login state.

---

## 3. Architecture

### 3.1 High-Level Architecture [AS-BUILT]
```
┌┐
│                         BROWSER (PWA)                             │
│   register_user.html / register_mechanic.html                     │
│   dashboard_user.html / dashboard_mechanic.html (Leaflet + JS)     │
└─┬┘
                │ HTTPS (REST) + WSS (Socket.IO)
┌─┴┐
│                Flask + Flask-SocketIO (single process)              │
│   Blueprints:  /auth  /mechanics  /jobs   Socket handlers            │
│   In-memory:  active_jobs{}, _token_store{}                          │
└─┬┘
                │ psycopg2 (raw SQL)
┌─┴┐
│                     Neon PostgreSQL (managed, free tier)             │
│   users · mechanics · jobs · job_broadcasts · otp_store              │
│   mri_events · receipts                                              │
└┘
                │
        Gmail SMTP (OTP email delivery)
```

### 3.2 Low-Level Architecture / Component Diagram
```
backend/
├ app.py              → Flask app factory, SocketIO init, blueprint registration, /health, /socket-status
├ db.py                → get_db() context manager, init_db() DDL (CREATE TABLE IF NOT EXISTS ...)
├ seed.py              → idempotent seed of 20 Lucknow mechanics
└ routes/
    ├ auth.py           → /auth/register/user, /auth/register/mechanic, /auth/verify-otp, require_auth()
    ├ mechanic.py       → GET /mechanics/nearby (in-memory Haversine ranking), fetch_nearby_mechanics()
    ├ job.py            → POST /jobs/create, PATCH /jobs/:id/accept (atomic), PATCH /jobs/:id/complete, GET /jobs/:id
    ├ socket_events.py  → connect/disconnect, mechanic_location, rejoin_job, emit_new_job(), emit_match_confirmed()
    ├ mri.py            → Mechanic Reliability Index aggregation query
    ├ receipt.py        → ReportLab PDF generation
    ├ push.py           → Web Push notification dispatch
    └ common.py         → db_error_response() shared error helper
```
Each blueprint owns a single bounded responsibility; `job.py` is the only module that mutates job state and is the sole place the atomic-accept guarantee lives.

### 3.3 Deployment Architecture
**[AS-BUILT]**: Render Web Service (`gunicorn --worker-class eventlet -w 1 app:app`) + Neon serverless Postgres + Gmail SMTP, all free tier, single region.

**[AT SCALE]**:
```
Client → CDN (static assets) → API Gateway / Load Balancer
                                     │
                     ┌─┼─┐
              Flask/Gunicorn    Flask/Gunicorn   Flask/Gunicorn   (N pods, autoscaled)
                     │               │               │
                     └─ Redis (sessions, Socket.IO broker, cache) 
                                     │
                          Postgres primary → read replicas
                                     │
                     Message queue (SQS/Kafka) → async workers
                                     │
                        (MRI recompute, receipts, notifications)
```

### 3.4 Service Boundaries
Even inside the monolith, boundaries are already logical: **Identity** (auth.py), **Discovery** (mechanic.py), **Dispatch** (job.py), **Real-time** (socket_events.py), **Reliability** (mri.py), **Documents** (receipt.py), **Notifications** (push.py). This is deliberate — it means a future split into services follows existing seams instead of requiring a rewrite.

### 3.5 Monolith vs Microservices
| | [AS-BUILT]: Monolith | [AT SCALE]: Microservices |
|---|---|---|
| Deploy | Single Flask process, single deploy | Independent services: Identity, Dispatch, Tracking, Billing/Receipts, Notifications |
| Why chosen | Zero infra cost, one demo deploy target, small team, tight timeline | Independent scaling (Dispatch/Tracking need to scale far more than Receipts), independent release cadence |
| Cost of splitting too early | N/A — correctly avoided for a hackathon | Operational overhead: service discovery, distributed tracing, network latency between services |
| Trigger to split | N/A | Sustained load where one component (e.g. real-time tracking) needs 10x the compute of others |

**Reasoning for the interview:** the right call for a 4-person team on a 2-week hackathon clock is a monolith — microservices would have added deployment complexity with zero payoff at this scale. The codebase's blueprint separation means that decision is *reversible* later without a rewrite.

### 3.6 Complete Architecture Summary
A single Flask+SocketIO process is the API, the WebSocket server, and the page renderer (Jinja2) all at once, backed by one serverless Postgres instance and one outbound SMTP relay — deliberately minimal, deliberately free, deliberately race-condition-safe at the one point (job acceptance) where correctness genuinely matters.

---

## 4. Technology Stack

| Layer | Technology | Why chosen |
|---|---|---|
| Backend | Python 3.11–3.13, Flask 3.0 | Team expertise, stable on Render free tier |
| Real-time | Flask-SocketIO 5.3 + eventlet (prod) / threading (tests) | Bidirectional events for GPS + job state, needed for map + chat |
| Database | Neon PostgreSQL (serverless, free tier) | `gen_random_uuid()` native support via `pgcrypto`, zero-cost |
| DB access | psycopg2, raw SQL (no ORM) | Cleaner control over exact queries; avoids ORM overhead for a small schema |
| Frontend | Jinja2 templates + Vanilla JS (no framework, no build step) | Works in any mobile browser instantly, no npm/install friction on demo day |
| Map | Leaflet.js + OpenStreetMap tiles | No API key, no billing risk — a deliberate anti-fragility choice for a live demo |
| Auth | `secrets.token_hex` opaque tokens, in-memory store | Simple enough for a hackathon session model |
| OTP delivery | Python `smtplib` → Gmail SMTP, terminal-print fallback | No SMS budget; email OTP is "free" |
| PDF | ReportLab (`platypus`, server-side, in-memory `BytesIO`) | No external PDF microservice needed |
| Production server | Gunicorn + eventlet worker | Required for Socket.IO concurrency under WSGI |
| Hosting | Render (app) + Neon (DB) | Zero-cost, non-negotiable hackathon constraint |

### Backend Details
Flask app factory pattern (`create_app()`), blueprint-per-domain, a single global `SocketIO` instance stored on `app.extensions['socketio']`, `init_db()` running idempotent `CREATE TABLE IF NOT EXISTS` DDL rather than a migrations framework.

### Frontend Details
Server-rendered Jinja2 pages (`base.html` layout) plus page-specific vanilla JS modules (`register.js`, `dashboard_user.js`, `dashboard_mechanic.js`, `login.js`) — an IIFE-module pattern is used for dashboard state, with `sessionStorage` used only transiently for login/registration handoff, then cleared. A `sw.js` service worker exists for the offline/PWA behavior.

### Libraries & Frameworks
Flask, Flask-SocketIO, psycopg2, ReportLab, eventlet, Leaflet.js — deliberately minimal; no React/Vue, no CSS framework beyond a hand-written `base.css`.

### Infrastructure Used
Render (compute), Neon (Postgres), Gmail SMTP (email) — three free-tier services, zero paid infrastructure.

---

## 5. APIs

### 5.1 API Endpoints
```
POST   /auth/register/user
POST   /auth/register/mechanic
POST   /auth/verify-otp
GET    /mechanics/nearby?lat=&lng=&radius_km=
POST   /jobs/create
PATCH  /jobs/:job_id/accept
PATCH  /jobs/:job_id/complete
GET    /jobs/:job_id
GET    /health
GET    /socket-status
```

### 5.2 API Contracts (request/response models)
```
POST /auth/register/user
  Request:  { first_name, email, phone_number, country, last_name? }
  Response 201: { user_id, message, expires_in_seconds, email_delivery }

POST /auth/verify-otp
  Request:  { email, otp, role }              role ∈ {user, mechanic}
  Response 200: { message, session_token, role, id }
  Response 400: invalid/expired OTP

POST /jobs/create                              [requires user auth]
  Request:  { issue_type, lat, lng, photo_base64? }
  Response 201: { job: {...}, mechanics_notified: N }

PATCH /jobs/:job_id/accept                     [requires mechanic auth]
  Request:  { mechanic_id }
  Response 200: { job: {...} }
  Response 409: job already accepted

PATCH /jobs/:job_id/complete                   [requires mechanic auth, must be assignee]
  Request:  { cash_amount }
  Response 200: { job: {...} }
  Response 400: cash_amount < 0, or job not in 'accepted' state
```

### 5.3 Validation
Server-side validation guards every state-changing route: `issue_type` must be one of the 5 allowed enum strings; `cash_amount` must be numeric and `≥ 0`; UUIDs are parsed and rejected as `400` if malformed (`_parse_uuid` helper); phone/email uniqueness enforced at the DB level via `UNIQUE` constraints, surfaced as `409`.

### 5.4 Error Handling
A shared `db_error_response()` helper in `common.py` normalizes psycopg2 exceptions into consistent JSON error bodies (`{ "error": "..." }`) with appropriate HTTP status codes, so every route doesn't need to hand-roll exception handling.

### 5.5 Versioning
**[AS-BUILT]** None — a single unversioned API surface, acceptable for a hackathon prototype with one client. **[AT SCALE]** URI or header-based versioning (`/v1/jobs/...` or `Accept: application/vnd.ottomech.v1+json`) would be introduced once external clients (a real mobile app) depend on stability.

### 5.6 Idempotency
The most important idempotent operation in the system is **job acceptance**: `UPDATE jobs SET mechanic_id=%s, status='accepted' WHERE job_id=%s AND status='pending' RETURNING job_id` can be safely retried by a flaky client — a retry after a successful accept simply returns no row (`409`) rather than double-assigning. `seed.py` is also written to be idempotent (safe to re-run without duplicating garages).

### 5.7 Pagination
**[AS-BUILT]** Not needed — `/mechanics/nearby` is hard-capped to the 3 closest results by design (a full SOS broadcast list, not a browsable list). **[AT SCALE]** A future "mechanic history" or "job history" endpoint would need cursor-based pagination (`?cursor=&limit=`) to avoid deep `OFFSET` scans.

### 5.8 Rate Limiting
**[AS-BUILT]** None implemented — an accepted risk for a hackathon demo (Gmail's own 500-emails/day cap is the de facto ceiling on OTP abuse). **[AT SCALE]** Per-IP and per-account rate limiting on `/auth/register/*` and `/auth/verify-otp` (e.g. sliding-window counter in Redis) to block OTP-bombing and brute-force guesses of the 6-digit code.

### 5.9 API Security
Bearer-token auth on all mutating routes, server-side enum/type validation, parameterized SQL everywhere (no string-interpolated queries → no SQL injection surface), secrets loaded from environment variables (`DATABASE_URL`, `GMAIL_APP_PASSWORD`, `SECRET_KEY`) rather than hardcoded. `/socket-status` is intentionally unauthenticated but only exposes an aggregate count, not per-user data.

---

## 6. Database

### 6.1 Database Selection
**Neon PostgreSQL** — chosen for its serverless free tier, native `pgcrypto`/`gen_random_uuid()` support (avoiding client-generated UUIDs), and standard SQL semantics that make the atomic-accept guarantee (below) trivial to express, versus a NoSQL store where that single-writer-wins guarantee would need application-level locking.

### 6.2 Database Schema / Data Model
```
users            (user_id UUID PK, first_name, last_name, email UNIQUE, phone_number UNIQUE,
                  country, phone_verified, email_verified, status, last_login, ...)
mechanics        (mechanic_id UUID PK, workshop_name, address, zone, is_available,
                  rating, mri_score, lat/lng captured via geolocation, ...)
otp_store        (email PK, otp_code, purpose, expires_at)
jobs             (job_id UUID PK, driver_id FK→users, mechanic_id FK→mechanics (nullable),
                  issue_type, status, lat, lng, cash_amount, created_at, accepted_at, completed_at)
job_broadcasts   (job_id FK, mechanic_id FK, responded, accepted)
mri_events       (mechanic_id FK, event_type, value, recorded_at)
receipts         (job_id FK UNIQUE, pdf_base64, cash_amount, warranty_days)
```

### 6.3 ER Diagram (textual)
```
users (1) ─< jobs >─ (1) mechanics
                │
                ├< job_broadcasts > mechanics
                └< receipts (1:1)

mechanics (1) ─< mri_events
```

### 6.4 Relationships
- One user → many jobs (1:N).
- One mechanic → many jobs, but each job has at most one mechanic (1:N, nullable until accepted).
- One job → many `job_broadcasts` rows (one per notified mechanic), exactly one of which is the eventual `accepted=TRUE` winner.
- One job → at most one receipt (1:1, `UNIQUE` FK).
- One mechanic → many `mri_events` (1:N), aggregated into a single `mri_score`.

### 6.5 Indexing Strategy
A **partial index** `WHERE status='pending'` on `jobs` makes concurrent "find pending job to accept" lookups fast without indexing the (larger, less relevant) `completed`/`accepted` rows. `job_broadcasts` is indexed on `job_id` (`idx_job_broadcasts_job`) since every accept operation needs to close out all sibling broadcast rows for that job. `mri_events` is indexed on `mechanic_id` (`idx_mri_events_mechanic`) since the MRI score is computed by aggregating a mechanic's full event history.

### 6.6 Query Optimization
The MRI score is deliberately computed as **one aggregated SQL query** (SUM/AVG/CASE over `mri_events`) rather than looping in application code — avoiding N+1 queries. The nearby-mechanics query filters `is_available = TRUE` first (cheapest, most selective predicate) before any distance math, and distance itself is computed in Python/memory rather than requiring a spatial index — a deliberate simplification since job volume in the hackathon is a handful of concurrent jobs, not thousands.

### 6.7 Transactions
The job-accept operation is a **single atomic UPDATE statement** — PostgreSQL's own row-level locking is the transaction boundary, avoiding the complexity (and bug surface) of an explicit `BEGIN/COMMIT` with `SELECT FOR UPDATE`. Closing out `job_broadcasts` (winner + losers) happens in the same DB connection/transaction as the job update, so a crash between the two can never leave broadcasts inconsistent with the job's actual state.

### 6.8 Sharding Strategy
**[AS-BUILT]** None — single Neon instance, appropriate for hackathon-scale data. **[AT SCALE]** Shard `jobs`/`job_broadcasts` by geography (city/zone) since dispatch is inherently local — a job in Lucknow never needs to join against a mechanic in Mumbai, making geo-sharding a natural, low-cross-shard-traffic choice.

### 6.9 Replication
**[AS-BUILT]** Neon's managed service handles storage durability; no explicit read-replica setup. **[AT SCALE]** Add read replicas for reporting/analytics workloads (MRI dashboards, admin views) so they never contend with the hot dispatch path.

### 6.10 Partitioning
**[AT SCALE]** Time-based partitioning of `jobs`/`mri_events` (e.g. monthly) once history grows large, keeping the "hot" partial index on active jobs small and fast.

### 6.11 Backup & Recovery
**[AS-BUILT]** Relies on Neon's built-in point-in-time recovery on its free tier. **[AT SCALE]** Scheduled logical dumps (`pg_dump`) to object storage in addition to managed PITR, with a documented, tested restore runbook.

---

## 7. System Flows

### 7.1 Request Flow (User Booking / Dispatch)
```
Motorist submits issue_type + GPS
   → POST /jobs/create (auth required)
   → Server inserts job row (status='pending')
   → fetch_nearby_mechanics(): filter is_available=TRUE, rank by Haversine distance, take top 3
   → Insert job_broadcasts row per notified mechanic
   → socketio.emit('new_job', ..., room='mechanic_<id>') for each of the 3
   → Response: { job, mechanics_notified: 3 }
```

### 7.2 Driver/Mechanic Location Flow
```
Mechanic's browser: navigator.geolocation.getCurrentPosition() every 4s
   → socket.emit('mechanic_location', { job_id, lat, lng })
   → Server looks up active_jobs[job_id] for the driver's socket/room
   → Computes distance via Spherical Law of Cosines
   → socketio.emit('mechanic_ping', { lat, lng, distance_remaining_m }, room='driver_<id>')
   → GPS pings are NEVER written to the database — memory only
```

### 7.3 Payment Flow
Cash-only, no gateway integration by explicit design choice (removes a whole category of demo-day failure risk — no sandbox keys, no webhook flakiness). `PATCH /jobs/:id/complete` accepts a `cash_amount`, server validates `≥ 0`, persists it on the job row, and `receipt.py` renders a PDF receipt with ReportLab, returned as base64 — no external PDF service, no file storage bucket needed.

### 7.4 Notification Flow
Two parallel channels on job creation: (1) an in-app `new_job` Socket.IO event to connected mechanics, and (2) a Web Push notification (`push.py`) so an available mechanic who has the tab backgrounded still gets alerted.

### 7.5 Authentication Flow
`Register → OTP emailed (300s TTL) → verify-otp → opaque session token issued (in-memory only) → token sent as Socket.IO auth payload on connect → server joins driver_<id>/mechanic_<id> room`.

### 7.6 Data Synchronization / Background Job / Cache Flow
**[AS-BUILT]** None of these exist as distinct subsystems — there is no background job runner, no cache layer, and no offline write-sync beyond the PWA's service worker (`sw.js`) caching static assets for basic offline shell rendering. **[AT SCALE]** MRI recomputation and receipt generation would move to an async worker queue rather than running inline on the request path; Redis would back both the Socket.IO message broker and a read-through cache for `mechanics/nearby`.

---

## 8. Communication

### 8.1 HTTP Request Lifecycle
Standard Flask WSGI request → blueprint route match → `require_auth` middleware (if protected) → handler → raw SQL via `get_db()` context manager → JSON response.

### 8.2 REST vs GraphQL vs gRPC
**[AS-BUILT]** REST + WebSockets (Socket.IO) — REST is the right choice here because the API surface is small, resources map cleanly to nouns (`jobs`, `mechanics`), and REST/JSON needs zero client tooling for a vanilla-JS PWA. GraphQL would add resolver complexity for no real benefit at this scale; gRPC would add a binary protocol/codegen step with no browser-native transport advantage over WebSockets for the real-time piece.

### 8.3 Internal Service Communication
**[AS-BUILT]** N/A — single process, direct Python function calls between blueprints (e.g. `job.py` imports `fetch_nearby_mechanics` directly from `mechanic.py`). **[AT SCALE]** If split into services: synchronous REST/gRPC for request/response needs (auth check), asynchronous events for anything that can be eventually consistent (MRI updates, notifications).

### 8.4 Event-Driven Communication / Pub-Sub / Message Queues
**[AS-BUILT]** None — Socket.IO's own room-based pub/sub *is* the event system, running in-process. **[AT SCALE]** Introduce Kafka/RabbitMQ/SQS once there's more than one consumer of "job completed" (e.g. MRI service, receipt service, analytics service all reacting independently) — this decouples producers from consumers and adds replay/backfill capability that in-process events can't offer.

### 8.5 Retry Mechanisms & Dead Letter Queue
**[AS-BUILT]** None. **[AT SCALE]** Idempotent consumers + exponential backoff retry for async jobs (e.g. PDF generation failure), with a DLQ to catch messages that fail after N retries for manual inspection rather than being silently dropped.

---

## 9. Real-Time Communication

| Mechanism | Used? | Why / why not |
|---|---|---|
| **WebSockets (Socket.IO)** | ✅ Core of the system | Only mechanism low-latency enough for live GPS tracking and instant job broadcast; bidirectional (mechanic → server → user) |
| Polling | ❌ | Would add multi-second latency to job dispatch — unacceptable for an SOS use case |
| Long Polling | ❌ | Superseded by WebSockets; no reason to fall back given modern browser support |
| Server-Sent Events (SSE) | ❌ | One-directional only — can't carry mechanic→server GPS pings |
| WebRTC | ❌ | Not needed — no peer-to-peer media/voice/video requirement |
| HTTP/2 / HTTP/3 / QUIC | Inherited from hosting platform | Not explicitly configured; Render's edge network provides HTTP/2 by default |
| Push Notifications | ✅ (`push.py`) | Reaches mechanics whose tab is backgrounded, complementing the socket channel |
| Location streaming | ✅ | `mechanic_location` → `mechanic_ping`, 4-second client-side interval, in-memory only, never persisted |

---

## 10. Caching

### 10.1 Why Cache? / Strategy
**[AS-BUILT]** No caching layer exists — read volume (a handful of concurrent jobs, 20 seeded mechanics) doesn't warrant one, and the one thing that must never be stale (job `pending`/`accepted` status) is exactly the thing you should *not* cache. **[AT SCALE]** Cache `GET /mechanics/nearby` results per geo-cell for a few seconds (mechanics don't teleport), and cache static/rarely-changing mechanic profile data (`workshop_name`, `rating`) with a short TTL, invalidated on profile update.

### 10.2 Redis Usage / CDN / Invalidation / Consistency
**[AT SCALE]** Redis would take on three roles simultaneously: Socket.IO's `message_queue` broker (to let multiple Gunicorn workers share socket rooms), the session/token store (replacing `_token_store`), and a read-through cache. A CDN would front static assets (`base.css`, Leaflet tiles proxy, logo SVGs) — none of which exist yet since Render already serves these directly and traffic is low. Cache invalidation would follow a simple write-through pattern: any mutation to `mechanics.is_available` or `rating` busts that mechanic's cache key immediately.

---

## 11. Scalability

| Concern | [AS-BUILT] approach | Trade-off accepted | [AT SCALE] fix |
|---|---|---|---|
| Concurrency | `eventlet` + single Gunicorn worker | Can't use multiple CPU cores | Multiple workers + Redis Socket.IO broker |
| Session state | In-memory `_token_store` | Lost on restart | Redis with TTL |
| GPS tracking state | In-memory `active_jobs` dict | Lost on restart | Redis, keyed by `job_id` |
| DB connections | Fresh psycopg2 connection per request | Can exhaust connection limits under load | Connection pooler (`pgbouncer`) |
| Geo indexing | Pure in-memory Haversine/Spherical-Law-of-Cosines filtering | Doesn't scale past a few thousand mechanics in memory | PostGIS spatial index + `ST_DWithin` query |
| Concurrency guard on accept | Single-row atomic `UPDATE ... RETURNING` | None — this approach scales fine as-is | Same approach retained even at scale; it's already correct |
| Horizontal vs vertical scaling | Vertical only (bigger Render instance) | Simpler ops | Horizontal — stateless app servers behind a load balancer once Redis removes in-memory state |
| Auto-scaling / capacity planning | None (fixed free-tier dyno) | Fine for demo traffic | Autoscaling group keyed on CPU/connection count, capacity planned around peak SOS-request bursts (e.g. rain/storm events) |

**Biggest performance bottleneck if scaled as-is:** the single Gunicorn worker becomes a hard ceiling on concurrent WebSocket connections and blocks all other requests during any slow DB call, since there's no worker pool to fall back on.

---

## 12. Reliability

- **High availability**: [AS-BUILT] none — a single Render instance is a single point of failure. [AT SCALE] multi-instance deployment across at least 2 availability zones behind a load balancer with health-check-based failover.
- **Fault tolerance / circuit breaker / timeouts**: [AS-BUILT] `emit_match_confirmed` is deliberately called *after* the DB transaction commits and wrapped in its own `try/except`, so a Socket.IO failure can never roll back an already-accepted job — a small but real fault-isolation decision already in the code. [AT SCALE] add circuit breakers around external calls (email provider, push service) so a slow OTP provider can't cascade into blocking registrations entirely.
- **Retry strategy**: [AS-BUILT] client-side reconnect + `rejoin_job` is the only retry path. [AT SCALE] exponential backoff on background job workers.
- **Graceful degradation**: OTP has a terminal-print fallback if SMTP env vars are missing — the system degrades to "demo mode" rather than hard-failing registration.
- **Disaster recovery / failover**: [AT SCALE] documented RTO/RPO targets, tested restore from Neon PITR or logical backups, multi-region failover for the app tier.

---

## 13. Security

- **Authentication**: OTP-gated, opaque bearer tokens (see §2.4).
- **Authorization**: Role + ownership checks per route (see §2.5).
- **JWT/OAuth**: Not used [AS-BUILT] — a deliberate simplification; [AT SCALE] JWT access + refresh tokens would replace the hex-token store.
- **Encryption / HTTPS-TLS**: TLS terminated at Render's edge; Neon connections are TLS by default.
- **Secrets management**: `DATABASE_URL`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, `SECRET_KEY` are environment variables, never committed; [AT SCALE] a real secrets manager (AWS Secrets Manager/Vault) with rotation.
- **SQL injection prevention**: All queries use parameterized psycopg2 placeholders (`%s`) — no string-interpolated SQL anywhere in the codebase.
- **XSS/CSRF protection**: Jinja2 auto-escapes template output by default; tokens are kept out of `localStorage` specifically to blunt XSS-based token theft. No explicit CSRF token scheme [AS-BUILT] since the API is bearer-token authenticated (not cookie-session based), which structurally avoids classic CSRF.
- **API security / rate limiting**: See §5.8–5.9 — validation and parameterized queries are in place; rate limiting is the clearest known gap.
- **Audit logs**: Not implemented [AS-BUILT]; [AT SCALE] every accept/complete/override action would be appended to an immutable audit log for dispute resolution.

---

## 14. Performance

- **Latency**: Dominated by (a) Neon connection setup per request (no pooling) and (b) Socket.IO emit latency, both acceptable at demo scale.
- **Throughput**: Bounded by the single eventlet worker — fine for a handful of concurrent jobs, not for city-scale traffic.
- **Network optimization / compression / lazy loading**: Minimal — no build step means no bundling/minification/tree-shaking; static assets are served as-is. [AT SCALE] a CDN + asset bundling would meaningfully cut first-load time.
- **Database optimization**: Partial index on `jobs.status='pending'`, single aggregated MRI query — both already reflect real query-optimization thinking rather than defaults.
- **Profiling / benchmarking**: Not formally done beyond the 51-test pytest suite verifying correctness (including a dedicated concurrency test with a threading barrier simulating 3 simultaneous accepts).

---

## 15. Observability

| Pillar | [AS-BUILT] | [AT SCALE] |
|---|---|---|
| Logging | Python `logging` module used in route handlers (e.g. `job.py`) | Centralized structured logging (JSON logs → ELK/Datadog) |
| Metrics | `/socket-status` exposes `connected_jobs` count — a hand-rolled debug metric | Prometheus counters/histograms for request latency, job funnel conversion, error rates |
| Monitoring | `/health` endpoint pinged every 5 min pre-demo to avoid Render cold starts | Full uptime monitoring + SLO dashboards |
| Tracing | None | Distributed tracing (OpenTelemetry) once split into services |
| Alerting | None | PagerDuty/Slack alerts on error-rate or latency SLO breach |
| Dashboards | None | Grafana dashboards for job throughput, MRI distribution, dispatch success rate |
| Health checks | `GET /health` → `{status: "ok"}` | Deep health checks (DB connectivity, SMTP reachability) feeding load-balancer routing decisions |

---

## 16. DevOps

- **CI/CD**: [AS-BUILT] manual `git push` → Render auto-deploys on push to the connected branch; a pytest suite exists but isn't wired into a gated CI pipeline in the repo. [AT SCALE] GitHub Actions running the full test suite + linting on every PR, blocking merge on failure, then auto-deploying on merge to `main`.
- **Docker / Kubernetes / IaC**: Not used [AS-BUILT] — Render's own buildpack handles the Python environment. [AT SCALE] containerize with Docker, orchestrate with Kubernetes (or a managed equivalent) once running multiple services, and manage infra via Terraform.
- **Environment management**: `.env.example` documents required variables; real secrets live only in Render's dashboard, never in git.
- **Deployment strategy**: Single-instance rolling deploy on push [AS-BUILT]; [AT SCALE] blue-green or canary deployment to de-risk releases, with automated rollback on health-check failure.

---

## 17. Testing

- **[AS-BUILT]** 51 passing pytest tests across registration, dispatch, and real-time stages, including `TestJobAccept::test_concurrent_accept_exactly_one_wins` — 3 threads racing to accept the same job using a `threading.Barrier` to force true simultaneity, proving the atomic-UPDATE guarantee under contention. This is genuinely the most important test in the suite: it validates the one correctness property (exactly-one-winner) that the whole dispatch model depends on.
- **[AT SCALE]** Add integration tests against a real Postgres test container (rather than assuming Neon dev credentials), load/stress testing to find the actual worker-count ceiling, and basic chaos testing (kill the DB connection mid-request) to verify graceful error responses rather than 500s leaking stack traces.

---

## 18. Product Features

### Current Features
Passwordless email-OTP registration for two roles; nearest-3 broadcast dispatch; race-free atomic accept; live Leaflet GPS tracking; cash-only completion with server-computed MRI score and a generated PDF receipt; PWA shell with basic offline caching.

### Future Features
Admin/ops dashboard; in-app chat (schema/rooms already support it structurally); rating/review submission by motorists; multi-language UI (`language` column already reserved on both `users` and `mechanics`); SMS OTP fallback; scheduled/non-emergency bookings.

### Nice-to-Have
Push-notification-based mechanic re-engagement for idle accounts; a public mechanic leaderboard by MRI score; warranty-claim tracking UI (the `mri_events.WARRANTY_CLAIM` event type already exists in the schema, unused by any current UI).

### Competitive Landscape

**Government / quasi-government players (closest equivalents, but not true competitors)**
- **State highway patrol & emergency helplines** — e.g. NHAI's highway patrol vans and toll-free helplines (`1033` on national highways in many states) dispatch towing/ambulance support, but this is accident/emergency-focused rather than general breakdown assistance (flat tyre, dead battery, etc.).
- **State emergency response services** — e.g. Delhi's CATS ambulance service and state traffic-police helplines handle accidents and road obstructions, not routine mechanical breakdowns.
- These government channels are reactive and call-based: no live GPS tracking, no app/booking flow, and no "nearest available mechanic" matching — structurally different from OttoMech's model, so they function more as an adjacent public-safety net than a direct competitor.

**Real competitors — all private sector**
| Competitor | Model | Notable differentiator |
|---|---|---|
| **ReadyAssist** | AI-driven roadside assistance network, claims 11,000+ service providers across 19,100+ pincodes nationwide | National scale, enterprise/OEM/fleet partnerships |
| **DriveFixit** | App-based dispatch with real-time mechanic GPS tracking | Operates in 100+ cities, ~20 min average response |
| **Apna Mechanic** | Two-wheeler-focused roadside assistance | Mechanics kept within ~5 km, 200+ bike mechanics across tier-1 cities |
| **Crossroads, RoadServe, AutoAid, Road Mech 24x7** | Regional/city RSA operators | City-specific coverage (Delhi-NCR, Mumbai, Jaipur, etc.) |
| **OEM RSA programs** (Maruti Suzuki, Hyundai, Tata, Toyota, Ford, Honda) | Manufacturer-run helplines | Only for that brand's owners, typically under warranty/membership — a closed, brand-locked model |

**OttoMech's positioning against this field:** most incumbents require an app download and card/UPI/wallet payment. OttoMech's install-free PWA and cash-only, no-payment-gateway model is a deliberate wedge against that friction, paired with a hyperlocal Lucknow-first focus rather than a national rollout — a "start dense in one city, no login friction" strategy versus competitors optimizing for national scale from day one.

### Trade-offs & Rejected Alternatives
| Rejected | Reason |
|---|---|
| Google Maps / Mapbox | API key + billing risk on demo day; Leaflet+OSM is zero-config and zero-failure-mode |
| Any payment gateway (Paytm/PhonePe/UPI) | Explicit scope decision — sandbox flakiness is a top demo-day risk; cash removes an entire failure category |
| SQLAlchemy/ORM | Raw psycopg2 judged cleaner for this schema's size and the team's SQL fluency |
| PostGIS spatial queries | In-memory Haversine/Spherical-Law-of-Cosines is simpler to reason about and fast enough at hackathon data volumes |
| Celery + Redis for background jobs | Not needed until MRI/receipt volume actually requires async processing |
| Firebase Auth | Out of scope — custom OTP flow chosen as the system of record instead |

---

## 19. Cost Analysis

| Item | [AS-BUILT] cost | [AT SCALE] cost driver |
|---|---|---|
| Infrastructure (compute) | $0 — Render free tier | Autoscaled compute instances, biggest line item at scale |
| Database | $0 — Neon free tier | Storage + compute-hours + read-replica cost as data grows |
| Network / egress | $0 — within free-tier limits | CDN + cross-region egress once multi-region |
| Storage | $0 — PDFs stored as base64 in Postgres, no object storage | Move receipts to S3/Blob storage once volume makes DB storage inefficient |
| Scaling cost | N/A | Redis, message queue, load balancer, multi-AZ all add recurring cost |
| Optimizations already made | Free-tier-only stack was itself the primary cost optimization for this project's constraints | At scale: reserved-instance pricing, spot instances for async workers, tiered storage for old job history |

---

## 20. Project Discussion

### Challenges Faced
- Guaranteeing **exactly one** mechanic wins a job under concurrent accepts, without adding application-level locking complexity — solved with a single atomic SQL statement rather than `SELECT FOR UPDATE` + explicit transaction management.
- Keeping the demo **zero-cost and zero-external-dependency-risk** (no Maps billing, no payment sandbox, no SMS budget) while still feeling like a real, live product on stage.
- Handling **eventlet's incompatibility with Python 3.12+**, which forced pinning the production runtime to Python 3.11 while allowing the test suite (which bypasses gunicorn) to use plain threading.
- Recovering gracefully from **in-memory state loss** (sessions, active jobs) on server restart, addressed with a `rejoin_job` reconnect event rather than a full persistent session store (a deliberate scope trade-off).

### Design Decisions & Trade-offs
Covered throughout this document via the `[AS-BUILT]` vs `[AT SCALE]` framing — the short version: every trade-off in OttoMech optimizes for **demo-day reliability and $0 cost** over long-term scalability, and does so consciously rather than by accident (the project's `Agent.md` institutional-memory file documents *why* each alternative was rejected, not just what was chosen).

### Lessons Learned
Atomicity at the database layer is simpler and more robust than atomicity at the application layer when the database already gives you the primitive you need (`UPDATE ... WHERE ... RETURNING`). Removing entire categories of external dependency (maps billing, payment gateways, SMS budgets) removes entire categories of demo-day risk — sometimes the best system design decision is *not* integrating something.

### Known Limitations
No persistent session/state store, no multi-worker support without further changes, no rate limiting, no admin tooling, no automated CI gate, GPS tracking data is transient and never available for post-hoc analytics.

### Technical Debt
`_token_store` and `active_jobs` as in-memory dicts are the single largest piece of technical debt — both would need to move to Redis before this could run on more than one worker/process.

---

## 21. Interview Discussion (Q&A Style)

**Why this architecture (monolith)?**
Because the team is 4 people on a hackathon clock, and the API surface is small enough that splitting services would add coordination overhead with no runtime benefit. The blueprint-per-domain structure means the seams for a future split already exist.

**Why this database (Postgres/Neon)?**
Because the one correctness property that matters most — exactly-one-mechanic-wins — maps directly onto a single SQL `UPDATE ... RETURNING` statement with row-level locking, which a NoSQL store wouldn't give for free.

**Why this cache?**
No cache is used, deliberately — at hackathon data volumes (20 seeded mechanics, a handful of concurrent jobs), a cache would add invalidation complexity without a measurable latency win.

**Why this messaging system (Socket.IO, no queue)?**
Because the entire "message" volume is one event per job update, delivered to at most 4 recipients (3 broadcast + 1 driver) — a full message broker (Kafka/RabbitMQ) would be solving a scale problem that doesn't exist yet.

**Why these technologies overall?**
Every technology choice traces back to one constraint: **must run on $0 infrastructure with zero demo-day failure modes.** Leaflet over Google Maps, cash over payment gateways, email OTP over SMS, raw SQL over an ORM — each swap removes either a cost or a fragile external dependency.

**What would change at 10× scale (thousands of concurrent jobs across one city)?**
Move `_token_store`/`active_jobs` to Redis; add a second Gunicorn worker with Redis as the Socket.IO message queue; add a rate limiter on auth routes; introduce PostGIS or a proper geo-index once in-memory mechanic filtering starts showing up in profiling.

**What would change at 100× scale (multi-city, national)?**
Geo-shard the database by city/zone; split Dispatch, Identity, and Tracking into independent services; introduce a message queue (Kafka/SQS) for MRI/receipt/notification fan-out; move receipts to object storage; add multi-region deployment with data residency awareness.

**Biggest bottleneck?**
The single-worker Socket.IO process — it's a hard ceiling on concurrent live connections and a single point of failure for the entire real-time layer.

**Security considerations?**
Parameterized SQL everywhere (no injection surface), tokens deliberately never in `localStorage`, secrets in environment variables — but no rate limiting on OTP attempts is the clearest gap an interviewer would probe.

**Failure handling?**
The `emit_match_confirmed`-after-commit pattern (§12) is the strongest existing example: a socket failure can never desync from the database's source of truth.

**Monitoring strategy?**
Minimal today (`/health`, `/socket-status`); the natural next step is exposing job-funnel metrics (created → broadcast → accepted → completed, with drop-off at each stage) since that funnel is the core product metric, not just system health.

**Optimization opportunities?**
Connection pooling (biggest low-effort win), moving GPS/session state to Redis (biggest scale-unlock), and adding rate limiting (biggest security-hardening win) — in that rough priority order.

---
