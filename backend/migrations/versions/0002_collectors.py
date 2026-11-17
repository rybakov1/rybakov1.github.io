"""Leased browser collection jobs and pseudonymous worker heartbeat."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "collector_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("product_id", sa.String(100), sa.ForeignKey("canonical_products.id"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("marketplace", sa.String(20), nullable=False),
        sa.Column("permission_reference", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_token_hash", sa.String(64), nullable=True),
        sa.Column("worker_id_hash", sa.String(64), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.String(300), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_product_id", sa.String(100), nullable=True),
        sa.Column("result_offer_id", sa.String(150), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
    )
    op.create_index("ix_collector_jobs_product_id", "collector_jobs", ["product_id"])
    op.create_index("ix_collector_jobs_status", "collector_jobs", ["status"])
    op.create_table("collector_workers", sa.Column("worker_id_hash", sa.String(64), primary_key=True), sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("collector_workers")
    op.drop_index("ix_collector_jobs_status", table_name="collector_jobs")
    op.drop_index("ix_collector_jobs_product_id", table_name="collector_jobs")
    op.drop_table("collector_jobs")
