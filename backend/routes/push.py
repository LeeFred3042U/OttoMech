import json
import logging
from flask import Blueprint, request, jsonify, g
from pywebpush import webpush, WebPushException
from db import get_db
from routes.auth import require_auth

logger = logging.getLogger(__name__)

push_bp = Blueprint("push", __name__, url_prefix="/push")

VAPID_PUBLIC_KEY = "BKUeny78o-GGoTbGHWRES23LiEzUnhoH_5fcyWO_qqcl6RSjoIxKLOoQa8VFkbazNPJtfPvHzaNjpreu7N7ez-o"
VAPID_PRIVATE_KEY = "z32zYv7l1sBSYysufaIRwN_Ajgi2RPE1TIcB67koNxI"
VAPID_CLAIMS = {"sub": "mailto:admin@ottomech.local"}

@push_bp.route("/vapid-public-key", methods=["GET"])
def vapid_public_key():
    return jsonify({"public_key": VAPID_PUBLIC_KEY})


@push_bp.route("/subscribe", methods=["POST"])
@require_auth
def subscribe():
    subscription = request.get_json(silent=True)
    if not subscription:
        return jsonify({"error": "Invalid subscription object"}), 400

    entity_id = g.auth["id"]
    role = g.auth["role"]

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Remove existing for this entity to prevent duplicates
                cur.execute(
                    "DELETE FROM push_subscriptions WHERE entity_id = %s", 
                    (entity_id,)
                )
                cur.execute(
                    """
                    INSERT INTO push_subscriptions (entity_id, role, subscription_json)
                    VALUES (%s, %s, %s)
                    """,
                    (entity_id, role, json.dumps(subscription))
                )
        return jsonify({"message": "Subscription saved successfully"}), 201
    except Exception:
        logger.exception("Failed to save push subscription")
        return jsonify({"error": "Database error"}), 500


def send_push_notification(entity_id, payload):
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT subscription_json FROM push_subscriptions WHERE entity_id = %s",
                    (entity_id,)
                )
                row = cur.fetchone()
                
        if not row:
            return False
            
        subscription = row[0]
        if isinstance(subscription, str):
            subscription = json.loads(subscription)

        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
        return True
    except WebPushException as ex:
        logger.error("WebPushException: %s", repr(ex))
        if ex.response and ex.response.json():
            logger.error("WebPushException json: %s", ex.response.json())
        return False
    except Exception:
        logger.exception("Failed to send push notification")
        return False
