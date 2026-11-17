"""Upload browser exports as unverified listings, separate from canonical models."""
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator
from sqlalchemy import func, select
from .analytics import offer_price_is_fresh, review_slices
from .collector import product_url
from .models import BrowserListingModeration, BrowserSnapshot, SourceSyncRun, utcnow


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False, strict=True)


class Source(Input):
    marketplace: Literal["ozon", "wildberries"]
    url: str = Field(max_length=2000)
    requested_url: str | None = Field(default=None, max_length=2000)
    extraction_method: Literal["jsonld", "dom", "none"]
    extractor_version: str = Field(max_length=40)
    captured_at: datetime

    @field_validator("url", "requested_url")
    @classmethod
    def validate_url(cls, value):
        return product_url(value)[0] if value is not None else None

    @field_validator("captured_at")
    @classmethod
    def validate_time(cls, value):
        if value.tzinfo is None or value > utcnow() + timedelta(minutes=10):
            raise ValueError("Capture needs a timezone and cannot be in the future")
        return value.astimezone(timezone.utc)


class RawProduct(Input):
    title: str | None = Field(max_length=300)
    brand: str | None = Field(max_length=80)
    model: str | None = Field(max_length=150)
    mpn: str | None = Field(max_length=120)
    sku: str = Field(pattern=r"^[0-9]{1,20}$")
    capacity: str | None = Field(max_length=80)
    bundle: str | None = Field(max_length=200)
    condition: Literal["unknown", "new", "used", "refurbished"]


class RawSeller(Input):
    id: str | None = Field(max_length=100)
    name: str | None = Field(max_length=150)


class Evidence(Input):
    region: str | None = Field(max_length=120)
    payment_condition: str | None = Field(max_length=120)


class RawOffer(Input):
    price: float | None = Field(gt=0, le=100000000, allow_inf_nan=False)
    currency: Literal["RUB"] | None
    region: Literal["RU-MOW", "RU-SPE"] | None
    price_type: Literal["regular"] | None
    payment_condition: Literal["other_bank_card", "any_card"] | None
    availability: StrictBool | None
    seller: RawSeller
    warranty_months: int | None = Field(ge=0, le=240, strict=True)
    evidence: Evidence


class Candidate(Input):
    price: float | None = Field(gt=0, le=100000000, allow_inf_nan=False)
    currency: str | None = Field(max_length=8)
    method: Literal["jsonld", "dom"]
    raw: str | None = Field(max_length=120)
    label: str | None = Field(max_length=120)
    matches_page: StrictBool | None
    seller_id: str | None = Field(max_length=100)
    seller_name: str | None = Field(max_length=150)


class Specification(Input):
    name: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=300)


class Rating(Input):
    value: float | None = Field(ge=0, le=5, allow_inf_nan=False)
    rating_count: int | None = Field(ge=0, le=100000000, strict=True)
    review_count: int | None = Field(ge=0, le=100000000, strict=True)
    scope: Literal["product", "unknown"]


class Observation(Input):
    source: Source
    product: RawProduct
    offer: RawOffer
    candidates: list[Candidate] = Field(max_length=30)
    needs_review: StrictBool
    review_reasons: list[str] = Field(max_length=20)
    identity_confirmed: StrictBool
    images: list[str] = Field(default_factory=list, max_length=10)
    specifications: list[Specification] = Field(default_factory=list, max_length=40)
    rating: Rating | None = None

    @field_validator("images")
    @classmethod
    def validate_images(cls, values):
        allowed = ("ozone.ru", "ozon.ru", "wbbasket.ru", "wb.ru")
        for value in values:
            try:
                parsed = urlsplit(value)
                host = parsed.hostname or ""
                valid = (
                    len(value) <= 2000 and not re.search(r"[\\\x00-\x20]", value)
                    and parsed.scheme == "https" and not parsed.username and not parsed.password
                    and parsed.port is None and not parsed.query and not parsed.fragment
                    and any(host == suffix or host.endswith("." + suffix) for suffix in allowed)
                )
            except ValueError:
                valid = False
            if not valid:
                raise ValueError("Expected an HTTPS image on an allowlisted marketplace domain without query parameters")
        return list(dict.fromkeys(values))

    @field_validator("identity_confirmed")
    @classmethod
    def unverified_identity(cls, value):
        if value:
            raise ValueError("Automatic exports cannot confirm canonical identity")
        return False

    @field_validator("review_reasons")
    @classmethod
    def bounded_reasons(cls, values):
        if any(len(value) > 80 for value in values):
            raise ValueError("Review reason exceeds 80 characters")
        return list(dict.fromkeys(values))

    @model_validator(mode="after")
    def matching_source(self):
        _, marketplace, sku = product_url(self.source.url)
        if marketplace != self.source.marketplace or sku != self.product.sku:
            raise ValueError("Marketplace/SKU differs from the source URL")
        if self.source.requested_url and self.source.requested_url != self.source.url:
            raise ValueError("Requested URL differs from captured product")
        return self


class JobSettings(Input):
    delaySeconds: float = Field(ge=0, le=3600, allow_inf_nan=False)
    renderWaitSeconds: float = Field(ge=0, le=300, allow_inf_nan=False)
    pageTimeoutSeconds: float = Field(ge=1, le=600, allow_inf_nan=False)
    maxPages: int = Field(ge=1, le=200, strict=True)
    autoExport: StrictBool
    # Optional so the original v1 / extension 0.2 exports still import unchanged.
    categoryScrollRounds: int | None = Field(default=None, ge=0, le=50, strict=True)
    categoryScrollPauseSeconds: int | None = Field(default=None, ge=1, le=10, strict=True)
    categoryMaxProducts: int | None = Field(default=None, ge=1, le=200, strict=True)
    categoryMaxPages: int | None = Field(default=None, ge=1, le=10, strict=True)


class DiscoverySummary(Input):
    rounds: int = Field(ge=0, le=51, strict=True)
    scrolls: int = Field(ge=0, le=50, strict=True)
    found_count: int = Field(ge=0, le=100000, strict=True)
    stop_reason: Literal["round_limit", "product_limit", "queue_limit", "end", "no_growth"] | None
    page_number: int = Field(ge=1, le=10, strict=True)


def queue_url(value):
    try:
        return product_url(value)[0]
    except ValueError:
        if re.fullmatch(r"https://www\.ozon\.ru/category/[a-zA-Z0-9_-]+-[0-9]+/?(?:\?page=(?:[2-9]|[1-9][0-9]{1,2}|1000))?", value):
            return value
        raise ValueError("Expected an allowlisted product/category URL") from None


class QueueItem(Input):
    url: str = Field(max_length=2000)
    kind: Literal["product", "discovery"]
    status: Literal["pending", "loading", "waiting", "complete", "error"]
    attempts: int = Field(ge=0, le=100, strict=True)
    discovery: DiscoverySummary | None = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, value):
        return queue_url(value)


class Job(Input):
    run_id: str | None = Field(max_length=100)
    status: Literal["idle", "running", "paused", "completed", "stopped", "blocked"]
    partial: StrictBool
    started_at: datetime | None
    updated_at: datetime
    exported_at: datetime
    settings: JobSettings
    queue: list[QueueItem] = Field(max_length=200)
    processed_pages: int = Field(ge=0, le=200, strict=True)
    discovered_count: int = Field(ge=0, le=100000, strict=True)
    truncated_count: int = Field(ge=0, le=100000, strict=True)

    @field_validator("started_at", "updated_at", "exported_at")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("Job dates need a timezone")
        return value


class ErrorRecord(Input):
    url: str | None = Field(max_length=2000)
    code: str = Field(min_length=1, max_length=100)
    message: str = Field(max_length=1000)
    occurred_at: datetime

    @field_validator("url")
    @classmethod
    def validate_url(cls, value):
        return queue_url(value) if value is not None else None


class BrowserExport(Input):
    schema_version: Literal["cenoskop.browser-export.v1"]
    job: Job
    observations: list[Observation] = Field(max_length=200)
    errors: list[ErrorRecord] = Field(max_length=500)


def parse_browser_export(content):
    if len(content.encode("utf-8")) > 5000000:
        raise ValueError("JSON export exceeds 5 MB")
    return BrowserExport.model_validate_json(content.lstrip("\ufeff"))


def import_browser_export(session, content, filename=None):
    # Validate every row before opening any write operation; the import is atomic.
    document = parse_browser_export(content)
    imported = duplicates = 0
    listing_ids = set()
    run = SourceSyncRun(source_id="browser-json", status="running", provenance={"type": "browser_json_unverified", "filename": Path(filename).name if filename else None, "exported_at": document.job.exported_at.isoformat(), "notice": "Оператор загрузил JSON. Поля и соответствие модели не подтверждены."})
    try:
        session.add(run)
        session.flush()
        for observation in document.observations:
            data = observation.model_dump(mode="json", exclude_none=False)
            # Optional absent requested_url is not part of an observation's facts.
            data["source"].pop("requested_url", None)
            # Keep hashes of historical exports stable when the new optional facts are absent.
            for key in ("images", "specifications", "rating"):
                if not data[key]:
                    data.pop(key)
            fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
            listing_id = f"browser-{observation.source.marketplace}-{observation.product.sku}"
            listing_ids.add(listing_id)
            if session.get(BrowserSnapshot, fingerprint):
                duplicates += 1
                continue
            session.add(BrowserSnapshot(fingerprint=fingerprint, listing_id=listing_id, marketplace=observation.source.marketplace, sku=observation.product.sku, url=observation.source.url, observed_at=observation.source.captured_at, data=data))
            session.flush()
            imported += 1
        run.status, run.imported, run.duplicates, run.finished_at = "success", imported, duplicates, utcnow()
        session.commit()
    except Exception:
        session.rollback()
        raise
    return {"source_id": "browser-json", "run_id": run.id, "imported": imported, "duplicates": duplicates, "total_listings": session.scalar(select(func.count(func.distinct(BrowserSnapshot.listing_id)))), "listing_ids": sorted(listing_ids)}


def observed_price_history(snapshots, current_offer):
    """Return actual daily price observations in the exact latest known context.

    Unknown payment, region, currency or price type cannot establish that two
    displayed prices are comparable. Never fill gaps or infer unavailable data.
    """
    keys = ("currency", "region", "price_type", "payment_condition")
    context = tuple(current_offer.get(key) for key in keys)
    if any(value is None for value in context):
        return []
    days = {}
    for snapshot in snapshots:
        offer = snapshot.data["offer"]
        if tuple(offer.get(key) for key in keys) != context or offer.get("price") is None or offer.get("availability") is False:
            continue
        captured = datetime.fromisoformat(snapshot.data["source"]["captured_at"].replace("Z", "+00:00")).astimezone(timezone.utc)
        day = captured.date().isoformat()
        previous = days.get(day)
        if previous is None or captured > previous[0]:
            days[day] = (captured, offer["price"])
        elif captured == previous[0] and previous[1] != offer["price"]:
            # Conflicting observations with identical capture times cannot be ordered.
            days[day] = (captured, None)
    return [{"date": day, "price": value[1]} for day, value in sorted(days.items()) if value[1] is not None]


def infer_category(title):
    """Classify only explicit product types; ambiguous accessories remain unclassified."""
    name = (title or "").casefold().replace("ё", "е")
    if re.search(r"\b(мост|переходник|адаптер|кабель|крепление|охлаждение|кулер|водоблок|чехол|подставка|райзер|термопрокладк\w*|радиатор)\b", name):
        return "unclassified"
    matches = []
    if re.search(r"\b(видеокарт\w*|видеоплат\w*|graphics card|video card)\b", name):
        matches.append("gpu")
    if re.search(r"\b(ssd|твердотельн\w* накопител\w*)\b", name):
        matches.append("ssd")
    if re.search(r"\b(оперативн\w* памят\w*|модул\w* памят\w*|оперативн\w* запоминающ\w* устройств\w*)\b", name):
        matches.append("ram")
    return matches[0] if len(matches) == 1 else "unclassified"


def raw_listings(session, slug=None, *, include_hidden=False):
    query = select(BrowserSnapshot)
    if slug:
        query = query.where(BrowserSnapshot.listing_id == slug)
    rows = session.scalars(query.order_by(BrowserSnapshot.observed_at, BrowserSnapshot.fingerprint)).all()
    grouped = {}
    for row in rows:
        grouped.setdefault(row.listing_id, []).append(row)
    categories = {"gpu": "Видеокарты", "ssd": "SSD-накопители", "ram": "Оперативная память", "unclassified": "Не классифицировано"}
    moderation = {item.listing_id: item for item in session.scalars(select(BrowserListingModeration))}
    result = []
    now = datetime.now(timezone.utc)
    for listing_id, snapshots in grouped.items():
        assigned = moderation.get(listing_id)
        visible = assigned.visible if assigned is not None else True
        if not visible and not include_hidden:
            continue
        latest = snapshots[-1]
        raw = latest.data
        product, offer = raw["product"], raw["offer"]
        images = raw.get("images") or []
        rating = raw.get("rating") or {}
        specs = {item["name"]: item["value"] for item in raw.get("specifications", [])}
        specs["SKU"] = latest.sku
        date_string = raw["source"]["captured_at"][:10]
        price_history = observed_price_history(snapshots, offer)
        price_fresh = offer_price_is_fresh({"observed_at": raw["source"]["captured_at"]}, now)
        category = assigned.category if assigned and assigned.category in categories else infer_category(product["title"])
        result.append({"id": listing_id, "slug": listing_id, "record_type": "unverified_listing", "name": product["title"] or f"Карточка {latest.marketplace} {latest.sku}", "brand": product["brand"] or "", "category": category, "category_name": categories[category], "image_kind": category, "category_source": "operator" if assigned else "automatic" if category != "unclassified" else None, "visible": visible, "images": images, "image_url": images[0] if images else None, "model": product["model"] or "", "mpn": product["mpn"] or "", "gtin": None, "capacity": product["capacity"] or "", "bundle": product["bundle"] or "", "condition": product["condition"], "specs": specs, "is_demo": False, "price": offer["price"] if price_fresh else None, "price_fresh": price_fresh, "price_context": {key: offer[key] for key in ("currency", "region", "price_type", "payment_condition")}, "median_30": None, "median_90": None, "min_price": None, "max_price": None, "discount_percent": None, "history": price_history, "days_observed": len({row.data["source"]["captured_at"][:10] for row in snapshots}), "first_observed": snapshots[0].data["source"]["captured_at"][:10], "last_updated": date_string, "status": "needs_review", "offers": [], "offers_count": 0, "rating": rating.get("value"), "rating_count": rating.get("rating_count"), "reviews_count": rating.get("review_count"), "rating_scope": rating.get("scope"), "review_trend": "unavailable", "reviews": review_slices(None, datetime.now(timezone.utc).date(), "browser-json"), "data_provenance": {"source_id": "browser-json", "type": "browser_json_unverified", "observed_at": raw["source"]["captured_at"], "notice": "Непроверенная карточка из JSON. Поля неизвестны, сопоставление с моделью не подтверждено."}, "browser_observation": raw, "browser_observations": [row.data for row in snapshots]})
    return result
