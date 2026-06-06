import logging
import os
import uuid
import json
import shutil
from datetime import datetime, timezone
from typing import Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from backend.database import get_db
from backend.config import settings
from backend.services.ocr_engine import process_file_async

logger = logging.getLogger("bills_router")
router = APIRouter(prefix="/api/bills", tags=["bills"])

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

CATEGORIES = ["Medicines", "Fluids/Juice", "Logistics", "Food", "Equipment", "Other"]


# ── OCR ──────────────────────────────────────────────────────────────────────

_EMPTY_OCR = {
    "document_type": "bill", "invoice_number": "", "invoice_date": "", "due_date": "",
    "vendor": {"name": "", "address": "", "gstin": "", "pan": "", "phone": "", "email": ""},
    "buyer": {"name": "", "address": "", "gstin": "", "pan": ""},
    "line_items": [], "taxes": {}, "subtotal": None, "discount": None,
    "total_amount": None, "amount_in_words": "", "payment_terms": "",
    "bank_details": {"bank_name": "", "account_no": "", "ifsc": "", "branch": ""},
    "notes": "", "raw_fields": {},
}

@router.post("/ocr")
async def ocr_receipt(file: UploadFile = File(...)):
    """Run GPT-4o vision OCR on a medical bill image or PDF."""
    logger.info("[ocr] request received: filename='%s' content_type='%s'", file.filename, file.content_type)

    if not settings.OPENAI_API_KEY:
        logger.warning("[ocr] OPENAI_API_KEY is not set — returning empty OCR")
        return _EMPTY_OCR

    logger.info("[ocr] API key present (prefix: %s), proceeding", settings.OPENAI_API_KEY[:10])
    file_bytes = await file.read()
    filename = file.filename or "upload"
    mime = file.content_type or "application/octet-stream"
    logger.info("[ocr] file read: %d bytes, mime='%s'", len(file_bytes), mime)

    try:
        result = await process_file_async(file_bytes, filename, mime)
        logger.info("[ocr] extraction complete — vendor='%s' total=%s items=%d",
                    (result.get("vendor") or {}).get("name", ""), result.get("total_amount"),
                    len(result.get("line_items") or []))
        return result
    except Exception as e:
        import traceback
        logger.error("[ocr] extraction failed: %s\n%s", e, traceback.format_exc())
        return {**_EMPTY_OCR, "_ocr_error": str(e)}


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

    log_list = [
        {"action": r["action"], "actor_name": r["actor_name"], "comment": r["comment"],
         "at": r["created_at"].isoformat() if r["created_at"] else None}
        for r in logs
    ]
    result = _serialize(row, approval_log=log_list)
    return result


# ── Ingest (full OCR payload → bill) ─────────────────────────────────────────

class IngestRequest(BaseModel):
    payload: Dict[str, Any]
    company_id: Optional[str] = None

@router.post("/ingest")
def ingest_bill(req: IngestRequest, db: Session = Depends(get_db)):
    """Accept full OCR-extracted payload and create a bill record."""
    p = req.payload
    vendor = p.get("vendor") or {}
    if isinstance(vendor, str):
        vendor_name = vendor
    else:
        vendor_name = vendor.get("name") or p.get("vendor_name") or ""

    bill_number  = p.get("invoice_number") or p.get("bill_number") or ""
    raw_date     = p.get("invoice_date") or p.get("bill_date") or ""
    total_amount = p.get("total_amount") or p.get("amount")
    category     = p.get("category") or "Other"
    description  = p.get("notes") or p.get("description") or ""
    uploaded_by  = p.get("_uploaded_by_name") or "Volunteer"

    # Normalize date to YYYY-MM-DD
    parsed_date = None
    if raw_date:
        for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
            try:
                from datetime import datetime as _dt
                parsed_date = _dt.strptime(raw_date, fmt).date()
                break
            except ValueError:
                pass

    if category not in CATEGORIES:
        category = "Other"

    bill_id = str(uuid.uuid4())
    db.execute(text("""
        INSERT INTO medical_bills
            (id, bill_number, vendor_name, bill_date, amount, category,
             description, status, uploaded_by)
        VALUES
            (:id, :bill_number, :vendor_name, :bill_date, :amount, :category,
             :description, 'pending', :uploaded_by)
    """), {
        "id": bill_id,
        "bill_number": bill_number or None,
        "vendor_name": vendor_name or None,
        "bill_date": parsed_date,
        "amount": float(total_amount) if total_amount is not None else None,
        "category": category,
        "description": description or None,
        "uploaded_by": uploaded_by,
    })
    db.execute(text("""
        INSERT INTO bill_approval_log (id, bill_id, action, actor_name, comment)
        VALUES (gen_random_uuid(), :bill_id, 'submit', :actor, 'Bill submitted for approval')
    """), {"bill_id": bill_id, "actor": uploaded_by})

    # Save line_items to inventory
    line_items = p.get("line_items") or []
    for item in line_items:
        if not item.get("description"):
            continue
        item_cat = p.get("category") or "Other"
        if item_cat not in CATEGORIES:
            item_cat = "Other"
        db.execute(text("""
            INSERT INTO inventory_items (bill_id, item_name, description, category, quantity, unit, unit_price, total_amount, hsn_sac)
            VALUES (:bid, :name, :desc, :cat, :qty, :unit, :up, :ta, :hsn)
        """), {
            "bid": bill_id,
            "name": item.get("description") or "",
            "desc": item.get("description"),
            "cat": item_cat,
            "qty": item.get("quantity"),
            "unit": item.get("unit"),
            "up": item.get("rate") or item.get("unit_price"),
            "ta": item.get("amount") or item.get("line_total"),
            "hsn": item.get("hsn_sac"),
        })

    db.commit()
    return {"invoice_id": bill_id, "status": "pending"}


# ── Generic action endpoint ───────────────────────────────────────────────────

class ActionRequest(BaseModel):
    action: str
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    comment: Optional[str] = None

@router.post("/{bill_id}/action")
def bill_action(bill_id: str, req: ActionRequest, db: Session = Depends(get_db)):
    row = db.execute(text("SELECT status FROM medical_bills WHERE id = :id"), {"id": bill_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")

    action = req.action.lower()
    actor  = req.actor_name or "Admin"
    comment = req.comment or action.capitalize()

    if action in ("approve", "submit"):
        if action == "approve":
            db.execute(text("""
                UPDATE medical_bills SET status='approved', approved_by=:actor, approved_at=NOW() WHERE id=:id
            """), {"actor": actor, "id": bill_id})
            # If no inventory items yet, add a placeholder from the bill itself
            existing = db.execute(text("SELECT COUNT(*) FROM inventory_items WHERE bill_id=:id"), {"id": bill_id}).scalar()
            if not existing:
                bill_row = db.execute(text("SELECT vendor_name, amount, category, description FROM medical_bills WHERE id=:id"), {"id": bill_id}).mappings().first()
                if bill_row and bill_row["description"]:
                    cat = bill_row["category"] if bill_row["category"] in CATEGORIES else "Other"
                    db.execute(text("""
                        INSERT INTO inventory_items (bill_id, item_name, category, total_amount)
                        VALUES (:bid, :name, :cat, :amt)
                    """), {"bid": bill_id, "name": bill_row["description"] or bill_row["vendor_name"] or "Medical Supply", "cat": cat, "amt": bill_row["amount"]})
            new_status = "APPROVED"
        else:
            new_status = "PENDING_APPROVER"  # submit is a no-op
    elif action == "reject" or action == "send_back":
        db.execute(text("""
            UPDATE medical_bills SET status='rejected', rejection_note=:note, approved_by=:actor, approved_at=NOW() WHERE id=:id
        """), {"note": comment, "actor": actor, "id": bill_id})
        new_status = "REJECTED"
    else:
        new_status = _STATUS_MAP.get(row["status"], row["status"].upper())

    db.execute(text("""
        INSERT INTO bill_approval_log (id, bill_id, action, actor_name, comment)
        VALUES (gen_random_uuid(), :bill_id, :action, :actor, :comment)
    """), {"bill_id": bill_id, "action": action, "actor": actor, "comment": comment})
    db.commit()
    return {"status": new_status, "bill_id": bill_id}


# ── Update bill ───────────────────────────────────────────────────────────────

@router.put("/{bill_id}")
def update_bill(bill_id: str, body: Dict[str, Any], db: Session = Depends(get_db)):
    row = db.execute(text("SELECT id FROM medical_bills WHERE id = :id"), {"id": bill_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")

    vendor = body.get("vendor") or {}
    vendor_name = vendor.get("name") if isinstance(vendor, dict) else None
    updates: Dict[str, Any] = {}
    if vendor_name is not None:
        updates["vendor_name"] = vendor_name
    if body.get("vendor_name") is not None:
        updates["vendor_name"] = body["vendor_name"]
    if body.get("total_amount") is not None:
        updates["amount"] = body["total_amount"]
    if body.get("category") is not None:
        cat = body["category"]
        updates["category"] = cat if cat in CATEGORIES else "Other"
    if body.get("notes") is not None:
        updates["description"] = body["notes"]

    raw_date = body.get("invoice_date") or body.get("bill_date")
    if raw_date:
        for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                from datetime import datetime as _dt
                updates["bill_date"] = _dt.strptime(raw_date, fmt).date()
                break
            except ValueError:
                pass

    if updates:
        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        updates["id"] = bill_id
        db.execute(text(f"UPDATE medical_bills SET {set_clause} WHERE id = :id"), updates)
        db.commit()
    return {"status": "updated"}


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

_STATUS_MAP = {
    "pending":  "PENDING_APPROVER",
    "approved": "APPROVED",
    "rejected": "REJECTED",
    "draft":    "DRAFT",
}

# 2-step chain: Volunteer uploads → Admin approves
CHAIN_STEPS = [
    {"step": 1, "label": "Pending Admin Approval", "role": "admin"},
    {"step": 2, "label": "Approved",               "role": "admin"},
]

def _serialize(r, approval_log=None) -> dict:
    bill_id = str(r["id"])
    vendor_name = r.get("vendor_name") or ""
    raw_status = (r.get("status") or "pending").lower()
    status = _STATUS_MAP.get(raw_status, raw_status.upper())

    # Build chain entries from approval_log
    chain = []
    if approval_log:
        for i, log in enumerate(approval_log):
            action = (log.get("action") or "").lower()
            chain.append({
                "id": i + 1,
                "step": 1 if action in ("submit", "submitted") else 2,
                "actor_role": None,
                "actor_name": log.get("actor_name") or log.get("actor"),
                "action": action,
                "comment": log.get("comment"),
                "created_at": log.get("at") or (log["created_at"].isoformat() if log.get("created_at") else None),
            })

    return {
        "id": bill_id,
        "invoice_id": bill_id,
        "bill_number": r.get("bill_number"),
        "invoice_number": r.get("bill_number"),
        "vendor_name": vendor_name,
        "vendor": {"name": vendor_name, "gstn": None, "gstin": "", "pan": "", "address": "", "phone": "", "email": ""},
        "buyer": {"name": "", "gstn": ""},
        "bill_date": r["bill_date"].isoformat() if r.get("bill_date") else None,
        "invoice_date": r["bill_date"].isoformat() if r.get("bill_date") else None,
        "created_at": r["uploaded_at"].isoformat() if r.get("uploaded_at") else None,
        "due_date": None,
        "amount": float(r["amount"]) if r.get("amount") is not None else None,
        "total_amount": float(r["amount"]) if r.get("amount") is not None else None,
        "subtotal": None,
        "tax_amount": None,
        "amount_paid": None,
        "outstanding_amount": None,
        "discount_amount": None,
        "currency_code": "INR",
        "payment_terms_days": None,
        "category": r.get("category"),
        "description": r.get("description"),
        "notes": r.get("description"),
        "status": status,
        "status_label": None,
        "allowed_roles": ["admin", "approver", "accountant"],
        "allowed_usernames": None,
        "uploaded_by": r.get("uploaded_by"),
        "uploaded_by_name": r.get("uploaded_by"),
        "uploaded_by_role": "member",
        "uploaded_at": r["uploaded_at"].isoformat() if r.get("uploaded_at") else None,
        "approved_by": r.get("approved_by"),
        "approved_at": r["approved_at"].isoformat() if r.get("approved_at") else None,
        "rejection_note": r.get("rejection_note"),
        "receipt_filename": r.get("receipt_filename"),
        "receipt_original_name": r.get("receipt_original_name"),
        "payment_status": "UNPAID",
        "priority": None,
        "manual_priority": None,
        "department": None,
        "gstin": "",
        "tds_amount": None,
        "tds_status": None,
        "tds_section_code": None,
        "tds_rate": None,
        "tds_base_amount": None,
        "doc_url": None,
        "upload_id": None,
        "stg_bill_id": None,
        "original_file": None,
        "line_items": [],
        "taxes": {},
        "bank_details": {},
        "chain": chain,
        "attachments": [],
    }
