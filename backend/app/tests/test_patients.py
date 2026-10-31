from datetime import date, timedelta

from app.models import AuditLog
from app.tests.conftest import checkup_payload, patient_payload


def test_register_patient_generates_code_and_records_creator(client, auth, users):
    r = client.post("/api/patients", json=patient_payload(), headers=auth["reception"])
    assert r.status_code == 201
    body = r.json()
    assert body["patient_code"] == f"PT{date.today().year}000001"
    assert body["creator"]["name"] == "Front Desk"
    assert body["age"] >= 40
    assert body["registration_date"]


def test_patient_codes_are_unique_and_sequential(client, auth):
    codes = []
    for i, mobile in enumerate(["9876500001", "9876500002", "9876500003"]):
        r = client.post(
            "/api/patients",
            json=patient_payload(full_name=f"Patient Number {chr(65 + i)}", mobile_number=mobile, date_of_birth=f"199{i}-01-01"),
            headers=auth["reception"],
        )
        assert r.status_code == 201, r.text
        codes.append(r.json()["patient_code"])
    assert len(set(codes)) == 3
    assert codes == sorted(codes)


def test_registration_writes_audit_log(client, auth, db):
    r = client.post("/api/patients", json=patient_payload(), headers=auth["reception"])
    code = r.json()["patient_code"]
    log = db.query(AuditLog).filter_by(entity_type="patient", entity_id=code, action="create").one()
    assert log.new_values["full_name"] == "Ramesh Kumar"


def test_mobile_number_normalised(client, auth):
    r = client.post("/api/patients", json=patient_payload(mobile_number="+91 98765-43210"), headers=auth["reception"])
    assert r.status_code == 201
    assert r.json()["mobile_number"] == "9876543210"


# ----- Duplicate detection -----

def test_duplicate_same_mobile_requires_confirmation(client, auth, patient):
    r = client.post(
        "/api/patients",
        json=patient_payload(full_name="Suresh Kumar", date_of_birth="1990-01-01"),
        headers=auth["reception"],
    )
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "possible_duplicate"
    assert err["details"][0]["patient_code"] == patient["patient_code"]
    assert "Same mobile number" in err["details"][0]["match_reasons"]

    # Family members often share a phone: staff may confirm it is a different person.
    r = client.post(
        "/api/patients",
        json=patient_payload(full_name="Suresh Kumar", date_of_birth="1990-01-01", confirm_not_duplicate=True),
        headers=auth["reception"],
    )
    assert r.status_code == 201


def test_exact_duplicate_cannot_be_forced(client, auth, patient):
    r = client.post(
        "/api/patients",
        json=patient_payload(full_name="ramesh  kumar", mobile_number="9123456789", confirm_not_duplicate=True),
        headers=auth["reception"],
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "duplicate_patient"


def test_check_duplicates_endpoint(client, auth, patient):
    r = client.post(
        "/api/patients/check-duplicates",
        json={"full_name": "Ramesh Kumar", "date_of_birth": "1980-05-15"},
        headers=auth["reception"],
    )
    assert r.status_code == 200
    assert [d["id"] for d in r.json()] == [patient["id"]]


# ----- Validation -----

def test_missing_mandatory_fields(client, auth):
    r = client.post("/api/patients", json={"full_name": "A"}, headers=auth["reception"])
    assert r.status_code == 422
    fields = {d["field"] for d in r.json()["error"]["details"]}
    assert {"date_of_birth", "gender", "mobile_number", "address", "village", "district", "state"} <= fields


def test_invalid_mobile_rejected(client, auth):
    r = client.post("/api/patients", json=patient_payload(mobile_number="12345"), headers=auth["reception"])
    assert r.status_code == 422


def test_future_dob_rejected(client, auth):
    future = (date.today() + timedelta(days=5)).isoformat()
    r = client.post("/api/patients", json=patient_payload(date_of_birth=future), headers=auth["reception"])
    assert r.status_code == 422


def test_invalid_gender_rejected(client, auth):
    r = client.post("/api/patients", json=patient_payload(gender="unknown"), headers=auth["reception"])
    assert r.status_code == 422


def test_blank_address_rejected(client, auth):
    r = client.post("/api/patients", json=patient_payload(address="   "), headers=auth["reception"])
    assert r.status_code == 422


# ----- Retrieval / list -----

def test_get_patient(client, auth, patient):
    r = client.get(f"/api/patients/{patient['id']}", headers=auth["doctor"])
    assert r.status_code == 200
    assert r.json()["patient_code"] == patient["patient_code"]


def test_get_missing_patient_404(client, auth):
    r = client.get("/api/patients/99999", headers=auth["doctor"])
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_list_patients_paginates_and_includes_checkup_stats(client, auth, patient):
    for i in range(3):
        client.post(
            "/api/patients",
            json=patient_payload(full_name=f"Other Person {chr(65 + i)}", mobile_number=f"98000000{i}0", date_of_birth=f"200{i}-02-02"),
            headers=auth["reception"],
        )
    client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"])

    r = client.get("/api/patients", params={"page": 1, "page_size": 2}, headers=auth["reception"])
    body = r.json()
    assert body["total"] == 4 and body["pages"] == 2 and len(body["items"]) == 2

    r = client.get("/api/patients", params={"sort_by": "total_checkups", "sort_order": "desc"}, headers=auth["reception"])
    top = r.json()["items"][0]
    assert top["id"] == patient["id"]
    assert top["total_checkups"] == 1
    assert top["last_checkup_date"] == date.today().isoformat()


def test_list_filters_gender_and_age(client, auth, patient):
    client.post(
        "/api/patients",
        json=patient_payload(full_name="Sunita Devi", gender="female", mobile_number="9000000001", date_of_birth="2015-01-01"),
        headers=auth["reception"],
    )
    r = client.get("/api/patients", params={"gender": "female"}, headers=auth["reception"])
    assert [p["full_name"] for p in r.json()["items"]] == ["Sunita Devi"]
    r = client.get("/api/patients", params={"min_age": 18}, headers=auth["reception"])
    assert [p["full_name"] for p in r.json()["items"]] == ["Ramesh Kumar"]
    r = client.get("/api/patients", params={"max_age": 17}, headers=auth["reception"])
    assert [p["full_name"] for p in r.json()["items"]] == ["Sunita Devi"]


def test_list_filters_registration_date(client, auth, patient):
    old = (date.today() - timedelta(days=40)).isoformat()
    client.post(
        "/api/patients",
        json=patient_payload(full_name="Old Patient", mobile_number="9000000002", registration_date=old, date_of_birth="1970-01-01"),
        headers=auth["reception"],
    )
    # The `patient` fixture was registered 90 days ago.
    since = (date.today() - timedelta(days=60)).isoformat()
    r = client.get("/api/patients", params={"registered_from": since}, headers=auth["reception"])
    assert [p["full_name"] for p in r.json()["items"]] == ["Old Patient"]
    until = (date.today() - timedelta(days=60)).isoformat()
    r = client.get("/api/patients", params={"registered_to": until}, headers=auth["reception"])
    assert [p["full_name"] for p in r.json()["items"]] == ["Ramesh Kumar"]


# ----- Search -----

def test_search_by_code_name_mobile_and_checkup_code(client, auth, patient):
    c = client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"]).json()
    for q in (patient["patient_code"], "ramesh", "98765", c["checkup_code"]):
        r = client.get("/api/patients/search", params={"q": q}, headers=auth["doctor"])
        assert r.status_code == 200, q
        assert [p["id"] for p in r.json()["patients"]] == [patient["id"]], q
    r = client.get("/api/patients/search", params={"q": c["checkup_code"]}, headers=auth["doctor"])
    assert r.json()["matched_checkup_codes"] == [c["checkup_code"]]
    assert r.json()["checkups"][0]["diagnosis"] == "Myopia with astigmatism"


def test_search_escapes_wildcards(client, auth, patient):
    r = client.get("/api/patients/search", params={"q": "%%"}, headers=auth["doctor"])
    assert r.json()["patients"] == []


def test_search_sql_injection_is_harmless(client, auth, patient):
    r = client.get("/api/patients/search", params={"q": "' OR 1=1 --"}, headers=auth["doctor"])
    assert r.status_code == 200
    assert r.json()["patients"] == []


# ----- Update / delete -----

def test_update_patient_audits_changes(client, auth, patient, db, users):
    body = patient_payload(village="Hadapsar", remarks="Moved")
    r = client.put(f"/api/patients/{patient['id']}", json=body, headers=auth["reception"])
    assert r.status_code == 200
    assert r.json()["village"] == "Hadapsar"
    assert r.json()["updater"]["id"] == users["reception"].id
    log = db.query(AuditLog).filter_by(entity_type="patient", action="update").one()
    assert log.old_values["village"] == "Shivaji Nagar"
    assert log.new_values == {"village": "Hadapsar", "remarks": "Moved"}


def test_doctor_cannot_update_demographics(client, auth, patient):
    r = client.put(f"/api/patients/{patient['id']}", json=patient_payload(village="X Y"), headers=auth["doctor"])
    assert r.status_code == 403


def test_soft_delete_preserves_history(client, auth, patient, db):
    client.post("/api/checkups", json=checkup_payload(patient["id"]), headers=auth["doctor"])
    assert client.delete(f"/api/patients/{patient['id']}", headers=auth["admin"]).status_code == 200
    # Hidden from staff lists and lookups ...
    assert client.get("/api/patients", headers=auth["reception"]).json()["total"] == 0
    assert client.get(f"/api/patients/{patient['id']}", headers=auth["reception"]).status_code == 404
    # ... but the record and clinical history still exist and admins can restore.
    assert len(client.get(f"/api/patients/{patient['id']}/checkups", headers=auth["admin"]).json()) == 1
    r = client.post(f"/api/patients/{patient['id']}/restore", headers=auth["admin"])
    assert r.status_code == 200 and r.json()["is_active"] is True
