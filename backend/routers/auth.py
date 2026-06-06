from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from backend.core.auth import authenticate_admin, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest):
    if not authenticate_admin(req.email, req.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token({"sub": req.email, "role": "admin"})
    return TokenResponse(access_token=token)
