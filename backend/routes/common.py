from flask import jsonify


def db_error_response():
    return jsonify({"error": "Database connection failed"}), 500
