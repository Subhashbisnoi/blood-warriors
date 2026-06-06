import hashlib
import random
from datetime import datetime, timedelta, timezone, date
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db
from backend.core.auth import create_access_token

router = APIRouter(prefix="/api/donor-portal", tags=["donor-portal"])

# ── in-memory caches (no migrations needed) ─────────────────────────────────
_DONATION_HISTORY: dict[str, list] = {}
_GRATITUDE_MSGS:   dict[str, list] = {}

PATIENT_NAMES = [
    "Ananya S.", "Rohan M.", "Priya K.", "Arjun P.", "Kavya R.",
    "Siddharth J.", "Meera N.", "Vikram T.", "Divya L.", "Aditya B.",
]
GRATITUDE_TEMPLATES = [
    "Your donation literally saved my child's life. We are forever grateful. 🙏",
    "I was in a critical condition when your blood arrived. Thank you for being my guardian angel.",
    "Words cannot express how thankful our family is. You gave us more time together.",
    "My daughter's surgery was successful because of donors like you. From the bottom of our hearts, thank you.",
    "I donated blood once and never knew what it meant to receive. Now I do. Thank you, hero.",
    "You didn't know me, but you saved me. That selflessness is the purest form of kindness.",
    "My son has thalassemia and needs regular transfusions. You have kept him alive and smiling.",
    "Three years of transfusions, and strangers like you have been our lifeline. Gratitude beyond words.",
    "The doctors said we had hours left. Your donation changed everything. Thank you.",
    "You are a stranger who became our family's hero. May God bless you always.",
]

CITIES = ["Hyderabad", "Mumbai", "Delhi", "Bangalore", "Chennai", "Pune", "Kolkata"]


def _gen_donation_history(user_id: str, blood_group: str, donations_count: int) -> list:
    """Generate realistic donation timeline over 2 years, save to in-memory store."""
    if user_id in _DONATION_HISTORY:
        return _DONATION_HISTORY[user_id]

    rng = random.Random(user_id)  # deterministic per donor
    today = date.today()
    history = []
    # Space donations ~90 days apart (min 56 days per WHO guidelines)
    cur = today - timedelta(days=rng.randint(10, 45))
    count = min(donations_count if donations_count and donations_count > 0 else rng.randint(3, 12), 20)

    for i in range(count):
        gap = rng.randint(56, 140)
        cur = cur - timedelta(days=gap)
        history.append({
            "id": str(uuid4()),
            "date": cur.isoformat(),
            "units": rng.choice([1, 1, 1, 2]),
            "location": rng.choice(CITIES),
            "blood_group": blood_group or "O+",
            "type": rng.choice(["Whole Blood", "Whole Blood", "Platelets", "Plasma"]),
            "status": "Completed",
            "recipient_saved": rng.choice([True, True, True, False]),
        })

    history.sort(key=lambda x: x["date"])
    _DONATION_HISTORY[user_id] = history
    return history


def _gen_gratitude(user_id: str, blood_group: str, donations_count: int) -> list:
    if user_id in _GRATITUDE_MSGS:
        return _GRATITUDE_MSGS[user_id]

    rng = random.Random(user_id + "gratitude")
    count = max(2, min(donations_count or 3, 8))
    msgs = []
    blood_groups = ["A+", "B+", "O+", "AB+", "O-"]
    today = date.today()

    for i in range(count):
        days_ago = rng.randint(5, 365)
        msgs.append({
            "id": str(uuid4()),
            "from_patient": rng.choice(PATIENT_NAMES),
            "blood_group": blood_group or rng.choice(blood_groups),
            "message": rng.choice(GRATITUDE_TEMPLATES),
            "city": rng.choice(CITIES),
            "date": (today - timedelta(days=days_ago)).isoformat(),
            "lives_saved_moment": rng.choice([True, False]),
        })

    msgs.sort(key=lambda x: x["date"], reverse=True)
    _GRATITUDE_MSGS[user_id] = msgs
    return msgs


def _ensure_portal_columns(db: Session):
    """Add portal-specific columns; each ALTER runs in its own savepoint so one
    failure does not abort the whole transaction."""
    columns = [
        ("portal_registered", "BOOLEAN DEFAULT FALSE"),
        ("donor_name",        "TEXT"),
        ("phone",             "TEXT"),
        ("date_of_birth",     "DATE"),
        ("medical_notes",     "TEXT"),
    ]
    for col, typedef in columns:
        try:
            db.execute(text(f"SAVEPOINT sp_{col}"))
            db.execute(text(f"ALTER TABLE donor_profiles ADD COLUMN IF NOT EXISTS {col} {typedef}"))
            db.execute(text(f"RELEASE SAVEPOINT sp_{col}"))
        except Exception:
            db.execute(text(f"ROLLBACK TO SAVEPOINT sp_{col}"))
    db.commit()


def _build_profile_payload(uid: str, row: dict, history: list, gratitude: list) -> dict:
    bg = row.get("blood_group") or "O+"
    return {
        "id": uid,
        "hash": str(row.get("user_id_hash", ""))[:8].upper(),
        "blood_group": bg,
        "city": row.get("city"),
        "gender": row.get("gender"),
        "donor_name": row.get("donor_name"),
        "phone": row.get("phone"),
        "donor_type": row.get("donor_type"),
        "donations_till_date": row.get("donations_till_date") or 0,
        "last_donation_date": str(row["last_donation_date"]) if row.get("last_donation_date") else None,
        "next_eligible_date": str(row["next_eligible_date"]) if row.get("next_eligible_date") else None,
        "kag_score": float(row["kag_score"]) if row.get("kag_score") else None,
        "donor_tier": row.get("donor_tier"),
        "eligibility_status": row.get("eligibility_status"),
        "portal_registered": bool(row.get("portal_registered")),
        "donation_history": history,
        "gratitude_messages": gratitude,
        "lives_saved": len([h for h in history if h.get("recipient_saved")]),
    }


def _fetch_real_gratitude(uid: str, db: Session) -> list:
    try:
        rows = db.execute(text("""
            SELECT id, patient_name, blood_group, message, city, created_at
            FROM patient_gratitude WHERE donor_id = :uid ORDER BY created_at DESC
        """), {"uid": uid}).mappings().all()
        return [{
            "id": str(r["id"]), "from_patient": r["patient_name"],
            "blood_group": r["blood_group"], "message": r["message"],
            "city": r["city"], "date": str(r["created_at"])[:10],
            "lives_saved_moment": True, "is_real": True,
        } for r in rows]
    except Exception:
        return []


# ── endpoints ────────────────────────────────────────────────────────────────

class DonorLoginReq(BaseModel):
    hash_id: str   # 6-8 char hash shown in the app, e.g. "1E76BE5A"


class DonorRegisterReq(BaseModel):
    full_name: str
    blood_group: str          # "A Positive", "O Negative", etc.
    gender: str
    city: str
    phone: str
    date_of_birth: Optional[str] = None   # ISO date YYYY-MM-DD
    donor_type: str = "Regular Donor"     # Regular Donor / One-Time Donor / Emergency Donor
    has_donated_before: bool = False
    previous_donations: int = 0
    medical_notes: Optional[str] = None


@router.post("/register")
def donor_register(req: DonorRegisterReq, db: Session = Depends(get_db)):
    """Self-registration: creates a new donor account, returns a Donor ID."""
    _ensure_portal_columns(db)

    # Deduplicate by phone (columns now guaranteed to exist)
    try:
        existing = db.execute(text(
            "SELECT user_id FROM donor_profiles WHERE phone = :phone LIMIT 1"
        ), {"phone": req.phone.strip()}).mappings().first()
        if existing:
            raise HTTPException(status_code=400, detail="A donor with this phone number is already registered.")
    except HTTPException:
        raise
    except Exception:
        pass  # phone column may still not exist on a cold DB — skip dedup

    uid = str(uuid4())
    # Readable 8-char Donor ID derived from uid
    hash_val = hashlib.sha256(uid.encode()).hexdigest()[:16]

    # Calculate next eligible date
    dob = None
    if req.date_of_birth:
        try:
            dob = date.fromisoformat(req.date_of_birth)
        except ValueError:
            pass

    next_eligible = (date.today() + timedelta(days=90)).isoformat() if req.has_donated_before else date.today().isoformat()
    dtd = max(0, req.previous_donations) if req.has_donated_before else 0

    # Insert into users — only confirmed-existing columns
    db.execute(text("""
        INSERT INTO users (id, user_id_hash, blood_group, city, gender, role, registration_date)
        VALUES (:id, :hash, :bg, :city, :gender, 'Bridge Donor', NOW())
    """), {
        "id": uid, "hash": hash_val,
        "bg": req.blood_group, "city": req.city.strip(), "gender": req.gender,
    })

    # Insert into donor_profiles — only confirmed-existing columns + portal extras via ALTER
    db.execute(text("""
        INSERT INTO donor_profiles
            (user_id, donor_type, donations_till_date, next_eligible_date,
             eligibility_status,
             portal_registered, donor_name, phone, date_of_birth, medical_notes)
        VALUES
            (:uid, :dtype, :dtd, :next_elig,
             'eligible',
             TRUE, :name, :phone, :dob, :notes)
    """), {
        "uid": uid, "dtype": req.donor_type, "dtd": dtd,
        "next_elig": next_eligible,
        "name": req.full_name.strip(), "phone": req.phone.strip(),
        "dob": dob, "notes": (req.medical_notes or "").strip() or None,
    })
    db.commit()

    token = create_access_token({
        "sub": uid, "role": "donor",
        "name": req.full_name.strip(),
        "blood_group": req.blood_group,
        "user_id_hash": hash_val[:8].upper(),
    })

    row = {
        "user_id_hash": hash_val, "blood_group": req.blood_group,
        "city": req.city, "gender": req.gender, "donor_name": req.full_name,
        "phone": req.phone, "donor_type": req.donor_type,
        "donations_till_date": dtd, "last_donation_date": None,
        "next_eligible_date": next_eligible,
        "kag_score": None, "donor_tier": None,
        "eligibility_status": "eligible", "portal_registered": True,
    }

    return {
        "access_token": token,
        "token_type": "bearer",
        "donor_id": hash_val[:8].upper(),     # show this to the user
        "profile": _build_profile_payload(uid, row, [], []),
    }


@router.post("/login")
def donor_login(req: DonorLoginReq, db: Session = Depends(get_db)):
    """Look up donor by user_id_hash prefix (case-insensitive)."""
    _ensure_portal_columns(db)
    search = req.hash_id.strip().upper()
    row = db.execute(text("""
        SELECT u.id, u.user_id_hash, u.blood_group, u.city, u.gender,
               dp.donor_type, dp.donations_till_date, dp.last_donation_date,
               dp.next_eligible_date, dp.kag_score, dp.donor_tier,
               dp.eligibility_status,
               COALESCE(dp.portal_registered, FALSE) AS portal_registered,
               dp.donor_name, dp.phone
        FROM users u
        LEFT JOIN donor_profiles dp ON dp.user_id = u.id
        WHERE UPPER(u.user_id_hash) LIKE :q
          AND u.role IN ('Bridge Donor', 'Emergency Donor')
        LIMIT 1
    """), {"q": f"{search}%"}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Donor not found. Please check your Donor ID.")

    uid  = str(row["id"])
    bg   = row["blood_group"] or "O+"
    dtd  = row["donations_till_date"] or 0
    is_new = bool(row.get("portal_registered"))

    real_gratitude = _fetch_real_gratitude(uid, db)

    # New portal-registered donors get NO sample data — only real messages
    if is_new:
        history  = []
        gratitude = real_gratitude
    else:
        history  = _gen_donation_history(uid, bg, dtd)
        gratitude = real_gratitude + _gen_gratitude(uid, bg, dtd)

    token = create_access_token({
        "sub": uid, "role": "donor",
        "name": row.get("donor_name") or f"Donor {str(row['user_id_hash'])[:6].upper()}",
        "blood_group": bg,
        "user_id_hash": str(row["user_id_hash"])[:8].upper(),
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "profile": _build_profile_payload(uid, dict(row), history, gratitude),
    }
