"""
tests/conftest.py
Shared test fixtures.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for the whole test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_llm():
    """Mock LLM that returns a configurable response."""
    mock = AsyncMock()
    mock.ainvoke = AsyncMock()
    return mock


@pytest.fixture
def base_state():
    """A minimal valid AgentState for testing."""
    return {
        "question": "Show me all artists",
        "conversation_id": "test-convo-id",
        "user_id": "test-user-id",
        "schema_text": """CREATE TABLE artist (
  ArtistId INTEGER NOT NULL PRIMARY KEY,
  Name TEXT
);

CREATE TABLE album (
  AlbumId INTEGER NOT NULL PRIMARY KEY,
  Title TEXT NOT NULL,
  ArtistId INTEGER NOT NULL  -- FK → artist.ArtistId
);

CREATE TABLE track (
  TrackId INTEGER NOT NULL PRIMARY KEY,
  Name TEXT NOT NULL,
  AlbumId INTEGER  -- FK → album.AlbumId
);

CREATE TABLE customer (
  CustomerId INTEGER NOT NULL PRIMARY KEY,
  FirstName TEXT NOT NULL,
  LastName TEXT NOT NULL,
  Country TEXT
);

CREATE TABLE invoice (
  InvoiceId INTEGER NOT NULL PRIMARY KEY,
  CustomerId INTEGER NOT NULL,  -- FK → customer.CustomerId
  InvoiceDate TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  Total NUMERIC NOT NULL
);""",
        "retry_count": 0,
        "node_path": [],
        "sql_valid": False,
        "generated_sql": None,
        "validation_error": None,
        "sql_results": None,
        "execution_error": None,
        "needs_python_tool": False,
        "python_output": None,
        "chart_base64": None,
        "final_answer": None,
        # HITL fields (new)
        "hitl_approved": None,
        "hitl_feedback": None,
    }


@pytest.fixture
def hitl_state():
    """A validated AgentState ready for the human_review HITL node."""
    return {
        "question": "Show me all artists",
        "conversation_id": "test-hitl-convo-id",
        "user_id": "test-user-id",
        "schema_text": "CREATE TABLE artist (ArtistId INTEGER PRIMARY KEY, Name TEXT);",
        "selected_tables": ["artist"],
        "generated_sql": "SELECT ArtistId, Name FROM artist ORDER BY Name",
        "sql_valid": True,
        "validation_error": None,
        "sql_results": None,
        "sql_columns": None,
        "execution_error": None,
        "retry_count": 0,
        "node_path": ["table_selector", "generate_sql", "validate_sql"],
        "needs_python_tool": False,
        "python_output": None,
        "chart_base64": None,
        "final_answer": None,
        "hitl_approved": None,
        "hitl_feedback": None,
    }
