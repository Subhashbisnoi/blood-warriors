import json
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db

router = APIRouter(prefix="/api/outreach", tags=["outreach"])


@router.get("/{match_id}")
def get_outreach_events(match_id: str, db: Session = Depends(get_db)):
    # Pull system_events for timeline
    rows = db.execute(text("""
        SELECT event_type, payload, created_at
        FROM system_events
        WHERE source_entity = 'match_request'
          AND source_entity_id = :mid
        ORDER BY created_at ASC
    """), {"mid": match_id}).mappings().all()

    events = []
    for r in rows:
        raw = r["payload"]
        if isinstance(raw, dict):
            payload = raw
        elif isinstance(raw, str):
            try:
                payload = json.loads(raw)
            except Exception:
                payload = {}
        else:
            payload = {}
        events.append({
            "event_type": r["event_type"],
            "timestamp": r["created_at"].isoformat() if r["created_at"] else None,
            **payload,
        })

    match_row = db.execute(text("""
        SELECT status FROM match_requests WHERE id = :id
    """), {"id": match_id}).scalar()

    # Pull full outreach_log audit rows for this match
    log_rows = db.execute(text("""
        SELECT
            id, donor_user_id, channel, message_body, sent_at,
            response, response_text, response_at, response_latency_secs,
            message_template AS twilio_sid
        FROM outreach_log
        WHERE match_request_id = :mid
        ORDER BY sent_at ASC
    """), {"mid": match_id}).mappings().all()

    audit_log = []
    for r in log_rows:
        audit_log.append({
            "log_id": str(r["id"]),
            "donor_user_id": str(r["donor_user_id"]) if r["donor_user_id"] else None,
            "channel": r["channel"],
            "message_body": r["message_body"],
            "sent_at": r["sent_at"].isoformat() if r["sent_at"] else None,
            "response": r["response"],
            "response_text": r["response_text"],
            "response_at": r["response_at"].isoformat() if r["response_at"] else None,
            "response_latency_secs": r["response_latency_secs"],
            "twilio_sid": r["twilio_sid"],
        })

    # Pull match_candidates ranked list
    candidates_rows = db.execute(text("""
        SELECT
            donor_user_id, rank, kag_score, donor_tier,
            outreach_status, contacted_at, distance_km, explanation_en
        FROM match_candidates
        WHERE match_request_id = :mid
        ORDER BY rank ASC
    """), {"mid": match_id}).mappings().all()

    candidates = []
    for r in candidates_rows:
        candidates.append({
            "donor_user_id": str(r["donor_user_id"]) if r["donor_user_id"] else None,
            "rank": r["rank"],
            "kag_score": float(r["kag_score"]) if r["kag_score"] is not None else None,
            "tier": r["donor_tier"],
            "outreach_status": r["outreach_status"],
            "contacted_at": r["contacted_at"].isoformat() if r["contacted_at"] else None,
            "distance_km": float(r["distance_km"]) if r["distance_km"] is not None else None,
            "explanation": r["explanation_en"],
        })

    return {
        "match_id": match_id,
        "status": match_row or "unknown",
        "events": events,
        "audit_log": audit_log,
        "candidates": candidates,
    }


@router.post("/webhook/twilio")
async def twilio_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Handles two Twilio webhook types:
    1. MessageStatus callback — delivery receipts (MessageSid + MessageStatus)
    2. Incoming message — donor replies YES/NO (From + Body)
    """
    form = await request.form()
    msg_sid = form.get("MessageSid", "")
    msg_status = form.get("MessageStatus", "")
    from_number = form.get("From", "").replace("whatsapp:", "")
    body_text = (form.get("Body") or "").strip()

    now = datetime.now(timezone.utc)

    # 1. Delivery status callback (sent, delivered, failed, etc.)
    if msg_sid and msg_status and not body_text:
        db.execute(text("""
            INSERT INTO system_events (event_type, source_entity, payload)
            VALUES ('twilio.delivery_status', 'outreach_log', :payload)
        """), {"payload": json.dumps({"sid": msg_sid, "status": msg_status})})
        try:
            db.commit()
        except Exception:
            db.rollback()
        return {"status": "ok"}

    # 2. Incoming donor reply
    outcome_label = "delivery_ack"
    if body_text:
        upper = body_text.upper()
        if "YES" in upper or "CONFIRM" in upper or "DONATE" in upper:
            response_enum = "CONFIRM"
            outcome_label = "confirmed"
        elif "NO" in upper or "DECLINE" in upper or "PASS" in upper:
            response_enum = "DECLINE"
            outcome_label = "declined"
        elif "STOP" in upper or "OPT OUT" in upper:
            response_enum = "OPT_OUT"
            outcome_label = "opted_out"
        else:
            response_enum = "QUESTION_LOGISTICS"
            outcome_label = "question"

        # Find the most recent unresponded outreach_log entry
        log_row = None
        if msg_sid:
            log_row = db.execute(text("""
                SELECT id, sent_at, match_request_id FROM outreach_log
                WHERE message_template = :sid AND response IS NULL
                LIMIT 1
            """), {"sid": msg_sid}).mappings().first()

        if not log_row:
            log_row = db.execute(text("""
                SELECT id, sent_at, match_request_id FROM outreach_log
                WHERE response IS NULL
                ORDER BY sent_at DESC
                LIMIT 1
            """)).mappings().first()

        match_id_for_ws = None
        if log_row:
            match_id_for_ws = str(log_row["match_request_id"]) if log_row.get("match_request_id") else None
            db.execute(text("""
                UPDATE outreach_log
                SET response = :resp,
                    response_text = :text,
                    response_at = :rat
                WHERE id = :id
            """), {
                "resp": response_enum,
                "text": body_text,
                "rat": now,
                "id": str(log_row["id"]),
            })

            # If confirmed, update match_requests status
            if response_enum == "CONFIRM" and match_id_for_ws:
                db.execute(text("""
                    UPDATE match_requests
                    SET status = 'confirmed', confirmed_at = NOW()
                    WHERE id::text = :mid AND status != 'confirmed'
                """), {"mid": match_id_for_ws})

            # Record in system_events for timeline
            db.execute(text("""
                INSERT INTO system_events (event_type, source_entity, source_entity_id, payload)
                VALUES (:etype, 'match_request', :mid, :payload)
            """), {
                "etype": f"outreach.{outcome_label}",
                "mid": match_id_for_ws,
                "payload": json.dumps({
                    "event_type": outcome_label,
                    "from": from_number,
                    "body": body_text,
                    "sid": msg_sid,
                    "parsed_response": response_enum,
                }),
            })

        # Log raw incoming for audit
        db.execute(text("""
            INSERT INTO system_events (event_type, source_entity, payload)
            VALUES ('twilio.incoming_message', 'outreach_log', :payload)
        """), {"payload": json.dumps({
            "from": from_number,
            "body": body_text,
            "sid": msg_sid,
            "parsed_response": response_enum,
            "outcome": outcome_label,
        })})

        try:
            db.commit()
        except Exception:
            db.rollback()

        # Broadcast real-time update via WebSocket
        from backend.core.websocket_manager import manager
        import asyncio
        asyncio.create_task(manager.broadcast({
            "type": "twilio_response",
            "match_id": match_id_for_ws,
            "response": response_enum,
            "outcome": outcome_label,
            "body": body_text,
            "event_type": outcome_label,
            "timestamp": now.isoformat(),
        }))

    return {"status": "ok", "parsed": outcome_label}


@router.post("/{match_id}/contact/{rank}")
def manual_contact(match_id: str, rank: int, db: Session = Depends(get_db)):
    """Send WhatsApp to rank-1 candidate; simulate for all others (saves to audit log only)."""
    from backend.services.twilio_service import send_outreach_message
    from backend.config import settings

    # Look up candidate details from system_events payload
    row = db.execute(text("""
        SELECT payload FROM system_events
        WHERE source_entity = 'match_request'
          AND source_entity_id = :mid
          AND payload::jsonb->>'candidate_rank' = :rank
        ORDER BY created_at DESC LIMIT 1
    """), {"mid": match_id, "rank": str(rank)}).mappings().first()

    blood_group = "your blood group"
    donor_name = f"Donor #{rank}"
    transfusion_date = ""
    if row:
        try:
            p = json.loads(row["payload"]) if isinstance(row["payload"], str) else row["payload"]
            blood_group = p.get("blood_group", blood_group)
            donor_name = f"Donor {p.get('user_hash', str(rank))[:6].upper()}"
            transfusion_date = p.get("transfusion_date", "")
        except Exception:
            pass

    demo_to = settings.TWILIO_DEMO_TO_NUMBER.strip()
    if rank == 1 and demo_to:
        # Only rank-1 gets a real Twilio message
        twilio_result = send_outreach_message(
            to_number=demo_to,
            donor_name=donor_name,
            blood_group=blood_group,
            transfusion_date=transfusion_date,
        )
    else:
        # All other candidates: simulate — record in audit log but don't call Twilio
        twilio_result = {"status": "simulated", "channel": "whatsapp", "sid": None}

    # Record in system_events
    payload = json.dumps({
        "candidate_rank": rank,
        "blood_group": blood_group,
        "twilio_sid": twilio_result.get("sid"),
        "channel": twilio_result.get("channel", "whatsapp"),
        "manual": True,
    })
    try:
        db.execute(text("""
            INSERT INTO system_events (event_type, source_entity, source_entity_id, payload)
            VALUES ('whatsapp_sent', 'match_request', :mid::uuid, :payload)
        """), {"mid": match_id, "payload": payload})
        db.commit()
    except Exception:
        db.rollback()
        db.execute(text("""
            INSERT INTO system_events (event_type, source_entity, payload)
            VALUES ('whatsapp_sent', 'match_request', :payload)
        """), {"payload": payload})
        try:
            db.commit()
        except Exception:
            db.rollback()

    return {
        "status": "sent",
        "match_id": match_id,
        "rank": rank,
        "twilio": twilio_result.get("status"),
        "channel": twilio_result.get("channel", "whatsapp"),
    }


@router.post("/{match_id}/confirm/{rank}")
def manual_confirm(match_id: str, rank: int, db: Session = Depends(get_db)):
    """Mark a candidate as confirmed and update match status."""
    # Update match_requests status
    try:
        db.execute(text("""
            UPDATE match_requests
            SET status = 'confirmed', confirmed_at = NOW()
            WHERE id::text = :mid
        """), {"mid": match_id})
        db.commit()
    except Exception:
        db.rollback()

    # Record confirmed event
    payload = json.dumps({"candidate_rank": rank, "manual": True})
    try:
        db.execute(text("""
            INSERT INTO system_events (event_type, source_entity, source_entity_id, payload)
            VALUES ('confirmed', 'match_request', :mid::uuid, :payload)
        """), {"mid": match_id, "payload": payload})
        db.commit()
    except Exception:
        db.rollback()
        db.execute(text("""
            INSERT INTO system_events (event_type, source_entity, payload)
            VALUES ('confirmed', 'match_request', :payload)
        """), {"payload": payload})
        try:
            db.commit()
        except Exception:
            db.rollback()

    # Send confirmation WhatsApp
    try:
        from backend.services.twilio_service import send_confirmation
        from backend.config import settings
        demo_to = settings.TWILIO_DEMO_TO_NUMBER.strip()
        if demo_to:
            send_confirmation(to_number=demo_to, donor_name=f"Donor #{rank}", blood_group="")
    except Exception:
        pass

    return {"status": "confirmed", "match_id": match_id, "rank": rank}


@router.post("/{user_id}/reengage")
def reengage_donor(user_id: str, db: Session = Depends(get_db)):
    from backend.services.twilio_service import send_reengage_message
    from backend.config import settings

    row = db.execute(text("""
        SELECT blood_group, user_id_hash, last_donation_date, inactive_trigger_comment
        FROM v_inactive_donors
        WHERE id = :uid LIMIT 1
    """), {"uid": user_id}).mappings().first() if _is_uuid(user_id) else None

    blood_group = row["blood_group"] if row else "your blood group"
    last_donation_date = row["last_donation_date"] if row else None
    inactive_trigger_comment = row["inactive_trigger_comment"] if row else None
    donor_id = (row["user_id_hash"][:6].upper() if row and row["user_id_hash"] else user_id[:6].upper())

    twilio_result = {"status": "skipped"}
    demo_to = settings.TWILIO_DEMO_TO_NUMBER.strip()
    if demo_to:
        twilio_result = send_reengage_message(
            to_number=demo_to,
            blood_group=blood_group,
            donor_id=donor_id,
            last_donation_date=last_donation_date,
            inactive_trigger_comment=inactive_trigger_comment,
        )

    # Save to outreach_log
    try:
        db.execute(text("""
            INSERT INTO outreach_log (id, donor_user_id, channel, message_body, sent_at)
            VALUES (:id, :donor_id::uuid, :channel, :body, NOW())
        """), {
            "id": str(uuid4()),
            "donor_id": user_id if _is_uuid(user_id) else None,
            "channel": twilio_result.get("channel", "whatsapp"),
            "body": twilio_result.get("body", ""),
        })
        db.commit()
    except Exception:
        db.rollback()

    db.execute(text("""
        INSERT INTO system_events (event_type, source_entity, payload)
        VALUES ('outreach.reengage.triggered', 'donor', :payload)
    """), {"payload": json.dumps({"flow": "FLOW_D", "user_id": user_id, "twilio": twilio_result.get("status")})})
    try:
        db.commit()
    except Exception:
        db.rollback()

    return {"status": "re-engagement sent", "user_id": user_id, "twilio": twilio_result}


def _is_uuid(val: str) -> bool:
    import uuid
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False
