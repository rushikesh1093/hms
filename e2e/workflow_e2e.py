"""Browser end-to-end test of the complete hospital workflow (Playwright).

Prerequisites: backend on :8000 and frontend dev server on :5173, database migrated and
seeded with the demo users (python -m app.seed). Run from the repo root:

    backend\\.venv\\Scripts\\python.exe e2e\\workflow_e2e.py            (Windows, uses installed Edge)
    E2E_BROWSER=chromium python e2e/workflow_e2e.py                 (after `playwright install chromium`)

It creates one new synthetic patient and check-up in the DEVELOPMENT database.
"""

import os
import random
import re
import string
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:5173")
PASSWORDS = {
    "reception": os.environ.get("E2E_RECEPTION_PASSWORD", "Reception@12345"),
    "dr.mehta": os.environ.get("E2E_DOCTOR_PASSWORD", "Doctor@12345"),
    "admin": os.environ.get("E2E_ADMIN_PASSWORD", "Admin@12345"),
}
SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(exist_ok=True)

# Randomised so repeated runs are different people (otherwise duplicate detection,
# correctly, flags the patient created by the previous run).
FIRST = random.choice(["Kamala", "Lalita", "Nirmala", "Shobha", "Vandana", "Meenakshi"])
PATIENT_NAME = f"{FIRST} {''.join(random.choices(string.ascii_uppercase, k=6)).title()}"
DOB = date(random.randint(1950, 1999), random.randint(1, 12), random.randint(1, 28)).isoformat()
MOBILE = "9" + "".join(random.choices(string.digits, k=9))
FOLLOWUP = (date.today() + timedelta(days=14)).isoformat()

steps: list[str] = []


def step(msg: str) -> None:
    steps.append(msg)
    print(f"  [ok] {msg}", flush=True)


def login(page, username: str) -> None:
    page.goto(f"{BASE}/login")
    page.get_by_label("Username").fill(username)
    page.get_by_label("Password", exact=True).fill(PASSWORDS[username])
    page.get_by_role("button", name="Sign in").click()
    expect(page.get_by_role("heading", name=re.compile("Welcome"))).to_be_visible(timeout=15000)


def logout(page) -> None:
    page.get_by_role("button", name="Logout").first.click()
    expect(page.get_by_role("heading", name="Sign in")).to_be_visible()


def main() -> int:
    errors: list[str] = []
    with sync_playwright() as p:
        browser_name = os.environ.get("E2E_BROWSER", "msedge")
        if browser_name in ("msedge", "chrome"):
            browser = p.chromium.launch(channel=browser_name, headless=True)
        else:
            browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.set_default_timeout(15000)

        # 1. Receptionist logs in
        login(page, "reception")
        step("Receptionist logged in")
        nav = page.get_by_role("navigation", name="Main")
        expect(nav.get_by_role("link", name="Eye Check-ups")).to_have_count(0)
        expect(nav.get_by_role("link", name="User Management")).to_have_count(0)
        step("Receptionist sidebar hides clinical/admin sections")

        # 2. Register a new patient
        page.get_by_role("navigation", name="Main").get_by_role("link", name="Register Patient").click()
        page.get_by_role("button", name="Register Patient").click()
        expect(page.get_by_text("Full name is required")).to_be_visible()
        step("Mandatory-field validation shown on empty submit")
        page.get_by_label("Full name").fill(PATIENT_NAME)
        page.get_by_label("Date of birth").fill(DOB)
        expect(page.get_by_label("Age", exact=True)).to_have_value(re.compile(r"\d+ years"))
        page.get_by_label("Gender").select_option("female")
        page.get_by_label("Mobile number").fill(MOBILE)
        page.get_by_label(re.compile(r"^Address")).fill("House 21, Temple Road")
        page.get_by_label("Village / City").fill("Karad")
        page.get_by_label("District").fill("Satara")
        page.get_by_label("State").fill("Maharashtra")
        page.get_by_label("Allergies").fill("Sulfa drugs")
        page.get_by_label("Previous eye problems").fill("Uses reading glasses")
        page.get_by_role("button", name="Register Patient").click()

        # 3. System generates a unique patient ID
        code_el = page.get_by_test_id("new-patient-code")
        expect(code_el).to_be_visible()
        patient_code = code_el.inner_text().strip()
        assert re.fullmatch(r"PT\d{10}", patient_code), patient_code
        step(f"Patient registered with generated ID {patient_code}")
        page.screenshot(path=SHOTS / "01_registered.png")

        # 4. Patient appears in All Patients
        page.get_by_role("navigation", name="Main").get_by_role("link", name="All Patients").click()
        page.get_by_label("Search patients").fill(patient_code)
        row = page.get_by_role("row").filter(has_text=patient_code)
        expect(row).to_have_count(1)
        expect(row).to_contain_text(PATIENT_NAME)
        step("Patient appears in All Patients table (server-side search)")

        # Duplicate protection: same name + DOB + mobile is caught
        page.goto(f"{BASE}/patients/new")
        page.get_by_label("Mobile number").fill(MOBILE)
        expect(page.get_by_text("Possible existing registration")).to_be_visible(timeout=5000)
        expect(page.get_by_role("link", name=patient_code)).to_be_visible()
        step("Live duplicate warning shown for an existing mobile number")

        # Receptionist cannot open clinical pages
        page.goto(f"{BASE}/checkups")
        expect(page.get_by_text("Access restricted")).to_be_visible()
        step("Receptionist blocked from check-ups page")
        logout(page)

        # 5. Doctor searches by mobile number
        login(page, "dr.mehta")
        step("Doctor logged in")
        page.get_by_role("navigation", name="Main").get_by_role("link", name="Search Patient").click()
        page.get_by_label("Search", exact=True).fill(MOBILE)
        card = page.locator(".card").filter(has_text=patient_code)
        expect(card).to_be_visible()
        step("Doctor found patient by mobile number")

        # 6. Doctor opens the patient profile
        card.get_by_role("link", name="Open profile").click()
        expect(page.get_by_role("heading", name=PATIENT_NAME)).to_be_visible()
        expect(page.get_by_text("Sulfa drugs")).to_be_visible()
        step("Doctor opened patient profile")

        # 7-9. Doctor adds an eye check-up with clinical findings and follow-up
        page.get_by_role("link", name="Add eye check-up").first.click()
        expect(page.get_by_text("Allergies: Sulfa drugs")).to_be_visible()
        page.get_by_label("Chief complaints").fill("Blurred distance vision for 3 months")
        page.get_by_label("Duration of symptoms").fill("3 months")
        od = page.get_by_role("region", name="Right Eye (OD)")
        os_ = page.get_by_role("region", name="Left Eye (OS)")
        od.get_by_label("Unaided visual acuity").fill("6/18")
        od.get_by_label("Corrected visual acuity").fill("6/6")
        od.get_by_label("Sphere (D)").fill("-1.30")
        od.get_by_label("Cylinder (D)").fill("-0.50")
        page.get_by_role("button", name="Review & save check-up").click()
        expect(od.get_by_text("Sphere must be in 0.25 D steps")).to_be_visible()
        expect(od.get_by_text("Axis is required when cylinder is recorded")).to_be_visible()
        step("Range/step validation enforced on refraction values")
        od.get_by_label("Sphere (D)").fill("-1.25")
        od.get_by_label("Axis (°)").fill("90")
        od.get_by_label("IOP (mmHg)").fill("15")
        od.get_by_label("Clinical findings").fill("Clear media, normal fundus")
        os_.get_by_label("Unaided visual acuity").fill("6/12")
        os_.get_by_label("Corrected visual acuity").fill("6/6")
        os_.get_by_label("Sphere (D)").fill("-1.00")
        page.get_by_label("Diagnosis").fill("Myopia with astigmatism")
        page.get_by_label("Prescription").fill("Single vision spectacles as per refraction")
        page.get_by_label("Doctor's notes / advice").fill("Use glasses for distance work")
        page.get_by_label("Yes").check()
        page.get_by_label("Recommended follow-up date").fill(FOLLOWUP)
        page.get_by_label("Follow-up instructions").fill("Review refraction")
        page.get_by_role("button", name="Review & save check-up").click()
        dialog = page.get_by_role("dialog", name="Save this eye check-up?")
        expect(dialog).to_contain_text("Myopia with astigmatism")
        step("Confirmation dialog shown before saving")
        dialog.get_by_role("button", name="Save check-up").click()
        page.wait_for_url(re.compile(r"/checkups/\d+$"))
        expect(page.get_by_text("Eye Examination Report", exact=True)).to_be_visible()
        report_text = page.locator("article").inner_text()
        checkup_code = re.search(r"EC\d{10}", report_text).group(0)
        for expected_text in (patient_code, "-1.25", "90°", "15 mmHg", "Myopia with astigmatism", "Authorised Doctor's Signature"):
            assert expected_text in report_text, expected_text
        step(f"Check-up {checkup_code} saved and printable report rendered")
        page.screenshot(path=SHOTS / "02_checkup_report.png", full_page=True)

        with page.expect_download() as dl:
            page.get_by_role("button", name="Download PDF").click()
        pdf_path = Path(tempfile.gettempdir()) / dl.value.suggested_filename
        dl.value.save_as(pdf_path)
        assert pdf_path.read_bytes()[:4] == b"%PDF"
        step(f"Check-up PDF downloaded ({dl.value.suggested_filename})")

        # 10. Patient history is updated
        page.get_by_role("link", name="Patient history").click()
        expect(page.get_by_text(checkup_code).first).to_be_visible()
        page.get_by_role("button", name="Medical history").click()
        expect(page.get_by_role("cell", name="Single vision spectacles as per refraction")).to_be_visible()
        step("Patient timeline and medical history show the new examination")

        page.get_by_role("navigation", name="Main").get_by_role("link", name="Follow-ups").click()
        page.get_by_label("Search follow-ups").fill(patient_code)
        expect(page.get_by_role("row").filter(has_text=patient_code)).to_contain_text("In 14 days")
        step("Follow-up scheduled and listed as upcoming")
        logout(page)

        # 11. Admin views summary reports
        login(page, "admin")
        step("Admin logged in")
        expect(page.get_by_text("Total patients")).to_be_visible()
        page.screenshot(path=SHOTS / "03_dashboard.png", full_page=True)
        page.get_by_role("navigation", name="Main").get_by_role("link", name="Summary Reports").click()
        page.get_by_label("Report type").select_option("examinations")
        expect(page.get_by_role("heading", name="Eye Examination Report")).to_be_visible()
        expect(page.get_by_role("cell", name=checkup_code)).to_be_visible()
        step("Eye examination report lists the new check-up")

        # 12. Admin downloads PDF and Excel
        for label, magic in (("PDF", b"%PDF"), ("Excel", b"PK")):
            with page.expect_download() as dl:
                page.get_by_role("button", name=label, exact=True).click()
            out = Path(tempfile.gettempdir()) / dl.value.suggested_filename
            dl.value.save_as(out)
            assert out.read_bytes()[:2] == magic[:2], label
            step(f"{label} report downloaded ({dl.value.suggested_filename}, {out.stat().st_size} bytes)")

        page.get_by_role("navigation", name="Main").get_by_role("link", name="Audit Logs").click()
        page.get_by_label("Record ID").fill(checkup_code)
        expect(page.get_by_role("row").filter(has_text="Create")).to_have_count(1)
        step("Audit log records check-up creation")

        # Responsive check: mobile viewport
        mobile = browser.new_context(viewport={"width": 390, "height": 844}, storage_state=ctx.storage_state())
        mpage = mobile.new_page()
        mpage.on("pageerror", lambda e: errors.append(str(e)))
        mpage.goto(f"{BASE}/patients")
        expect(mpage.get_by_role("button", name="Open menu")).to_be_visible()
        mpage.get_by_role("button", name="Open menu").click()
        expect(mpage.get_by_role("link", name="Follow-ups")).to_be_visible()
        mpage.screenshot(path=SHOTS / "04_mobile_menu.png")
        step("Mobile layout shows collapsible navigation")
        mobile.close()
        browser.close()

    if errors:
        print("\nUncaught page errors:")
        for e in errors:
            print("  ", e)
        return 1
    print(f"\nAll {len(steps)} end-to-end checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
