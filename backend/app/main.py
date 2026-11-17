import secrets
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from time import monotonic
from typing import Literal
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .alerts import create_alert
from .catalog import CanonicalInput, create_canonical
from .browser_import import import_browser_export, raw_listings
from .collector import build_collector_router, collector_cors_origin_regex
from .config import settings
from .db import get_db
from .imports import ImportProvider, project_product_prices
from .models import BrowserListingModeration, BrowserSnapshot, Product, Offer, OutboundClick, ProductMatch, SourceSyncRun
from .security import safe_outbound_url

app = FastAPI(title=f"{settings.brand} API", version="0.1.0", description="Демонстрационная аналитика цен и импорт разрешённых CSV/JSON-фидов. Не обращается к маркетплейсам автоматически.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_origin_regex=collector_cors_origin_regex(), allow_methods=["GET", "POST", "PATCH"], allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def safe_headers(request: Request, call_next):
    try:
        if int(request.headers.get("content-length", "0")) > 5_100_000:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=413, content={"detail": "Request too large"})
    except ValueError:
        raise HTTPException(400, "Invalid Content-Length")
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


def require_admin(authorization: str | None = Header(default=None)):
    if not settings.admin_token:
        raise HTTPException(503, "Admin is disabled: configure ADMIN_TOKEN")
    if settings.admin_token == "replace-with-a-random-at-least-32-character-secret" or (not settings.demo_mode and len(settings.admin_token) < 32):
        raise HTTPException(503, "Admin is disabled: configure a random ADMIN_TOKEN of at least 32 characters")
    if settings.collector_token and settings.collector_token == settings.admin_token:
        raise HTTPException(503, "Misconfiguration: ADMIN_TOKEN and COLLECTOR_TOKEN must be different")
    supplied = authorization.removeprefix("Bearer ") if authorization and authorization.startswith("Bearer ") else ""
    if not secrets.compare_digest(supplied.encode(), settings.admin_token.encode()):
        raise HTTPException(401, "Unauthorized", headers={"WWW-Authenticate": "Bearer"})


app.include_router(build_collector_router(require_admin))


def product_or_404(session, slug):
    product = session.scalar(select(Product).where(Product.slug == slug, Product.active.is_(True)))
    if not product or (not settings.demo_mode and product.data.get("is_demo")):
        raise HTTPException(404, "Product not found")
    return product


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok", "data_mode": "demo" if settings.demo_mode else "import"}


@app.get("/api/config")
def config():
    return {"brand": settings.brand, "telegram_enabled": settings.telegram_enabled, "telegram_username": settings.telegram_username if settings.telegram_enabled else None, "data_mode": "demo" if settings.demo_mode else "import"}


@app.get("/api/products")
def products(q: str = Query("", max_length=150), category: str | None = None, brand: str | None = None, min_price: float | None = Query(None, ge=0), max_price: float | None = Query(None, ge=0), deals: bool = False, sort: Literal["recommended", "price_asc", "price_desc", "discount", "rating", "name"] = "recommended", page: int = Query(1, ge=1), page_size: int = Query(24, ge=1, le=100), db: Session = Depends(get_db)):
    canonical = [project_product_prices(p.data) for p in db.scalars(select(Product).where(Product.active.is_(True))) if settings.demo_mode or not p.data.get("is_demo")]
    raw = raw_listings(db)
    all_items = canonical + raw
    items = [p for p in all_items if (not q or q.casefold() in p["name"].casefold()) and (not category or p["category"] == category) and (not brand or p.get("brand") == brand)]
    items = [p for p in items if (min_price is None or (p.get("price") is not None and p["price"] >= min_price)) and (max_price is None or (p.get("price") is not None and p["price"] <= max_price)) and (not deals or (p.get("discount_percent") or 0) >= 5)]
    key, reverse = {"recommended": (lambda p: p.get("discount_percent") or -100, True), "price_asc": (lambda p: p.get("price") or float("inf"), False), "price_desc": (lambda p: p.get("price") or 0, True), "discount": (lambda p: p.get("discount_percent") or -100, True), "rating": (lambda p: p.get("rating") or 0, True), "name": (lambda p: p["name"], False)}[sort]
    items.sort(key=key, reverse=reverse)
    total = len(items)
    from .demo import CATEGORIES
    categories = CATEGORIES + [{"id": "unclassified", "name": "Не классифицировано"}]
    return {"items": [{k: v for k, v in p.items() if k not in ("offers", "reviews", "browser_observations")} for p in items[(page - 1) * page_size:page * page_size]], "total": total, "page": page, "page_size": page_size, "categories": [{**c, "count": sum(p["category"] == c["id"] for p in all_items)} for c in categories], "data_mode": "demo" if settings.demo_mode and not raw else "mixed" if settings.demo_mode else "import"}


@app.get("/api/products/{slug}")
def product(slug: str, db: Session = Depends(get_db)):
    if slug.startswith("browser-"):
        rows = raw_listings(db, slug)
        if rows:
            return rows[0]
        if db.scalar(select(BrowserSnapshot.fingerprint).where(BrowserSnapshot.listing_id == slug).limit(1)):
            raise HTTPException(404, "Product not found")
    return project_product_prices(product_or_404(db, slug).data)


@app.get("/api/products/{slug}/history")
def history(slug: str, days: int = Query(90, ge=0, le=90), offer_id: str | None = None, db: Session = Depends(get_db)):
    if days not in (0, 7, 30, 90):
        raise HTTPException(422, "days must be 7, 30, 90 or 0 (all observations)")
    if slug.startswith("browser-"):
        rows = raw_listings(db, slug)
        if not rows or offer_id:
            raise HTTPException(404, "Product or offer not found")
        listing = rows[0]
        points = listing["history"]
        end = datetime.now(timezone.utc).date()
        selected = [point for point in points if date.fromisoformat(point["date"]) >= end - timedelta(days=days - 1)] if days else points
        return {"points": selected, "first_observed": points[0]["date"] if points else None, "last_updated": points[-1]["date"] if points else None, **listing["price_context"]}
    p = product_or_404(db, slug)
    if offer_id:
        offer = db.get(Offer, offer_id)
        if not offer or offer.product_id != p.id:
            raise HTTPException(404, "Offer not found")
        points = offer.data["history"]
        context = {key: offer.data[key] for key in ("currency", "region", "price_type", "payment_condition")}
    else:
        points = p.data.get("history", [])
        context = p.data.get("price_context") or {"currency": "RUB", "region": "RU-MOW", "price_type": "regular", "payment_condition": "any_card"}
    end = date.fromisoformat(points[-1]["date"]) if points and p.data.get("is_demo") else datetime.now(timezone.utc).date()
    selected = [point for point in points if date.fromisoformat(point["date"]) >= end - timedelta(days=days - 1)] if days else points
    return {"points": selected, "first_observed": points[0]["date"] if points else None, "last_updated": points[-1]["date"] if points else None, **context}


@app.get("/api/products/{slug}/reviews")
def reviews(slug: str, slice: Literal["all", "500", "100", "10", "30d", "90d"] = "all", db: Session = Depends(get_db)):
    p = product_or_404(db, slug).data
    r = p["reviews"]
    return {**r, "selected": r["slices"].get(slice), "slice": slice}


class AlertInput(BaseModel):
    product_id: str = Field(max_length=100)
    target_price: float = Field(gt=0, le=100000000, allow_inf_nan=False)
    consent: bool


_rate_limit = defaultdict(deque)


@app.post("/api/alerts", status_code=201)
def alert(payload: AlertInput, request: Request, db: Session = Depends(get_db)):
    if not settings.telegram_enabled:
        raise HTTPException(503, "Telegram-бот пока не настроен. Сайт доступен без подписки.")
    if not payload.consent:
        raise HTTPException(422, "Explicit consent is required")
    p = db.get(Product, payload.product_id)
    if not p or not p.active or (not settings.demo_mode and p.data.get("is_demo")):
        raise HTTPException(404, "Product not found")
    # Ephemeral rate limiting; identifiers are never persisted. Reverse proxy
    # should supply global limits for production multiple-worker deployment.
    key = request.client.host if request.client else "local"
    queue = _rate_limit[key]
    now = monotonic()
    while queue and queue[0] < now - 60:
        queue.popleft()
    if len(queue) >= 10:
        raise HTTPException(429, "Слишком много запросов; повторите через минуту")
    queue.append(now)
    return create_alert(db, payload.product_id, payload.target_price)


class EventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: str = Field(max_length=100)
    event: Literal["product_view"]


@app.post("/api/events", status_code=202)
def event(payload: EventInput, db: Session = Depends(get_db)):
    product = db.get(Product, payload.product_id)
    if not product or not product.active or (not settings.demo_mode and product.data.get("is_demo")):
        raise HTTPException(404, "Product not found")
    db.add(OutboundClick(product_id=payload.product_id, event=payload.event))
    db.commit()
    return {"accepted": True}


@app.get("/api/out/{offer_id}")
def outbound(offer_id: str, db: Session = Depends(get_db)):
    offer = db.get(Offer, offer_id)
    if not offer:
        raise HTTPException(404, "Offer not found")
    product = db.get(Product, offer.product_id)
    if not product or not product.active or (not settings.demo_mode and product.data.get("is_demo")):
        raise HTTPException(404, "Offer not found")
    if offer.data.get("is_demo") or not offer.url:
        raise HTTPException(409, "Это демонстрационное предложение. Реальная ссылка продавца отсутствует.")
    try:
        url = safe_outbound_url(offer.url)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.add(OutboundClick(product_id=offer.product_id, offer_id=offer.id, event="outbound_click"))
    db.commit()
    return RedirectResponse(url, status_code=303, headers={"Referrer-Policy": "no-referrer"})


@app.get("/api/admin/status", dependencies=[Depends(require_admin)])
def admin_status(db: Session = Depends(get_db)):
    runs = db.scalars(select(SourceSyncRun).order_by(SourceSyncRun.id.desc()).limit(50)).all()
    products_query = select(func.count()).select_from(Product)
    offers_query = select(func.count()).select_from(Offer)
    if not settings.demo_mode:
        products_query = products_query.where(func.coalesce(Product.data["is_demo"].as_boolean(), False).is_(False))
        offers_query = offers_query.join(Product, Offer.product_id == Product.id).where(
            func.coalesce(Offer.data["is_demo"].as_boolean(), False).is_(False),
            func.coalesce(Product.data["is_demo"].as_boolean(), False).is_(False),
        )
    counts = {"products": db.scalar(products_query), "offers": db.scalar(offers_query),
              "browser_listings": db.scalar(select(func.count(func.distinct(BrowserSnapshot.listing_id)))),
              "pending_matches": db.scalar(select(func.count()).select_from(ProductMatch).where(ProductMatch.status == "pending"))}
    return {"sources": [{"id": "demo", "status": "enabled" if settings.demo_mode else "disabled", "type": "synthetic"}, {"id": "import", "status": "ready", "type": "authorized_feed"}, {"id": "ozon", "status": "disabled", "reason": "Требуется разрешённый API/фид"}, {"id": "wildberries", "status": "disabled", "reason": "Требуется разрешённый API/фид"}], "sync_runs": [{"id": r.id, "source_id": r.source_id, "status": r.status, "imported": r.imported, "duplicates": r.duplicates, "error": r.error, "started_at": r.started_at, "finished_at": r.finished_at, "provenance": r.provenance} for r in runs], "counts": counts, "telegram_enabled": settings.telegram_enabled}


@app.get("/api/admin/products", dependencies=[Depends(require_admin)])
def admin_products(db: Session = Depends(get_db)):
    return [{"id": p.id, "slug": p.slug, "name": p.name, "active": p.active, "is_demo": p.data.get("is_demo")} for p in db.scalars(select(Product))]


@app.post("/api/admin/products", dependencies=[Depends(require_admin)], status_code=201)
def add_product(payload: CanonicalInput, db: Session = Depends(get_db)):
    try:
        return create_canonical(db, payload).data
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


class ProductPatch(BaseModel):
    active: bool


class BrowserListingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    category: Literal["gpu", "ssd", "ram", "unclassified"] | None = None
    visible: StrictBool | None = None

    @model_validator(mode="after")
    def require_changes(self):
        if not self.model_fields_set or any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Provide category and/or visible, without null values")
        return self


@app.get("/api/admin/browser-listings", dependencies=[Depends(require_admin)])
def admin_browser_listings(page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=100), db: Session = Depends(get_db)):
    listings = raw_listings(db, include_hidden=True)
    selected = listings[(page - 1) * page_size:page * page_size]
    return {"items": [{k: v for k, v in listing.items() if k != "browser_observations"} for listing in selected], "total": len(listings), "page": page, "page_size": page_size}


@app.patch("/api/admin/browser-listings/{listing_id}", dependencies=[Depends(require_admin)])
def classify_browser_listing(listing_id: str, payload: BrowserListingPatch, db: Session = Depends(get_db)):
    if not db.scalar(select(BrowserSnapshot.fingerprint).where(BrowserSnapshot.listing_id == listing_id).limit(1)):
        raise HTTPException(404, "Browser listing not found")
    moderation = db.get(BrowserListingModeration, listing_id)
    if moderation is None:
        db.add(BrowserListingModeration(listing_id=listing_id, category=payload.category or "unclassified", visible=payload.visible if payload.visible is not None else True))
    else:
        if payload.category is not None:
            moderation.category = payload.category
        if payload.visible is not None:
            moderation.visible = payload.visible
    db.commit()
    return raw_listings(db, listing_id, include_hidden=True)[0]


@app.patch("/api/admin/products/{product_id}", dependencies=[Depends(require_admin)])
def update_product(product_id: str, payload: ProductPatch, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    p.active = payload.active
    db.commit()
    return {"id": p.id, "active": p.active}


@app.get("/api/admin/matches", dependencies=[Depends(require_admin)])
def matches(db: Session = Depends(get_db)):
    return [{"id": m.id, "source_id": m.source_id, "external_id": m.external_id, "product_id": m.product_id, "confidence": m.confidence, "status": m.status, "reason": m.reason, "payload": m.payload} for m in db.scalars(select(ProductMatch).where(ProductMatch.status == "pending"))]


class MatchDecision(BaseModel):
    decision: Literal["approve", "reject"]


@app.post("/api/admin/matches/{match_id}", dependencies=[Depends(require_admin)])
def moderate_match(match_id: int, payload: MatchDecision, db: Session = Depends(get_db)):
    from .imports import FeedRow
    from .analytics import match_product
    m = db.get(ProductMatch, match_id)
    if not m or m.status != "pending":
        raise HTTPException(404, "Pending match not found")
    if payload.decision == "approve":
        p = db.get(Product, m.product_id)
        score, reason = match_product(m.payload, p.data)
        if score < .8:
            raise HTTPException(409, f"Hard matching boundary: {reason}")
        # Approval must not relabel a different MPN; the operator certifies a
        # missing/alternate article only after reviewing actual source details.
        row = {k: v for k, v in m.payload.items() if k != "permission_reference"}
        row["mpn"] = p.data["mpn"]
        permission = m.payload["permission_reference"]
        ImportProvider(db, m.source_id, permission).import_rows([FeedRow.model_validate(row)])
        m.status = "approved"
        db.commit()
    else:
        m.status = "rejected"
        db.commit()
    return {"id": m.id, "status": m.status}


class ImportInput(BaseModel):
    source_id: str = Field(min_length=1, max_length=80)
    permission_reference: str = Field(min_length=8, max_length=500)
    format: Literal["csv", "json"]
    content: str = Field(max_length=5_000_000)


@app.post("/api/admin/import", dependencies=[Depends(require_admin)])
def import_data(payload: ImportInput, db: Session = Depends(get_db)):
    try:
        return ImportProvider(db, payload.source_id, payload.permission_reference).import_content(payload.content, payload.format)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)[:2000]) from exc


class BrowserImportInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(max_length=5_000_000)
    filename: str | None = Field(default=None, max_length=250)


@app.post("/api/admin/browser-import", dependencies=[Depends(require_admin)])
def import_browser_json(payload: BrowserImportInput, db: Session = Depends(get_db)):
    try:
        return import_browser_export(db, payload.content, payload.filename)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)[:2000]) from exc
