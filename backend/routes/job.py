# curl examples:
# curl -X POST http://localhost:5000/jobs/create \
#   -H "Authorization: Bearer <driver_token>" \
#   -H "Content-Type: application/json" \
#   -d '{"issue_type":"flat_tyre","lat":26.8467,"lng":80.9462}'
#
# curl -X PATCH http://localhost:5000/jobs/<job_id>/accept \
#   -H "Authorization: Bearer <mechanic_token>" \
#   -H "Content-Type: application/json" \
#   -d '{"mechanic_id":"<uuid>"}'
#
# curl -X PATCH http://localhost:5000/jobs/<job_id>/complete \
#   -H "Authorization: Bearer <mechanic_token>" \
#   -H "Content-Type: application/json" \
#   -d '{"cash_amount": 450}'
#
# curl http://localhost:5000/jobs/<job_id> \
#   -H "Authorization: Bearer <token>"

import logging
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request

from db import get_db
from routes.auth import require_auth
from routes.common import db_error_response
from routes.mechanic import fetch_nearby_mechanics
from routes.socket_events import active_jobs, emit_new_job, emit_match_confirmed

logger = logging.getLogger(__name__)

job_bp = Blueprint("job", __name__, url_prefix="/jobs")

VALID_ISSUE_TYPES = frozenset({
    "flat_tyre", "battery", "engine", "overheating", "other",
})


def _parse_uuid(value, field_name):
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError, AttributeError):
        return None


def _serialize_job(row):
    return {
        "job_id": str(row[0]),
        "driver_id": str(row[1]) if row[1] else None,
        "mechanic_id": str(row[2]) if row[2] else None,
        "issue_type": row[3],
        "status": row[4],
        "lat": float(row[5]) if row[5] is not None else None,
        "lng": float(row[6]) if row[6] is not None else None,
        "cash_amount": float(row[7]) if row[7] is not None else None,
        "created_at": row[8].isoformat() if row[8] else None,
        "accepted_at": row[9].isoformat() if row[9] else None,
        "completed_at": row[10].isoformat() if row[10] else None,
        "driver_phone": row[11] if len(row) > 11 else None,
        "mechanic_first_name": row[12] if len(row) > 12 else None,
        "workshop_name": row[13] if len(row) > 13 else None,
    }


def _fetch_job(cur, job_id):
    cur.execute(
        """
        SELECT
            j.job_id,
            j.driver_id,
            j.mechanic_id,
            j.issue_type,
            j.status,
            j.lat,
            j.lng,
            j.cash_amount,
            j.created_at,
            j.accepted_at,
            j.completed_at,
            u.phone_number AS driver_phone,
            m.first_name AS mechanic_first_name,
            m.workshop_name
        FROM jobs j
        LEFT JOIN users u ON u.user_id = j.driver_id
        LEFT JOIN mechanics m ON m.mechanic_id = j.mechanic_id
        WHERE j.job_id = %s;
        """,
        (job_id,),
    )
    return cur.fetchone()


@job_bp.route("/create", methods=["POST"])
@require_auth
def create_job():
    if g.auth["role"] != "user":
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json(silent=True) or {}
    driver_id = g.auth["id"]
    issue_type = (data.get("issue_type") or "").strip()

    if issue_type not in VALID_ISSUE_TYPES:
        return jsonify({"error": "Invalid issue_type"}), 400

    try:
        lat = float(data.get("lat"))
        lng = float(data.get("lng"))
    except (TypeError, ValueError):
        return jsonify({"error": "lat and lng must be valid numbers"}), 400

    photo_base64 = data.get("photo_base64")

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                nearby = fetch_nearby_mechanics(cur, lat, lng)

                cur.execute(
                    """
                    INSERT INTO jobs (
                        driver_id, issue_type, status, lat, lng,
                        driver_location, photo_base64
                    )
                    VALUES (
                        %s, %s, 'pending', %s, %s,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                        %s
                    )
                    RETURNING job_id;
                    """,
                    (driver_id, issue_type, lat, lng, lng, lat, photo_base64),
                )
                job_id = cur.fetchone()[0]

                for row in nearby:
                    cur.execute(
                        """
                        INSERT INTO job_broadcasts (job_id, mechanic_id)
                        VALUES (%s, %s);
                        """,
                        (job_id, row[0]),
                    )

                job_row = _fetch_job(cur, job_id)
    except Exception:
        return db_error_response()

    # ---- Stage 4: emit 'new_job' to broadcasted mechanics' rooms --------
    # DB transaction already committed at this point.  A socket failure must
    # NOT affect the REST response — wrap in try/except and log only.
    try:
        sio = current_app.extensions.get("socketio")
        if sio and nearby:
            mechanic_ids = [str(row[0]) for row in nearby]
            accept_deadline = (
                datetime.now(timezone.utc) + timedelta(seconds=120)
            ).isoformat()
            emit_new_job(
                sio,
                job_id=str(job_id),
                issue_type=issue_type,
                lat=lat,
                lng=lng,
                mechanic_ids=mechanic_ids,
                accept_deadline=accept_deadline,
            )
    except Exception:
        logger.exception("Socket emit 'new_job' failed for job %s (non-fatal)", job_id)
    # ---------------------------------------------------------------------

    return jsonify({
        "job": _serialize_job(job_row),
        "mechanics_notified": len(nearby),
    }), 201


@job_bp.route("/<job_id>/accept", methods=["PATCH"])
@require_auth
def accept_job(job_id):
    job_id = _parse_uuid(job_id, "job_id")
    if not job_id:
        return jsonify({"error": "Invalid job_id"}), 400

    if g.auth["role"] != "mechanic":
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json(silent=True) or {}
    mechanic_id = _parse_uuid(data.get("mechanic_id"), "mechanic_id")

    if not mechanic_id:
        return jsonify({"error": "mechanic_id is required"}), 400

    if g.auth["id"] != mechanic_id:
        return jsonify({"error": "Token does not match mechanic_id"}), 403

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT job_id FROM jobs WHERE job_id = %s;",
                    (job_id,),
                )
                if not cur.fetchone():
                    return jsonify({"error": "Job not found"}), 404

                cur.execute(
                    """
                    UPDATE jobs
                    SET mechanic_id = %s,
                        status = 'accepted',
                        accepted_at = NOW()
                    WHERE job_id = %s AND status = 'pending'
                    RETURNING job_id;
                    """,
                    (mechanic_id, job_id),
                )
                if not cur.fetchone():
                    return jsonify({
                        "error": "Job already accepted by another mechanic",
                    }), 409

                cur.execute(
                    """
                    UPDATE job_broadcasts
                    SET responded = TRUE, accepted = TRUE
                    WHERE job_id = %s AND mechanic_id = %s;
                    """,
                    (job_id, mechanic_id),
                )
                cur.execute(
                    """
                    UPDATE job_broadcasts
                    SET responded = TRUE, accepted = FALSE
                    WHERE job_id = %s AND mechanic_id != %s;
                    """,
                    (job_id, mechanic_id),
                )

                row = _fetch_job(cur, job_id)

                # Fetch mechanic details for match_confirmed payload
                cur.execute(
                    """
                    SELECT first_name, last_name, workshop_name, mri_score,
                           phone_number,
                           ST_Distance(
                               location,
                               (SELECT driver_location FROM jobs WHERE job_id = %s)
                           ) AS distance_m
                    FROM mechanics
                    WHERE mechanic_id = %s;
                    """,
                    (job_id, mechanic_id),
                )
                mech_row = cur.fetchone()
    except Exception:
        return db_error_response()

    # ---- Stage 4: emit 'match_confirmed' to driver's room ---------------
    # DB transaction already committed.  Socket failure is logged only.
    try:
        sio = current_app.extensions.get("socketio")
        if sio and mech_row:
            driver_id = row[1]  # _serialize_job row index 1 = driver_id
            distance_km = round(float(mech_row[5]) / 1000, 2) if mech_row[5] else None
            mechanic_data = {
                "name": f"{mech_row[0]} {mech_row[1]}".strip(),
                "workshop_name": mech_row[2],
                "mri_score": float(mech_row[3]) if mech_row[3] else None,
                "phone": mech_row[4],
                "distance_km": distance_km,
            }
            emit_match_confirmed(
                sio,
                job_id=str(job_id),
                driver_id=str(driver_id),
                mechanic_data=mechanic_data,
            )

            # Update active_jobs so mechanic_location pings know driver's SID.
            # We can't know the driver's SID here (REST context, not socket),
            # but we ensure the entry exists so rejoin_job can populate it.
            if str(job_id) not in active_jobs:
                active_jobs[str(job_id)] = {"driver_sid": None, "mechanic_sid": None}
    except Exception:
        logger.exception(
            "Socket emit 'match_confirmed' failed for job %s (non-fatal)", job_id
        )
    # ---------------------------------------------------------------------

    return jsonify({"job": _serialize_job(row)}), 200


@job_bp.route("/<job_id>/complete", methods=["PATCH"])
@require_auth
def complete_job(job_id):
    job_id = _parse_uuid(job_id, "job_id")
    if not job_id:
        return jsonify({"error": "Invalid job_id"}), 400

    if g.auth["role"] != "mechanic":
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json(silent=True) or {}
    cash_amount_raw = data.get("cash_amount")

    try:
        cash_amount = float(cash_amount_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "cash_amount must be a non-negative number"}), 400

    if cash_amount < 0:
        return jsonify({"error": "cash_amount must be a non-negative number"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT mechanic_id, status
                    FROM jobs
                    WHERE job_id = %s;
                    """,
                    (job_id,),
                )
                job_row = cur.fetchone()
                if not job_row:
                    return jsonify({"error": "Job not found"}), 404

                assigned_mechanic, status = job_row

                if status not in ("accepted", "in_progress"):
                    return jsonify({
                        "error": f"Job cannot be completed in '{status}' status",
                    }), 400

                if str(assigned_mechanic) != g.auth["id"]:
                    return jsonify({"error": "Not authorized to complete this job"}), 403

                cur.execute(
                    """
                    UPDATE jobs
                    SET status = 'completed',
                        completed_at = NOW(),
                        cash_amount = %s
                    WHERE job_id = %s;
                    """,
                    (cash_amount, job_id),
                )
                cur.execute(
                    """
                    INSERT INTO mri_events (mechanic_id, event_type)
                    VALUES (%s, 'COMPLETED');
                    """,
                    (assigned_mechanic,),
                )

                row = _fetch_job(cur, job_id)
    except Exception:
        return db_error_response()

    return jsonify({"job": _serialize_job(row)}), 200


@job_bp.route("/<job_id>", methods=["GET"])
@require_auth
def get_job(job_id):
    job_id = _parse_uuid(job_id, "job_id")
    if not job_id:
        return jsonify({"error": "Invalid job_id"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                row = _fetch_job(cur, job_id)
    except Exception:
        return db_error_response()

    if not row:
        return jsonify({"error": "Job not found"}), 404

    return jsonify({"job": _serialize_job(row)})
