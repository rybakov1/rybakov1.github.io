import json
from datetime import datetime, timedelta, timezone
import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from app.imports import FeedRow, ImportProvider, parse_feed, project_product_prices
from app.models import Offer, PriceObservation, Product, ProductMatch, SourceSyncRun


def row(**overrides):
    return {"external_id": "p001", "brand": "Example", "model": "RTX 3070", "mpn": "EX3070", "category": "gpu", "capacity": "8 GB", "bundle": "retail", "condition": "new", "seller_id": "shop", "seller_name": "Authorized Example", "marketplace": "authorized_feed", "price": 10000, "currency": "RUB", "region": "RU-MOW", "price_type": "regular", "payment_condition": "any_card", "availability": True, "observed_at": "2026-11-10T12:00:00+03:00", "url": "https://www.ozon.ru/", **overrides}


def test_json_csv_parser_schema_and_timezone():
    rows = parse_feed(json.dumps([row()]), "json")
    assert rows[0].observed_at.hour == 9
    for overrides in ({"price": -1}, {"price": float("nan")}, {"url": "https://www.ozon.ru.evil.com/"}, {"url": "http://www.ozon.ru/"}, {"url": "https://evil.com/"}, {"url": ""}, {"observed_at": "2026-11-10T12:00:00"}):
        with pytest.raises(ValidationError):
            FeedRow.model_validate(row(**overrides))


def test_import_requires_explicit_permission(session):
    with pytest.raises(ValueError):
        ImportProvider(session, "demo", "permission example")
    with pytest.raises(ValueError):
        ImportProvider(session, "feed", "")


def test_import_dedup_and_provenance(session):
    provider = ImportProvider(session, "feed", "Contract test-001")
    observed = datetime.now(timezone.utc).isoformat()
    rows = parse_feed(json.dumps([row(observed_at=observed), row(observed_at=observed)]), "json")
    result = provider.import_rows(rows)
    assert result["imported"] == 1
    assert result["duplicates"] == 1
    assert session.scalar(select(func.count()).select_from(PriceObservation)) == 1
    product = session.scalar(select(Product))
    assert product.data["price"] == 10000
    assert product.data["median_30"] is None
    assert product.data["rating"] is None
    assert product.data["reviews"]["availability"] == "unavailable"
    assert product.data["data_provenance"]["permission_reference"] == "Contract test-001"
    assert provider.import_rows(rows)["duplicates"] == 2


def test_import_never_combines_ti_or_used(session):
    provider = ImportProvider(session, "feed", "Contract test-001")
    provider.import_rows([FeedRow.model_validate(row()), FeedRow.model_validate(row(external_id="ti", model="RTX 3070 Ti")), FeedRow.model_validate(row(external_id="used", condition="used"))])
    assert session.scalar(select(func.count()).select_from(Product)) == 3
    assert session.scalar(select(func.count()).select_from(Offer)) == 3


def test_reused_external_id_cannot_corrupt_variant(session):
    provider = ImportProvider(session, "feed", "Contract test-001")
    provider.import_rows([FeedRow.model_validate(row()), FeedRow.model_validate(row(model="RTX 3070 Ti")), FeedRow.model_validate(row(capacity="16 GB"))])
    assert session.scalar(select(func.count()).select_from(Product)) == 3
    assert session.scalar(select(func.count()).select_from(Offer)) == 3
    assert len({offer.product_id for offer in session.scalars(select(Offer))}) == 3


def test_unavailable_offer_preserves_historical_price(session):
    provider = ImportProvider(session, "feed", "Contract test-001")
    provider.import_rows([FeedRow.model_validate(row()), FeedRow.model_validate(row(availability=False, observed_at="2026-11-11T12:00:00+03:00"))])
    p = session.scalar(select(Product)).data
    assert p["price"] is None
    assert p["history"] == [{"date": "2026-11-10", "price": 10000}]


def test_unknown_mpn_same_model_goes_to_moderation(session):
    provider = ImportProvider(session, "feed", "Contract test-001")
    provider.import_rows([FeedRow.model_validate(row())])
    result = provider.import_rows([FeedRow.model_validate(row(external_id="second", mpn="UNKNOWN"))])
    assert result["pending_matches"] == 1
    assert session.scalar(select(func.count()).select_from(ProductMatch)) == 1
    assert session.scalar(select(func.count()).select_from(Offer)) == 1


def test_alternate_payment_not_in_public_default_price(session):
    provider = ImportProvider(session, "feed", "Contract test-001")
    observed = datetime.now(timezone.utc).isoformat()
    provider.import_rows([FeedRow.model_validate(row(observed_at=observed)), FeedRow.model_validate(row(price=2000, price_type="membership", observed_at=observed))])
    product = session.scalar(select(Product))
    assert product.data["price"] == 10000
    assert len(product.data["offers"]) == 2
    assert product.data["offers_count"] == 1


def test_failed_import_run_is_logged(session):
    provider = ImportProvider(session, "feed", "Contract test-001")
    with pytest.raises(ValueError):
        provider.import_content("{invalid", "json")
    run = session.scalar(select(SourceSyncRun))
    assert run.status == "failed"
    assert run.error
    assert run.provenance["permission_reference"] == "Contract test-001"


def test_isolated_import_anomaly_does_not_become_a_discount(session):
    provider = ImportProvider(session, "feed", "Contract test-001")
    today = datetime.now(timezone.utc)
    rows = [FeedRow.model_validate(row(observed_at=(today - timedelta(days=30 - i)).isoformat())) for i in range(30)]
    provider.import_rows(rows + [FeedRow.model_validate(row(observed_at=today.isoformat(), price=1))])
    product = session.scalar(select(Product)).data
    assert product["price"] == 1  # honestly display received price, labelled unconfirmed
    assert product["price_confirmed"] is False
    assert product["discount_percent"] is None
    assert product["status"] == "unconfirmed_price"


def test_freshness_uses_utc_and_does_not_mix_price_contexts():
    from app.analytics import offer_price_is_fresh

    now = datetime(2026, 11, 17, 10, tzinfo=timezone.utc)
    context = {"currency": "RUB", "region": "RU-MOW", "price_type": "regular", "payment_condition": "any_card"}
    history = [{"date": (now - timedelta(days=i)).date().isoformat(), "price": 80 if i < 4 else 100} for i in reversed(range(14))]
    fresh = {**context, "price": 80, "availability": True, "history": history, "observed_at": "2026-11-17T12:00:00+03:00"}
    stale = {**fresh, "price": 30, "observed_at": (now - timedelta(hours=25)).isoformat()}
    other_region = {**fresh, "price": 10, "region": "RU-SPE"}
    data = {"is_demo": False, "price_context": context, "offers": [stale, fresh, other_region]}
    projected = project_product_prices(data, now=now)
    assert projected["price"] == 80 and projected["offers_count"] == 1
    assert projected["median_30"] == 100 and projected["discount_percent"] == 20
    assert projected["status"] == "good"
    assert projected["offers"][0]["price_fresh"] is False
    assert data["offers"][0]["price"] == 30 and "price_fresh" not in data["offers"][0]
    assert offer_price_is_fresh({"observed_at": (now - timedelta(hours=24)).isoformat()}, now)
    assert not offer_price_is_fresh({"observed_at": (now - timedelta(hours=24, seconds=1)).isoformat()}, now)
    assert not offer_price_is_fresh({"observed_at": "2026-11-17T09:00:00"}, now)
    assert not offer_price_is_fresh({"observed_at": (now + timedelta(minutes=11)).isoformat()}, now)

    old = {**fresh, "observed_at": (now - timedelta(days=40)).isoformat(),
           "history": [{"date": (now - timedelta(days=40 + i)).date().isoformat(), "price": 100} for i in range(14)]}
    result = project_product_prices({**data, "offers": [old]}, now=now)
    assert result["price"] is result["discount_percent"] is result["median_30"] is None
    assert result["median_90"] == 100 and result["status"] == "stale_price"
    assert len(result["history"]) == 14


def test_live_product_expires_on_reads_without_changing_imported_history(session, monkeypatch):
    from fastapi.testclient import TestClient
    from app import imports, main
    from app.db import get_db

    observed = datetime.now(timezone.utc)
    ImportProvider(session, "feed", "test permission").import_rows([FeedRow.model_validate(row(observed_at=observed.isoformat()))])
    product = session.scalar(select(Product))
    class FutureDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return (observed + timedelta(hours=25)).astimezone(tz)
    monkeypatch.setattr(imports, "datetime", FutureDateTime)
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        detail = client.get(f"/api/products/{product.slug}").json()
        listing = client.get("/api/products").json()["items"][0]
        for item in (detail, listing):
            assert item["price"] is item["discount_percent"] is None
            assert item["status"] == "stale_price" and item["offers_count"] == 0
        assert detail["offers"][0]["price"] == 10000
        assert detail["offers"][0]["price_fresh"] is False
        assert client.get("/api/products?max_price=20000").json()["total"] == 0
        assert client.get("/api/products?deals=true&sort=discount").json()["total"] == 0
        assert client.get(f"/api/products/{product.slug}/history?days=0").json()["points"]
        assert product.data["price"] == 10000
    finally:
        main.app.dependency_overrides.clear()
