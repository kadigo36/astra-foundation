from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.api.dependencies import current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import AuditEvent, User
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["authentication"])


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenOutput(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/register", response_model=TokenOutput, status_code=201)
def register(payload: RegisterInput, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    db.add(AuditEvent(actor_user_id=user.id, event_type="auth.register", outcome="success"))
    db.commit()
    return TokenOutput(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenOutput)
def login(payload: LoginInput, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    user = db.query(User).filter_by(email=email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    db.add(AuditEvent(actor_user_id=user.id, event_type="auth.login", outcome="success"))
    db.commit()
    return TokenOutput(access_token=create_access_token(user.id))


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "created_at": user.created_at}
