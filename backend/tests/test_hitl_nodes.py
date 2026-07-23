"""
tests/test_hitl_nodes.py
Unit tests for the Human-in-the-Loop (HITL) node and routing functions.

Tests cover:
  - human_review_node: interrupt called, approved/rejected state propagation
  - route_after_review: all three routing outcomes
  - increment_retry: HITL state is cleared on retry
  - Integration with graph_routing retry budget
  - Edge cases: empty feedback, None feedback, budget exhaustion
"""
import pytest
from unittest.mock import patch


# ── Fixtures ────────────comple───────────────────────────────────────────────────────

@pytest.fixture
def hitl_base_state():
    """Base AgentState for HITL tests — SQL already validated."""
    return {
        "question": "Show all artists",
        "conversation_id": "conv-hitl-test-123",
        "user_id": "user-test-456",
        "generated_sql": "SELECT * FROM artist LIMIT 10",
        "sql_valid": True,
        "validation_error": None,
        "sql_results": None,
        "execution_error": None,
        "retry_count": 0,
        "node_path": ["table_selector", "generate_sql", "validate_sql"],
        "hitl_approved": None,
        "hitl_feedback": None,
        "needs_python_tool": False,
        "final_answer": None,
    }


# ── human_review_node tests ────────────────────────────────────────────────────

class TestHumanReviewNode:
    """Tests for the human_review_node that wraps langgraph.types.interrupt()."""

    @pytest.mark.asyncio
    async def test_approved_sets_hitl_approved_true(self, hitl_base_state):
        """When user approves, hitl_approved=True and validation_error stays None."""
        from backend.app.nodes.human_review import human_review_node

        with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
            mock_interrupt.return_value = {"approved": True, "feedback": None}
            result = await human_review_node(hitl_base_state)

        assert result["hitl_approved"] is True
        assert result["validation_error"] is None
        assert result["hitl_feedback"] is None
        assert "human_review" in result["node_path"]

    @pytest.mark.asyncio
    async def test_rejected_with_feedback(self, hitl_base_state):
        """Rejection with feedback populates validation_error for self-correction."""
        from backend.app.nodes.human_review import human_review_node

        feedback = "Use a JOIN instead of subquery"
        with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
            mock_interrupt.return_value = {"approved": False, "feedback": feedback}
            result = await human_review_node(hitl_base_state)

        assert result["hitl_approved"] is False
        assert result["hitl_feedback"] == feedback
        assert result["validation_error"] == feedback

    @pytest.mark.asyncio
    async def test_rejected_without_feedback_uses_default_message(self, hitl_base_state):
        """Rejection with no feedback uses a sensible default validation_error."""
        from backend.app.nodes.human_review import human_review_node

        with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
            mock_interrupt.return_value = {"approved": False, "feedback": None}
            result = await human_review_node(hitl_base_state)

        assert result["hitl_approved"] is False
        assert result["validation_error"] is not None
        assert len(result["validation_error"]) > 0

    @pytest.mark.asyncio
    async def test_rejected_with_empty_string_feedback_uses_default(self, hitl_base_state):
        """Empty string feedback is treated the same as no feedback."""
        from backend.app.nodes.human_review import human_review_node

        with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
            mock_interrupt.return_value = {"approved": False, "feedback": ""}
            result = await human_review_node(hitl_base_state)

        assert result["hitl_approved"] is False
        assert result["validation_error"] is not None

    @pytest.mark.asyncio
    async def test_interrupt_called_with_sql_and_conversation_id(self, hitl_base_state):
        """interrupt() receives the SQL and conversation_id for the frontend."""
        from backend.app.nodes.human_review import human_review_node

        with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
            mock_interrupt.return_value = {"approved": True}
            await human_review_node(hitl_base_state)

        mock_interrupt.assert_called_once()
        payload = mock_interrupt.call_args[0][0]
        assert payload["sql"] == hitl_base_state["generated_sql"]
        assert payload["conversation_id"] == hitl_base_state["conversation_id"]
        assert payload["question"] == hitl_base_state["question"]

    @pytest.mark.asyncio
    async def test_node_path_includes_human_review(self, hitl_base_state):
        """human_review is appended to node_path regardless of approval decision."""
        from backend.app.nodes.human_review import human_review_node

        for approved in [True, False]:
            with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
                mock_interrupt.return_value = {"approved": approved}
                result = await human_review_node(hitl_base_state)
            assert "human_review" in result["node_path"]

    @pytest.mark.asyncio
    async def test_state_fields_preserved_on_approval(self, hitl_base_state):
        """All existing state fields survive the HITL node unchanged."""
        from backend.app.nodes.human_review import human_review_node

        hitl_base_state["selected_tables"] = ["artist"]
        hitl_base_state["schema_text"] = "CREATE TABLE artist (...)"

        with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
            mock_interrupt.return_value = {"approved": True}
            result = await human_review_node(hitl_base_state)

        assert result["question"] == hitl_base_state["question"]
        assert result["generated_sql"] == hitl_base_state["generated_sql"]
        assert result.get("selected_tables") == ["artist"]

    @pytest.mark.asyncio
    async def test_very_long_feedback_is_preserved(self, hitl_base_state):
        """Long rejection feedback (1000 chars) is passed through without truncation."""
        from backend.app.nodes.human_review import human_review_node

        long_feedback = "Feedback: " + "x" * 990
        with patch("backend.app.nodes.human_review.interrupt") as mock_interrupt:
            mock_interrupt.return_value = {"approved": False, "feedback": long_feedback}
            result = await human_review_node(hitl_base_state)

        assert result["validation_error"] == long_feedback


# ── route_after_review tests ───────────────────────────────────────────────────

class TestRouteAfterReview:
    """Tests for the pure routing function that follows human_review."""

    def test_approved_routes_to_execute_sql(self):
        from backend.app.graph_routing import route_after_review
        state = {"hitl_approved": True, "retry_count": 0}
        assert route_after_review(state) == "execute_sql"

    def test_rejected_within_budget_routes_to_retry(self):
        from backend.app.graph_routing import route_after_review
        state = {"hitl_approved": False, "retry_count": 0}
        assert route_after_review(state) == "retry_generate"

    def test_rejected_within_budget_retry_count_2(self):
        from backend.app.graph_routing import route_after_review
        # max_retries default is 3, so retry_count=2 is still within budget
        state = {"hitl_approved": False, "retry_count": 2}
        assert route_after_review(state) == "retry_generate"

    def test_rejected_budget_exhausted_routes_to_synthesize(self):
        from backend.app.graph_routing import route_after_review
        # retry_count >= max_retries → give up
        state = {"hitl_approved": False, "retry_count": 3}
        assert route_after_review(state) == "synthesize_answer"

    def test_rejected_budget_exhausted_high_count(self):
        from backend.app.graph_routing import route_after_review
        state = {"hitl_approved": False, "retry_count": 100}
        assert route_after_review(state) == "synthesize_answer"

    def test_none_approved_acts_as_rejected(self):
        """hitl_approved=None (e.g., default state) should not route to execute_sql."""
        from backend.app.graph_routing import route_after_review
        state = {"hitl_approved": None, "retry_count": 0}
        # None is falsy — should not proceed to execute
        result = route_after_review(state)
        assert result != "execute_sql"

    def test_missing_hitl_approved_acts_as_rejected(self):
        """No hitl_approved key at all defaults to rejected path."""
        from backend.app.graph_routing import route_after_review
        state = {"retry_count": 0}
        result = route_after_review(state)
        assert result != "execute_sql"


# ── increment_retry HITL state clearing ───────────────────────────────────────

class TestIncrementRetryHITLClear:
    """increment_retry must clear HITL state so new SQL gets a fresh review."""

    @pytest.mark.asyncio
    async def test_increment_retry_clears_hitl_state(self):
        from backend.app.graph import increment_retry

        state = {
            "retry_count": 0,
            "hitl_approved": False,
            "hitl_feedback": "Wrong table used",
            "question": "test",
        }
        result = await increment_retry(state)

        assert result["retry_count"] == 1
        assert result["hitl_approved"] is None
        assert result["hitl_feedback"] is None

    @pytest.mark.asyncio
    async def test_increment_retry_preserves_other_state(self):
        from backend.app.graph import increment_retry

        state = {
            "retry_count": 1,
            "question": "Show artists",
            "generated_sql": "SELECT ...",
            "hitl_approved": False,
            "hitl_feedback": "feedback",
        }
        result = await increment_retry(state)

        assert result["retry_count"] == 2
        assert result["question"] == "Show artists"
        assert result["generated_sql"] == "SELECT ..."


# ── Graph integration: route_after_validate maps to human_review ──────────────

class TestGraphRouteAfterValidate:
    """After validation passes, the graph should route to human_review (HITL gate)."""

    def test_valid_sql_routes_to_human_review_via_graph(self):
        """
        Verify the graph wiring: route_after_validate('execute_sql') is re-mapped
        to 'human_review' in graph.py. Since we can't introspect compiled graphs
        easily, we verify the routing function produces 'execute_sql' (which graph.py
        redirects to 'human_review' via the conditional edge map).
        """
        from backend.app.graph_routing import route_after_validate

        state = {"sql_valid": True, "retry_count": 0, "validation_error": None}
        result = route_after_validate(state)
        # route_after_validate still returns "execute_sql" but graph.py maps that
        # edge destination to "human_review"
        assert result == "execute_sql"

    def test_invalid_sql_routes_to_retry_not_hitl(self):
        from backend.app.graph_routing import route_after_validate

        state = {"sql_valid": False, "retry_count": 0, "validation_error": "Syntax error"}
        assert route_after_validate(state) == "retry_generate"
