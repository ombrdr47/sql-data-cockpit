"""Preview legacy checkpoint cleanup; apply only an explicitly confirmed plan.

Does not read or print credential values. Conversations, messages, saved analyses,
and user credentials are untouched. Purged workflow threads cannot be resumed.
"""
import argparse
import asyncio
import hashlib
import json

from sqlalchemy import text
from backend.app.db import get_appdb_session_factory, get_appdb_engine
from backend.app.workflow_security import lock_key

TABLES = ('checkpoint_writes', 'checkpoint_blobs', 'checkpoints')


async def plan(session):
    rows = await session.execute(text("""
        SELECT DISTINCT thread_id FROM checkpoint_blobs WHERE channel='groq_api_key'
        UNION SELECT DISTINCT thread_id FROM checkpoint_writes WHERE channel='groq_api_key'
        ORDER BY thread_id
    """))
    threads = [row[0] for row in rows]
    counts = {}
    for table in TABLES:
        counts[table] = await session.scalar(text(f'SELECT count(*) FROM {table} WHERE thread_id = ANY(:ids)'), {'ids': threads})
    digest = hashlib.sha256(json.dumps({'threads': threads, 'counts': counts}, sort_keys=True).encode()).hexdigest()
    return threads, {'affected_threads': len(threads), 'rows_to_remove': counts, 'plan_sha256': digest,
                     'preserved': ['conversations', 'messages', 'saved_analyses', 'users', 'connections']}


async def run(apply=False, expected=None, stopped=False):
    if apply and (not expected or not stopped):
        raise ValueError('Apply requires --plan-sha256 and --confirm-workflows-stopped.')
    try:
        async with get_appdb_session_factory()() as session:
            async with session.begin():
                threads, report = await plan(session)
                if apply:
                    if expected != report['plan_sha256']:
                        raise ValueError('Plan changed. Run a new preview before applying.')
                    for thread in threads:
                        acquired = await session.scalar(text('SELECT pg_try_advisory_xact_lock(:key)'), {'key': lock_key(f'conversation:{thread}')})
                        if not acquired:
                            raise ValueError('A targeted workflow is active; nothing was deleted.')
                    _, locked_report = await plan(session)
                    if locked_report != report:
                        raise ValueError('Plan changed while acquiring locks; nothing was deleted.')
                    for table in TABLES:
                        await session.execute(text(f'DELETE FROM {table} WHERE thread_id = ANY(:ids)'), {'ids': threads})
                report['applied'] = apply
            print(json.dumps(report, indent=2))
    finally:
        await get_appdb_engine().dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--plan-sha256')
    parser.add_argument('--confirm-workflows-stopped', action='store_true')
    args = parser.parse_args()
    asyncio.run(run(args.apply, args.plan_sha256, args.confirm_workflows_stopped))
