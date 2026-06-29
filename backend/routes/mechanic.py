# curl example:
# curl "http://localhost:5000/mechanics/nearby?lat=26.8467&lng=80.9462&radius_km=10"

from flask import Blueprint, jsonify, request

from db import get_db

mechanic_bp = Blueprint("mechanic", __name__, url_prefix="/mechanics")


def _db_error_response(exc):
    return jsonify({"error": "Database error", "message": str(exc)}), 500


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

    radius_m = radius_km * 1000

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        name,
                        phone,
                        garage_name,
                        lat,
                        lng,
                        zone,
                        is_available,
                        rating,
                        ST_Distance(
                            location,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                        ) AS distance_m
                    FROM mechanics
                    WHERE is_available = TRUE
                      AND ST_DWithin(
                            location,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                            %s
                        )
                    ORDER BY distance_m ASC;
                    """,
                    (lng, lat, lng, lat, radius_m),
                )
                rows = cur.fetchall()
    except Exception as exc:
        return _db_error_response(exc)

    mechanics = []
    for row in rows:
        mechanics.append({
            "id": row[0],
            "name": row[1],
            "phone": row[2],
            "garage_name": row[3],
            "lat": row[4],
            "lng": row[5],
            "zone": row[6],
            "is_available": row[7],
            "rating": float(row[8]) if row[8] is not None else None,
            "distance_km": round(row[9] / 1000, 2),
        })

    return jsonify({
        "count": len(mechanics),
        "query": {"lat": lat, "lng": lng, "radius_km": radius_km},
        "mechanics": mechanics,
    })
