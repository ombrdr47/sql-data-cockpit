from __future__ import annotations
"""
app/auth.py
JWT authentication + password hashing.

Design decisions (worth noting in interviews):
  - Access tokens: short-lived (15 min), returned in JSON response body
  - Refresh tokens: longer-lived (7 days), stored in httpOnly cookie
    → httpOnly prevents XSS token theft (localStorage is not safe for tokens)
  - Refresh tokens are hashed in the DB (never stored raw) + rotated on use
  - Passwords: bcrypt via passlib (salted, work factor 12)
  - No JWT revocation list for access tokens — they expire quickly enough.
    Revocation is handled via the refresh_tokens table (revoked=TRUE).
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_appdb_session
from .models import User, RefreshToken

# ── Password hashing ──────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def _settings():
    return get_settings()


def create_access_token(user_id: str, email: str) -> str:
    settings = _settings()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token() -> str:
    """Generate a cryptographically secure random refresh token."""
    return secrets.token_urlsafe(64)


def hash_token(token: str) -> str:
    """Hash a refresh token for DB storage (never store raw)."""
    return hashlib.sha256(token.encode()).hexdigest()


def decode_access_token(token: str) -> dict:
    settings = _settings()
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI dependencies ──────────────────────────────────────────────────────

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_appdb_session),
) -> "User":
    """
    FastAPI dependency: extracts + validates the access token,
    returns the authenticated User ORM object.
    Raises 401 if token is missing/invalid/expired.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await session.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


async def store_refresh_token(
    session: AsyncSession, user_id: UUID, token: str
) -> None:
    settings = _settings()
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )
    rt = RefreshToken(
        user_id=user_id,
        token_hash=hash_token(token),
        expires_at=expires_at,
    )
    session.add(rt)
    await session.flush()


async def rotate_refresh_token(
    session: AsyncSession, old_token: str
) -> tuple["User", str]:
    """
    Validate the old refresh token, revoke it, issue a new one.
    Raises 401 if token is invalid/expired/already revoked.
    """
    token_hash = hash_token(old_token)
    result = await session.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .where(RefreshToken.revoked == False)  # noqa: E712
        .where(RefreshToken.expires_at > datetime.now(timezone.utc))
    )
    rt = result.scalar_one_or_none()
    if rt is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Revoke old token
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.id == rt.id)
        .values(revoked=True)
    )

    # Load user
    user_result = await session.execute(select(User).where(User.id == rt.user_id))
    user = user_result.scalar_one()

    # Issue new token
    new_token = create_refresh_token()
    await store_refresh_token(session, user.id, new_token)

    return user, new_token
