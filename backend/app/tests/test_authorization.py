"""Role-based access control is enforced by the API, independent of the frontend."""

import pytest

from app.tests.conftest import checkup_payload, patient_payload


@pytest.mark.parametrize(
    "method,url",
    [
        ("get", "/api/patients"),
        ("post", "/api/patients"),
        ("get", "/api/patients/search?q=ab"),
        ("get", "/api/checkups"),
        ("post", "/api/checkups"),
        ("get", "/api/followups"),
        ("get", "/api/reports/dashboard"),
        ("get", "/api/reports/export/pdf?report_type=daily"),
        ("get", "/api/users"),
        ("get", "/api/audit-logs"),
    ],
)
def test_unauthenticated_requests_rejected(client, method, url):
    r = client.post(url, json={}) if method == "post" else client.get(url)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_doctor_cannot_register_patient(client, auth):
    r = client.post("/api/patients", json=patient_payload(), headers=auth["doctor"])
    assert r.status_code == 403


def test_receptionist_cannot_add_checkup(client, auth, patient):
    r = client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["reception"])
    assert r.status_code == 403


def test_receptionist_cannot_view_clinical_records(client, auth, patient):
    assert client.get("/api/checkups", headers=auth["reception"]).status_code == 403
    assert client.get(f"/api/patients/{patient['id']}/checkups", headers=auth["reception"]).status_code == 403


def test_receptionist_search_hides_clinical_data(client, auth, patient):
    client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"])
    r = client.get("/api/patients/search", params={"q": "Ramesh"}, headers=auth["reception"])
    assert r.status_code == 200
    assert len(r.json()["patients"]) == 1
    assert r.json()["checkups"] == []


def test_only_admin_manages_users_and_audit_logs(client, auth):
    for role in ("doctor", "reception"):
        assert client.get("/api/users", headers=auth[role]).status_code == 403
        assert client.get("/api/audit-logs", headers=auth[role]).status_code == 403
    assert client.get("/api/users", headers=auth["admin"]).status_code == 200
    assert client.get("/api/audit-logs", headers=auth["admin"]).status_code == 200


def test_only_admin_can_deactivate_patient(client, auth, patient):
    assert client.delete(f"/api/patients/{patient['id']}", headers=auth["reception"]).status_code == 403
    assert client.delete(f"/api/patients/{patient['id']}", headers=auth["doctor"]).status_code == 403
    assert client.delete(f"/api/patients/{patient['id']}", headers=auth["admin"]).status_code == 200


def test_receptionist_cannot_view_reports_but_can_view_dashboard(client, auth):
    assert client.get("/api/reports/dashboard", headers=auth["reception"]).status_code == 200
    assert client.get("/api/reports/generate?report_type=daily", headers=auth["reception"]).status_code == 403
    assert client.get("/api/reports/export/excel?report_type=daily", headers=auth["reception"]).status_code == 403


def test_doctor_cannot_edit_another_doctors_checkup(client, auth, patient):
    r = client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"])
    cid = r.json()["id"]
    body = checkup_payload(patient["id"], diagnosis="Changed")
    body.pop("patient_id")
    r = client.put(f"/api/checkups/{cid}", json=body, headers=auth["doctor2"])
    assert r.status_code == 403
    r = client.put(f"/api/checkups/{cid}", json=body, headers=auth["admin"])
    assert r.status_code == 200


def test_doctor_cannot_record_checkup_as_other_doctor(client, auth, users, patient):
    r = client.post(
        "/api/checkups",
        json=checkup_payload(patient["id"], doctor_id=users["doctor2"].id),
        headers=auth["doctor"],
    )
    assert r.status_code == 403
