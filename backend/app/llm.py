"""
app/llm.py
LangChain ChatGroq client factory.

get_llm(api_key) — creates a ChatGroq instance for the given key.
get_server_llm()  — uses the server-level GROQ_API_KEY (demo / warm-up only).
"""
from langchain_groq import ChatGroq
from .config import get_settings


def get_llm(api_key: str) -> ChatGroq:
    """
    Return a ChatGroq instance for the given API key.
    temperature=0 — critical for deterministic SQL generation.
    Not cached: each request may use a different user key.
    """
    settings = get_settings()
    return ChatGroq(
        api_key=api_key,
        model=settings.groq_model,
        temperature=0,
        max_retries=2,
    )


def get_server_llm() -> ChatGroq:
    """
    Return a ChatGroq instance using the server-level GROQ_API_KEY.
    Used ONLY for:
      - Schema warm-up at startup (schema_catalog)
      - Demo user fallback (if GROQ_API_KEY is set in env)
    Raises if GROQ_API_KEY is not configured.
    """
    settings = get_settings()
    if not settings.groq_api_key:
        raise ValueError("Server GROQ_API_KEY is not configured")
    return ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.groq_model,
        temperature=0,
        max_retries=2,
    )
