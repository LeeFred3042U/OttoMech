# curl examples:
# curl -X POST http://localhost:5000/auth/register/user \
#   -H "Content-Type: application/json" \
#   -d '{"first_name":"Priya","last_name":"Sharma","email":"priya@example.com","phone_number":"+919876543210","country":"IN"}'
#
# curl -X POST http://localhost:5000/auth/register/mechanic \
#   -H "Content-Type: application/json" \
#   -d '{"first_name":"Raju","last_name":"Kumar","gender":"male","email":"raju@example.com","phone_number":"+919988776655","country":"IN","workshop_name":"Raju Auto Works","address":"Gomti Nagar, Lucknow","zone":"Gomti Nagar","lat":26.8467,"lng":80.9462}'
#
# curl -X POST http://localhost:5000/auth/verify-otp \
#   -H "Content-Type: application/json" \
#   -d '{"email":"priya@example.com","otp":"123456","role":"user"}'

import os
import random
import re
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from functools import wraps

from flask import Blueprint, g, jsonify, request

from db import get_db
from routes.common import db_error_response

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

_token_store = {}

OTP_EXPIRY_SECONDS = 300
COUNTRY_PATTERN = re.compile(r"^[A-Z]{2}$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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
    """Validate lat/lng if provided. Returns (lat, lng) tuple or None.
    Returns None for missing/invalid values — caller decides if that's an error."""
    if lat is None or lng is None:
        return None
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


def _store_otp(cur, email, otp_code, purpose):
    """Store OTP keyed by email address."""
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=OTP_EXPIRY_SECONDS)
    cur.execute(
        """
        INSERT INTO otp_store (email, otp_code, purpose, expires_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (email)
        DO UPDATE SET otp_code = EXCLUDED.otp_code,
                      purpose = EXCLUDED.purpose,
                      expires_at = EXCLUDED.expires_at;
        """,
        (email, otp_code, purpose, expires_at),
    )
    # Always print OTP to terminal — demo-day fallback, never removed.
    print(
        f"[OTP] email={email} otp={otp_code} "
        f"purpose={purpose} expires_at={expires_at.isoformat()}"
    )
    return expires_at


def _send_otp_email(email, otp_code):
    """Send OTP via Gmail SMTP. Returns True on success, False on failure.
    Never raises — email delivery failure must not crash registration."""
    gmail_address = os.getenv("GMAIL_ADDRESS")
    gmail_app_password = os.getenv("GMAIL_APP_PASSWORD")

    if not gmail_address or not gmail_app_password:
        print("[OTP EMAIL] GMAIL_ADDRESS or GMAIL_APP_PASSWORD not set — skipping email send")
        return False

    try:
        msg = MIMEText(
            f"Your OttoAssist verification code is: {otp_code}\n\n"
            f"This code expires in {OTP_EXPIRY_SECONDS // 60} minutes.\n"
            f"If you did not request this, please ignore this email.",
            "plain",
        )
        msg["Subject"] = f"OttoAssist OTP: {otp_code}"
        msg["From"] = gmail_address
        msg["To"] = email

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail_address, gmail_app_password)
            server.send_message(msg)

        print(f"[OTP EMAIL] Successfully sent to {email}")
        return True
    except Exception as exc:
        print(f"[OTP EMAIL] Failed to send to {email}: {exc}")
        return False


@auth_bp.route("/register/user", methods=["POST"])
def register_user():
    data = request.get_json(silent=True) or {}

    required = ["first_name", "email", "phone_number", "country"]
    missing = _missing_fields(data, required)
    if missing:
        return jsonify({
            "error": f"Missing required field(s): {', '.join(missing)}",
        }), 400

    email = (data.get("email") or "").strip().lower()
    if not EMAIL_PATTERN.match(email):
        return jsonify({"error": "Invalid email address"}), 400

    country = data.get("country")
    if isinstance(country, str):
        country = country.strip().upper()
    country_error = _validate_country(country)
    if country_error:
        return country_error

    phone_number = data.get("phone_number")
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    language = data.get("language") or "en"
    display_name = data.get("display_name")
    if not display_name and last_name:
        display_name = f"{first_name} {last_name}"
    elif not display_name:
        display_name = first_name

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Check email uniqueness
                cur.execute(
                    "SELECT 1 FROM users WHERE email = %s;",
                    (email,),
                )
                if cur.fetchone():
                    return jsonify({"error": "Email already registered"}), 409

                # Check phone uniqueness
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
                        phone_number, country, language
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
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
                _store_otp(cur, email, otp_code, "registration")
    except Exception:
        return db_error_response()

    # Send OTP email after DB commit — failure does not roll back registration
    email_sent = _send_otp_email(email, otp_code)

    return jsonify({
        "user_id": str(user_id),
        "message": "OTP sent for registration verification",
        "expires_in_seconds": OTP_EXPIRY_SECONDS,
        "email_delivery": "sent" if email_sent else "failed",
    }), 201


@auth_bp.route("/register/mechanic", methods=["POST"])
def register_mechanic():
    data = request.get_json(silent=True) or {}

    required = [
        "first_name",
        "last_name",
        "gender",
        "email",
        "phone_number",
        "country",
        "workshop_name",
        "address",
        "zone",
    ]
    missing = _missing_fields(data, required)
    if missing:
        return jsonify({
            "error": f"Missing required field(s): {', '.join(missing)}",
        }), 400

    email = (data.get("email") or "").strip().lower()
    if not EMAIL_PATTERN.match(email):
        return jsonify({"error": "Invalid email address"}), 400

    country = data.get("country")
    if isinstance(country, str):
        country = country.strip().upper()
    country_error = _validate_country(country)
    if country_error:
        return country_error

    # lat/lng are optional — captured via browser geolocation, may be null
    coords = _validate_coordinates(data.get("lat"), data.get("lng"))
    lat = coords[0] if coords else None
    lng = coords[1] if coords else None

    phone_number = data.get("phone_number")
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    gender = data.get("gender")
    workshop_name = data.get("workshop_name")
    address = data.get("address")
    zone = data.get("zone")
    language = data.get("language") or "en"
    display_name = data.get("display_name") or f"{first_name} {last_name}"

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Check email uniqueness
                cur.execute(
                    "SELECT 1 FROM mechanics WHERE email = %s;",
                    (email,),
                )
                if cur.fetchone():
                    return jsonify({"error": "Email already registered"}), 409

                # Check phone uniqueness
                cur.execute(
                    "SELECT 1 FROM mechanics WHERE phone_number = %s;",
                    (phone_number,),
                )
                if cur.fetchone():
                    return jsonify({"error": "Phone number already registered"}), 409

                otp_code = _generate_otp()

                if lat is not None and lng is not None:
                    cur.execute(
                        """
                        INSERT INTO mechanics (
                            first_name, last_name, display_name, gender, email,
                            phone_number, country, language, workshop_name, address,
                            zone, lat, lng, location, is_available
                        )
                        VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                            FALSE
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
                else:
                    cur.execute(
                        """
                        INSERT INTO mechanics (
                            first_name, last_name, display_name, gender, email,
                            phone_number, country, language, workshop_name, address,
                            zone, is_available
                        )
                        VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            FALSE
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
                        ),
                    )
                mechanic_id = cur.fetchone()[0]
                _store_otp(cur, email, otp_code, "registration")
    except Exception:
        return db_error_response()

    email_sent = _send_otp_email(email, otp_code)

    return jsonify({
        "mechanic_id": str(mechanic_id),
        "message": "OTP sent for registration verification",
        "expires_in_seconds": OTP_EXPIRY_SECONDS,
        "email_delivery": "sent" if email_sent else "failed",
    }), 201


@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    otp = data.get("otp")
    role = data.get("role")

    if role not in ("user", "mechanic"):
        return jsonify({"error": "role must be 'user' or 'mechanic'"}), 400

    if not email or not otp:
        missing = []
        if not email:
            missing.append("email")
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
                    WHERE email = %s;
                    """,
                    (email,),
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
                        "DELETE FROM otp_store WHERE email = %s;",
                        (email,),
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
                        SET last_login = NOW()
                        WHERE email = %s
                        RETURNING user_id;
                        """,
                        (email,),
                    )
                    identity = cur.fetchone()
                    if not identity:
                        return jsonify({"error": "Invalid OTP"}), 401
                    entity_id = identity[0]
                else:
                    cur.execute(
                        """
                        UPDATE mechanics
                        SET last_login = NOW()
                        WHERE email = %s
                        RETURNING mechanic_id;
                        """,
                        (email,),
                    )
                    identity = cur.fetchone()
                    if not identity:
                        return jsonify({"error": "Invalid OTP"}), 401
                    entity_id = identity[0]

                cur.execute(
                    "DELETE FROM otp_store WHERE email = %s;",
                    (email,),
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
