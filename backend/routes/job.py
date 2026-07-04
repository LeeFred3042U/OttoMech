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

import json
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
        "vehicle_model": row[14] if len(row) > 14 else None,
        "photos": row[15] if len(row) > 15 else None,
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
            m.workshop_name,
            j.vehicle_model,
            j.photos
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
    
    issue_type_str = (data.get("issue_type") or "").strip()
    issues = [i.strip() for i in issue_type_str.split(",") if i.strip()]
    
    if not issues or not all(i in VALID_ISSUE_TYPES for i in issues):
        return jsonify({"error": "Invalid issue_type"}), 400
        
    issue_type = ",".join(issues)

    try:
        lat = float(data.get("lat"))
        lng = float(data.get("lng"))
    except (TypeError, ValueError):
        return jsonify({"error": "lat and lng must be valid numbers"}), 400

    photos = data.get("photos")
    photos_json = json.dumps(photos) if photos else None
    vehicle_model = data.get("vehicle_model")

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                nearby = fetch_nearby_mechanics(cur, lat, lng)

                cur.execute(
                    """
                    INSERT INTO jobs (
                        driver_id, issue_type, status, lat, lng,
                        vehicle_model, photos
                    )
                    VALUES (
                        %s, %s, 'pending', %s, %s,
                        %s, %s
                    )
                    RETURNING job_id;
                    """,
                    (driver_id, issue_type, lat, lng, vehicle_model, photos_json),
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

            # Trigger push notifications for the broadcasted mechanics
            try:
                from routes.push import send_push_notification
                payload = {
                    "title": "New Job Request",
                    "body": f"A user requested help for: {issue_type}. Open the app to respond.",
                    "url": "/dashboard/mechanic"
                }
                for mech_id in mechanic_ids:
                    send_push_notification(mech_id, payload)
            except Exception as e:
                logger.error("Failed to send push notifications: %s", e)
                
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
                           phone_number
                    FROM mechanics
                    WHERE mechanic_id = %s;
                    """,
                    (mechanic_id,),
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
            mechanic_data = {
                "name": f"{mech_row[0]} {mech_row[1]}".strip(),
                "workshop_name": mech_row[2],
                "mri_score": float(mech_row[3]) if mech_row[3] else None,
                "phone": mech_row[4],
                "distance_km": None,
            }
            emit_match_confirmed(
                sio,
                job_id=str(job_id),
                driver_id=str(driver_id),
                mechanic_data=mechanic_data,
            )

            if str(job_id) not in active_jobs:
                active_jobs[str(job_id)] = {"driver_sid": None, "mechanic_sid": None}

            # Trigger push notification for the driver
            try:
                from routes.push import send_push_notification
                payload = {
                    "title": "Mechanic Found!",
                    "body": f"{mechanic_data['name']} is on their way. Open the app to track.",
                    "url": "/dashboard/user"
                }
                send_push_notification(str(driver_id), payload)
            except Exception as e:
                logger.error("Failed to send push notification to driver: %s", e)

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

                # ── Stage 7: MRI events ──────────────────────────────
                # 1. COMPLETED event
                cur.execute(
                    """
                    INSERT INTO mri_events (mechanic_id, event_type)
                    VALUES (%s, 'COMPLETED');
                    """,
                    (assigned_mechanic,),
                )

                # Fetch timing data for ON_TIME/LATE and RESPONSE_TIME
                cur.execute(
                    """
                    SELECT created_at, accepted_at, completed_at
                    FROM jobs
                    WHERE job_id = %s;
                    """,
                    (job_id,),
                )
                timing = cur.fetchone()
                if timing and timing[0] and timing[1]:
                    created_at = timing[0]
                    accepted_at = timing[1]
                    completed_at = timing[2]

                    # Ensure timezone-aware
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=timezone.utc)
                    if accepted_at.tzinfo is None:
                        accepted_at = accepted_at.replace(tzinfo=timezone.utc)

                    # 2. ON_TIME or LATE (threshold: 10 minutes)
                    accept_delta = (accepted_at - created_at).total_seconds()
                    if accept_delta <= 600:  # 10 minutes
                        cur.execute(
                            """
                            INSERT INTO mri_events (mechanic_id, event_type)
                            VALUES (%s, 'ON_TIME');
                            """,
                            (assigned_mechanic,),
                        )
                    else:
                        cur.execute(
                            """
                            INSERT INTO mri_events (mechanic_id, event_type)
                            VALUES (%s, 'LATE');
                            """,
                            (assigned_mechanic,),
                        )

                    # 3. RESPONSE_TIME event (value = seconds from accept to complete)
                    if completed_at:
                        if completed_at.tzinfo is None:
                            completed_at = completed_at.replace(tzinfo=timezone.utc)
                        response_seconds = (completed_at - accepted_at).total_seconds()
                        cur.execute(
                            """
                            INSERT INTO mri_events (mechanic_id, event_type, value)
                            VALUES (%s, 'RESPONSE_TIME', %s);
                            """,
                            (assigned_mechanic, response_seconds),
                        )

                # ── Stage 7: MRI recomputation ───────────────────────
                try:
                    from routes.mri import compute_mri_score
                    new_score = compute_mri_score(cur, assigned_mechanic)
                    cur.execute(
                        """
                        UPDATE mechanics
                        SET mri_score = %s
                        WHERE mechanic_id = %s;
                        """,
                        (new_score, assigned_mechanic),
                    )
                except Exception:
                    logger.exception(
                        "MRI recomputation failed for mechanic %s (non-fatal)",
                        assigned_mechanic,
                    )

                # ── Stage 7: PDF receipt generation ──────────────────
                try:
                    from routes.mri import generate_receipt_pdf

                    # Fetch job and mechanic data for receipt
                    cur.execute(
                        """
                        SELECT j.job_id, j.issue_type, j.lat, j.lng, j.created_at,
                               j.cash_amount, j.mechanic_id,
                               m.first_name, m.last_name, m.workshop_name,
                               m.zone, m.mri_score
                        FROM jobs j
                        LEFT JOIN mechanics m ON m.mechanic_id = j.mechanic_id
                        WHERE j.job_id = %s;
                        """,
                        (job_id,),
                    )
                    receipt_row = cur.fetchone()
                    if receipt_row:
                        receipt_job_data = {
                            "job_id": str(receipt_row[0]),
                            "issue_type": receipt_row[1],
                            "lat": float(receipt_row[2]) if receipt_row[2] else None,
                            "lng": float(receipt_row[3]) if receipt_row[3] else None,
                            "created_at": receipt_row[4].isoformat() if receipt_row[4] else None,
                            "cash_amount": float(receipt_row[5]) if receipt_row[5] else 0,
                        }
                        receipt_mech_data = {
                            "name": f"{receipt_row[7]} {receipt_row[8]}".strip() if receipt_row[7] else "—",
                            "workshop_name": receipt_row[9] or "—",
                            "zone": receipt_row[10] or "—",
                            "mri_score": float(receipt_row[11]) if receipt_row[11] else 50.0,
                        }
                        pdf_base64 = generate_receipt_pdf(receipt_job_data, receipt_mech_data)

                        cur.execute(
                            """
                            INSERT INTO receipts (job_id, pdf_base64, cash_amount, warranty_days)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (job_id) DO UPDATE
                            SET pdf_base64 = EXCLUDED.pdf_base64,
                                cash_amount = EXCLUDED.cash_amount;
                            """,
                            (job_id, pdf_base64, cash_amount, data.get("warranty_days", 0)),
                        )
                except Exception:
                    logger.exception(
                        "PDF receipt generation failed for job %s (non-fatal)",
                        job_id,
                    )

                row = _fetch_job(cur, job_id)
                cur.execute("SELECT is_available FROM mechanics WHERE mechanic_id = %s;", (assigned_mechanic,))
                mech_row = cur.fetchone()
                is_available = mech_row[0] if mech_row else False
    except Exception:
        return db_error_response()

    # ── Stage 7: emit 'job_completed' to driver's room ───────────
    try:
        sio = current_app.extensions.get("socketio")
        if sio and row:
            sio.emit("job_completed", {
                "job_id": str(job_id),
                "cash_amount": float(cash_amount),
                "status": "completed",
            }, to=f"job_{job_id}")
    except Exception:
        logger.exception(
            "Socket emit 'job_completed' failed for job %s (non-fatal)", job_id
        )

    return jsonify({"status": "completed", "is_available": is_available}), 200


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


@job_bp.route("/<job_id>/cancel", methods=["PATCH"])
@require_auth
def cancel_job(job_id):
    """Cancel a pending or accepted job. User-only."""
    job_id = _parse_uuid(job_id, "job_id")
    if not job_id:
        return jsonify({"error": "Invalid job_id"}), 400

    if g.auth["role"] != "user":
        return jsonify({"error": "Only the requesting user can cancel a job"}), 403

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT driver_id, status FROM jobs WHERE job_id = %s;",
                    (job_id,),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Job not found"}), 404

                driver_id, status = row

                if str(driver_id) != g.auth["id"]:
                    return jsonify({"error": "Not authorized to cancel this job"}), 403

                if status not in ("pending", "accepted"):
                    return jsonify({
                        "error": f"Job cannot be cancelled in '{status}' status",
                    }), 400

                cur.execute(
                    "UPDATE jobs SET status = 'cancelled' WHERE job_id = %s;",
                    (job_id,),
                )
    except Exception:
        return db_error_response()

    return jsonify({"status": "cancelled", "job_id": str(job_id)}), 200


@job_bp.route("", methods=["GET"])
@require_auth
def list_jobs():
    """List jobs for the current user or mechanic. Optional ?status= filter."""
    role = g.auth["role"]
    entity_id = g.auth["id"]
    status_filter = request.args.get("status")

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                if role == "user":
                    col = "j.driver_id"
                else:
                    col = "j.mechanic_id"

                query = f"""
                    SELECT
                        j.job_id, j.driver_id, j.mechanic_id, j.issue_type,
                        j.status, j.lat, j.lng, j.cash_amount,
                        j.created_at, j.accepted_at, j.completed_at,
                        u.phone_number AS driver_phone,
                        m.first_name AS mechanic_first_name,
                        m.workshop_name,
                        j.vehicle_model,
                        j.photos
                    FROM jobs j
                    LEFT JOIN users u ON u.user_id = j.driver_id
                    LEFT JOIN mechanics m ON m.mechanic_id = j.mechanic_id
                    WHERE {col} = %s
                """
                params = [entity_id]

                if status_filter:
                    query += " AND j.status = %s"
                    params.append(status_filter)

                query += " ORDER BY j.created_at DESC LIMIT 50;"

                cur.execute(query, params)
                rows = cur.fetchall()
    except Exception:
        return db_error_response()

    jobs = [_serialize_job(row) for row in rows]
    return jsonify({"count": len(jobs), "jobs": jobs}), 200

@job_bp.route("/<job_id>/rate", methods=["POST"])
@require_auth
def rate_job(job_id):
    job_id = _parse_uuid(job_id, "job_id")
    if not job_id:
        return jsonify({"error": "Invalid job_id"}), 400

    if g.auth["role"] != "user":
        return jsonify({"error": "Only drivers can rate jobs"}), 403

    data = request.get_json(silent=True) or {}
    rating = data.get("rating")
    if not rating or not isinstance(rating, int) or rating < 1 or rating > 5:
        return jsonify({"error": "Rating must be an integer between 1 and 5"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT mechanic_id, status, job_rating FROM jobs WHERE job_id = %s AND driver_id = %s;",
                    (job_id, g.auth["id"]),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Job not found"}), 404

                mechanic_id, status, current_rating = row
                if status != "completed":
                    return jsonify({"error": "Can only rate completed jobs"}), 400
                if current_rating is not None:
                    return jsonify({"error": "Job already rated"}), 409

                cur.execute(
                    "UPDATE jobs SET job_rating = %s WHERE job_id = %s;",
                    (rating, job_id)
                )

                cur.execute(
                    """
                    INSERT INTO mri_events (mechanic_id, event_type, value)
                    VALUES (%s, 'RATED', %s);
                    """,
                    (mechanic_id, rating),
                )

                # Update average rating directly
                cur.execute(
                    """
                    UPDATE mechanics
                    SET rating = (rating * review_count + %s) / (review_count + 1),
                        review_count = review_count + 1
                    WHERE mechanic_id = %s;
                    """,
                    (rating, mechanic_id)
                )

                try:
                    from routes.mri import compute_mri_score
                    new_score = compute_mri_score(cur, mechanic_id)
                    cur.execute(
                        "UPDATE mechanics SET mri_score = %s WHERE mechanic_id = %s;",
                        (new_score, mechanic_id),
                    )
                except Exception:
                    logger.exception("MRI recomputation failed for mechanic %s", mechanic_id)

    except Exception:
        return db_error_response()

    return jsonify({"message": "Rating submitted successfully"}), 200


@job_bp.route("/<job_id>/messages", methods=["GET"])
@require_auth
def get_messages(job_id):
    job_id = _parse_uuid(job_id, "job_id")
    if not job_id:
        return jsonify({"error": "Invalid job_id"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Check authorization (must be driver or mechanic of the job)
                cur.execute(
                    "SELECT driver_id, mechanic_id FROM jobs WHERE job_id = %s;",
                    (job_id,),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Job not found"}), 404
                    
                driver_id, mechanic_id = row
                entity_id = g.auth["id"]
                if str(driver_id) != entity_id and str(mechanic_id) != entity_id:
                    return jsonify({"error": "Not authorized to view messages for this job"}), 403

                cur.execute(
                    """
                    SELECT id, sender_id, sender_role, message, sent_at
                    FROM chat_messages
                    WHERE job_id = %s
                    ORDER BY sent_at ASC;
                    """,
                    (job_id,)
                )
                rows = cur.fetchall()

        messages = [
            {
                "id": r[0],
                "sender_id": str(r[1]),
                "sender_role": r[2],
                "message": r[3],
                "sent_at": r[4].isoformat()
            }
            for r in rows
        ]

        return jsonify({"messages": messages}), 200

    except Exception:
        logger.exception("Failed to fetch messages for job %s", job_id)
        return db_error_response()

