# curl example:
# curl "http://localhost:5000/mechanics/available"

from flask import Blueprint, g, jsonify, request

from db import get_db
from routes.auth import require_auth
from routes.common import db_error_response

mechanic_bp = Blueprint("mechanic", __name__, url_prefix="/mechanics")

AVAILABLE_MECHANICS_SQL = """
    SELECT
        mechanic_id,
        first_name,
        last_name,
        workshop_name,
        phone_number,
        zone,
        address,
        is_available,
        rating,
        mri_score
    FROM mechanics
    WHERE is_available = TRUE
    ORDER BY rating DESC
    LIMIT %s;
"""


def fetch_nearby_mechanics(cur, lat, lng, radius_km=50, limit=10):
    """Returns available mechanics (location-agnostic — lat/lng args kept for API compat)."""
    cur.execute(AVAILABLE_MECHANICS_SQL, (limit,))
    return cur.fetchall()


@mechanic_bp.route("/available", methods=["GET"])
def available_mechanics():
    """Return all currently available mechanics, ordered by rating."""
    limit = min(int(request.args.get("limit", 20)), 50)

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(AVAILABLE_MECHANICS_SQL, (limit,))
                rows = cur.fetchall()
    except Exception:
        return db_error_response()

    mechanics = [
        {
            "mechanic_id": str(row[0]),
            "first_name": row[1],
            "last_name": row[2],
            "workshop_name": row[3],
            "phone_number": row[4],
            "zone": row[5],
            "address": row[6],
            "is_available": row[7],
            "rating": float(row[8]) if row[8] is not None else None,
            "mri_score": float(row[9]) if row[9] is not None else None,
        }
        for row in rows
    ]

    return jsonify({"count": len(mechanics), "mechanics": mechanics})


@mechanic_bp.route("/<mechanic_id>/availability", methods=["PATCH"])
@require_auth
def update_availability(mechanic_id):
    """Toggle a mechanic's is_available status.

    Auth: require_auth, must be mechanic role, token must match mechanic_id.
    Body: {is_available: bool}
    Returns: 200 {mechanic_id, is_available} or 403 on mismatch.
    """
    if g.auth["role"] != "mechanic":
        return jsonify({"error": "Authentication required"}), 401

    if g.auth["id"] != mechanic_id:
        return jsonify({"error": "Token does not match mechanic_id"}), 403

    data = request.get_json(silent=True) or {}
    is_available = data.get("is_available")

    if is_available is None or not isinstance(is_available, bool):
        return jsonify({"error": "is_available must be a boolean"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE mechanics
                    SET is_available = %s
                    WHERE mechanic_id = %s
                    RETURNING mechanic_id, is_available;
                    """,
                    (is_available, mechanic_id),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Mechanic not found"}), 404
    except Exception:
        return db_error_response()

    return jsonify({
        "mechanic_id": str(row[0]),
        "is_available": row[1],
    }), 200

