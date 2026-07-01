"""
Stage 3 acceptance tests — core dispatch API (One-Tap SOS).

Requires DATABASE_URL in .env pointing to the Neon DB.
"""

import os
import secrets
import sys
import threading
import uuid
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from db import get_db, init_db
from routes.auth import _token_store
from seed import seed

LUCKNOW_LAT = 26.8550
LUCKNOW_LNG = 80.9400
REMOTE_LAT = 0.0
REMOTE_LNG = 0.0


@pytest.fixture(scope="session", autouse=True)
def _init_schema():
    init_db(force_reset=True)
    seed()


@pytest.fixture()
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture()
def app():
    application = create_app()
    application.config["TESTING"] = True
    return application


def _unique_phone():
    return f"+9191{uuid.uuid4().hex[:8]}"


def _read_otp_from_db(email):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT otp_code FROM otp_store WHERE email = %s;",
                (email,),
            )
            row = cur.fetchone()
            return row[0].strip() if row else None


def _register_and_verify_user(client, phone=None):
    phone = phone or _unique_phone()
    email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/auth/register/user", json={
        "first_name": "User",
        "last_name": "Test",
        "email": email,
        "phone_number": phone,
        "country": "IN",
    })
    assert resp.status_code == 201, resp.get_json()
    otp = _read_otp_from_db(email)
    verify = client.post("/auth/verify-otp", json={
        "email": email,
        "otp": otp,
        "role": "user",
    })
    assert verify.status_code == 200, verify.get_json()
    data = verify.get_json()
    return data["session_token"], data["id"], phone


def _register_and_verify_mechanic(client, phone=None, **overrides):
    phone = phone or _unique_phone()
    email = f"mech_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "first_name": "Mech",
        "last_name": "Test",
        "gender": "male",
        "email": email,
        "phone_number": phone,
        "country": "IN",
        "workshop_name": "Test Workshop",
        "address": "Gomti Nagar, Lucknow",
        "zone": "Gomti Nagar",
        "lat": 26.8500,
        "lng": 81.0000,
    }
    payload.update(overrides)
    resp = client.post("/auth/register/mechanic", json=payload)
    assert resp.status_code == 201, resp.get_json()
    otp = _read_otp_from_db(email)
    verify = client.post("/auth/verify-otp", json={
        "email": email,
        "otp": otp,
        "role": "mechanic",
    })
    assert verify.status_code == 200, verify.get_json()
    data = verify.get_json()
    return data["session_token"], data["id"], phone


def _token_for_mechanic(mechanic_id):
    token = secrets.token_hex(32)
    _token_store[token] = {"role": "mechanic", "id": str(mechanic_id)}
    return token


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_job(client, driver_token, **overrides):
    payload = {
        "issue_type": "battery",
        "lat": LUCKNOW_LAT,
        "lng": LUCKNOW_LNG,
    }
    payload.update(overrides)
    return client.post(
        "/jobs/create",
        json=payload,
        headers=_auth_headers(driver_token),
    )


def _get_broadcasts(job_id):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT mechanic_id, responded, accepted
                FROM job_broadcasts
                WHERE job_id = %s
                ORDER BY mechanic_id;
                """,
                (job_id,),
            )
            return cur.fetchall()


def _get_job_from_db(job_id):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT mechanic_id, status, cash_amount, completed_at
                FROM jobs WHERE job_id = %s;
                """,
                (job_id,),
            )
            return cur.fetchone()


class TestJobAuth:
    def test_create_without_auth_returns_401(self, client):
        resp = client.post("/jobs/create", json={
            "issue_type": "battery",
            "lat": LUCKNOW_LAT,
            "lng": LUCKNOW_LNG,
        })
        assert resp.status_code == 401
        assert resp.get_json()["error"] == "Authentication required"


class TestJobCreate:
    def test_create_success_with_broadcasts(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        resp = _create_job(client, driver_token)
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()
        assert data["job"]["status"] == "pending"
        assert data["mechanics_notified"] >= 1

        job_id = data["job"]["job_id"]
        broadcasts = _get_broadcasts(job_id)
        assert len(broadcasts) == data["mechanics_notified"]
        assert all(not row[1] and not row[2] for row in broadcasts)

    def test_create_invalid_issue_type(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        resp = _create_job(client, driver_token, issue_type="aliens")
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "Invalid issue_type"

    def test_create_zero_nearby_mechanics(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        resp = _create_job(
            client, driver_token,
            lat=REMOTE_LAT, lng=REMOTE_LNG,
        )
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()
        assert data["mechanics_notified"] == 0
        assert data["job"]["status"] == "pending"
        assert _get_broadcasts(data["job"]["job_id"]) == []


class TestJobAccept:
    def test_accept_success(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        create_resp = _create_job(client, driver_token)
        job_id = create_resp.get_json()["job"]["job_id"]
        broadcasts = _get_broadcasts(job_id)
        assert broadcasts

        winner_id = str(broadcasts[0][0])
        winner_token = _token_for_mechanic(winner_id)

        resp = client.patch(
            f"/jobs/{job_id}/accept",
            json={"mechanic_id": winner_id},
            headers=_auth_headers(winner_token),
        )
        assert resp.status_code == 200, resp.get_json()
        job = resp.get_json()["job"]
        assert job["status"] == "accepted"
        assert job["mechanic_id"] == winner_id

        db_row = _get_job_from_db(job_id)
        assert str(db_row[0]) == winner_id
        assert db_row[1] == "accepted"

    def test_accept_token_mismatch_returns_403(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        mech_token, mech_id, _ = _register_and_verify_mechanic(client)
        create_resp = _create_job(client, driver_token)
        job_id = create_resp.get_json()["job"]["job_id"]

        other_token, other_id, _ = _register_and_verify_mechanic(client)
        resp = client.patch(
            f"/jobs/{job_id}/accept",
            json={"mechanic_id": other_id},
            headers=_auth_headers(mech_token),
        )
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "Token does not match mechanic_id"

    def test_accept_already_accepted_returns_409(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        create_resp = _create_job(client, driver_token)
        job_id = create_resp.get_json()["job"]["job_id"]
        broadcasts = _get_broadcasts(job_id)
        assert len(broadcasts) >= 2

        winner_id = str(broadcasts[0][0])
        loser_id = str(broadcasts[1][0])
        winner_token = _token_for_mechanic(winner_id)
        loser_token = _token_for_mechanic(loser_id)

        first = client.patch(
            f"/jobs/{job_id}/accept",
            json={"mechanic_id": winner_id},
            headers=_auth_headers(winner_token),
        )
        assert first.status_code == 200

        second = client.patch(
            f"/jobs/{job_id}/accept",
            json={"mechanic_id": loser_id},
            headers=_auth_headers(loser_token),
        )
        assert second.status_code == 409
        assert second.get_json()["error"] == (
            "Job already accepted by another mechanic"
        )

    def test_accept_closes_out_broadcasts(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        create_resp = _create_job(client, driver_token)
        job_id = create_resp.get_json()["job"]["job_id"]
        broadcasts = _get_broadcasts(job_id)
        assert len(broadcasts) >= 2

        winner_id = str(broadcasts[0][0])
        winner_token = _token_for_mechanic(winner_id)

        resp = client.patch(
            f"/jobs/{job_id}/accept",
            json={"mechanic_id": winner_id},
            headers=_auth_headers(winner_token),
        )
        assert resp.status_code == 200

        updated = _get_broadcasts(job_id)
        for mechanic_id, responded, accepted in updated:
            assert responded is True
            if str(mechanic_id) == winner_id:
                assert accepted is True
            else:
                assert accepted is False

    def test_concurrent_accept_exactly_one_wins(self, app):
        with app.test_client() as client:
            driver_token, _, _ = _register_and_verify_user(client)
            create_resp = _create_job(client, driver_token)
            job_id = create_resp.get_json()["job"]["job_id"]
            broadcasts = _get_broadcasts(job_id)
            assert len(broadcasts) >= 3, "Need 3 broadcast mechanics for race test"

            mechanics = [
                (str(row[0]), _token_for_mechanic(row[0]))
                for row in broadcasts[:3]
            ]

        results = []
        barrier = threading.Barrier(3)

        def attempt_accept(mechanic_id, token):
            barrier.wait()
            with app.test_client() as c:
                resp = c.patch(
                    f"/jobs/{job_id}/accept",
                    json={"mechanic_id": mechanic_id},
                    headers=_auth_headers(token),
                )
                results.append(resp.status_code)

        threads = [
            threading.Thread(target=attempt_accept, args=(mid, tok))
            for mid, tok in mechanics
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert results.count(200) == 1, f"Expected 1 success, got {results}"
        assert results.count(409) == 2, f"Expected 2 conflicts, got {results}"

        db_row = _get_job_from_db(job_id)
        assert db_row[0] is not None, "mechanic_id must be set after race"
        assert db_row[1] == "accepted"


class TestJobComplete:
    def _accepted_job(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        create_resp = _create_job(client, driver_token)
        job_id = create_resp.get_json()["job"]["job_id"]
        broadcasts = _get_broadcasts(job_id)
        winner_id = str(broadcasts[0][0])
        winner_token = _token_for_mechanic(winner_id)
        client.patch(
            f"/jobs/{job_id}/accept",
            json={"mechanic_id": winner_id},
            headers=_auth_headers(winner_token),
        )
        return job_id, winner_id, winner_token

    def test_complete_success(self, client):
        job_id, winner_id, winner_token = self._accepted_job(client)
        resp = client.patch(
            f"/jobs/{job_id}/complete",
            json={"cash_amount": 450},
            headers=_auth_headers(winner_token),
        )
        assert resp.status_code == 200, resp.get_json()
        job = resp.get_json()["job"]
        assert job["status"] == "completed"
        assert job["cash_amount"] == 450.0
        assert job["completed_at"] is not None

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT event_type FROM mri_events
                    WHERE mechanic_id = %s
                    ORDER BY recorded_at DESC LIMIT 1;
                    """,
                    (winner_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row[0] == "COMPLETED"

    def test_complete_wrong_mechanic_returns_403(self, client):
        job_id, _, winner_token = self._accepted_job(client)
        other_token, other_id, _ = _register_and_verify_mechanic(client)
        resp = client.patch(
            f"/jobs/{job_id}/complete",
            json={"cash_amount": 450},
            headers=_auth_headers(other_token),
        )
        assert resp.status_code == 403

    def test_complete_negative_cash_amount_returns_400(self, client):
        job_id, _, winner_token = self._accepted_job(client)
        resp = client.patch(
            f"/jobs/{job_id}/complete",
            json={"cash_amount": -50},
            headers=_auth_headers(winner_token),
        )
        assert resp.status_code == 400
        assert resp.get_json()["error"] == (
            "cash_amount must be a non-negative number"
        )

    def test_complete_pending_job_returns_400(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        create_resp = _create_job(client, driver_token)
        job_id = create_resp.get_json()["job"]["job_id"]
        mech_token, mech_id, _ = _register_and_verify_mechanic(client)

        resp = client.patch(
            f"/jobs/{job_id}/complete",
            json={"cash_amount": 100},
            headers=_auth_headers(mech_token),
        )
        assert resp.status_code == 400
        assert "pending" in resp.get_json()["error"]


class TestJobGet:
    def test_get_existing_job(self, client):
        driver_token, driver_id, _ = _register_and_verify_user(client)
        create_resp = _create_job(client, driver_token)
        job_id = create_resp.get_json()["job"]["job_id"]

        resp = client.get(
            f"/jobs/{job_id}",
            headers=_auth_headers(driver_token),
        )
        assert resp.status_code == 200
        job = resp.get_json()["job"]
        assert job["job_id"] == job_id
        assert job["driver_id"] == driver_id
        assert job["issue_type"] == "battery"

    def test_get_nonexistent_job_returns_404(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        fake_id = str(uuid.uuid4())
        resp = client.get(
            f"/jobs/{fake_id}",
            headers=_auth_headers(driver_token),
        )
        assert resp.status_code == 404


class TestErrorHandling:
    def test_db_error_does_not_leak_traceback(self, client):
        driver_token, _, _ = _register_and_verify_user(client)
        with patch("routes.job.get_db") as mock_db:
            mock_db.side_effect = RuntimeError("simulated DB failure")
            resp = _create_job(client, driver_token)
            assert resp.status_code == 500
            body_text = resp.get_data(as_text=True)
            assert "Traceback" not in body_text
            assert "simulated DB failure" not in body_text
