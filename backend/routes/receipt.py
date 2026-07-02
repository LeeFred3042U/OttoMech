"""
Stage 7 — Receipt retrieval endpoint.

GET /receipts/<job_id>
  - Requires auth
  - Returns {job_id, pdf_base64, created_at} or 404
  - If pdf_base64 is null (generation failed earlier), attempts regeneration
"""

import logging

from flask import Blueprint, g, jsonify

from db import get_db
from routes.auth import require_auth
from routes.common import db_error_response
from routes.mri import generate_receipt_pdf

logger = logging.getLogger(__name__)

receipt_bp = Blueprint("receipt", __name__, url_prefix="/receipts")


@receipt_bp.route("/<job_id>", methods=["GET"])
@require_auth
def get_receipt(job_id):
    """Return the receipt for a completed job.

    If pdf_base64 is null, attempt regeneration from job data.
    """
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Fetch existing receipt
                cur.execute(
                    """
                    SELECT r.job_id, r.pdf_base64, r.created_at
                    FROM receipts r
                    WHERE r.job_id = %s;
                    """,
                    (job_id,),
                )
                row = cur.fetchone()

                if not row:
                    # Check if job exists at all
                    cur.execute(
                        "SELECT job_id FROM jobs WHERE job_id = %s;",
                        (job_id,),
                    )
                    if not cur.fetchone():
                        return jsonify({"error": "Job not found"}), 404

                    return jsonify({"error": "Receipt not yet generated"}), 404

                receipt_job_id, pdf_base64, created_at = row

                # If pdf_base64 is null, attempt regeneration
                if not pdf_base64:
                    pdf_base64 = _regenerate_receipt(cur, job_id)
                    if pdf_base64:
                        cur.execute(
                            """
                            UPDATE receipts
                            SET pdf_base64 = %s
                            WHERE job_id = %s;
                            """,
                            (pdf_base64, job_id),
                        )

    except Exception:
        return db_error_response()

    return jsonify({
        "job_id": str(receipt_job_id),
        "pdf_base64": pdf_base64,
        "created_at": created_at.isoformat() if created_at else None,
    }), 200


def _regenerate_receipt(cur, job_id):
    """Attempt to regenerate a receipt PDF from job + mechanic data."""
    try:
        cur.execute(
            """
            SELECT j.job_id, j.issue_type, j.lat, j.lng, j.created_at,
                   j.cash_amount, j.mechanic_id,
                   m.first_name, m.last_name, m.workshop_name,
                   m.zone, m.mri_score
            FROM jobs j
            LEFT JOIN mechanics m ON m.mechanic_id = j.mechanic_id
            WHERE j.job_id = %s;
            """,
            (job_id,),
        )
        row = cur.fetchone()
        if not row:
            return None

        job_data = {
            "job_id": str(row[0]),
            "issue_type": row[1],
            "lat": float(row[2]) if row[2] else None,
            "lng": float(row[3]) if row[3] else None,
            "created_at": row[4].isoformat() if row[4] else None,
            "cash_amount": float(row[5]) if row[5] else 0,
        }
        mechanic_data = {
            "name": f"{row[7]} {row[8]}".strip() if row[7] else "—",
            "workshop_name": row[9] or "—",
            "zone": row[10] or "—",
            "mri_score": float(row[11]) if row[11] else 50.0,
        }

        return generate_receipt_pdf(job_data, mechanic_data)

    except Exception:
        logger.exception("Receipt regeneration failed for job %s", job_id)
        return None
