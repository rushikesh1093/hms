from datetime import date, timedelta
from io import BytesIO

from openpyxl import load_workbook

from app.models import AuditLog
from app.tests.conftest import checkup_payload, patient_payload


def _register(client, auth, name, mobile, gender="male", dob="1985-01-01", reg=None):
    body = patient_payload(full_name=name, mobile_number=mobile, gender=gender, date_of_birth=dob)
    if reg:
        body["registration_date"] = reg
    r = client.post("/api/patients", json=body, headers=auth["reception"])
    assert r.status_code == 201, r.text
    return r.json()


def _setup(client, auth):
    """3 patients (2 today, 1 ten days ago), 4 check-ups, 2 follow-ups."""
    ten_days = (date.today() - timedelta(days=10)).isoformat()
    a = _register(client, auth, "Asha Patil", "9000000011", "female", "1950-03-03")
    b = _register(client, auth, "Bhim Rao", "9000000012", "male", "2018-06-06")
    c = _register(client, auth, "Chetan More", "9000000013", "male", "1990-01-01", reg=ten_days)
    fu = (date.today() + timedelta(days=7)).isoformat()
    client.post("/api/checkups", json=checkup_payload(a["id"], diagnosis="Cataract", followup_required=True, followup_date=fu), headers=auth["doctor"])
    client.post("/api/checkups", json=checkup_payload(b["id"], diagnosis="Myopia"), headers=auth["doctor"])
    client.post("/api/checkups", json=checkup_payload(c["id"], diagnosis="cataract ", examination_date=ten_days), headers=auth["doctor2"])
    client.post("/api/checkups", json=checkup_payload(c["id"], diagnosis="Cataract", checkup_type="follow_up", followup_required=True, followup_date=fu), headers=auth["doctor2"])
    return a, b, c


def test_dashboard_kpis_from_database(client, auth):
    _setup(client, auth)
    r = client.get("/api/reports/dashboard", headers=auth["reception"])
    assert r.status_code == 200
    d = r.json()
    k = d["kpis"]
    assert k["total_patients"] == 3
    assert k["total_checkups"] == 4
    assert k["today_registrations"] == 2
    assert k["today_checkups"] == 3
    assert k["followups_pending"] == 2
    assert k["followups_overdue"] == 0
    month_start = date.today().replace(day=1)
    expected_month = 2 + (1 if date.today() - timedelta(days=10) >= month_start else 0)
    assert k["month_registrations"] == expected_month


def test_dashboard_charts(client, auth):
    _setup(client, auth)
    d = client.get("/api/reports/dashboard", headers=auth["admin"]).json()
    assert len(d["daily_registrations"]) == 30
    assert d["daily_registrations"][-1] == {"label": date.today().isoformat(), "value": 2}
    assert sum(p["value"] for p in d["daily_checkups"]) == 4
    assert len(d["monthly_registrations"]) == 12
    assert sum(p["value"] for p in d["monthly_registrations"]) == 3
    ages = {p["label"]: p["value"] for p in d["age_groups"]}
    # Born 1950 -> 61+, 2018 -> 6-17, 1990 -> 18-40
    assert ages == {"0-5": 0, "6-17": 1, "18-40": 1, "41-60": 0, "61+": 1}
    genders = {p["label"]: p["value"] for p in d["gender_distribution"]}
    assert genders == {"Female": 1, "Male": 2}
    # Diagnosis text is normalised (trim + case) before grouping.
    assert d["common_conditions"][0] == {"label": "Cataract", "value": 3}
    docs = {x["doctor_name"]: x["count"] for x in d["doctor_checkups"]}
    assert docs == {"Dr. Test Doctor": 2, "Dr. Second Doctor": 2}


def test_dashboard_excludes_deactivated_patients(client, auth):
    a, _, _ = _setup(client, auth)
    client.delete(f"/api/patients/{a['id']}", headers=auth["admin"])
    k = client.get("/api/reports/dashboard", headers=auth["admin"]).json()["kpis"]
    assert k["total_patients"] == 2 and k["total_checkups"] == 3


def test_invalid_date_range(client, auth):
    r = client.get("/api/reports/dashboard", params={"start_date": "2026-02-01", "end_date": "2026-01-01"}, headers=auth["admin"])
    assert r.status_code == 422


def test_daily_report(client, auth):
    _setup(client, auth)
    r = client.get("/api/reports/generate", params={"report_type": "daily"}, headers=auth["admin"])
    rep = r.json()
    assert rep["total_rows"] == 3
    summary = {s["label"]: s["value"] for s in rep["summary"]}
    assert summary["New registrations"] == 2 and summary["Check-ups"] == 3


def test_weekly_report_period_rows(client, auth):
    _setup(client, auth)
    start = (date.today() - timedelta(days=14)).isoformat()
    rep = client.get("/api/reports/generate", params={"report_type": "weekly", "start_date": start}, headers=auth["admin"]).json()
    assert len(rep["rows"]) == 15
    today_row = rep["rows"][-1]
    assert today_row["registrations"] == 2 and today_row["checkups"] == 3
    # Chetan's visit today is a repeat visit; Asha's and Bhim's are first visits.
    assert today_row["new_patients_examined"] == 2 and today_row["repeat_patients_examined"] == 1


def test_doctor_filter_and_doctor_wise_report(client, auth, users):
    _setup(client, auth)
    start = (date.today() - timedelta(days=30)).isoformat()
    rep = client.get(
        "/api/reports/checkups", params={"start_date": start, "doctor_id": users["doctor2"].id}, headers=auth["doctor"]
    ).json()
    assert rep["total_rows"] == 2
    assert rep["filters"]["Doctor"] == "Dr. Second Doctor"
    rep = client.get("/api/reports/generate", params={"report_type": "doctor_wise", "start_date": start}, headers=auth["admin"]).json()
    rows = {r["doctor"]: r for r in rep["rows"]}
    assert rows["Dr. Second Doctor"]["unique_patients"] == 1
    assert rows["Dr. Second Doctor"]["followup_visits"] == 1


def test_gender_and_patient_filters(client, auth):
    a, _, _ = _setup(client, auth)
    start = (date.today() - timedelta(days=30)).isoformat()
    rep = client.get("/api/reports/patients", params={"start_date": start, "gender": "female"}, headers=auth["admin"]).json()
    assert [r["full_name"] for r in rep["rows"]] == ["Asha Patil"]
    rep = client.get("/api/reports/checkups", params={"start_date": start, "patient_code": a["patient_code"].lower()}, headers=auth["admin"]).json()
    assert rep["total_rows"] == 1


def test_followup_pending_and_repeat_reports(client, auth):
    _, _, c = _setup(client, auth)
    rep = client.get("/api/reports/followups", headers=auth["admin"]).json()
    assert rep["total_rows"] == 2
    assert all(r["status"] == "Upcoming" for r in rep["rows"])
    start = (date.today() - timedelta(days=30)).isoformat()
    rep = client.get("/api/reports/generate", params={"report_type": "repeat_patients", "start_date": start}, headers=auth["admin"]).json()
    assert [r["patient_code"] for r in rep["rows"]] == [c["patient_code"]]
    assert rep["rows"][0]["visits"] == 2


def test_export_pdf(client, auth, db):
    _setup(client, auth)
    r = client.get("/api/reports/export/pdf", params={"report_type": "examinations"}, headers=auth["admin"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert "attachment" in r.headers["content-disposition"]
    assert db.query(AuditLog).filter_by(action="export_pdf").count() == 1


def test_export_pdf_with_no_rows(client, auth):
    r = client.get("/api/reports/export/pdf", params={"report_type": "daily"}, headers=auth["admin"])
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_export_excel_contains_rows(client, auth):
    _setup(client, auth)
    r = client.get("/api/reports/export/excel", params={"report_type": "registrations"}, headers=auth["admin"])
    assert r.status_code == 200
    wb = load_workbook(BytesIO(r.content))
    values = [c for row in wb.active.iter_rows(values_only=True) for c in row if c]
    assert "Asha Patil" in values and "Patient Registration Report" in values


def test_export_csv_neutralises_formulas(client, auth):
    p = _register(client, auth, "Formula Test", "9000000099")
    client.post("/api/checkups", json=checkup_payload(p["id"], diagnosis="=HYPERLINK(\"x\")"), headers=auth["doctor"])
    r = client.get("/api/reports/export/csv", params={"report_type": "examinations"}, headers=auth["admin"])
    assert r.status_code == 200
    text = r.content.decode("utf-8-sig")
    assert "'=HYPERLINK" in text


def test_invalid_report_type(client, auth):
    r = client.get("/api/reports/generate", params={"report_type": "bogus"}, headers=auth["admin"])
    assert r.status_code == 422
