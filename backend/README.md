# OttoMech — Stage 8 (Complete)

Flask API for roadside mechanic dispatch in Lucknow. UUID-based registration, E.164 phones, in-memory geo matching. Raw SQL against Neon PostgreSQL. Real-time updates with Socket.IO. Minimalist brutalist UI frontend included.

## Prerequisites

- Python 3.10+
- Neon PostgreSQL with pgcrypto extension

## Setup

```bash
cd ottomech/backend

python -m venv venv
# Windows
venv\Scripts\activate
# Linux / macOS
source venv/bin/activate
# Git Bash
source venv/Scripts/activate

pip install -r requirements.txt
```

Ensure `.env` contains your Neon connection string:

```
DATABASE_URL=postgresql://...
SECRET_KEY=ottomech_dev
```

Initialize v2 schema and seed 20 garages:

```bash
python seed.py
```

Start the API:

```bash
python app.py
```

Server runs at `http://localhost:5000`.

## API Endpoints

### Health check

```bash
curl http://localhost:5000/health
```

### Register user (driver)

Creates a user with `phone_verified=false`, stores OTP with `purpose=registration`, prints OTP to terminal.

```bash
curl -X POST http://localhost:5000/auth/register/user \
  -H "Content-Type: application/json" \
  -d "{\"first_name\":\"Priya\",\"last_name\":\"Sharma\",\"phone_number\":\"+919876543210\",\"country\":\"IN\"}"
```

### Register mechanic

Creates a mechanic with `phone_verified=false` and `is_available=false`.

```bash
curl -X POST http://localhost:5000/auth/register/mechanic \
  -H "Content-Type: application/json" \
  -d "{\"first_name\":\"Raju\",\"last_name\":\"Kumar\",\"gender\":\"male\",\"phone_number\":\"+919988776655\",\"country\":\"IN\",\"workshop_name\":\"Raju Auto Works\",\"address\":\"Gomti Nagar, Lucknow\",\"zone\":\"Gomti Nagar\",\"lat\":26.8467,\"lng\":80.9462}"
```

### Verify OTP

Check the terminal running `app.py` for the OTP code.

```bash
curl -X POST http://localhost:5000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"phone_number\":\"+919876543210\",\"otp\":\"123456\",\"role\":\"user\"}"
```

`role` must be `user` or `mechanic`.

### Nearby mechanics (in-memory matching, max 3)

Returns only `is_available=true` mechanics, nearest first.

```bash
curl "http://localhost:5000/mechanics/nearby?lat=26.8550&lng=80.9400&radius_km=15"
```

### Create job

```bash
curl -X POST http://localhost:5000/jobs/create \
  -H "Content-Type: application/json" \
  -d "{\"driver_id\":\"<user-uuid>\",\"issue_type\":\"flat_tyre\",\"lat\":26.8467,\"lng\":80.9462}"
```

### Accept job (mechanic)

```bash
curl -X PATCH http://localhost:5000/jobs/<job-uuid>/accept \
  -H "Content-Type: application/json" \
  -d "{\"mechanic_id\":\"<mechanic-uuid>\"}"
```

### Complete job (mechanic)

```bash
curl -X PATCH http://localhost:5000/jobs/<job-uuid>/complete \
  -H "Authorization: Bearer <mechanic-token>" \
  -H "Content-Type: application/json" \
  -d "{\"cash_amount\": 500}"
```

### Get MRI Score & Earnings (mechanic)

```bash
curl http://localhost:5000/mechanics/<mechanic-uuid>/mri
curl http://localhost:5000/mechanics/<mechanic-uuid>/earnings
```

### Generate Job Receipt (PDF)

```bash
curl -O -J http://localhost:5000/jobs/<job-uuid>/receipt
```

## Project structure

```
backend/
  app.py
  db.py               # v2 schema, pgcrypto, auto-migration from v1
  seed.py             # 20 garages (10 real + 10 dummy)
  routes/
    auth.py           # register/user, register/mechanic, verify-otp, google auth
    mechanic.py       # nearby, mri, earnings
    job.py            # create, accept, complete, messages, rating
    mri.py            # MRI scoring algorithm and PDF receipt generation
    push.py           # VAPID web push notifications
    socket_events.py  # Socket.IO real-time events (chat, GPS tracking)
    common.py         # shared error responses
  requirements.txt
  .env
```

## Seed data

`python seed.py` drops and recreates all v2 tables, then upserts 20 mechanics. Expected output:

```
20 mechanics seeded
13 mechanics with is_available=true
```

Re-running `seed.py` uses `ON CONFLICT (phone_number) DO UPDATE` — no duplicate rows.

## Notes

- Phone numbers stored as E.164 exactly as submitted (`+91XXXXXXXXXX`).
- Country must be 2-letter uppercase ISO code (e.g. `IN`).
- UUID primary keys via `gen_random_uuid()` (pgcrypto).
- Session tokens are hex strings in an in-memory `_token_store` dict (no JWT).
- Database errors return `{"error": "Database connection failed"}` without leaking stack traces.

## Security & Data Integrity

- **Secrets Rotation**: If `SECRET_KEY` or `GMAIL_APP_PASSWORD` leak, rotate them immediately by updating the `.env` file (or production environment variables) and restarting the server. No database migration is required. Existing session tokens in the in-memory `_token_store` will be cleared on restart, requiring all users to re-login.
- **Data-at-Rest Encryption**: Ensure disk encryption is explicitly enabled in your Neon database console. This protects sensitive PII (like plain text phone numbers and emails) from physical or block-level breaches.
