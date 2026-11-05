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
from uuid import uuid4
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, field_validator, model_validator
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    rotate_refresh_token,
    store_refresh_token,
    verify_password,
    get_current_user,
)
from ..db import get_appdb_session
from ..config import get_settings
from ..models import User, RefreshToken, AccountToken

from ..auth_security import SAMPLE_ROLE, protect_auth, require_personal_account
from ..workflow_security import lock_key

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(protect_auth)])
DUMMY_PASSWORD_HASH = hash_password("unusable-dummy-verification-password")
SAMPLE_PASSWORD_HASH = hash_password(create_refresh_token()[:64])

COOKIE_NAME = "refresh_token"


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
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Password must not exceed 72 UTF-8 bytes.')
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password:str
    new_password:str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls,v:str)->str:
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Password must not exceed 72 UTF-8 bytes.')
        if(len(v)<8):
            raise ValueError("Password must be atleast 8 characters")
        return v
    @model_validator(mode="after")
    def check_passwords_differ(self)->"ChangePasswordRequest":
        if self.current_password==self.new_password:
            raise ValueError("New Password must be different from the current Password")
        return self


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
    # Remove the old narrower cookie to avoid duplicate names on refresh.
    response.delete_cookie(key=COOKIE_NAME, path="/auth/refresh")
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=is_secure,
        samesite="none" if is_secure else "lax",
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        path="/auth",
    )


@router.get("/options")
async def auth_options():
    settings = get_settings()
    return {
        "email_verification_required": settings.email_verification_required,
        "password_reset_available": settings.mail_transport != "disabled",
        "demo_available": bool(settings.groq_api_key),
    }


@router.post("/sample", response_model=TokenResponse, status_code=201)
async def start_sample(response: Response, session: AsyncSession = Depends(get_appdb_session)):
    settings = get_settings()
    if not settings.groq_api_key:
        raise HTTPException(503, "The sample workspace is currently unavailable.")

    # Bound public account creation across all workers without involving real users.
    await session.execute(text("SELECT pg_advisory_xact_lock(:key)"),
                          {"key": lock_key("public-sample-starts")})
    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    starts = await session.scalar(select(func.count()).select_from(User).where(
        User.role == SAMPLE_ROLE, User.created_at >= day_start,
    ))
    if starts >= 40:
        raise HTTPException(429, "The sample workspace has reached its daily visit limit.")

    guest_id = uuid4()
    guest = User(
        id=guest_id, email=f"sample-{guest_id.hex}@example.invalid",
        username=f"sample_{guest_id.hex}", role=SAMPLE_ROLE,
        hashed_password=SAMPLE_PASSWORD_HASH,
    )
    session.add(guest)
    await session.commit()
    secure = settings.environment.lower() == "production" or settings.secure_cookies
    for path in ("/auth", "/auth/refresh"):
        response.delete_cookie(COOKIE_NAME, path=path, secure=secure,
                               httponly=True, samesite="none" if secure else "lax")
    return TokenResponse(
        access_token=create_access_token(str(guest.id), guest.email, guest.session_version),
        user_id=str(guest.id), username=guest.username, email=guest.email,
        user=UserResponse(user_id=str(guest.id), username="Chinook guest", email=guest.email,
                          role=SAMPLE_ROLE, created_at=guest.created_at),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/signup",
    status_code=status.HTTP_201_CREATED,
)
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

    if not get_settings().email_verification_required:
        refresh_token = create_refresh_token()
        await store_refresh_token(session, user.id, refresh_token)
        await session.commit()
        _set_refresh_cookie(response, refresh_token)
        return TokenResponse(
            access_token=create_access_token(str(user.id), user.email, user.session_version),
            user_id=str(user.id), username=user.username, email=user.email,
        )

    from ..account_recovery import issue_link
    try:
        await issue_link(session, user, 'verify')
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(503, 'We could not send the verification email. Please try again later.')
    return {'message': 'Check your email to verify your account before signing in.'}


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_appdb_session),
):
    # The public demo credentials are an entry point to a new guest workspace.
    if (get_settings().environment.lower() == "production"
            and body.email.lower() == "demo@chinook.dev" and body.password == "demo1234"):
        return await start_sample(response, session)

    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Constant-time check (verify even if user not found, to prevent timing attacks)
    password_valid = verify_password(body.password, user.hashed_password if user else DUMMY_PASSWORD_HASH)
    if user is None or not password_valid or getattr(user, 'role', None) == SAMPLE_ROLE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if get_settings().email_verification_required and not user.email_verified:
        raise HTTPException(403, detail="email_not_verified")
    if user.email == "demo@chinook.dev" and get_settings().environment.lower() == "production":
        raise HTTPException(status_code=403, detail="Shared demo access is disabled in production.")
    access_token = create_access_token(str(user.id), user.email, user.session_version)
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

    if get_settings().email_verification_required and not user.email_verified:
        raise HTTPException(403, detail="email_not_verified")
    if user.email == "demo@chinook.dev" and get_settings().environment.lower() == "production":
        raise HTTPException(status_code=403, detail="Shared demo access is disabled in production.")
    access_token = create_access_token(str(user.id), user.email, user.session_version)
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
        token_hash = hash_token(refresh_token)
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .values(revoked=True)
        )
        await session.commit()

    response.delete_cookie(key=COOKIE_NAME, path="/auth/refresh")
    response.delete_cookie(key=COOKIE_NAME, path="/auth")


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        user_id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        created_at=current_user.created_at,
    )


@router.post("/change-password",status_code=status.HTTP_204_NO_CONTENT)
async def change_Password(body:ChangePasswordRequest,
                          current_user:User=Depends(get_current_user),
                          session:AsyncSession=Depends(get_appdb_session),
):
    require_personal_account(current_user)
    if not verify_password(body.current_password,current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    if body.new_password==body.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from a current password"
        )

    # Serialize password changes with recovery and invalidate all older JWTs.
    current_user = await session.scalar(select(User).where(User.id == current_user.id).with_for_update().execution_options(populate_existing=True))
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(401, 'Current password is incorrect')
    current_user.hashed_password=hash_password(body.new_password)
    current_user.session_version += 1
    await session.execute(
        update(AccountToken).where(AccountToken.user_id == current_user.id, AccountToken.purpose == 'reset', AccountToken.consumed_at.is_(None)).values(consumed_at=datetime.now(timezone.utc))
    )

    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id==current_user.id)
        .values(revoked=True)

    )

    await session.commit()

