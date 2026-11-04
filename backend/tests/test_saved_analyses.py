"""Saved analyses preserve query identity and enforce ownership/source boundaries."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from backend.app.graph_routing import route_after_execute, route_after_review, route_after_validate
from backend.app.nodes.generate_sql import generate_sql_node
from backend.app.nodes.synthesize_answer import synthesize_answer_node
from backend.app.nodes.table_selector import table_selector_node
from backend.app.routers.analyses_router import (
    AnalysisCreate, get_owned_analysis, list_analyses, save_analysis, verify_analysis_source,
)


@pytest.mark.asyncio
async def test_saved_sql_bypasses_llm_and_table_selection():
    state = {"saved_sql": "SELECT country FROM customer LIMIT 3", "node_path": []}
    with patch("backend.app.nodes.generate_sql.get_llm") as llm, \
         patch("backend.app.nodes.table_selector.get_pruned_schema_text") as prune:
        selected = await table_selector_node(state)
        generated = await generate_sql_node(selected)
    llm.assert_not_called()
    prune.assert_not_called()
    assert generated["generated_sql"] == state["saved_sql"]
    assert generated["sql_valid"] is False  # Still must pass normal validation.


def test_saved_query_is_never_silently_regenerated():
    state = {"saved_sql": "SELECT 1", "retry_count": 0}
    assert route_after_validate({**state, "sql_valid": False}) == "synthesize_answer"
    assert route_after_execute({**state, "execution_error": "missing column"}) == "synthesize_answer"
    assert route_after_review({**state, "hitl_approved": False}) == "synthesize_answer"
    assert route_after_validate({**state, "sql_valid": True}) == "execute_sql"
    assert route_after_review({**state, "hitl_approved": True}) == "execute_sql"


@pytest.mark.asyncio
async def test_rejected_saved_run_is_cancelled_without_model_call():
    with patch("backend.app.nodes.synthesize_answer.get_llm") as llm:
        result = await synthesize_answer_node({
            "saved_sql": "SELECT 1", "hitl_approved": False, "validation_error": "User rejected",
        })
    assert "cancelled" in result["final_answer"]
    llm.assert_not_called()


@pytest.mark.asyncio
async def test_other_users_analysis_is_not_found():
    session = AsyncMock()
    session.scalar.return_value = None
    owner = uuid4()
    with pytest.raises(HTTPException) as error:
        await get_owned_analysis(session, uuid4(), owner)
    assert error.value.status_code == 404
    statement = session.scalar.call_args.args[0].compile()
    assert owner in statement.params.values()
    assert "saved_analyses.user_id =" in str(statement)


@pytest.mark.asyncio
@pytest.mark.parametrize("connection_id", [None, uuid4()])
async def test_missing_external_source_never_falls_back_to_demo(connection_id):
    session = AsyncMock()
    session.scalar.return_value = None
    analysis = SimpleNamespace(is_demo=False, connection_id=connection_id)
    with pytest.raises(HTTPException) as error:
        await verify_analysis_source(session, analysis, uuid4())
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_list_is_owner_scoped():
    session = AsyncMock()
    session.scalars.return_value = MagicMock()
    session.scalars.return_value.all.return_value = []
    owner = SimpleNamespace(id=uuid4())
    assert await list_analyses(owner, session) == []
    compiled = session.scalars.call_args.args[0].compile()
    assert owner.id in compiled.params.values()


@pytest.mark.asyncio
@pytest.mark.parametrize("succeeded", [None, False])
async def test_unverified_or_failed_answer_cannot_be_saved(succeeded):
    session = AsyncMock()
    session.scalar.return_value = SimpleNamespace(generated_sql="SELECT 1", analysis_data={"succeeded": succeeded})
    with pytest.raises(HTTPException) as error:
        await save_analysis(AnalysisCreate(message_id=uuid4(), name="Test"), SimpleNamespace(id=uuid4()), session)
    assert error.value.status_code == 422
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_save_uses_server_snapshot_and_sql_even_for_empty_results():
    session = AsyncMock()
    session.add = MagicMock()
    owner = SimpleNamespace(id=uuid4())
    session.scalar.return_value = SimpleNamespace(
        generated_sql="SELECT 1 WHERE false", content="No matching rows", chart_base64=None,
        analysis_data={"succeeded": True, "question": "Find missing records", "connection_id": None,
                       "rows": [], "columns": ["value"], "ran_at": datetime.now(timezone.utc).isoformat()},
    )
    result = await save_analysis(AnalysisCreate(message_id=uuid4(), name="Empty result"), owner, session)
    assert result.sql == "SELECT 1 WHERE false"
    assert result.snapshot["rows"] == []
    assert result.is_demo is True
    compiled = session.scalar.call_args.args[0].compile()
    assert owner.id in compiled.params.values()
    assert "conversations.user_id =" in str(compiled)


@pytest.mark.asyncio
async def test_run_takes_question_and_source_from_saved_record():
    from backend.app.main import ChatRequest, chat
    owner = SimpleNamespace(id=uuid4(), email="demo@chinook.dev", groq_api_key_enc=None)
    analysis = SimpleNamespace(id=uuid4(), question="Saved question", sql="SELECT 1", connection_id=None)
    convo = SimpleNamespace(id=uuid4())
    with patch("backend.app.main.get_owned_analysis", new_callable=AsyncMock, return_value=analysis) as owned, \
         patch("backend.app.main.verify_analysis_source", new_callable=AsyncMock) as source, \
         patch("backend.app.main.create_conversation", new_callable=AsyncMock, return_value=convo), \
         patch("backend.app.main.add_message", new_callable=AsyncMock), \
         patch("backend.app.main.auto_title_conversation", new_callable=AsyncMock), \
         patch("backend.app.main.app"), \
         patch("backend.app.config.get_settings", return_value=SimpleNamespace(groq_api_key="test-key")), \
         patch("backend.app.main.EventSourceResponse"), \
         patch("backend.app.main._chat_generator") as stream:
        await chat(ChatRequest(question="Client override", saved_analysis_id=analysis.id, connection_id=str(uuid4())), owner, AsyncMock())
    assert owned.call_args.args[2] == owner.id
    source.assert_awaited_once()
    assert stream.call_args.args[1] == "Saved question"
    assert stream.call_args.kwargs["saved_sql"] == "SELECT 1"
    assert stream.call_args.kwargs["connection_id"] is None


@pytest.mark.asyncio
async def test_saved_run_cannot_reuse_an_existing_conversation():
    from backend.app.main import ChatRequest, chat
    with pytest.raises(HTTPException) as error:
        await chat(ChatRequest(question="Run", saved_analysis_id=uuid4(), conversation_id=str(uuid4())), SimpleNamespace(id=uuid4()), AsyncMock())
    assert error.value.status_code == 422
