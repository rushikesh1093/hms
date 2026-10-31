"""Excel and CSV rendering for summary reports."""

import csv
from datetime import date
from io import BytesIO, StringIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.core.config import settings
from app.utils.dates import now

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _safe_cell(value):
    """Neutralise spreadsheet formula injection in free-text values."""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def _display(value):
    if value is None:
        return ""
    if isinstance(value, date):
        return value.strftime("%d-%m-%Y")
    return value


def render_report_excel(report, generated_by: str) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = report.report_type.value[:31]
    ncols = max(len(report.columns), 2)

    ws.append([settings.HOSPITAL_NAME])
    ws["A1"].font = Font(bold=True, size=14, color="0F4C81")
    ws.append([report.title])
    ws["A2"].font = Font(bold=True, size=12)
    ws.append([f"Period: {report.start_date:%d-%m-%Y} to {report.end_date:%d-%m-%Y}"])
    for k, v in report.filters.items():
        ws.append([f"{k}: {v}"])
    ws.append([f"Generated {now():%d-%m-%Y %H:%M} by {generated_by}"])
    ws.append([])

    if report.summary:
        ws.append([s.label for s in report.summary])
        for c in ws[ws.max_row]:
            c.font = Font(bold=True)
        ws.append([s.value for s in report.summary])
        ws.append([])

    header_row = ws.max_row + 1
    ws.append([c.label for c in report.columns])
    fill = PatternFill("solid", fgColor="0F4C81")
    for cell in ws[header_row]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)

    for row in report.rows:
        values = []
        for c in report.columns:
            v = row.get(c.key)
            values.append(_safe_cell(v) if not isinstance(v, date) else v)
        ws.append(values)
        for cell in ws[ws.max_row]:
            if isinstance(cell.value, date):
                cell.number_format = "DD-MM-YYYY"

    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    if report.rows:
        ws.auto_filter.ref = f"A{header_row}:{get_column_letter(ncols)}{ws.max_row}"
    for idx, col in enumerate(report.columns, start=1):
        longest = max([len(col.label)] + [len(str(_display(r.get(col.key)))) for r in report.rows[:500]])
        ws.column_dimensions[get_column_letter(idx)].width = min(max(10, longest + 2), 50)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def render_report_csv(report) -> bytes:
    out = StringIO()
    writer = csv.writer(out)
    writer.writerow([c.label for c in report.columns])
    for row in report.rows:
        writer.writerow([_safe_cell(_display(row.get(c.key))) for c in report.columns])
    # UTF-8 BOM so Excel opens non-ASCII names correctly.
    return ("\ufeff" + out.getvalue()).encode("utf-8")
