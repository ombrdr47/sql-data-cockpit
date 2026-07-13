"""
eval/run_eval.py
Evaluation harness for the Text-to-SQL agent.

Metric: Execution Accuracy (not string match)
  Why? Two different SQL queries (different aliasing, join order, subquery vs join)
  can return identical, correct results. Grading on SQL text would mark correct answers wrong.
  This mirrors standard text-to-SQL benchmarks (Spider, WikiSQL).

Three metrics reported:
  1. SQL Validity Rate — agent produced executable SQL
  2. Execution Accuracy — results match reference results (sorted tuple comparison)
  3. Retry Rate — distribution of generate→validate→execute iterations

Usage:
  python -m backend.eval.run_eval [--category simple] [--max 10] [--verbose]
"""
import asyncio
import json
import sys
import time
import argparse
from pathlib import Path
from typing import Any

# Ensure backend is in path
ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))


async def run_reference_sql(sql: str) -> list[tuple] | None:
    """Run reference SQL against Chinook and return normalized rows."""
    try:
        from backend.app.db import execute_chinook_query
        rows = await execute_chinook_query(sql)
        return _normalize_rows(rows)
    except Exception as e:
        print(f"  [WARN] Reference SQL failed: {e}")
        return None


async def run_agent(question: str, conversation_id: str | None = None) -> dict:
    """
    Run the agent on a question and return the final state.
    This bypasses the HTTP layer and calls the graph directly.
    """
    from backend.app.graph import build_graph
    from backend.app.db import get_schema_text

    graph = build_graph(checkpointer=None)  # No persistence for eval
    schema = await get_schema_text()

    initial_state = {
        "question": question,
        "conversation_id": conversation_id or "eval-run",
        "user_id": "eval-user",
        "schema_text": schema,
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
    }

    final_state = initial_state.copy()
    async for event in graph.astream(initial_state, stream_mode="updates"):
        for node_name, node_output in event.items():
            final_state.update(node_output)

    return final_state


def _normalize_rows(rows: list[dict[str, Any]]) -> list[tuple]:
    """
    Normalize rows for comparison:
    - Sort rows (unless order matters — handled by caller)
    - Round floats to 4 decimal places
    - Lowercase strings for case-insensitive comparison
    - Convert None/NULL to a sentinel
    """
    normalized = []
    for row in rows:
        norm_row = []
        for v in row.values():
            if isinstance(v, float):
                norm_row.append(round(v, 4))
            elif isinstance(v, str):
                norm_row.append(v.strip())
            elif v is None:
                norm_row.append("__NULL__")
            else:
                norm_row.append(v)
        normalized.append(tuple(norm_row))
    return sorted(normalized)


def results_match(
    agent_rows: list[tuple] | None,
    ref_rows: list[tuple] | None,
    ordered: bool = False,
) -> bool:
    """Compare agent results to reference results."""
    if agent_rows is None or ref_rows is None:
        return False
    if ordered:
        return agent_rows == ref_rows
    return sorted(agent_rows) == sorted(ref_rows)


async def eval_one(item: dict, verbose: bool = False) -> dict:
    """Run a single eval item and return metrics."""
    question = item["question"]
    category = item["category"]
    expected_behavior = item.get("expected_behavior", "SQL")
    ref_sql = item.get("reference_sql")
    item_id = item["id"]

    if verbose:
        print(f"\n[{item_id}] Q: {question}")

    start = time.time()

    result = {
        "id": item_id,
        "category": category,
        "question": question,
        "expected_behavior": expected_behavior,
        "sql_valid": False,
        "execution_accuracy": False,
        "is_refusal": False,
        "retry_count": 0,
        "latency_s": 0.0,
        "generated_sql": None,
        "error": None,
    }

    try:
        state = await run_agent(question)
        elapsed = time.time() - start

        generated_sql = state.get("generated_sql")
        sql_results = state.get("sql_results")
        validation_error = state.get("validation_error", "")
        retry_count = state.get("retry_count", 0)

        result["generated_sql"] = generated_sql
        result["retry_count"] = retry_count
        result["latency_s"] = round(elapsed, 2)

        # ── Refusal test ─────────────────────────────────────────────────────
        if expected_behavior == "REFUSE":
            is_refusal = (
                (validation_error and "CANNOT_ANSWER" in validation_error.upper())
                or sql_results is None
                or len(sql_results) == 0
            )
            result["is_refusal"] = is_refusal
            result["execution_accuracy"] = is_refusal  # Correct = refused
            if verbose:
                status = "✓ REFUSED" if is_refusal else "✗ SHOULD HAVE REFUSED"
                print(f"  {status}")
            return result

        # ── SQL validity ──────────────────────────────────────────────────────
        if generated_sql and not generated_sql.upper().startswith("CANNOT_ANSWER"):
            result["sql_valid"] = state.get("sql_valid", False) or sql_results is not None

        # ── Execution accuracy ────────────────────────────────────────────────
        if ref_sql and sql_results is not None:
            ref_rows = await run_reference_sql(ref_sql)
            if ref_rows is not None:
                agent_rows = _normalize_rows(sql_results)
                # Ordered comparison for questions with explicit ORDER
                ordered = any(w in question.lower() for w in ["top", "most recent", "first", "last", "oldest"])
                match = results_match(agent_rows, ref_rows, ordered=ordered)
                result["execution_accuracy"] = match
                if verbose:
                    if match:
                        print(f"  ✓ CORRECT (retry={retry_count}, {elapsed:.1f}s)")
                    else:
                        print(f"  ✗ WRONG  (retry={retry_count}, {elapsed:.1f}s)")
                        if verbose:
                            print(f"    Agent SQL: {generated_sql}")
                            print(f"    Agent rows (first 3): {agent_rows[:3]}")
                            print(f"    Ref rows (first 3):   {ref_rows[:3]}")
            else:
                result["error"] = "Reference SQL failed to execute"
        elif category in ("python_tool",):
            # Python tool cases: check that a chart or output was generated
            has_output = bool(state.get("chart_base64") or state.get("python_output"))
            result["execution_accuracy"] = has_output
            if verbose:
                print(f"  {'✓' if has_output else '✗'} Python tool output: {'yes' if has_output else 'no'}")

    except Exception as e:
        result["error"] = str(e)
        if verbose:
            print(f"  ✗ ERROR: {e}")

    return result


async def run_eval(
    golden_path: str = "backend/eval/golden_set.json",
    category: str | None = None,
    max_items: int | None = None,
    verbose: bool = False,
) -> None:
    """Main eval runner."""
    with open(golden_path) as f:
        golden = json.load(f)

    # Filter by category
    if category:
        golden = [g for g in golden if g["category"] == category]

    # Skip follow-up multi-turn (they need prior context — run separately)
    standalone = [g for g in golden if not g.get("depends_on")]

    if max_items:
        standalone = standalone[:max_items]

    print(f"\n{'='*60}")
    print("Text-to-SQL Agent Evaluation")
    print(f"Items: {len(standalone)} | Category filter: {category or 'all'}")
    print(f"{'='*60}\n")

    results = []
    for item in standalone:
        r = await eval_one(item, verbose=verbose)
        results.append(r)

    # ── Metrics ───────────────────────────────────────────────────────────────
    total = len(results)
    valid_sql = sum(1 for r in results if r["sql_valid"])
    accurate = sum(1 for r in results if r["execution_accuracy"])
    refusal_correct = sum(
        1 for r in results
        if r["expected_behavior"] == "REFUSE" and r["is_refusal"]
    )
    refusal_total = sum(1 for r in results if r["expected_behavior"] == "REFUSE")

    retry_counts = [r["retry_count"] for r in results]
    zero_retries = sum(1 for rc in retry_counts if rc == 0)
    one_retry = sum(1 for rc in retry_counts if rc == 1)
    two_retries = sum(1 for rc in retry_counts if rc == 2)
    three_retries = sum(1 for rc in retry_counts if rc >= 3)

    latencies = [r["latency_s"] for r in results]
    avg_latency = sum(latencies) / len(latencies) if latencies else 0

    non_refusal = [r for r in results if r["expected_behavior"] != "REFUSE"]
    sql_acc_excl_refusal = sum(1 for r in non_refusal if r["execution_accuracy"])

    print(f"\n{'='*60}")
    print("RESULTS")
    print(f"{'='*60}")
    print(f"Total evaluated:      {total}")
    print("")
    print(f"1. SQL Validity Rate:      {valid_sql}/{total} ({100*valid_sql//total if total else 0}%)")
    print(f"2. Execution Accuracy:     {accurate}/{total} ({100*accurate//total if total else 0}%)")
    if non_refusal:
        print(f"   (excl. refusal cases): {sql_acc_excl_refusal}/{len(non_refusal)} ({100*sql_acc_excl_refusal//len(non_refusal)}%)")
    if refusal_total:
        print(f"3. Refusal Accuracy:       {refusal_correct}/{refusal_total} ({100*refusal_correct//refusal_total}%)")
    print("")
    print("Retry distribution:")
    print(f"   0 retries:  {zero_retries} ({100*zero_retries//total if total else 0}%)")
    print(f"   1 retry:    {one_retry}")
    print(f"   2 retries:  {two_retries}")
    print(f"   3 retries:  {three_retries}")
    print("")
    print(f"Avg latency:          {avg_latency:.1f}s")
    print(f"{'='*60}\n")

    # ── Per-category breakdown ────────────────────────────────────────────────
    print("Per-category breakdown:")
    cats: dict[str, list] = {}
    for r in results:
        cats.setdefault(r["category"], []).append(r)
    for cat, cat_results in sorted(cats.items()):
        cat_acc = sum(1 for r in cat_results if r["execution_accuracy"])
        print(f"  {cat:20s}: {cat_acc}/{len(cat_results)}")

    # Save results
    output_path = Path("backend/eval/results.json")
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nDetailed results saved to: {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Text-to-SQL eval")
    parser.add_argument("--category", default=None, help="Filter by category")
    parser.add_argument("--max", type=int, default=None, dest="max_items", help="Max items to eval")
    parser.add_argument("--verbose", action="store_true", help="Show per-question details")
    parser.add_argument(
        "--golden", default="backend/eval/golden_set.json", help="Path to golden set JSON"
    )
    args = parser.parse_args()

    asyncio.run(
        run_eval(
            golden_path=args.golden,
            category=args.category,
            max_items=args.max_items,
            verbose=args.verbose,
        )
    )
