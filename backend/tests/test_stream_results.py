"""Distinguish a successful empty query from an execution failure in the UI."""
from types import SimpleNamespace

import pytest

from backend.app.main import _stream_graph_events


@pytest.mark.asyncio
@pytest.mark.parametrize("rows, expected_tables", [([], 1), (None, 0)])
async def test_empty_success_emits_table_but_failure_does_not(rows, expected_tables):
    async def stream(*args, **kwargs):
        yield {"execute_sql": {
            "sql_results": rows,
            "sql_columns": ["country"],
            "execution_error": "Query failed" if rows is None else None,
        }}

    events = [event async for event in _stream_graph_events(SimpleNamespace(astream=stream), {}, {})]
    tables = [payload for kind, payload, _ in events if kind == "table"]
    assert len(tables) == expected_tables
    if tables:
        assert tables[0]["rows"] == []
        assert tables[0]["total_rows"] == 0
        assert tables[0]["columns"] == ["country"]
