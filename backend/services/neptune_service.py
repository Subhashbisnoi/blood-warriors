"""
Neptune KAG service — Gremlin client with SigV4 signing.
Layer 1: Graph hard gates (eligibility, active status, blood compatibility)
Layer 3: ML scoring via DonorRankingModel + ChurnRiskModel (replaces hand-weighted formula)
"""
import logging
from typing import Optional
from backend.config import settings

log = logging.getLogger(__name__)


def _run(query: str):
    """Run Gremlin in isolated thread+event loop (avoids FastAPI asyncio conflict)."""
    import asyncio
    import concurrent.futures

    endpoint = settings.NEPTUNE_ENDPOINT
    if not endpoint:
        return None

    def _execute():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            from gremlin_python.driver import client as gc_mod, serializer

            key_id = settings.AWS_ACCESS_KEY_ID
            secret  = settings.AWS_SECRET_ACCESS_KEY
            region  = settings.NEPTUNE_REGION

            if key_id and secret:
                from botocore.auth import SigV4Auth
                from botocore.awsrequest import AWSRequest
                from botocore.credentials import Credentials
                creds = Credentials(key_id, secret)
                host_with_port = endpoint.replace("wss://", "").replace("/gremlin", "")
                req = AWSRequest(method="GET", url=f"https://{host_with_port}/gremlin",
                                 headers={"host": host_with_port})
                SigV4Auth(creds, "neptune-db", region).add_auth(req)
                headers = dict(req.headers)
                cli = gc_mod.Client(endpoint, "g",
                                    message_serializer=serializer.GraphSONSerializersV2d0(),
                                    headers=headers)
            else:
                cli = gc_mod.Client(endpoint, "g",
                                    message_serializer=serializer.GraphSONSerializersV2d0())

            result = cli.submit(query).all().result()
            cli.close()
            return result
        except Exception as e:
            log.warning(f"Neptune query failed: {e}")
            return None
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_execute)
        try:
            return future.result(timeout=15)
        except concurrent.futures.TimeoutError:
            log.warning("Neptune query timed out")
            return None


# ── shared project/by template ─────────────────────────────────────────────────
# All donor fields needed by ml_engine._features() + display fields

_DONOR_PROJECT = (
    "'donor_id','user_id_hash','blood_group','donations_till_date','calls_to_donations_ratio',"
    "'active_status','donor_type','donor_tier','city',"
    "'next_eligible_date','last_donation_date','cycle_of_donations','consecutive_declines'"
)

_DONOR_BY = """
           .by('kag_id').by('user_id_hash').by('blood_group')
           .by(coalesce(__.values('donations_till_date'),    __.constant(0)))
           .by(coalesce(__.values('calls_to_donations_ratio'), __.constant(0.0)))
           .by('active_status').by(coalesce(__.values('donor_type'), __.constant('Other')))
           .by(coalesce(__.values('donor_tier'),            __.constant('Reserve')))
           .by(coalesce(__.values('city'),                  __.constant('')))
           .by(coalesce(__.values('next_eligible_date'),    __.constant('')))
           .by(coalesce(__.values('last_donation_date'),    __.constant('')))
           .by(coalesce(__.values('cycle_of_donations'),    __.constant(90)))
           .by(coalesce(__.values('consecutive_declines'),  __.constant(0)))
"""


def kag_match_bridge(bridge_uuid: str, transfusion_date: str, top_n: int = 5) -> Optional[list]:
    """
    Primary: DONATED_FOR (bridge history donors).
    Fallback: DISTANCE_TO (proximity donors).
    Returns ML-scored candidates or None if Neptune unavailable.
    """
    q_primary = f"""
        g.V().has('Bridge','kag_id','{bridge_uuid}').as('bridge')
         .in('DONATED_FOR').hasLabel('Donor')
            .has('eligibility_status','eligible')
            .has('active_status','Active')
         .or(
            __.not(__.has('next_eligible_date')),
            __.has('next_eligible_date', P.lte('{transfusion_date}'))
         )
         .project({_DONOR_PROJECT},'distance_km')
           {_DONOR_BY}
           .by(__.outE('DONATED_FOR').where(__.inV().has('kag_id','{bridge_uuid}'))
                 .values('distance_km').fold().coalesce(__.unfold(), __.constant(50.0)))
    """

    q_fallback = f"""
        g.V().has('Bridge','kag_id','{bridge_uuid}').as('bridge')
         .in('DISTANCE_TO').hasLabel('Donor')
            .has('eligibility_status','eligible')
            .has('active_status','Active')
         .or(
            __.not(__.has('next_eligible_date')),
            __.has('next_eligible_date', P.lte('{transfusion_date}'))
         )
         .project({_DONOR_PROJECT},'distance_km')
           {_DONOR_BY}
           .by(__.outE('DISTANCE_TO').where(__.inV().has('kag_id','{bridge_uuid}'))
                 .values('distance_km').fold().coalesce(__.unfold(), __.constant(50.0)))
         .limit(100)
    """

    candidates = _run(q_primary)
    source = "DONATED_FOR"
    if candidates is None:
        return None
    if not candidates:
        candidates = _run(q_fallback) or []
        source = "DISTANCE_TO"

    log.info(f"Neptune KAG: {len(candidates)} raw candidates via {source} for bridge {bridge_uuid[:8]}")
    return _ml_score_and_rank(candidates, top_n, source, transfusion_date)


def kag_match_blood_group(blood_group: str, transfusion_date: str,
                           patient_lat: float, patient_lon: float,
                           top_n: int = 5) -> Optional[list]:
    """MEMBER_OF traversal from BloodGroup vertex — ML scored."""
    q = f"""
        g.V().has('BloodGroup','name','{blood_group}')
         .in('MEMBER_OF').hasLabel('Donor')
            .has('eligibility_status','eligible')
            .has('active_status','Active')
         .or(
            __.not(__.has('next_eligible_date')),
            __.has('next_eligible_date', P.lte('{transfusion_date}'))
         )
         .project({_DONOR_PROJECT},'latitude','longitude')
           {_DONOR_BY}
           .by(coalesce(__.values('latitude'),  __.constant(17.385)))
           .by(coalesce(__.values('longitude'), __.constant(78.487)))
         .limit(200)
    """

    candidates = _run(q)
    if candidates is None:
        return None

    # Compute distance_km from cluster coordinates
    from backend.services.scorer import haversine
    for c in candidates:
        lat = float(c.get("latitude") or 17.385)
        lon = float(c.get("longitude") or 78.487)
        c["distance_km"] = round(haversine(lat, lon, patient_lat, patient_lon), 2)

    log.info(f"Neptune KAG: {len(candidates)} raw candidates via MEMBER_OF for {blood_group}")
    return _ml_score_and_rank(candidates, top_n, "MEMBER_OF", transfusion_date)


_TYPE_SCORE = {"Regular Donor": 1.0, "One-Time Donor": 0.6, "Other": 0.3}

def _kag_score(c: dict, transfusion_date: str) -> float:
    """PRD §5.4 hand-weighted KAG formula — primary ranking signal."""
    import math
    dtd   = float(c.get("donations_till_date") or 0)
    ratio = float(c.get("calls_to_donations_ratio") or 0)
    dist  = float(c.get("distance_km") or 50)
    ned   = str(c.get("next_eligible_date") or "")
    dtype = str(c.get("donor_type") or "Other")

    reliability  = min(1.0, math.log1p(dtd) / math.log1p(12))
    engagement   = min(1.0, 1.0 / (ratio + 0.1))
    active_bonus = 1.0  # already hard-gated by Neptune
    proximity    = max(0.0, 1.0 - dist / 100.0)
    type_bonus   = _TYPE_SCORE.get(dtype, 0.3)
    timing       = 1.0 if (not ned or ned <= transfusion_date) else 0.0

    return round(
        0.25 * reliability + 0.20 * engagement + 0.20 * active_bonus +
        0.15 * proximity   + 0.10 * type_bonus  + 0.10 * timing, 4
    )


def _ml_score_and_rank(candidates: list, top_n: int, source: str, transfusion_date: str = "") -> list:
    """
    Primary ranking: KAG §5.4 formula.
    Tiebreaker: DonorRankingModel ml_score.
    ChurnRiskModel adds churn_risk + needs_reengagement annotation.
    """
    from backend.services.ml_engine import score_candidates

    # Step 1 — KAG score (primary)
    for c in candidates:
        c["score"] = _kag_score(c, transfusion_date)

    # Step 2 — ML scores (tiebreaker + churn annotation)
    # score_candidates sorts by ml_score; we override the sort after
    score_candidates(candidates)

    # Step 3 — Sort: KAG score primary, ml_score tiebreaker
    candidates.sort(key=lambda x: (x["score"], x.get("ml_score", 0)), reverse=True)

    for c in candidates:
        c["tier"]   = "Tier1" if c["score"] >= 0.60 else "Tier2" if c["score"] >= 0.40 else "Reserve"
        c["source"] = "neptune_kag+ml"

    top = candidates[:top_n]
    log.info(
        f"KAG+ML scored {len(candidates)} → top {len(top)} | source={source} | "
        f"top score={top[0]['score']} ml={top[0].get('ml_score','?')} churn={top[0].get('churn_risk','?')}"
    )
    return top


def supply_check() -> Optional[dict]:
    """Blood group supply check from Neptune graph."""
    q = """
        g.V().hasLabel('Donor')
         .has('eligibility_status','eligible')
         .has('active_status','Active')
         .groupCount().by('blood_group')
    """
    result = _run(q)
    if result and result[0]:
        thresholds = {"O Negative": 30, "A Negative": 15, "AB Negative": 10, "Bombay Blood Group": 5}
        out = {}
        for bg, count in result[0].items():
            threshold = thresholds.get(bg, 0)
            out[bg] = {
                "count": count,
                "status": "P0" if bg == "Bombay Blood Group" else
                          ("ALERT" if threshold and count < threshold else "OK")
            }
        return out
    return None
