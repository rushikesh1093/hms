from datetime import date, timedelta

from app.models import Followup
from app.tests.conftest import checkup_payload


def _checkup_with_followup(client, auth, patient, days=7, exam_days_ago=0):
    exam = date.today() - timedelta(days=exam_days_ago)
    fu = exam + timedelta(days=days)
    return client.post(
        "/api/checkups",
        json=checkup_payload(
            patient["id"], examination_date=exam.isoformat(), followup_required=True, followup_date=fu.isoformat()
        ),
        headers=auth["doctor"],
    ).json()


def test_views_upcoming_and_overdue(client, auth, patient):
    _checkup_with_followup(client, auth, patient, days=7)  # upcoming
    _checkup_with_followup(client, auth, patient, days=5, exam_days_ago=20)  # overdue
    up = client.get("/api/followups", params={"view": "upcoming"}, headers=auth["doctor"]).json()
    over = client.get("/api/followups", params={"view": "overdue"}, headers=auth["doctor"]).json()
    assert up["total"] == 1 and up["items"][0]["is_overdue"] is False
    assert over["total"] == 1 and over["items"][0]["is_overdue"] is True
    # Overdue is a derived view; the stored status stays "pending" until a user acts.
    assert over["items"][0]["status"] == "pending"
    counts = client.get("/api/followups/counts", headers=auth["doctor"]).json()
    assert counts["pending"] == 2 and counts["overdue"] == 1 and counts["upcoming"] == 1


def test_pending_endpoint(client, auth, patient):
    _checkup_with_followup(client, auth, patient)
    r = client.get("/api/followups/pending", headers=auth["reception"])
    assert r.status_code == 200
    item = r.json()["items"][0]
    # Reception sees appointment info but not the clinical summary.
    assert item["checkup"] is None and item["notes"] is None


def test_complete_followup_records_user_and_time(client, auth, patient, users):
    c = _checkup_with_followup(client, auth, patient)
    fid = c["followups"][0]["id"]
    r = client.put(f"/api/followups/{fid}", json={"status": "completed", "notes": "IOP normal"}, headers=auth["doctor"])
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "completed"
    assert body["completed_at"] is not None
    assert body["completer"]["id"] == users["doctor"].id
    assert client.get("/api/followups", params={"view": "completed"}, headers=auth["doctor"]).json()["total"] == 1


def test_reopen_clears_completion(client, auth, patient):
    fid = _checkup_with_followup(client, auth, patient)["followups"][0]["id"]
    client.put(f"/api/followups/{fid}", json={"status": "completed"}, headers=auth["doctor"])
    r = client.put(f"/api/followups/{fid}", json={"status": "pending"}, headers=auth["doctor"])
    assert r.json()["completed_at"] is None


def test_receptionist_can_only_reschedule(client, auth, patient):
    fid = _checkup_with_followup(client, auth, patient)["followups"][0]["id"]
    r = client.put(f"/api/followups/{fid}", json={"status": "completed"}, headers=auth["reception"])
    assert r.status_code == 403
    new_date = (date.today() + timedelta(days=10)).isoformat()
    r = client.put(f"/api/followups/{fid}", json={"scheduled_date": new_date}, headers=auth["reception"])
    assert r.status_code == 200 and r.json()["scheduled_date"] == new_date


def test_cannot_reschedule_into_past(client, auth, patient):
    fid = _checkup_with_followup(client, auth, patient)["followups"][0]["id"]
    past = (date.today() - timedelta(days=1)).isoformat()
    r = client.put(f"/api/followups/{fid}", json={"scheduled_date": past}, headers=auth["doctor"])
    assert r.status_code == 422


def test_manual_followup_creation_and_validation(client, auth, patient, db):
    when = (date.today() + timedelta(days=3)).isoformat()
    r = client.post("/api/followups", json={"patient_id": patient["id"], "scheduled_date": when}, headers=auth["doctor"])
    assert r.status_code == 201
    r = client.post("/api/followups", json={"patient_id": patient["id"], "scheduled_date": when, "checkup_id": 999}, headers=auth["doctor"])
    assert r.status_code == 422
    r = client.post("/api/followups", json={"patient_id": patient["id"], "scheduled_date": when}, headers=auth["reception"])
    assert r.status_code == 403
    assert db.query(Followup).count() == 1


def test_search_followups_by_patient(client, auth, patient):
    _checkup_with_followup(client, auth, patient)
    r = client.get("/api/followups", params={"q": patient["patient_code"]}, headers=auth["doctor"])
    assert r.json()["total"] == 1
    r = client.get("/api/followups", params={"q": "nobody"}, headers=auth["doctor"])
    assert r.json()["total"] == 0


def test_patient_followup_history(client, auth, patient):
    _checkup_with_followup(client, auth, patient)
    r = client.get(f"/api/patients/{patient['id']}/followups", headers=auth["doctor"])
    assert r.status_code == 200 and len(r.json()) == 1
