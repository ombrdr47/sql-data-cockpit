"""
app/engine_pool.py
Per-connection SQLAlchemy async engine pool for BYODB.

Responsibilities:
  - Cache one AsyncEngine per user_connection.id (TTL-based eviction)
  - Enforce read-only at the PostgreSQL session level via connect_args:
      default_transaction_read_only = ON
  - Dispose engines immediately when a connection is deleted
  - Small bounded pool per engine (pool_size=2, max_overflow=3) so a
    slow user DB cannot exhaust Chinook's connection pool (NFR-4)

Bug fixes vs. original:
  - get_engine() is now fully self-contained: it opens its own DB session
    internally on cache miss. Callers no longer pass an AsyncSession,
    eliminating the TOCTOU risk of a closed session.
  - DNS resolution moved to connections_router and is now done via
    asyncio.get_event_loop().run_in_executor() (non-blocking).

Usage:
    engine = await engine_pool.get_engine(connection_id)
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
"""
import asyncio
import time
import uuid
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .config import get_settings
from .crypto import decrypt_field, get_fernet


class _EnginePool:
    """Singleton per-connection engine cache with TTL eviction."""

    def __init__(self) -> None:
        # connection_id → (engine, last_used_timestamp)
        self._engines: dict[uuid.UUID, tuple[AsyncEngine, float]] = {}
        self._lock = asyncio.Lock()

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_engine(
        self,
        connection_id: uuid.UUID,
        # session parameter kept for backwards compatibility but no longer used
        session=None,
    ) -> AsyncEngine:
        """Return a cached (or freshly built) engine for the given connection_id.

        Fully self-contained: opens its own DB session on cache miss.
        The engine has read-only enforcement at the PostgreSQL session level.
        Raises LookupError if the connection record doesn't exist.
        """
        async with self._lock:
            if connection_id in self._engines:
                engine, _ = self._engines[connection_id]
                self._engines[connection_id] = (engine, time.monotonic())
                return engine

            # Cache miss — load credentials from DB and build engine
            engine = await self._build_engine(connection_id)
            self._engines[connection_id] = (engine, time.monotonic())
            return engine

    async def remove(self, connection_id: uuid.UUID) -> None:
        """Immediately dispose the engine for a deleted/updated connection."""
        async with self._lock:
            if connection_id in self._engines:
                engine, _ = self._engines.pop(connection_id)
                await engine.dispose()

    async def evict_expired(self) -> None:
        """Dispose engines idle longer than byodb_engine_ttl seconds.

        Called periodically by the FastAPI lifespan eviction loop.
        """
        ttl = get_settings().byodb_engine_ttl
        now = time.monotonic()
        async with self._lock:
            expired = [
                cid for cid, (_, last_used) in self._engines.items()
                if (now - last_used) > ttl
            ]
            for cid in expired:
                engine, _ = self._engines.pop(cid)
                await engine.dispose()

    # ── Engine builder ────────────────────────────────────────────────────────

    async def _build_engine(self, connection_id: uuid.UUID) -> AsyncEngine:
        """Decrypt credentials and create a new AsyncEngine.

        Opens its own short-lived DB session — the session is closed after
        credentials are read, so there is no external session lifecycle
        dependency (fixes the original TOCTOU / resource-leak pattern).
        """
        from .db import get_appdb_session_factory
        from .models import UserConnection
        from sqlalchemy import select

        factory = get_appdb_session_factory()
        async with factory() as session:
            row = await session.scalar(
                select(UserConnection).where(UserConnection.id == connection_id)
            )
            if row is None:
                raise LookupError(f"UserConnection {connection_id} not found")

            settings = get_settings()
            fernet = get_fernet(settings.jwt_secret_key)

            host     = decrypt_field(row.host_enc,     fernet)
            database = decrypt_field(row.database_enc, fernet)
            username = decrypt_field(row.username_enc, fernet)
            password = decrypt_field(row.password_enc, fernet)
            port     = row.port
        # Session is cleanly closed here — credentials are now in local variables

        url = (
            f"postgresql+asyncpg://{username}:{password}"
            f"@{host}:{port}/{database}"
        )

        engine = create_async_engine(
            url,
            pool_size=2,
            max_overflow=3,
            pool_pre_ping=True,
            echo=False,
            connect_args={
                # ssl=True enables SSL/TLS — required by Neon, Supabase, RDS, etc.
                # asyncpg uses True/False, not the psycopg2 'require' string.
                "ssl": True,
                "server_settings": {
                    "default_transaction_read_only": "on",
                },
            },
        )

        return engine

    # ── Connection tester (used by router before saving) ──────────────────────

    @staticmethod
    async def test_connection(
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        timeout: float = 15.0,   # 15s — Neon/Supabase free-tier cold-starts need up to 10s
    ) -> tuple[bool, str]:
        """Open a throwaway connection and run SELECT 1.

        Returns (success, error_message). On success error_message is ''.
        Tries SSL first (cloud providers), falls back to no-SSL (on-prem).
        """
        import logging
        logger = logging.getLogger(__name__)

        url = (
            f"postgresql+asyncpg://{username}:{password}"
            f"@{host}:{port}/{database}"
        )

        async def _try(ssl_enabled: bool) -> tuple[bool, str]:
            engine = create_async_engine(
                url,
                pool_size=1,
                max_overflow=0,
                pool_pre_ping=False,
                echo=False,
                connect_args={"ssl": ssl_enabled, "timeout": timeout},
            )
            try:
                async with asyncio.timeout(timeout + 2):
                    async with engine.connect() as conn:
                        await conn.execute(text("SELECT 1"))
                return True, ""
            finally:
                await engine.dispose()

        # ── First attempt: SSL enabled (required for cloud providers) ─────────
        try:
            return await _try(ssl_enabled=True)
        except asyncio.TimeoutError:
            logger.warning("test_connection timeout ssl=True host=%s", host)
            return False, "unreachable"
        except Exception as exc:
            logger.warning("test_connection ssl=True failed [%s]: %s", type(exc).__name__, exc)
            msg = str(exc).lower()
            if any(k in msg for k in ("password", "authentication", "auth")):
                return False, "auth_failed"
            # If NOT an SSL/TLS error, don't bother retrying without SSL
            if not any(k in msg for k in ("ssl", "tls", "certificate", "handshake")):
                return False, "unreachable"

        # ── Fallback: no SSL (on-prem / local Postgres without SSL) ──────────
        logger.info("Retrying without SSL for host=%s", host)
        try:
            return await _try(ssl_enabled=False)
        except asyncio.TimeoutError:
            logger.warning("test_connection timeout ssl=False host=%s", host)
            return False, "unreachable"
        except Exception as exc:
            logger.warning("test_connection ssl=False failed [%s]: %s", type(exc).__name__, exc)
            msg = str(exc).lower()
            if any(k in msg for k in ("password", "authentication", "auth")):
                return False, "auth_failed"
            return False, "unreachable"


# Module-level singleton — imported by routers and nodes
engine_pool = _EnginePool()
