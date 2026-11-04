"""Regression coverage for follow-up context and data-source boundaries."""
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from backend.app.memory import get_conversation_context
from backend.app.nodes.generate_sql import generate_sql_node
from backend.app.nodes.table_selector import table_selector_node


@pytest.mark.asyncio
async def test_history_is_bounded_ordered_and_owner_scoped():
    owner, conversation = uuid.uuid4(), uuid.uuid4()
    session = AsyncMock()
    rows = MagicMock()
    rows.scalars.return_value.all.return_value = [
        SimpleNamespace(role="assistant", content="Top customers", generated_sql="SELECT * FROM customer LIMIT 5"),
        SimpleNamespace(role="user", content="Show top five customers", generated_sql=None),
    ]
    session.execute.return_value = rows
    context = await get_conversation_context(session, conversation, owner)
    assert context.index("user:") < context.index("assistant:")
    assert "SELECT * FROM customer LIMIT 5" in context
    statement = session.execute.call_args.args[0]
    compiled = statement.compile()
    assert owner in compiled.params.values()
    assert conversation in compiled.params.values()
    assert "conversations.user_id =" in str(compiled)
    assert "LIMIT" in str(compiled)

    rows.scalars.return_value.all.return_value = [
        SimpleNamespace(role="assistant", content="x" * 10000, generated_sql="s" * 10000)
        for _ in range(12)
    ]
    assert len(await get_conversation_context(session, conversation, owner)) <= 16000


@pytest.mark.asyncio
async def test_no_history_is_empty():
    session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    session.execute.return_value = result
    assert await get_conversation_context(session, uuid.uuid4(), uuid.uuid4()) == ""


@pytest.mark.asyncio
async def test_follow_up_reaches_both_table_selection_and_sql_generation(base_state):
    context = "user: Top customers in France\nPrevious SQL:\nSELECT * FROM customer WHERE country = 'France'"
    state = {**base_state, "question": "Now only the top three", "conversation_context": context}
    with patch("backend.app.nodes.table_selector.get_pruned_schema_text", new_callable=AsyncMock) as prune:
        prune.return_value = (base_state["schema_text"], ["customer"])
        selected = await table_selector_node(state)
        assert context in prune.call_args.args[0]
        assert state["question"] in prune.call_args.args[0]

    llm = AsyncMock()
    llm.ainvoke.return_value.content = "SELECT * FROM customer WHERE country = 'France' LIMIT 3"
    with patch("backend.app.nodes.generate_sql.get_llm", return_value=llm):
        generated = await generate_sql_node(selected)
    prompts = llm.ainvoke.call_args.args[0]
    assert context in prompts[1].content
    assert state["question"] in prompts[1].content
    assert "LIMIT 3" in generated["generated_sql"]


@pytest.mark.asyncio
async def test_switching_source_rejected_before_message_is_written():
    from backend.app.main import ChatRequest, chat

    convo = SimpleNamespace(source_deleted=False, id=uuid.uuid4(), connection_id=uuid.uuid4())
    user = SimpleNamespace(id=uuid.uuid4())
    with patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=convo), \
         patch("backend.app.main.add_message", new_callable=AsyncMock) as add:
        with pytest.raises(HTTPException) as error:
            await chat(
                ChatRequest(question="Show revenue", conversation_id=str(convo.id), connection_id=str(uuid.uuid4())),
                current_user=user, session=AsyncMock(),
            )
    assert error.value.status_code == 409
    add.assert_not_awaited()


@pytest.mark.asyncio
async def test_chat_loads_prior_context_before_persisting_new_question():
    from backend.app.main import ChatRequest, chat

    convo = SimpleNamespace(source_deleted=False, id=uuid.uuid4(), connection_id=None)
    user = SimpleNamespace(id=uuid.uuid4(), groq_api_key_enc=None, email="demo@chinook.dev")
    session = AsyncMock()
    session.scalar.return_value = convo
    calls = []

    async def history(*args):
        calls.append("history")
        return "user: Show customers in France"

    async def save(*args):
        calls.append("save")

    def response(generator):
        return generator

    with patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=convo), \
         patch("backend.app.main.get_conversation_context", side_effect=history), \
         patch("backend.app.main.add_message", side_effect=save), \
         patch("backend.app.main._chat_generator", return_value="stream") as stream, \
         patch("backend.app.main.EventSourceResponse", side_effect=response), \
         patch("backend.app.main.app") as app, \
         patch("backend.app.config.get_settings", return_value=SimpleNamespace(groq_api_key="test-key")):
        app.state.graph = MagicMock()
        await chat(ChatRequest(question="Only the top three", conversation_id=str(convo.id)), user, session)
    assert calls == ["history", "save"]
    assert stream.call_args.kwargs["conversation_context"] == "user: Show customers in France"
