"""Seed demo users and SYNTHETIC patients/check-ups for development and demonstrations.

    python -m app.seed                 # demo users + 150 synthetic patients
    python -m app.seed --patients 0    # demo users only
    python -m app.seed --create-admin  # production-safe: create one admin interactively

All patient data generated here is fictitious. The script refuses to generate synthetic
patients when ENVIRONMENT=production.
"""

import argparse
import getpass
import random
import secrets
import sys
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import EyeCheckup, Followup, Patient, User
from app.models.enums import CheckupType, FollowupStatus, Role
from app.services.checkup_service import next_checkup_code
from app.services.patient_service import next_patient_code
from app.utils.dates import now, today

FIRST_M = ["Ramesh", "Suresh", "Mahesh", "Rajesh", "Anil", "Sunil", "Vijay", "Arjun", "Rahul", "Manoj", "Prakash", "Ganesh", "Ravi", "Deepak", "Ashok", "Mohan", "Kishore", "Sanjay", "Harish", "Naveen"]
FIRST_F = ["Sunita", "Anita", "Kavita", "Lakshmi", "Priya", "Meena", "Rekha", "Geeta", "Pooja", "Savitri", "Asha", "Usha", "Radha", "Neha", "Sarita", "Kamala", "Shanti", "Parvati", "Jyoti", "Divya"]
LAST = ["Sharma", "Verma", "Patil", "Yadav", "Reddy", "Naidu", "Singh", "Kumar", "Gupta", "Joshi", "Pawar", "Jadhav", "Kulkarni", "Deshmukh", "Rao", "Mishra", "Pandey", "Chavan", "Shinde", "More"]
PLACES = [
    ("Shivaji Nagar", "Pune", "Maharashtra"),
    ("Hadapsar", "Pune", "Maharashtra"),
    ("Baramati", "Pune", "Maharashtra"),
    ("Kothrud", "Pune", "Maharashtra"),
    ("Satara Road", "Satara", "Maharashtra"),
    ("Karad", "Satara", "Maharashtra"),
    ("Pandharpur", "Solapur", "Maharashtra"),
    ("Akkalkot", "Solapur", "Maharashtra"),
]
COMPLAINTS = [
    ("Blurred distance vision", "Myopia", "Spectacles prescribed"),
    ("Difficulty reading small print", "Presbyopia", "Reading glasses advised"),
    ("Gradual painless loss of vision", "Senile Cataract", "Cataract surgery counselling"),
    ("Redness and watering", "Allergic Conjunctivitis", "Topical antihistamine drops"),
    ("Eye strain and headache", "Astigmatism", "Spectacles prescribed"),
    ("Itching and discharge", "Bacterial Conjunctivitis", "Topical antibiotic drops"),
    ("Routine diabetic eye screening", "Diabetic Retinopathy Screening - No DR", "Annual review"),
    ("Dryness and grittiness", "Dry Eye Disease", "Lubricating eye drops"),
    ("Family history of glaucoma", "Glaucoma Suspect", "Visual field test and IOP monitoring"),
    ("Blurred near and distance vision", "Hypermetropia", "Spectacles prescribed"),
]
VA_OPTIONS = ["6/6", "6/9", "6/12", "6/18", "6/24", "6/36", "6/60"]


def _rand_power(rng: random.Random, lo: float, hi: float) -> Decimal:
    return Decimal(str(round(rng.uniform(lo, hi) * 4) / 4))


def ensure_user(db, username, name, email, role, password, designation=None, reg_no=None) -> tuple[User, bool]:
    user = db.scalar(select(User).where(User.username == username))
    if user:
        return user, False
    user = User(
        username=username,
        name=name,
        email=email,
        role=role,
        password_hash=hash_password(password),
        designation=designation,
        registration_number=reg_no,
    )
    db.add(user)
    db.flush()
    return user, True


def seed_users(db) -> dict[str, User]:
    specs = [
        ("admin", "System Administrator", "admin@hospital.local", Role.ADMIN, settings.SEED_ADMIN_PASSWORD, "Hospital Administrator", None),
        ("dr.mehta", "Dr. Anjali Mehta", "anjali.mehta@hospital.local", Role.DOCTOR, settings.SEED_DOCTOR_PASSWORD, "Senior Ophthalmologist, MS (Ophth)", "MMC-2009-14523"),
        ("dr.kulkarni", "Dr. Sameer Kulkarni", "sameer.kulkarni@hospital.local", Role.DOCTOR, settings.SEED_DOCTOR_PASSWORD, "Ophthalmologist, DNB", "MMC-2014-20871"),
        ("reception", "Priya Desai", "reception@hospital.local", Role.RECEPTIONIST, settings.SEED_RECEPTIONIST_PASSWORD, "Front Desk", None),
    ]
    users = {}
    for username, name, email, role, pw, desig, reg in specs:
        generated = False
        if not pw:
            pw, generated = secrets.token_urlsafe(10) + "A1", True
        user, created = ensure_user(db, username, name, email, role, pw, desig, reg)
        users[username] = user
        if created:
            shown = pw if generated else "(from SEED_* setting in .env)"
            print(f"  created {role:<12} {username:<12} password: {shown}")
        else:
            print(f"  exists  {role:<12} {username}")
    return users


def seed_patients(db, users: dict[str, User], count: int, rng: random.Random) -> None:
    existing = db.scalar(select(func.count(Patient.id))) or 0
    if existing:
        print(f"  {existing} patients already present; skipping synthetic patient generation")
        return
    doctors = [users["dr.mehta"], users["dr.kulkarni"]]
    receptionist = users["reception"]
    on = today()
    for _ in range(count):
        gender = rng.choices(["male", "female", "other"], weights=[49, 49, 2])[0]
        first = rng.choice(FIRST_M if gender == "male" else FIRST_F)
        name = f"{first} {rng.choice(LAST)}"
        age = rng.choice([rng.randint(3, 17), rng.randint(18, 40), rng.randint(41, 60), rng.randint(61, 88), rng.randint(45, 75)])
        reg_date = on - timedelta(days=int(rng.triangular(0, 365, 30)))
        dob = reg_date - timedelta(days=age * 365 + rng.randint(0, 364))
        village, district, state = rng.choice(PLACES)
        patient = Patient(
            patient_code=next_patient_code(db, reg_date),
            full_name=name,
            date_of_birth=dob,
            gender=gender,
            mobile_number=f"{rng.choice('6789')}{rng.randint(100000000, 999999999)}",
            address=f"House {rng.randint(1, 400)}, Ward {rng.randint(1, 20)}",
            village=village,
            district=district,
            state=state,
            registration_date=reg_date,
            medical_history=rng.choice([None, None, "Type 2 diabetes", "Hypertension", "Diabetes and hypertension"]),
            allergies=rng.choice([None, None, None, "Penicillin", "Sulfa drugs"]),
            previous_eye_problems=rng.choice([None, None, "Uses spectacles", "Recurrent conjunctivitis"]),
            previous_eye_surgery=rng.choice([None, None, None, "Cataract surgery right eye (2019)"]),
            remarks="Synthetic demo record",
            created_by=receptionist.id,
        )
        db.add(patient)
        db.flush()

        visit_date = reg_date
        for v in range(rng.choice([0, 1, 1, 1, 2, 2, 3])):
            if visit_date > on:
                break
            complaint, diagnosis, treatment = rng.choice(COMPLAINTS)
            doctor = rng.choice(doctors)
            needs_fu = rng.random() < 0.45
            fu_date = visit_date + timedelta(days=rng.choice([7, 14, 30, 60])) if needs_fu else None
            cyl_r = _rand_power(rng, -2, 0) if rng.random() < 0.5 else None
            cyl_l = _rand_power(rng, -2, 0) if rng.random() < 0.5 else None
            checkup = EyeCheckup(
                checkup_code=next_checkup_code(db, visit_date),
                patient_id=patient.id,
                doctor_id=doctor.id,
                examination_date=visit_date,
                checkup_type=CheckupType.NEW if v == 0 else CheckupType.FOLLOW_UP,
                chief_complaints=complaint,
                symptom_duration=rng.choice(["3 days", "2 weeks", "1 month", "6 months", "1 year"]),
                right_eye_unaided_va=rng.choice(VA_OPTIONS),
                right_eye_corrected_va=rng.choice(VA_OPTIONS[:3]),
                right_eye_sphere=_rand_power(rng, -4, 3),
                right_eye_cylinder=cyl_r,
                right_eye_axis=rng.randint(1, 180) if cyl_r else None,
                right_eye_iop=Decimal(str(rng.randint(10, 24))),
                right_eye_findings="Anterior segment normal",
                left_eye_unaided_va=rng.choice(VA_OPTIONS),
                left_eye_corrected_va=rng.choice(VA_OPTIONS[:3]),
                left_eye_sphere=_rand_power(rng, -4, 3),
                left_eye_cylinder=cyl_l,
                left_eye_axis=rng.randint(1, 180) if cyl_l else None,
                left_eye_iop=Decimal(str(rng.randint(10, 24))),
                left_eye_findings="Anterior segment normal",
                diagnosis=diagnosis,
                recommended_treatment=treatment,
                prescription=treatment,
                doctor_notes="Synthetic demo examination",
                followup_required=needs_fu,
                followup_date=fu_date,
                followup_instructions="Review with reports" if needs_fu else None,
                created_by=doctor.id,
            )
            db.add(checkup)
            db.flush()
            if needs_fu:
                done = fu_date < on and rng.random() < 0.6
                db.add(
                    Followup(
                        patient_id=patient.id,
                        checkup_id=checkup.id,
                        scheduled_date=fu_date,
                        status=FollowupStatus.COMPLETED if done else FollowupStatus.PENDING,
                        completed_at=now() if done else None,
                        completed_by=doctor.id if done else None,
                        notes="Review with reports",
                        created_by=doctor.id,
                    )
                )
            visit_date = visit_date + timedelta(days=rng.randint(10, 90))
    print(f"  created {count} synthetic patients with check-ups and follow-ups")


def create_admin_interactive(db) -> None:
    username = input("Admin username: ").strip().lower()
    name = input("Full name: ").strip()
    email = input("Email: ").strip().lower()
    password = getpass.getpass("Password (min 8 chars, upper, lower, digit): ")
    from app.schemas.auth import UserCreate

    data = UserCreate(username=username, name=name, email=email, password=password, role=Role.ADMIN)
    _, created = ensure_user(db, data.username, data.name, data.email, Role.ADMIN, data.password)
    db.commit()
    print("Admin created." if created else "User already exists; nothing changed.")


def bootstrap_admin(db) -> str:
    """Ensure the BOOTSTRAP_ADMIN_USERNAME account exists and uses BOOTSTRAP_ADMIN_PASSWORD.

    While BOOTSTRAP_ADMIN_PASSWORD is set, every start (re)applies it: the account is
    created if missing, otherwise its password is reset, it is unlocked, re-activated and
    given the admin role. Remove the variable once you have signed in. Returns a status line.
    """
    from app.core.security import verify_password
    from app.schemas.auth import _strong_password
    from app.services import audit_service

    password = settings.BOOTSTRAP_ADMIN_PASSWORD
    if not password:
        msg = "BOOTSTRAP_ADMIN_PASSWORD is not set; admin bootstrap skipped."
        print(msg)
        return msg
    username = settings.BOOTSTRAP_ADMIN_USERNAME.strip().lower()
    try:
        _strong_password(password)
    except ValueError as exc:
        msg = f"BOOTSTRAP_ADMIN_PASSWORD rejected ({exc}); admin bootstrap skipped."
        print(msg)
        return msg

    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        email = settings.BOOTSTRAP_ADMIN_EMAIL.strip().lower()
        if db.scalar(select(User).where(User.email == email)):
            email = f"{username}.{secrets.token_hex(3)}@example.org"
        user, _ = ensure_user(db, username, "System Administrator", email, Role.ADMIN, password, "Hospital Administrator")
        action, msg = "bootstrap_create", f"Bootstrap admin '{username}' created."
    else:
        if not verify_password(password, user.password_hash):
            user.password_hash = hash_password(password)
        user.role = Role.ADMIN
        user.is_active = True
        user.failed_login_attempts = 0
        user.locked_until = None
        action, msg = "bootstrap_reset", f"Bootstrap admin '{username}' password applied and account unlocked."
    db.flush()
    audit_service.record(db, user_id=user.id, action=action, entity_type="user", entity_id=user.id)
    db.commit()
    print(f"{msg} Remove BOOTSTRAP_ADMIN_PASSWORD from the environment after signing in.")
    return msg


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--patients", type=int, default=150, help="number of synthetic patients (default 150)")
    parser.add_argument("--create-admin", action="store_true", help="interactively create an admin account")
    parser.add_argument("--bootstrap-admin", action="store_true", help="create the first admin from BOOTSTRAP_ADMIN_* env vars")
    parser.add_argument("--seed", type=int, default=42, help="random seed")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.create_admin:
            create_admin_interactive(db)
            return
        if args.bootstrap_admin:
            bootstrap_admin(db)
            return
        if settings.is_production:
            sys.exit("Refusing to seed demo accounts and synthetic patients in production. Use --create-admin.")
        print("Seeding users:")
        users = seed_users(db)
        if args.patients > 0:
            print("Seeding synthetic patients:")
            seed_patients(db, users, args.patients, random.Random(args.seed))
        db.commit()
    print("Done.")


if __name__ == "__main__":
    main()
