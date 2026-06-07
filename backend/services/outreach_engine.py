import asyncio
import random
import re
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)

def _as_uuid(val: str) -> Optional[str]:
    return val if val and _UUID_RE.match(val) else None
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.core.websocket_manager import manager
from backend.config import settings
from backend.services.twilio_service import (
    send_outreach_message,
    send_followup_message,
    send_confirmation,
)

OUTCOMES = ["confirmed", "declined", "no_response"]
WEIGHTS = [0.45, 0.20, 0.35]

_OUTCOME_TO_RESPONSE = {
    "confirmed": "CONFIRM",
    "declined": "DECLINE",
    "no_response": "NO_RESPONSE",
    "escalated": "NO_RESPONSE",
}

_SIMULATED_REPLIES = {
    "confirmed": "YES, I can donate",
    "declined": "NO, not available right now",
    "no_response": None,
}


def _demo_to() -> str:
    return settings.TWILIO_DEMO_TO_NUMBER.strip()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _insert_outreach_log(
    db: Session,
    match_id: str,
    bridge_id: Optional[str],
    donor_id: str,
    channel: str,
    message_body: str,
    twilio_sid: str,
    sent_at: datetime,
) -> str:
    log_id = str(uuid4())
    try:
        db.execute(text("""
            INSERT INTO outreach_log (
                id, donor_user_id, bridge_id, match_request_id,
                channel, message_template, message_body, sent_at
            ) VALUES (
                :id, CAST(:donor_id AS uuid), CAST(:bridge_id AS uuid), CAST(:match_id AS uuid),
                :channel, :sid, :body, :sent_at
            )
        """), {
            "id": log_id,
            "donor_id": _as_uuid(donor_id),
            "bridge_id": _as_uuid(bridge_id),
            "match_id": match_id,
            "channel": channel,
            "sid": twilio_sid,
            "body": message_body,
            "sent_at": sent_at,
        })
        db.commit()
    except Exception:
        db.rollback()
    return log_id


def _update_outreach_log(
    db: Session,
    log_id: str,
    outcome: str,
    response_text: Optional[str],
    response_at: datetime,
    sent_at: datetime,
):
    try:
        latency = int((response_at - sent_at).total_seconds()) if outcome != "no_response" else None
        db.execute(text("""
            UPDATE outreach_log
            SET response = :resp,
                response_text = :text,
                response_at = :rat,
                response_latency_secs = :latency
            WHERE id = :id
        """), {
            "resp": _OUTCOME_TO_RESPONSE.get(outcome, "NO_RESPONSE"),
            "text": response_text,
            "rat": response_at if outcome != "no_response" else None,
            "latency": latency,
            "id": log_id,
        })
        db.commit()
    except Exception:
        db.rollback()


def _insert_match_candidate(db: Session, match_id: str, donor_id: str, candidate: dict, rank: int):
    try:
        db.execute(text("""
            INSERT INTO match_candidates (
                id, match_request_id, donor_user_id, rank,
                kag_score, donor_tier, reliability_score, engagement_score,
                active_bonus, proximity_score, type_bonus, timing_score,
                distance_km, explanation_en
            ) VALUES (
                :id, CAST(:mid AS uuid), CAST(:donor_id AS uuid), :rank,
                :kag_score, :tier, :reliability, :engagement,
                :active_bonus, :proximity, :type_bonus, :timing,
                :distance_km, :explanation
            )
            ON CONFLICT DO NOTHING
        """), {
            "id": str(uuid4()),
            "mid": match_id,
            "donor_id": _as_uuid(donor_id),
            "rank": rank,
            "kag_score": candidate.get("score") or candidate.get("kag_score"),
            "tier": candidate.get("tier") or candidate.get("donor_tier") or "Reserve",
            "reliability": candidate.get("reliability_score"),
            "engagement": candidate.get("engagement_score"),
            "active_bonus": candidate.get("active_bonus"),
            "proximity": candidate.get("proximity_score"),
            "type_bonus": candidate.get("type_bonus"),
            "timing": candidate.get("timing_score"),
            "distance_km": candidate.get("distance_km"),
            "explanation": candidate.get("explanation"),
        })
        db.commit()
    except Exception:
        db.rollback()


def _update_match_candidate_status(db: Session, match_id: str, donor_id: str, outcome: str):
    try:
        db.execute(text("""
            UPDATE match_candidates
            SET outreach_status = :status, contacted_at = NOW()
            WHERE match_request_id = CAST(:mid AS uuid) AND donor_user_id = CAST(:donor_id AS uuid)
        """), {
            "status": _OUTCOME_TO_RESPONSE.get(outcome, "NO_RESPONSE"),
            "mid": match_id,
            "donor_id": donor_id,
        })
        db.commit()
    except Exception:
        db.rollback()


def _log_event(db: Session, match_id: str, data: dict):
    try:
        import json
        db.execute(text("""
            INSERT INTO system_events (event_type, source_entity, source_entity_id, payload)
            VALUES (:etype, 'match_request', :mid, :payload)
        """), {
            "etype": f"outreach.{data.get('event_type', 'unknown')}",
            "mid": match_id,
            "payload": json.dumps(data),
        })
        db.commit()
    except Exception:
        db.rollback()


async def _poll_for_response(db: Session, log_id: str, timeout_secs: int) -> str:
    """Poll outreach_log for a real webhook response. Falls back to no_response on timeout."""
    poll_every = min(3, max(1, timeout_secs // 10))
    waited = 0
    while waited < timeout_secs:
        await asyncio.sleep(poll_every)
        waited += poll_every
        db.expire_all()
        resp = db.execute(text(
            "SELECT response FROM outreach_log WHERE id = :id"
        ), {"id": log_id}).scalar()
        if resp == "CONFIRM":
            return "confirmed"
        elif resp in ("DECLINE", "OPT_OUT"):
            return "declined"
    return "no_response"


async def simulate_outreach_escalation(
    match_id: str,
    candidates: list[dict],
    db_factory,
    transfusion_date: str = "",
):
    step_secs = settings.OUTREACH_STEP_SECONDS
    db: Session = db_factory()
    demo_to = _demo_to()

    try:
        # Fetch bridge_id for this match
        match_row = db.execute(text(
            "SELECT bridge_id FROM match_requests WHERE id = :id"
        ), {"id": match_id}).mappings().first()
        bridge_id = str(match_row["bridge_id"]) if match_row and match_row.get("bridge_id") else None

        session_id = str(uuid4())
        db.execute(text("""
            INSERT INTO system_events (event_type, source_entity, source_entity_id, payload)
            VALUES ('outreach.session.started', 'match_request', :match_id, :payload)
        """), {"match_id": match_id, "payload": f'{{"session_id": "{session_id}"}}'})
        db.commit()

        # Pre-insert all candidates into match_candidates
        for rank, candidate in enumerate(candidates, start=1):
            donor_id = str(candidate.get("donor_id", ""))
            _insert_match_candidate(db, match_id, donor_id, candidate, rank)

        confirmed = False
        for rank, candidate in enumerate(candidates, start=1):
            donor_id = str(candidate.get("donor_id", ""))
            user_hash = str(candidate.get("user_id_hash", ""))[:8]
            blood_group = candidate.get("blood_group", "?")
            donor_name = f"Donor {user_hash.upper()}"

            # ── Send WhatsApp/SMS ────────────────────────────────────────────
            twilio_result = {"status": "skipped", "body": "", "sid": ""}
            if demo_to and rank == 1:
                twilio_result = send_outreach_message(
                    to_number=demo_to,
                    donor_name=donor_name,
                    blood_group=blood_group,
                    transfusion_date=transfusion_date or "soon",
                )
            else:
                # Simulated message body for non-demo candidates
                twilio_result["body"] = (
                    f"🩸 Blood Warriors Alert — Hi {donor_name}, a {blood_group} patient needs blood "
                    f"(transfusion {transfusion_date}). Reply YES/NO."
                )

            channel = twilio_result.get("channel", "whatsapp")
            sent_at = _now()
            event_id = str(uuid4())
            event_data = {
                "type": "outreach_event",
                "match_id": match_id,
                "session_id": session_id,
                "event_id": event_id,
                "candidate_rank": rank,
                "user_hash": user_hash,
                "blood_group": blood_group,
                "event_type": "whatsapp_sent",
                "twilio_sid": twilio_result.get("sid", ""),
                "timestamp": sent_at.isoformat(),
            }
            await manager.broadcast(event_data)
            _log_event(db, match_id, event_data)

            # Audit: log message sent
            outreach_log_id = _insert_outreach_log(
                db, match_id, bridge_id, donor_id,
                channel, twilio_result.get("body", ""),
                twilio_result.get("sid", ""), sent_at,
            )

            # ── Wait for real reply (rank 1) or simulate (others) ───────────
            if rank == 1:
                outcome = await _poll_for_response(db, outreach_log_id, step_secs)
            else:
                await asyncio.sleep(step_secs)
                outcome = random.choices(OUTCOMES, WEIGHTS)[0]

            if outcome == "no_response" and demo_to and rank == 1:
                followup_result = send_followup_message(
                    to_number=demo_to,
                    donor_name=donor_name,
                    blood_group=blood_group,
                )
                followup_sent_at = _now()
                followup_data = {
                    **event_data,
                    "event_type": "followup_sent",
                    "event_id": str(uuid4()),
                    "twilio_sid": followup_result.get("sid", ""),
                    "timestamp": followup_sent_at.isoformat(),
                }
                await manager.broadcast(followup_data)
                _log_event(db, match_id, followup_data)
                followup_log_id = _insert_outreach_log(
                    db, match_id, bridge_id, donor_id,
                    followup_result.get("channel", "whatsapp"),
                    followup_result.get("body", ""),
                    followup_result.get("sid", ""), followup_sent_at,
                )
                outcome = await _poll_for_response(db, followup_log_id, step_secs)

            # ── Log outcome ──────────────────────────────────────────────────
            response_at = _now()
            response_data = {
                **event_data,
                "event_type": outcome,
                "event_id": str(uuid4()),
                "timestamp": response_at.isoformat(),
            }
            await manager.broadcast(response_data)
            _log_event(db, match_id, response_data)

            # Audit: update outreach_log with response
            _update_outreach_log(
                db, outreach_log_id, outcome,
                _SIMULATED_REPLIES.get(outcome),
                response_at, sent_at,
            )
            _update_match_candidate_status(db, match_id, donor_id, outcome)

            if outcome == "confirmed":
                confirmed = True
                if demo_to and rank == 1:
                    conf_result = send_confirmation(to_number=demo_to, donor_name=donor_name)
                    conf_at = _now()
                    _insert_outreach_log(
                        db, match_id, bridge_id, donor_id,
                        conf_result.get("channel", "whatsapp"),
                        conf_result.get("body", ""),
                        conf_result.get("sid", ""), conf_at,
                    )

                db.execute(text(
                    "UPDATE match_requests SET status = 'confirmed', confirmed_at = NOW() WHERE id = :id"
                ), {"id": match_id})
                db.commit()
                await manager.broadcast({"type": "match_confirmed", "match_id": match_id, "by_rank": rank})
                break

            await asyncio.sleep(step_secs)

        if not confirmed:
            db.execute(text(
                "UPDATE match_requests SET status = 'escalated', escalated_at = NOW() WHERE id = :id"
            ), {"id": match_id})
            db.execute(text("""
                INSERT INTO admin_alerts (alert_type, severity, match_request_id, message)
                VALUES ('match_escalation', 'P1', :mid, :msg)
            """), {"mid": match_id, "msg": f"Match {match_id[:8]}... exhausted all candidates without confirmation."})
            db.commit()
            await manager.broadcast({"type": "match_escalated", "match_id": match_id})
    finally:
        db.close()
