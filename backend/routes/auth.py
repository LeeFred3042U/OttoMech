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
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from functools import wraps

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from flask import Blueprint, g, jsonify, request
from werkzeug.security import generate_password_hash, check_password_hash

from db import get_db
from routes.common import db_error_response

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

_token_store = {}
# Note: This rate limiter is in-memory and per-worker. If scaling to multiple workers 
# (e.g., Gunicorn with -w > 1), each worker will have its own counter, effectively multiplying the limit.
# For multi-worker setups, migrate this to a shared Redis store.
rate_limit_attempts = defaultdict(list)

OTP_EXPIRY_SECONDS = 300
COUNTRY_PATTERN = re.compile(r"^[A-Z]{2}$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def check_rate_limit(key, max_attempts=5, window_sec=300):
    now = time.time()
    rate_limit_attempts[key] = [t for t in rate_limit_attempts[key] if now - t < window_sec]
    if len(rate_limit_attempts[key]) >= max_attempts:
        return False
    rate_limit_attempts[key].append(now)
    return True


def validate_token(token):
    if not token:
        return None
    session = _token_store.get(token)
    if session:
        if session.get("expires_at", 0) < time.time():
            del _token_store[token]
            return None
        return session
    return None


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
        f"purpose={purpose} expires_at={expires_at.isoformat()}",
        flush=True
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
            f"Your OttoMech verification code is: {otp_code}\n\n"
            f"This code expires in {OTP_EXPIRY_SECONDS // 60} minutes.\n"
            f"If you did not request this, please ignore this email.",
            "plain",
        )
        msg["Subject"] = f"OttoMech OTP: {otp_code}"
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

def _send_setup_link_email(email, token):
    """Send Password Setup Link via Gmail SMTP."""
    gmail_address = os.getenv("GMAIL_ADDRESS")
    gmail_app_password = os.getenv("GMAIL_APP_PASSWORD")

    if not gmail_address or not gmail_app_password:
        print("[SETUP EMAIL] GMAIL_ADDRESS or GMAIL_APP_PASSWORD not set — skipping email send")
        return False

    try:
        from flask import request
        # Replace http:// to https:// if deployed (Render often sets headers, but just to be safe)
        base_url = request.url_root.rstrip('/')
        if 'onrender.com' in base_url and base_url.startswith('http://'):
            base_url = base_url.replace('http://', 'https://')
            
        setup_url = f"{base_url}/set-password?token={token}"
        msg = MIMEText(
            f"Please click the link below to set up your password for OttoMech:\n\n"
            f"{setup_url}\n\n"
            f"This link expires in 1 hour.\n"
            f"If you did not request this, please ignore this email.",
            "plain",
        )
        msg["Subject"] = "OttoMech: Set Your Password"
        msg["From"] = gmail_address
        msg["To"] = email

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail_address, gmail_app_password)
            server.send_message(msg)

        print(f"[SETUP EMAIL] Successfully sent to {email}")
        return True
    except Exception as exc:
        print(f"[SETUP EMAIL] Failed to send to {email}: {exc}")
        return False


@auth_bp.route("/resend-otp", methods=["POST"])
def resend_otp():
    """Resend a fresh OTP to an email that has an active or recently expired OTP entry.

    Accepts: { email, role }
    Guards against abuse by requiring the email to exist in otp_store
    (i.e. the user must have started registration/login recently).
    """
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    role = (data.get("role") or "").strip()

    if not email or not EMAIL_PATTERN.match(email):
        return jsonify({"error": "A valid email is required"}), 400

    if role not in ("user", "mechanic"):
        return jsonify({"error": "role must be 'user' or 'mechanic'"}), 400

    # Determine purpose from role
    purpose = "login" if role in ("user", "mechanic") else "registration"

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Confirm the email has a previous OTP entry (anti-spam guard)
                cur.execute(
                    "SELECT 1 FROM otp_store WHERE email = %s;",
                    (email,),
                )
                if not cur.fetchone():
                    # Also check if the user/mechanic actually exists
                    table = "users" if role == "user" else "mechanics"
                    cur.execute(
                        f"SELECT 1 FROM {table} WHERE email = %s;",
                        (email,),
                    )
                    if not cur.fetchone():
                        return jsonify({"error": "No account found for this email"}), 404

                otp_code = _generate_otp()
                expires_at = _store_otp(cur, email, otp_code, purpose)

        email_sent = _send_otp_email(email, otp_code)
        return jsonify({
            "message": "OTP resent",
            "expires_in_seconds": OTP_EXPIRY_SECONDS,
            "email_delivery": "ok" if email_sent else "failed",
        }), 200

    except Exception as exc:
        return db_error_response()


@auth_bp.route("/register/user", methods=["POST"])
def register_user():
    data = request.get_json(silent=True) or {}

    required = ["first_name", "email", "phone_number"]
    missing = _missing_fields(data, required)
    if missing:
        return jsonify({
            "error": f"Missing required field(s): {', '.join(missing)}",
        }), 400

    email = (data.get("email") or "").strip().lower()
    if not EMAIL_PATTERN.match(email):
        return jsonify({"error": "Invalid email address"}), 400

    if not check_rate_limit(f"register_{email}"):
        return jsonify({"error": "Too many requests. Please try again later."}), 429, {"Retry-After": "300"}

    country = "IN"

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

                cur.execute(
                    """
                    INSERT INTO users (
                        first_name, last_name, display_name, email,
                        phone_number, country, language,
                        status, password_deadline, email_verified
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'PENDING_PASSWORD', NOW() + INTERVAL '24 hours', FALSE)
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
    except Exception:
        return db_error_response()

    session_token = secrets.token_hex(32)
    _token_store[session_token] = {"role": "user", "id": str(user_id), "expires_at": time.time() + 30*24*3600}

    return jsonify({
        "message": "Registration successful",
        "session_token": session_token,
        "role": "user",
        "id": str(user_id)
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
        "workshop_name",
    ]
    missing = _missing_fields(data, required)
    if missing:
        return jsonify({
            "error": f"Missing required field(s): {', '.join(missing)}",
        }), 400

    email = (data.get("email") or "").strip().lower()
    if not EMAIL_PATTERN.match(email):
        return jsonify({"error": "Invalid email address"}), 400

    if not check_rate_limit(f"register_{email}"):
        return jsonify({"error": "Too many requests. Please try again later."}), 429, {"Retry-After": "300"}

    country = "IN"

    # lat/lng are optional — captured via browser geolocation, may be null
    coords = _validate_coordinates(data.get("lat"), data.get("lng"))
    lat = coords[0] if coords else None
    lng = coords[1] if coords else None

    phone_number = data.get("phone_number")
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    gender = data.get("gender")
    workshop_name = data.get("workshop_name")
    address = None
    zone = None
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

    if not check_rate_limit(f"verify_otp_{email}"):
        return jsonify({"error": "Too many verification attempts. Please try again later."}), 429, {"Retry-After": "300"}

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
                        SET last_login = NOW(), email_verified = TRUE
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
                        SET last_login = NOW(), email_verified = TRUE
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
    _token_store[session_token] = {"role": role, "id": str(entity_id), "expires_at": time.time() + 30*24*3600}

    return jsonify({
        "message": "OTP verified successfully",
        "session_token": session_token,
        "role": role,
        "id": str(entity_id),
    })


@auth_bp.route("/google", methods=["POST"])
def google_auth():
    """Real Google Auth endpoint."""
    data = request.get_json(silent=True) or {}
    credential = data.get("credential")
    role = data.get("role") or "user"
    
    if not credential:
        return jsonify({"error": "Missing Google credential"}), 400

    google_client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not google_client_id:
        return jsonify({"error": "Google Client ID is not configured on the server."}), 500

    try:
        idinfo = id_token.verify_oauth2_token(credential, google_requests.Request(), google_client_id)
        email = idinfo.get("email").strip().lower()
        first_name = idinfo.get("given_name", "Google User")
        last_name = idinfo.get("family_name", "")
    except ValueError:
        return jsonify({"error": "Invalid Google token"}), 401

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                if role == "user":
                    cur.execute("SELECT user_id FROM users WHERE email = %s;", (email,))
                    row = cur.fetchone()
                    if row:
                        entity_id = row[0]
                    else:
                        cur.execute(
                            """
                            INSERT INTO users (
                                first_name, last_name, display_name, email, phone_number, country, status, email_verified
                            ) VALUES (
                                %s, %s, %s, %s, %s, 'IN', 'ACTIVE', TRUE
                            ) RETURNING user_id;
                            """,
                            (first_name, last_name, f"{first_name} {last_name}".strip(), email, f"gauth_{secrets.token_hex(4)}")
                        )
                        entity_id = cur.fetchone()[0]
                else:
                    cur.execute("SELECT mechanic_id FROM mechanics WHERE email = %s;", (email,))
                    row = cur.fetchone()
                    if row:
                        entity_id = row[0]
                    else:
                        cur.execute(
                            """
                            INSERT INTO mechanics (
                                first_name, last_name, display_name, email, phone_number, workshop_name, country, email_verified, is_available
                            ) VALUES (
                                %s, %s, %s, %s, %s, %s, 'IN', TRUE, FALSE
                            ) RETURNING mechanic_id;
                            """,
                            (first_name, last_name, f"{first_name} {last_name}".strip(), email, f"gauth_{secrets.token_hex(4)}", f"{first_name}'s Workshop")
                        )
                        entity_id = cur.fetchone()[0]
    except Exception as e:
        print(f"Google Auth DB Error: {e}")
        return db_error_response()

    session_token = secrets.token_hex(32)
    _token_store[session_token] = {"role": role, "id": str(entity_id), "expires_at": time.time() + 30*24*3600}

    return jsonify({
        "message": "Google Login successful",
        "session_token": session_token,
        "role": role,
        "id": str(entity_id),
        "auth_method": "direct"
    })



@auth_bp.route("/login/user", methods=["POST"])
def login_user():
    """Send OTP to an existing user's email for login."""
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    if not email or not EMAIL_PATTERN.match(email):
        return jsonify({"error": "A valid email address is required"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT user_id, status, password_hash, password_deadline FROM users WHERE email = %s;",
                    (email,),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({
                        "error": "No account found for this email. Please register first.",
                    }), 404

                user_id, status, password_hash, password_deadline = row
                now = datetime.now(timezone.utc)
                if password_deadline and password_deadline.tzinfo is None:
                    password_deadline = password_deadline.replace(tzinfo=timezone.utc)

                if status == 'ACTIVE' and password_hash:
                    auth_method = 'password'
                elif status == 'PENDING_PASSWORD' and password_deadline and password_deadline > now:
                    auth_method = 'direct'
                elif not password_hash and (not password_deadline or password_deadline <= now):
                    auth_method = 'setup_required'
                else:
                    auth_method = 'setup_required'

                if auth_method == 'password':
                    return jsonify({"auth_method": "password"}), 200
                elif auth_method == 'setup_required':
                    return jsonify({"auth_method": "setup_required", "message": "Password setup required"}), 200

                # auth_method == 'direct'
                cur.execute("UPDATE users SET last_login = NOW() WHERE user_id = %s;", (user_id,))
    except Exception:
        return db_error_response()

    session_token = secrets.token_hex(32)
    _token_store[session_token] = {"role": "user", "id": str(user_id), "expires_at": time.time() + 30*24*3600}

    return jsonify({
        "auth_method": "direct",
        "message": "Logged in successfully",
        "session_token": session_token,
        "role": "user",
        "id": str(user_id),
    }), 200


@auth_bp.route("/login/mechanic", methods=["POST"])
def login_mechanic():
    """Send OTP to an existing mechanic's email for login."""
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    if not email or not EMAIL_PATTERN.match(email):
        return jsonify({"error": "A valid email address is required"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT mechanic_id FROM mechanics WHERE email = %s;",
                    (email,),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({
                        "error": "No account found for this email. Please register first.",
                    }), 404

                otp_code = _generate_otp()
                _store_otp(cur, email, otp_code, "login")
    except Exception:
        return db_error_response()

    email_sent = _send_otp_email(email, otp_code)

    return jsonify({
        "message": "OTP sent for login verification",
        "expires_in_seconds": OTP_EXPIRY_SECONDS,
        "email_delivery": "sent" if email_sent else "failed",
    }), 200


@auth_bp.route("/login/user/request-setup-link", methods=["POST"])
def request_setup_link():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    
    if not email:
        return jsonify({"error": "Email is required"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT user_id FROM users WHERE email = %s AND status = 'PASSWORD_REQUIRED';", (email,))
                row = cur.fetchone()
                if not row:
                    return jsonify({"message": "If an account exists and requires setup, an email has been sent."}), 200
                
                user_id = row[0]
                token = secrets.token_urlsafe(32)
                
                cur.execute("UPDATE password_setup_tokens SET used_at = now() WHERE user_id = %s AND used_at IS NULL;", (user_id,))
                
                cur.execute(
                    "INSERT INTO password_setup_tokens (token, user_id, expires_at) VALUES (%s, %s, now() + interval '1 hour');",
                    (token, user_id)
                )
    except Exception:
        return db_error_response()
    
    email_sent = _send_setup_link_email(email, token)
    if not email_sent:
        print(f"[EMAIL SIMULATION] Password setup link for {email}: /set-password?token={token}")
    
    return jsonify({"message": "Setup link generated and sent."}), 200


@auth_bp.route("/login/mechanic/request-setup-link", methods=["POST"])
def request_setup_link_mechanic():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    
    if not email:
        return jsonify({"error": "Email is required"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Assuming mechanics have similar status logic or just use email
                cur.execute("SELECT mechanic_id FROM mechanics WHERE email = %s;", (email,))
                row = cur.fetchone()
                if not row:
                    return jsonify({"message": "If an account exists, an email has been sent."}), 200
                
                mechanic_id = row[0]
                token = secrets.token_urlsafe(32)
                
                cur.execute("UPDATE password_setup_tokens SET used_at = now() WHERE mechanic_id = %s AND used_at IS NULL;", (mechanic_id,))
                
                cur.execute(
                    "INSERT INTO password_setup_tokens (token, mechanic_id, expires_at) VALUES (%s, %s, now() + interval '1 hour');",
                    (token, mechanic_id)
                )
    except Exception:
        return db_error_response()
    
    email_sent = _send_setup_link_email(email, token)
    if not email_sent:
        print(f"[EMAIL SIMULATION] Mechanic Password setup link for {email}: /set-password?token={token}")
    
    return jsonify({"message": "Setup link generated and sent."}), 200


@auth_bp.route("/set-password", methods=["POST"])
def set_password():
    data = request.get_json(silent=True) or {}
    token = data.get("token")
    password = data.get("password")
    
    if not token or not password:
        return jsonify({"error": "Token and password are required"}), 400

    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
        
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT user_id FROM password_setup_tokens 
                    WHERE token = %s AND used_at IS NULL AND expires_at > now();
                """, (token,))
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Invalid or expired setup link"}), 400
                    
                user_id = row[0]
                hashed = generate_password_hash(password)
                
                cur.execute("""
                    UPDATE users 
                    SET password_hash = %s, status = 'ACTIVE' 
                    WHERE user_id = %s;
                """, (hashed, user_id))
                
                cur.execute("UPDATE password_setup_tokens SET used_at = now() WHERE token = %s;", (token,))
    except Exception:
        return db_error_response()
        
    return jsonify({"message": "Password updated successfully"}), 200


@auth_bp.route("/login/user/password", methods=["POST"])
def login_user_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password")
    
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
        
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT user_id, password_hash, status FROM users WHERE email = %s;", (email,))
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Invalid credentials"}), 401
                    
                user_id, password_hash, status = row
                
                if status != 'ACTIVE' or not password_hash:
                    return jsonify({"error": "Password login not available for this account"}), 403
                    
                if not check_password_hash(password_hash, password):
                    return jsonify({"error": "Invalid credentials"}), 401
                    
                cur.execute("UPDATE users SET last_login = NOW() WHERE user_id = %s;", (user_id,))
    except Exception:
        return db_error_response()
        
    session_token = secrets.token_hex(32)
    _token_store[session_token] = {"role": "user", "id": str(user_id), "expires_at": time.time() + 30*24*3600}
    
    return jsonify({
        "message": "Logged in successfully",
        "session_token": session_token,
        "role": "user",
        "id": str(user_id),
    }), 200


@auth_bp.route("/logout", methods=["POST"])
@require_auth
def logout():
    """Invalidate the current session token."""
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if token and token in _token_store:
        del _token_store[token]
    return jsonify({"message": "Logged out successfully"}), 200


@auth_bp.route("/me", methods=["GET"])
@require_auth
def get_profile():
    """Return the authenticated user's or mechanic's profile."""
    role = g.auth["role"]
    entity_id = g.auth["id"]

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                if role == "user":
                    cur.execute(
                        """
                        SELECT user_id, first_name, last_name, display_name, email,
                               phone_number, country, status, email_verified,
                               password_deadline, date_created
                        FROM users WHERE user_id = %s;
                        """,
                        (entity_id,),
                    )
                else:
                    cur.execute(
                        """
                        SELECT mechanic_id, first_name, last_name, display_name, email,
                               phone_number, country, status, email_verified,
                               workshop_name, zone, is_available, rating, mri_score,
                               date_created
                        FROM mechanics WHERE mechanic_id = %s;
                        """,
                        (entity_id,),
                    )
                row = cur.fetchone()
    except Exception:
        return db_error_response()

    if not row:
        return jsonify({"error": "Account not found"}), 404

    if role == "user":
        profile = {
            "id": str(row[0]),
            "first_name": row[1],
            "last_name": row[2],
            "display_name": row[3],
            "email": row[4],
            "phone_number": row[5],
            "country": row[6],
            "status": row[7],
            "email_verified": row[8],
            "password_deadline": row[9].isoformat() if row[9] else None,
            "date_created": row[10].isoformat() if row[10] else None,
        }
    else:
        profile = {
            "id": str(row[0]),
            "first_name": row[1],
            "last_name": row[2],
            "display_name": row[3],
            "email": row[4],
            "phone_number": row[5],
            "country": row[6],
            "status": row[7],
            "email_verified": row[8],
            "workshop_name": row[9],
            "zone": row[10],
            "is_available": row[11],
            "rating": float(row[12]) if row[12] else None,
            "mri_score": float(row[13]) if row[13] else None,
            "date_created": row[14].isoformat() if row[14] else None,
        }

    return jsonify({"role": role, "profile": profile}), 200


