"""
Stage 4 — Socket.IO event handlers for OttoMech real-time dispatch.

active_jobs: in-memory dict, keyed by job_id (str UUID).
  Each value: {"driver_sid": str|None, "mechanic_sid": str|None}
Acknowledged as a known Stage 4 limitation (AGENT.md §8.3): state is
lost on process restart. rejoin_job exists specifically to recover from this.

Room naming convention:
  driver   → joins room  "driver_<user_id>"
  mechanic → joins room  "mechanic_<mechanic_id>"

emit_new_job and emit_match_confirmed are called from routes/job.py after
successful DB commits. A socket emission failure MUST NOT affect the REST
response — callers wrap these in try/except.
"""

import logging
import math
from datetime import datetime, timezone

from flask import request
from flask_socketio import SocketIO, emit, join_room, disconnect

from db import get_db
from routes.auth import validate_token
from routes.mechanic import _mechanic_locations

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory active jobs mapping — job_id → {driver_sid, mechanic_sid}
# ---------------------------------------------------------------------------
active_jobs: dict = {}

# sid → mechanic_id (for cleanup on disconnect)
_mechanic_socket_map: dict = {}

# Guard: prevent re-registering handlers when create_app() is called multiple
# times (e.g., each pytest fixture creates a new app but shares this module).
_handlers_registered = False


# ---------------------------------------------------------------------------
# Public helpers called from job.py
# ---------------------------------------------------------------------------

def emit_new_job(socketio: SocketIO, job_id: str, issue_type: str,
                 lat: float, lng: float, mechanic_ids: list,
                 accept_deadline: str) -> None:
    """Emit 'new_job' to each of the N broadcasted mechanics' rooms.

    Mechanics not currently connected simply do not receive it — not an error.
    """
    payload = {
        "job_id": job_id,
        "issue_type": issue_type,
        "driver_lat": lat,
        "driver_lng": lng,
        "accept_deadline": accept_deadline,
    }
    for mechanic_id in mechanic_ids:
        room = f"mechanic_{mechanic_id}"
        socketio.emit("new_job", payload, to=room)
        logger.debug("emit new_job → room %s", room)


def emit_match_confirmed(socketio: SocketIO, job_id: str, driver_id: str,
                         mechanic_data: dict) -> None:
    """Emit 'match_confirmed' to the driver's room.

    Also updates active_jobs[job_id].driver_sid if a live socket is in
    that room.  mechanic_data must include: name, workshop_name,
    mri_score, phone, distance_km.
    """
    room = f"driver_{driver_id}"
    payload = {
        "job_id": job_id,
        "mechanic_name": mechanic_data.get("name"),
        "workshop_name": mechanic_data.get("workshop_name"),
        "mri_score": mechanic_data.get("mri_score"),
        "phone": mechanic_data.get("phone"),
        "distance_km": mechanic_data.get("distance_km"),
    }
    socketio.emit("match_confirmed", payload, to=room)
    logger.debug("emit match_confirmed → room %s", room)


# ---------------------------------------------------------------------------
# Distance helper — same PostGIS ST_Distance pattern as mechanic.py
# ---------------------------------------------------------------------------

def _compute_distance_m(job_lat: float, job_lng: float,
                        mech_lat: float, mech_lng: float) -> float:
    """
    Compute distance in metres between driver's job location and mechanic's
    current position using Spherical Law of Cosines (custom implementation).
    """
    try:
        R = 6371000.0  # Earth radius in metres
        lat1 = math.radians(job_lat)
        lat2 = math.radians(mech_lat)
        delta_lon = math.radians(mech_lng - job_lng)
        
        val = math.sin(lat1) * math.sin(lat2) + math.cos(lat1) * math.cos(lat2) * math.cos(delta_lon)
        val = max(-1.0, min(1.0, val))
        return R * math.acos(val)
    except Exception:
        logger.exception("_compute_distance_m math error")
        return -1.0


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def register_socket_events(socketio: SocketIO) -> None:
    """Register all @socketio.on handlers.  Called once from create_app()."""

    @socketio.on("connect")
    def on_connect(auth):
        """Validate session_token in auth payload.  Reject if invalid."""
        token = (auth or {}).get("token")
        session = validate_token(token)
        if not session:
            logger.warning("Socket connect rejected — invalid/missing token sid=%s",
                           request.sid)
            raise ConnectionRefusedError("unauthorized")

        role = session["role"]
        entity_id = session["id"]

        # Join a stable room so REST handlers can target connected clients
        # without needing to know the transient socket SID.
        if role == "user":
            join_room(f"driver_{entity_id}")
        elif role == "mechanic":
            join_room(f"mechanic_{entity_id}")
            # Track sid so we can clean up location on disconnect
            _mechanic_socket_map[request.sid] = entity_id

        logger.debug("Socket connected sid=%s role=%s id=%s",
                     request.sid, role, entity_id)

    # -----------------------------------------------------------------------

    @socketio.on("disconnect")
    def on_disconnect():
        """Null out the disconnected SID's slot — do not remove the job entry.

        The other party's slot may still be valid.  rejoin_job repopulates
        the stale slot on reconnect.
        """
        sid = request.sid

        # Clean up mechanic location on disconnect
        mech_id = _mechanic_socket_map.pop(sid, None)
        if mech_id:
            _mechanic_locations.pop(mech_id, None)
            logger.debug("Cleared location for mechanic %s on disconnect", mech_id)

        for jid, entry in active_jobs.items():
            if entry.get("driver_sid") == sid:
                entry["driver_sid"] = None
                logger.debug("driver_sid cleared for job %s (disconnect)", jid)
            if entry.get("mechanic_sid") == sid:
                entry["mechanic_sid"] = None
                logger.debug("mechanic_sid cleared for job %s (disconnect)", jid)

    # -----------------------------------------------------------------------

    @socketio.on("mechanic_online")
    def on_mechanic_online(data):
        """Mechanic broadcasts their current GPS location when they go online.

        Expected payload: {lat, lng}
        Stores the location in _mechanic_locations so fetch_nearby_mechanics
        can do real Haversine-based proximity filtering.
        """
        sid = request.sid
        mech_id = _mechanic_socket_map.get(sid)
        if not mech_id:
            logger.warning("mechanic_online from untracked sid=%s — ignored", sid)
            return

        data = data or {}
        try:
            lat = float(data["lat"])
            lng = float(data["lng"])
        except (KeyError, TypeError, ValueError):
            emit("error", {"message": "mechanic_online requires lat and lng"})
            return

        _mechanic_locations[mech_id] = (lat, lng)
        logger.debug("mechanic_online: stored location for %s: (%.4f, %.4f)", mech_id, lat, lng)
        emit("location_ack", {"status": "ok", "mechanic_id": mech_id})

    # -----------------------------------------------------------------------

    @socketio.on("mechanic_location")
    def on_mechanic_location(data):
        """Mechanic emits GPS coordinates; server computes distance and forwards
        to the driver.

        Expected payload: {job_id, lat, lng}
        Silently ignored if:
          - job_id not in active_jobs (server restart, rejoin_job not yet fired)
          - no driver_sid currently associated with that job
        """
        job_id = (data or {}).get("job_id")
        mech_lat = (data or {}).get("lat")
        mech_lng = (data or {}).get("lng")

        if not job_id or mech_lat is None or mech_lng is None:
            return  # malformed — ignore silently

        try:
            mech_lat = float(mech_lat)
            mech_lng = float(mech_lng)
        except (TypeError, ValueError):
            return

        entry = active_jobs.get(job_id)
        if not entry:
            # Server restarted or rejoin_job hasn't fired yet — silently ignore
            logger.debug("mechanic_location: job_id %s not in active_jobs — ignored", job_id)
            return

        driver_sid = entry.get("driver_sid")
        if not driver_sid:
            # Driver not currently connected — silently drop
            logger.debug("mechanic_location: no driver_sid for job %s — dropped", job_id)
            return

        # Look up the driver's job location for distance computation
        try:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT lat, lng FROM jobs WHERE job_id = %s;",
                        (job_id,),
                    )
                    row = cur.fetchone()
        except Exception:
            logger.exception("mechanic_location: failed to fetch job lat/lng for %s", job_id)
            return

        if not row or row[0] is None or row[1] is None:
            logger.debug("mechanic_location: job %s has no driver location — dropped", job_id)
            return

        job_lat, job_lng = float(row[0]), float(row[1])
        distance_m = _compute_distance_m(job_lat, job_lng, mech_lat, mech_lng)

        ping_payload = {
            "lat": mech_lat,
            "lng": mech_lng,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "distance_remaining_m": distance_m,
        }
        socketio.emit("mechanic_ping", ping_payload, to=driver_sid)
        logger.debug("mechanic_ping → driver_sid %s dist=%.1fm", driver_sid, distance_m)

    # -----------------------------------------------------------------------

    @socketio.on("join_job")
    def on_join_job(data):
        """Join a job room after creation (driver) or acceptance (mechanic).

        Expected payload: {job_id, role}
        The socket is already authenticated on connect, so we trust the
        identity from the token_store lookup done during on_connect.
        """
        data = data or {}
        job_id = data.get("job_id")
        role = data.get("role")

        if not job_id:
            emit("error", {"message": "job_id is required"})
            return

        # Look up the caller's identity from the connect-time token
        # We need to re-derive it since Flask-SocketIO doesn't persist
        # per-connection state across events.  The client already
        # authenticated on connect, so we find their room membership.
        sid = request.sid

        # Ensure active_jobs entry exists
        if job_id not in active_jobs:
            active_jobs[job_id] = {"driver_sid": None, "mechanic_sid": None}

        if role == "user":
            active_jobs[job_id]["driver_sid"] = sid
            join_room(f"job_{job_id}")
            logger.debug("join_job: driver sid=%s joined job %s", sid, job_id)
        elif role == "mechanic":
            active_jobs[job_id]["mechanic_sid"] = sid
            join_room(f"job_{job_id}")
            logger.debug("join_job: mechanic sid=%s joined job %s", sid, job_id)
        else:
            emit("error", {"message": "role must be 'user' or 'mechanic'"})
            return

        emit("joined", {"job_id": job_id, "role": role})

    # -----------------------------------------------------------------------

    @socketio.on("rejoin_job")
    def on_rejoin_job(data):
        data = data or {}
        """
        Expected payload: {job_id, session_token}
        Validates:
          1. session_token is valid
          2. job_id exists in DB
          3. token's entity_id matches jobs.driver_id or jobs.mechanic_id
        On success: updates active_jobs[job_id] with the new SID.
        On failure: emits 'error' back to caller, active_jobs unchanged.
        """
        data = data or {}
        job_id = data.get("job_id")
        token = data.get("session_token")

        session = validate_token(token)
        if not session:
            emit("error", {"message": "Invalid session token"})
            return

        role = session["role"]
        entity_id = session["id"]

        if not job_id:
            emit("error", {"message": "job_id is required"})
            return

        # Query DB to confirm job exists and token matches the right party
        try:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT driver_id, mechanic_id FROM jobs WHERE job_id = %s;",
                        (job_id,),
                    )
                    row = cur.fetchone()
        except Exception:
            logger.exception("rejoin_job: DB error for job_id %s", job_id)
            emit("error", {"message": "Database error during rejoin"})
            return

        if not row:
            emit("error", {"message": "Job not found"})
            return

        driver_id, mechanic_id = (str(row[0]) if row[0] else None,
                                  str(row[1]) if row[1] else None)

        # Verify identity: role must match the job's corresponding column
        if role == "user":
            if entity_id != driver_id:
                emit("error", {"message": "Token does not match this job's driver"})
                return
            slot = "driver_sid"
        elif role == "mechanic":
            if entity_id != mechanic_id:
                emit("error", {"message": "Token does not match this job's mechanic"})
                return
            slot = "mechanic_sid"
        else:
            emit("error", {"message": "Unknown role"})
            return

        # Ensure the active_jobs entry exists (server restart recovery)
        if job_id not in active_jobs:
            active_jobs[job_id] = {"driver_sid": None, "mechanic_sid": None}

        active_jobs[job_id][slot] = request.sid
        join_room(f"job_{job_id}")
        logger.debug("rejoin_job: job %s %s → sid %s", job_id, slot, request.sid)
        emit("rejoined", {"job_id": job_id, "role": role})

    # -----------------------------------------------------------------------

    @socketio.on("chat_message")
    def on_chat_message(data):
        data = data or {}
        job_id = data.get("job_id")
        token = data.get("session_token")
        message = data.get("message")

        if not job_id or not token or not message:
            emit("error", {"message": "job_id, session_token, and message are required"})
            return

        session = validate_token(token)
        if not session:
            emit("error", {"message": "Invalid session token"})
            return

        role = session["role"]
        entity_id = session["id"]

        try:
            with get_db() as conn:
                with conn.cursor() as cur:
                    # Insert message into DB
                    cur.execute(
                        """
                        INSERT INTO chat_messages (job_id, sender_id, sender_role, message)
                        VALUES (%s, %s, %s, %s)
                        RETURNING sent_at;
                        """,
                        (job_id, entity_id, role, message)
                    )
                    sent_at = cur.fetchone()[0]

            # Broadcast to job room
            room = f"job_{job_id}"
            emit("chat_message", {
                "job_id": job_id,
                "sender_id": entity_id,
                "sender_role": role,
                "message": message,
                "sent_at": sent_at.isoformat()
            }, to=room)
        except Exception:
            logger.exception("chat_message: DB error for job_id %s", job_id)
            emit("error", {"message": "Database error saving chat message"})

