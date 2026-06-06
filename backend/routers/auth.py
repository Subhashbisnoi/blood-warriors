from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from backend.core.auth import authenticate_user, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest):
    user = authenticate_user(req.email, req.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token({
        "sub": req.email,
        "role": user["role"],
        "name": user["name"],
        "company_id": "bloodwarriors",
        "company_name": "Blood Warriors",
    })
    return TokenResponse(access_token=token)
