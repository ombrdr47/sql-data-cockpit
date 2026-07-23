"""
app/config.py
Centralised configuration via Pydantic Settings.
All values come from environment variables (or .env file in development).
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── LLM ──────────────────────────────────────────────────────────────────
    groq_api_key: str
    groq_model: str = "llama-3.3-70b-versatile"

    # ── Database ─────────────────────────────────────────────────────────────
    # Chinook — read-only analytics queries
    chinook_db_url: str = (
        "postgresql+asyncpg://chinook_ro:readonlypass@localhost:5432/chinook"
    )
    # App DB — users, conversations, messages, checkpoints
    app_db_url: str = (
        "postgresql+asyncpg://appuser:apppass@localhost:5432/app_db"
    )
    # Sync URL — required by LangGraph PostgresSaver (psycopg v3)
    app_db_sync_url: str = (
        "postgresql://appuser:apppass@localhost:5432/app_db"
    )

    # ── Auth ─────────────────────────────────────────────────────────────────
    jwt_secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    environment: str = "development"
    secure_cookies: bool = False


    # ── CORS ─────────────────────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000,http://localhost:5173"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    # ── Agent ─────────────────────────────────────────────────────────────────
    # Maximum rows returned from Chinook queries (second layer after role timeout)
    sql_row_cap: int = 200
    # Maximum LangGraph retry loops per question
    max_retries: int = 3

    # ── BYODB ──────────────────────────────────────────────────────────────────
    # Maximum saved connections per user (enforced in POST /connections)
    max_connections_per_user: int = 5
    # Seconds before an idle BYODB engine is evicted from the pool
    byodb_engine_ttl: int = 300

    # ── HITL / Checkpointer pool ───────────────────────────────────────────────
    # Scale: set max to (avg_concurrent_users × avg_graphs_per_second × avg_node_time)
    # For 100 concurrent users a max of 20 is comfortably sufficient.
    checkpointer_pool_min: int = 5
    checkpointer_pool_max: int = 20

    # ── LangSmith (optional) ─────────────────────────────────────────────────
    langchain_tracing_v2: bool = False
    langchain_api_key: str = ""
    langchain_project: str = "text-to-sql-agent"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton Settings instance (loaded once, cached forever)."""
    return Settings()
