"""Manual canonical metadata, deliberately without observations or ratings."""
from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from .analytics import review_slices
from .demo import CATEGORIES, slugify
from .imports import _key
from .models import Product, ProductVariant


class CanonicalInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=250)
    brand: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=150)
    mpn: str = Field(default="", max_length=120)
    category: Literal["ssd", "ram", "gpu"]
    capacity: str = Field(min_length=1, max_length=50)
    bundle: str = Field(min_length=1, max_length=100)
    condition: Literal["new", "used", "refurbished", "unknown"]
    gtin: str | None = Field(default=None, max_length=20)
    specs: dict[str, str] = Field(default_factory=dict, max_length=30)


def create_canonical(session, payload: CanonicalInput):
    key = "import-" + _key(payload.brand.lower(), payload.model.lower(), payload.mpn.lower(), payload.condition, payload.capacity.lower(), payload.bundle.lower())
    if session.get(Product, key):
        raise ValueError("Canonical model already exists")
    data = payload.model_dump()
    slug = slugify(f"{payload.brand}-{payload.model}-{payload.mpn}")[:125] + "-" + key[-6:]
    data.update(id=key, slug=slug, category_name=next(c["name"] for c in CATEGORIES if c["id"] == payload.category), image_kind=payload.category, is_demo=False, price=None, median_30=None, median_90=None, min_price=None, max_price=None, discount_percent=None, history=[], first_observed=None, last_updated=None, days_observed=0, status="insufficient_data", offers=[], offers_count=0, rating=None, reviews_count=0, review_trend="unavailable", reviews=review_slices(None, datetime.now(timezone.utc).date(), "manual_catalog"), data_provenance={"source_id": "manual_catalog", "type": "manual_metadata", "notice": "Канонические характеристики введены оператором; ценовых наблюдений нет"})
    product = Product(id=key, slug=slug, name=payload.name, category=payload.category, brand=payload.brand, active=True, data=data)
    session.add(product)
    session.flush()
    session.add(ProductVariant(id=key + "-variant", product_id=key, mpn=payload.mpn, gtin=payload.gtin, condition=payload.condition, specifications=payload.specs))
    session.commit()
    return product
