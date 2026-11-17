"""User-authorized browser observations. No server-side page fetches.

Workers receive only allowlisted product URLs and opaque leases. Observation
schemas have no cookie, authentication, HTML or private browser-data fields.
"""
import hashlib
import json
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .imports import FeedRow, ImportProvider
from .models import CollectorJob, CollectorWorker, Offer, Product, utcnow


def collector_cors_origin_regex():
    return r"^chrome-extension://[a-p]{32}$" if settings.collector_configured else None


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def product_url(value: str) -> tuple[str, str, str]:
    """Return canonical URL, marketplace and actual item ID. Never resolves it."""
    try:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port is not None or parsed.query or parsed.fragment or "\\" in value or any(ord(c) < 33 for c in value):
            raise ValueError("Only clean HTTPS product URLs without credentials, port, query or fragment are allowed")
        if parsed.hostname in ("ozon.ru", "www.ozon.ru"):
            match = re.fullmatch(r"/product/(?:[a-zA-Z0-9_-]+-)?([0-9]{1,20})/?", parsed.path)
            marketplace = "ozon"
        elif parsed.hostname in ("wildberries.ru", "www.wildberries.ru"):
            match = re.fullmatch(r"/catalog/([0-9]{1,20})/detail\.aspx", parsed.path)
            marketplace = "wildberries"
        else:
            raise ValueError("Only Ozon and Wildberries product pages are accepted")
        if not match:
            raise ValueError("URL is not a recognized marketplace product page")
    except (ValueError, AttributeError) as exc:
        raise ValueError(str(exc)) from exc
    # One identity for www/no-www, optional slash and tracking-free captures.
    canonical = f"https://www.ozon.ru/product/{match[1]}/" if marketplace == "ozon" else f"https://www.wildberries.ru/catalog/{match[1]}/detail.aspx"
    return canonical, marketplace, match[1]


def collector_ready():
    if not settings.collector_configured:
        raise HTTPException(503, "Browser collector is disabled: configure COLLECTOR_ENABLED, a separate COLLECTOR_TOKEN and COLLECTOR_PERMISSION_REFERENCE")


def require_collector(authorization: str | None = Header(default=None)):
    collector_ready()
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not secrets.compare_digest(supplied.encode(), settings.collector_token.encode()):
        raise HTTPException(401, "Invalid collector token", headers={"WWW-Authenticate": "Bearer"})


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class JobInput(StrictInput):
    product_id: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=2000)
    marketplace: Literal["ozon", "wildberries"]
    permission_reference: str = Field(min_length=8, max_length=500)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value):
        return product_url(value)[0]


class ClaimInput(StrictInput):
    worker_id: str = Field(pattern=r"^[A-Za-z0-9_-]{16,80}$")


class FailureInput(ClaimInput):
    lease_token: str = Field(min_length=20, max_length=100)
    error: Literal["captcha_or_block", "page_unavailable", "extraction_unavailable", "user_cancelled", "unexpected_page"]


class ObservationInput(ClaimInput):
    product_id: str = Field(min_length=1, max_length=100)
    page_url: str = Field(min_length=1, max_length=2000)
    captured_at: datetime
    permission_reference: str = Field(min_length=8, max_length=500)
    extraction_method: Literal["jsonld", "dom", "manual"]
    identity_confirmed: StrictBool
    price: float = Field(gt=0, le=100000000, allow_inf_nan=False)
    currency: Literal["RUB"]
    region: str = Field(min_length=1, max_length=80)
    price_type: Literal["regular", "membership", "installment"]
    payment_condition: str = Field(min_length=1, max_length=80)
    availability: StrictBool
    condition: Literal["new", "used", "refurbished", "unknown"]
    seller_id: str | None = Field(default=None, min_length=1, max_length=100)
    seller_name: str | None = Field(default=None, min_length=1, max_length=150)
    warranty_months: int | None = Field(default=None, ge=0, le=240)
    extracted_price_text: str | None = Field(default=None, max_length=120)
    extractor_version: str | None = Field(default=None, max_length=40)
    job_id: str | None = Field(default=None, max_length=36)
    lease_token: str | None = Field(default=None, min_length=20, max_length=100)

    @field_validator("page_url")
    @classmethod
    def validate_url(cls, value):
        return product_url(value)[0]

    @field_validator("captured_at")
    @classmethod
    def validate_capture_time(cls, value):
        now = utcnow()
        if value.tzinfo is None or value > now + timedelta(minutes=5) or value < now - timedelta(hours=24):
            raise ValueError("Capture must have a timezone and be within the last 24 hours (at most five minutes in the future)")
        return value.astimezone(timezone.utc)


def canonical_fields(product: Product):
    return {"id": product.id, "slug": product.slug, "name": product.name, "is_demo": bool(product.data.get("is_demo")), **{key: product.data.get(key) for key in ("brand", "model", "mpn", "capacity", "bundle", "condition", "category")}}


def expire_leases(session, now):
    session.execute(update(CollectorJob).where(CollectorJob.status == "leased", CollectorJob.lease_expires_at <= now).values(status="queued", lease_expires_at=None, lease_token_hash=None, worker_id_hash=None, last_error="lease_expired"))


def heartbeat(session, worker_id, now):
    worker_hash = digest(worker_id)
    worker = session.get(CollectorWorker, worker_hash)
    if not worker:
        session.add(CollectorWorker(worker_id_hash=worker_hash, last_seen_at=now))
    else:
        worker.last_seen_at = now
    return worker_hash


def serialize_job(session, row):
    product = session.get(Product, row.product_id)
    result_product = session.get(Product, row.result_product_id) if row.result_product_id else None
    return {"id": row.id, "product_id": row.product_id, "product_name": product.name if product else None, "url": row.url, "marketplace": row.marketplace, "permission_reference": row.permission_reference, "status": row.status, "created_at": row.created_at, "lease_expires_at": row.lease_expires_at, "last_error": row.last_error, "completed_at": row.completed_at, "result_product_id": row.result_product_id, "result_slug": result_product.slug if result_product else None, "attempts": row.attempts}


def checked_lease(session, job_id, worker_id, lease_token, allow_completed=False):
    row = session.scalar(select(CollectorJob).where(CollectorJob.id == job_id).with_for_update())
    if not row:
        raise HTTPException(404, "Collection job not found")
    if not lease_token or not row.lease_token_hash or not secrets.compare_digest(row.lease_token_hash, digest(lease_token)) or row.worker_id_hash != digest(worker_id):
        raise HTTPException(409, "Collection job lease does not belong to this worker")
    if allow_completed and row.status == "completed":
        return row
    if row.status != "leased" or not row.lease_expires_at or aware(row.lease_expires_at) <= utcnow():
        raise HTTPException(409, "Collection job lease expired or is no longer active")
    return row


def build_collector_router(require_admin):
    router = APIRouter(tags=["Browser collector"])

    @router.get("/api/collector/config", dependencies=[Depends(require_collector)])
    def collector_config():
        return {"enabled": True, "lease_seconds": settings.collector_lease_seconds, "marketplaces": ["ozon", "wildberries"], "notice": "Only explicitly confirmed visible-page fields; no cookies, authentication data or hidden endpoints"}

    @router.get("/api/collector/products", dependencies=[Depends(require_collector)])
    def collector_products(db: Session = Depends(get_db)):
        rows = db.scalars(select(Product).where(Product.active.is_(True)).order_by(Product.name)).all()
        return {"items": [canonical_fields(p) for p in rows], "total": len(rows)}

    @router.get("/api/admin/collector/status", dependencies=[Depends(require_admin)])
    def collector_status(db: Session = Depends(get_db)):
        expire_leases(db, utcnow())
        db.commit()
        counts = dict(db.execute(select(CollectorJob.status, func.count()).group_by(CollectorJob.status)).all())
        workers = db.scalars(select(CollectorWorker).order_by(CollectorWorker.last_seen_at.desc()).limit(50)).all()
        return {"enabled": settings.collector_enabled, "configured": settings.collector_configured, "lease_seconds": settings.collector_lease_seconds, "counts": {key: counts.get(key, 0) for key in ("queued", "leased", "completed", "failed")}, "workers": [{"worker_id_hash": w.worker_id_hash, "last_seen_at": w.last_seen_at} for w in workers], "notice": "Permission references are operator assertions, not verification of marketplace rights. No server-side fetching is performed."}

    @router.get("/api/admin/collector/jobs", dependencies=[Depends(require_admin)])
    def collector_jobs(db: Session = Depends(get_db)):
        expire_leases(db, utcnow())
        db.commit()
        rows = db.scalars(select(CollectorJob).order_by(CollectorJob.created_at.desc()).limit(200)).all()
        return {"items": [serialize_job(db, row) for row in rows]}

    @router.post("/api/admin/collector/jobs", dependencies=[Depends(require_admin)], status_code=201)
    def create_job(payload: JobInput, db: Session = Depends(get_db)):
        collector_ready()
        product = db.get(Product, payload.product_id)
        if not product or not product.active:
            raise HTTPException(404, "Active canonical model not found; create its metadata first")
        canonical_url, marketplace, _ = product_url(payload.url)
        if payload.marketplace != marketplace:
            raise HTTPException(422, "Marketplace does not match the product URL")
        row = CollectorJob(id=str(uuid.uuid4()), product_id=product.id, url=canonical_url, marketplace=marketplace, permission_reference=payload.permission_reference, status="queued")
        db.add(row)
        db.commit()
        return serialize_job(db, row)

    @router.post("/api/collector/jobs/claim", dependencies=[Depends(require_collector)])
    def claim_job(payload: ClaimInput, db: Session = Depends(get_db)):
        now = utcnow()
        expire_leases(db, now)
        worker_hash = heartbeat(db, payload.worker_id, now)
        # Compare-and-swap also protects local SQLite, whose FOR UPDATE is a noop.
        for _ in range(3):
            row = db.scalar(select(CollectorJob).where(CollectorJob.status == "queued").order_by(CollectorJob.created_at).with_for_update(skip_locked=True).limit(1))
            if not row:
                db.commit()
                return {"job": None}
            product = db.get(Product, row.product_id)
            if not product or not product.active:
                row.status, row.last_error = "failed", "canonical_product_inactive"
                db.flush()
                continue
            lease_token = secrets.token_urlsafe(32)
            expiry = now + timedelta(seconds=settings.collector_lease_seconds)
            changed = db.execute(update(CollectorJob).where(CollectorJob.id == row.id, CollectorJob.status == "queued").values(status="leased", lease_token_hash=digest(lease_token), worker_id_hash=worker_hash, lease_expires_at=expiry, attempts=CollectorJob.attempts + 1, last_error=None)).rowcount
            if changed:
                db.commit()
                return {"job": {"id": row.id, "product_id": product.id, "url": row.url, "marketplace": row.marketplace, "permission_reference": row.permission_reference, "lease_token": lease_token, "lease_expires_at": expiry, "product": canonical_fields(product)}}
        db.commit()
        return {"job": None}

    @router.post("/api/collector/jobs/{job_id}/fail", dependencies=[Depends(require_collector)])
    def fail_job(job_id: str, payload: FailureInput, db: Session = Depends(get_db)):
        row = checked_lease(db, job_id, payload.worker_id, payload.lease_token)
        row.status, row.last_error = "failed", payload.error
        row.lease_expires_at = None
        heartbeat(db, payload.worker_id, utcnow())
        db.commit()
        return {"id": row.id, "status": "failed", "error": row.last_error}

    @router.post("/api/collector/observations", dependencies=[Depends(require_collector)], status_code=201)
    def observe(payload: ObservationInput, db: Session = Depends(get_db)):
        if not payload.identity_confirmed:
            raise HTTPException(422, "Confirm that brand, model, MPN, capacity, bundle and condition match the selected canonical variant")
        if bool(payload.job_id) != bool(payload.lease_token):
            raise HTTPException(422, "job_id and lease_token must be supplied together")
        product = db.get(Product, payload.product_id)
        if not product or not product.active:
            raise HTTPException(404, "Active canonical model not found")
        if payload.condition != product.data.get("condition"):
            raise HTTPException(422, "Condition differs from the canonical variant")
        if payload.seller_id and not payload.seller_name:
            raise HTTPException(422, "A provided seller ID requires the actual seller name")
        page_url, marketplace, external_id = product_url(payload.page_url)
        fingerprint = digest(json.dumps(payload.model_dump(mode="json"), sort_keys=True, ensure_ascii=False))
        job = None
        if payload.job_id:
            job = checked_lease(db, payload.job_id, payload.worker_id, payload.lease_token, allow_completed=True)
            if job.product_id != product.id or job.url != page_url or job.marketplace != marketplace or job.permission_reference != payload.permission_reference:
                raise HTTPException(409, "Observation product, URL, marketplace or permission differs from its claimed job")
            if job.status == "completed":
                if job.result.get("capture_fingerprint") != fingerprint:
                    raise HTTPException(409, "Completed job cannot be overwritten with another observation")
                return {key: value for key, value in job.result.items() if key != "capture_fingerprint"}
            if payload.captured_at < aware(job.created_at) - timedelta(minutes=1):
                raise HTTPException(422, "Capture predates the requested collection job")
        seller_id = payload.seller_id or ("name-" + digest(f"{marketplace}|{external_id}|{payload.seller_name}")[:32] if payload.seller_name else f"unknown-{marketplace}-{external_id}")
        metadata = {"type": "browser_capture", "extraction_method": payload.extraction_method, "captured_at": payload.captured_at.isoformat(), "page_url": page_url, "selected_canonical_product_id": product.id, "server_permission_reference": settings.collector_permission_reference, "identity_confirmation": "operator_confirmed", "seller_availability": "provided" if payload.seller_name else "unavailable", "seller_identifier": "source_provided" if payload.seller_id else "derived_page_and_name" if payload.seller_name else "unknown_page_scoped", "extractor_version": payload.extractor_version, "extracted_price_text": payload.extracted_price_text}
        try:
            row = FeedRow.model_validate({"external_id": external_id, **{key: product.data.get(key) for key in ("brand", "model", "mpn", "gtin", "category", "capacity", "bundle")}, **payload.model_dump(include={"price", "currency", "region", "price_type", "payment_condition", "availability", "condition", "warranty_months"}), "seller_id": seller_id, "seller_name": payload.seller_name or "Продавец не указан", "observed_at": payload.captured_at, "url": page_url, "marketplace": marketplace})
            source_id = "browser-" + marketplace
            provider = ImportProvider(db, source_id, payload.permission_reference, metadata)
            result = provider.import_rows([row], canonical_product_id=product.id, commit=False)
            offer = db.get(Offer, result["offer_ids"][0]) if result["offer_ids"] else None
            if not offer:
                raise ValueError("Capture could not be matched to its canonical model")
            actual_product = db.get(Product, offer.product_id)
            response = {"imported": result["imported"], "duplicates": result["duplicates"], "run_id": result["run_id"], "product_id": actual_product.id, "slug": actual_product.slug, "offer_id": offer.id, "job_status": "completed" if job else None}
            heartbeat(db, payload.worker_id, utcnow())
            if job:
                job.status, job.completed_at = "completed", utcnow()
                job.result_product_id, job.result_offer_id = actual_product.id, offer.id
                job.result = {**response, "capture_fingerprint": fingerprint}
                job.lease_expires_at = None
            db.commit()
            return response
        except (ValueError, TypeError) as exc:
            db.rollback()
            raise HTTPException(422, str(exc)[:1000]) from exc

    return router
