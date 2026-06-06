import os
import uuid
import json
import base64
import shutil
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db
from backend.config import settings

router = APIRouter(prefix="/api/bills", tags=["bills"])

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

CATEGORIES = ["Medicines", "Fluids/Juice", "Logistics", "Food", "Equipment", "Other"]


# ── OCR ──────────────────────────────────────────────────────────────────────

@router.post("/ocr")
async def ocr_receipt(file: UploadFile = File(...)):
    """Run OCR on a receipt image/PDF and return extracted fields."""
    if not settings.OPENAI_API_KEY:
        return {"vendor_name": "", "amount": None, "bill_date": "", "bill_number": "", "description": ""}

    content = await file.read()
    mime = file.content_type or "image/jpeg"

    # For PDFs we can't do vision OCR easily — return empty and let user fill
    if "pdf" in mime.lower():
        return {"vendor_name": "", "amount": None, "bill_date": "", "bill_number": "", "description": ""}

    b64 = base64.b64encode(content).decode("utf-8")

    try:
        import openai
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=400,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extract from this medical/expense receipt: "
                            "vendor_name, total_amount (number only), bill_date (YYYY-MM-DD), "
                            "bill_number, and a short description of what was purchased. "
                            "Reply ONLY with valid JSON: "
                            "{\"vendor_name\": \"\", \"amount\": 0, \"bill_date\": \"\", "
                            "\"bill_number\": \"\", \"description\": \"\"}"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "low"},
                    },
                ],
            }],
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
            if raw.endswith("```"):
                raw = raw[:-3]
        return json.loads(raw)
    except Exception as e:
        return {"vendor_name": "", "amount": None, "bill_date": "", "bill_number": "", "description": "", "_ocr_error": str(e)}


# ── Upload receipt file ───────────────────────────────────────────────────────

@router.post("/upload-receipt")
async def upload_receipt(file: UploadFile = File(...)):
    """Save uploaded receipt file; return stored filename."""
    ext = os.path.splitext(file.filename or "receipt")[1] or ".bin"
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(UPLOADS_DIR, stored_name)
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)
    return {"filename": stored_name, "original_name": file.filename, "size": len(content)}


# ── Serve receipt ─────────────────────────────────────────────────────────────

@router.get("/receipt/{filename}")
def serve_receipt(filename: str):
    path = os.path.join(UPLOADS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    # Prevent path traversal
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return FileResponse(path)


# ── Create bill ───────────────────────────────────────────────────────────────

@router.post("")
def create_bill(
    vendor_name: str = Form(""),
    bill_number: str = Form(""),
    bill_date: str = Form(""),
    amount: Optional[float] = Form(None),
    category: str = Form("Other"),
    description: str = Form(""),
    uploaded_by: str = Form("Volunteer"),
    receipt_filename: str = Form(""),
    receipt_original_name: str = Form(""),
    db: Session = Depends(get_db),
):
    bill_id = str(uuid.uuid4())
    parsed_date = None
    if bill_date:
        try:
            parsed_date = datetime.strptime(bill_date, "%Y-%m-%d").date()
        except ValueError:
            pass

    db.execute(text("""
        INSERT INTO medical_bills
            (id, bill_number, vendor_name, bill_date, amount, category,
             description, status, uploaded_by, receipt_filename, receipt_original_name)
        VALUES
            (:id, :bill_number, :vendor_name, :bill_date, :amount, :category,
             :description, 'pending', :uploaded_by, :receipt_filename, :receipt_original_name)
    """), {
        "id": bill_id,
        "bill_number": bill_number or None,
        "vendor_name": vendor_name or None,
        "bill_date": parsed_date,
        "amount": amount,
        "category": category if category in CATEGORIES else "Other",
        "description": description or None,
        "uploaded_by": uploaded_by,
        "receipt_filename": receipt_filename or None,
        "receipt_original_name": receipt_original_name or None,
    })

    # Log submission
    db.execute(text("""
        INSERT INTO bill_approval_log (id, bill_id, action, actor_name, comment)
        VALUES (gen_random_uuid(), :bill_id, 'submit', :actor, 'Bill submitted for approval')
    """), {"bill_id": bill_id, "actor": uploaded_by})

    db.commit()
    return {"id": bill_id, "status": "pending"}


# ── List bills ────────────────────────────────────────────────────────────────

@router.get("")
def list_bills(
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = """
        SELECT id, bill_number, vendor_name, bill_date, amount, category,
               description, status, uploaded_by, uploaded_at,
               approved_by, approved_at, rejection_note,
               receipt_filename, receipt_original_name
        FROM medical_bills
        WHERE 1=1
    """
    params: dict = {"limit": limit}
    if status:
        q += " AND status = :status"
        params["status"] = status
    if category:
        q += " AND category = :category"
        params["category"] = category
    q += " ORDER BY uploaded_at DESC LIMIT :limit"

    rows = db.execute(text(q), params).mappings().all()
    return [_serialize(r) for r in rows]


# ── Bill detail ───────────────────────────────────────────────────────────────

@router.get("/dashboard")
def dashboard_stats(db: Session = Depends(get_db)):
    """Spend summary by category + pending count + monthly totals."""
    by_cat = db.execute(text("""
        SELECT category,
               COUNT(*) as count,
               COALESCE(SUM(amount), 0) as total
        FROM medical_bills
        WHERE status = 'approved'
        GROUP BY category
        ORDER BY total DESC
    """)).mappings().all()

    pending = db.execute(text("""
        SELECT COUNT(*) FROM medical_bills WHERE status = 'pending'
    """)).scalar() or 0

    total_approved = db.execute(text("""
        SELECT COALESCE(SUM(amount), 0) FROM medical_bills WHERE status = 'approved'
    """)).scalar() or 0

    this_month = db.execute(text("""
        SELECT COALESCE(SUM(amount), 0)
        FROM medical_bills
        WHERE status = 'approved'
          AND DATE_TRUNC('month', uploaded_at) = DATE_TRUNC('month', NOW())
    """)).scalar() or 0

    recent = db.execute(text("""
        SELECT id, bill_number, vendor_name, bill_date, amount, category,
               description, status, uploaded_by, uploaded_at,
               approved_by, approved_at, rejection_note,
               receipt_filename, receipt_original_name
        FROM medical_bills
        ORDER BY uploaded_at DESC
        LIMIT 5
    """)).mappings().all()

    return {
        "pending_count": int(pending),
        "total_approved": float(total_approved),
        "this_month": float(this_month),
        "by_category": [{"category": r["category"], "count": int(r["count"]), "total": float(r["total"])} for r in by_cat],
        "recent_bills": [_serialize(r) for r in recent],
    }


@router.get("/{bill_id}")
def get_bill(bill_id: str, db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT id, bill_number, vendor_name, bill_date, amount, category,
               description, status, uploaded_by, uploaded_at,
               approved_by, approved_at, rejection_note,
               receipt_filename, receipt_original_name
        FROM medical_bills WHERE id = :id
    """), {"id": bill_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")

    logs = db.execute(text("""
        SELECT action, actor_name, comment, created_at
        FROM bill_approval_log WHERE bill_id = :id ORDER BY created_at ASC
    """), {"id": bill_id}).mappings().all()

    result = _serialize(row)
    result["approval_log"] = [
        {"action": r["action"], "actor": r["actor_name"], "comment": r["comment"],
         "at": r["created_at"].isoformat() if r["created_at"] else None}
        for r in logs
    ]
    return result


# ── Approve / Reject ──────────────────────────────────────────────────────────

@router.post("/{bill_id}/approve")
def approve_bill(bill_id: str, db: Session = Depends(get_db)):
    row = db.execute(text("SELECT status FROM medical_bills WHERE id = :id"), {"id": bill_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Bill is already {row['status']}")

    db.execute(text("""
        UPDATE medical_bills
        SET status = 'approved', approved_by = 'Admin', approved_at = NOW()
        WHERE id = :id
    """), {"id": bill_id})

    db.execute(text("""
        INSERT INTO bill_approval_log (id, bill_id, action, actor_name, comment)
        VALUES (gen_random_uuid(), :bill_id, 'approve', 'Admin', 'Approved')
    """), {"bill_id": bill_id})

    db.commit()
    return {"status": "approved", "bill_id": bill_id}


@router.post("/{bill_id}/reject")
def reject_bill(bill_id: str, note: str = "", db: Session = Depends(get_db)):
    row = db.execute(text("SELECT status FROM medical_bills WHERE id = :id"), {"id": bill_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Bill is already {row['status']}")

    db.execute(text("""
        UPDATE medical_bills
        SET status = 'rejected', rejection_note = :note, approved_by = 'Admin', approved_at = NOW()
        WHERE id = :id
    """), {"id": bill_id, "note": note or None})

    db.execute(text("""
        INSERT INTO bill_approval_log (id, bill_id, action, actor_name, comment)
        VALUES (gen_random_uuid(), :bill_id, 'reject', 'Admin', :note)
    """), {"bill_id": bill_id, "note": note or "Rejected"})

    db.commit()
    return {"status": "rejected", "bill_id": bill_id}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(r) -> dict:
    return {
        "id": str(r["id"]),
        "bill_number": r["bill_number"],
        "vendor_name": r["vendor_name"],
        "bill_date": r["bill_date"].isoformat() if r.get("bill_date") else None,
        "amount": float(r["amount"]) if r.get("amount") is not None else None,
        "category": r["category"],
        "description": r["description"],
        "status": r["status"],
        "uploaded_by": r["uploaded_by"],
        "uploaded_at": r["uploaded_at"].isoformat() if r.get("uploaded_at") else None,
        "approved_by": r.get("approved_by"),
        "approved_at": r["approved_at"].isoformat() if r.get("approved_at") else None,
        "rejection_note": r.get("rejection_note"),
        "receipt_filename": r.get("receipt_filename"),
        "receipt_original_name": r.get("receipt_original_name"),
    }
