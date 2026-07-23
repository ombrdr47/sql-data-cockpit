"""
app/routers/connections_router.py
BYODB connection management endpoints.

Endpoints:
  POST   /connections            — validate + save a new connection (FR-1, FR-2)
  GET    /connections            — list user's connections, no credentials (FR-3, FR-12)
  DELETE /connections/{id}       — delete connection + credentials (FR-11)
  POST   /connections/{id}/test  — re-test an existing connection (FR-12)

Security:
  - All sensitive fields are encrypted before DB write (FR-9 / NFR-2)
  - Credentials are never returned in responses — host/db are masked
  - Private/loopback IPs are blocked before any connection attempt (FR-8)
  - Connection cap enforced (max_connections_per_user from config)
"""
import asyncio
import ipaddress
import re
import socket
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import get_settings
from ..crypto import decrypt_field, encrypt_field, get_fernet
from ..db import get_appdb_session
from ..engine_pool import engine_pool
from ..models import User, UserConnection

router = APIRouter(prefix="/connections", tags=["connections"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ConnectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    host: str = Field(..., min_length=1)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(..., min_length=1)
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)

    @field_validator("name")
    @classmethod
    def name_no_special(cls, v: str) -> str:
        # Allow letters, numbers, spaces, and common punctuation used in connection names
        if not re.match(r"^[\w\s\-\.\(\)\[\]@#!&]+$", v):
            raise ValueError(
                "Name may only contain letters, numbers, spaces, and common punctuation: - . ( ) [ ] @ # ! &"
            )
        return v.strip()


class ConnectionResponse(BaseModel):
    """Safe response — never includes username/password, masks host/database."""
    id: uuid.UUID
    name: str
    host_masked: str       # e.g. "my-db.render.com" → "my-db.***"
    port: int
    database_masked: str   # e.g. "chinook" → "chi***"
    status: str
    last_tested_at: Optional[datetime]
    created_at: datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

_PRIVATE_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

_BLOCKED_HOSTNAMES = {
    "localhost", "host.docker.internal", "gateway.docker.internal",
}


async def _assert_not_internal(host: str) -> None:
    """FR-8: Block connections to internal/private infrastructure.

    The DNS resolution is done via run_in_executor so it doesn't block
    the asyncio event loop (socket.gethostbyname is a blocking syscall).
    """
    if host.lower() in _BLOCKED_HOSTNAMES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Connections to internal/loopback hosts are not allowed.",
        )
    try:
        ip = ipaddress.ip_address(host)
        for net in _PRIVATE_RANGES:
            if ip in net:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Connections to private IP ranges are not allowed.",
                )
    except ValueError:
        # host is a DNS name — resolve asynchronously (non-blocking)
        try:
            loop = asyncio.get_event_loop()
            resolved = await loop.run_in_executor(
                None, socket.gethostbyname, host
            )
            ip = ipaddress.ip_address(resolved)
            for net in _PRIVATE_RANGES:
                if ip in net:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="The hostname resolves to a private IP range and is not allowed.",
                    )
        except socket.gaierror:
            # Can't resolve — treat as unreachable (will fail on connect test)
            pass


def _mask(value: str) -> str:
    """Mask a string sensibly.

    For host-like values (containing dots), shows the first segment only.
    For other values (db names, etc.), shows the first 3 chars then ***.
    Always returns at least *** to avoid leaking short values.
    """
    if not value:
        return "***"
    if "." in value:
        # e.g. "dp.db.render.com" → "dp.***"
        first_segment = value.split(".")[0]
        return first_segment[:6] + ".***" if len(first_segment) > 0 else "***"
    # Plain values: show first 3 chars max
    if len(value) <= 3:
        return "***"
    return value[:3] + "***"


def _to_response(conn: UserConnection, fernet) -> ConnectionResponse:
    host = decrypt_field(conn.host_enc, fernet)
    database = decrypt_field(conn.database_enc, fernet)
    return ConnectionResponse(
        id=conn.id,
        name=conn.name,
        host_masked=_mask(host),
        port=conn.port,
        database_masked=_mask(database),
        status=conn.status,
        last_tested_at=conn.last_tested_at,
        created_at=conn.created_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED, response_model=ConnectionResponse)
async def create_connection(
    body: ConnectionCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    """FR-1, FR-2: Validate + save a new database connection."""
    settings = get_settings()

    # ── Enforce connection cap ────────────────────────────────────────────────
    count = await session.scalar(
        select(func.count()).select_from(UserConnection)
        .where(UserConnection.user_id == current_user.id)
    )
    if (count or 0) >= settings.max_connections_per_user:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum of {settings.max_connections_per_user} connections per user reached.",
        )

    # ── Block internal infrastructure (FR-8) ───────────────────────────────────
    await _assert_not_internal(body.host)

    # ── Test connection before saving (FR-2) ──────────────────────────────────
    ok, reason = await engine_pool.test_connection(
        host=body.host,
        port=body.port,
        database=body.database,
        username=body.username,
        password=body.password,
    )
    conn_status = "connected" if ok else reason

    # ── Encrypt and persist ────────────────────────────────────────────────────
    from sqlalchemy.exc import IntegrityError
    fernet = get_fernet(settings.jwt_secret_key)
    conn = UserConnection(
        user_id=current_user.id,
        name=body.name,
        host_enc=encrypt_field(body.host, fernet),
        port=body.port,
        database_enc=encrypt_field(body.database, fernet),
        username_enc=encrypt_field(body.username, fernet),
        password_enc=encrypt_field(body.password, fernet),
        status=conn_status,
        last_tested_at=datetime.now(timezone.utc),
    )
    session.add(conn)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A connection named '{body.name}' already exists. Please choose a different name.",
        )
    await session.refresh(conn)

    return _to_response(conn, fernet)


@router.get("", response_model=list[ConnectionResponse])
async def list_connections(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    """FR-3: List the current user's saved connections (masked, no credentials)."""
    settings = get_settings()
    fernet = get_fernet(settings.jwt_secret_key)

    result = await session.execute(
        select(UserConnection)
        .where(UserConnection.user_id == current_user.id)
        .order_by(UserConnection.created_at)
    )
    conns = result.scalars().all()
    return [_to_response(c, fernet) for c in conns]


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    """FR-11: Delete a connection and permanently wipe its credentials."""
    conn = await session.scalar(
        select(UserConnection).where(
            UserConnection.id == connection_id,
            UserConnection.user_id == current_user.id,
        )
    )
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    # Dispose the cached engine immediately (FR-11)
    await engine_pool.remove(connection_id)

    await session.delete(conn)
    await session.commit()


@router.post("/{connection_id}/test", response_model=ConnectionResponse)
async def test_connection(
    connection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    """FR-12: Re-test an existing connection and update its status."""
    settings = get_settings()
    fernet = get_fernet(settings.jwt_secret_key)

    conn = await session.scalar(
        select(UserConnection).where(
            UserConnection.id == connection_id,
            UserConnection.user_id == current_user.id,
        )
    )
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    host = decrypt_field(conn.host_enc, fernet)
    database = decrypt_field(conn.database_enc, fernet)
    username = decrypt_field(conn.username_enc, fernet)
    password = decrypt_field(conn.password_enc, fernet)

    ok, reason = await engine_pool.test_connection(
        host=host, port=conn.port,
        database=database, username=username, password=password,
    )
    conn.status = "connected" if ok else reason
    conn.last_tested_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(conn)

    # Evict the cached engine so the next query gets a fresh one
    await engine_pool.remove(connection_id)

    return _to_response(conn, fernet)


# ── Update endpoint (Gap 6 fix) ──────────────────────────────────────────────

class ConnectionUpdate(BaseModel):
    """All fields optional — send only what needs to change."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    password: Optional[str] = Field(default=None, min_length=1)

    @field_validator("name")
    @classmethod
    def name_no_special(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^[\w\s\-\.\(\)\[\]@#!&]+$", v):
            raise ValueError("Name may only contain letters, numbers, spaces, and common punctuation: - . ( ) [ ] @ # ! &")
        return v.strip() if v else v


@router.patch("/{connection_id}", response_model=ConnectionResponse)
async def update_connection(
    connection_id: uuid.UUID,
    body: ConnectionUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    """Update a connection's name or rotate its password.

    On password change the cached engine is evicted so the next query
    picks up fresh credentials.
    """
    settings = get_settings()
    fernet = get_fernet(settings.jwt_secret_key)

    conn = await session.scalar(
        select(UserConnection).where(
            UserConnection.id == connection_id,
            UserConnection.user_id == current_user.id,
        )
    )
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    if body.name is not None:
        # Check uniqueness of the new name within user's connections
        existing = await session.scalar(
            select(UserConnection).where(
                UserConnection.user_id == current_user.id,
                UserConnection.name == body.name,
                UserConnection.id != connection_id,
            )
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="You already have a connection with that name.",
            )
        conn.name = body.name

    if body.password is not None:
        conn.password_enc = encrypt_field(body.password, fernet)
        conn.status = "untested"  # Reset — must re-test after password change
        conn.last_tested_at = None
        # Evict the cached engine so the new password takes effect immediately
        await engine_pool.remove(connection_id)

    await session.commit()
    await session.refresh(conn)
    return _to_response(conn, fernet)
