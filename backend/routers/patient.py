from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db
from backend.core.auth import create_access_token

router = APIRouter(prefix="/api/patient", tags=["patient"])

# In-memory store — no DB migration needed for demo
_PATIENTS: dict[str, dict] = {}


class PatientRegister(BaseModel):
    name: str
    email: str
    password: str
    age: int
    height_cm: float
    weight_kg: float
    blood_group: str


class PatientLoginReq(BaseModel):
    email: str
    password: str


def _bmi(height_cm: float, weight_kg: float) -> float:
    h = height_cm / 100
    return round(weight_kg / (h * h), 1)


def _bmi_label(bmi: float) -> str:
    if bmi < 18.5: return "Underweight"
    if bmi < 25:   return "Normal"
    if bmi < 30:   return "Overweight"
    return "Obese"


@router.post("/register")
def register_patient(req: PatientRegister):
    if req.email in _PATIENTS:
        raise HTTPException(status_code=400, detail="Email already registered. Please login.")
    bmi = _bmi(req.height_cm, req.weight_kg)
    profile = {
        "name": req.name,
        "email": req.email,
        "password": req.password,
        "age": req.age,
        "height_cm": req.height_cm,
        "weight_kg": req.weight_kg,
        "blood_group": req.blood_group,
        "bmi": bmi,
        "bmi_label": _bmi_label(bmi),
    }
    _PATIENTS[req.email] = profile
    token = create_access_token({
        "sub": req.email,
        "role": "patient",
        "name": req.name,
        "blood_group": req.blood_group,
        "age": req.age,
        "bmi": bmi,
    })
    return {"access_token": token, "token_type": "bearer", "profile": {k: v for k, v in profile.items() if k != "password"}}


@router.post("/login")
def login_patient(req: PatientLoginReq):
    p = _PATIENTS.get(req.email)
    if not p or p["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token({
        "sub": req.email,
        "role": "patient",
        "name": p["name"],
        "blood_group": p["blood_group"],
        "age": p["age"],
        "bmi": p["bmi"],
    })
    return {"access_token": token, "token_type": "bearer", "profile": {k: v for k, v in p.items() if k != "password"}}


@router.get("/profile")
def get_profile(email: str):
    p = _PATIENTS.get(email)
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return {k: v for k, v in p.items() if k != "password"}


# ── Gratitude messages ────────────────────────────────────────────────────────

class GratitudeReq(BaseModel):
    donor_hash: str       # 4-8 char prefix of donor's user_id_hash
    message: str


@router.post("/gratitude")
def send_gratitude(req: GratitudeReq, db: Session = Depends(get_db)):
    """Patient sends a real gratitude message to a donor, saved to DB."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    if len(req.message) > 500:
        raise HTTPException(status_code=400, detail="Message too long (max 500 chars).")

    # Resolve donor
    search = req.donor_hash.strip().upper()
    donor = db.execute(text("""
        SELECT u.id, u.user_id_hash, u.blood_group, u.city
        FROM users u
        WHERE UPPER(u.user_id_hash) LIKE :q
          AND u.role IN ('Bridge Donor', 'Emergency Donor')
        LIMIT 1
    """), {"q": f"{search}%"}).mappings().first()

    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found. Please check the Donor ID.")

    # Ensure table exists
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS patient_gratitude (
            id          TEXT PRIMARY KEY,
            donor_id    TEXT NOT NULL,
            patient_name TEXT NOT NULL,
            blood_group TEXT,
            message     TEXT NOT NULL,
            city        TEXT,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        )
    """))
    db.commit()

    msg_id = str(uuid4())
    db.execute(text("""
        INSERT INTO patient_gratitude (id, donor_id, patient_name, blood_group, message, city, created_at)
        VALUES (:id, :donor_id, :patient_name, :blood_group, :message, :city, :created_at)
    """), {
        "id": msg_id,
        "donor_id": str(donor["id"]),
        "patient_name": "Anonymous Patient",   # patient identity kept private
        "blood_group": donor["blood_group"] or "O+",
        "message": req.message.strip(),
        "city": donor["city"] or "India",
        "created_at": datetime.now(timezone.utc),
    })
    db.commit()
    return {"ok": True, "id": msg_id, "donor_hash": str(donor["user_id_hash"])[:8].upper()}


@router.get("/gratitude/donor/{donor_hash}")
def get_real_gratitude(donor_hash: str, db: Session = Depends(get_db)):
    """Fetch all real gratitude messages for a donor (used by donor portal)."""
    search = donor_hash.strip().upper()
    donor = db.execute(text("""
        SELECT u.id FROM users u
        WHERE UPPER(u.user_id_hash) LIKE :q
          AND u.role IN ('Bridge Donor', 'Emergency Donor')
        LIMIT 1
    """), {"q": f"{search}%"}).mappings().first()
    if not donor:
        return {"messages": []}

    try:
        rows = db.execute(text("""
            SELECT id, patient_name, blood_group, message, city, created_at
            FROM patient_gratitude
            WHERE donor_id = :donor_id
            ORDER BY created_at DESC
        """), {"donor_id": str(donor["id"])}).mappings().all()
    except Exception:
        return {"messages": []}

    return {"messages": [
        {
            "id": str(r["id"]),
            "from_patient": r["patient_name"],
            "blood_group": r["blood_group"],
            "message": r["message"],
            "city": r["city"],
            "date": str(r["created_at"])[:10],
            "lives_saved_moment": True,
            "is_real": True,
        }
        for r in rows
    ]}
