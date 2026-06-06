from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.core.auth import create_access_token

router = APIRouter(prefix="/api/patient", tags=["patient"])

# In-memory store — no DB migration needed for demo
_PATIENTS: dict[str, dict] = {}


class PatientRegister(BaseModel):
    name: str
    email: str
    password: str
    age: int
    height_cm: float
    weight_kg: float
    blood_group: str


class PatientLoginReq(BaseModel):
    email: str
    password: str


def _bmi(height_cm: float, weight_kg: float) -> float:
    h = height_cm / 100
    return round(weight_kg / (h * h), 1)


def _bmi_label(bmi: float) -> str:
    if bmi < 18.5: return "Underweight"
    if bmi < 25:   return "Normal"
    if bmi < 30:   return "Overweight"
    return "Obese"


@router.post("/register")
def register_patient(req: PatientRegister):
    if req.email in _PATIENTS:
        raise HTTPException(status_code=400, detail="Email already registered. Please login.")
    bmi = _bmi(req.height_cm, req.weight_kg)
    profile = {
        "name": req.name,
        "email": req.email,
        "password": req.password,
        "age": req.age,
        "height_cm": req.height_cm,
        "weight_kg": req.weight_kg,
        "blood_group": req.blood_group,
        "bmi": bmi,
        "bmi_label": _bmi_label(bmi),
    }
    _PATIENTS[req.email] = profile
    token = create_access_token({
        "sub": req.email,
        "role": "patient",
        "name": req.name,
        "blood_group": req.blood_group,
        "age": req.age,
        "bmi": bmi,
    })
    return {"access_token": token, "token_type": "bearer", "profile": {k: v for k, v in profile.items() if k != "password"}}


@router.post("/login")
def login_patient(req: PatientLoginReq):
    p = _PATIENTS.get(req.email)
    if not p or p["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token({
        "sub": req.email,
        "role": "patient",
        "name": p["name"],
        "blood_group": p["blood_group"],
        "age": p["age"],
        "bmi": p["bmi"],
    })
    return {"access_token": token, "token_type": "bearer", "profile": {k: v for k, v in p.items() if k != "password"}}


@router.get("/profile")
def get_profile(email: str):
    p = _PATIENTS.get(email)
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return {k: v for k, v in p.items() if k != "password"}
