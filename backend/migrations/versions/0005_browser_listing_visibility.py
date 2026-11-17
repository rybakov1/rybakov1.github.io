"""Keep imported listings visible by default and allow operator hiding."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("browser_listing_moderation", sa.Column("visible", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade():
    op.drop_column("browser_listing_moderation", "visible")
