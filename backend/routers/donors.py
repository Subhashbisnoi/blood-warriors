from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from backend.database import get_db

router = APIRouter(prefix="/api/donors", tags=["donors"])


@router.get("")
def list_donors(
    blood_group: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    conditions = ["u.deleted_at IS NULL", "u.role IN ('Bridge Donor', 'Emergency Donor')"]
    params = {"limit": limit, "offset": offset}

    if blood_group:
        conditions.append("u.blood_group::text = :blood_group")
        params["blood_group"] = blood_group
    if status:
        conditions.append("dp.user_donation_active_status::text = :status")
        params["status"] = status

    where = " AND ".join(conditions)
    rows = db.execute(text(f"""
        SELECT u.id, u.user_id_hash, u.blood_group, u.gender, u.city,
               u.lifecycle_stage, u.preferred_channel,
               dp.donor_type, dp.eligibility_status, dp.user_donation_active_status,
               dp.donations_till_date, dp.next_eligible_date, dp.kag_score, dp.donor_tier
        FROM users u
        LEFT JOIN donor_profiles dp ON dp.user_id = u.id
        WHERE {where}
        ORDER BY dp.kag_score DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{user_id}")
def get_donor(user_id: str, db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT u.id, u.user_id_hash, u.blood_group, u.gender, u.city, u.state,
               u.registration_date, u.lifecycle_stage, u.preferred_language, u.preferred_channel,
               dp.donor_type, dp.eligibility_status, dp.user_donation_active_status,
               dp.donations_till_date, dp.next_eligible_date, dp.last_donation_date,
               dp.cycle_of_donations, dp.kag_score, dp.donor_tier,
               dos.calls_to_donations_ratio, dos.total_calls, dos.last_contacted_date,
               dos.consecutive_declines
        FROM users u
        LEFT JOIN donor_profiles dp ON dp.user_id = u.id
        LEFT JOIN donor_outreach_stats dos ON dos.donor_user_id = u.id
        WHERE u.id = :id
    """), {"id": user_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Donor not found")

    donor = dict(row)
    # Compute loyalty tier label
    donations = donor.get("donations_till_date") or 0
    if donations >= 5:
        donor["loyalty_tier"] = "Blood Bridge Champion"
    elif donations >= 3:
        donor["loyalty_tier"] = "Regular Donor"
    elif donations >= 1:
        donor["loyalty_tier"] = "First-time Donor"
    else:
        donor["loyalty_tier"] = "Registered"

    return donor


@router.get("/{user_id}/bridges")
def get_donor_bridges(user_id: str, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT b.id, b.bridge_id_hash, b.bridge_blood_group, b.expected_next_transfusion_date,
               b.frequency_in_days, b.city, b.status,
               (b.expected_next_transfusion_date - CURRENT_DATE) AS days_until,
               bd.confirmed, bd.confirmed_at, bd.joined_at
        FROM bridge_donors bd
        JOIN bridges b ON b.id = bd.bridge_id
        WHERE bd.donor_user_id = :uid AND bd.removed_at IS NULL
        ORDER BY b.expected_next_transfusion_date ASC
    """), {"uid": user_id}).mappings().all()
    return [dict(r) for r in rows]
