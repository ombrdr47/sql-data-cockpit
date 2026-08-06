"""
migrations/env.py
Alembic environment — reads DB URL from APP_DB_URL env var (or falls back
to app settings) so that both local dev and Render production work without
hardcoding credentials.
"""
import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# ── Make the backend package importable ──────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import Base  # noqa: E402  — must come after sys.path insert

# ── Alembic Config ────────────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """
    Priority:
      1. APP_DB_SYNC_URL env var  (Render sets this in production)
      2. APP_DB_URL env var       (sync version, fallback)
      3. app settings             (reads .env for local dev)
    Alembic needs a *sync* psycopg2 URL (not asyncpg).
    """
    url = os.environ.get("APP_DB_SYNC_URL") or os.environ.get("APP_DB_URL")
    if url:
        # Convert asyncpg → psycopg2 if someone accidentally set the async URL
        url = url.replace("postgresql+asyncpg://", "postgresql://")
        url = url.replace("postgresql+psycopg://", "postgresql://")
        return url
    # Fallback: load from pydantic settings (.env file)
    from app.config import get_settings
    sync_url = get_settings().app_db_sync_url
    sync_url = sync_url.replace("postgresql+asyncpg://", "postgresql://")
    return sync_url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL to stdout)."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (connect and apply)."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
