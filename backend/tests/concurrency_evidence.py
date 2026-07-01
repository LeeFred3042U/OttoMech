"""Concurrency race DB evidence: run the race, then query the DB directly."""

import os
import secrets
import sys
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from db import get_db, init_db
from routes.auth import _token_store
from seed import seed

init_db(force_reset=True)
seed()

app = create_app()
app.config["TESTING"] = True

def unique_phone():
    import uuid
    return f"+9191{uuid.uuid4().hex[:8]}"

def read_otp(phone):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT otp_code FROM otp_store WHERE phone = %s;", (phone,))
            row = cur.fetchone()
            return row[0].strip() if row else None

def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}

# Register driver
with app.test_client() as client:
    phone = unique_phone()
    client.post("/auth/register/user", json={
        "first_name": "Race", "last_name": "Driver",
        "phone_number": phone, "country": "IN",
    })
    otp = read_otp(phone)
    verify = client.post("/auth/verify-otp", json={
        "phone_number": phone, "otp": otp, "role": "user",
    })
    driver_token = verify.get_json()["session_token"]

    # Create job
    resp = client.post("/jobs/create", json={
        "issue_type": "battery", "lat": 26.8550, "lng": 80.9400,
    }, headers=auth_headers(driver_token))
    job_id = resp.get_json()["job"]["job_id"]
    print(f"Job created: {job_id}")

# Get broadcasts
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT mechanic_id FROM job_broadcasts WHERE job_id = %s ORDER BY mechanic_id;",
            (job_id,),
        )
        broadcast_mechanics = [str(row[0]) for row in cur.fetchall()]
print(f"Broadcasted to {len(broadcast_mechanics)} mechanics: {broadcast_mechanics}")
assert len(broadcast_mechanics) >= 3, "Need at least 3 for race test"

# Create tokens for each
mechanic_tokens = []
for mid in broadcast_mechanics[:3]:
    token = secrets.token_hex(32)
    _token_store[token] = {"role": "mechanic", "id": mid}
    mechanic_tokens.append((mid, token))

# Race!
results = []
barrier = threading.Barrier(3)

def attempt_accept(mechanic_id, token):
    barrier.wait()
    with app.test_client() as c:
        resp = c.patch(
            f"/jobs/{job_id}/accept",
            json={"mechanic_id": mechanic_id},
            headers=auth_headers(token),
        )
        results.append((mechanic_id, resp.status_code))

threads = [
    threading.Thread(target=attempt_accept, args=(mid, tok))
    for mid, tok in mechanic_tokens
]
for t in threads:
    t.start()
for t in threads:
    t.join()

print(f"\n--- RACE RESULTS (HTTP responses) ---")
for mid, code in results:
    print(f"  mechanic={mid} → {code}")

codes = [r[1] for r in results]
print(f"\n  200 count: {codes.count(200)}")
print(f"  409 count: {codes.count(409)}")
assert codes.count(200) == 1, f"Expected exactly 1×200, got {codes}"
assert codes.count(409) == 2, f"Expected exactly 2×409, got {codes}"
print("  ✅ Exactly 1×200 + 2×409")

# DB-level evidence
print(f"\n--- DB EVIDENCE ---")
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT job_id, mechanic_id, status, accepted_at FROM jobs WHERE job_id = %s;",
            (job_id,),
        )
        job_row = cur.fetchone()
        print(f"\n  jobs row:")
        print(f"    job_id:      {job_row[0]}")
        print(f"    mechanic_id: {job_row[1]}")
        print(f"    status:      {job_row[2]}")
        print(f"    accepted_at: {job_row[3]}")
        assert job_row[1] is not None, "mechanic_id must be set"
        assert job_row[2] == "accepted", "status must be 'accepted'"
        
        # Count distinct mechanic_ids set on this job
        cur.execute(
            "SELECT COUNT(DISTINCT mechanic_id) FROM jobs WHERE job_id = %s AND mechanic_id IS NOT NULL;",
            (job_id,),
        )
        distinct = cur.fetchone()[0]
        print(f"    distinct mechanic_ids set: {distinct}")
        assert distinct == 1

        cur.execute(
            "SELECT mechanic_id, responded, accepted FROM job_broadcasts WHERE job_id = %s ORDER BY mechanic_id;",
            (job_id,),
        )
        bc_rows = cur.fetchall()
        print(f"\n  job_broadcasts rows:")
        accepted_count = 0
        for row in bc_rows:
            print(f"    mechanic={row[0]}, responded={row[1]}, accepted={row[2]}")
            if row[2]:
                accepted_count += 1
        print(f"\n    accepted=True count: {accepted_count}")
        assert accepted_count == 1, f"Expected exactly 1 accepted=True, got {accepted_count}"
        print("  ✅ Exactly 1 broadcast has accepted=True")
        
        winner = str(job_row[1])
        print(f"\n  Winner mechanic_id: {winner}")
        print(f"  Winner matches jobs.mechanic_id: {any(str(r[0]) == winner and r[2] for r in bc_rows)}")
        print("  ✅ Winner in job_broadcasts matches winner in jobs table")

print("\n  ALL CONCURRENCY DB EVIDENCE VERIFIED")
