import copy
import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from app import main
from app.browser_import import import_browser_export, infer_category, raw_listings
from app.db import get_db
from app.models import BrowserSnapshot, Product, SourceSyncRun


def document():
    return json.loads((Path(__file__).resolve().parents[2] / "browser-extension" / "example-export.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize(("title", "expected"), [
    ("MSI Видеокарта GeForce RTX 5080", "gpu"),
    ("Samsung SSD 1 ТБ", "ssd"),
    ("Оперативная память DDR5 32 ГБ", "ram"),
    ("Мост SLI для видеокарт NVIDIA", "unclassified"),
    ("Адаптер для SSD", "unclassified"),
    ("Накопитель 1 ТБ", "unclassified"),
    ("Видеокарта и SSD комплект", "unclassified"),
])
def test_automatic_category_only_for_clear_product_types(title, expected):
    assert infer_category(title) == expected


def test_browser_json_creates_visible_unverified_listings_and_preserves_unknowns(session):
    data = document()
    for observation in data["observations"]:
        observation["source"]["captured_at"] = datetime.now(timezone.utc).isoformat()
    result = import_browser_export(session, json.dumps(data), "browser.json")
    assert result["imported"] == 2
    assert result["total_listings"] == 2
    assert session.scalar(select(func.count()).select_from(Product)) == 0
    rows = raw_listings(session)
    assert len(rows) == 2
    for row in rows:
        assert row["record_type"] == "unverified_listing"
        assert row["category"] == row["image_kind"] == "unclassified"
        assert row["offers"] == []
        assert all(point["price"] > 0 for point in row["history"])
        assert row["rating"] is row["median_30"] is row["discount_percent"] is None
        assert row["browser_observation"]["identity_confirmed"] is False
    palit = next(row for row in rows if row["browser_observation"]["product"]["brand"] == "Palit")
    assert palit["browser_observation"]["offer"]["seller"]["name"] is None
    assert palit["price"] == 47999
    assert palit["price_context"]["region"] == "RU-SPE"
    run = session.get(SourceSyncRun, result["run_id"])
    assert run.status == "success"
    assert "permission_reference" not in run.provenance


def test_reimport_is_idempotent_across_export_filename_and_time_changes(session):
    data = document()
    import_browser_export(session, json.dumps(data), "one.json")
    data["job"]["exported_at"] = datetime.now(timezone.utc).isoformat()
    result = import_browser_export(session, json.dumps(data), "two.json")
    assert result["imported"] == 0
    assert result["duplicates"] == 2
    assert result["total_listings"] == 2
    assert session.scalar(select(func.count()).select_from(BrowserSnapshot)) == 2


def test_scrolling_collector_export_imports_without_changing_observation_identity(session):
    data = document()
    data["job"]["settings"].update(categoryScrollRounds=12, categoryScrollPauseSeconds=2, categoryMaxProducts=100, categoryMaxPages=3)
    data["job"]["queue"].insert(0, {
        "url": "https://www.ozon.ru/category/videokarty-15721/?page=2", "kind": "discovery", "status": "waiting", "attempts": 1,
        "discovery": {"rounds": 4, "scrolls": 3, "found_count": 27, "stop_reason": None, "page_number": 2},
    })
    assert import_browser_export(session, json.dumps(data))["imported"] == 2
    assert import_browser_export(session, json.dumps(document()))["duplicates"] == 2


@pytest.mark.parametrize("mutation", ["limit", "fraction", "page", "query", "summary"])
def test_invalid_discovery_metadata_rejected_before_import(session, mutation):
    data = document()
    data["job"]["settings"]["categoryMaxProducts"] = 100
    data["job"]["queue"][0].update(url="https://www.ozon.ru/category/videokarty-15721/?page=2", kind="discovery")
    if mutation == "limit":
        data["job"]["settings"]["categoryMaxProducts"] = 201
    elif mutation == "fraction":
        data["job"]["settings"]["categoryScrollRounds"] = 1.5
    elif mutation == "page":
        data["job"]["queue"][0]["url"] = "https://www.ozon.ru/category/videokarty-15721/?page=1001"
    elif mutation == "query":
        data["job"]["queue"][0]["url"] += "&token=secret"
    else:
        data["job"]["queue"][0]["discovery"] = {"rounds": 999}
    with pytest.raises(ValueError):
        import_browser_export(session, json.dumps(data))
    assert session.scalar(select(func.count()).select_from(BrowserSnapshot)) == 0


def test_new_capture_updates_listing_by_observation_time_not_upload_order(session):
    data = document()
    first = copy.deepcopy(data["observations"][0])
    first["source"]["captured_at"] = "2001-01-01T12:00:00Z"
    data["observations"] = [first]
    import_browser_export(session, json.dumps(data))
    later = copy.deepcopy(first)
    later["source"]["captured_at"] = "2001-01-02T12:00:00Z"
    later["offer"]["price"] = 200
    later["offer"]["region"] = later["offer"]["payment_condition"] = later["offer"]["price_type"] = None
    data["observations"] = [later]
    import_browser_export(session, json.dumps(data))
    older = copy.deepcopy(first)
    older["source"]["captured_at"] = "2000-01-01T12:00:00Z"
    older["offer"]["price"] = 999
    data["observations"] = [older]
    import_browser_export(session, json.dumps(data))
    row = raw_listings(session)[0]
    assert row["price"] is None and row["price_fresh"] is False
    assert row["browser_observation"]["offer"]["price"] == 200
    assert row["price_context"]["region"] is None
    assert len(row["browser_observations"]) == 3
    assert row["history"] == []
    assert row["days_observed"] == 3


def test_browser_history_uses_only_actual_observations_with_matching_complete_conditions(session, monkeypatch):
    data = document()
    template = copy.deepcopy(data["observations"][0])
    def record(timestamp, price, **changes):
        row = copy.deepcopy(template)
        row["source"]["captured_at"] = timestamp
        row["offer"]["price"] = price
        row["offer"].update(changes)
        data["observations"] = [row]
        import_browser_export(session, json.dumps(data))
    record("2001-01-01T10:00:00Z", 100)
    record("2001-01-01T12:00:00Z", 110)
    record("2001-01-02T12:00:00Z", 999, region="RU-MOW")
    record("2001-01-03T12:00:00Z", 10, payment_condition=None)
    record("2001-01-04T12:00:00Z", 8, availability=False)
    record("2001-01-05T12:00:00Z", 80)
    listing = raw_listings(session)[0]
    expected = [{"date": "2001-01-01", "price": 110}, {"date": "2001-01-05", "price": 80}]
    assert listing["history"] == expected
    assert listing["median_30"] is listing["discount_percent"] is None
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        response = client.get(f"/api/products/{listing['slug']}/history?days=0")
        assert response.status_code == 200
        assert response.json()["points"] == expected
        assert response.json()["region"] == template["offer"]["region"]
        assert client.get(f"/api/products/{listing['slug']}/history?offer_id=other").status_code == 404
    finally:
        main.app.dependency_overrides.clear()
    record("2001-01-06T12:00:00Z", 50, region=None)
    assert raw_listings(session)[0]["history"] == []


def test_operator_classifies_unverified_listing_and_category_survives_later_import(session, monkeypatch):
    data = document()
    data["observations"][0]["source"]["captured_at"] = "2001-01-01T12:00:00Z"
    data["observations"] = data["observations"][:1]
    listing_id = import_browser_export(session, json.dumps(data))["listing_ids"][0]
    monkeypatch.setattr(main, "settings", replace(main.settings, admin_token="test-admin"))
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        path = f"/api/admin/browser-listings/{listing_id}"
        headers = {"Authorization": "Bearer test-admin"}
        assert client.patch(path, json={"category": "gpu"}).status_code == 401
        assert client.patch(path, headers=headers, json={"category": "other"}).status_code == 422
        assert client.patch(path, headers=headers, json={"category": "gpu", "identity_confirmed": True}).status_code == 422
        assert client.patch("/api/admin/browser-listings/browser-ozon-999", headers=headers, json={"category": "gpu"}).status_code == 404
        response = client.patch(path, headers=headers, json={"category": "gpu"})
        assert response.status_code == 200, response.text
        listing = response.json()
        assert listing["category"] == "gpu" and listing["category_source"] == "operator"
        assert listing["browser_observation"]["identity_confirmed"] is False
        assert client.get("/api/products?category=gpu").json()["total"] == 1
        data["observations"][0]["source"]["captured_at"] = "2001-01-02T12:00:00Z"
        import_browser_export(session, json.dumps(data))
        assert client.get(f"/api/products/{listing_id}").json()["category"] == "gpu"
        assert client.patch(path, headers=headers, json={"category": "unclassified"}).json()["category"] == "unclassified"
    finally:
        main.app.dependency_overrides.clear()


def test_operator_hides_and_restores_raw_listing_without_losing_category_or_observations(session, monkeypatch):
    data = document()
    ids = import_browser_export(session, json.dumps(data))["listing_ids"]
    target = ids[0]
    monkeypatch.setattr(main, "settings", replace(main.settings, admin_token="test-admin", demo_mode=True))
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        headers = {"Authorization": "Bearer test-admin"}
        admin_path = f"/api/admin/browser-listings/{target}"
        assert client.get("/api/admin/browser-listings").status_code == 401
        assert client.patch(admin_path, json={"visible": False}).status_code == 401
        for bad in [{}, {"visible": None}, {"category": None}, {"visible": "false"}, {"visible": 0}, {"visible": False, "other": True}]:
            assert client.patch(admin_path, headers=headers, json=bad).status_code == 422
        assert client.patch("/api/admin/browser-listings/browser-ozon-999", headers=headers, json={"visible": False}).status_code == 404
        page = client.get("/api/admin/browser-listings?page_size=1&page=1", headers=headers).json()
        assert page["total"] == 2 and len(page["items"]) == 1 and page["items"][0]["visible"] is True
        assert len(client.get("/api/admin/browser-listings?page_size=1&page=2", headers=headers).json()["items"]) == 1
        assert client.get("/api/admin/browser-listings?page_size=101", headers=headers).status_code == 422
        response = client.patch(admin_path, headers=headers, json={"category": "gpu", "visible": False})
        assert response.status_code == 200 and response.json()["visible"] is False and response.json()["category"] == "gpu"
        assert client.get("/api/products").json()["total"] == 1
        assert client.get("/api/products?category=gpu").json()["total"] == 0
        assert client.get(f"/api/products/{target}").status_code == 404
        assert client.get(f"/api/products/{target}/history?days=0").status_code == 404
        admin = client.get("/api/admin/browser-listings", headers=headers).json()
        assert admin["total"] == 2
        assert next(item for item in admin["items"] if item["id"] == target)["visible"] is False
        assert import_browser_export(session, json.dumps(data))["duplicates"] == 2
        row = next(item for item in data["observations"] if target.endswith(item["product"]["sku"]))
        row["source"]["captured_at"] = "2001-01-02T12:00:00Z"
        data["observations"] = [row]
        assert import_browser_export(session, json.dumps(data))["imported"] == 1
        assert client.get(f"/api/products/{target}").status_code == 404
        changed = client.patch(admin_path, headers=headers, json={"category": "ssd"}).json()
        assert changed["category"] == "ssd" and changed["visible"] is False
        restored = client.patch(admin_path, headers=headers, json={"visible": True}).json()
        assert restored["visible"] is True and restored["category"] == "ssd"
        detail = client.get(f"/api/products/{target}").json()
        assert len(detail["browser_observations"]) == 2 and detail["category"] == "ssd"
        assert detail["browser_observation"]["identity_confirmed"] is False
    finally:
        main.app.dependency_overrides.clear()


def test_enriched_export_is_renderable_and_reimportable(session):
    data = document()
    row = data["observations"][0]
    row.update(images=["https://ir.ozone.ru/s3/multimedia-a/example.jpg"],
               specifications=[{"name": "Объем памяти", "value": "16 ГБ"}],
               rating={"value": 4.8, "rating_count": 28, "review_count": 12, "scope": "product"})
    row["offer"]["price"] = None
    assert import_browser_export(session, json.dumps(data))["imported"] == 2
    listing = next(item for item in raw_listings(session) if item["slug"].endswith(row["product"]["sku"]))
    assert listing["image_url"] == row["images"][0]
    assert listing["images"] == row["images"]
    assert listing["specs"]["Объем памяти"] == "16 ГБ"
    assert listing["price"] is None
    assert listing["rating"] == 4.8 and listing["rating_count"] == 28 and listing["reviews_count"] == 12
    assert listing["rating_scope"] == "product"
    assert import_browser_export(session, json.dumps(data))["duplicates"] == 2


def test_absent_enrichment_has_same_fingerprint_as_empty_fields(session):
    data = document()
    assert import_browser_export(session, json.dumps(data))["imported"] == 2
    for row in data["observations"]:
        row.update(images=[], specifications=[], rating=None)
    assert import_browser_export(session, json.dumps(data))["duplicates"] == 2
    assert all(row["reviews_count"] is None for row in raw_listings(session))


@pytest.mark.parametrize("value", [
    "http://ir.ozone.ru/a.jpg", "https://ozone.ru.evil.example/a.jpg",
    "https://user:password@ir.ozone.ru/a.jpg", "https://127.0.0.1/a.jpg",
    "https://ir.ozone.ru/a.jpg?token=secret", "https://ir.ozone.ru/a.jpg#fragment",
])
def test_enrichment_rejects_unsafe_image_urls_atomically(session, value):
    data = document()
    data["observations"][1]["images"] = [value]
    with pytest.raises(ValueError):
        import_browser_export(session, json.dumps(data))
    assert session.scalar(select(func.count()).select_from(BrowserSnapshot)) == 0


def test_enrichment_rejects_invalid_rating_and_excessive_specs(session):
    data = document()
    row = data["observations"][0]
    row["rating"] = {"value": 6, "rating_count": 10, "review_count": 5, "scope": "product"}
    with pytest.raises(ValueError):
        import_browser_export(session, json.dumps(data))
    row["rating"] = None
    row["specifications"] = [{"name": "a", "value": "b"}] * 41
    with pytest.raises(ValueError):
        import_browser_export(session, json.dumps(data))


@pytest.mark.parametrize("mutation", ["url", "sku", "marketplace", "future", "timezone", "extra", "identity", "price", "boolean_price", "numeric_identity"])
def test_invalid_file_is_atomic_and_cannot_invent_identity(session, mutation):
    data = document()
    bad = data["observations"][1]
    if mutation == "url":
        bad["source"]["url"] = "https://evil.example/product/2572917481/"
    elif mutation == "sku":
        bad["product"]["sku"] = "999"
    elif mutation == "marketplace":
        bad["source"]["marketplace"] = "wildberries"
    elif mutation == "future":
        bad["source"]["captured_at"] = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    elif mutation == "timezone":
        bad["source"]["captured_at"] = "2001-01-01T12:00:00"
    elif mutation == "extra":
        bad["cookies"] = "not-accepted"
    elif mutation == "identity":
        bad["identity_confirmed"] = True
    elif mutation == "price":
        bad["offer"]["price"] = float("inf")
    elif mutation == "boolean_price":
        bad["offer"]["price"] = True
    elif mutation == "numeric_identity":
        bad["identity_confirmed"] = 0
    with pytest.raises(ValueError):
        import_browser_export(session, json.dumps(data))
    assert session.scalar(select(func.count()).select_from(BrowserSnapshot)) == 0
    assert session.scalar(select(func.count()).select_from(SourceSyncRun)) == 0


def test_browser_import_api_auth_catalog_detail_and_filtering(session, monkeypatch):
    monkeypatch.setattr(main, "settings", replace(main.settings, admin_token="test-admin"))
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        data = document()
        for observation in data["observations"]:
            observation["source"]["captured_at"] = datetime.now(timezone.utc).isoformat()
        data["observations"][0].update(images=["https://ir.ozone.ru/s3/a.jpg"],
                                       specifications=[{"name": "Память", "value": "16 ГБ"}],
                                       rating={"value": 4.7, "rating_count": 25, "review_count": 12, "scope": "unknown"})
        payload = {"filename": "export.json", "content": json.dumps(data)}
        assert client.post("/api/admin/browser-import", json=payload).status_code == 401
        headers = {"Authorization": "Bearer test-admin"}
        response = client.post("/api/admin/browser-import", json=payload, headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["imported"] == 2
        listing = client.get("/api/products?page_size=100").json()
        assert listing["total"] == 2
        enriched = next(item for item in listing["items"] if item["image_url"])
        assert enriched["rating"] == 4.7 and enriched["reviews_count"] == 12
        assert enriched["specs"]["Память"] == "16 ГБ"
        assert client.get("/api/products/" + enriched["slug"]).json()["images"] == ["https://ir.ozone.ru/s3/a.jpg"]
        assert listing["items"][0]["record_type"] == "unverified_listing"
        assert "browser_observations" not in listing["items"][0]
        assert client.get("/api/products?category=unclassified").json()["total"] == 2
        assert client.get("/api/products?q=Palit").json()["total"] == 1
        assert client.get("/api/products?brand=MSI").json()["total"] == 1
        assert client.get("/api/products?deals=true").json()["total"] == 0
        assert client.get("/api/products?max_price=50000").json()["total"] == 1
        slug = listing["items"][0]["slug"]
        detail = client.get("/api/products/" + slug).json()
        assert len(detail["browser_observations"]) == 1
        assert detail["median_90"] is None
        assert client.get("/api/products/browser-ozon-999").status_code == 404
        assert client.post("/api/admin/browser-import", json=payload, headers=headers).json()["duplicates"] == 2
    finally:
        main.app.dependency_overrides.clear()


def test_stale_browser_price_is_historical_and_excluded_from_price_filters(session):
    data = document()
    now = datetime.now(timezone.utc)
    data["observations"][0]["source"]["captured_at"] = (now - timedelta(hours=25)).isoformat()
    data["observations"][0]["offer"]["price"] = 10
    data["observations"][1]["source"]["captured_at"] = now.isoformat()
    data["observations"][1]["offer"]["price"] = 100
    ids = import_browser_export(session, json.dumps(data))["listing_ids"]
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        listing = client.get("/api/products?sort=price_asc").json()
        assert [item["price"] for item in listing["items"]] == [100, None]
        assert client.get("/api/products?max_price=50").json()["total"] == 0
        assert client.get("/api/products?min_price=50").json()["total"] == 1
        details = [client.get(f"/api/products/{item}").json() for item in ids]
        stale = next(item for item in details if not item["price_fresh"])
        assert stale["price"] is None
        assert stale["browser_observation"]["offer"]["price"] == 10
        assert stale["history"][0]["price"] == 10
        assert next(item for item in details if item["price_fresh"])["price"] == 100
    finally:
        main.app.dependency_overrides.clear()


def test_admin_counts_exclude_demo_in_import_mode_and_include_hidden_listings(session, monkeypatch):
    from app.seed import seed
    from app.imports import FeedRow, ImportProvider

    seed(session)
    row = {"external_id": "p001", "brand": "Example", "model": "RTX 3070", "mpn": "EX3070", "category": "gpu", "capacity": "8 GB", "bundle": "retail", "condition": "new", "seller_id": "shop", "seller_name": "Authorized Example", "marketplace": "authorized_feed", "price": 10000, "currency": "RUB", "region": "RU-MOW", "price_type": "regular", "payment_condition": "any_card", "availability": True, "observed_at": datetime.now(timezone.utc).isoformat(), "url": "https://www.ozon.ru/"}
    ImportProvider(session, "feed", "test permission").import_rows([FeedRow.model_validate(row)])
    data = document()
    ids = import_browser_export(session, json.dumps(data))["listing_ids"]
    token = "test-admin-token-with-at-least-32-characters"
    monkeypatch.setattr(main, "settings", replace(main.settings, admin_token=token, demo_mode=False))
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        headers = {"Authorization": f"Bearer {token}"}
        assert client.patch(f"/api/admin/browser-listings/{ids[0]}", headers=headers, json={"visible": False}).status_code == 200
        counts = client.get("/api/admin/status", headers=headers).json()["counts"]
        assert counts["products"] == counts["offers"] == 1
        assert counts["browser_listings"] == 2
        monkeypatch.setattr(main, "settings", replace(main.settings, demo_mode=True))
        counts = client.get("/api/admin/status", headers=headers).json()["counts"]
        assert counts["products"] == 31 and counts["offers"] > 1
        assert counts["browser_listings"] == 2
    finally:
        main.app.dependency_overrides.clear()
