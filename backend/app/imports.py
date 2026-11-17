"""Validated authorized feed parser. No implicit network access or scraping."""
import csv
import hashlib
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from .analytics import daily_prices, match_product, offer_price_is_fresh, price_is_confirmed, price_metrics, reliability, review_slices
from .models import Product, ProductVariant, Seller, Offer, PriceObservation, ProductMatch, SourceSyncRun, utcnow
from .providers import MarketplaceProvider
from .security import safe_outbound_url


class FeedRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    external_id: str = Field(min_length=1, max_length=120)
    brand: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=150)
    mpn: str = Field(max_length=120)
    gtin: str | None = None
    category: Literal["ssd", "ram", "gpu"]
    capacity: str = Field(min_length=1, max_length=50)
    bundle: str = Field(min_length=1, max_length=100)
    condition: Literal["new", "used", "refurbished", "unknown"]
    seller_id: str = Field(min_length=1, max_length=100)
    seller_name: str = Field(min_length=1, max_length=150)
    marketplace: str = Field(min_length=1, max_length=40)
    price: float = Field(gt=0, le=100000000, allow_inf_nan=False)
    currency: Literal["RUB"] = "RUB"
    region: str = Field(min_length=1, max_length=80)
    price_type: Literal["regular", "membership", "installment"] = "regular"
    payment_condition: str = Field(min_length=1, max_length=80)
    availability: bool
    observed_at: datetime
    url: str = Field(min_length=1)
    warranty_months: int | None = Field(default=None, ge=0, le=240)

    @field_validator("observed_at")
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None or value > datetime.now(timezone.utc) + timedelta(minutes=10):
            raise ValueError("Timezone required; future observations are not accepted")
        return value.astimezone(timezone.utc)

    @field_validator("url")
    @classmethod
    def allowed_url(cls, value):
        return safe_outbound_url(value)


def parse_feed(content: str, format: str) -> list[FeedRow]:
    if len(content.encode("utf-8")) > 5_000_000:
        raise ValueError("Feed exceeds 5 MB; split into batches")
    raw = json.loads(content) if format == "json" else list(csv.DictReader(io.StringIO(content.lstrip("\ufeff"))))
    if not isinstance(raw, list) or len(raw) > 10000:
        raise ValueError("Expected an array with at most 10,000 rows")
    return [FeedRow.model_validate(row) for row in raw]


def _key(*values):
    return hashlib.sha256("|".join(str(v) for v in values).encode()).hexdigest()[:28]


class ImportProvider(MarketplaceProvider):
    def __init__(self, session, source_id: str, permission: str, provenance: dict | None = None):
        if not source_id or source_id == "demo" or len(source_id) > 80 or len(permission.strip()) < 8:
            raise ValueError("Provide a non-demo source ID and a permission/contract reference (at least 8 characters)")
        self.session, self.source_id = session, source_id
        self.data_provenance = {"source_id": source_id, "type": "authorized_import", "permission_reference": permission, "rights": {"facts": "asserted_by_operator", "images": "not_imported", "review_text": "not_imported"}}
        if provenance:
            self.data_provenance.update(provenance)

    def get_products(self):
        return [p.data for p in self.session.scalars(select(Product)).all() if not p.data.get("is_demo")]

    def get_offers(self, product_id):
        return [o.data for o in self.session.scalars(select(Offer).where(Offer.product_id == product_id, Offer.source_id == self.source_id))]

    def get_prices(self, offer_id):
        return [{"date": p.observed_at.date().isoformat(), "price": p.price} for p in self.session.scalars(select(PriceObservation).where(PriceObservation.offer_id == offer_id).order_by(PriceObservation.observed_at))]

    def get_reviews(self, product_id):
        return review_slices(None, datetime.now(timezone.utc).date(), self.source_id)

    def import_content(self, content: str, format: str) -> dict:
        try:
            rows = parse_feed(content, format)
        except (ValueError, TypeError) as exc:
            self.session.add(SourceSyncRun(source_id=self.source_id, status="failed", error=str(exc)[:1000], finished_at=utcnow(), provenance=self.data_provenance))
            self.session.commit()
            raise
        return self.import_rows(rows)

    def import_rows(self, rows: list[FeedRow], canonical_product_id: str | None = None, commit: bool = True) -> dict:
        run = SourceSyncRun(source_id=self.source_id, status="running", provenance=self.data_provenance)
        self.session.add(run)
        self.session.commit() if commit else self.session.flush()
        imported = duplicates = pending = 0
        product_ids, offer_ids = set(), set()
        try:
            for row in rows:
                if not row.mpn and not canonical_product_id:
                    raise ValueError("Unknown MPN requires explicit manual canonical binding; automatic matching is disabled")
                payload = row.model_dump(mode="json")
                product_key = "import-" + _key(row.brand.lower(), row.model.lower(), row.mpn.lower(), row.condition, row.capacity.lower(), row.bundle.lower())
                product = self.session.get(Product, product_key)
                if canonical_product_id:
                    bound = self.session.get(Product, canonical_product_id)
                    score = match_product(payload, bound.data)[0] if bound else 0
                    manually_bound_unknown_mpn = score >= .85 and not row.mpn and not bound.data.get("mpn")
                    if not bound or not bound.active or (score < .98 and not manually_bound_unknown_mpn):
                        raise ValueError("The observation is incompatible with the selected canonical variant")
                    # Synthetic history/reviews must never be attached to a real
                    # browser capture. A demo model is only a metadata reference.
                    if not bound.data.get("is_demo"):
                        product = bound
                if not product:
                    matches = [(p, *match_product(payload, p.data)) for p in self.session.scalars(select(Product).where(Product.brand.ilike(row.brand))) if not p.data.get("is_demo")]
                    best = max(matches, key=lambda m: m[1], default=None)
                    if best and best[1] >= .98:
                        product = best[0]
                    elif best and best[1] >= .8:
                        existing = self.session.scalar(select(ProductMatch).where(ProductMatch.source_id == self.source_id, ProductMatch.external_id == row.external_id, ProductMatch.status == "pending"))
                        if not existing:
                            self.session.add(ProductMatch(source_id=self.source_id, external_id=row.external_id, product_id=best[0].id, confidence=best[1], status="pending", reason=best[2], payload={**payload, "permission_reference": self.data_provenance["permission_reference"]}))
                        pending += 1
                        continue
                if not product:
                    from .demo import slugify, CATEGORIES
                    title = f"{row.brand} {row.model} {row.capacity}"
                    data = {"id": product_key, "slug": slugify(f"{row.brand}-{row.model}-{row.mpn}") + "-" + product_key[-6:], "name": title, "brand": row.brand, "model": row.model, "mpn": row.mpn, "gtin": row.gtin, "capacity": row.capacity, "bundle": row.bundle, "category": row.category, "category_name": next(c["name"] for c in CATEGORIES if c["id"] == row.category), "condition": row.condition, "specs": {"Объём": row.capacity, "Артикул": row.mpn, "Состояние": row.condition}, "image_kind": row.category, "data_provenance": self.data_provenance, "is_demo": False, "rating": None, "reviews_count": 0, "review_trend": "stable", "offers": [], "reviews": self.get_reviews(product_key)}
                    product = Product(id=product_key, slug=data["slug"], name=title, category=row.category, brand=row.brand, data=data)
                    self.session.add(product)
                    self.session.flush()
                    self.session.add(ProductVariant(id=product_key + "-variant", product_id=product_key, mpn=row.mpn, gtin=row.gtin, condition=row.condition, specifications=data["specs"]))
                    self.session.flush()
                seller_id = "seller-" + _key(self.source_id, row.seller_id)
                if not self.session.get(Seller, seller_id):
                    self.session.add(Seller(id=seller_id, name=row.seller_name, rating=None, reviews_count=None, provenance=self.data_provenance))
                    self.session.flush()
                # Payment and regional contexts are different concrete offers.
                offer_id = self.source_id + "-" + _key(row.external_id, product.id, seller_id, row.region, row.currency, row.price_type, row.payment_condition, row.condition)
                offer = self.session.get(Offer, offer_id)
                if not offer:
                    variant = self.session.scalar(select(ProductVariant).where(ProductVariant.product_id == product.id))
                    offer = Offer(id=offer_id, product_id=product.id, variant_id=variant.id, seller_id=seller_id, marketplace=row.marketplace, source_id=self.source_id, url=row.url, data={})
                    self.session.add(offer)
                    self.session.flush()
                existing = self.session.scalar(select(PriceObservation).where(PriceObservation.offer_id == offer_id, PriceObservation.observed_at == row.observed_at, PriceObservation.currency == row.currency, PriceObservation.region == row.region, PriceObservation.price_type == row.price_type, PriceObservation.payment_condition == row.payment_condition))
                product_ids.add(product.id)
                offer_ids.add(offer.id)
                if existing:
                    duplicates += 1
                    continue
                self.session.add(PriceObservation(offer_id=offer_id, price=row.price, currency=row.currency, region=row.region, price_type=row.price_type, payment_condition=row.payment_condition, availability=row.availability, observed_at=row.observed_at, source_id=self.source_id, data_provenance=self.data_provenance))
                self.session.flush()
                observations = self.session.scalars(select(PriceObservation).where(PriceObservation.offer_id == offer_id).order_by(PriceObservation.observed_at)).all()
                latest = observations[-1]
                observed_at = latest.observed_at.replace(tzinfo=timezone.utc) if latest.observed_at.tzinfo is None else latest.observed_at
                offer.data = {"id": offer_id, "marketplace": row.marketplace, "seller": {"id": seller_id, "name": row.seller_name, "rating": None, "reviews_count": None}, "price": latest.price, "currency": row.currency, "region": row.region, "price_type": row.price_type, "payment_condition": row.payment_condition, "availability": latest.availability, "condition": row.condition, "warranty_months": row.warranty_months, "history": [{"date": p.observed_at.date().isoformat(), "price": p.price} for p in observations if p.availability], "url": row.url, "is_demo": False, "source_id": self.source_id, "observed_at": observed_at.isoformat()}
                offer.data = {**offer.data, "reliability": reliability(offer.data), "price_confirmed": price_is_confirmed(offer.data), "data_provenance": self.data_provenance}
                self.session.flush()
                product.data = {**product.data, "data_provenance": self.data_provenance}
                refresh_product(self.session, product)
                imported += 1
            run.status, run.imported, run.duplicates, run.finished_at = "success", imported, duplicates, utcnow()
            self.session.commit() if commit else self.session.flush()
        except Exception as exc:
            self.session.rollback()
            if commit:
                run = self.session.get(SourceSyncRun, run.id)
                run.status, run.error, run.finished_at = "failed", str(exc)[:1000], utcnow()
                self.session.commit()
            raise
        return {"run_id": run.id, "imported": imported, "duplicates": duplicates, "pending_matches": pending, "product_ids": sorted(product_ids), "offer_ids": sorted(offer_ids)}


def project_product_prices(data: dict, offers: list[dict] | None = None, now: datetime | None = None) -> dict:
    """Project real price freshness at read time without mutating stored facts."""
    if data.get("is_demo"):
        return data
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must have a timezone")
    offers = offers if offers is not None else data.get("offers", [])
    offers = [{**offer, "price_fresh": offer_price_is_fresh(offer, now),
               "price_confirmed": offer_price_is_fresh(offer, now) and price_is_confirmed(offer)} for offer in offers]
    # Pick the first confirmed offer's context once; never blend another region
    # or payment condition, and never silently switch it on future imports.
    context_keys = ("currency", "region", "price_type", "payment_condition")
    context = data.get("price_context")
    if not context and offers:
        context = {key: offers[0][key] for key in context_keys}
    comparable = [o for o in offers if context and all(context.get(key) is not None and o.get(key) == context[key] for key in context_keys)]
    daily = {}
    for offer in comparable:
        for p in daily_prices(offer["history"]):
            daily[p["date"]] = min(daily.get(p["date"], p["price"]), p["price"])
    metrics = price_metrics([{"date": k, "price": v} for k, v in sorted(daily.items())], now=now.astimezone(timezone.utc).date())
    current_offer = min((o for o in comparable if o.get("availability") and o["price_fresh"]), key=lambda o: o["price"], default=None)
    current = current_offer["price"] if current_offer else None
    confirmed = price_is_confirmed(current_offer) if current_offer else False
    baseline = metrics.get("median_30")
    deviation = round((baseline - current) / baseline * 100, 1) if baseline and current else None
    signal = deviation if confirmed and metrics.get("baseline_stable", True) else None
    stale = current is None and any(o.get("availability") and not o["price_fresh"] for o in comparable)
    metrics.update(price=current, price_confirmed=confirmed, median_deviation_percent=deviation, discount_percent=signal, status="stale_price" if stale else "unconfirmed_price" if current is not None and not confirmed else "unstable_baseline" if not metrics.get("baseline_stable", True) else "good" if signal is not None and signal >= 5 else "regular" if current is not None and baseline else "insufficient_data")
    timestamps = []
    for offer in offers:
        try:
            captured = datetime.fromisoformat(str(offer.get("observed_at") or "").replace("Z", "+00:00"))
            if captured.tzinfo is not None:
                timestamps.append(captured.astimezone(timezone.utc))
        except ValueError:
            pass
    if timestamps:
        metrics["last_updated"] = max(timestamps).date().isoformat()
    return {**data, "price_context": context, "offers": offers, "offers_count": sum(bool(o.get("availability") and o["price_fresh"]) for o in comparable), "history": [], **metrics}


def refresh_product(session, product):
    offers = [o.data for o in session.scalars(select(Offer).where(Offer.product_id == product.id))]
    product.data = project_product_prices(product.data, offers)
