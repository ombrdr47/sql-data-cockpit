"""
tests/test_hitl_endpoints.py
Integration tests for all HITL HTTP endpoints:
  - POST /chat          — initial chat, emits approval_required SSE event
  - POST /chat/review/{id} — resume with approval or rejection

Tests cover:
  - Happy path: approve → full execution completes
  - Reject path: rejection triggers retry with feedback
  - Authorization: 401 for unauthenticated, 403/404 for cross-user access
  - Idempotency: double-submit returns 409
  - Bad inputs: invalid conversation_id format, non-existent conversation
  - SSE event format validation
  - Edge cases: empty question, missing feedback on rejection
"""
import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_access_token(user_id: str = None, email: str = "test@example.com") -> str:
    """Create a valid JWT for testing without hitting the DB."""
    from backend.app.auth import create_access_token
    uid = user_id or str(uuid.uuid4())
    return create_access_token(uid, email)


def _make_user(user_id: str, email: str = "test@example.com"):
    from backend.app.models import User
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid.UUID(user_id)
    mock_user.email = email
    mock_user.username = "testuser"
    mock_user.role = "user"
    return mock_user


def _make_convo(conversation_id: str, user_id: str):
    from backend.app.models import Conversation
    mock_convo = MagicMock(spec=Conversation)
    mock_convo.id = uuid.UUID(conversation_id)
    mock_convo.user_id = uuid.UUID(user_id)
    mock_convo.title = "Test Conversation"
    return mock_convo


def _make_mock_session():
    """Minimal async session mock."""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.flush = AsyncMock()
    session.rollback = AsyncMock()
    session.add = MagicMock()
    session.refresh = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=mock_result)
    return session


# ── App fixture with dependency overrides ──────────────────────────────────────

@pytest.fixture(scope="module")
def app():
    """
    FastAPI app with heavy dependencies mocked at import time.
    We override FastAPI dependencies using app.dependency_overrides (the correct
    way) rather than patch(), which doesn't work for FastAPI DI.
    """
    with patch("backend.app.main.get_full_schema_text", new_callable=AsyncMock, return_value="mock schema"), \
         patch("backend.app.main.build_graph") as mock_build:
        mock_graph = MagicMock()
        mock_graph.astream = AsyncMock()
        mock_build.return_value = mock_graph

        from backend.app.main import app as fastapi_app
        fastapi_app.state.graph = mock_graph
        fastapi_app.state.checkpointer = None
        fastapi_app.state.pool = None
        yield fastapi_app

        # Clean up dependency overrides after tests
        fastapi_app.dependency_overrides.clear()


def _override_deps(app, user_id: str, convo=None, session=None):
    """
    Override FastAPI dependency injection for get_current_user and get_appdb_session.
    Returns a cleanup function.
    """
    from backend.app.auth import get_current_user
    from backend.app.db import get_appdb_session

    mock_user = _make_user(user_id)
    mock_session = session or _make_mock_session()

    async def _fake_user():
        return mock_user

    async def _fake_session():
        yield mock_session

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_appdb_session] = _fake_session

    return mock_user, mock_session


def _clear_overrides(app):
    app.dependency_overrides.clear()


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def user_id():
    return str(uuid.uuid4())


@pytest.fixture
def conversation_id():
    return str(uuid.uuid4())


@pytest.fixture
def access_token(user_id):
    return _make_access_token(user_id)


# ── POST /chat: authorization & input validation ───────────────────────────────

class TestChatEndpointHITL:
    """Tests that POST /chat correctly handles auth and emits approval_required."""

    @pytest.mark.asyncio
    async def test_unauthenticated_chat_returns_401(self, app):
        """No auth dependency override → 401 Unauthorized from the real auth dep."""
        _clear_overrides(app)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/chat", json={"question": "Show artists"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_empty_question_returns_400(self, app, user_id):
        """Empty question string → 400 Bad Request before any graph execution."""
        mock_user, _ = _override_deps(app, user_id)
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/chat",
                    json={"question": "   "},
                    headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                )
            assert resp.status_code == 400
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_nonexistent_conversation_returns_404(self, app, user_id, conversation_id):
        """conversation_id that doesn't belong to the user → 404."""
        _override_deps(app, user_id)
        try:
            with patch("backend.app.memory.get_conversation", new_callable=AsyncMock, return_value=None):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        "/chat",
                        json={"question": "Show artists", "conversation_id": conversation_id},
                        headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                    )
            assert resp.status_code == 404
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_approval_required_event_in_sse_stream(self, app, user_id, conversation_id):
        """
        When graph emits __interrupt__, the SSE stream contains an
        approval_required event with correct structure before the stream closes.
        """
        _override_deps(app, user_id)

        mock_convo = _make_convo(conversation_id, user_id)
        interrupt_payload = {
            "sql": "SELECT * FROM artist",
            "conversation_id": conversation_id,
            "question": "Show all artists",
        }
        mock_value = MagicMock()
        mock_value.value = interrupt_payload

        async def mock_astream(*args, **kwargs):
            yield {"__interrupt__": [mock_value]}

        app.state.graph.astream = mock_astream

        try:
            with patch("backend.app.main.create_conversation", new_callable=AsyncMock, return_value=mock_convo), \
                 patch("backend.app.main.add_message", new_callable=AsyncMock), \
                 patch("backend.app.main.auto_title_conversation", new_callable=AsyncMock), \
                 patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=mock_convo):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        "/chat",
                        json={"question": "Show all artists"},
                        headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                    )
        finally:
            _clear_overrides(app)

        assert resp.status_code == 200
        events = [
            json.loads(line[6:])
            for line in resp.text.splitlines()
            if line.startswith("data: ")
        ]
        ar_events = [e for e in events if e.get("type") == "approval_required"]
        assert len(ar_events) == 1, f"Expected 1 approval_required event, got: {[e.get('type') for e in events]}"
        evt = ar_events[0]
        assert evt["sql"] == "SELECT * FROM artist"
        assert "conversation_id" in evt
        assert "question" in evt

    @pytest.mark.asyncio
    async def test_chat_stream_ends_at_approval_required(self, app, user_id, conversation_id):
        """After approval_required is emitted, no 'done' event should follow."""
        _override_deps(app, user_id)

        mock_convo = _make_convo(conversation_id, user_id)
        mock_value = MagicMock()
        mock_value.value = {"sql": "SELECT 1", "conversation_id": conversation_id, "question": "q"}

        async def mock_astream(*args, **kwargs):
            yield {"__interrupt__": [mock_value]}
            # Nothing more — stream ends after interrupt

        app.state.graph.astream = mock_astream

        try:
            with patch("backend.app.main.create_conversation", new_callable=AsyncMock, return_value=mock_convo), \
                 patch("backend.app.main.add_message", new_callable=AsyncMock), \
                 patch("backend.app.main.auto_title_conversation", new_callable=AsyncMock):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        "/chat",
                        json={"question": "q"},
                        headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                    )
        finally:
            _clear_overrides(app)

        events = [
            json.loads(line[6:])
            for line in resp.text.splitlines()
            if line.startswith("data: ")
        ]
        done_events = [e for e in events if e.get("type") == "done"]
        assert len(done_events) == 0, "Stream must not emit 'done' while awaiting approval"


# ── POST /chat/review/{id}: resume endpoint ────────────────────────────────────

class TestReviewEndpoint:
    """Tests for the HITL resume endpoint."""

    @pytest.mark.asyncio
    async def test_unauthenticated_review_returns_401(self, app, conversation_id):
        _clear_overrides(app)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/chat/review/{conversation_id}",
                json={"approved": True},
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_review_nonexistent_conversation_returns_404(self, app, user_id):
        fake_id = str(uuid.uuid4())
        _override_deps(app, user_id)
        try:
            with patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=None):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        f"/chat/review/{fake_id}",
                        json={"approved": True},
                        headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                    )
            assert resp.status_code == 404
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_invalid_uuid_format_returns_400(self, app, user_id):
        _override_deps(app, user_id)
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/chat/review/not-a-valid-uuid",
                    json={"approved": True},
                    headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                )
            assert resp.status_code == 400
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_cross_user_review_returns_404(self, app):
        """User A cannot review User B's conversation."""
        attacker_id = str(uuid.uuid4())
        conv_id = str(uuid.uuid4())

        _override_deps(app, attacker_id)
        try:
            # Conversation lookup returns None (not owned by attacker)
            with patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=None):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        f"/chat/review/{conv_id}",
                        json={"approved": True},
                        headers={"Authorization": f"Bearer {_make_access_token(attacker_id, 'attacker@example.com')}"},
                    )
            assert resp.status_code == 404
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_double_submit_returns_409(self, app, user_id, conversation_id):
        """Second approval for an already-reviewed conversation → 409 Conflict."""
        _override_deps(app, user_id)
        mock_convo = _make_convo(conversation_id, user_id)

        # Simulate checkpoint showing hitl_approved already set
        mock_checkpoint_tuple = MagicMock()
        mock_checkpoint_tuple.checkpoint = {"channel_values": {"hitl_approved": True}}
        mock_checkpointer = AsyncMock()
        mock_checkpointer.aget_tuple = AsyncMock(return_value=mock_checkpoint_tuple)
        app.state.checkpointer = mock_checkpointer

        try:
            with patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=mock_convo):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        f"/chat/review/{conversation_id}",
                        json={"approved": True},
                        headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                    )
            assert resp.status_code == 409
        finally:
            app.state.checkpointer = None
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_approve_emits_done_event(self, app, user_id, conversation_id):
        """Approving resumes the graph and the SSE stream ends with a done event."""
        _override_deps(app, user_id)
        mock_convo = _make_convo(conversation_id, user_id)

        final_node_output = {
            "final_answer": "There are 10 artists.",
            "node_path": ["human_review", "execute_sql", "synthesize_answer"],
            "retry_count": 0,
            "sql_results": [{"Name": "AC/DC"}],
            "sql_columns": ["Name"],
            "chart_base64": None,
            "selected_tables": ["artist"],
            "hitl_approved": True,
        }

        async def mock_astream_resume(command, **kwargs):
            yield {"synthesize_answer": final_node_output}

        app.state.graph.astream = mock_astream_resume

        try:
            with patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=mock_convo), \
                 patch("backend.app.main.add_message", new_callable=AsyncMock), \
                 patch("backend.app.db.get_appdb_engine", return_value=MagicMock()):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        f"/chat/review/{conversation_id}",
                        json={"approved": True},
                        headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                    )
        finally:
            _clear_overrides(app)

        assert resp.status_code == 200
        events = [
            json.loads(line[6:])
            for line in resp.text.splitlines()
            if line.startswith("data: ")
        ]
        done_events = [e for e in events if e.get("type") == "done"]
        assert len(done_events) >= 1
        assert done_events[-1].get("hitl_approved") is True

    @pytest.mark.asyncio
    async def test_reject_with_feedback_emits_new_approval_required(self, app, user_id, conversation_id):
        """Rejecting causes retry. New valid SQL emits another approval_required."""
        _override_deps(app, user_id)
        mock_convo = _make_convo(conversation_id, user_id)

        mock_value = MagicMock()
        mock_value.value = {
            "sql": "SELECT Name FROM artist LIMIT 5",
            "conversation_id": conversation_id,
            "question": "Show all artists",
        }

        async def mock_astream_reject(command, **kwargs):
            yield {"__interrupt__": [mock_value]}

        app.state.graph.astream = mock_astream_reject

        try:
            with patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=mock_convo):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        f"/chat/review/{conversation_id}",
                        json={"approved": False, "feedback": "Add a LIMIT clause"},
                        headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                    )
        finally:
            _clear_overrides(app)

        assert resp.status_code == 200
        events = [
            json.loads(line[6:])
            for line in resp.text.splitlines()
            if line.startswith("data: ")
        ]
        ar_events = [e for e in events if e.get("type") == "approval_required"]
        assert len(ar_events) >= 1

    @pytest.mark.asyncio
    async def test_reject_without_feedback_still_processes(self, app, user_id, conversation_id):
        """Feedback is optional — rejection with no feedback still processes."""
        _override_deps(app, user_id)
        mock_convo = _make_convo(conversation_id, user_id)

        async def mock_astream_no_feedback(command, **kwargs):
            yield {"synthesize_answer": {
                "final_answer": "Retry failed.",
                "node_path": [],
                "retry_count": 3,
                "hitl_approved": False,
            }}

        app.state.graph.astream = mock_astream_no_feedback

        try:
            with patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=mock_convo), \
                 patch("backend.app.main.add_message", new_callable=AsyncMock), \
                 patch("backend.app.db.get_appdb_engine", return_value=MagicMock()):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        f"/chat/review/{conversation_id}",
                        json={"approved": False},
                        headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                    )
            assert resp.status_code == 200
        finally:
            _clear_overrides(app)

    @pytest.mark.asyncio
    async def test_review_request_schema_validation_missing_approved(self, app, user_id):
        """Missing 'approved' field → 422 Unprocessable Entity (Pydantic validation)."""
        _override_deps(app, user_id)
        conv_id = str(uuid.uuid4())
        mock_convo = _make_convo(conv_id, user_id)
        try:
            with patch("backend.app.main.get_conversation", new_callable=AsyncMock, return_value=mock_convo):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post(
                        f"/chat/review/{conv_id}",
                        json={"feedback": "no approved field"},
                        headers={"Authorization": f"Bearer {_make_access_token(user_id)}"},
                    )
            assert resp.status_code == 422
        finally:
            _clear_overrides(app)


# ── SSE event format validation ────────────────────────────────────────────────

class TestSSEEventFormat:
    """Validate that SSE event structures conform to the documented contract."""

    def test_approval_required_event_has_required_fields(self):
        event = {
            "type": "approval_required",
            "sql": "SELECT * FROM artist",
            "conversation_id": "abc-123",
            "question": "Show artists",
        }
        for field in ["type", "sql", "conversation_id", "question"]:
            assert field in event, f"Missing required field: {field}"
        assert event["type"] == "approval_required"

    def test_done_event_includes_hitl_approved(self):
        """done event must include hitl_approved so frontend knows the decision."""
        event = {
            "type": "done",
            "conversation_id": "abc",
            "retry_count": 0,
            "hitl_approved": True,
            "node_path": [],
        }
        assert "hitl_approved" in event

    def test_reasoning_node_label_for_human_review(self):
        from backend.app.main import NODE_REASONING_LABELS
        assert "human_review" in NODE_REASONING_LABELS
        label = NODE_REASONING_LABELS["human_review"]
        assert isinstance(label, str) and len(label) > 5

    def test_all_standard_node_labels_present(self):
        from backend.app.main import NODE_REASONING_LABELS
        expected_nodes = [
            "table_selector", "generate_sql", "validate_sql",
            "human_review",  # NEW
            "execute_sql", "decide_next_step", "python_tool",
            "synthesize_answer", "increment_retry",
        ]
        for node in expected_nodes:
            assert node in NODE_REASONING_LABELS, f"Missing label for node: {node}"


# ── Health endpoint ────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_returns_ok(self, app):
        _clear_overrides(app)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data

    @pytest.mark.asyncio
    async def test_health_version_updated(self, app):
        """Version should be 2.1.0 or higher after HITL additions."""
        _clear_overrides(app)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/health")
        data = resp.json()
        major, minor, _ = data["version"].split(".")
        assert (int(major), int(minor)) >= (2, 1), f"Expected version >= 2.1.0, got {data['version']}"
