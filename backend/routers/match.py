import asyncio
import json
from datetime import date, timedelta
from uuid import uuid4
from typing import Optional, List
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db, SessionLocal
from backend.services.kag_engine import find_matching_donors
from backend.services.claude_service import generate_all_explanations
from backend.services.outreach_engine import simulate_outreach_escalation
from backend.config import settings

router = APIRouter(prefix="/api/match", tags=["match"])

# City → (lat, lon) lookup
CITY_COORDS = {
    "hyderabad":  (17.3850, 78.4867),
    "mumbai":     (19.0760, 72.8777),
    "delhi":      (28.6139, 77.2090),
    "bangalore":  (12.9716, 77.5946),
    "bengaluru":  (12.9716, 77.5946),
    "chennai":    (13.0827, 80.2707),
    "pune":       (18.5204, 73.8567),
    "kolkata":    (22.5726, 88.3639),
    "ahmedabad":  (23.0225, 72.5714),
    "jaipur":     (26.9124, 75.7873),
    "surat":      (21.1702, 72.8311),
    "lucknow":    (26.8467, 80.9462),
    "bhopal":     (23.2599, 77.4126),
}

BG_NORM = {
    "a+": "A Positive", "a-": "A Negative",
    "b+": "B Positive", "b-": "B Negative",
    "o+": "O Positive", "o-": "O Negative",
    "ab+": "AB Positive", "ab-": "AB Negative",
    "a positive": "A Positive", "a negative": "A Negative",
    "b positive": "B Positive", "b negative": "B Negative",
    "o positive": "O Positive", "o negative": "O Negative",
    "ab positive": "AB Positive", "ab negative": "AB Negative",
}


# ── Bulk parse ─────────────────────────────────────────────────────────────────

class BulkParseReq(BaseModel):
    text: str

@router.post("/bulk-parse")
def bulk_parse(req: BulkParseReq):
    """Parse a natural-language blood request into a list of structured match items."""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
    except Exception:
        raise HTTPException(status_code=503, detail="OpenAI not available. Set OPENAI_API_KEY.")

    today = date.today().isoformat()
    prompt = f"""Today is {today}.

Parse the following blood request into a JSON array.
Each item must have:
  blood_group  : one of "A Positive","A Negative","B Positive","B Negative",
                        "O Positive","O Negative","AB Positive","AB Negative"
  units        : integer (default 1 if not mentioned)
  city         : city name string (default "Hyderabad" if not mentioned)
  transfusion_date : ISO date YYYY-MM-DD (default 7 days from today if not mentioned)

Return ONLY a JSON array, no markdown, no explanation.

Request: {req.text}"""

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )
    raw = resp.choices[0].message.content.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
        raw = raw.rstrip("`").strip()

    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail=f"Could not parse AI response: {raw[:200]}")

    # Normalise + enrich
    default_date = (date.today() + timedelta(days=7)).isoformat()
    result = []
    for item in items:
        bg = BG_NORM.get(str(item.get("blood_group", "")).strip().lower(),
                         item.get("blood_group", "O Positive"))
        city = (item.get("city") or "Hyderabad").strip()
        coords = CITY_COORDS.get(city.lower(), (17.3850, 78.4867))
        result.append({
            "blood_group": bg,
            "units": max(1, int(item.get("units") or 1)),
            "city": city,
            "transfusion_date": item.get("transfusion_date") or default_date,
            "lat": coords[0],
            "lon": coords[1],
        })
    return {"items": result}


# ── Bulk run ───────────────────────────────────────────────────────────────────

class BulkItem(BaseModel):
    blood_group: str
    units: int = 1
    city: str = "Hyderabad"
    transfusion_date: str
    lat: float = 17.3850
    lon: float = 78.4867

class BulkRunReq(BaseModel):
    items: List[BulkItem]

@router.post("/bulk-run")
async def bulk_run(req: BulkRunReq, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Run multiple match requests in parallel and return all results."""

    async def run_one(item: BulkItem):
        try:
            td = date.fromisoformat(item.transfusion_date)
        except ValueError:
            td = date.today() + timedelta(days=7)

        coords = CITY_COORDS.get(item.city.lower(), (item.lat, item.lon))
        candidates = find_matching_donors(
            db=db,
            blood_group=item.blood_group,
            transfusion_date=td,
            patient_lat=coords[0],
            patient_lon=coords[1],
        )

        if not candidates:
            return {
                "blood_group": item.blood_group, "units": item.units,
                "city": item.city, "transfusion_date": str(td),
                "match_id": None, "candidates": [], "total": 0,
                "status": "no_donors",
            }

        explanations = await generate_all_explanations(candidates, item.blood_group, str(td))
        for i, (c, exp) in enumerate(zip(candidates, explanations)):
            c["rank"] = i + 1
            c["explanation"] = exp
            c["user_id_hash_short"] = str(c.get("user_id_hash", ""))[:8]

        # Store match request
        match_id = str(uuid4())
        try:
            row = db.execute(text("""
                SELECT id FROM bridges WHERE bridge_blood_group::text = :bg AND status = 'active' LIMIT 1
            """), {"bg": item.blood_group}).scalar()
            bridge_id = str(row) if row else None
            if bridge_id:
                db.execute(text("""
                    INSERT INTO match_requests
                        (id, bridge_id, requested_blood_group, transfusion_date, units_required, geo_lat, geo_lon, status)
                    VALUES (:id, :bid, :bg, :td, :ur, :lat, :lon, 'pending')
                """), {
                    "id": match_id, "bid": bridge_id, "bg": item.blood_group,
                    "td": td, "ur": item.units, "lat": coords[0], "lon": coords[1],
                })
                db.commit()
        except Exception:
            db.rollback()

        from backend.services.outreach_engine import _insert_match_candidate
        for i, c in enumerate(candidates, start=1):
            _insert_match_candidate(db, match_id, str(c.get("donor_id", "")), c, i)

        background_tasks.add_task(
            simulate_outreach_escalation,
            match_id=match_id,
            candidates=candidates,
            db_factory=SessionLocal,
            transfusion_date=str(td),
        )

        return {
            "blood_group": item.blood_group, "units": item.units,
            "city": item.city, "transfusion_date": str(td),
            "match_id": match_id,
            "candidates": [_serialize(c) for c in candidates],
            "total": len(candidates),
            "status": "matched",
        }

    results = await asyncio.gather(*[run_one(item) for item in req.items])
    return {"results": list(results)}


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
