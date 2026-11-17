"""Manually assigned categories for unverified browser listings."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "browser_listing_moderation",
        sa.Column("listing_id", sa.String(100), primary_key=True),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("browser_listing_moderation")
