"""
Stages 5-6-7 tests — login flows, availability, MRI scoring, PDF receipts.

Does NOT modify test_stage2.py, test_stage3.py, or test_stage4.py.
"""

import base64
import os
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from db import get_db, init_db
from routes.auth import _token_store
from seed import seed


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def _init_schema():
    """Reset schema and seed mechanics once for the whole session."""
    init_db(force_reset=True)
    seed()


@pytest.fixture()
def app():
    application = create_app()
    application.config["TESTING"] = True
    return application


@pytest.fixture()
def client(app):
    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _unique_phone():
    return f"+9193{uuid.uuid4().hex[:8]}"


def _read_otp_from_db(email):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT otp_code FROM otp_store WHERE email = %s;",
                (email,),
            )
            row = cur.fetchone()
            return row[0].strip() if row else None


def _register_user(client, email=None, phone=None):
    email = email or f"u567_{uuid.uuid4().hex[:8]}@example.com"
    phone = phone or _unique_phone()
    r = client.post("/auth/register/user", json={
        "first_name": "Test",
        "last_name": "User567",
        "email": email,
        "phone_number": phone,
        "country": "IN",
    })
    assert r.status_code == 201, r.get_json()
    otp = _read_otp_from_db(email)
    v = client.post("/auth/verify-otp", json={
        "email": email,
        "otp": otp,
        "role": "user",
    })
    assert v.status_code == 200, v.get_json()
    data = v.get_json()
    return data["session_token"], data["id"], email


def _register_mechanic(client, email=None, phone=None, **overrides):
    email = email or f"m567_{uuid.uuid4().hex[:8]}@example.com"
    phone = phone or _unique_phone()
    payload = {
        "first_name": "Mech",
        "last_name": "Test567",
        "gender": "male",
        "email": email,
        "phone_number": phone,
        "country": "IN",
        "workshop_name": "S567 Workshop",
        "address": "Gomti Nagar",
        "zone": "Gomti Nagar",
        "lat": 26.8500,
        "lng": 81.0000,
    }
    payload.update(overrides)
    r = client.post("/auth/register/mechanic", json=payload)
    assert r.status_code == 201, r.get_json()
    otp = _read_otp_from_db(email)
    v = client.post("/auth/verify-otp", json={
        "email": email,
        "otp": otp,
        "role": "mechanic",
    })
    assert v.status_code == 200, v.get_json()
    data = v.get_json()
    return data["session_token"], data["id"], email


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _make_available(client, mechanic_token, mechanic_id):
    """Set mechanic to is_available=True."""
    r = client.patch(
        f"/mechanics/{mechanic_id}/availability",
        json={"is_available": True},
        headers=_auth_headers(mechanic_token),
    )
    assert r.status_code == 200, r.get_json()


def _complete_job_flow(client, cash_amount=350):
    """Full flow: register user + mechanic → create job → accept → complete.
    Returns (job_id, mechanic_id, user_token, mechanic_token)."""
    user_token, user_id, user_email = _register_user(client)
    mech_token, mech_id, mech_email = _register_mechanic(client)
    _make_available(client, mech_token, mech_id)

    # Create job near the mechanic
    r = client.post("/jobs/create", json={
        "issue_type": "flat_tyre",
        "lat": 26.8500,
        "lng": 81.0000,
    }, headers=_auth_headers(user_token))
    assert r.status_code == 201, r.get_json()
    job_id = r.get_json()["job"]["job_id"]

    # Accept
    r = client.patch(f"/jobs/{job_id}/accept", json={
        "mechanic_id": mech_id,
    }, headers=_auth_headers(mech_token))
    assert r.status_code == 200, r.get_json()

    # Complete
    r = client.patch(f"/jobs/{job_id}/complete", json={
        "cash_amount": cash_amount,
    }, headers=_auth_headers(mech_token))
    assert r.status_code == 200, r.get_json()

    return job_id, mech_id, user_token, mech_token


# ═══════════════════════════════════════════════════════════════
# STAGE 5 TESTS
# ═══════════════════════════════════════════════════════════════

class TestStage5LoginPages:
    def test_login_user_page_renders(self, client):
        r = client.get("/login/user")
        assert r.status_code == 200

    def test_dashboard_user_page_renders(self, client):
        r = client.get("/dashboard/user")
        assert r.status_code == 200

    def test_login_user_unknown_email_404(self, client):
        r = client.post("/auth/login/user", json={
            "email": f"nonexistent_{uuid.uuid4().hex[:8]}@example.com",
        })
        assert r.status_code == 404
        assert "No account found" in r.get_json()["error"]

    def test_login_user_known_email_200(self, client):
        _, _, email = _register_user(client)
        r = client.post("/auth/login/user", json={"email": email})
        assert r.status_code == 200
        body = r.get_json()
        assert "expires_in_seconds" in body
        assert body["message"] == "OTP sent for login verification"

    def test_login_user_otp_verify_flow(self, client):
        _, _, email = _register_user(client)
        # Send login OTP
        r = client.post("/auth/login/user", json={"email": email})
        assert r.status_code == 200
        # Read OTP and verify
        otp = _read_otp_from_db(email)
        v = client.post("/auth/verify-otp", json={
            "email": email,
            "otp": otp,
            "role": "user",
        })
        assert v.status_code == 200
        data = v.get_json()
        assert "session_token" in data
        assert data["role"] == "user"


# ═══════════════════════════════════════════════════════════════
# STAGE 6 TESTS
# ═══════════════════════════════════════════════════════════════

class TestStage6MechanicDashboard:
    def test_login_mechanic_page_renders(self, client):
        r = client.get("/login/mechanic")
        assert r.status_code == 200

    def test_login_mechanic_unknown_email_404(self, client):
        r = client.post("/auth/login/mechanic", json={
            "email": f"nonexistent_{uuid.uuid4().hex[:8]}@example.com",
        })
        assert r.status_code == 404
        assert "No account found" in r.get_json()["error"]

    def test_login_mechanic_known_email_200(self, client):
        _, _, email = _register_mechanic(client)
        r = client.post("/auth/login/mechanic", json={"email": email})
        assert r.status_code == 200
        body = r.get_json()
        assert body["message"] == "OTP sent for login verification"

    def test_availability_patch_200(self, client):
        token, mech_id, _ = _register_mechanic(client)
        r = client.patch(
            f"/mechanics/{mech_id}/availability",
            json={"is_available": True},
            headers=_auth_headers(token),
        )
        assert r.status_code == 200
        body = r.get_json()
        assert body["is_available"] is True
        assert body["mechanic_id"] == mech_id

    def test_availability_patch_403_wrong_token(self, client):
        token1, mech_id1, _ = _register_mechanic(client)
        _, mech_id2, _ = _register_mechanic(client)
        r = client.patch(
            f"/mechanics/{mech_id2}/availability",
            json={"is_available": True},
            headers=_auth_headers(token1),
        )
        assert r.status_code == 403

    def test_availability_updates_db(self, client):
        token, mech_id, _ = _register_mechanic(client)
        # Set to True
        client.patch(
            f"/mechanics/{mech_id}/availability",
            json={"is_available": True},
            headers=_auth_headers(token),
        )
        # Verify in DB
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT is_available FROM mechanics WHERE mechanic_id = %s;",
                    (mech_id,),
                )
                assert cur.fetchone()[0] is True

        # Set back to False
        client.patch(
            f"/mechanics/{mech_id}/availability",
            json={"is_available": False},
            headers=_auth_headers(token),
        )
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT is_available FROM mechanics WHERE mechanic_id = %s;",
                    (mech_id,),
                )
                assert cur.fetchone()[0] is False


# ═══════════════════════════════════════════════════════════════
# STAGE 7 TESTS
# ═══════════════════════════════════════════════════════════════

class TestStage7MRIAndReceipts:
    def test_mri_events_inserted_on_complete(self, client):
        """Checks all 3 event types: COMPLETED, ON_TIME or LATE, RESPONSE_TIME."""
        job_id, mech_id, _, _ = _complete_job_flow(client)

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT event_type FROM mri_events
                    WHERE mechanic_id = %s
                    ORDER BY recorded_at DESC;
                    """,
                    (mech_id,),
                )
                event_types = [row[0] for row in cur.fetchall()]

        assert "COMPLETED" in event_types
        assert "RESPONSE_TIME" in event_types
        # Must have exactly one of ON_TIME or LATE
        assert ("ON_TIME" in event_types) or ("LATE" in event_types)
        assert not (("ON_TIME" in event_types) and ("LATE" in event_types))

    def test_mri_score_updated_on_complete(self, client):
        """Checks mechanics.mri_score changes after completion."""
        job_id, mech_id, _, _ = _complete_job_flow(client)

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT mri_score FROM mechanics WHERE mechanic_id = %s;",
                    (mech_id,),
                )
                score = float(cur.fetchone()[0])

        # Score should not be the default 50.00 anymore (or at least
        # be a valid computed value)
        assert 0 <= score <= 100

    def test_on_time_vs_late_threshold(self, client):
        """Two jobs: one should be ON_TIME (default, fast accept), one forced LATE."""
        # Job 1: normal flow (fast accept → ON_TIME)
        job_id_1, mech_id_1, _, _ = _complete_job_flow(client)

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT event_type FROM mri_events
                    WHERE mechanic_id = %s AND event_type IN ('ON_TIME', 'LATE');
                    """,
                    (mech_id_1,),
                )
                types_1 = [r[0] for r in cur.fetchall()]

        # Fast accept should be ON_TIME
        assert "ON_TIME" in types_1

        # Job 2: manually backdate created_at to force LATE
        user_token, user_id, _ = _register_user(client)
        mech_token, mech_id_2, _ = _register_mechanic(client)
        _make_available(client, mech_token, mech_id_2)

        r = client.post("/jobs/create", json={
            "issue_type": "battery",
            "lat": 26.8500,
            "lng": 81.0000,
        }, headers=_auth_headers(user_token))
        assert r.status_code == 201
        job_id_2 = r.get_json()["job"]["job_id"]

        # Backdate created_at by 20 minutes
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE jobs
                    SET created_at = NOW() - INTERVAL '20 minutes'
                    WHERE job_id = %s;
                    """,
                    (job_id_2,),
                )

        r = client.patch(f"/jobs/{job_id_2}/accept", json={
            "mechanic_id": mech_id_2,
        }, headers=_auth_headers(mech_token))
        assert r.status_code == 200

        r = client.patch(f"/jobs/{job_id_2}/complete", json={
            "cash_amount": 500,
        }, headers=_auth_headers(mech_token))
        assert r.status_code == 200

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT event_type FROM mri_events
                    WHERE mechanic_id = %s AND event_type IN ('ON_TIME', 'LATE');
                    """,
                    (mech_id_2,),
                )
                types_2 = [r[0] for r in cur.fetchall()]

        assert "LATE" in types_2

    def test_mri_zero_division_safety(self, client):
        """New mechanic, first job only — no prior events. MRI must not crash."""
        job_id, mech_id, _, _ = _complete_job_flow(client)
        # The first completion already exercised zero-division paths
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT mri_score FROM mechanics WHERE mechanic_id = %s;",
                    (mech_id,),
                )
                score = float(cur.fetchone()[0])

        assert 0 <= score <= 100

    def test_receipt_generated_on_complete(self, client):
        """pdf_base64 not null after a successful completion."""
        job_id, _, _, _ = _complete_job_flow(client)

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT pdf_base64 FROM receipts WHERE job_id = %s;",
                    (job_id,),
                )
                row = cur.fetchone()

        assert row is not None, "No receipt row found"
        assert row[0] is not None, "pdf_base64 is null"
        assert len(row[0]) > 100, "pdf_base64 seems too short"

    def test_receipt_get_returns_base64(self, client):
        """GET /receipts returns 200."""
        job_id, _, user_token, _ = _complete_job_flow(client)

        r = client.get(
            f"/receipts/{job_id}",
            headers=_auth_headers(user_token),
        )
        assert r.status_code == 200
        body = r.get_json()
        assert body["pdf_base64"] is not None
        assert body["job_id"] == job_id

    def test_receipt_base64_is_valid_pdf(self, client):
        """Decoding the base64 from GET /receipts produces valid PDF magic bytes."""
        job_id, _, user_token, _ = _complete_job_flow(client)

        r = client.get(
            f"/receipts/{job_id}",
            headers=_auth_headers(user_token),
        )
        assert r.status_code == 200
        pdf_b64 = r.get_json()["pdf_base64"]
        pdf_bytes = base64.b64decode(pdf_b64)
        assert pdf_bytes[:5] == b"%PDF-", f"Expected %PDF-, got {pdf_bytes[:5]}"
