# curl example:
# curl "http://localhost:5000/mechanics/nearby?lat=26.8550&lng=80.9400&radius_km=15"

from flask import Blueprint, g, jsonify, request

from db import get_db
from routes.auth import require_auth
from routes.common import db_error_response

mechanic_bp = Blueprint("mechanic", __name__, url_prefix="/mechanics")

NEARBY_MECHANICS_SQL = """
    SELECT
        mechanic_id,
        first_name,
        last_name,
        workshop_name,
        phone_number,
        zone,
        lat,
        lng,
        is_available,
        rating,
        ST_Distance(
            location,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
        ) AS distance_m
    FROM mechanics
    WHERE is_available = TRUE
      AND location IS NOT NULL
      AND ST_DWithin(
            location,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
            %s
        )
    ORDER BY distance_m ASC
    LIMIT %s;
"""


def fetch_nearby_mechanics(cur, lat, lng, radius_km=5, limit=3):
    radius_m = radius_km * 1000
    cur.execute(
        NEARBY_MECHANICS_SQL,
        (lng, lat, lng, lat, radius_m, limit),
    )
    return cur.fetchall()


@mechanic_bp.route("/nearby", methods=["GET"])
def nearby_mechanics():
    try:
        lat = float(request.args.get("lat", ""))
        lng = float(request.args.get("lng", ""))
        radius_km = float(request.args.get("radius_km", "5"))
    except (TypeError, ValueError):
        return jsonify({
            "error": "lat, lng, and radius_km must be valid numbers",
        }), 400

    if radius_km <= 0:
        return jsonify({"error": "radius_km must be greater than 0"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                rows = fetch_nearby_mechanics(cur, lat, lng, radius_km=radius_km)
    except Exception:
        return db_error_response()

    mechanics = []
    for row in rows:
        mechanics.append({
            "mechanic_id": str(row[0]),
            "first_name": row[1],
            "last_name": row[2],
            "workshop_name": row[3],
            "phone_number": row[4],
            "zone": row[5],
            "lat": float(row[6]) if row[6] is not None else None,
            "lng": float(row[7]) if row[7] is not None else None,
            "is_available": row[8],
            "rating": float(row[9]) if row[9] is not None else None,
            "distance_km": round(row[10] / 1000, 2),
        })

    return jsonify({
        "count": len(mechanics),
        "query": {"lat": lat, "lng": lng, "radius_km": radius_km},
        "mechanics": mechanics,
    })


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

