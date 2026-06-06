from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Any, Optional, Dict, List
from backend.database import get_db

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


# ── Add items from a bill ─────────────────────────────────────────────────────

class ItemIn(BaseModel):
    item_name: str
    description: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    unit_price: Optional[float] = None
    total_amount: Optional[float] = None
    hsn_sac: Optional[str] = None

class AddItemsRequest(BaseModel):
    bill_id: str
    items: List[ItemIn]

@router.post("/items")
def add_items(req: AddItemsRequest, db: Session = Depends(get_db)):
    # Delete existing items for this bill (idempotent re-ingest)
    db.execute(text("DELETE FROM inventory_items WHERE bill_id = :bid"), {"bid": req.bill_id})
    for item in req.items:
        db.execute(text("""
            INSERT INTO inventory_items (bill_id, item_name, description, category, quantity, unit, unit_price, total_amount, hsn_sac)
            VALUES (:bill_id, :name, :desc, :cat, :qty, :unit, :up, :ta, :hsn)
        """), {
            "bill_id": req.bill_id, "name": item.item_name, "desc": item.description,
            "cat": item.category, "qty": item.quantity, "unit": item.unit,
            "up": item.unit_price, "ta": item.total_amount, "hsn": item.hsn_sac,
        })
    db.commit()
    return {"added": len(req.items)}


# ── List all inventory items ──────────────────────────────────────────────────

@router.get("/items")
def list_items(category: Optional[str] = None, db: Session = Depends(get_db)):
    q = """
        SELECT i.id, i.bill_id, i.item_name, i.description, i.category,
               i.quantity, i.unit, i.unit_price, i.total_amount, i.hsn_sac,
               i.created_at,
               mb.vendor_name, mb.bill_date, mb.status, mb.uploaded_by
        FROM inventory_items i
        JOIN medical_bills mb ON mb.id = i.bill_id
        WHERE mb.status = 'approved'
    """
    params: Dict[str, Any] = {}
    if category:
        q += " AND i.category = :cat"
        params["cat"] = category
    q += " ORDER BY i.created_at DESC"
    rows = db.execute(text(q), params).mappings().all()
    return [_ser(r) for r in rows]


# ── Dashboard summary ─────────────────────────────────────────────────────────

@router.get("/dashboard")
def inventory_dashboard(db: Session = Depends(get_db)):
    # Total spend by category (approved bills)
    by_cat = db.execute(text("""
        SELECT i.category, COUNT(*) as item_count,
               COALESCE(SUM(i.total_amount), 0) as total_spend,
               COALESCE(SUM(i.quantity), 0) as total_qty
        FROM inventory_items i
        JOIN medical_bills mb ON mb.id = i.bill_id
        WHERE mb.status = 'approved'
        GROUP BY i.category ORDER BY total_spend DESC
    """)).mappings().all()

    # Total items & spend
    totals = db.execute(text("""
        SELECT COUNT(*) as item_count,
               COALESCE(SUM(i.total_amount), 0) as total_spend,
               COUNT(DISTINCT i.bill_id) as bill_count
        FROM inventory_items i
        JOIN medical_bills mb ON mb.id = i.bill_id
        WHERE mb.status = 'approved'
    """)).mappings().first()

    # Monthly spend trend (last 6 months)
    monthly = db.execute(text("""
        SELECT TO_CHAR(DATE_TRUNC('month', mb.bill_date), 'Mon YYYY') as month,
               DATE_TRUNC('month', mb.bill_date) as month_dt,
               COALESCE(SUM(i.total_amount), 0) as spend
        FROM inventory_items i
        JOIN medical_bills mb ON mb.id = i.bill_id
        WHERE mb.status = 'approved'
          AND mb.bill_date >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', mb.bill_date), TO_CHAR(DATE_TRUNC('month', mb.bill_date), 'Mon YYYY')
        ORDER BY month_dt
    """)).mappings().all()

    # Top items by spend
    top_items = db.execute(text("""
        SELECT i.item_name, i.category,
               COALESCE(SUM(i.total_amount), 0) as total_spend,
               COALESCE(SUM(i.quantity), 0) as total_qty,
               COUNT(*) as order_count
        FROM inventory_items i
        JOIN medical_bills mb ON mb.id = i.bill_id
        WHERE mb.status = 'approved'
        GROUP BY i.item_name, i.category
        ORDER BY total_spend DESC LIMIT 10
    """)).mappings().all()

    # Recent items
    recent = db.execute(text("""
        SELECT i.item_name, i.category, i.quantity, i.unit, i.total_amount,
               mb.vendor_name, mb.bill_date
        FROM inventory_items i
        JOIN medical_bills mb ON mb.id = i.bill_id
        WHERE mb.status = 'approved'
        ORDER BY i.created_at DESC LIMIT 8
    """)).mappings().all()

    return {
        "total_items": int(totals["item_count"]) if totals else 0,
        "total_spend": float(totals["total_spend"]) if totals else 0,
        "bill_count": int(totals["bill_count"]) if totals else 0,
        "by_category": [
            {"category": r["category"] or "Other", "item_count": int(r["item_count"]),
             "total_spend": float(r["total_spend"]), "total_qty": float(r["total_qty"])}
            for r in by_cat
        ],
        "monthly_trend": [
            {"month": r["month"], "spend": float(r["spend"])} for r in monthly
        ],
        "top_items": [
            {"item_name": r["item_name"], "category": r["category"] or "Other",
             "total_spend": float(r["total_spend"]), "total_qty": float(r["total_qty"]),
             "order_count": int(r["order_count"])}
            for r in top_items
        ],
        "recent_items": [
            {"item_name": r["item_name"], "category": r["category"] or "Other",
             "quantity": float(r["quantity"]) if r["quantity"] else None,
             "unit": r["unit"], "total_amount": float(r["total_amount"]) if r["total_amount"] else None,
             "vendor_name": r["vendor_name"], "bill_date": r["bill_date"].isoformat() if r["bill_date"] else None}
            for r in recent
        ],
    }


# ── Get items for a specific bill ────────────────────────────────────────────

@router.get("/bills/{bill_id}/items")
def get_bill_items(bill_id: str, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT id, item_name, description, category, quantity, unit, unit_price, total_amount, hsn_sac
        FROM inventory_items WHERE bill_id = :bid ORDER BY created_at
    """), {"bid": bill_id}).mappings().all()
    return [{"id": str(r["id"]), "item_name": r["item_name"], "description": r["description"],
             "category": r["category"], "quantity": float(r["quantity"]) if r["quantity"] else None,
             "unit": r["unit"], "unit_price": float(r["unit_price"]) if r["unit_price"] else None,
             "total_amount": float(r["total_amount"]) if r["total_amount"] else None,
             "hsn_sac": r["hsn_sac"]} for r in rows]


class UpdateItemCategory(BaseModel):
    item_id: str
    category: str

@router.patch("/items/category")
def update_item_category(req: UpdateItemCategory, db: Session = Depends(get_db)):
    db.execute(text("UPDATE inventory_items SET category = :cat WHERE id = :id"),
               {"cat": req.category, "id": req.item_id})
    db.commit()
    return {"ok": True}


def _ser(r) -> dict:
    return {
        "id": str(r["id"]),
        "bill_id": str(r["bill_id"]),
        "item_name": r["item_name"],
        "description": r["description"],
        "category": r["category"] or "Other",
        "quantity": float(r["quantity"]) if r["quantity"] is not None else None,
        "unit": r["unit"],
        "unit_price": float(r["unit_price"]) if r["unit_price"] is not None else None,
        "total_amount": float(r["total_amount"]) if r["total_amount"] is not None else None,
        "hsn_sac": r["hsn_sac"],
        "vendor_name": r["vendor_name"],
        "bill_date": r["bill_date"].isoformat() if r["bill_date"] else None,
        "bill_status": r["status"],
        "uploaded_by": r["uploaded_by"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
    }
