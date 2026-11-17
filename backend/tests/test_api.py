from dataclasses import replace
from fastapi.testclient import TestClient
from app import main
from app.db import get_db
from app.seed import seed


def test_disabling_demo_hides_existing_seeded_products_from_public_routes(session, monkeypatch):
    from app import seed as seed_module
    monkeypatch.setattr(seed_module, "settings", replace(seed_module.settings, demo_mode=True))
    seed(session)
    monkeypatch.setattr(main, "settings", replace(main.settings, demo_mode=True))
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        before = client.get("/api/products").json()
        assert before["total"] == 30
        slug, product_id = before["items"][0]["slug"], before["items"][0]["id"]
        offer_id = client.get("/api/products/" + slug).json()["offers"][0]["id"]
        monkeypatch.setattr(main, "settings", replace(main.settings, demo_mode=False))
        assert client.get("/api/products").json()["total"] == 0
        for suffix in ("", "/history", "/reviews"):
            assert client.get("/api/products/" + slug + suffix).status_code == 404
        assert client.get("/api/out/" + offer_id).status_code == 404
        assert client.post("/api/events", json={"product_id": product_id, "event": "product_view"}).status_code == 404
    finally:
        main.app.dependency_overrides.clear()


def test_public_admin_rejects_short_or_example_credentials_and_requires_bearer(session, monkeypatch):
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        for token in ["short-token", "replace-with-a-random-at-least-32-character-secret"]:
            monkeypatch.setattr(main, "settings", replace(main.settings, demo_mode=False, admin_token=token, collector_token=""))
            assert client.get("/api/admin/status", headers={"Authorization": "Bearer " + token}).status_code == 503
        token = "0123456789abcdef0123456789abcdef"
        monkeypatch.setattr(main, "settings", replace(main.settings, demo_mode=False, admin_token=token, collector_token=""))
        assert client.get("/api/admin/status", headers={"Authorization": token}).status_code == 401
        assert client.get("/api/admin/status", headers={"Authorization": "Bearer " + token}).status_code == 200
    finally:
        main.app.dependency_overrides.clear()


def test_catalog_detail_graph_reviews_auth_and_unconfigured_bot(session, monkeypatch):
    seed(session)
    monkeypatch.setattr(main, "settings", replace(main.settings, admin_token="test-admin", telegram_token=""))
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        assert client.get("/health").status_code == 200
        listing = client.get("/api/products?page_size=100").json()
        assert listing["total"] == 30
        assert len(listing["items"]) == 30
        assert all(p["is_demo"] for p in listing["items"])
        assert len(client.get("/api/products?category=ssd&page_size=100").json()["items"]) == 10
        assert client.get("/api/products?q=SN850X").json()["total"] == 1
        p = client.get("/api/products/" + listing["items"][0]["slug"]).json()
        assert len(p["offers"]) == 3
        assert len(client.get(f"/api/products/{p['slug']}/history?days=7").json()["points"]) == 7
        assert len(client.get(f"/api/products/{p['slug']}/history?days=30").json()["points"]) == 30
        assert client.get(f"/api/products/{p['slug']}/reviews?slice=10").json()["selected"]["uncertainty"]
        assert client.get("/api/products/unknown").status_code == 404
        assert client.get("/api/products?page=0").status_code == 422
        assert client.get("/api/out/" + p["offers"][0]["id"]).status_code == 409
        assert client.post("/api/alerts", json={"product_id": p["id"], "target_price": 1000, "consent": True}).status_code == 503
        assert client.get("/api/admin/status").status_code == 401
        assert client.get("/api/admin/status", headers={"Authorization": "Bearer test-admin"}).json()["counts"]["products"] == 30
        assert client.post("/api/events", json={"product_id": p["id"], "event": "product_view"}).status_code == 202
        assert client.post("/api/events", json={"product_id": p["id"], "event": "outbound_click"}).status_code == 422
        assert client.get("/openapi.json").status_code == 200
    finally:
        main.app.dependency_overrides.clear()


def test_authorized_import_endpoint_and_admin_product_management(session, monkeypatch):
    import json
    from tests.test_imports import row
    monkeypatch.setattr(main, "settings", replace(main.settings, admin_token="test-admin"))
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        headers = {"Authorization": "Bearer test-admin"}
        payload = {"source_id": "authorized", "permission_reference": "Contract 2026-001", "format": "json", "content": json.dumps([row()])}
        assert client.post("/api/admin/import", headers=headers, json=payload).json()["imported"] == 1
        assert client.post("/api/admin/import", headers=headers, json=payload).json()["duplicates"] == 1
        p = client.get("/api/products").json()["items"][0]
        assert not p["is_demo"]
        assert client.patch("/api/admin/products/" + p["id"], headers=headers, json={"active": False}).status_code == 200
        assert client.get("/api/products").json()["total"] == 0
        assert client.get("/api/products/" + p["slug"]).status_code == 404
        payload["content"] = json.dumps([row(url="https://evil.com/")])
        assert client.post("/api/admin/import", headers=headers, json=payload).status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_sparse_history_uses_calendar_days_and_offer_context(session, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from tests.test_imports import row
    from app.imports import FeedRow, ImportProvider
    now = datetime.now(timezone.utc)
    provider = ImportProvider(session, "feed", "Contract example")
    provider.import_rows([FeedRow.model_validate(row(observed_at=(now - timedelta(days=40)).isoformat(), price_type="membership")), FeedRow.model_validate(row(observed_at=(now - timedelta(days=2)).isoformat(), price_type="membership"))])
    main.app.dependency_overrides[get_db] = lambda: session
    try:
        client = TestClient(main.app)
        p = client.get("/api/products").json()["items"][0]
        detail = client.get("/api/products/" + p["slug"]).json()
        offer = detail["offers"][0]
        result = client.get(f"/api/products/{p['slug']}/history?days=7&offer_id={offer['id']}").json()
        assert len(result["points"]) == 1
        assert result["price_type"] == "membership"
        assert client.get(f"/api/products/{p['slug']}/history?days=0&offer_id={offer['id']}").json()["points"] == offer["history"]
        assert client.get(f"/api/products/{p['slug']}/history?days=13").status_code == 422
    finally:
        main.app.dependency_overrides.clear()
