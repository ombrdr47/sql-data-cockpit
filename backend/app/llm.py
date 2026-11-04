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


async def resolve_api_key(user_id: str) -> str:
    """Read credentials at execution time, outside checkpointed graph state."""
    from uuid import UUID
    from .db import get_appdb_session_factory
    from .models import User
    from .crypto import decrypt_field, get_fernet
    settings = get_settings()
    async with get_appdb_session_factory()() as session:
        user = await session.get(User, UUID(user_id))
        if user is None or (settings.email_verification_required and not user.email_verified):
            raise ValueError("Account is unavailable.")
        if user.email == "demo@chinook.dev":
            if settings.environment.lower() == "production":
                raise ValueError("Shared demo accounts are disabled in production.")
            if settings.groq_api_key:
                return settings.groq_api_key
        if user.groq_api_key_enc:
            return decrypt_field(user.groq_api_key_enc, get_fernet(settings.jwt_secret_key))
    raise ValueError("Configure your model API key before querying.")
