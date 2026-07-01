import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_socketio import SocketIO

from db import init_db
from routes.auth import auth_bp
from routes.job import job_bp
from routes.mechanic import mechanic_bp
from routes.socket_events import register_socket_events

load_dotenv()

# We will instantiate socketio inside create_app for test isolation.
# Or we can export a dummy global if needed by extensions, but it's better to attach it to app.
socketio = SocketIO(async_mode="threading", cors_allowed_origins="*")


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "ottomech_dev")

    app.register_blueprint(auth_bp)
    app.register_blueprint(mechanic_bp)
    app.register_blueprint(job_bp)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "ottomech"})

    @app.route("/socket-status", methods=["GET"])
    def socket_status():
        """Debug endpoint: returns count of jobs currently tracked in active_jobs.
        No auth required — for use on demo day only."""
        from routes.socket_events import active_jobs
        return jsonify({"connected_jobs": len(active_jobs)})

    # Wire SocketIO to this Flask app instance and register event handlers.
    # We must use the global socketio instance for tests that import app.socketio,
    # but re-init is safe if we don't re-register handlers.
    socketio.init_app(app)
    register_socket_events(socketio)

    # Store socketio on app.extensions so routes/job.py can retrieve it
    # inside a request context via current_app.extensions["socketio"].
    app.extensions["socketio"] = socketio

    return app


app = create_app()


if __name__ == "__main__":
    init_db()
    socketio.run(app, debug=True, host="0.0.0.0", port=5000, allow_unsafe_werkzeug=True)
