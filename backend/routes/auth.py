# curl examples:
# curl -X POST http://localhost:5000/auth/send-otp \
#   -H "Content-Type: application/json" \
#   -d '{"phone": "9876543210"}'
#
# curl -X POST http://localhost:5000/auth/verify-otp \
#   -H "Content-Type: application/json" \
#   -d '{"phone": "9876543210", "otp": "123456"}'

import random
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from db import get_db

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _db_error_response(exc):
    return jsonify({"error": "Database error", "message": str(exc)}), 500


@auth_bp.route("/send-otp", methods=["POST"])
def send_otp():
    data = request.get_json(silent=True) or {}
    phone = (data.get("phone") or "").strip()

    if not phone:
        return jsonify({"error": "phone is required"}), 400

    otp_code = f"{random.randint(0, 999999):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO otp_store (phone, otp_code, expires_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (phone)
                    DO UPDATE SET otp_code = EXCLUDED.otp_code,
                                  expires_at = EXCLUDED.expires_at;
                    """,
                    (phone, otp_code, expires_at),
                )
    except Exception as exc:
        return _db_error_response(exc)

    print(f"[OTP] phone={phone} otp={otp_code} expires_at={expires_at.isoformat()}")

    return jsonify({
        "message": "OTP sent successfully",
        "phone": phone,
        "expires_in_seconds": 300,
    })


@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    data = request.get_json(silent=True) or {}
    phone = (data.get("phone") or "").strip()
    otp = (data.get("otp") or "").strip()

    if not phone or not otp:
        return jsonify({"error": "phone and otp are required"}), 400

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT otp_code, expires_at
                    FROM otp_store
                    WHERE phone = %s;
                    """,
                    (phone,),
                )
                row = cur.fetchone()

                if not row:
                    return jsonify({"error": "OTP not found. Request a new OTP."}), 404

                stored_otp, expires_at = row
                now = datetime.now(timezone.utc)
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)

                if now > expires_at:
                    return jsonify({"error": "OTP has expired"}), 400

                if stored_otp != otp:
                    return jsonify({"error": "Invalid OTP"}), 401

                cur.execute(
                    """
                    INSERT INTO users (phone)
                    VALUES (%s)
                    ON CONFLICT (phone) DO NOTHING;
                    """,
                    (phone,),
                )
                cur.execute("DELETE FROM otp_store WHERE phone = %s;", (phone,))
    except Exception as exc:
        return _db_error_response(exc)

    session_token = secrets.token_hex(32)

    return jsonify({
        "message": "OTP verified successfully",
        "phone": phone,
        "session_token": session_token,
        "token_type": "Bearer",
    })
