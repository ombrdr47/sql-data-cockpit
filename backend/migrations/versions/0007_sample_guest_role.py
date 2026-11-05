"""Allow an isolated role for public Chinook sample sessions."""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    # Older installations created this constraint before the Alembic baseline.
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
    op.create_check_constraint("users_role_check", "users", "role IN ('user', 'admin', 'sample_guest')")


def downgrade():
    op.drop_constraint("users_role_check", "users", type_="check")
    # Preserve existing sample records while restoring the original write constraint.
    op.execute("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin')) NOT VALID")
