# curl examples:
# curl -X POST http://localhost:5000/auth/register/user \
#   -H "Content-Type: application/json" \
#   -d '{"first_name":"Priya","last_name":"Sharma","phone_number":"+919876543210","country":"IN"}'
#
# curl -X POST http://localhost:5000/auth/register/mechanic \
#   -H "Content-Type: application/json" \
#   -d '{"first_name":"Raju","last_name":"Kumar","gender":"male","phone_number":"+919988776655","country":"IN","workshop_name":"Raju Auto Works","address":"Gomti Nagar, Lucknow","zone":"Gomti Nagar","lat":26.8467,"lng":80.9462}'
#
# curl -X POST http://localhost:5000/auth/verify-otp \
#   -H "Content-Type: application/json" \
#   -d '{"phone_number":"+919876543210","otp":"123456","role":"user"}'

import random
import re
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Blueprint, g, jsonify, request

from db import get_db
from routes.common import db_error_response

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

_token_store = {}

OTP_EXPIRY_SECONDS = 300
COUNTRY_PATTERN = re.compile(r"^[A-Z]{2}$")


def validate_token(token):
    if not token:
        return None
    return _token_store.get(token)


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        session = validate_token(token)
        if not session:
            return jsonify({"error": "Authentication required"}), 401
        g.auth = session
        return f(*args, **kwargs)

    return decorated


def _missing_fields(data, required):
    return [field for field in required if data.get(field) in (None, "")]


def _validate_country(country):
    if not country or not COUNTRY_PATTERN.match(country):
        return jsonify({
            "error": "country must be a 2-letter ISO 3166-1 alpha-2 code",
        }), 400
    return None


def _validate_coordinates(lat, lng):
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None

    if not (-90 <= lat_f <= 90 and -180 <= lng_f <= 180):
        return None

    return lat_f, lng_f


def _generate_otp():
    return f"{random.randint(0, 999999):06d}"


def _store_otp(cur, phone_number, otp_code, purpose):
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=OTP_EXPIRY_SECONDS)
    cur.execute(
        """
        INSERT INTO otp_store (phone, otp_code, purpose, expires_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (phone)
        DO UPDATE SET otp_code = EXCLUDED.otp_code,
                      purpose = EXCLUDED.purpose,
                      expires_at = EXCLUDED.expires_at;
        """,
        (phone_number, otp_code, purpose, expires_at),
    )
    print(
        f"[OTP] phone={phone_number} otp={otp_code} "
        f"purpose={purpose} expires_at={expires_at.isoformat()}"
    )
    return expires_at


@auth_bp.route("/register/user", methods=["POST"])
def register_user():
    data = request.get_json(silent=True) or {}

    required = ["first_name", "phone_number", "country"]
    missing = _missing_fields(data, required)
    if missing:
        return jsonify({
            "error": f"Missing required field(s): {', '.join(missing)}",
        }), 400

    country = data.get("country")
    if isinstance(country, str):
        country = country.strip().upper()
    country_error = _validate_country(country)
    if country_error:
        return country_error

    phone_number = data.get("phone_number")
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    email = data.get("email")
    language = data.get("language") or "en"
    display_name = data.get("display_name")
    if not display_name and last_name:
        display_name = f"{first_name} {last_name}"
    elif not display_name:
        display_name = first_name

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM users WHERE phone_number = %s;",
                    (phone_number,),
                )
                if cur.fetchone():
                    return jsonify({"error": "Phone number already registered"}), 409

                otp_code = _generate_otp()

                cur.execute(
                    """
                    INSERT INTO users (
                        first_name, last_name, display_name, email,
                        phone_number, country, language, phone_verified
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE)
                    RETURNING user_id;
                    """,
                    (
                        first_name,
                        last_name,
                        display_name,
                        email,
                        phone_number,
                        country,
                        language,
                    ),
                )
                user_id = cur.fetchone()[0]
                _store_otp(cur, phone_number, otp_code, "registration")
    except Exception:
        return db_error_response()

    return jsonify({
        "user_id": str(user_id),
        "message": "OTP sent for registration verification",
        "expires_in_seconds": OTP_EXPIRY_SECONDS,
    }), 201


@auth_bp.route("/register/mechanic", methods=["POST"])
def register_mechanic():
    data = request.get_json(silent=True) or {}

    required = [
        "first_name",
        "last_name",
        "gender",
        "phone_number",
        "country",
        "workshop_name",
        "address",
        "zone",
        "lat",
        "lng",
    ]
    missing = _missing_fields(data, required)
    if missing:
        return jsonify({
            "error": f"Missing required field(s): {', '.join(missing)}",
        }), 400

    country = data.get("country")
    if isinstance(country, str):
        country = country.strip().upper()
    country_error = _validate_country(country)
    if country_error:
        return country_error

    coords = _validate_coordinates(data.get("lat"), data.get("lng"))
    if coords is None:
        return jsonify({"error": "Invalid coordinates"}), 400
    lat, lng = coords

    phone_number = data.get("phone_number")
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    gender = data.get("gender")
    workshop_name = data.get("workshop_name")
    address = data.get("address")
    zone = data.get("zone")
    email = data.get("email")
    language = data.get("language") or "en"
    display_name = data.get("display_name") or f"{first_name} {last_name}"

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM mechanics WHERE phone_number = %s;",
                    (phone_number,),
                )
                if cur.fetchone():
                    return jsonify({"error": "Phone number already registered"}), 409

                otp_code = _generate_otp()

                cur.execute(
                    """
                    INSERT INTO mechanics (
                        first_name, last_name, display_name, gender, email,
                        phone_number, country, language, workshop_name, address,
                        zone, lat, lng, location, phone_verified, is_available
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                        FALSE, FALSE
                    )
                    RETURNING mechanic_id;
                    """,
                    (
                        first_name,
                        last_name,
                        display_name,
                        gender,
                        email,
                        phone_number,
                        country,
                        language,
                        workshop_name,
                        address,
                        zone,
                        lat,
                        lng,
                        lng,
                        lat,
                    ),
                )
                mechanic_id = cur.fetchone()[0]
                _store_otp(cur, phone_number, otp_code, "registration")
    except Exception:
        return db_error_response()

    return jsonify({
        "mechanic_id": str(mechanic_id),
        "message": "OTP sent for registration verification",
        "expires_in_seconds": OTP_EXPIRY_SECONDS,
    }), 201


@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    data = request.get_json(silent=True) or {}

    phone_number = data.get("phone_number")
    otp = data.get("otp")
    role = data.get("role")

    if role not in ("user", "mechanic"):
        return jsonify({"error": "role must be 'user' or 'mechanic'"}), 400

    if not phone_number or not otp:
        missing = []
        if not phone_number:
            missing.append("phone_number")
        if not otp:
            missing.append("otp")
        return jsonify({
            "error": f"Missing required field(s): {', '.join(missing)}",
        }), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT otp_code, expires_at
                    FROM otp_store
                    WHERE phone = %s;
                    """,
                    (phone_number,),
                )
                row = cur.fetchone()

                if not row:
                    return jsonify({"error": "Invalid OTP"}), 401

                stored_otp, expires_at = row
                now = datetime.now(timezone.utc)
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)

                if now > expires_at:
                    cur.execute(
                        "DELETE FROM otp_store WHERE phone = %s;",
                        (phone_number,),
                    )
                    return jsonify({
                        "error": "OTP expired, please request a new one",
                    }), 410

                if stored_otp != otp:
                    return jsonify({"error": "Invalid OTP"}), 401

                if role == "user":
                    cur.execute(
                        """
                        UPDATE users
                        SET phone_verified = TRUE, last_login = NOW()
                        WHERE phone_number = %s
                        RETURNING user_id;
                        """,
                        (phone_number,),
                    )
                    identity = cur.fetchone()
                    if not identity:
                        return jsonify({"error": "Invalid OTP"}), 401
                    entity_id = identity[0]
                else:
                    cur.execute(
                        """
                        UPDATE mechanics
                        SET phone_verified = TRUE, last_login = NOW()
                        WHERE phone_number = %s
                        RETURNING mechanic_id;
                        """,
                        (phone_number,),
                    )
                    identity = cur.fetchone()
                    if not identity:
                        return jsonify({"error": "Invalid OTP"}), 401
                    entity_id = identity[0]

                cur.execute(
                    "DELETE FROM otp_store WHERE phone = %s;",
                    (phone_number,),
                )
    except Exception:
        return db_error_response()

    session_token = secrets.token_hex(32)
    _token_store[session_token] = {"role": role, "id": str(entity_id)}

    return jsonify({
        "message": "OTP verified successfully",
        "session_token": session_token,
        "role": role,
        "id": str(entity_id),
    })
