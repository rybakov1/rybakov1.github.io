from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, true
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def utcnow():
    return datetime.now(timezone.utc)


class Product(Base):
    __tablename__ = "canonical_products"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    slug: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(250))
    category: Mapped[str] = mapped_column(String(30), index=True)
    brand: Mapped[str] = mapped_column(String(80), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    data: Mapped[dict] = mapped_column(JSON)


class ProductVariant(Base):
    __tablename__ = "product_variants"
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("canonical_products.id"), index=True)
    mpn: Mapped[str] = mapped_column(String(120), index=True)
    gtin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    condition: Mapped[str] = mapped_column(String(30), default="new")
    specifications: Mapped[dict] = mapped_column(JSON)


class Seller(Base):
    __tablename__ = "sellers"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    reviews_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provenance: Mapped[dict] = mapped_column(JSON)


class Offer(Base):
    __tablename__ = "marketplace_offers"
    id: Mapped[str] = mapped_column(String(150), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("canonical_products.id"), index=True)
    variant_id: Mapped[str] = mapped_column(ForeignKey("product_variants.id"))
    seller_id: Mapped[str] = mapped_column(ForeignKey("sellers.id"))
    marketplace: Mapped[str] = mapped_column(String(40))
    source_id: Mapped[str] = mapped_column(String(100), index=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    data: Mapped[dict] = mapped_column(JSON)


class PriceObservation(Base):
    __tablename__ = "price_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    offer_id: Mapped[str] = mapped_column(ForeignKey("marketplace_offers.id"))
    price: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3))
    region: Mapped[str] = mapped_column(String(80))
    price_type: Mapped[str] = mapped_column(String(30))
    payment_condition: Mapped[str] = mapped_column(String(80))
    availability: Mapped[bool] = mapped_column(Boolean)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source_id: Mapped[str] = mapped_column(String(100))
    data_provenance: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (UniqueConstraint("offer_id", "observed_at", "currency", "region", "price_type", "payment_condition", name="uq_price_slice"), Index("ix_price_offer_date", "offer_id", "observed_at"))


class ReviewObservation(Base):
    __tablename__ = "review_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("canonical_products.id"), index=True)
    variant_id: Mapped[str] = mapped_column(ForeignKey("product_variants.id"))
    source_id: Mapped[str] = mapped_column(String(100))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    count: Mapped[int] = mapped_column(Integer)
    average: Mapped[float | None] = mapped_column(Float, nullable=True)
    data: Mapped[dict] = mapped_column(JSON)


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[str] = mapped_column(String(150), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("canonical_products.id"))
    variant_id: Mapped[str] = mapped_column(ForeignKey("product_variants.id"))
    rating: Mapped[int] = mapped_column(Integer)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    verified_purchase: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    source_id: Mapped[str] = mapped_column(String(100))
    __table_args__ = (Index("ix_reviews_variant_date", "variant_id", "reviewed_at"),)


class ProductMatch(Base):
    __tablename__ = "product_matches"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[str] = mapped_column(String(100))
    external_id: Mapped[str] = mapped_column(String(150))
    product_id: Mapped[str | None] = mapped_column(ForeignKey("canonical_products.id"), nullable=True)
    confidence: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    reason: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON)


class SourceSyncRun(Base):
    __tablename__ = "source_sync_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[str] = mapped_column(String(100), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30))
    imported: Mapped[int] = mapped_column(Integer, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    provenance: Mapped[dict] = mapped_column(JSON)


class AlertSubscription(Base):
    __tablename__ = "alert_subscriptions"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("canonical_products.id"), index=True)
    target_price: Mapped[float] = mapped_column(Float)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    chat_id_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    chat_id_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)


class OutboundClick(Base):
    __tablename__ = "outbound_clicks"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[str] = mapped_column(String(100), index=True)
    offer_id: Mapped[str | None] = mapped_column(String(150), nullable=True)
    event: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class CollectorJob(Base):
    __tablename__ = "collector_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("canonical_products.id"), index=True)
    url: Mapped[str] = mapped_column(Text)
    marketplace: Mapped[str] = mapped_column(String(20))
    permission_reference: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    worker_id_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_product_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    result_offer_id: Mapped[str | None] = mapped_column(String(150), nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class CollectorWorker(Base):
    __tablename__ = "collector_workers"
    worker_id_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BrowserSnapshot(Base):
    __tablename__ = "browser_snapshots"
    fingerprint: Mapped[str] = mapped_column(String(64), primary_key=True)
    listing_id: Mapped[str] = mapped_column(String(100), index=True)
    marketplace: Mapped[str] = mapped_column(String(20))
    sku: Mapped[str] = mapped_column(String(20))
    url: Mapped[str] = mapped_column(Text)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    data: Mapped[dict] = mapped_column(JSON)


class BrowserListingModeration(Base):
    """Operator metadata for a raw listing; never asserts product identity."""
    __tablename__ = "browser_listing_moderation"
    listing_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    category: Mapped[str] = mapped_column(String(30))
    visible: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
