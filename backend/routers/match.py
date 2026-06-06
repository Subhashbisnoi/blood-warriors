import asyncio
from datetime import date
from uuid import uuid4
from typing import Optional
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db, SessionLocal
from backend.services.kag_engine import find_matching_donors
from backend.services.claude_service import generate_all_explanations
from backend.services.outreach_engine import simulate_outreach_escalation

router = APIRouter(prefix="/api/match", tags=["match"])


class MatchRequest(BaseModel):
    blood_group: str
    transfusion_date: date
    patient_lat: float = 17.3850
    patient_lon: float = 78.4867
    units_required: float = 1.0
    bridge_id: Optional[str] = None


@router.post("")
async def create_match(req: MatchRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    candidates = find_matching_donors(
        db=db,
        blood_group=req.blood_group,
        transfusion_date=req.transfusion_date,
        patient_lat=req.patient_lat,
        patient_lon=req.patient_lon,
        bridge_id=req.bridge_id,
    )

    if not candidates:
        raise HTTPException(status_code=404, detail="No eligible donors found for this blood group and date.")

    # Generate AI explanations concurrently
    explanations = await generate_all_explanations(candidates, req.blood_group, str(req.transfusion_date))

    for i, (candidate, explanation) in enumerate(zip(candidates, explanations)):
        candidate["rank"] = i + 1
        candidate["explanation"] = explanation
        candidate["user_id_hash_short"] = str(candidate.get("user_id_hash", ""))[:8]

    # Store match request in DB
    match_id = str(uuid4())
    try:
        bridge_id = req.bridge_id
        if not bridge_id:
            # Pick first active bridge of this blood group for demo
            row = db.execute(text("""
                SELECT id FROM bridges WHERE bridge_blood_group::text = :bg AND status = 'active' LIMIT 1
            """), {"bg": req.blood_group}).scalar()
            bridge_id = str(row) if row else None

        if bridge_id:
            db.execute(text("""
                INSERT INTO match_requests
                    (id, bridge_id, requested_blood_group, transfusion_date, units_required, geo_lat, geo_lon, status)
                VALUES (:id, :bid, :bg, :td, :ur, :lat, :lon, 'pending')
            """), {
                "id": match_id,
                "bid": bridge_id,
                "bg": req.blood_group,
                "td": req.transfusion_date,
                "ur": req.units_required,
                "lat": req.patient_lat,
                "lon": req.patient_lon,
            })
            db.commit()
    except Exception:
        db.rollback()
        match_id = str(uuid4())

    # Persist all candidates to match_candidates table
    from backend.services.outreach_engine import _insert_match_candidate
    for i, candidate in enumerate(candidates, start=1):
        donor_id = str(candidate.get("donor_id", ""))
        _insert_match_candidate(db, match_id, donor_id, candidate, i)

    # Start outreach simulation in background
    background_tasks.add_task(
        simulate_outreach_escalation,
        match_id=match_id,
        candidates=candidates,
        db_factory=SessionLocal,
        transfusion_date=str(req.transfusion_date),
    )

    return {
        "match_id": match_id,
        "blood_group": req.blood_group,
        "transfusion_date": str(req.transfusion_date),
        "candidates": [_serialize(c) for c in candidates],
        "total_pool_searched": len(candidates),
    }


@router.get("/{match_id}")
def get_match(match_id: str, db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT id, requested_blood_group, transfusion_date, status, initiated_at, confirmed_at, escalated_at
        FROM match_requests WHERE id = :id
    """), {"id": match_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Match not found")
    return dict(row)


@router.get("")
def list_matches(status: Optional[str] = None, limit: int = 20, db: Session = Depends(get_db)):
    q = "SELECT id, requested_blood_group, transfusion_date, status, initiated_at FROM match_requests"
    params = {"limit": limit}
    if status:
        q += " WHERE status = :status"
        params["status"] = status
    q += " ORDER BY initiated_at DESC LIMIT :limit"
    rows = db.execute(text(q), params).mappings().all()
    return [dict(r) for r in rows]


def _serialize(c: dict) -> dict:
    return {
        "rank": c.get("rank"),
        "user_id_hash_short": c.get("user_id_hash_short"),
        "blood_group": str(c.get("blood_group", "")),
        "donor_type": str(c.get("donor_type", "")),
        "city": c.get("city"),
        "distance_km": c.get("distance_km"),
        "donations_till_date": c.get("donations_till_date"),
        "next_eligible_date": str(c.get("next_eligible_date")) if c.get("next_eligible_date") else None,
        "score": c.get("score"),
        "ml_score": c.get("ml_score"),
        "churn_risk": c.get("churn_risk"),
        "needs_reengagement": c.get("needs_reengagement", False),
        "tier": c.get("tier"),
        "explanation": c.get("explanation"),
        "source": c.get("source"),
    }
