"""
tests/test_nodes.py
Unit tests for each LangGraph node.
LLM is mocked — tests focus on node logic, not model quality.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── validate_sql tests ────────────────────────────────────────────────────────

class TestValidateSqlNode:
    """Test SQL validation logic with mocked schema."""

    MOCK_SCHEMA = {
        "artist": ["artistid", "name"],
        "album": ["albumid", "title", "artistid"],
        "track": ["trackid", "name", "albumid"],
        "customer": ["customerid", "firstname", "lastname", "country"],
        "invoice": ["invoiceid", "customerid", "invoicedate", "total"],
    }

    @pytest.fixture(autouse=True)
    def mock_schema(self):
        with patch(
            "backend.app.nodes.validate_sql.get_schema_tables_columns_async",
            new_callable=AsyncMock,
            return_value=self.MOCK_SCHEMA,
        ):
            yield

    @pytest.mark.asyncio
    async def test_valid_select(self, base_state):
        from backend.app.nodes.validate_sql import validate_sql_node
        state = {**base_state, "generated_sql": "SELECT Name FROM artist"}
        result = await validate_sql_node(state)
        assert result["sql_valid"] is True
        assert result["validation_error"] is None

    @pytest.mark.asyncio
    async def test_rejects_drop(self, base_state):
        from backend.app.nodes.validate_sql import validate_sql_node
        state = {**base_state, "generated_sql": "DROP TABLE artist"}
        result = await validate_sql_node(state)
        assert result["sql_valid"] is False
        assert result["validation_error"] is not None

    @pytest.mark.asyncio
    async def test_rejects_insert(self, base_state):
        from backend.app.nodes.validate_sql import validate_sql_node
        state = {**base_state, "generated_sql": "INSERT INTO artist VALUES (1, 'test')"}
        result = await validate_sql_node(state)
        assert result["sql_valid"] is False

    @pytest.mark.asyncio
    async def test_rejects_multiple_statements(self, base_state):
        from backend.app.nodes.validate_sql import validate_sql_node
        state = {
            **base_state,
            "generated_sql": "SELECT 1; DROP TABLE artist; --",
        }
        result = await validate_sql_node(state)
        assert result["sql_valid"] is False

    @pytest.mark.asyncio
    async def test_rejects_unknown_table(self, base_state):
        from backend.app.nodes.validate_sql import validate_sql_node
        state = {**base_state, "generated_sql": "SELECT * FROM nonexistent_table"}
        result = await validate_sql_node(state)
        assert result["sql_valid"] is False
        assert "nonexistent_table" in result["validation_error"]

    @pytest.mark.asyncio
    async def test_cannot_answer_signal(self, base_state):
        from backend.app.nodes.validate_sql import validate_sql_node
        state = {
            **base_state,
            "generated_sql": "CANNOT_ANSWER: The schema has no salary data",
        }
        result = await validate_sql_node(state)
        assert result["sql_valid"] is False
        assert "CANNOT_ANSWER" in result["validation_error"].upper()

    @pytest.mark.asyncio
    async def test_rejects_syntax_error(self, base_state):
        from backend.app.nodes.validate_sql import validate_sql_node
        state = {**base_state, "generated_sql": "SELECT FROM WHERE artist"}
        result = await validate_sql_node(state)
        assert result["sql_valid"] is False

    @pytest.mark.asyncio
    async def test_valid_join(self, base_state):
        from backend.app.nodes.validate_sql import validate_sql_node
        state = {
            **base_state,
            "generated_sql": (
                "SELECT ar.Name, COUNT(al.AlbumId) as album_count "
                "FROM artist ar JOIN album al ON ar.ArtistId = al.ArtistId "
                "GROUP BY ar.Name"
            ),
        }
        result = await validate_sql_node(state)
        assert result["sql_valid"] is True

    @pytest.mark.asyncio
    async def test_node_path_appended(self, base_state):
        from backend.app.nodes.validate_sql import validate_sql_node
        state = {**base_state, "generated_sql": "SELECT Name FROM artist"}
        result = await validate_sql_node(state)
        assert "validate_sql" in result["node_path"]


# ── generate_sql tests ────────────────────────────────────────────────────────

class TestGenerateSqlNode:
    @pytest.mark.asyncio
    async def test_generates_sql_from_question(self, base_state):
        from backend.app.nodes.generate_sql import generate_sql_node
        mock_response = MagicMock()
        mock_response.content = "SELECT Name FROM artist"

        with patch("backend.app.nodes.generate_sql.get_llm") as mock_get_llm:
            mock_llm = AsyncMock()
            mock_llm.ainvoke = AsyncMock(return_value=mock_response)
            mock_get_llm.return_value = mock_llm

            result = await generate_sql_node(base_state)

        assert result["generated_sql"] == "SELECT Name FROM artist"
        assert "generate_sql" in result["node_path"]

    @pytest.mark.asyncio
    async def test_includes_error_context_on_retry(self, base_state):
        from backend.app.nodes.generate_sql import generate_sql_node
        mock_response = MagicMock()
        mock_response.content = "SELECT Name FROM artist"
        captured_messages = []

        with patch("backend.app.nodes.generate_sql.get_llm") as mock_get_llm:
            async def capture_invoke(messages):
                captured_messages.extend(messages)
                return mock_response

            mock_llm = MagicMock()
            mock_llm.ainvoke = capture_invoke
            mock_get_llm.return_value = mock_llm

            state = {
                **base_state,
                "validation_error": "Unknown table: nonexistent",
                "retry_count": 1,
            }
            await generate_sql_node(state)

        # Verify error context was included in the prompt
        user_msg_content = captured_messages[-1].content
        assert "PREVIOUS ATTEMPT" in user_msg_content
        assert "nonexistent" in user_msg_content


# ── execute_sql tests ─────────────────────────────────────────────────────────

class TestExecuteSqlNode:
    @pytest.mark.asyncio
    async def test_successful_execution(self, base_state):
        from backend.app.nodes.execute_sql import execute_sql_node
        mock_rows = [{"ArtistId": 1, "Name": "AC/DC"}]

        with patch(
            "backend.app.nodes.execute_sql.execute_chinook_query",
            new_callable=AsyncMock,
            return_value=mock_rows,
        ):
            state = {**base_state, "generated_sql": "SELECT * FROM artist LIMIT 1"}
            result = await execute_sql_node(state)

        assert result["sql_results"] == mock_rows
        assert result["execution_error"] is None

    @pytest.mark.asyncio
    async def test_timeout_handled(self, base_state):
        from backend.app.nodes.execute_sql import execute_sql_node
        import asyncio

        async def slow_query(*args, **kwargs):
            await asyncio.sleep(100)

        with patch(
            "backend.app.nodes.execute_sql.execute_chinook_query",
            side_effect=slow_query,
        ):
            with patch("backend.app.nodes.execute_sql.asyncio.wait_for") as mock_wait:
                mock_wait.side_effect = asyncio.TimeoutError()
                state = {**base_state, "generated_sql": "SELECT * FROM artist"}
                result = await execute_sql_node(state)

        assert result["sql_results"] is None
        assert "timed out" in result["execution_error"].lower()

    @pytest.mark.asyncio
    async def test_db_error_handled(self, base_state):
        from backend.app.nodes.execute_sql import execute_sql_node

        with patch(
            "backend.app.nodes.execute_sql.execute_chinook_query",
            new_callable=AsyncMock,
            side_effect=Exception("column does not exist"),
        ):
            state = {**base_state, "generated_sql": "SELECT bad_col FROM artist"}
            result = await execute_sql_node(state)

        assert result["sql_results"] is None
        assert result["execution_error"] is not None


# ── Graph retry logic tests ───────────────────────────────────────────────────

class TestRetryLogic:
    """Test the graph's conditional routing for retry behavior."""

    def test_route_after_validate_valid(self):
        from backend.app.graph_routing import route_after_validate
        state = {"sql_valid": True, "retry_count": 0}
        assert route_after_validate(state) == "execute_sql"

    def test_route_after_validate_retry(self):
        from backend.app.graph_routing import route_after_validate
        state = {
            "sql_valid": False,
            "validation_error": "Unknown table",
            "retry_count": 0,
        }
        assert route_after_validate(state) == "retry_generate"

    def test_route_after_validate_exhausted(self):
        from backend.app.graph_routing import route_after_validate
        state = {
            "sql_valid": False,
            "validation_error": "Unknown table",
            "retry_count": 3,
        }
        assert route_after_validate(state) == "synthesize_answer"

    def test_route_cannot_answer_skips_retry(self):
        from backend.app.graph_routing import route_after_validate
        state = {
            "sql_valid": False,
            "validation_error": "CANNOT_ANSWER: no salary data",
            "retry_count": 0,
        }
        # Even with retries left, CANNOT_ANSWER goes straight to synthesis
        assert route_after_validate(state) == "synthesize_answer"

    def test_route_after_execute_success(self):
        from backend.app.graph_routing import route_after_execute
        state = {"execution_error": None, "sql_results": [{"a": 1}], "retry_count": 0}
        assert route_after_execute(state) == "decide_next_step"

    def test_route_after_execute_error_retry(self):
        from backend.app.graph_routing import route_after_execute
        state = {"execution_error": "column not found", "retry_count": 1}
        assert route_after_execute(state) == "retry_generate"

    def test_route_after_execute_error_exhausted(self):
        from backend.app.graph_routing import route_after_execute
        state = {"execution_error": "column not found", "retry_count": 3}
        assert route_after_execute(state) == "synthesize_answer"
