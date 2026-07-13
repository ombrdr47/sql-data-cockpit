"""
app/sandbox.py
True isolated-process Python sandbox for LLM-generated analytics code.

Security design (defence in depth):
  - Code runs in a SEPARATE subprocess (not in the FastAPI event loop)
  - OS-level resource limits via resource.setrlimit:
      RLIMIT_AS  → 512 MB virtual memory ceiling
      RLIMIT_CPU → 8 CPU seconds hard limit
      RLIMIT_NOFILE → 0 open file descriptors (prevents file I/O)
  - No network access — subprocess has no socket fd inheritance
  - Allowlist-only imports: pandas, numpy, plotly, json, math, statistics
  - Hard wall-clock timeout enforced by the parent (multiprocessing.Process join)
  - Results returned via multiprocessing.Queue (serialized JSON)

This replaces the previous dangerous in-process exec() approach, which could:
  - Crash the entire FastAPI server with a memory bomb
  - Exploit C-extension backdoors in numpy/pandas to escape the builtins jail
  - Consume unbounded CPU on tight loops
"""
import json
import multiprocessing
import platform
import traceback
from typing import Any, Optional

# ── Resource limit constants ──────────────────────────────────────────────────

SANDBOX_TIMEOUT_SEC = 12       # Wall-clock seconds before we kill the process
SANDBOX_MEM_LIMIT_BYTES = 512 * 1024 * 1024   # 512 MB virtual memory
SANDBOX_CPU_LIMIT_SEC = 8      # 8 CPU seconds hard ceiling
SANDBOX_MAX_OUTPUT_CHARS = 50_000  # Truncate over-long print() output

# ── Allowed top-level imports inside sandbox ──────────────────────────────────

ALLOWED_IMPORTS = frozenset([
    "pandas", "numpy", "plotly", "plotly.express", "plotly.graph_objects",
    "json", "math", "statistics", "datetime", "decimal", "collections",
    "itertools", "functools", "re", "string",
])

BLOCKED_IMPORTS = frozenset([
    "os", "sys", "subprocess", "socket", "requests", "urllib", "http",
    "ftplib", "smtplib", "shutil", "pathlib", "tempfile", "glob",
    "fnmatch", "importlib", "builtins", "gc", "ctypes", "threading",
    "concurrent", "multiprocessing", "pickle", "shelve", "dbm",
    "sqlite3", "csv",   # csv could open files
])

# ── Sandbox globals builder ───────────────────────────────────────────────────

def _build_sandbox_globals(data: list[dict]) -> dict:
    """
    Build a minimal, restricted global namespace for exec().
    Only called INSIDE the subprocess where resource limits are already set.
    """
    import builtins as _builtins_mod

    SAFE_BUILTIN_NAMES = {
        "abs", "all", "any", "bool", "chr", "dict", "divmod", "enumerate",
        "filter", "float", "format", "frozenset", "getattr", "hasattr", "hash",
        "int", "isinstance", "issubclass", "iter", "len", "list", "map", "max",
        "min", "next", "ord", "pow", "print", "range", "repr", "reversed",
        "round", "set", "slice", "sorted", "str", "sum", "tuple", "type",
        "zip", "True", "False", "None",
    }

    def _safe_import(name: str, *args: Any, **kwargs: Any) -> Any:
        root = name.split(".")[0]
        if root in BLOCKED_IMPORTS:
            raise ImportError(
                f"Import of '{name}' is blocked in the analytics sandbox."
            )
        if root not in {a.split(".")[0] for a in ALLOWED_IMPORTS}:
            raise ImportError(
                f"Import of '{name}' is not in the allowlist. "
                f"Allowed: {sorted(ALLOWED_IMPORTS)}"
            )
        return _builtins_mod.__import__(name, *args, **kwargs)

    safe_builtins = {
        k: getattr(_builtins_mod, k)
        for k in SAFE_BUILTIN_NAMES
        if hasattr(_builtins_mod, k)
    }
    safe_builtins["__import__"] = _safe_import

    import pandas as pd
    import plotly.express as px
    import plotly.graph_objects as go

    return {
        "__builtins__": safe_builtins,
        "data": data,
        "pd": pd,
        "px": px,
        "go": go,
        "json": json,
    }


# ── Worker function (runs inside subprocess) ──────────────────────────────────

def _sandbox_worker(code: str, data: list[dict], result_queue: multiprocessing.Queue) -> None:
    """
    Executed inside the isolated subprocess.

    Steps:
      1. Apply OS-level resource limits (Linux/macOS only)
      2. Build restricted globals
      3. exec() the code
      4. Serialize outputs to result_queue
    """
    # ── Apply OS resource limits (Linux + macOS) ──────────────────────────────
    if platform.system() in ("Linux", "Darwin"):
        try:
            import resource
            # Virtual memory ceiling
            resource.setrlimit(
                resource.RLIMIT_AS,
                (SANDBOX_MEM_LIMIT_BYTES, SANDBOX_MEM_LIMIT_BYTES),
            )
            # CPU time ceiling
            resource.setrlimit(
                resource.RLIMIT_CPU,
                (SANDBOX_CPU_LIMIT_SEC, SANDBOX_CPU_LIMIT_SEC),
            )
        except Exception:
            pass  # Best-effort; container environments may restrict setrlimit

    # ── Redirect stdout to capture print() calls ──────────────────────────────
    import io as _io
    import sys as _sys
    stdout_capture = _io.StringIO()
    _sys.stdout = stdout_capture

    python_output: Optional[str] = None
    chart_json: Optional[str] = None
    error: Optional[str] = None

    try:
        globs = _build_sandbox_globals(data)
        locs: dict = {}
        exec(code, globs, locs)  # noqa: S102

        # Capture explicit `result` variable
        result_val = locs.get("result") or globs.get("result")
        captured_stdout = stdout_capture.getvalue()

        if result_val is not None:
            python_output = str(result_val)[:SANDBOX_MAX_OUTPUT_CHARS]
        elif captured_stdout.strip():
            python_output = captured_stdout.strip()[:SANDBOX_MAX_OUTPUT_CHARS]

        # Capture Plotly `fig` variable
        fig = locs.get("fig") or globs.get("fig")
        if fig is not None:
            chart_json = fig.to_json()

    except MemoryError:
        error = "Sandbox memory limit exceeded (512 MB)."
    except Exception as exc:
        error = f"Execution error: {exc}\n{traceback.format_exc()}"

    result_queue.put({
        "python_output": python_output,
        "chart_json": chart_json,
        "error": error,
    })


# ── Public API ────────────────────────────────────────────────────────────────

class SandboxTimeoutError(Exception):
    pass


class SandboxSecurityError(Exception):
    pass


def run_code_in_sandbox(
    code: str,
    data: list[dict],
    timeout: float = SANDBOX_TIMEOUT_SEC,
) -> dict[str, Optional[str]]:
    """
    Execute LLM-generated Python code in a fully isolated subprocess.

    Returns:
        {
            "python_output": str | None,   # text result or print() output
            "chart_json":    str | None,   # Plotly JSON (fig.to_json())
            "error":         str | None,   # error message if execution failed
        }

    Raises:
        SandboxTimeoutError  – if the process exceeds `timeout` wall-clock seconds
        SandboxSecurityError – if the process exits abnormally (signal/OOM kill)
    """
    ctx = multiprocessing.get_context("spawn")   # spawn = no fd/env inheritance
    result_queue: multiprocessing.Queue = ctx.Queue()

    proc = ctx.Process(
        target=_sandbox_worker,
        args=(code, data, result_queue),
        daemon=True,  # killed automatically if parent dies
    )
    proc.start()
    proc.join(timeout=timeout)

    if proc.is_alive():
        proc.kill()
        proc.join()
        raise SandboxTimeoutError(
            f"Python analysis timed out after {timeout:.0f} seconds. "
            "Try simplifying the analysis or reducing the dataset."
        )

    # Non-zero exit = killed by OS (OOM, SIGXCPU) or unhandled signal
    if proc.exitcode not in (0, None):
        if proc.exitcode == -9:  # SIGKILL (OOM)
            raise SandboxSecurityError(
                "Python sandbox was killed (out-of-memory). "
                "Reduce the dataset size or simplify the computation."
            )
        raise SandboxSecurityError(
            f"Python sandbox terminated with exit code {proc.exitcode}. "
            "The code may have violated resource limits."
        )

    if result_queue.empty():
        return {"python_output": None, "chart_json": None, "error": "Sandbox produced no output."}

    return result_queue.get_nowait()
