# OttoAssist — Stage 1 (Backend Foundation)

Flask API for roadside mechanic dispatch in Lucknow. Raw SQL against Neon PostgreSQL with PostGIS.

## Prerequisites

- Python 3.10+
- Neon PostgreSQL database with PostGIS support

## Setup

```bash
cd ottomech
python -m venv venv

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

Initialize tables and seed Lucknow garages:

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

### Send OTP

Generates a 6-digit OTP, stores it, and prints it to the terminal (no SMS).

```bash
curl -X POST http://localhost:5000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"9876543210\"}"
```

Check the terminal running `app.py` for the OTP code.

### Verify OTP

```bash
curl -X POST http://localhost:5000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"9876543210\", \"otp\": \"123456\"}"
```

Replace `123456` with the OTP printed in the terminal.

### Nearby mechanics (PostGIS)

Search within a radius (km) of a lat/lng point:

```bash
curl "http://localhost:5000/mechanics/nearby?lat=26.8467&lng=80.9462&radius_km=10"
```

### Create job

```bash
curl -X POST http://localhost:5000/jobs/create \
  -H "Content-Type: application/json" \
  -d "{\"driver_phone\": \"9876543210\", \"issue_type\": \"flat_tire\", \"lat\": 26.8467, \"lng\": 80.9462}"
```

### Accept job (mechanic)

```bash
curl -X PATCH http://localhost:5000/jobs/1/accept \
  -H "Content-Type: application/json" \
  -d "{\"mechanic_id\": 1}"
```

### Get job details

```bash
curl http://localhost:5000/jobs/1
```

## Project structure

```
ottomech/
  app.py              # Flask entry point
  db.py               # Connection pool helper, schema init, PostGIS
  routes/
    auth.py           # OTP send / verify
    mechanic.py       # Nearby mechanics query
    job.py            # Job create / accept / get
  seed.py             # Lucknow garage seed data
  requirements.txt
  .env
```

## Seeded garages (Lucknow)

| Zone         | Garage                      |
|--------------|-----------------------------|
| Gomti Nagar  | Gomti Auto Care             |
| Hazratganj   | Hazratganj Motors           |
| Alambagh     | Alambagh Roadside Garage    |
| Indira Nagar | Indira Nagar Car Clinic     |
| Lalbagh      | Lalbagh Express Service     |

## Notes

- All responses are JSON.
- Database errors return HTTP 500 with an error message.
- PostGIS extension is enabled automatically on first run via `init_db()`.
- Session tokens from OTP verify are mock tokens for now (no JWT validation yet).
