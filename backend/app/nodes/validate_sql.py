"""
nodes/validate_sql.py
SQL validation node using sqlglot (AST-based, not regex).

Upgrades over the previous version:
  - Semantic Error Reflection: when a column or table reference is invalid,
    fuzzy-match it against the real schema using difflib (stdlib, no extra dep)
    and include a "Did you mean X?" hint in the error message.
  - This hint is passed back to generate_sql on retry, enabling the LLM to
    self-correct typos immediately rather than guessing.

Checks:
  1. CANNOT_ANSWER signal from LLM
  2. Parse without syntax errors (sqlglot)
  3. Single SELECT statement (no DDL/DML/multiple statements)
  4. All referenced tables exist in schema allowlist
  5. All referenced columns exist in their tables (with fuzzy hint on failure)
"""
import difflib
import uuid

import sqlglot
import sqlglot.expressions as exp

from . import AgentState
from ..db import get_schema_tables_columns_async
from ..schema_catalog import dynamic_catalog

# DDL/DML statement types that are never allowed
def _get_exp_type(name: str):
    return getattr(exp, name, None)

FORBIDDEN_STATEMENT_TYPES = tuple(
    t for t in [
        _get_exp_type("Drop"),
        _get_exp_type("Create"),
        _get_exp_type("Insert"),
        _get_exp_type("Update"),
        _get_exp_type("Delete"),
        _get_exp_type("Alter"),
        _get_exp_type("AlterTable"),
        _get_exp_type("Command"),
        _get_exp_type("Transaction"),
        _get_exp_type("Var"),
    ]
    if t is not None
)


def _fuzzy_hint(name: str, candidates: list[str], n: int = 3) -> str:
    """
    Return a human-readable 'Did you mean X?' hint using difflib sequence matching.
    Falls back to empty string if no close match is found.
    """
    matches = difflib.get_close_matches(name.lower(), candidates, n=n, cutoff=0.5)
    if matches:
        options = ", ".join(f"'{m}'" for m in matches)
        return f" Did you mean: {options}?"
    return ""


async def validate_sql_node(state: AgentState) -> AgentState:
    """Parse and validate the generated SQL. Sets sql_valid and validation_error."""
    node_path = list(state.get("node_path", []))
    node_path.append("validate_sql")

    sql = state.get("generated_sql", "")

    # ── 1. CANNOT_ANSWER signal ───────────────────────────────────────────────
    if sql.upper().startswith("CANNOT_ANSWER"):
        return {
            **state,
            "sql_valid": False,
            "validation_error": sql,
            "node_path": node_path,
        }

    # ── 2. Parse with sqlglot ─────────────────────────────────────────────────
    try:
        statements = sqlglot.parse(sql, dialect="postgres")
    except sqlglot.errors.ParseError as e:
        return {
            **state,
            "sql_valid": False,
            "validation_error": f"SQL syntax error: {e}",
            "node_path": node_path,
        }

    if not statements:
        return {
            **state,
            "sql_valid": False,
            "validation_error": "No SQL statement found in LLM output.",
            "node_path": node_path,
        }

    # ── 3. Exactly one SELECT ─────────────────────────────────────────────────
    if len(statements) > 1:
        return {
            **state,
            "sql_valid": False,
            "validation_error": (
                f"Only a single SELECT is allowed; got {len(statements)} statements."
            ),
            "node_path": node_path,
        }

    stmt = statements[0]

    for forbidden_type in FORBIDDEN_STATEMENT_TYPES:
        if isinstance(stmt, forbidden_type):
            return {
                **state,
                "sql_valid": False,
                "validation_error": (
                    f"Statement type {type(stmt).__name__} is not allowed. "
                    "Only SELECT queries are permitted."
                ),
                "node_path": node_path,
            }

    if not isinstance(stmt, exp.Select):
        return {
            **state,
            "sql_valid": False,
            "validation_error": f"Expected SELECT, got {type(stmt).__name__}.",
            "node_path": node_path,
        }

    # ── 4 & 5. Table + column allowlist with fuzzy hints ─────────────────────
    try:
        connection_id = state.get("connection_id")
        if connection_id:
            # BYODB: resolve allowlist from the user's engine
            from ..engine_pool import engine_pool
            engine = await engine_pool.get_engine(uuid.UUID(connection_id))
            schema_map = await dynamic_catalog.get_tables_columns(engine)
        else:
            # Chinook fast-path
            schema_map = await get_schema_tables_columns_async()
    except Exception as e:
        return {
            **state,
            "sql_valid": False,
            "validation_error": f"Could not load schema for validation: {e}",
            "node_path": node_path,
        }

    all_table_names = sorted(schema_map.keys())

    # Collect CTE names to exclude from table checking
    cte_names: set[str] = set()
    for cte in stmt.find_all(exp.CTE):
        if cte.alias:
            cte_names.add(cte.alias.lower())

    # ── Table check ───────────────────────────────────────────────────────────
    referenced_tables = {
        t.name.lower()
        for t in stmt.find_all(exp.Table)
        if t.name and t.name.lower() not in cte_names
    }

    unknown_tables = referenced_tables - set(schema_map.keys())
    if unknown_tables:
        unknown_str = ", ".join(f"'{t}'" for t in sorted(unknown_tables))
        hints = ""
        for ut in sorted(unknown_tables):
            h = _fuzzy_hint(ut, all_table_names)
            if h:
                hints += f"\n  '{ut}':{h}"

        return {
            **state,
            "sql_valid": False,
            "validation_error": (
                f"Unknown table(s): {unknown_str}.{hints}\n"
                f"Valid tables: {all_table_names}"
            ),
            "node_path": node_path,
        }

    # ── Column check (best-effort with fuzzy hints) ───────────────────────────
    # Build alias → real_table map from the FROM clause
    alias_map: dict[str, str] = {}
    for table_node in stmt.find_all(exp.Table):
        if table_node.name:
            real = table_node.name.lower()
            alias = table_node.alias.lower() if table_node.alias else real
            alias_map[alias] = real
            alias_map[real] = real  # real name also resolves to itself

    for col in stmt.find_all(exp.Column):
        if col.table:
            table_ref = col.table.lower()
            real_table = alias_map.get(table_ref)
            if real_table and real_table in schema_map:
                col_name = col.name.lower()
                valid_cols = schema_map[real_table]
                if col_name != "*" and col_name not in valid_cols:
                    hint = _fuzzy_hint(col_name, valid_cols)
                    return {
                        **state,
                        "sql_valid": False,
                        "validation_error": (
                            f"Column '{col_name}' does not exist in table '{real_table}'.{hint}\n"
                            f"Valid columns for '{real_table}': {valid_cols}"
                        ),
                        "node_path": node_path,
                    }

    return {
        **state,
        "sql_valid": True,
        "validation_error": None,
        "node_path": node_path,
    }
