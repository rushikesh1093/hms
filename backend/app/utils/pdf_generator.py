"""PDF rendering for summary reports and individual eye check-up reports (ReportLab)."""

from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.config import settings
from app.utils.dates import now
from app.utils.validators import calculate_age

PRIMARY = colors.HexColor("#0f4c81")
TEAL = colors.HexColor("#0d9488")
LIGHT = colors.HexColor("#eef4fa")
GRID = colors.HexColor("#c9d6e3")

_styles = getSampleStyleSheet()
H_TITLE = ParagraphStyle("HTitle", parent=_styles["Title"], fontSize=15, textColor=PRIMARY, spaceAfter=2, leading=18)
H_SUB = ParagraphStyle("HSub", parent=_styles["Normal"], fontSize=8.5, alignment=TA_CENTER, textColor=colors.HexColor("#475569"))
H2 = ParagraphStyle("H2", parent=_styles["Heading2"], fontSize=11, textColor=PRIMARY, spaceBefore=8, spaceAfter=4)
BODY = ParagraphStyle("Body", parent=_styles["Normal"], fontSize=8.5, leading=11)
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=7.5, leading=9.5)
CELL_B = ParagraphStyle("CellB", parent=CELL, fontName="Helvetica-Bold")
LABEL = ParagraphStyle("Label", parent=BODY, fontName="Helvetica-Bold", textColor=colors.HexColor("#334155"))
SMALL_R = ParagraphStyle("SmallR", parent=BODY, fontSize=7, alignment=TA_RIGHT, textColor=colors.grey)


def fmt(value) -> str:
    if value is None or value == "":
        return "-"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, datetime):
        return value.astimezone(settings.tz).strftime("%d-%m-%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d-%m-%Y")
    if isinstance(value, Decimal):
        return f"{value:+.2f}" if value != 0 else "0.00"
    return str(value)


def p(value, style=BODY) -> Paragraph:
    return Paragraph(escape(fmt(value)).replace("\n", "<br/>"), style)


def _header(story: list, title: str) -> None:
    story.append(Paragraph(escape(settings.HOSPITAL_NAME), H_TITLE))
    sub = " | ".join(x for x in [settings.HOSPITAL_ADDRESS, settings.HOSPITAL_PHONE] if x)
    if sub:
        story.append(Paragraph(escape(sub), H_SUB))
    story.append(Spacer(1, 3 * mm))
    bar = Table([[Paragraph(f"<b>{escape(title)}</b>", ParagraphStyle("bar", parent=BODY, textColor=colors.white, alignment=TA_CENTER, fontSize=10))]], colWidths=["100%"])
    bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PRIMARY), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(bar)
    story.append(Spacer(1, 3 * mm))


def _footer(canvas, doc, generated_by: str):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.grey)
    w, _ = doc.pagesize
    canvas.drawString(doc.leftMargin, 8 * mm, f"Generated {now().strftime('%d-%m-%Y %H:%M')} by {generated_by}. Confidential patient information.")
    canvas.drawRightString(w - doc.rightMargin, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _kv_table(pairs: list[tuple[str, object]], cols: int, width: float) -> Table:
    """Label/value grid with `cols` label-value pairs per row."""
    data, row = [], []
    for label, value in pairs:
        row += [Paragraph(escape(label), LABEL), p(value)]
        if len(row) == cols * 2:
            data.append(row)
            row = []
    if row:
        row += [""] * (cols * 2 - len(row))
        data.append(row)
    label_w = width * 0.14 if cols > 1 else width * 0.3
    value_w = (width - label_w * cols) / cols
    t = Table(data, colWidths=[label_w, value_w] * cols)
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.4, GRID),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                *[("BACKGROUND", (i * 2, 0), (i * 2, -1), LIGHT) for i in range(cols)],
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return t


def render_report_pdf(report, generated_by: str) -> bytes:
    """Render a ReportOut (title, columns, rows, summary) to a landscape A4 PDF."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=14 * mm,
        title=report.title,
        author=settings.HOSPITAL_NAME,
    )
    width = doc.width
    story: list = []
    _header(story, report.title)

    meta = [("Period", f"{fmt(report.start_date)} to {fmt(report.end_date)}"), ("Rows", report.total_rows)]
    meta += list(report.filters.items())
    story.append(_kv_table(meta, 3, width))
    story.append(Spacer(1, 3 * mm))

    if report.summary:
        cells = [[p(s.label, CELL_B) for s in report.summary], [p(s.value, CELL) for s in report.summary]]
        st = Table(cells, colWidths=[width / len(report.summary)] * len(report.summary))
        st.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, GRID), ("BACKGROUND", (0, 0), (-1, 0), LIGHT)]))
        story.append(st)
        story.append(Spacer(1, 3 * mm))

    header = [p(c.label, ParagraphStyle("th", parent=CELL_B, textColor=colors.white)) for c in report.columns]
    body = [[p(row.get(c.key), CELL) for c in report.columns] for row in report.rows]
    if not body:
        body = [[p("No records found for the selected filters.", CELL)] + [""] * (len(report.columns) - 1)]
    table = Table([header, *body], repeatRows=1, colWidths=[width / len(report.columns)] * len(report.columns))
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("GRID", (0, 0), (-1, -1), 0.3, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafc")]),
    ]
    if not report.rows:
        style.append(("SPAN", (0, 1), (-1, 1)))
    table.setStyle(TableStyle(style))
    story.append(table)
    if report.truncated:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph("Output truncated. Narrow the date range to include all rows.", SMALL_R))

    doc.build(story, onFirstPage=lambda c, d: _footer(c, d, generated_by), onLaterPages=lambda c, d: _footer(c, d, generated_by))
    return buf.getvalue()


def _eye_table(checkup, width: float) -> Table:
    def row(label, key):
        return [Paragraph(escape(label), LABEL), p(getattr(checkup, f"right_eye_{key}")), p(getattr(checkup, f"left_eye_{key}"))]

    axis_fmt = lambda v: f"{v}°" if v is not None else None  # noqa: E731
    iop_fmt = lambda v: f"{v} mmHg" if v is not None else None  # noqa: E731
    data = [
        [Paragraph("<b>Measurement</b>", BODY), Paragraph("<b>Right Eye (OD)</b>", BODY), Paragraph("<b>Left Eye (OS)</b>", BODY)],
        row("Unaided VA", "unaided_va"),
        row("Corrected VA", "corrected_va"),
        row("Sphere (D)", "sphere"),
        row("Cylinder (D)", "cylinder"),
        [Paragraph("Axis", LABEL), p(axis_fmt(checkup.right_eye_axis)), p(axis_fmt(checkup.left_eye_axis))],
        [Paragraph("IOP", LABEL), p(iop_fmt(checkup.right_eye_iop)), p(iop_fmt(checkup.left_eye_iop))],
        row("Clinical findings", "findings"),
    ]
    t = Table(data, colWidths=[width * 0.22, width * 0.39, width * 0.39])
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, GRID),
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
                ("BACKGROUND", (0, 1), (0, -1), LIGHT),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def render_checkup_pdf(checkup, generated_by: str) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=16 * mm,
        title=f"Eye Check-up Report {checkup.checkup_code}",
        author=settings.HOSPITAL_NAME,
    )
    width = doc.width
    patient = checkup.patient
    doctor = checkup.doctor
    story: list = []
    _header(story, "EYE EXAMINATION REPORT")

    story.append(
        _kv_table(
            [
                ("Check-up ID", checkup.checkup_code),
                ("Exam date", checkup.examination_date),
                ("Visit type", checkup.checkup_type.replace("_", " ").title()),
                ("Doctor", doctor.name),
            ],
            2,
            width,
        )
    )
    story.append(Paragraph("Patient Details", H2))
    story.append(
        _kv_table(
            [
                ("Patient ID", patient.patient_code),
                ("Name", patient.full_name),
                ("Age / Gender", f"{calculate_age(patient.date_of_birth, checkup.examination_date)} yrs / {patient.gender.title()}"),
                ("Mobile", patient.mobile_number),
                ("Address", f"{patient.address}, {patient.village}, {patient.district}, {patient.state}"),
                ("Allergies", patient.allergies),
            ],
            2,
            width,
        )
    )
    story.append(Paragraph("Presenting Complaints", H2))
    story.append(_kv_table([("Chief complaints", checkup.chief_complaints), ("Duration", checkup.symptom_duration)], 1, width))
    story.append(Paragraph("Eye Examination", H2))
    story.append(_eye_table(checkup, width))
    story.append(Paragraph("Clinical Assessment", H2))
    story.append(
        _kv_table(
            [
                ("Diagnosis", checkup.diagnosis),
                ("Observations", checkup.observations),
                ("Recommended treatment", checkup.recommended_treatment),
                ("Prescription", checkup.prescription),
                ("Doctor's advice / notes", checkup.doctor_notes),
                ("Referral", checkup.referral_recommendation),
            ],
            1,
            width,
        )
    )
    story.append(Paragraph("Follow-up", H2))
    story.append(
        _kv_table(
            [
                ("Follow-up required", checkup.followup_required),
                ("Follow-up date", checkup.followup_date),
                ("Instructions", checkup.followup_instructions),
            ],
            1,
            width,
        )
    )

    sig_lines = [doctor.name]
    if doctor.designation:
        sig_lines.append(doctor.designation)
    if doctor.registration_number:
        sig_lines.append(f"Reg. No. {doctor.registration_number}")
    signature = Table(
        [
            ["", Paragraph("<br/><br/><br/>______________________________", BODY)],
            ["", Paragraph("<b>Authorised Doctor's Signature</b><br/>" + "<br/>".join(escape(s) for s in sig_lines), BODY)],
        ],
        colWidths=[width * 0.55, width * 0.45],
    )
    story.append(Spacer(1, 6 * mm))
    story.append(KeepTogether([signature]))
    doc.build(story, onFirstPage=lambda c, d: _footer(c, d, generated_by), onLaterPages=lambda c, d: _footer(c, d, generated_by))
    return buf.getvalue()
