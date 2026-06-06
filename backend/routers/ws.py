from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.core.websocket_manager import manager
from backend.database import SessionLocal
from backend.services import dashboard_service
import json

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial snapshot
        db = SessionLocal()
        try:
            stats = dashboard_service.get_overview_stats(db)
            await websocket.send_text(json.dumps({"type": "snapshot", "stats": stats}))
        finally:
            db.close()

        # Keep alive — listen for pings
        while True:
            try:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
