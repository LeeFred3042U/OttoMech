# curl example:
# curl "http://localhost:5000/mechanics/available"

import math
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db
from routes.auth import require_auth
from routes.common import db_error_response

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory mechanic location store — mechanic_id → (lat, lng)
# Updated via the 'mechanic_online' Socket.IO event.
# ---------------------------------------------------------------------------
_mechanic_locations: dict = {}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return great-circle distance in kilometres between two GPS points."""
    R = 6371.0  # Earth radius km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

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
    """Return available mechanics within radius_km of (lat, lng).

    Mechanics that have not sent a 'mechanic_online' location ping yet are
    included as a fallback so new mechanics are never invisible.
    """
    # Fetch ALL available mechanics to ensure we don't exclude new mechanics
    # who have a lower rating than seeded mock mechanics.
    query = AVAILABLE_MECHANICS_SQL.replace("LIMIT %s;", "")
    cur.execute(query)
    rows = cur.fetchall()

    nearby = []
    no_location = []  # mechanics with no stored location (fallback)
    for row in rows:
        mech_id = str(row[0])
        coords = _mechanic_locations.get(mech_id)
        if coords is None:
            # No location pinged yet — include as fallback
            no_location.append(row)
        else:
            mech_lat, mech_lng = coords
            dist = haversine_km(lat, lng, mech_lat, mech_lng)
            if dist <= radius_km:
                nearby.append(row)
            else:
                logger.debug(
                    "fetch_nearby: mechanic %s is %.1f km away — excluded",
                    mech_id, dist,
                )

    # Prefer mechanics with a confirmed location; fall back to unlocated ones
    result = nearby if nearby else no_location
    return result[:limit]


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


@mechanic_bp.route("/<mechanic_id>/earnings", methods=["GET"])
@require_auth
def get_earnings(mechanic_id):
    """Return total earnings and list of completed jobs for a mechanic."""
    if g.auth["role"] != "mechanic":
        return jsonify({"error": "Authentication required"}), 401

    if g.auth["id"] != mechanic_id:
        return jsonify({"error": "Token does not match mechanic_id"}), 403

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT job_id, issue_type, cash_amount, completed_at
                    FROM jobs
                    WHERE mechanic_id = %s AND status = 'completed'
                    ORDER BY completed_at DESC;
                    """,
                    (mechanic_id,),
                )
                rows = cur.fetchall()
    except Exception:
        return db_error_response()

    total_earnings = 0.0
    jobs = []
    for row in rows:
        amount = float(row[2]) if row[2] else 0.0
        total_earnings += amount
        jobs.append({
            "job_id": str(row[0]),
            "issue_type": row[1],
            "cash_amount": amount,
            "completed_at": row[3].isoformat() if row[3] else None
        })

    return jsonify({
        "mechanic_id": mechanic_id,
        "total_earnings": total_earnings,
        "jobs": jobs
    }), 200

