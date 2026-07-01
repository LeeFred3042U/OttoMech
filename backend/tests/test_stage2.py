"""
Stage 2 acceptance tests against AGENT.md spec.

Uses Flask test client directly (app factory pattern).
Requires DATABASE_URL in .env pointing to the Neon DB.
"""

import os
import sys
import re
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import psycopg2
import pytest

# Ensure the backend root is on sys.path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from db import get_db, init_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def _init_schema():
    """Make sure the v2 schema exists before any test runs."""
    init_db(force_reset=True)


@pytest.fixture()
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def _unique_phone():
    """Generate a unique fake E.164 phone to avoid collisions between tests."""
    return f"+9190{uuid.uuid4().hex[:8]}"


def _register_user(client, phone=None, **overrides):
    payload = {
        "first_name": "Test",
        "last_name": "User",
        "phone_number": phone or _unique_phone(),
        "country": "IN",
    }
    payload.update(overrides)
    return client.post("/auth/register/user", json=payload)


def _register_mechanic(client, phone=None, **overrides):
    payload = {
        "first_name": "Test",
        "last_name": "Mechanic",
        "gender": "male",
        "phone_number": phone or _unique_phone(),
        "country": "IN",
        "workshop_name": "Test Workshop",
        "address": "Test Address, Lucknow",
        "zone": "Gomti Nagar",
        "lat": 26.8500,
        "lng": 81.0000,
    }
    payload.update(overrides)
    return client.post("/auth/register/mechanic", json=payload)


def _read_otp_from_db(phone):
    """Read the OTP code directly from the otp_store table."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT otp_code FROM otp_store WHERE phone = %s;",
                (phone,),
            )
            row = cur.fetchone()
            return row[0].strip() if row else None


def _get_phone_verified(role, phone):
    """Read phone_verified from users or mechanics table."""
    table = "users" if role == "user" else "mechanics"
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT phone_verified FROM {table} WHERE phone_number = %s;",
                (phone,),
            )
            row = cur.fetchone()
            return row[0] if row else None


# ---------------------------------------------------------------------------
# 1. Registration — User
# ---------------------------------------------------------------------------

class TestRegisterUser:
    def test_register_user_success(self, client):
        """201, response has valid UUID user_id."""
        resp = _register_user(client)
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()
        assert "user_id" in data
        # Validate it's a proper UUID
        uuid.UUID(data["user_id"])
        assert "message" in data
        assert "expires_in_seconds" in data

    def test_register_user_missing_phone(self, client):
        """400, error message names 'phone_number'."""
        resp = client.post("/auth/register/user", json={
            "first_name": "Test",
            "country": "IN",
        })
        assert resp.status_code == 400
        error_msg = resp.get_json().get("error", "")
        assert "phone_number" in error_msg

    def test_register_user_duplicate_phone(self, client):
        """Register once (201), register again with same phone (409)."""
        phone = _unique_phone()
        resp1 = _register_user(client, phone=phone)
        assert resp1.status_code == 201

        resp2 = _register_user(client, phone=phone)
        assert resp2.status_code == 409


# ---------------------------------------------------------------------------
# 2. Registration — Mechanic
# ---------------------------------------------------------------------------

class TestRegisterMechanic:
    def test_register_mechanic_success(self, client):
        """201, mechanics row has is_available == False."""
        phone = _unique_phone()
        resp = _register_mechanic(client, phone=phone)
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()
        assert "mechanic_id" in data
        uuid.UUID(data["mechanic_id"])

        # Verify is_available is False in the DB
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT is_available FROM mechanics WHERE phone_number = %s;",
                    (phone,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row[0] is False

    def test_register_mechanic_invalid_lat(self, client):
        """lat=999 → 400."""
        resp = _register_mechanic(client, lat=999)
        assert resp.status_code == 400

    def test_register_mechanic_invalid_lng(self, client):
        """lng=-999 → 400."""
        resp = _register_mechanic(client, lng=-999)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 3. Country validation
# ---------------------------------------------------------------------------

class TestCountryValidation:
    def test_register_invalid_country_code_too_long(self, client):
        """country='India' (not 2-letter) → 400."""
        resp = _register_user(client, country="India")
        assert resp.status_code == 400

    def test_register_invalid_country_code_lowercase(self, client):
        """country='1N' (non-alpha after normalization) → 400."""
        resp = _register_user(client, country="1N")
        assert resp.status_code == 400
        assert resp.get_json().get("error") == (
            "country must be a 2-letter ISO 3166-1 alpha-2 code"
        )

    def test_register_country_lowercase_normalizes_to_uppercase(self, client):
        """Lowercase country codes are normalized to uppercase before storage."""
        user_phone = _unique_phone()
        user_resp = _register_user(client, phone=user_phone, country="in")
        assert user_resp.status_code == 201, user_resp.get_json()

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT country FROM users WHERE phone_number = %s;",
                    (user_phone,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row[0].strip() == "IN"

        mech_phone = _unique_phone()
        mech_resp = _register_mechanic(client, phone=mech_phone, country="gb")
        assert mech_resp.status_code == 201, mech_resp.get_json()

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT country FROM mechanics WHERE phone_number = %s;",
                    (mech_phone,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row[0].strip() == "GB"

    def test_otp_purpose_check_constraint_rejects_invalid_value(self):
        """otp_store.purpose CHECK rejects values other than registration/login."""
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        with pytest.raises(psycopg2.errors.CheckViolation):
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO otp_store (phone, otp_code, purpose, expires_at)
                        VALUES (%s, %s, %s, %s);
                        """,
                        ("+919999999999", "123456", "bogus", expires_at),
                    )


# ---------------------------------------------------------------------------
# 4. OTP verification
# ---------------------------------------------------------------------------

class TestVerifyOtp:
    def test_verify_otp_correct(self, client):
        """Register → read OTP from DB → verify → 200,
        session_token present, phone_verified true in DB."""
        phone = _unique_phone()
        reg_resp = _register_user(client, phone=phone)
        assert reg_resp.status_code == 201

        otp = _read_otp_from_db(phone)
        assert otp is not None, "OTP was not stored in otp_store"

        verify_resp = client.post("/auth/verify-otp", json={
            "phone_number": phone,
            "otp": otp,
            "role": "user",
        })
        assert verify_resp.status_code == 200, verify_resp.get_json()
        vdata = verify_resp.get_json()
        assert "session_token" in vdata
        assert vdata["role"] == "user"
        assert "id" in vdata

        # DB assertion: phone_verified must be True
        assert _get_phone_verified("user", phone) is True

    def test_verify_otp_wrong_code(self, client):
        """Register → verify with '000000' → 401,
        AND phone_verified still False in DB."""
        phone = _unique_phone()
        reg_resp = _register_user(client, phone=phone)
        assert reg_resp.status_code == 201

        verify_resp = client.post("/auth/verify-otp", json={
            "phone_number": phone,
            "otp": "000000",
            "role": "user",
        })
        assert verify_resp.status_code == 401

        # DB assertion: phone_verified must still be False
        assert _get_phone_verified("user", phone) is False

    def test_verify_otp_expired(self, client):
        """Register → backdate otp_store.expires_at → verify → 410,
        AND otp_store row deleted."""
        phone = _unique_phone()
        reg_resp = _register_user(client, phone=phone)
        assert reg_resp.status_code == 201

        otp = _read_otp_from_db(phone)
        assert otp is not None

        # Backdate the OTP expiry
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE otp_store SET expires_at = %s WHERE phone = %s;",
                    (past, phone),
                )

        verify_resp = client.post("/auth/verify-otp", json={
            "phone_number": phone,
            "otp": otp,
            "role": "user",
        })
        assert verify_resp.status_code == 410

        # Assert the otp_store row was deleted after expiry
        assert _read_otp_from_db(phone) is None

    def test_verify_otp_invalid_role(self, client):
        """role='driver' → 400."""
        resp = client.post("/auth/verify-otp", json={
            "phone_number": "+919999999999",
            "otp": "123456",
            "role": "driver",
        })
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 5. Nearby mechanics
# ---------------------------------------------------------------------------

class TestNearbyMechanics:
    def test_nearby_returns_max_three(self, client):
        """Seed has many available mechanics in Lucknow.
        Call /mechanics/nearby with wide radius → max 3 returned."""
        resp = client.get(
            "/mechanics/nearby?lat=26.8500&lng=81.0000&radius_km=50"
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["mechanics"]) <= 3

    def test_nearby_excludes_unavailable(self, client):
        """Assert no mechanic in the response has is_available == False.
        Cross-check against DB to be sure."""
        resp = client.get(
            "/mechanics/nearby?lat=26.8500&lng=81.0000&radius_km=50"
        )
        assert resp.status_code == 200
        data = resp.get_json()
        for mech in data["mechanics"]:
            assert mech["is_available"] is True

            # Cross-check with DB
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT is_available FROM mechanics WHERE mechanic_id = %s;",
                        (mech["mechanic_id"],),
                    )
                    row = cur.fetchone()
                    assert row is not None
                    assert row[0] is True


# ---------------------------------------------------------------------------
# 6. Error handling — no traceback leak
# ---------------------------------------------------------------------------

class TestErrorHandling:
    def test_db_error_does_not_leak_traceback(self, client):
        """Simulate a DB failure → assert 500 with clean JSON,
        no raw exception string / 'Traceback' / 'psycopg2'."""
        with patch("routes.auth.get_db") as mock_db:
            mock_db.side_effect = RuntimeError("simulated DB failure")
            resp = client.post("/auth/register/user", json={
                "first_name": "Test",
                "phone_number": "+919111111111",
                "country": "IN",
            })
            assert resp.status_code == 500
            data = resp.get_json()
            assert "error" in data

            body_text = resp.get_data(as_text=True)
            assert "Traceback" not in body_text
            assert "psycopg2" not in body_text
            assert "simulated DB failure" not in body_text


# ---------------------------------------------------------------------------
# 7. Seed idempotency
# ---------------------------------------------------------------------------

class TestSeed:
    def test_seed_is_idempotent(self, client):
        """Run seed twice → mechanics count is still 20, not 40."""
        from seed import seed
        seed()
        seed()
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM mechanics;")
                count = cur.fetchone()[0]
                assert count == 20, f"Expected 20 mechanics, got {count}"

    def test_seed_count_and_availability(self, client):
        """After seed → exactly 20 mechanics, 13 available."""
        from seed import seed
        seed()
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM mechanics;")
                total = cur.fetchone()[0]
                assert total == 20, f"Expected 20 mechanics, got {total}"

                cur.execute(
                    "SELECT COUNT(*) FROM mechanics WHERE is_available = TRUE;"
                )
                available = cur.fetchone()[0]
                assert available == 13, (
                    f"Expected 13 available mechanics, got {available}"
                )
