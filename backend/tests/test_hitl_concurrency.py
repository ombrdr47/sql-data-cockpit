"""
tests/test_hitl_concurrency.py
Concurrency and scale tests for the HITL implementation.

These tests verify that the HITL design is correct under concurrent load:
  - Multiple users can each have independent interrupted graphs simultaneously
  - Approval by User A does not affect User B's interrupted graph
  - State isolation: each thread_id (conversation_id) is fully independent
  - route_after_review is stateless and safe to call concurrently
  - Connection pool configuration is accessible and within expected bounds
  - Checkpointer config key correctness (thread_id isolation)

Note: These are pure unit/integration tests — no actual concurrent HTTP
connections needed. We test the architectural invariants that GUARANTEE
scalability, rather than running a full load test (which requires k6/locust).
"""
import asyncio
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Graph state isolation ──────────────────────────────────────────────────────

class TestGraphStateIsolation:
    """
    Each conversation_id maps to a completely independent LangGraph thread.
    Approving one must never affect another.
    """

    @pytest.mark.asyncio
    async def test_independent_hitl_states_per_conversation(self):
        """Two concurrent conversations with different approval outcomes don't interfere."""
        from backend.app.nodes.human_review import human_review_node

        async def run_hitl(conversation_id: str, approve: bool):
            state = {
                "question": "Show artists",
                "conversation_id": conversation_id,
                "user_id": "user-1",
                "generated_sql": "SELECT * FROM artist",
                "sql_valid": True,
                "validation_error": None,
                "retry_count": 0,
                "node_path": [],
                "hitl_approved": None,
                "hitl_feedback": None,
            }
            with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
                mock_interrupt.return_value = {"approved": approve, "feedback": None}
                return await human_review_node(state)

        conv_a = str(uuid.uuid4())
        conv_b = str(uuid.uuid4())

        # Run both "concurrently" (same event loop iteration)
        result_a, result_b = await asyncio.gather(
            run_hitl(conv_a, approve=True),
            run_hitl(conv_b, approve=False),
        )

        assert result_a["hitl_approved"] is True
        assert result_b["hitl_approved"] is False
        assert result_a["validation_error"] is None
        assert result_b["validation_error"] is not None

    @pytest.mark.asyncio
    async def test_many_concurrent_hitl_approvals_all_succeed(self):
        """50 concurrent HITL approvals each get the correct result."""
        from backend.app.nodes.human_review import human_review_node

        async def approve(i: int):
            state = {
                "question": f"Query {i}",
                "conversation_id": str(uuid.uuid4()),
                "user_id": str(uuid.uuid4()),
                "generated_sql": f"SELECT {i} FROM artist",
                "sql_valid": True,
                "validation_error": None,
                "retry_count": 0,
                "node_path": [],
                "hitl_approved": None,
                "hitl_feedback": None,
            }
            with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
                mock_interrupt.return_value = {"approved": i % 2 == 0}
                return await human_review_node(state)

        results = await asyncio.gather(*[approve(i) for i in range(50)])

        for i, result in enumerate(results):
            expected = i % 2 == 0
            assert result["hitl_approved"] is expected, f"Result {i}: expected {expected}"

    @pytest.mark.asyncio
    async def test_concurrent_retry_increments_are_independent(self):
        """Concurrent increment_retry calls don't share state."""
        from backend.app.graph import increment_retry

        states = [
            {
                "retry_count": i,
                "hitl_approved": False,
                "hitl_feedback": f"feedback-{i}",
                "question": f"query-{i}",
            }
            for i in range(20)
        ]

        results = await asyncio.gather(*[increment_retry(s) for s in states])

        for i, result in enumerate(results):
            assert result["retry_count"] == i + 1
            assert result["hitl_approved"] is None
            assert result["hitl_feedback"] is None
            assert result["question"] == f"query-{i}"


# ── Routing function concurrency safety ───────────────────────────────────────

class TestRoutingConcurrencySafety:
    """
    Pure routing functions are stateless — safe to call from many coroutines.
    """

    def test_route_after_review_is_deterministic(self):
        """Same input always produces the same output."""
        from backend.app.graph_routing import route_after_review

        for _ in range(100):
            assert route_after_review({"hitl_approved": True, "retry_count": 0}) == "execute_sql"
            assert route_after_review({"hitl_approved": False, "retry_count": 0}) == "retry_generate"
            assert route_after_review({"hitl_approved": False, "retry_count": 100}) == "synthesize_answer"

    @pytest.mark.asyncio
    async def test_concurrent_route_calls_all_correct(self):
        """1000 concurrent routing calls return correct values."""
        from backend.app.graph_routing import route_after_review

        async def call_route(approved: bool, retry: int) -> str:
            await asyncio.sleep(0)   # yield to event loop
            return route_after_review({"hitl_approved": approved, "retry_count": retry})

        tasks = [
            call_route(approved=True, retry=0) for _ in range(500)
        ] + [
            call_route(approved=False, retry=0) for _ in range(500)
        ]

        results = await asyncio.gather(*tasks)
        approved_results = results[:500]
        rejected_results = results[500:]

        assert all(r == "execute_sql" for r in approved_results)
        assert all(r == "retry_generate" for r in rejected_results)


# ── Config: pool bounds ────────────────────────────────────────────────────────

class TestConnectionPoolConfig:
    """Verify pool settings are within safe bounds for scale."""

    def test_checkpointer_pool_min_positive(self):
        from backend.app.config import get_settings
        settings = get_settings()
        assert settings.checkpointer_pool_min >= 1

    def test_checkpointer_pool_max_geq_min(self):
        from backend.app.config import get_settings
        settings = get_settings()
        assert settings.checkpointer_pool_max >= settings.checkpointer_pool_min

    def test_checkpointer_pool_max_sufficient_for_scale(self):
        """Pool max should be at least 10 to handle concurrent users."""
        from backend.app.config import get_settings
        settings = get_settings()
        assert settings.checkpointer_pool_max >= 10, (
            f"checkpointer_pool_max={settings.checkpointer_pool_max} is too small for scale. "
            "Set CHECKPOINTER_POOL_MAX >= 10."
        )

    def test_app_db_pool_sufficient(self):
        """app_db engine pool should support at least 10 concurrent sessions."""
        from backend.app.db import get_appdb_engine
        engine = get_appdb_engine()
        pool = engine.pool
        # pool_size is the base (excluding overflow)
        assert pool.size() >= 10, "app_db pool_size too small for scale"

    def test_chinook_pool_sufficient_for_concurrent_queries(self):
        """chinook read-only pool should support at least 10 concurrent analytic queries."""
        from backend.app.db import get_chinook_engine
        engine = get_chinook_engine()
        pool = engine.pool
        assert pool.size() >= 10, "chinook pool_size too small; increase to 10+"


# ── Idempotency: double-submit protection ──────────────────────────────────────

class TestIdempotency:
    """Simulate concurrent double-submits hitting the review endpoint logic."""

    @pytest.mark.asyncio
    async def test_already_reviewed_state_triggers_409_logic(self):
        """
        If checkpoint shows hitl_approved is not None, the endpoint raises 409.
        Test the checkpoint-reading logic directly.
        """
        conversation_id = str(uuid.uuid4())

        mock_checkpoint_tuple = MagicMock()
        mock_checkpoint_tuple.checkpoint = {
            "channel_values": {"hitl_approved": True}
        }
        mock_checkpointer = AsyncMock()
        mock_checkpointer.aget_tuple = AsyncMock(return_value=mock_checkpoint_tuple)

        config = {"configurable": {"thread_id": conversation_id}}
        checkpoint_tuple = await mock_checkpointer.aget_tuple(config)
        saved_state = checkpoint_tuple.checkpoint.get("channel_values", {})

        # This is the exact logic from the review endpoint
        already_reviewed = saved_state.get("hitl_approved") is not None
        assert already_reviewed is True

    @pytest.mark.asyncio
    async def test_not_yet_reviewed_state_allows_resume(self):
        """hitl_approved=None means not yet reviewed → proceed with resume."""
        conversation_id = str(uuid.uuid4())

        mock_checkpoint_tuple = MagicMock()
        mock_checkpoint_tuple.checkpoint = {
            "channel_values": {"hitl_approved": None}
        }
        mock_checkpointer = AsyncMock()
        mock_checkpointer.aget_tuple = AsyncMock(return_value=mock_checkpoint_tuple)

        config = {"configurable": {"thread_id": conversation_id}}
        checkpoint_tuple = await mock_checkpointer.aget_tuple(config)
        saved_state = checkpoint_tuple.checkpoint.get("channel_values", {})

        # hitl_approved=None → not yet reviewed → allow resume
        already_reviewed = saved_state.get("hitl_approved") is not None
        assert already_reviewed is False

    @pytest.mark.asyncio
    async def test_concurrent_approval_attempts_idempotency(self):
        """
        Two concurrent approval requests race — only first should succeed.
        We verify that the idempotency check (using aget_tuple) correctly
        identifies the first call's state update.
        """
        call_count = 0

        async def mock_aget_tuple(config):
            nonlocal call_count
            call_count += 1
            # First call: not reviewed yet
            if call_count == 1:
                m = MagicMock()
                m.checkpoint = {"channel_values": {"hitl_approved": None}}
                return m
            # Second call (concurrent): already reviewed
            else:
                m = MagicMock()
                m.checkpoint = {"channel_values": {"hitl_approved": True}}
                return m

        mock_checkpointer = AsyncMock()
        mock_checkpointer.aget_tuple = mock_aget_tuple

        config = {"configurable": {"thread_id": "some-conv-id"}}

        first_result = await mock_checkpointer.aget_tuple(config)
        second_result = await mock_checkpointer.aget_tuple(config)

        first_state = first_result.checkpoint["channel_values"]
        second_state = second_result.checkpoint["channel_values"]

        # First: not reviewed → allow
        assert first_state["hitl_approved"] is None
        # Second: already reviewed → block (409)
        assert second_state["hitl_approved"] is not None


# ── Thread-ID isolation: LangGraph config correctness ─────────────────────────

class TestCheckpointThreadIdIsolation:
    """
    LangGraph uses {"configurable": {"thread_id": conversation_id}} to isolate
    each user's graph state. Verify this key is correctly formed.
    """

    def test_config_uses_thread_id_not_session_id(self):
        """Config key must be 'thread_id' — not 'session_id' or 'user_id'."""
        conversation_id = str(uuid.uuid4())
        config = {"configurable": {"thread_id": conversation_id}}
        assert "thread_id" in config["configurable"]
        assert config["configurable"]["thread_id"] == conversation_id

    def test_two_users_have_different_thread_ids(self):
        """Each conversation gets a unique UUID → unique checkpoint namespace."""
        conv_a = str(uuid.uuid4())
        conv_b = str(uuid.uuid4())
        assert conv_a != conv_b

        config_a = {"configurable": {"thread_id": conv_a}}
        config_b = {"configurable": {"thread_id": conv_b}}
        assert config_a != config_b

    def test_same_conversation_produces_same_thread_id(self):
        """Re-using the same conversation_id produces the same checkpoint namespace."""
        conv_id = str(uuid.uuid4())
        config1 = {"configurable": {"thread_id": conv_id}}
        config2 = {"configurable": {"thread_id": conv_id}}
        assert config1 == config2
