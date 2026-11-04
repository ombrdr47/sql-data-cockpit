"""Email ownership and single-use account tokens; session invalidation."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('session_version', sa.Integer(), nullable=False, server_default='0'))
    # Only the built-in sample identity is exempt. Existing personal users must verify.
    op.execute("UPDATE users SET email_verified = true WHERE email = 'demo@chinook.dev'")
    op.create_table('account_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.Text(), unique=True, nullable=False),
        sa.Column('purpose', sa.String(20), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('consumed_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index('ix_account_tokens_user_id', 'account_tokens', ['user_id'])

def downgrade():
    op.drop_table('account_tokens')
    op.drop_column('users', 'session_version')
    op.drop_column('users', 'email_verified')
