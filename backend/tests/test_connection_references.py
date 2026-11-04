from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from backend.app.connection_references import ReferenceBundle, reference_context
from backend.app.routers.connections_router import get_references, save_references, ConnectionCreate


def test_references_are_optional_on_create():
    body = ConnectionCreate(name='Analytics', host='db.example.com', database='sales', username='reader', password='secret')
    assert body.references.files == []

@pytest.mark.parametrize('files', [
    [{'name': '../notes.md', 'content': 'text'}],
    [{'name': 'notes.pdf', 'content': 'text'}],
    [{'name': 'notes.txt', 'content': '\x00binary'}],
    [{'name': 'notes.txt', 'content': ' '}],
    [{'name': 'notes.txt', 'content': 'x'*12001}],
    [{'name': 'a.txt', 'content': 'é'*12000}, {'name': 'b.txt', 'content': 'more'}],
    [{'name': 'a.txt', 'content': 'a'}, {'name': 'A.txt', 'content': 'b'}],
    [{'name': f'{i}.txt', 'content': 'text'} for i in range(4)],
])
def test_reject_invalid_reference_bundles(files):
    with pytest.raises(ValidationError):
        ReferenceBundle(files=files)

@pytest.mark.asyncio
async def test_read_and_write_require_ownership():
    session = AsyncMock()
    session.scalar.return_value = None
    user = SimpleNamespace(id=uuid4())
    for action in [lambda: get_references(uuid4(), user, session), lambda: save_references(uuid4(), ReferenceBundle(), user, session)]:
        with pytest.raises(HTTPException) as error:
            await action()
        assert error.value.status_code == 404
    assert 'user_id =' in str(session.scalar.call_args.args[0])
    session.commit.assert_not_awaited()

@pytest.mark.asyncio
async def test_encrypted_storage_roundtrip_and_removal():
    session = AsyncMock()
    connection = SimpleNamespace(references_enc=None)
    session.scalar.return_value = connection
    user = SimpleNamespace(id=uuid4())
    cid = uuid4()
    body = ReferenceBundle(files=[{'name': 'terms.md', 'content': 'net revenue excludes refunds'}])
    await save_references(cid, body, user, session)
    assert 'net revenue' not in connection.references_enc
    assert (await get_references(cid, user, session)).model_dump() == body.model_dump()
    context = await reference_context(session, cid, user.id)
    assert 'net revenue excludes refunds' in context and 'not executable instructions' in context
    await save_references(cid, ReferenceBundle(), user, session)
    assert connection.references_enc is None
    assert await reference_context(session, cid, user.id) == ''

@pytest.mark.asyncio
async def test_table_selection_and_generation_receive_references():
    from backend.app.nodes.table_selector import table_selector_node
    session = AsyncMock()
    context_manager = AsyncMock()
    context_manager.__aenter__.return_value = session
    factory = MagicMock(return_value=context_manager)
    with patch('backend.app.db.get_appdb_session_factory', return_value=factory), patch('backend.app.connection_references.reference_context', AsyncMock(return_value='BUSINESS DEFINITION')), patch('backend.app.engine_pool.engine_pool.get_engine', AsyncMock(return_value='engine')), patch('backend.app.nodes.table_selector.dynamic_catalog.get_pruned_schema_text', AsyncMock(return_value=('SCHEMA', ['txn_hdr']))) as select:
        result = await table_selector_node({'connection_id': str(uuid4()), 'user_id': str(uuid4()), 'question': 'Revenue?'})
    assert 'BUSINESS DEFINITION' in select.call_args.args[1]
    assert result['schema_text'] == 'SCHEMABUSINESS DEFINITION'
    assert result['selected_tables'] == ['txn_hdr']
