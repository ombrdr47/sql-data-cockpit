"""Per-source engine cache with verified TLS, pinned public addresses and bounded sessions.

Database grants remain the permission boundary. Read-only sessions, SQL policy,
and statement timeouts provide additional safeguards.
"""
import asyncio
import time
import uuid

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
                from .schema_catalog import dynamic_catalog
                dynamic_catalog.invalidate(engine)
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
                from .schema_catalog import dynamic_catalog
                dynamic_catalog.invalidate(engine)
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

        engine = _secure_engine(host, port, database, username, password, pool_size=2, max_overflow=3)

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
        """Use exactly the same verified TLS and public-address policy as queries."""
        engine = _secure_engine(host, port, database, username, password, pool_size=1, max_overflow=0)
        try:
            async with asyncio.timeout(timeout + 2):
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
            return True, ""
        except Exception:
            return False, "connection_failed"
        finally:
            await engine.dispose()


def _secure_engine(host, port, database, username, password, **pool_options):
    from sqlalchemy import URL
    from psycopg import AsyncConnection
    import certifi
    from .connection_security import resolve_public_addresses

    async def connect():
        # hostaddr prevents a second DNS resolution; host still verifies the TLS name.
        addresses = await resolve_public_addresses(host, port)
        return await AsyncConnection.connect(
            host=host, hostaddr=addresses[0], port=port, dbname=database,
            user=username, password=password, sslmode="verify-full",
            sslrootcert=certifi.where(), connect_timeout=15,
            options="-c default_transaction_read_only=on -c search_path=pg_catalog,public -c statement_timeout=5000 -c idle_in_transaction_session_timeout=10000",
        )

    return create_async_engine(
        URL.create("postgresql+psycopg", username=username, password=password,
                   host=host, port=port, database=database),
        async_creator=connect, pool_pre_ping=True, **pool_options,
    )


# Module-level singleton — imported by routers and nodes
engine_pool = _EnginePool()
