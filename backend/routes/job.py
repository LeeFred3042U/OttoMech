# curl examples:
# curl -X POST http://localhost:5000/jobs/create \
#   -H "Content-Type: application/json" \
#   -d '{"driver_phone": "9876543210", "issue_type": "flat_tire", "lat": 26.8467, "lng": 80.9462}'
#
# curl -X PATCH http://localhost:5000/jobs/1/accept \
#   -H "Content-Type: application/json" \
#   -d '{"mechanic_id": 1}'
#
# curl http://localhost:5000/jobs/1

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from db import get_db

job_bp = Blueprint("job", __name__, url_prefix="/jobs")


def _db_error_response(exc):
    return jsonify({"error": "Database error", "message": str(exc)}), 500


def _serialize_job(row):
    return {
        "id": row[0],
        "driver_id": row[1],
        "mechanic_id": row[2],
        "issue_type": row[3],
        "status": row[4],
        "created_at": row[5].isoformat() if row[5] else None,
        "accepted_at": row[6].isoformat() if row[6] else None,
        "completed_at": row[7].isoformat() if row[7] else None,
        "lat": row[8],
        "lng": row[9],
        "driver_phone": row[10] if len(row) > 10 else None,
        "mechanic_name": row[11] if len(row) > 11 else None,
        "garage_name": row[12] if len(row) > 12 else None,
    }


def _fetch_job(cur, job_id):
    cur.execute(
        """
        SELECT
            j.id,
            j.driver_id,
            j.mechanic_id,
            j.issue_type,
            j.status,
            j.created_at,
            j.accepted_at,
            j.completed_at,
            j.lat,
            j.lng,
            u.phone AS driver_phone,
            m.name AS mechanic_name,
            m.garage_name
        FROM jobs j
        LEFT JOIN users u ON u.id = j.driver_id
        LEFT JOIN mechanics m ON m.id = j.mechanic_id
        WHERE j.id = %s;
        """,
        (job_id,),
    )
    return cur.fetchone()


@job_bp.route("/create", methods=["POST"])
def create_job():
    data = request.get_json(silent=True) or {}
    driver_phone = (data.get("driver_phone") or "").strip()
    issue_type = (data.get("issue_type") or "").strip()

    try:
        lat = float(data.get("lat"))
        lng = float(data.get("lng"))
    except (TypeError, ValueError):
        return jsonify({"error": "lat and lng must be valid numbers"}), 400

    if not driver_phone or not issue_type:
        return jsonify({"error": "driver_phone and issue_type are required"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (phone)
                    VALUES (%s)
                    ON CONFLICT (phone) DO NOTHING;
                    """,
                    (driver_phone,),
                )
                cur.execute(
                    "SELECT id FROM users WHERE phone = %s;",
                    (driver_phone,),
                )
                driver_row = cur.fetchone()
                if not driver_row:
                    return jsonify({"error": "Failed to resolve driver"}), 500

                driver_id = driver_row[0]

                cur.execute(
                    """
                    INSERT INTO jobs (driver_id, issue_type, status, lat, lng)
                    VALUES (%s, %s, 'pending', %s, %s)
                    RETURNING id;
                    """,
                    (driver_id, issue_type, lat, lng),
                )
                job_id = cur.fetchone()[0]
                row = _fetch_job(cur, job_id)
    except Exception as exc:
        return _db_error_response(exc)

    return jsonify({
        "message": "Job created successfully",
        "job": _serialize_job(row),
    }), 201


@job_bp.route("/<int:job_id>/accept", methods=["PATCH"])
def accept_job(job_id):
    data = request.get_json(silent=True) or {}
    mechanic_id = data.get("mechanic_id")

    if mechanic_id is None:
        return jsonify({"error": "mechanic_id is required"}), 400

    try:
        mechanic_id = int(mechanic_id)
    except (TypeError, ValueError):
        return jsonify({"error": "mechanic_id must be an integer"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, status FROM jobs WHERE id = %s;",
                    (job_id,),
                )
                job_row = cur.fetchone()
                if not job_row:
                    return jsonify({"error": "Job not found"}), 404

                if job_row[1] != "pending":
                    return jsonify({
                        "error": f"Job cannot be accepted in '{job_row[1]}' status",
                    }), 400

                cur.execute(
                    """
                    SELECT id, is_available
                    FROM mechanics
                    WHERE id = %s;
                    """,
                    (mechanic_id,),
                )
                mechanic_row = cur.fetchone()
                if not mechanic_row:
                    return jsonify({"error": "Mechanic not found"}), 404

                if not mechanic_row[1]:
                    return jsonify({"error": "Mechanic is not available"}), 400

                accepted_at = datetime.now(timezone.utc)
                cur.execute(
                    """
                    UPDATE jobs
                    SET mechanic_id = %s,
                        status = 'accepted',
                        accepted_at = %s
                    WHERE id = %s;
                    """,
                    (mechanic_id, accepted_at, job_id),
                )
                row = _fetch_job(cur, job_id)
    except Exception as exc:
        return _db_error_response(exc)

    return jsonify({
        "message": "Job accepted successfully",
        "job": _serialize_job(row),
    })


@job_bp.route("/<int:job_id>", methods=["GET"])
def get_job(job_id):
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                row = _fetch_job(cur, job_id)
    except Exception as exc:
        return _db_error_response(exc)

    if not row:
        return jsonify({"error": "Job not found"}), 404

    return jsonify({"job": _serialize_job(row)})
