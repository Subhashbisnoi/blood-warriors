from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from backend.database import get_db
from backend.services.claude_service import chat_with_donor_sync

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _is_uuid(val: str) -> bool:
    import uuid
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False


class ChatRequest(BaseModel):
    user_id: str
    message: str
    flow: str = "outreach"
    session_id: Optional[str] = None


@router.post("")
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    donor_profile = {}

    # Only query DB if user_id looks like a real UUID
    if _is_uuid(req.user_id):
        row = db.execute(text("""
            SELECT u.blood_group, dp.donor_type, dp.donations_till_date, dp.next_eligible_date
            FROM users u
            LEFT JOIN donor_profiles dp ON dp.user_id = u.id
            WHERE u.id = :uid
            LIMIT 1
        """), {"uid": req.user_id}).mappings().first()
        if row:
            donor_profile = dict(row)

    # Load conversation history (last 6 messages)
    history = []
    if req.session_id and _is_uuid(req.session_id):
        history_rows = db.execute(text("""
            SELECT role, content FROM conversation_messages
            WHERE session_id = :sid
            ORDER BY created_at DESC
            LIMIT 6
        """), {"sid": req.session_id}).mappings().all()
        history = [{"role": r["role"], "content": r["content"]} for r in reversed(history_rows)]

    result = chat_with_donor_sync(
        user_id=req.user_id,
        message=req.message,
        history=history,
        donor_profile=donor_profile,
        flow=req.flow,
    )

    # Persist messages
    session_id = req.session_id
    try:
        from uuid import uuid4
        if not session_id:
            session_id = str(uuid4())
            db.execute(text("""
                INSERT INTO conversation_sessions (session_id, user_id, flow, language)
                VALUES (:sid, :uid, :flow, :lang)
            """), {"sid": session_id, "uid": req.user_id, "flow": req.flow, "lang": result.get("language", "English")})

        db.execute(text("""
            INSERT INTO conversation_messages (message_id, session_id, role, content)
            VALUES (:mid1, :sid, 'user', :content)
        """), {"mid1": str(uuid4()), "sid": session_id, "content": req.message})
        db.execute(text("""
            INSERT INTO conversation_messages (message_id, session_id, role, content, intent)
            VALUES (:mid2, :sid, 'assistant', :content, :intent)
        """), {"mid2": str(uuid4()), "sid": session_id, "content": result["reply"], "intent": result.get("intent")})
        db.commit()
    except Exception:
        db.rollback()

    return {**result, "session_id": session_id}


@router.get("/{user_id}/history")
def get_history(user_id: str, limit: int = 20, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT cm.role, cm.content, cm.created_at, cm.intent
        FROM conversation_messages cm
        JOIN conversation_sessions cs ON cs.session_id = cm.session_id
        WHERE cs.user_id = :uid
        ORDER BY cm.created_at DESC
        LIMIT :limit
    """), {"uid": user_id, "limit": limit}).mappings().all()
    return [dict(r) for r in reversed(rows)]
