from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import Settings
from ..deps import current_user, get_db, get_settings
from ..models import User
from ..schemas import Credentials, TokenOut, UserOut
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Compared against when the email is unknown so login timing does not reveal
# which addresses are registered.
_DUMMY_HASH = hash_password("timing-equaliser-password")


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: Credentials, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    user = User(email=body.email.lower(), password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered") from None
    return TokenOut(access_token=create_token(user.id, settings.jwt_secret, settings.jwt_ttl_minutes))


@router.post("/login", response_model=TokenOut)
def login(body: Credentials, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    valid = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return TokenOut(access_token=create_token(user.id, settings.jwt_secret, settings.jwt_ttl_minutes))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
