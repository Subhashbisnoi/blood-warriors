import json
import random
from datetime import datetime, timedelta, timezone, date
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
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


# ── endpoints ────────────────────────────────────────────────────────────────

class DonorLoginReq(BaseModel):
    hash_id: str   # 6-8 char hash shown in the app, e.g. "1E76BE5A"


@router.post("/login")
def donor_login(req: DonorLoginReq, db: Session = Depends(get_db)):
    """Look up donor by user_id_hash prefix (case-insensitive)."""
    search = req.hash_id.strip().upper()
    row = db.execute(text("""
        SELECT u.id, u.user_id_hash, u.blood_group, u.city, u.gender,
               dp.donor_type, dp.donations_till_date, dp.last_donation_date,
               dp.next_eligible_date, dp.kag_score, dp.donor_tier,
               dp.eligibility_status
        FROM users u
        LEFT JOIN donor_profiles dp ON dp.user_id = u.id
        WHERE UPPER(u.user_id_hash) LIKE :q
          AND u.role IN ('Bridge Donor', 'Emergency Donor')
        LIMIT 1
    """), {"q": f"{search}%"}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Donor not found. Please check your Donor ID.")

    uid = str(row["id"])
    bg  = row["blood_group"] or "O+"
    dtd = row["donations_till_date"] or 0

    # Generate & cache sample data
    history  = _gen_donation_history(uid, bg, dtd)
    gratitude = _gen_gratitude(uid, bg, dtd)

    token = create_access_token({
        "sub": uid,
        "role": "donor",
        "name": f"Donor {str(row['user_id_hash'])[:6].upper()}",
        "blood_group": bg,
        "user_id_hash": str(row["user_id_hash"])[:8].upper(),
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "profile": {
            "id": uid,
            "hash": str(row["user_id_hash"])[:8].upper(),
            "blood_group": bg,
            "city": row["city"],
            "gender": row["gender"],
            "donor_type": row["donor_type"],
            "donations_till_date": dtd,
            "last_donation_date": str(row["last_donation_date"]) if row["last_donation_date"] else None,
            "next_eligible_date": str(row["next_eligible_date"]) if row["next_eligible_date"] else None,
            "kag_score": float(row["kag_score"]) if row["kag_score"] else None,
            "donor_tier": row["donor_tier"],
            "eligibility_status": row["eligibility_status"],
            "donation_history": history,
            "gratitude_messages": gratitude,
            "lives_saved": len([h for h in history if h.get("recipient_saved")]),
        },
    }
