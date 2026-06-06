from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.services import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    return dashboard_service.get_overview_stats(db)


@router.get("/inventory")
def get_inventory(db: Session = Depends(get_db)):
    return dashboard_service.get_blood_inventory(db)


@router.get("/inactive")
def get_inactive(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    return dashboard_service.get_inactive_donors(db, limit, offset)


@router.get("/bridges")
def get_bridges(limit: int = 20, db: Session = Depends(get_db)):
    return dashboard_service.get_active_bridges(db, limit)


@router.get("/analytics")
def get_analytics(db: Session = Depends(get_db)):
    return dashboard_service.get_analytics(db)


@router.get("/activity")
def get_activity(limit: int = 10, db: Session = Depends(get_db)):
    return dashboard_service.get_recent_activity(db, limit)
