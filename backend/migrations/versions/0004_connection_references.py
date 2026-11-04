"""Optional encrypted reference documents per database connection."""
from alembic import op
import sqlalchemy as sa
revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('user_connections', sa.Column('references_enc', sa.Text(), nullable=True))

def downgrade():
    op.drop_column('user_connections', 'references_enc')
