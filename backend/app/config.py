"""
app/config.py
Centralised configuration via Pydantic Settings.
All values come from environment variables (or .env file in development).
"""
from functools import lru_cache
from urllib.parse import urlsplit
from email.utils import parseaddr
from pydantic import model_validator, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _https_origin(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        port = parsed.port
        return (parsed.scheme == 'https' and bool(parsed.hostname)
                and parsed.username is None and parsed.password is None
                and not parsed.path and not parsed.query and not parsed.fragment
                and '*' not in value and not any(char.isspace() for char in value)
                and (port is None or 1 <= port <= 65535))
    except ValueError:
        return False


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

    # Operator-mounted provider CA certificates; never disable verification.
    app_db_ca_cert_file: str = ""
    chinook_db_ca_cert_file: str = ""

    # ── Auth ─────────────────────────────────────────────────────────────────
    jwt_secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    environment: str = "development"
    secure_cookies: bool = False


    frontend_url: str = "http://localhost:5173"
    mail_transport: str = "file"
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_refresh_token: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    mail_from: str = "SQL Cockpit <no-reply@localhost>"
    mail_preview_dir: str = "backend/.local/mail"

    # ── CORS ─────────────────────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000,http://localhost:5173"

    @model_validator(mode="after")
    def validate_production(self):
        if self.mail_transport not in {'file', 'smtp', 'gmail_api'}:
            raise ValueError('MAIL_TRANSPORT must be file, smtp or gmail_api.')
        if self.mail_transport == 'gmail_api' and not all((self.gmail_client_id, self.gmail_client_secret, self.gmail_refresh_token)):
            raise ValueError('Gmail API delivery requires its OAuth client and refresh token.')
        if self.environment.lower() == 'production':
            if self.mail_transport == 'file':
                raise ValueError('Production requires a configured email provider.')
            if self.mail_transport == 'smtp' and (not self.smtp_host or not self.smtp_starttls):
                raise ValueError('Production SMTP requires STARTTLS.')
            if not _https_origin(self.frontend_url):
                raise ValueError('Production FRONTEND_URL must be an explicit HTTPS origin.')
            sender = parseaddr(self.mail_from)[1]
            if '@' not in sender or '.' not in sender.rsplit('@', 1)[1] or sender.lower().endswith('@localhost'):
                raise ValueError('Production MAIL_FROM must use a real sender domain.')
            if len(self.jwt_secret_key) < 32 or self.jwt_secret_key == 'CHANGE_ME_IN_PRODUCTION':
                raise ValueError('Production requires a strong JWT_SECRET_KEY of at least 32 characters.')
            if any(not _https_origin(origin) for origin in self.allowed_origins_list):
                raise ValueError('Production ALLOWED_ORIGINS must contain explicit HTTPS origins.')
        return self

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

    # Per-worker pool bounds; keep staging below the provider connection limit.
    app_db_pool_size: int = Field(default=10, ge=1, le=50)
    app_db_pool_overflow: int = Field(default=20, ge=0, le=50)
    lock_db_pool_size: int = Field(default=5, ge=1, le=20)
    lock_db_pool_overflow: int = Field(default=15, ge=0, le=30)

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
