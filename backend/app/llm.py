"""
app/llm.py
LangChain ChatGroq client factory.
Keeps model/config in one place so nodes don't instantiate their own clients.
"""
from functools import lru_cache
from langchain_groq import ChatGroq
from .config import get_settings


@lru_cache(maxsize=1)
def get_llm() -> ChatGroq:
    """
    Return the singleton ChatGroq instance.
    temperature=0 — critical for deterministic SQL generation.
    """
    settings = get_settings()
    return ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.groq_model,
        temperature=0,
        max_retries=2,
    )
