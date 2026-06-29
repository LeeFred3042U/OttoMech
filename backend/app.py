import os

from dotenv import load_dotenv
from flask import Flask, jsonify

from db import init_db
from routes.auth import auth_bp
from routes.job import job_bp
from routes.mechanic import mechanic_bp

load_dotenv()


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "ottomech_dev")

    app.register_blueprint(auth_bp)
    app.register_blueprint(mechanic_bp)
    app.register_blueprint(job_bp)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "ottomech"})

    return app


app = create_app()


if __name__ == "__main__":
    init_db()
    app.run(debug=True, host="0.0.0.0", port=5000)
