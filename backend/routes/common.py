from flask import jsonify
import traceback

def db_error_response():
    traceback.print_exc()
    return jsonify({"error": "Database connection failed"}), 500
