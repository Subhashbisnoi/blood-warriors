from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from backend.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRE_HOURS)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    return verify_token(token)


USERS = {
    settings.ADMIN_EMAIL: {"password": settings.ADMIN_PASSWORD, "role": "admin", "name": "Admin"},
    "volunteer@bloodwarriors.in": {"password": "volunteer123", "role": "member", "name": "Volunteer"},
}

def authenticate_user(email: str, password: str):
    """Return user info dict or None."""
    user = USERS.get(email)
    if user and user["password"] == password:
        return user
    return None

def authenticate_admin(email: str, password: str) -> bool:
    return authenticate_user(email, password) is not None
