"""
KAG Matching Engine — Neptune graph only.

Flow:
  1. If bridge_id provided → Neptune DONATED_FOR → DISTANCE_TO traversal
  2. If blood_group only → Neptune MEMBER_OF traversal
  3. Neptune unavailable → raise (no fallback)
"""
import logging
from datetime import date
from sqlalchemy.orm import Session
from fastapi import HTTPException

log = logging.getLogger(__name__)


def find_matching_donors(
    db: Session,
    blood_group: str,
    transfusion_date: date,
    patient_lat: float,
    patient_lon: float,
    top_n: int = 5,
    bridge_id=None,
) -> list[dict]:
    from backend.services.neptune_service import kag_match_bridge, kag_match_blood_group
    txdate_str = str(transfusion_date)

    if bridge_id:
        results = kag_match_bridge(bridge_id, txdate_str, top_n)
    else:
        results = kag_match_blood_group(blood_group, txdate_str, patient_lat, patient_lon, top_n)

    if results is None:
        raise HTTPException(
            status_code=503,
            detail="Neptune KAG graph is unreachable. Check AWS credentials and Neptune endpoint.",
        )

    log.info(f"Neptune KAG matched {len(results)} donors for {blood_group}")
    return _enrich_with_rank(results)


def _enrich_with_rank(candidates: list[dict]) -> list[dict]:
    enriched = []
    for i, c in enumerate(candidates, 1):
        enriched.append({
            **c,
            "rank": i,
            "user_id_hash": c.get("user_id_hash") or c.get("donor_id", ""),
        })
    return enriched
