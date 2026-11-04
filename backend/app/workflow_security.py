"""Database-backed execution locks and quotas shared across API workers."""
from contextlib import asynccontextmanager
from functools import lru_cache
import hashlib
import time

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from .config import get_settings
from .db import get_appdb_session_factory


def lock_key(value: str) -> int:
    return int.from_bytes(hashlib.sha256(value.encode()).digest()[:8], 'big', signed=True)


@lru_cache(maxsize=1)
def get_lock_engine():
    # Long-lived guard transactions must not occupy the app pool: graph nodes
    # need that pool to resolve keys and persist results while guards are held.
    from .database_transport import async_database_options
    settings = get_settings()
    url, options = async_database_options(settings.app_db_url, settings.environment.lower() == 'production', settings.app_db_ca_cert_file or None)
    return create_async_engine(url, connect_args=options,
                               pool_size=settings.lock_db_pool_size, max_overflow=settings.lock_db_pool_overflow,
                               pool_timeout=5, pool_pre_ping=True)


def get_lock_session_factory():
    return async_sessionmaker(get_lock_engine(), expire_on_commit=False)


@asynccontextmanager
async def workflow_guard(user_id: str, conversation_id: str):
    # Commit quotas before taking a long-lived lock; never hold one pool
    # connection while waiting for a second connection from the same pool.
    await consume_query_budget(user_id)
    async with get_lock_session_factory()() as session:
        async with session.begin():
            for resource in (f'user:{user_id}', f'conversation:{conversation_id}'):
                acquired = await session.scalar(text('SELECT pg_try_advisory_xact_lock(:key)'),
                                                {'key': lock_key(resource)})
                if not acquired:
                    raise HTTPException(409, 'Another query is running. Wait for it to finish.')
            yield


async def consume_query_budget(user_id: str) -> None:
    async with get_appdb_session_factory()() as session:
        async with session.begin():
            for period, seconds, limit in [('minute', 60, 20), ('day', 86400, 200)]:
                bucket = int(time.time()) // seconds
                used = await session.scalar(text('''
                    INSERT INTO query_usage (user_id, period, bucket, requests)
                    VALUES (CAST(:user_id AS uuid), :period, :bucket, 1)
                    ON CONFLICT (user_id, period) DO UPDATE
                    SET bucket = EXCLUDED.bucket,
                        requests = CASE WHEN query_usage.bucket = EXCLUDED.bucket
                                        THEN query_usage.requests + 1 ELSE 1 END
                    RETURNING requests
                '''), {'user_id': user_id, 'period': period, 'bucket': bucket})
                if used > limit:
                    raise HTTPException(429, f'Query limit reached for this {period}. Try again later.')


def require_pending_review(values: dict, review_token: str) -> None:
    if (not review_token or values.get('review_token') != review_token
            or values.get('hitl_approved') is not None):
        raise HTTPException(409, 'This review is expired or already used. Submit a new question.')
