import uuid
from datetime import date, timedelta

import pytest

from app.models import AuditLog, Followup
from app.tests.conftest import checkup_payload


def test_create_checkup_links_patient_and_doctor(client, auth, patient, users):
    r = client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"])
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["checkup_code"] == f"EC{date.today().year}000001"
    assert c["patient"]["patient_code"] == patient["patient_code"]
    assert c["doctor"]["id"] == users["doctor"].id
    assert c["examination_date"] == date.today().isoformat()
    assert float(c["right_eye_sphere"]) == -1.25
    assert c["right_eye_axis"] == 90
    assert c["left_eye_iop"] is None  # optional measurement not performed


def test_checkup_requires_existing_patient(client, auth):
    r = client.post("/api/checkups", json=checkup_payload(424242), headers=auth["doctor"])
    assert r.status_code == 404


def test_admin_must_choose_examining_doctor(client, auth, users, patient):
    r = client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["admin"])
    assert r.status_code == 422
    r = client.post("/api/checkups", json=checkup_payload(patient["id"], doctor_id=users["reception"].id), headers=auth["admin"])
    assert r.status_code == 422
    r = client.post("/api/checkups", json=checkup_payload(patient["id"], doctor_id=users["doctor2"].id), headers=auth["admin"])
    assert r.status_code == 201
    assert r.json()["doctor"]["id"] == users["doctor2"].id


def test_duplicate_submission_is_idempotent(client, auth, patient):
    sid = str(uuid.uuid4())
    r1 = client.post("/api/checkups", json=checkup_payload(patient["id"], submission_id=sid), headers=auth["doctor"])
    r2 = client.post("/api/checkups", json=checkup_payload(patient["id"], submission_id=sid), headers=auth["doctor"])
    assert r1.status_code == 201 and r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    assert client.get("/api/checkups", headers=auth["doctor"]).json()["total"] == 1


@pytest.mark.parametrize(
    "field,value",
    [
        ("right_eye_sphere", 35),
        ("right_eye_sphere", -1.3),  # not a 0.25 D step
        ("left_eye_cylinder", -20),
        ("right_eye_axis", 181),
        ("right_eye_axis", -1),
        ("right_eye_iop", 95),
        ("right_eye_unaided_va", "excellent"),
        ("chief_complaints", "   "),
        ("diagnosis", ""),
    ],
)
def test_invalid_measurements_rejected(client, auth, patient, field, value):
    r = client.post("/api/checkups", json=checkup_payload(patient["id"], **{field: value}), headers=auth["doctor"])
    assert r.status_code == 422, (field, value, r.text)


def test_cylinder_without_axis_rejected(client, auth, patient):
    r = client.post("/api/checkups", json=checkup_payload(patient["id"], right_eye_axis=None), headers=auth["doctor"])
    assert r.status_code == 422
    assert "axis" in r.text


def test_exam_before_registration_rejected(client, auth, patient):
    before = (date.today() - timedelta(days=120)).isoformat()
    r = client.post("/api/checkups", json=checkup_payload(patient["id"], examination_date=before), headers=auth["doctor"])
    assert r.status_code == 422


def test_future_exam_date_rejected(client, auth, patient):
    future = (date.today() + timedelta(days=1)).isoformat()
    r = client.post("/api/checkups", json=checkup_payload(patient["id"], examination_date=future), headers=auth["doctor"])
    assert r.status_code == 422


def test_followup_requires_future_date(client, auth, patient):
    r = client.post("/api/checkups", json=checkup_payload(patient["id"], followup_required=True), headers=auth["doctor"])
    assert r.status_code == 422
    r = client.post(
        "/api/checkups",
        json=checkup_payload(patient["id"], followup_required=True, followup_date=date.today().isoformat()),
        headers=auth["doctor"],
    )
    assert r.status_code == 422


def test_followup_recommendation_creates_pending_followup(client, auth, patient, db):
    fu = (date.today() + timedelta(days=14)).isoformat()
    r = client.post(
        "/api/checkups",
        json=checkup_payload(patient["id"], followup_required=True, followup_date=fu, followup_instructions="Recheck IOP"),
        headers=auth["doctor"],
    )
    c = r.json()
    assert c["followups"][0]["status"] == "pending"
    assert c["followups"][0]["scheduled_date"] == fu
    f = db.query(Followup).one()
    assert f.notes == "Recheck IOP" and f.patient_id == patient["id"]


def test_get_checkup(client, auth, patient):
    cid = client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"]).json()["id"]
    r = client.get(f"/api/checkups/{cid}", headers=auth["doctor2"])
    assert r.status_code == 200
    assert r.json()["diagnosis"] == "Myopia with astigmatism"
    assert client.get("/api/checkups/99999", headers=auth["doctor"]).status_code == 404


def test_patient_history_newest_first(client, auth, patient):
    d1 = (date.today() - timedelta(days=30)).isoformat()
    client.post("/api/checkups", json=checkup_payload(patient["id"], examination_date=d1, diagnosis="First"), headers=auth["doctor"])
    client.post("/api/checkups", json=checkup_payload(patient["id"], diagnosis="Second"), headers=auth["doctor"])
    r = client.get(f"/api/patients/{patient['id']}/checkups", headers=auth["doctor"])
    assert [c["diagnosis"] for c in r.json()] == ["Second", "First"]


def test_list_checkups_filters(client, auth, users, patient):
    client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"])
    client.post("/api/checkups", json=checkup_payload(patient["id"], checkup_type="review", diagnosis="Dry eye"), headers=auth["doctor2"])
    r = client.get("/api/checkups", params={"doctor_id": users["doctor2"].id}, headers=auth["doctor"])
    assert [c["diagnosis"] for c in r.json()["items"]] == ["Dry eye"]
    r = client.get("/api/checkups", params={"checkup_type": "new"}, headers=auth["doctor"])
    assert r.json()["total"] == 1
    r = client.get("/api/checkups", params={"q": "dry"}, headers=auth["doctor"])
    assert r.json()["total"] == 1


def test_update_checkup_audits_old_and_new_values(client, auth, patient, db):
    cid = client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"]).json()["id"]
    body = checkup_payload(patient["id"], diagnosis="Compound myopic astigmatism", right_eye_iop=18)
    body.pop("patient_id")
    body["examination_date"] = date.today().isoformat()
    r = client.put(f"/api/checkups/{cid}", json=body, headers=auth["doctor"])
    assert r.status_code == 200
    assert r.json()["diagnosis"] == "Compound myopic astigmatism"
    log = db.query(AuditLog).filter_by(entity_type="eye_checkup", action="update").one()
    assert log.old_values == {"diagnosis": "Myopia with astigmatism", "right_eye_iop": 15.0}
    assert log.new_values == {"diagnosis": "Compound myopic astigmatism", "right_eye_iop": 18.0}


def test_editing_followup_recommendation_syncs_followup(client, auth, patient, db):
    fu = (date.today() + timedelta(days=7)).isoformat()
    c = client.post(
        "/api/checkups", json=checkup_payload(patient["id"], followup_required=True, followup_date=fu), headers=auth["doctor"]
    ).json()
    body = checkup_payload(patient["id"], followup_required=False)
    body.pop("patient_id")
    body["examination_date"] = c["examination_date"]
    r = client.put(f"/api/checkups/{c['id']}", json=body, headers=auth["doctor"])
    assert r.status_code == 200
    assert r.json()["followup_date"] is None
    assert db.query(Followup).one().status == "cancelled"


def test_checkup_pdf(client, auth, patient):
    cid = client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"]).json()["id"]
    r = client.get(f"/api/checkups/{cid}/pdf", headers=auth["doctor"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert len(r.content) > 2000
