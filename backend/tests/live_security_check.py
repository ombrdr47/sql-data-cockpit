"""Opt-in PostgreSQL integration check: python -m backend.tests.live_security_check.

Requires migrated local app/Chinook databases. Creates disposable users and removes
only its own records/checkpoints. Model responses are deterministic; SQL, auth,
HTTP routing, graph persistence, locks and quota writes are real.
"""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
from fastapi import HTTPException
from sqlalchemy import text, delete

from backend.app.auth import hash_password
from backend.app.config import get_settings
from backend.app.crypto import encrypt_field, get_fernet
from backend.app.db import get_appdb_session_factory, get_appdb_engine, get_chinook_engine
from backend.app.main import app, lifespan
from backend.app.models import User, UserConnection, Conversation
from backend.app.workflow_security import consume_query_budget, workflow_guard, get_lock_engine


def events(response):
    assert response.status_code == 200, response.status_code
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]


async def main():
    ids = [uuid4() for _ in range(3)]
    conversations = []
    factory = get_appdb_session_factory()
    password = 'Disposable-Only-Password-42'
    test_key = 'disposable-model-key-never-send'
    try:
        async with factory() as session:
            for uid in ids:
                session.add(User(id=uid, email=f'check-{uid}@example.com', username=f'check_{uid.hex[:12]}',
                                 email_verified=True, hashed_password=hash_password(password),
                                 groq_api_key_enc=encrypt_field(test_key, get_fernet(get_settings().jwt_secret_key))))
            await session.commit()

        # Concurrent atomic quotas: exactly 20 admits in one fixed minute bucket.
        async def attempt():
            try:
                await consume_query_budget(str(ids[2]))
                return True
            except HTTPException as exc:
                assert exc.status_code == 429
                return False
        with patch('backend.app.workflow_security.time', SimpleNamespace(time=lambda: 1800000000)):
            outcomes = await asyncio.gather(*(attempt() for _ in range(25)))
        assert sum(outcomes) == 20, outcomes
        print('PASS: PostgreSQL quota contention: 20 accepted, 5 rejected')

        # Independent sessions contend on the same transaction advisory lock.
        async with workflow_guard(str(ids[1]), str(uuid4())):
            try:
                async with workflow_guard(str(ids[1]), str(uuid4())):
                    raise AssertionError('Concurrent execution was admitted')
            except HTTPException as exc:
                assert exc.status_code == 409
        async with workflow_guard(str(ids[1]), str(uuid4())):
            pass
        print('PASS: PostgreSQL execution lock contention and release')

        generator = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(content='SELECT COUNT(*) AS total FROM artist')))
        synthesis = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(content='Artist count retrieved.')))
        with patch('backend.app.nodes.generate_sql.get_llm', return_value=generator), \
             patch('backend.app.nodes.synthesize_answer.get_llm', return_value=synthesis):
            async with lifespan(app):
                assert app.state.checkpointer is not None, 'Durable checkpoint initialization failed'
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test', timeout=60) as client:
                    response = await client.post('/auth/login', json={'email': f'check-{ids[0]}@example.com', 'password': password})
                    assert response.status_code == 200
                    auth = {'Authorization': 'Bearer ' + response.json()['access_token']}
                    first = events(await client.post('/chat', json={'question': 'How many artists are there?'}, headers=auth))
                    cid = next(e['conversation_id'] for e in first if e['type'] == 'conversation_id')
                    conversations.append(cid)
                    proposal = next(e for e in first if e['type'] == 'approval_required')
                    token = proposal['review_token']
                    assert token
                    rejected = events(await client.post(f'/chat/review/{cid}', json={'approved': False, 'review_token': token, 'feedback': 'Please regenerate the count.'}, headers=auth))
                    replacement = next(e for e in rejected if e['type'] == 'approval_required')
                    assert replacement['review_token'] != token
                    stale = events(await client.post(f'/chat/review/{cid}', json={'approved': True, 'review_token': token}, headers=auth))
                    assert any(e['type'] == 'error' for e in stale)
                    assert not any(e['type'] == 'table' for e in stale)
                    print('PASS: rejection produces a fresh review; stale approval cannot execute')

                    response = await client.post('/auth/login', json={'email': f'check-{ids[1]}@example.com', 'password': password}, headers={'Origin': 'http://localhost:5173'})
                    assert response.status_code == 200
                    foreign = {'Authorization': 'Bearer ' + response.json()['access_token']}
                    denied = await client.post(f'/chat/review/{cid}', json={'approved': True, 'review_token': replacement['review_token']}, headers=foreign)
                    assert denied.status_code == 404
                    print('PASS: cross-account approval denied')

                    async def approve():
                        return await client.post(f'/chat/review/{cid}', json={'approved': True, 'review_token': replacement['review_token']}, headers=auth)
                    responses = await asyncio.gather(approve(), approve())
                    successful = []
                    for response in responses:
                        if response.status_code == 409:
                            continue
                        successful.extend(e for e in events(response) if e['type'] == 'done' and e.get('query_succeeded'))
                    assert len(successful) == 1, 'Approval must execute exactly once'
                    snapshot = await app.state.graph.aget_state({'configurable': {'thread_id': cid}})
                    assert snapshot.values['sql_results'][0]['total'] > 0
                    assert 'groq_api_key' not in snapshot.values
                    assert test_key not in json.dumps(snapshot.values, default=str)
                    async with factory() as session:
                        count = await session.scalar(text("SELECT count(*) FROM checkpoint_blobs WHERE thread_id=:id AND channel='groq_api_key'"), {'id': cid})
                        assert count == 0
                    print('PASS: concurrent approval executes once; real SQL returns rows; checkpoints exclude API key')

                    saved = await client.post('/analyses', json={'name': 'Disposable count', 'message_id': successful[0]['message_id']}, headers=auth)
                    assert saved.status_code == 201, saved.status_code
                    rerun = events(await client.post('/chat', json={'question': '', 'saved_analysis_id': saved.json()['id']}, headers=auth))
                    rerun_id = next(e['conversation_id'] for e in rerun if e['type'] == 'conversation_id')
                    conversations.append(rerun_id)
                    rerun_proposal = next(e for e in rerun if e['type'] == 'approval_required')
                    assert rerun_proposal['sql'] == proposal['sql']
                    result = events(await client.post(f'/chat/review/{rerun_id}', json={'approved': True, 'review_token': rerun_proposal['review_token']}, headers=auth))
                    assert any(e['type'] == 'done' and e.get('query_succeeded') for e in result)
                    print('PASS: saved analysis reruns the exact SQL through approval')

                    source_id, old_conversation = uuid4(), uuid4()
                    encrypted = encrypt_field('disposable-placeholder', get_fernet(get_settings().jwt_secret_key))
                    async with factory() as session:
                        session.add(UserConnection(id=source_id, user_id=ids[0], name='Disposable source',
                                                   host_enc=encrypted, database_enc=encrypted, username_enc=encrypted, password_enc=encrypted))
                        await session.flush()
                        session.add(Conversation(id=old_conversation, user_id=ids[0], connection_id=source_id, title='Source removal test'))
                        await session.commit()
                    conversations.append(str(old_conversation))
                    removed = await client.delete(f'/connections/{source_id}', headers=auth)
                    assert removed.status_code == 204, removed.status_code
                    blocked = await client.post('/chat', json={'question': 'Count artists', 'conversation_id': str(old_conversation)}, headers=auth)
                    assert blocked.status_code == 409, blocked.status_code
                    print('PASS: deleting a source prevents fallback to sample data in old conversations')

    finally:
        async with factory() as session:
            for cid in conversations:
                for table in ('checkpoint_writes', 'checkpoint_blobs', 'checkpoints'):
                    await session.execute(text(f'DELETE FROM {table} WHERE thread_id=:id'), {'id': cid})
            await session.execute(delete(User).where(User.id.in_(ids)))
            await session.commit()
        await get_lock_engine().dispose()
        await get_appdb_engine().dispose()
        await get_chinook_engine().dispose()
        print('Disposable integration records cleaned up')


if __name__ == '__main__':
    asyncio.run(main())
