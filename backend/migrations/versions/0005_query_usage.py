"""Bounded per-account usage counters shared by all API workers."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None

def upgrade():
    op.alter_column("user_connections", "port", type_=sa.Integer(), existing_type=sa.SmallInteger())
    op.create_table('query_usage',
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('period', sa.String(10), primary_key=True),
        sa.Column('bucket', sa.BigInteger(), nullable=False),
        sa.Column('requests', sa.Integer(), nullable=False))

def downgrade():
    op.drop_table('query_usage')
