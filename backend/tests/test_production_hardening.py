"""Regression tests for production audit findings; no real credentials or network."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from backend.app.connection_security import require_public_address, resolve_public_addresses
from backend.app.sql_policy import check_sql_policy, bounded_query
from backend.app.workflow_security import require_pending_review, workflow_guard


@pytest.mark.parametrize('sql', [
    'WITH changed AS (DELETE FROM customer RETURNING *) SELECT * FROM changed',
    'WITH changed AS (UPDATE customer SET name=\'x\' RETURNING *) SELECT * FROM changed',
    'SELECT * INTO copied FROM customer', 'SELECT * FROM customer FOR UPDATE',
    'SELECT * FROM private.customer', 'SELECT * FROM another.public.customer',
    'SELECT pg_sleep(30)', 'SELECT pg_read_file(\'/etc/passwd\')',
    'SELECT set_config(\'transaction_read_only\', \'off\', false)',
    'SELECT public.custom_function()', 'SELECT dangerous_function()',
    'SELECT 1; SELECT 2',
])
def test_unsafe_sql_is_rejected(sql):
    with pytest.raises(ValueError):
        check_sql_policy(sql)


@pytest.mark.parametrize('sql', [
    'SELECT country, SUM(total) FROM public.invoice GROUP BY country',
    'WITH totals AS (SELECT SUM(total) AS revenue FROM invoice) SELECT * FROM totals',
    'SELECT ROUND(AVG(total), 2), COUNT(*) FROM invoice',
    "SELECT DATE_TRUNC('month', invoicedate), SUM(total) FROM invoice GROUP BY 1",
    'SELECT name, ROW_NUMBER() OVER (ORDER BY name) FROM customer',
    'SELECT CASE WHEN total > 0 THEN total ELSE 0 END FROM invoice',
])
def test_common_analytics_remain_allowed(sql):
    check_sql_policy(sql)
    assert bounded_query(sql, 200).endswith('LIMIT 200')


@pytest.mark.parametrize('ip', ['169.254.169.254', '0.0.0.0', '127.0.0.1', '10.0.0.1',
                                '100.64.0.1', 'fe80::1', '::ffff:127.0.0.1', '::1'])
def test_nonpublic_addresses_rejected(ip):
    with pytest.raises(HTTPException):
        require_public_address(ip)


@pytest.mark.asyncio
async def test_dns_mixed_public_private_rejected():
    answers = [(2, 1, 6, '', ('8.8.8.8', 5432)), (10, 1, 6, '', ('fe80::1', 5432, 0, 0))]
    with patch('asyncio.BaseEventLoop.getaddrinfo', AsyncMock(return_value=answers)):
        with pytest.raises(HTTPException):
            await resolve_public_addresses('database.example')


@pytest.mark.asyncio
async def test_dns_failure_is_not_ignored():
    with patch('asyncio.BaseEventLoop.getaddrinfo', AsyncMock(side_effect=OSError)):
        with pytest.raises(HTTPException):
            await resolve_public_addresses('missing.example')


def test_generated_python_cannot_run(tmp_path):
    from backend.app.sandbox import run_code_in_sandbox, SandboxSecurityError
    marker = tmp_path / 'must-not-exist'
    with pytest.raises(SandboxSecurityError):
        run_code_in_sandbox(f'open({str(marker)!r}, "w").write("executed")', [])
    assert not marker.exists()


@pytest.mark.asyncio
async def test_new_sql_clears_rejection_and_rotates_review_token():
    from backend.app.nodes.generate_sql import generate_sql_node
    llm = MagicMock(ainvoke=AsyncMock(return_value=SimpleNamespace(content='SELECT 1')))
    with patch('backend.app.nodes.generate_sql.get_llm', return_value=llm):
        updated = await generate_sql_node({'user_id': str(uuid4()), 'question': 'Count?',
                                           'hitl_approved': False, 'review_token': 'old'})
    assert updated['hitl_approved'] is None
    assert updated['review_token'] != 'old'
    require_pending_review(updated, updated['review_token'])
    with pytest.raises(HTTPException):
        require_pending_review(updated, 'old')


@pytest.mark.parametrize('approved', [True, False])
def test_review_cannot_be_consumed_twice(approved):
    with pytest.raises(HTTPException):
        require_pending_review({'review_token': 'token', 'hitl_approved': approved}, 'token')


@pytest.mark.asyncio
async def test_catalog_never_samples_customer_rows():
    from backend.app.schema_catalog import DynamicSchemaCatalog
    catalog = DynamicSchemaCatalog()
    engine = MagicMock()
    with patch.object(catalog, '_load_struct', AsyncMock(return_value={'customer': []})), \
         patch.object(catalog, '_load_sample', AsyncMock()) as sample:
        structure, rows = await catalog._get_cached(engine)
    assert structure == {'customer': []}
    assert rows == {}
    sample.assert_not_called()


@pytest.mark.asyncio
async def test_schema_cache_is_scoped_to_engine_not_redacted_url():
    from backend.app.schema_catalog import DynamicSchemaCatalog
    catalog = DynamicSchemaCatalog()
    first, second = MagicMock(), MagicMock()
    first.url = second.url = 'postgresql://user:***@host/db'
    with patch.object(catalog, '_load_struct', AsyncMock(side_effect=[{'one': []}, {'two': []}])):
        assert (await catalog._get_cached(first))[0] == {'one': []}
        assert (await catalog._get_cached(second))[0] == {'two': []}


@pytest.mark.asyncio
async def test_engine_pins_resolved_ip_and_verifies_original_hostname():
    from backend.app.engine_pool import _secure_engine
    with patch('backend.app.engine_pool.create_async_engine') as create, \
         patch('backend.app.connection_security.resolve_public_addresses', AsyncMock(return_value=['8.8.8.8'])), \
         patch('psycopg.AsyncConnection.connect', AsyncMock()) as connect:
        _secure_engine('db.example', 5432, 'db/name', 'user', 'p@ss/#', pool_size=1)
        args = create.call_args
        assert args.args[0].password == 'p@ss/#'
        await args.kwargs['async_creator']()
    assert connect.call_args.kwargs['host'] == 'db.example'
    assert connect.call_args.kwargs['hostaddr'] == '8.8.8.8'
    assert connect.call_args.kwargs['sslmode'] == 'verify-full'


@pytest.mark.asyncio
async def test_duplicate_workflow_fails_before_model_work():
    session = AsyncMock()
    session.begin = MagicMock(return_value=AsyncMock())
    session.scalar.return_value = False
    cm = AsyncMock()
    cm.__aenter__.return_value = session
    with patch('backend.app.workflow_security.get_lock_session_factory', return_value=lambda: cm), \
         patch('backend.app.workflow_security.consume_query_budget', AsyncMock()) as quota:
        with pytest.raises(HTTPException) as exc:
            async with workflow_guard(str(uuid4()), str(uuid4())):
                pytest.fail('Concurrent workflow acquired the lock')
    assert exc.value.status_code == 409
    quota.assert_awaited_once()


def test_checkpoint_state_has_no_api_key_channel():
    from backend.app.nodes import AgentState
    assert 'groq_api_key' not in AgentState.__annotations__


@pytest.mark.asyncio
async def test_credentials_resolved_from_encrypted_account_record():
    from backend.app.llm import resolve_api_key
    from backend.app.crypto import get_fernet, encrypt_field
    user = SimpleNamespace(email='person@example.com', email_verified=True,
                           groq_api_key_enc=encrypt_field('test-only-secret', get_fernet('unit-test-secret')))
    session = AsyncMock()
    session.get.return_value = user
    cm = AsyncMock()
    cm.__aenter__.return_value = session
    with patch('backend.app.db.get_appdb_session_factory', return_value=lambda: cm), \
         patch('backend.app.llm.get_settings', return_value=SimpleNamespace(jwt_secret_key='unit-test-secret', email_verification_required=True)):
        assert await resolve_api_key(str(uuid4())) == 'test-only-secret'


@pytest.mark.asyncio
async def test_deleted_source_cannot_fall_back_to_demo():
    from backend.app.main import chat, ChatRequest
    convo = SimpleNamespace(id=uuid4(), connection_id=None, source_deleted=True)
    with patch('backend.app.main.get_conversation', AsyncMock(return_value=convo)), \
         patch('backend.app.main.add_message', AsyncMock()) as write:
        with pytest.raises(HTTPException) as error:
            await chat(ChatRequest(question='Count rows', conversation_id=str(convo.id)),
                       SimpleNamespace(id=uuid4()), AsyncMock())
    assert error.value.status_code == 409
    write.assert_not_awaited()


@pytest.mark.parametrize('payload', [
    {'question': 'x', 'conversation_id': 'invalid'},
    {'question': 'x', 'connection_id': 'invalid'},
    {'question': 'x' * 8001},
])
def test_invalid_chat_input_rejected_before_database_work(payload):
    from pydantic import ValidationError
    from backend.app.main import ChatRequest
    with pytest.raises(ValidationError):
        ChatRequest(**payload)
