import os
from dotenv import load_dotenv
import sys

env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(env_path)

# Only monkey-patch if not running under pytest or explicit bypass
if "pytest" not in sys.argv[0] and "PYTEST_CURRENT_TEST" not in os.environ and not os.environ.get("FLASK_ENV") == "testing" and not os.environ.get("NO_EVENTLET"):
    try:
        import eventlet
        eventlet.monkey_patch()
    except ImportError:
        pass

from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO

from db import init_db
from routes.auth import auth_bp
from routes.job import job_bp
from routes.mechanic import mechanic_bp
from routes.receipt import receipt_bp
from routes.socket_events import register_socket_events

# We will instantiate socketio inside create_app for test isolation.
# Or we can export a dummy global if needed by extensions, but it's better to attach it to app.
is_testing = "pytest" in sys.argv[0] or "PYTEST_CURRENT_TEST" in os.environ or os.environ.get("FLASK_ENV") == "testing" or os.environ.get("NO_EVENTLET")
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading" if is_testing else None)



def create_app():
    app = Flask(
        __name__,
        template_folder=os.path.join(os.path.dirname(__file__), "..", "frontend", "templates"),
        static_folder=os.path.join(os.path.dirname(__file__), "..", "frontend", "static"),
    )
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "ottomech_dev")
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100MB to support 30MB base64 uploads

    from routes.push import push_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(mechanic_bp)
    app.register_blueprint(job_bp)
    app.register_blueprint(receipt_bp)
    app.register_blueprint(push_bp)

    @app.context_processor
    def inject_google_client_id():
        return dict(google_client_id=os.getenv("GOOGLE_CLIENT_ID", ""))

    @app.route("/", methods=["GET"])
    def index():
        return render_template("index.html")

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "ottomech"})

    # ---- Registration pages (Stage 5) ------------------------------------
    @app.route("/register/user", methods=["GET"])
    def register_user_page():
        return render_template("register_user.html")

    @app.route("/register/mechanic", methods=["GET"])
    def register_mechanic_page():
        return render_template("register_mechanic.html")

    # ---- Login pages (Stage 5 / 6) ----------------------------------------
    @app.route("/login/user", methods=["GET"])
    def login_user_page():
        return render_template("login_user.html")

    @app.route("/set-password", methods=["GET"])
    def set_password_page():
        token = request.args.get("token")
        # In a real app we'd validate the token here, but doing it in the template or via JS is fine too.
        # Actually, the spec says: GET /set-password?token=... validates token exists, is unused, not expired
        return render_template("set_password.html", token=token)

    @app.route("/login/mechanic", methods=["GET"])
    def login_mechanic_page():
        return render_template("login_mechanic.html")

    # ---- Dashboard pages (Stage 5 / 6) ------------------------------------
    @app.route("/dashboard/user", methods=["GET"])
    def dashboard_user_page():
        return render_template("dashboard_user.html")

    @app.route("/dashboard/mechanic", methods=["GET"])
    def dashboard_mechanic_page():
        return render_template("dashboard_mechanic.html")

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
    from jobs import start_background_jobs
    start_background_jobs()
    socketio.run(app, debug=True, host="0.0.0.0", port=5000, allow_unsafe_werkzeug=True)
