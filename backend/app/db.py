from __future__ import annotations
"""
app/db.py
Database layer:
  - Two SQLAlchemy engines: chinook (read-only role) + app_db (read-write)
  - Chinook schema introspection → formatted text for LLM context
  - execute_chinook_query() — enforces row cap on top of DB-level timeout
"""
from functools import lru_cache
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from .config import get_settings


# ── Engine factories ──────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_chinook_engine() -> AsyncEngine:
    """
    Read-only engine for the chinook analytics database.
    Uses the chinook_ro role (SELECT-only, statement_timeout=5s set on role).
    """
    settings = get_settings()
    return create_async_engine(
        settings.chinook_db_url,
        pool_size=10,        # was 5 — increased for 100+ concurrent analytical queries
        max_overflow=20,     # was 10 — burst headroom
        pool_pre_ping=True,
        echo=False,
    )


@lru_cache(maxsize=1)
def get_appdb_engine() -> AsyncEngine:
    """Read-write engine for app_db (users, conversations, messages)."""
    settings = get_settings()
    return create_async_engine(
        settings.app_db_url,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        echo=False,
    )


# ── Session factories ─────────────────────────────────────────────────────────

def get_appdb_session_factory() -> sessionmaker:
    return sessionmaker(
        bind=get_appdb_engine(),
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def get_appdb_session() -> AsyncSession:
    """FastAPI dependency: yields an AsyncSession and commits/rolls back."""
    factory = get_appdb_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Schema introspection ──────────────────────────────────────────────────────

_SCHEMA_TEXT_CACHE: Optional[str] = None


async def get_schema_text() -> str:
    """
    Introspect the Chinook schema and return a formatted string suitable
    for injection into the LLM prompt.

    Uses information_schema for portability. Cached after first call
    (schema doesn't change at runtime).
    """
    global _SCHEMA_TEXT_CACHE
    if _SCHEMA_TEXT_CACHE is not None:
        return _SCHEMA_TEXT_CACHE

    engine = get_chinook_engine()
    async with engine.connect() as conn:
        # Get tables
        tables_result = await conn.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """
            )
        )
        tables = [row[0] for row in tables_result.fetchall()]

        schema_parts = ["-- Chinook Database Schema (PostgreSQL)\n"]

        for table in tables:
            # Get columns
            cols_result = await conn.execute(
                text(
                    """
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = :table
                    ORDER BY ordinal_position
                    """
                ),
                {"table": table},
            )
            cols = cols_result.fetchall()

            # Get primary keys
            pk_result = await conn.execute(
                text(
                    """
                    SELECT kcu.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                      AND tc.table_schema = 'public'
                      AND tc.table_name = :table
                    """
                ),
                {"table": table},
            )
            pks = {row[0] for row in pk_result.fetchall()}

            # Get foreign keys
            fk_result = await conn.execute(
                text(
                    """
                    SELECT kcu.column_name, ccu.table_name AS foreign_table,
                           ccu.column_name AS foreign_column
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                     AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_schema = 'public'
                      AND tc.table_name = :table
                    """
                ),
                {"table": table},
            )
            fks = {row[0]: (row[1], row[2]) for row in fk_result.fetchall()}

            # Format the table
            schema_parts.append(f"CREATE TABLE {table} (")
            col_lines = []
            for col_name, data_type, is_nullable in cols:
                nullable = "" if is_nullable == "YES" else " NOT NULL"
                pk_marker = " PRIMARY KEY" if col_name in pks else ""
                fk_info = ""
                if col_name in fks:
                    fk_table, fk_col = fks[col_name]
                    fk_info = f"  -- FK → {fk_table}.{fk_col}"
                col_lines.append(
                    f"  {col_name} {data_type.upper()}{nullable}{pk_marker}{fk_info}"
                )
            schema_parts.append(",\n".join(col_lines))
            schema_parts.append(");\n")

    _SCHEMA_TEXT_CACHE = "\n".join(schema_parts)
    return _SCHEMA_TEXT_CACHE


def get_schema_tables_and_columns() -> dict[str, list[str]]:
    """
    Synchronously return cached schema structure for SQL validation allowlist.
    Must call get_schema_text() (async) first to populate the cache.
    """
    # Parsed from the text cache — simpler than maintaining two caches
    raise NotImplementedError("Call get_schema_tables_columns_async instead")


async def get_schema_tables_columns_async() -> dict[str, list[str]]:
    """
    Return dict mapping table_name -> list[column_name] for the allowlist
    used by the SQL validator.
    """
    engine = get_chinook_engine()
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position
                """
            )
        )
        schema: dict[str, list[str]] = {}
        for table_name, column_name in result.fetchall():
            schema.setdefault(table_name.lower(), []).append(column_name.lower())
    return schema


# ── Query execution ───────────────────────────────────────────────────────────

async def execute_chinook_query(
    sql: str, row_cap: Optional[int] = None
) -> list[dict[str, Any]]:
    """
    Execute a SELECT query against Chinook via the read-only role.
    Enforces row_cap (app-level, on top of DB statement_timeout).
    Returns rows as list of dicts.
    """
    settings = get_settings()
    cap = row_cap or settings.sql_row_cap

    engine = get_chinook_engine()
    async with engine.connect() as conn:
        result = await conn.execute(text(sql))
        keys = list(result.keys())
        rows = result.fetchmany(cap)
        return [dict(zip(keys, row)) for row in rows]
