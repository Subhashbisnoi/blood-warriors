from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os

from backend.config import settings
from backend.database import check_connection
from backend.routers import auth, dashboard, match, outreach, chat, donors, ws, bills, inventory, patient, donor_portal

app = FastAPI(title="Blood Warriors AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(match.router)
app.include_router(outreach.router)
app.include_router(chat.router)
app.include_router(donors.router)
app.include_router(ws.router)
app.include_router(bills.router)
app.include_router(inventory.router)
app.include_router(patient.router)
app.include_router(donor_portal.router)

# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")


@app.get("/health")
def health():
    db_ok = check_connection()
    return JSONResponse({"status": "ok", "db": "connected" if db_ok else "error"})


@app.get("/")
def serve_login():
    login_path = os.path.join(frontend_dir, "login.html")
    if os.path.exists(login_path):
        return FileResponse(login_path)
    return JSONResponse({"status": "Blood Warriors AI running — frontend not found"})


@app.get("/{page}.html")
def serve_page(page: str):
    page_path = os.path.join(frontend_dir, f"{page}.html")
    if os.path.exists(page_path):
        return FileResponse(page_path)
    return JSONResponse({"error": "Page not found"}, status_code=404)
