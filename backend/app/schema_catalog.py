"""
app/schema_catalog.py
Schema catalog: structured metadata for dynamic schema pruning (RAG for tables).

Provides:
  - Full schema structured as Python dicts (table → columns + descriptions)
  - Sample rows per table (3 rows, fetched once and cached)
  - get_pruned_schema_text(question) — selects only relevant tables based on
    lexical keyword matching + FK join-path expansion

This demonstrates the production pattern for databases with 100+ tables where
dumping the entire schema into every prompt is impractical.
"""
import asyncio
from typing import Optional

from sqlalchemy import text

# ── Static semantic descriptions ──────────────────────────────────────────────
# One sentence per table describing its business domain. These help the LLM
# understand what each table contains without reading all columns.

TABLE_DESCRIPTIONS: dict[str, str] = {
    "artists":       "Recording artists and bands in the music catalog.",
    "albums":        "Albums (collections of tracks) linked to an artist.",
    "tracks":        "Individual songs/tracks: title, duration, genre, price, media type.",
    "genres":        "Music genre classifications (Rock, Jazz, Pop, etc.).",
    "media_types":   "Audio file format types (MPEG, AAC, etc.).",
    "playlists":     "Named playlists that can contain multiple tracks.",
    "playlist_track": "Junction table linking playlists to tracks (many-to-many).",
    "customers":     "Customer accounts: name, country, email, support rep, billing.",
    "employees":     "Store employees with hierarchy (reportsTo) and contact info.",
    "invoices":      "Purchase invoices linked to customers: date, total, billing address.",
    "invoice_items": "Individual line items on each invoice: track, unit price, quantity.",
}

# ── FK graph (for join-path expansion) ───────────────────────────────────────
# Maps table → set of tables it is directly connected to via FK.
# Used to automatically include bridging tables when two selected tables need a join.

FK_GRAPH: dict[str, set[str]] = {
    "albums":         {"artists"},
    "tracks":         {"albums", "genres", "media_types"},
    "playlist_track": {"playlists", "tracks"},
    "customers":      {"employees"},
    "invoices":       {"customers"},
    "invoice_items":  {"invoices", "tracks"},
}

# Reverse edges for bidirectional lookup
_REVERSE_FK: dict[str, set[str]] = {}
for _tbl, _deps in FK_GRAPH.items():
    for _dep in _deps:
        _REVERSE_FK.setdefault(_dep, set()).add(_tbl)


def _connected_tables(table: str) -> set[str]:
    """Return all tables directly connected to `table` via FK (both directions)."""
    return FK_GRAPH.get(table, set()) | _REVERSE_FK.get(table, set())


# ── Keyword → table routing ───────────────────────────────────────────────────
# Maps keyword stems to the primary table(s) they imply.

KEYWORD_TABLE_MAP: dict[str, list[str]] = {
    # Music catalog
    "artist": ["artists", "albums"],
    "band":   ["artists"],
    "album":  ["albums", "artists"],
    "track":  ["tracks", "albums"],
    "song":   ["tracks"],
    "music":  ["tracks", "genres"],
    "genre":  ["genres", "tracks"],
    "playlist": ["playlists", "playlist_track", "tracks"],
    "format": ["media_types"],
    "media":  ["media_types"],
    "duration": ["tracks"],
    "length": ["tracks"],
    "price":  ["tracks", "invoice_items"],
    # Commerce
    "customer": ["customers", "invoices"],
    "revenue":  ["invoices", "invoice_items"],
    "sale":     ["invoices", "invoice_items"],
    "invoice":  ["invoices", "invoice_items"],
    "purchase": ["invoices", "invoice_items"],
    "spend":    ["invoices", "invoice_items"],
    "buy":      ["invoices", "invoice_items"],
    "total":    ["invoices", "invoice_items"],
    "country":  ["customers"],
    "city":     ["customers", "invoices"],
    "employee": ["employees"],
    "rep":      ["employees", "customers"],
    "support":  ["employees", "customers"],
    # Aggregation hints → need fact tables
    "top":     ["tracks", "artists", "invoices"],
    "most":    ["tracks", "artists", "invoices"],
    "best":    ["tracks", "artists", "invoices"],
    "popular": ["tracks", "playlists"],
    "count":   [],
    "year":    ["invoices"],
    "month":   ["invoices"],
    "date":    ["invoices"],
}


def select_relevant_tables(question: str) -> set[str]:
    """
    Given a natural language question, return the minimal set of tables needed.
    Uses keyword matching + FK join-path expansion.

    Example:
      "top 5 artists by track count" → {"artists", "tracks", "albums"}
      "total revenue per country"    → {"customers", "invoices", "invoice_items"}
    """
    q = question.lower()
    primary: set[str] = set()

    for keyword, tables in KEYWORD_TABLE_MAP.items():
        if keyword in q:
            primary.update(tables)

    # If nothing matched, return all tables (fallback = full schema)
    if not primary:
        return set(TABLE_DESCRIPTIONS.keys())

    # Expand: for each primary table, add all FK-connected tables that are
    # also referenced by another primary table (bridges needed for joins)
    expanded = set(primary)
    for t1 in primary:
        for t2 in primary:
            if t1 != t2:
                # If t1 and t2 share a common FK neighbour, include that neighbour
                shared = _connected_tables(t1) & _connected_tables(t2)
                expanded.update(shared)
        # Always include direct FK parents (needed for JOIN)
        expanded.update(FK_GRAPH.get(t1, set()))

    return expanded


# ── Sample rows cache ─────────────────────────────────────────────────────────

_SAMPLE_ROWS_CACHE: dict[str, list[dict]] = {}
_SCHEMA_STRUCT_CACHE: Optional[dict[str, list[dict]]] = None  # table → [{col,type,pk,fk}]


async def _load_schema_structure() -> dict[str, list[dict]]:
    """Load column metadata from information_schema (run once)."""
    global _SCHEMA_STRUCT_CACHE
    if _SCHEMA_STRUCT_CACHE is not None:
        return _SCHEMA_STRUCT_CACHE

    from .db import get_chinook_engine
    engine = get_chinook_engine()

    async with engine.connect() as conn:
        # Tables
        tables_res = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
        ))
        tables = [r[0] for r in tables_res.fetchall()]

        struct: dict[str, list[dict]] = {}
        for table in tables:
            cols_res = await conn.execute(text(
                "SELECT column_name, data_type, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=:t ORDER BY ordinal_position"
            ), {"t": table})
            cols = cols_res.fetchall()

            pk_res = await conn.execute(text(
                "SELECT kcu.column_name FROM information_schema.table_constraints tc "
                "JOIN information_schema.key_column_usage kcu "
                "  ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema "
                "WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public' AND tc.table_name=:t"
            ), {"t": table})
            pks = {r[0] for r in pk_res.fetchall()}

            fk_res = await conn.execute(text(
                "SELECT kcu.column_name, ccu.table_name "
                "FROM information_schema.table_constraints AS tc "
                "JOIN information_schema.key_column_usage AS kcu "
                "  ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema "
                "JOIN information_schema.constraint_column_usage AS ccu "
                "  ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema "
                "WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND tc.table_name=:t"
            ), {"t": table})
            fks = {r[0]: r[1] for r in fk_res.fetchall()}

            struct[table] = [
                {
                    "name": col_name,
                    "type": data_type.upper(),
                    "nullable": is_nullable == "YES",
                    "pk": col_name in pks,
                    "fk": fks.get(col_name),
                }
                for col_name, data_type, is_nullable in cols
            ]

    _SCHEMA_STRUCT_CACHE = struct
    return struct


async def _load_sample_rows(table: str, n: int = 3) -> list[dict]:
    """Fetch n sample rows from a table (cached after first call)."""
    if table in _SAMPLE_ROWS_CACHE:
        return _SAMPLE_ROWS_CACHE[table]

    from .db import get_chinook_engine
    engine = get_chinook_engine()
    try:
        async with engine.connect() as conn:
            res = await conn.execute(text(f'SELECT * FROM "{table}" LIMIT :n'), {"n": n})
            keys = list(res.keys())
            rows = [dict(zip(keys, row)) for row in res.fetchall()]
            _SAMPLE_ROWS_CACHE[table] = rows
            return rows
    except Exception:
        return []


# ── Pruned schema text builder ────────────────────────────────────────────────

async def get_pruned_schema_text(question: str) -> tuple[str, list[str]]:
    """
    Build a focused schema string for `question`.

    Returns:
        (schema_text, selected_table_names)

    The schema_text includes:
      - Table description (business context)
      - DDL-style column listing with PK/FK annotations
      - 3 sample rows in compact format
    """
    struct = await _load_schema_structure()
    selected = select_relevant_tables(question)

    # Only keep tables that actually exist in the DB
    selected = selected & set(struct.keys())

    # Fallback: if < 2 tables selected, include all (question may be ambiguous)
    if len(selected) < 2:
        selected = set(struct.keys())

    parts = [f"-- Chinook Database Schema (pruned for: {question[:80]})\n"]
    table_names: list[str] = []

    for table in sorted(selected):
        cols = struct.get(table, [])
        desc = TABLE_DESCRIPTIONS.get(table, "")
        sample_rows = await _load_sample_rows(table)

        table_names.append(table)
        parts.append(f"-- {desc}")
        parts.append(f"CREATE TABLE {table} (")
        col_lines = []
        for col in cols:
            pk = " PRIMARY KEY" if col["pk"] else ""
            fk = f"  -- FK → {col['fk']}" if col["fk"] else ""
            nullable = "" if col["nullable"] else " NOT NULL"
            col_lines.append(f"  {col['name']} {col['type']}{nullable}{pk}{fk}")
        parts.append(",\n".join(col_lines))
        parts.append(");")

        if sample_rows:
            # Compact sample row representation
            keys = list(sample_rows[0].keys())
            parts.append(f"-- Sample rows ({table}):")
            parts.append("-- " + " | ".join(keys))
            for row in sample_rows:
                vals = " | ".join(str(v)[:30] for v in row.values())
                parts.append(f"-- {vals}")

        parts.append("")  # blank line between tables

    return "\n".join(parts), table_names


async def get_full_schema_text() -> str:
    """Return full schema text (all tables) for fallback / cold-start caching."""
    struct = await _load_schema_structure()
    # Trigger sample row loading for all tables
    await asyncio.gather(*[_load_sample_rows(t) for t in struct])
    text_parts, _ = await get_pruned_schema_text("all tables full schema")
    return text_parts


def invalidate_cache() -> None:
    """Clear all caches (useful for testing)."""
    global _SCHEMA_STRUCT_CACHE, _SAMPLE_ROWS_CACHE
    _SCHEMA_STRUCT_CACHE = None
    _SAMPLE_ROWS_CACHE.clear()


# ── BYODB: DynamicSchemaCatalog ───────────────────────────────────────────────
# Introspects any PostgreSQL database at runtime.
# The existing static Chinook catalog above is kept as a fast-path for
# connection_id=None (Chinook demo mode).

class DynamicSchemaCatalog:
    """Per-engine schema introspection for BYODB databases.

    Caches structure and sample rows per engine to avoid re-introspecting
    on every question. Cache is keyed by the engine's pool URL string.

    Strategy for table selection:
      - If ≤ 20 tables: include full schema (no pruning needed)
      - If > 20 tables: ask LLM to pick the relevant subset
    """

    # Cache: engine_url_str → (struct_dict, sample_rows_dict)
    _cache: dict[str, tuple[dict, dict]] = {}

    async def _load_struct(self, engine) -> dict[str, list[dict]]:
        """Introspect information_schema and return {table: [col_meta]}."""
        from sqlalchemy import text as sa_text

        async with engine.connect() as conn:
            tables_res = await conn.execute(sa_text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
            ))
            tables = [r[0] for r in tables_res.fetchall()]

            struct: dict[str, list[dict]] = {}
            for table in tables:
                cols_res = await conn.execute(sa_text(
                    "SELECT column_name, data_type, is_nullable "
                    "FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name=:t ORDER BY ordinal_position"
                ), {"t": table})

                pk_res = await conn.execute(sa_text(
                    "SELECT kcu.column_name FROM information_schema.table_constraints tc "
                    "JOIN information_schema.key_column_usage kcu "
                    "  ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema "
                    "WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public' AND tc.table_name=:t"
                ), {"t": table})
                pks = {r[0] for r in pk_res.fetchall()}

                fk_res = await conn.execute(sa_text(
                    "SELECT kcu.column_name, ccu.table_name "
                    "FROM information_schema.table_constraints AS tc "
                    "JOIN information_schema.key_column_usage AS kcu "
                    "  ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema "
                    "JOIN information_schema.constraint_column_usage AS ccu "
                    "  ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema "
                    "WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND tc.table_name=:t"
                ), {"t": table})
                fks = {r[0]: r[1] for r in fk_res.fetchall()}

                struct[table] = [
                    {
                        "name": col_name,
                        "type": data_type.upper(),
                        "nullable": is_nullable == "YES",
                        "pk": col_name in pks,
                        "fk": fks.get(col_name),
                    }
                    for col_name, data_type, is_nullable in cols_res.fetchall()
                ]

        return struct

    async def _load_sample(self, engine, table: str, n: int = 3) -> list[dict]:
        """Fetch n sample rows from a table."""
        from sqlalchemy import text as sa_text
        try:
            async with engine.connect() as conn:
                res = await conn.execute(sa_text(f'SELECT * FROM "{table}" LIMIT :n'), {"n": n})
                keys = list(res.keys())
                return [dict(zip(keys, row)) for row in res.fetchall()]
        except Exception:
            return []

    async def _get_cached(self, engine) -> tuple[dict, dict]:
        """Return (struct, samples) from cache, or load if missing."""
        key = str(engine.url)
        if key not in self._cache:
            struct = await self._load_struct(engine)
            samples = {}
            for table in struct:
                samples[table] = await self._load_sample(engine, table)
            self._cache[key] = (struct, samples)
        return self._cache[key]

    def invalidate(self, engine) -> None:
        """Clear the cache for a specific engine (call when connection is deleted)."""
        self._cache.pop(str(engine.url), None)

    async def get_tables_columns(self, engine) -> dict[str, list[str]]:
        """Return {table: [column_names]} for the SQL validator allowlist."""
        struct, _ = await self._get_cached(engine)
        return {
            table: [c["name"].lower() for c in cols]
            for table, cols in struct.items()
        }

    async def get_pruned_schema_text(
        self, engine, question: str
    ) -> tuple[str, list[str]]:
        """Build a focused schema text for any PostgreSQL database.

        For small schemas (≤20 tables): include everything.
        For large schemas (>20 tables): use an LLM call to pick relevant tables.

        Returns (schema_text, selected_table_names).
        """
        struct, samples = await self._get_cached(engine)
        all_tables = list(struct.keys())

        if len(all_tables) <= 20:
            selected = set(all_tables)
        else:
            selected = await self._llm_select_tables(question, struct)

        db_name = str(engine.url).split("/")[-1].split("?")[0]
        parts = [f"-- {db_name} Database Schema (pruned for: {question[:80]})\n"]
        table_names: list[str] = []

        for table in sorted(selected):
            cols = struct.get(table, [])
            sample_rows = samples.get(table, [])

            table_names.append(table)
            parts.append(f"CREATE TABLE {table} (")
            col_lines = []
            for col in cols:
                pk = " PRIMARY KEY" if col["pk"] else ""
                fk = f"  -- FK -> {col['fk']}" if col["fk"] else ""
                nullable = "" if col["nullable"] else " NOT NULL"
                col_lines.append(f"  {col['name']} {col['type']}{nullable}{pk}{fk}")
            parts.append(",\n".join(col_lines))
            parts.append(");")

            if sample_rows:
                keys = list(sample_rows[0].keys())
                parts.append(f"-- Sample rows ({table}):")
                parts.append("-- " + " | ".join(keys))
                for row in sample_rows:
                    vals = " | ".join(str(v)[:30] for v in row.values())
                    parts.append(f"-- {vals}")

            parts.append("")

        return "\n".join(parts), table_names

    async def _llm_select_tables(
        self, question: str, struct: dict[str, list[dict]]
    ) -> set[str]:
        """Ask the LLM to choose relevant tables from a large schema."""
        from .llm import get_llm
        from langchain_core.messages import HumanMessage, SystemMessage

        # Build a compact table listing for the LLM
        table_listing = "\n".join(
            f"- {t}: {', '.join(c['name'] for c in cols[:8])}"
            for t, cols in struct.items()
        )

        messages = [
            SystemMessage(content=(
                "You are a database expert. Given a list of tables and a user question, "
                "output ONLY the names of the tables needed to answer the question, "
                "one per line. No explanation, no punctuation, only table names."
            )),
            HumanMessage(content=(
                f"Tables:\n{table_listing}\n\nQuestion: {question}\n\nRelevant tables:"
            )),
        ]
        llm = get_llm()
        response = await llm.ainvoke(messages)
        selected_raw = response.content.strip().splitlines()
        valid = {t.strip().lower() for t in selected_raw if t.strip()}
        # Keep only names that actually exist
        return {t for t in struct.keys() if t.lower() in valid} or set(struct.keys())


# Module-level singleton for BYODB schema introspection
dynamic_catalog = DynamicSchemaCatalog()

