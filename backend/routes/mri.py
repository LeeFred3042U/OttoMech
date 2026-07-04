"""
MRI scoring engine and PDF receipt generation for OttoMech.

compute_mri_score: single SQL aggregation query against mri_events.
generate_receipt_pdf: ReportLab SimpleDocTemplate, text-only PDF.

Neither function raises exceptions to callers — all errors are logged.
"""

import base64
import io
import logging
from datetime import datetime, timezone
from flask import current_app

logger = logging.getLogger(__name__)


def compute_mri_score(cur, mechanic_id):
    """Compute MRI score from mri_events using a single SQL query.

    Formula:
      MRI = (
        0.30 * on_time_rate
        + 0.25 * completion_rate
        + 0.25 * (avg_rating / 5.0)
        + 0.15 * response_speed_score
        + 0.05 * warranty_reliability
      ) * 100

    Returns float (0-100). Defaults to 50.0 if no events exist.
    """
    try:
        cur.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN event_type = 'ON_TIME' THEN 1 END), 0) AS on_time_count,
                COALESCE(SUM(CASE WHEN event_type = 'LATE' THEN 1 END), 0) AS late_count,
                COALESCE(SUM(CASE WHEN event_type = 'COMPLETED' THEN 1 END), 0) AS completed_count,
                COALESCE(SUM(CASE WHEN event_type = 'ABANDONED' THEN 1 END), 0) AS abandoned_count,
                AVG(CASE WHEN event_type = 'RATED' THEN value END) AS avg_rating,
                AVG(CASE WHEN event_type = 'RESPONSE_TIME' THEN value END) AS avg_response_seconds,
                COALESCE(SUM(CASE WHEN event_type = 'WARRANTY_CLAIM' THEN 1 END), 0) AS warranty_claim_count
            FROM mri_events
            WHERE mechanic_id = %s;
            """,
            (mechanic_id,),
        )
        row = cur.fetchone()

        if not row:
            return 50.0

        on_time = row[0] or 0
        late = row[1] or 0
        completed = row[2] or 0
        abandoned = row[3] or 0
        avg_rating = float(row[4]) if row[4] is not None else None
        avg_response_sec = float(row[5]) if row[5] is not None else None
        warranty_claims = row[6] or 0

        # on_time_rate
        if (on_time + late) > 0:
            on_time_rate = on_time / (on_time + late)
        else:
            on_time_rate = 1.0  # no events = benefit of the doubt

        # completion_rate
        if (completed + abandoned) > 0:
            completion_rate = completed / (completed + abandoned)
        else:
            completion_rate = 1.0

        # avg_rating / 5.0 (default 0.5 if no ratings)
        if avg_rating is not None:
            rating_score = avg_rating / 5.0
        else:
            rating_score = 0.5

        # response_speed_score = max(0, 1 - (avg_accept_seconds / 300))
        if avg_response_sec is not None:
            response_speed_score = max(0.0, 1.0 - (avg_response_sec / 300.0))
        else:
            response_speed_score = 1.0

        # warranty_reliability = 1 - (warranty_claims / completed)
        if completed > 0:
            warranty_reliability = 1.0 - (warranty_claims / completed)
        else:
            warranty_reliability = 1.0

        mri = (
            0.30 * on_time_rate
            + 0.25 * completion_rate
            + 0.25 * rating_score
            + 0.15 * response_speed_score
            + 0.05 * warranty_reliability
        ) * 100

        return round(mri, 2)

    except Exception:
        logger.exception("MRI computation failed for mechanic %s", mechanic_id)
        return 50.0


def generate_receipt_pdf(job_data, mechanic_data):
    """Generate a PDF receipt and return base64-encoded string.

    job_data: dict with job_id, issue_type, lat, lng, created_at, cash_amount
    mechanic_data: dict with name, workshop_name, zone, mri_score

    Returns: base64 string or None on failure.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        )
        from reportlab.lib import colors
        from svglib.svglib import svg2rlg
        import os

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4,
                                topMargin=20*mm, bottomMargin=20*mm,
                                leftMargin=20*mm, rightMargin=20*mm)

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            'ReceiptTitle',
            parent=styles['Heading1'],
            fontSize=18,
            alignment=TA_CENTER,
            spaceAfter=6,
        )

        subtitle_style = ParagraphStyle(
            'ReceiptSubtitle',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            textColor=colors.grey,
            spaceAfter=16,
        )

        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=12,
            spaceBefore=12,
            spaceAfter=6,
        )

        normal_style = styles['Normal']

        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            alignment=TA_CENTER,
            textColor=colors.grey,
            spaceBefore=20,
        )

        elements = []

        # Header: Logo
        svg_path = os.path.join(current_app.root_path, '..', 'frontend', 'static', 'img', 'oLogo.svg')
        try:
            logo = svg2rlg(svg_path)
            # Scale down the logo since it might be big (120x44)
            if logo:
                logo.hAlign = 'CENTER'
                logo.scale(0.5, 0.5)
                elements.append(logo)
                elements.append(Spacer(1, 10))
        except Exception as e:
            # Fallback if svg fails
            elements.append(Paragraph("OttoMech", title_style))
            
        elements.append(Paragraph("Job Receipt", subtitle_style))

        # Job details table
        elements.append(Paragraph("Job Details", section_style))
        job_table_data = [
            ["Job ID", str(job_data.get("job_id", "—"))],
            ["Issue Type", str(job_data.get("issue_type", "—")).replace("_", " ").title()],
            ["Date", str(job_data.get("created_at", "—"))[:10]],
            ["Time", str(job_data.get("created_at", "—"))[11:19]],
            ["Driver Location", f"({job_data.get('lat', '—')}, {job_data.get('lng', '—')})"],
            ["Status", "Completed"],
        ]

        job_table = Table(job_table_data, colWidths=[120, 340])
        job_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('LINEBELOW', (0, -1), (-1, -1), 1, colors.lightgrey),
        ]))
        elements.append(job_table)
        elements.append(Spacer(1, 8))

        # Mechanic section
        elements.append(Paragraph("Mechanic", section_style))
        mech_table_data = [
            ["Name", str(mechanic_data.get("name", "—"))],
            ["Workshop", str(mechanic_data.get("workshop_name", "—"))],
            ["Zone", str(mechanic_data.get("zone", "—"))],
            ["MRI Score", str(mechanic_data.get("mri_score", "—"))],
        ]
        mech_table = Table(mech_table_data, colWidths=[120, 340])
        mech_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('LINEBELOW', (0, -1), (-1, -1), 1, colors.lightgrey),
        ]))
        elements.append(mech_table)
        elements.append(Spacer(1, 8))

        # Financial section
        elements.append(Paragraph("Payment", section_style))
        cash_str = f"\u20b9{job_data.get('cash_amount', 0)}"
        fin_table_data = [
            ["Cash Amount", cash_str],
            ["Platform Note", "Payment made directly to mechanic"],
        ]
        fin_table = Table(fin_table_data, colWidths=[120, 340])
        fin_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(fin_table)

        # Footer
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        elements.append(Paragraph(
            "OttoMech \u2014 Your mechanic. One tap away.",
            footer_style,
        ))
        elements.append(Paragraph(
            f"Generated: {now}",
            footer_style,
        ))

        doc.build(elements)
        pdf_bytes = buffer.getvalue()
        buffer.close()

        return base64.b64encode(pdf_bytes).decode('utf-8')

    except Exception:
        logger.exception("PDF generation failed for job %s", job_data.get("job_id"))
        return None
