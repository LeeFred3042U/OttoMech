"""Stage 3 comprehensive manual verification.

Runs:
1. Full end-to-end curl flow (register → create → accept → complete → get)
2. DB cross-checks at every step
3. Judgment-call verifications (mechanic creating job, complete on pending)
4. Stage 2/2.1 regressions (CHECK constraint, country normalization, seed)
"""

import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from db import get_db, init_db
from routes.auth import _token_store
from seed import seed

app = create_app()
app.config["TESTING"] = True
client = app.test_client()


def pp(label, resp):
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"  STATUS: {resp.status_code}")
    print(f"{'='*60}")
    try:
        print(json.dumps(resp.get_json(), indent=2))
    except Exception:
        print(resp.get_data(as_text=True))


def unique_phone():
    return f"+9191{uuid.uuid4().hex[:8]}"


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def read_otp(phone):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT otp_code FROM otp_store WHERE phone = %s;", (phone,))
            row = cur.fetchone()
            return row[0].strip() if row else None


def register_and_verify(client, role, phone=None, **extra):
    phone = phone or unique_phone()
    if role == "user":
        resp = client.post("/auth/register/user", json={
            "first_name": "Test", "last_name": "Driver",
            "phone_number": phone, "country": "IN",
        })
    else:
        payload = {
            "first_name": "Test", "last_name": "Mech", "gender": "male",
            "phone_number": phone, "country": "IN",
            "workshop_name": "Test Workshop", "address": "Test Addr",
            "zone": "Gomti Nagar", "lat": 26.85, "lng": 81.0,
        }
        payload.update(extra)
        resp = client.post("/auth/register/mechanic", json=payload)
    assert resp.status_code == 201, f"Registration failed: {resp.get_json()}"
    otp = read_otp(phone)
    verify = client.post("/auth/verify-otp", json={
        "phone_number": phone, "otp": otp, "role": role,
    })
    assert verify.status_code == 200, f"OTP verify failed: {verify.get_json()}"
    data = verify.get_json()
    return data["session_token"], data["id"], phone


# ====================================================================
# SECTION 1: FULL END-TO-END CURL FLOW
# ====================================================================
print("\n" + "#"*60)
print("  SECTION 1: FULL END-TO-END CURL FLOW")
print("#"*60)

# 1a. Register and verify driver
driver_token, driver_id, driver_phone = register_and_verify(client, "user")
print(f"\n  Driver registered: id={driver_id}, phone={driver_phone}")
print(f"  Driver token: {driver_token[:16]}...")

# 1b. Register and verify mechanic
mech_token, mech_id, mech_phone = register_and_verify(client, "mechanic")
print(f"  Mechanic registered: id={mech_id}, phone={mech_phone}")
print(f"  Mechanic token: {mech_token[:16]}...")

# 1c. Create job
resp_create = client.post("/jobs/create", json={
    "issue_type": "battery", "lat": 26.8550, "lng": 80.9400,
}, headers=auth_headers(driver_token))
pp("POST /jobs/create", resp_create)
assert resp_create.status_code == 201, f"Create failed: {resp_create.get_json()}"
create_data = resp_create.get_json()
job_id = create_data["job"]["job_id"]
notified = create_data["mechanics_notified"]

# 1d. DB cross-check: job_broadcasts count matches mechanics_notified
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM job_broadcasts WHERE job_id = %s;", (job_id,))
        bc_count = cur.fetchone()[0]
print(f"\n  mechanics_notified in response: {notified}")
print(f"  job_broadcasts rows in DB:      {bc_count}")
assert bc_count == notified, f"MISMATCH: response={notified}, DB={bc_count}"
print("  ✅ mechanics_notified matches DB count")

# 1e. DB cross-check: all broadcasts start as responded=false, accepted=false
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT mechanic_id, responded, accepted FROM job_broadcasts WHERE job_id = %s ORDER BY mechanic_id;",
            (job_id,),
        )
        broadcasts_before = cur.fetchall()
print(f"\n  Broadcasts before accept:")
for row in broadcasts_before:
    print(f"    mechanic={row[0]}, responded={row[1]}, accepted={row[2]}")
assert all(not row[1] and not row[2] for row in broadcasts_before)
print("  ✅ All broadcasts start as responded=False, accepted=False")

# 1f. Accept job (use first broadcast mechanic, not the one we registered)
winner_id = str(broadcasts_before[0][0])
# Create a token for this seed mechanic
import secrets
winner_token = secrets.token_hex(32)
_token_store[winner_token] = {"role": "mechanic", "id": winner_id}

resp_accept = client.patch(f"/jobs/{job_id}/accept", json={
    "mechanic_id": winner_id,
}, headers=auth_headers(winner_token))
pp("PATCH /jobs/:job_id/accept", resp_accept)
assert resp_accept.status_code == 200, f"Accept failed: {resp_accept.get_json()}"
accept_data = resp_accept.get_json()
assert accept_data["job"]["status"] == "accepted"
assert accept_data["job"]["mechanic_id"] == winner_id

# 1g. DB cross-check: job_broadcasts after accept
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT mechanic_id, responded, accepted FROM job_broadcasts WHERE job_id = %s ORDER BY mechanic_id;",
            (job_id,),
        )
        broadcasts_after = cur.fetchall()
print(f"\n  Broadcasts after accept:")
winner_count = 0
loser_count = 0
for row in broadcasts_after:
    print(f"    mechanic={row[0]}, responded={row[1]}, accepted={row[2]}")
    assert row[1] is True, f"responded should be True for all, got {row[1]}"
    if str(row[0]) == winner_id:
        assert row[2] is True, f"Winner should have accepted=True"
        winner_count += 1
    else:
        assert row[2] is False, f"Loser should have accepted=False"
        loser_count += 1
print(f"  ✅ Winner accepted=True (1), losers accepted=False ({loser_count}), all responded=True")

# 1h. Complete job
resp_complete = client.patch(f"/jobs/{job_id}/complete", json={
    "cash_amount": 450,
}, headers=auth_headers(winner_token))
pp("PATCH /jobs/:job_id/complete", resp_complete)
assert resp_complete.status_code == 200, f"Complete failed: {resp_complete.get_json()}"
complete_data = resp_complete.get_json()
assert complete_data["job"]["status"] == "completed"
assert complete_data["job"]["cash_amount"] == 450.0
assert complete_data["job"]["completed_at"] is not None

# 1i. DB cross-check: mri_events row
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT mechanic_id, event_type, recorded_at FROM mri_events WHERE mechanic_id = %s ORDER BY recorded_at DESC LIMIT 1;",
            (winner_id,),
        )
        mri_row = cur.fetchone()
print(f"\n  mri_events query result:")
print(f"    mechanic_id={mri_row[0]}, event_type={mri_row[1]}, recorded_at={mri_row[2]}")
assert str(mri_row[0]) == winner_id
assert mri_row[1] == "COMPLETED"
print("  ✅ mri_events row exists with event_type='COMPLETED'")

# 1j. Get job
resp_get = client.get(f"/jobs/{job_id}", headers=auth_headers(driver_token))
pp("GET /jobs/:job_id", resp_get)
assert resp_get.status_code == 200
job_data = resp_get.get_json()["job"]
assert job_data["status"] == "completed"
assert job_data["mechanic_id"] == winner_id
assert job_data["cash_amount"] == 450.0
print("  ✅ GET /jobs/:job_id returns complete job data")


# ====================================================================
# SECTION 2: JUDGMENT-CALL VERIFICATIONS
# ====================================================================
print("\n" + "#"*60)
print("  SECTION 2: JUDGMENT-CALL VERIFICATIONS")
print("#"*60)

# 2a. Mechanic trying to create a job → should be 401
resp_mech_create = client.post("/jobs/create", json={
    "issue_type": "battery", "lat": 26.85, "lng": 80.94,
}, headers=auth_headers(mech_token))
pp("MECHANIC calling /jobs/create → expect 401", resp_mech_create)
assert resp_mech_create.status_code == 401
print(f"  Actual status: {resp_mech_create.status_code}")
print(f"  Actual error: {resp_mech_create.get_json().get('error')}")
print("  ✅ Mechanic creating job returns 401 as expected")

# 2b. Complete on pending job by unassigned mechanic → check if 400 or 403
driver_token2, driver_id2, _ = register_and_verify(client, "user")
resp_create2 = client.post("/jobs/create", json={
    "issue_type": "flat_tyre", "lat": 26.85, "lng": 80.94,
}, headers=auth_headers(driver_token2))
assert resp_create2.status_code == 201
job_id2 = resp_create2.get_json()["job"]["job_id"]

# Use mech_token (a mechanic who is NOT assigned to this pending job)
resp_complete_pending = client.patch(f"/jobs/{job_id2}/complete", json={
    "cash_amount": 100,
}, headers=auth_headers(mech_token))
pp("UNASSIGNED MECHANIC completing PENDING job", resp_complete_pending)
print(f"  Actual status: {resp_complete_pending.status_code}")
print(f"  Actual error: {resp_complete_pending.get_json().get('error')}")
# The spec says pending → 400 (status check), and wrong mechanic → 403
# Which one fires first depends on code order
if resp_complete_pending.status_code == 400:
    print("  ℹ️  Status check fires BEFORE mechanic ownership check")
    assert "pending" in resp_complete_pending.get_json()["error"]
    print("  ✅ Returns 400 naming 'pending' status — correct per spec")
elif resp_complete_pending.status_code == 403:
    print("  ℹ️  Mechanic ownership check fires BEFORE status check")
    print("  ✅ Returns 403 — also acceptable per spec (both are error paths)")
else:
    print(f"  🔴 Unexpected status code: {resp_complete_pending.status_code}")


# ====================================================================
# SECTION 3: STAGE 2/2.1 REGRESSION CHECKS
# ====================================================================
print("\n" + "#"*60)
print("  SECTION 3: STAGE 2/2.1 REGRESSIONS")
print("#"*60)

# 3a. CHECK constraint on otp_store.purpose
expires = datetime.now(timezone.utc) + timedelta(minutes=5)
try:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO otp_store (phone, otp_code, purpose, expires_at) "
                "VALUES (%s, %s, %s, %s);",
                ("+910000099999", "123456", "bogus", expires),
            )
    print("  🔴 FAIL: 'bogus' purpose accepted — CHECK constraint missing!")
except psycopg2.errors.CheckViolation as e:
    print(f"  ✅ CheckViolation raised for purpose='bogus'")
except Exception as e:
    print(f"  ⚠️ Unexpected: {type(e).__name__}: {e}")

# 3b. Country normalization still works
phone_norm = unique_phone()
resp_norm = client.post("/auth/register/user", json={
    "first_name": "Norm", "last_name": "Test",
    "phone_number": phone_norm, "country": "in",
})
assert resp_norm.status_code == 201
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT country FROM users WHERE phone_number = %s;", (phone_norm,))
        stored = cur.fetchone()[0].strip()
        assert stored == "IN"
        print(f"  ✅ Country normalization: 'in' → stored as '{stored}'")

# 3c. Seed data counts
with get_db() as conn:
    with conn.cursor() as cur:
        # Note: Stage 3 tests may have added mechanics, so we count
        # seed mechanics by looking at known seed phone patterns
        cur.execute("SELECT COUNT(*) FROM mechanics WHERE phone_number LIKE '+919%' AND phone_number NOT LIKE '+9191%';")
        seed_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM mechanics WHERE is_available = TRUE AND phone_number LIKE '+919%' AND phone_number NOT LIKE '+9191%';")
        avail_count = cur.fetchone()[0]
print(f"  Seed mechanics: {seed_count} (expect ≥20)")
print(f"  Seed available: {avail_count} (expect ≥13)")

# More direct: re-run seed and check
seed()
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM mechanics;")
        total = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM mechanics WHERE is_available = TRUE;")
        avail = cur.fetchone()[0]
print(f"  After fresh seed: {total} mechanics, {avail} available")
assert total == 20, f"Expected 20, got {total}"
assert avail == 13, f"Expected 13, got {avail}"
print("  ✅ Seed data: 20 mechanics, 13 available")

# 3d. GET /mechanics/nearby still returns results
resp_nearby = client.get("/mechanics/nearby?lat=26.8550&lng=80.9400&radius_km=15")
assert resp_nearby.status_code == 200
nearby_data = resp_nearby.get_json()
print(f"  Nearby mechanics: {nearby_data['count']} returned")
assert nearby_data["count"] > 0
print("  ✅ /mechanics/nearby still returns results post-Stage 3")


print("\n" + "="*60)
print("  ALL VERIFICATIONS COMPLETE")
print("="*60)
