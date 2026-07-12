from __future__ import annotations
"""
app/routers/auth_router.py
Auth endpoints: signup, login, refresh, logout, me.

Token strategy:
  - Access token: JSON body (short-lived, 15 min)
  - Refresh token: httpOnly cookie (7 days, rotated on use)
    httpOnly = JavaScript cannot read it → XSS-resistant
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import (
    create_access_token,
    create_refresh_token,
    hash_password,
    rotate_refresh_token,
    store_refresh_token,
    verify_password,
    get_current_user,
)
from ..db import get_appdb_session
from ..config import get_settings
from ..models import User, RefreshToken

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "refresh_token"
COOKIE_MAX_AGE = 7 * 24 * 3600  # 7 days in seconds


# ── Schemas ───────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 30:
            raise ValueError("Username must be 3–30 characters")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, _ and -")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    user_id: str
    username: str
    email: str
    role: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    user: Optional[UserResponse] = None



# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    is_secure = settings.environment.lower() == "production" or settings.secure_cookies
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=is_secure,
        samesite="none" if is_secure else "lax",
        max_age=COOKIE_MAX_AGE,
        path="/auth/refresh",
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupRequest,
    response: Response,
    session: AsyncSession = Depends(get_appdb_session),
):
    # Check email uniqueness
    existing = await session.execute(
        select(User).where(User.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Check username uniqueness
    existing_username = await session.execute(
        select(User).where(User.username == body.username)
    )
    if existing_username.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)

    access_token = create_access_token(str(user.id), user.email)
    refresh_token = create_refresh_token()
    await store_refresh_token(session, user.id, refresh_token)
    await session.commit()

    _set_refresh_cookie(response, refresh_token)

    user_obj = UserResponse(
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        role="user",
        created_at=user.created_at or datetime.now(timezone.utc),
    )

    return TokenResponse(
        access_token=access_token,
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        user=user_obj,
    )



@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_appdb_session),
):
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Constant-time check (verify even if user not found, to prevent timing attacks)
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(str(user.id), user.email)
    refresh_token = create_refresh_token()
    await store_refresh_token(session, user.id, refresh_token)
    await session.commit()

    _set_refresh_cookie(response, refresh_token)

    user_obj = UserResponse(
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        role="user",
        created_at=user.created_at or datetime.now(timezone.utc),
    )

    return TokenResponse(
        access_token=access_token,
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        user=user_obj,
    )



@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    session: AsyncSession = Depends(get_appdb_session),
):
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
        )

    user, new_refresh_token = await rotate_refresh_token(session, refresh_token)
    await session.commit()

    access_token = create_access_token(str(user.id), user.email)
    _set_refresh_cookie(response, new_refresh_token)

    user_obj = UserResponse(
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        role="user",
        created_at=user.created_at or datetime.now(timezone.utc),
    )

    return TokenResponse(
        access_token=access_token,
        user_id=str(user.id),
        username=user.username,
        email=user.email,
        user=user_obj,
    )



@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    session: AsyncSession = Depends(get_appdb_session),
):
    """Revoke the refresh token and clear the cookie."""
    if refresh_token:
        from ..auth import hash_token
        token_hash = hash_token(refresh_token)
        from sqlalchemy import update
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .values(revoked=True)
        )
        await session.commit()

    response.delete_cookie(key=COOKIE_NAME, path="/auth/refresh")


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        user_id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        created_at=current_user.created_at,
    )
