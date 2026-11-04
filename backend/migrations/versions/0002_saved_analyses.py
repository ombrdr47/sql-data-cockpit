"""Persist result snapshots and reusable, owner-scoped analyses."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("messages", sa.Column("analysis_data", postgresql.JSONB(), nullable=True))
    op.create_table(
        "saved_analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("sql", sa.Text(), nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user_connections.id", ondelete="SET NULL")),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("source_name", sa.String(100), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_saved_analyses_user_id", "saved_analyses", ["user_id"])


def downgrade():
    op.drop_table("saved_analyses")
    op.drop_column("messages", "analysis_data")
