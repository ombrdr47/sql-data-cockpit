"""Keep deleted customer sources from silently falling back to sample data."""
from alembic import op
import sqlalchemy as sa
revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('conversations', sa.Column('source_deleted', sa.Boolean(), nullable=False, server_default=sa.false()))
    # Recover provenance for legacy conversations when persisted result metadata
    # proves that a now-missing source was used. Do not guess from chat text.
    op.execute("""
        UPDATE conversations c SET source_deleted = true
        WHERE c.connection_id IS NULL AND EXISTS (
            SELECT 1 FROM messages m WHERE m.conversation_id = c.id
            AND m.analysis_data->>'connection_id' IS NOT NULL
        )
    """)


def downgrade():
    op.drop_column('conversations', 'source_deleted')
