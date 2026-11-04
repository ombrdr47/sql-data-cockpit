"""Bounded multi-process PostgreSQL check, not an LLM throughput benchmark.

Run with python -m backend.ops.check_concurrency. Uses 4 processes and disposable
accounts; verifies lock exclusion and an atomic 20/minute quota under contention.
"""
import asyncio
from concurrent.futures import ProcessPoolExecutor
import json
import multiprocessing
import time
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4
from sqlalchemy import delete
from fastapi import HTTPException
from backend.app.db import get_appdb_session_factory, get_appdb_engine
from backend.app.models import User
from backend.app.workflow_security import workflow_guard, consume_query_budget, get_lock_engine

_barrier = None


def init_worker(barrier):
    global _barrier
    _barrier = barrier


async def worker_async(mode, uid):
    samples, accepted, denied = [], 0, 0
    try:
        if mode == 'quota':
            with patch('backend.app.workflow_security.time', SimpleNamespace(time=lambda: 1800000000)):
                for _ in range(8):
                    start = time.perf_counter()
                    try:
                        await consume_query_budget(uid)
                        accepted += 1
                    except HTTPException as exc:
                        assert exc.status_code == 429
                        denied += 1
                    samples.append((time.perf_counter() - start) * 1000)
        else:
            try:
                async with workflow_guard(uid, str(uuid4())):
                    accepted = 1
                    await asyncio.sleep(2)
            except HTTPException as exc:
                assert exc.status_code == 409
                denied = 1
        return accepted, denied, samples
    finally:
        await get_lock_engine().dispose()
        await get_appdb_engine().dispose()


def worker(task):
    _barrier.wait(timeout=30)
    return asyncio.run(worker_async(*task))


async def create_users(ids):
    async with get_appdb_session_factory()() as session:
        for uid in ids:
            session.add(User(id=uid, email=f'concurrency-{uid}@example.com', username=f'load_{uid.hex[:12]}',
                             hashed_password='not-a-login-hash', email_verified=False))
        await session.commit()
    await get_appdb_engine().dispose()


async def cleanup(ids):
    async with get_appdb_session_factory()() as session:
        await session.execute(delete(User).where(User.id.in_(ids)))
        await session.commit()
    await get_appdb_engine().dispose()


def main():
    ids = [uuid4(), uuid4()]
    asyncio.run(create_users(ids))
    try:
        ctx = multiprocessing.get_context('spawn')
        with ProcessPoolExecutor(max_workers=4, mp_context=ctx, initializer=init_worker,
                                 initargs=(ctx.Barrier(4),)) as pool:
            lock_results = list(pool.map(worker, [('lock', str(ids[0]))] * 4))
            assert sum(r[0] for r in lock_results) == 1, lock_results
            quota_results = list(pool.map(worker, [('quota', str(ids[1]))] * 4))
            assert sum(r[0] for r in quota_results) == 20, quota_results
            assert sum(r[1] for r in quota_results) == 12, quota_results
        samples = sorted(t for r in quota_results for t in r[2])
        print(json.dumps({'processes': 4, 'lock_admitted': 1, 'lock_denied': 3,
                          'quota_admitted': 20, 'quota_denied': 12,
                          'quota_p50_ms': round(samples[len(samples)//2], 2),
                          'quota_p95_ms': round(samples[int((len(samples)-1)*.95)], 2)}, indent=2))
    finally:
        asyncio.run(cleanup(ids))
        print('Disposable concurrency accounts removed')


if __name__ == '__main__':
    main()
