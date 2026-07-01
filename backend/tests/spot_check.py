"""Stage 2.1 manual verification script.

Verifies:
1. Country normalization for both /auth/register/user and /auth/register/mechanic
2. CHECK constraint on otp_store.purpose rejects invalid values
3. CHECK constraint allows valid values
4. Regression: original Stage 2 flows still work
"""

import json
import os
import sys
import uuid

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from db import get_db, init_db

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
    return f"+9190{uuid.uuid4().hex[:8]}"


# ====================================================================
# FIX 2: Country normalization tests
# ====================================================================
print("\n" + "#"*60)
print("  FIX 2: COUNTRY NORMALIZATION TESTS")
print("#"*60)

# Test 1: country="in" → 201, stored as "IN" (user)
phone1 = unique_phone()
resp1 = client.post("/auth/register/user", json={
    "first_name": "Test", "last_name": "Lower",
    "phone_number": phone1, "country": "in",
})
pp('USER: country="in" → expect 201', resp1)
assert resp1.status_code == 201, f"FAIL: got {resp1.status_code}"
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT country FROM users WHERE phone_number = %s;", (phone1,))
        stored = cur.fetchone()[0].strip()
        assert stored == "IN", f"FAIL: stored as '{stored}' not 'IN'"
        print(f"  ✅ DB stores: '{stored}'")

# Test 2: country="gb" → 201, stored as "GB" (user)
phone2 = unique_phone()
resp2 = client.post("/auth/register/user", json={
    "first_name": "Test", "last_name": "GB",
    "phone_number": phone2, "country": "gb",
})
pp('USER: country="gb" → expect 201', resp2)
assert resp2.status_code == 201, f"FAIL: got {resp2.status_code}"
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT country FROM users WHERE phone_number = %s;", (phone2,))
        stored = cur.fetchone()[0].strip()
        assert stored == "GB", f"FAIL: stored as '{stored}' not 'GB'"
        print(f"  ✅ DB stores: '{stored}'")

# Test 3: country="In" (mixed case) → 201, stored as "IN" (user)
phone3 = unique_phone()
resp3 = client.post("/auth/register/user", json={
    "first_name": "Test", "last_name": "Mixed",
    "phone_number": phone3, "country": "In",
})
pp('USER: country="In" → expect 201', resp3)
assert resp3.status_code == 201, f"FAIL: got {resp3.status_code}"
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT country FROM users WHERE phone_number = %s;", (phone3,))
        stored = cur.fetchone()[0].strip()
        assert stored == "IN", f"FAIL: stored as '{stored}' not 'IN'"
        print(f"  ✅ DB stores: '{stored}'")

# Test 4: country="ind" → 400 (3 letters, still invalid)
resp4 = client.post("/auth/register/user", json={
    "first_name": "Test", "last_name": "Ind",
    "phone_number": unique_phone(), "country": "ind",
})
pp('USER: country="ind" → expect 400', resp4)
assert resp4.status_code == 400, f"FAIL: got {resp4.status_code}"
assert resp4.get_json().get("error") == "country must be a 2-letter ISO 3166-1 alpha-2 code"
print("  ✅ Error message unchanged from Stage 2")

# Test 5: country="1N" → 400 (non-alphabetic)
resp5 = client.post("/auth/register/user", json={
    "first_name": "Test", "last_name": "Num",
    "phone_number": unique_phone(), "country": "1N",
})
pp('USER: country="1N" → expect 400', resp5)
assert resp5.status_code == 400, f"FAIL: got {resp5.status_code}"
print("  ✅ Non-alpha rejected")

# Test 6: country="I" → 400 (1 letter)
resp6 = client.post("/auth/register/user", json={
    "first_name": "Test", "last_name": "Short",
    "phone_number": unique_phone(), "country": "I",
})
pp('USER: country="I" → expect 400', resp6)
assert resp6.status_code == 400, f"FAIL: got {resp6.status_code}"
print("  ✅ Single letter rejected")

# Test 7: MECHANIC route also normalizes (country="in" → 201, stored "IN")
phone7 = unique_phone()
resp7 = client.post("/auth/register/mechanic", json={
    "first_name": "Mech", "last_name": "Test", "gender": "male",
    "phone_number": phone7, "country": "in",
    "workshop_name": "Test Workshop", "address": "Test Addr",
    "zone": "Gomti Nagar", "lat": 26.85, "lng": 81.0,
})
pp('MECHANIC: country="in" → expect 201', resp7)
assert resp7.status_code == 201, f"FAIL: got {resp7.status_code}"
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT country FROM mechanics WHERE phone_number = %s;", (phone7,))
        stored = cur.fetchone()[0].strip()
        assert stored == "IN", f"FAIL: stored as '{stored}' not 'IN'"
        print(f"  ✅ MECHANIC DB stores: '{stored}'")

# ====================================================================
# FIX 1: CHECK constraint tests
# ====================================================================
print("\n" + "#"*60)
print("  FIX 1: CHECK CONSTRAINT TESTS")
print("#"*60)

# Test A: invalid purpose "bogus" → should raise CheckViolation
from datetime import datetime, timedelta, timezone
expires = datetime.now(timezone.utc) + timedelta(minutes=5)
try:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO otp_store (phone, otp_code, purpose, expires_at) "
                "VALUES (%s, %s, %s, %s);",
                ("+910000000000", "123456", "bogus", expires),
            )
    print("  🔴 FAIL: 'bogus' purpose was accepted — CHECK constraint missing!")
except psycopg2.errors.CheckViolation as e:
    print(f"  ✅ CheckViolation raised for purpose='bogus': {e.pgerror.strip().splitlines()[0]}")
except Exception as e:
    print(f"  ⚠️ Unexpected exception type: {type(e).__name__}: {e}")

# Test B: purpose='registration' → should succeed
test_phone_b = "+910000000001"
try:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM otp_store WHERE phone = %s;", (test_phone_b,))
            cur.execute(
                "INSERT INTO otp_store (phone, otp_code, purpose, expires_at) "
                "VALUES (%s, %s, %s, %s);",
                (test_phone_b, "123456", "registration", expires),
            )
            cur.execute("DELETE FROM otp_store WHERE phone = %s;", (test_phone_b,))
    print("  ✅ purpose='registration' accepted")
except Exception as e:
    print(f"  🔴 FAIL: purpose='registration' rejected: {e}")

# Test C: purpose='login' → should succeed
test_phone_c = "+910000000002"
try:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM otp_store WHERE phone = %s;", (test_phone_c,))
            cur.execute(
                "INSERT INTO otp_store (phone, otp_code, purpose, expires_at) "
                "VALUES (%s, %s, %s, %s);",
                (test_phone_c, "123456", "login", expires),
            )
            cur.execute("DELETE FROM otp_store WHERE phone = %s;", (test_phone_c,))
    print("  ✅ purpose='login' accepted")
except Exception as e:
    print(f"  🔴 FAIL: purpose='login' rejected: {e}")

# Test D: Normal registration flow still creates OTP with valid purpose
phone_d = unique_phone()
resp_d = client.post("/auth/register/user", json={
    "first_name": "Test", "last_name": "OTP",
    "phone_number": phone_d, "country": "IN",
})
assert resp_d.status_code == 201, f"FAIL: registration returned {resp_d.status_code}"
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT purpose FROM otp_store WHERE phone = %s;", (phone_d,))
        row = cur.fetchone()
        assert row is not None, "FAIL: no OTP row created"
        assert row[0].strip() == "registration", f"FAIL: purpose is '{row[0]}'"
        print(f"  ✅ Normal registration creates OTP with purpose='{row[0].strip()}'")

# ====================================================================
# REGRESSION: Original Stage 2 spot checks
# ====================================================================
print("\n" + "#"*60)
print("  REGRESSION: ORIGINAL STAGE 2 SPOT CHECKS")
print("#"*60)

# Health
resp_h = client.get("/health")
pp("GET /health", resp_h)
assert resp_h.status_code == 200
print("  ✅ Health OK")

# Register user (standard, uppercase country)
phone_r = unique_phone()
resp_r = client.post("/auth/register/user", json={
    "first_name": "Priya", "last_name": "Sharma",
    "phone_number": phone_r, "country": "IN",
})
pp("POST /auth/register/user (standard)", resp_r)
assert resp_r.status_code == 201
data_r = resp_r.get_json()
assert set(data_r.keys()) == {"user_id", "message", "expires_in_seconds"}
print("  ✅ User registration fields match spec")

# Verify OTP happy path
with get_db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT otp_code FROM otp_store WHERE phone = %s;", (phone_r,))
        otp_code = cur.fetchone()[0].strip()
resp_v = client.post("/auth/verify-otp", json={
    "phone_number": phone_r, "otp": otp_code, "role": "user",
})
pp("POST /auth/verify-otp (happy path)", resp_v)
assert resp_v.status_code == 200
data_v = resp_v.get_json()
assert set(data_v.keys()) == {"message", "session_token", "role", "id"}
print("  ✅ Verify-OTP fields match spec")

# Register mechanic (standard)
phone_m = unique_phone()
resp_m = client.post("/auth/register/mechanic", json={
    "first_name": "Raju", "last_name": "Kumar", "gender": "male",
    "phone_number": phone_m, "country": "IN",
    "workshop_name": "Raju Auto Works", "address": "Gomti Nagar, Lucknow",
    "zone": "Gomti Nagar", "lat": 26.8467, "lng": 80.9462,
})
pp("POST /auth/register/mechanic (standard)", resp_m)
assert resp_m.status_code == 201
data_m = resp_m.get_json()
assert set(data_m.keys()) == {"mechanic_id", "message", "expires_in_seconds"}
print("  ✅ Mechanic registration fields match spec")

# Nearby mechanics
resp_n = client.get("/mechanics/nearby?lat=26.8550&lng=80.9400&radius_km=15")
pp("GET /mechanics/nearby", resp_n)
assert resp_n.status_code == 200
data_n = resp_n.get_json()
assert "count" in data_n and "mechanics" in data_n
assert data_n["count"] <= 3
print(f"  ✅ Nearby: {data_n['count']} mechanics returned (LIMIT 3 enforced)")

print("\n" + "="*60)
print("  ALL STAGE 2.1 VERIFICATIONS PASSED")
print("="*60)
