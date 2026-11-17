"""Unverified browser JSON snapshots, kept separate from canonical models."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("browser_snapshots",
        sa.Column("fingerprint", sa.String(64), primary_key=True),
        sa.Column("listing_id", sa.String(100), nullable=False),
        sa.Column("marketplace", sa.String(20), nullable=False),
        sa.Column("sku", sa.String(20), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False))
    op.create_index("ix_browser_snapshots_listing_id", "browser_snapshots", ["listing_id"])
    op.create_index("ix_browser_snapshots_observed_at", "browser_snapshots", ["observed_at"])


def downgrade():
    op.drop_index("ix_browser_snapshots_observed_at", table_name="browser_snapshots")
    op.drop_index("ix_browser_snapshots_listing_id", table_name="browser_snapshots")
    op.drop_table("browser_snapshots")
