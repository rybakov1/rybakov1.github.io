from dataclasses import replace
from datetime import datetime, timedelta, timezone
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from app import collector, main
from app.db import get_db
from app.models import CollectorJob, CollectorWorker, Offer, PriceObservation, Product, Seller

ADMIN = {"Authorization": "Bearer admin-for-tests"}
COLLECTOR = {"Authorization": "Bearer collector-for-tests"}
WORKER = "worker-random-value-1234"


def canonical(**overrides):
    return {"name": "MSI RTX 5080 Ventus 3X OC 16GB", "brand": "MSI", "model": "RTX 5080 Ventus 3X OC", "category": "gpu", "capacity": "16 GB", "bundle": "retail", "condition": "unknown", **overrides}


def capture(product_id, **overrides):
    return {"worker_id": WORKER, "product_id": product_id, "page_url": "https://www.ozon.ru/product/example-2067659662/", "captured_at": datetime.now(timezone.utc).isoformat(), "permission_reference": "Operator-approved test observation", "extraction_method": "jsonld", "identity_confirmed": True, "price": 367583, "currency": "RUB", "region": "RU-SPE", "price_type": "regular", "payment_condition": "other_bank_card", "availability": True, "condition": "unknown", "seller_id": None, "seller_name": None, "extracted_price_text": "367 583 ₽", "extractor_version": "test-1", **overrides}


@pytest.fixture
def client(session, monkeypatch):
    configured = replace(collector.settings, collector_enabled=True, collector_token="collector-for-tests", collector_permission_reference="Server test-only authorization", collector_lease_seconds=300, admin_token="admin-for-tests")
    monkeypatch.setattr(collector, "settings", configured)
    monkeypatch.setattr(main, "settings", configured)
    main.app.dependency_overrides[get_db] = lambda: session
    with TestClient(main.app) as client:
        yield client
    main.app.dependency_overrides.clear()


def add_model(client):
    response = client.post("/api/admin/products", headers=ADMIN, json=canonical())
    assert response.status_code == 201, response.text
    return response.json()


def add_job(client, product):
    response = client.post("/api/admin/collector/jobs", headers=ADMIN, json={"product_id": product["id"], "url": "https://www.ozon.ru/product/example-2067659662/", "marketplace": "ozon", "permission_reference": "Operator-approved test observation"})
    assert response.status_code == 201, response.text
    return response.json()


def test_manual_canonical_has_no_invented_observations(client, session):
    p = add_model(client)
    assert p["mpn"] == ""
    assert p["price"] is None and p["rating"] is None
    assert p["offers"] == [] and p["history"] == []
    assert p["reviews"]["individual_available"] is False
    assert p["review_trend"] == "unavailable"
    assert session.scalar(select(func.count()).select_from(Offer)) == 0
    assert client.post("/api/admin/products", headers=ADMIN, json=canonical()).status_code == 409
    assert client.post("/api/admin/products", headers=COLLECTOR, json=canonical(name="forbidden")).status_code == 401


def test_collector_scoped_auth_disabled_and_permission_config(client, monkeypatch):
    assert client.get("/api/collector/config").status_code == 401
    assert client.get("/api/collector/config", headers=ADMIN).status_code == 401
    assert client.get("/api/collector/config", headers=COLLECTOR).status_code == 200
    assert client.get("/api/admin/collector/status", headers=COLLECTOR).status_code == 401
    monkeypatch.setattr(collector, "settings", replace(collector.settings, collector_enabled=False))
    assert client.get("/api/collector/config", headers=COLLECTOR).status_code == 503
    monkeypatch.setattr(collector, "settings", replace(collector.settings, collector_enabled=True, collector_permission_reference=""))
    assert client.get("/api/collector/config", headers=COLLECTOR).status_code == 503


def test_extension_origin_regex_is_anchored_and_requires_enabled_configuration(client, monkeypatch):
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    test_app = FastAPI()
    test_app.add_middleware(CORSMiddleware, allow_origins=[], allow_origin_regex=collector.collector_cors_origin_regex(), allow_methods=["POST"], allow_headers=["Authorization", "Content-Type"])
    cors_client = TestClient(test_app)
    def preflight(origin):
        return cors_client.options("/api/collector/jobs/claim", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
    assert preflight("chrome-extension://" + "a" * 32).status_code == 200
    assert preflight("chrome-extension://" + "a" * 32 + ".evil").status_code == 400
    assert preflight("https://evil.com").status_code == 400
    monkeypatch.setattr(collector, "settings", replace(collector.settings, collector_enabled=False))
    assert collector.collector_cors_origin_regex() is None


def test_equal_admin_collector_tokens_fail_closed(client, monkeypatch):
    equal_tokens = replace(collector.settings, collector_token="admin-for-tests")
    monkeypatch.setattr(collector, "settings", equal_tokens)
    monkeypatch.setattr(main, "settings", equal_tokens)
    assert not equal_tokens.collector_configured
    assert client.get("/api/collector/config", headers=ADMIN).status_code == 503
    assert client.get("/api/admin/collector/status", headers=ADMIN).status_code == 503


@pytest.mark.parametrize("url", ["http://www.ozon.ru/product/a-123/", "https://www.ozon.ru.evil.com/product/a-123/", "https://127.0.0.1/product/a-123/", "https://www.ozon.ru/", "https://www.wildberries.ru/catalog/123/", "https://www.ozon.ru/product/a-123/?redirect=https://evil.com", "https://user:pass@www.ozon.ru/product/a-123/", "https://www.ozon.ru:443/product/a-123/", "https://www.ozon.ru/product/a-123/#tracking"])
def test_job_rejects_non_product_and_unsafe_urls(client, url):
    p = add_model(client)
    response = client.post("/api/admin/collector/jobs", headers=ADMIN, json={"product_id": p["id"], "url": url, "marketplace": "ozon", "permission_reference": "Test operator approval"})
    assert response.status_code == 422


def test_job_claim_complete_replay_and_real_provenance(client, session):
    p = add_model(client)
    job = add_job(client, p)
    claim = client.post("/api/collector/jobs/claim", headers=COLLECTOR, json={"worker_id": WORKER}).json()["job"]
    assert claim["id"] == job["id"]
    assert claim["url"] == "https://www.ozon.ru/product/2067659662/"
    assert client.post("/api/collector/jobs/claim", headers=COLLECTOR, json={"worker_id": "another-random-worker"}).json()["job"] is None
    payload = capture(p["id"], job_id=job["id"], lease_token=claim["lease_token"])
    response = client.post("/api/collector/observations", headers=COLLECTOR, json=payload)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["product_id"] == p["id"]
    assert result["job_status"] == "completed"
    assert result["imported"] == 1
    assert client.post("/api/collector/observations", headers=COLLECTOR, json=payload).json() == result
    assert session.scalar(select(func.count()).select_from(PriceObservation)) == 1
    detail = client.get("/api/products/" + result["slug"]).json()
    assert detail["price"] == 367583
    assert detail["price_context"] == {"currency": "RUB", "region": "RU-SPE", "price_type": "regular", "payment_condition": "other_bank_card"}
    assert detail["median_30"] is None and detail["discount_percent"] is None
    assert detail["is_demo"] is False
    assert detail["rating"] is None and detail["reviews"]["availability"] == "unavailable"
    assert detail["offers"][0]["seller"]["name"] == "Продавец не указан"
    assert detail["offers"][0]["seller"]["rating"] is None
    assert detail["offers"][0]["reliability"]["score"] is None
    observation = session.scalar(select(PriceObservation))
    assert observation.data_provenance["type"] == "browser_capture"
    assert observation.data_provenance["extraction_method"] == "jsonld"
    assert observation.data_provenance["extracted_price_text"] == "367 583 ₽"
    assert observation.data_provenance["seller_availability"] == "unavailable"
    assert client.post("/api/collector/observations", headers=COLLECTOR, json={**payload, "price": 1}).status_code == 409
    assert session.scalar(select(CollectorWorker)).worker_id_hash != WORKER


def test_lease_expiration_reclaim_and_wrong_worker(client, session):
    p = add_model(client)
    job = add_job(client, p)
    claim = client.post("/api/collector/jobs/claim", headers=COLLECTOR, json={"worker_id": WORKER}).json()["job"]
    payload = capture(p["id"], job_id=job["id"], lease_token=claim["lease_token"])
    assert client.post("/api/collector/observations", headers=COLLECTOR, json={**payload, "worker_id": "another-random-worker"}).status_code == 409
    row = session.get(CollectorJob, job["id"])
    row.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    session.commit()
    assert client.post("/api/collector/observations", headers=COLLECTOR, json=payload).status_code == 409
    reclaimed = client.post("/api/collector/jobs/claim", headers=COLLECTOR, json={"worker_id": "another-random-worker"}).json()["job"]
    assert reclaimed["id"] == claim["id"]
    assert reclaimed["lease_token"] != claim["lease_token"]
    assert session.get(CollectorJob, job["id"]).attempts == 2
    assert client.post("/api/collector/observations", headers=COLLECTOR, json=payload).status_code == 409


def test_job_binding_and_fail_captcha_without_retrying_network(client):
    p = add_model(client)
    job = add_job(client, p)
    claim = client.post("/api/collector/jobs/claim", headers=COLLECTOR, json={"worker_id": WORKER}).json()["job"]
    payload = capture(p["id"], job_id=job["id"], lease_token=claim["lease_token"])
    for overrides in ({"page_url": "https://www.ozon.ru/product/2572917481/"}, {"permission_reference": "Different permission assertion"}, {"condition": "new"}):
        assert client.post("/api/collector/observations", headers=COLLECTOR, json={**payload, **overrides}).status_code in (409, 422)
    failure = client.post(f"/api/collector/jobs/{job['id']}/fail", headers=COLLECTOR, json={"worker_id": WORKER, "lease_token": claim["lease_token"], "error": "captcha_or_block"})
    assert failure.status_code == 200 and failure.json()["status"] == "failed"
    assert client.post("/api/collector/jobs/claim", headers=COLLECTOR, json={"worker_id": WORKER}).json()["job"] is None


def test_direct_capture_dedup_does_not_mix_price_context(client, session):
    p = add_model(client)
    payload = capture(p["id"])
    first = client.post("/api/collector/observations", headers=COLLECTOR, json=payload)
    assert first.status_code == 201, first.text
    repeated = client.post("/api/collector/observations", headers=COLLECTOR, json=payload)
    assert repeated.json()["duplicates"] == 1
    cheaper_other_context = {**payload, "payment_condition": "partner_bank_card", "price_type": "membership", "price": 330825}
    assert client.post("/api/collector/observations", headers=COLLECTOR, json=cheaper_other_context).status_code == 201
    detail = client.get("/api/products/" + first.json()["slug"]).json()
    assert detail["price"] == 367583
    assert len(detail["offers"]) == 2
    assert detail["price_context"]["payment_condition"] == "other_bank_card"
    assert client.get("/api/products/" + detail["slug"] + "/history?days=7").json()["payment_condition"] == "other_bank_card"
    known_seller = {**payload, "seller_id": "actual-seller-id", "seller_name": "Actual seller"}
    assert client.post("/api/collector/observations", headers=COLLECTOR, json=known_seller).status_code == 201
    assert session.scalar(select(func.count()).select_from(Seller)) == 2


def test_confirmed_seller_name_does_not_invent_source_id_or_rating(client, session):
    p = add_model(client)
    response = client.post("/api/collector/observations", headers=COLLECTOR, json=capture(p["id"], seller_name="TopComputer"))
    assert response.status_code == 201, response.text
    detail = session.get(Product, p["id"]).data
    assert detail["offers"][0]["seller"]["name"] == "TopComputer"
    assert detail["offers"][0]["seller"]["rating"] is None
    assert detail["offers"][0]["data_provenance"]["seller_identifier"] == "derived_page_and_name"


@pytest.mark.parametrize("extra", [{"cookies": "must-not-store"}, {"authorization": "private"}, {"html": "<html>private</html>"}, {"price": "NaN"}, {"identity_confirmed": False}, {"availability": "true"}, {"condition": "new"}, {"seller_id": "without-name"}, {"captured_at": "2026-11-14T12:00:00"}, {"captured_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()}])
def test_capture_rejects_unknown_fields_unconfirmed_or_invalid_data(client, extra):
    p = add_model(client)
    response = client.post("/api/collector/observations", headers=COLLECTOR, json=capture(p["id"], **extra))
    assert response.status_code == 422, response.text


def test_demo_reference_never_copies_synthetic_history(client, session):
    from app.seed import seed
    seed(session)
    product = session.scalar(select(Product).where(Product.id.like("demo-%")))
    payload = capture(product.id, condition=product.data["condition"], seller_id="seller-actual", seller_name="Actual shop")
    response = client.post("/api/collector/observations", headers=COLLECTOR, json=payload)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["product_id"] != product.id
    actual = session.get(Product, result["product_id"]).data
    assert actual["is_demo"] is False and len(actual["history"]) == 1
    assert actual["rating"] is None and actual["reviews"]["availability"] == "unavailable"
    assert len(session.get(Product, product.id).data["history"]) == 90


def test_unknown_mpn_cannot_implicitly_merge_new_condition(client, session):
    unknown = add_model(client)
    new = client.post("/api/admin/products", headers=ADMIN, json=canonical(condition="new")).json()
    assert new["id"] != unknown["id"]
    assert client.post("/api/collector/observations", headers=COLLECTOR, json=capture(unknown["id"], condition="new")).status_code == 422
    assert session.scalar(select(func.count()).select_from(PriceObservation)) == 0


def test_unknown_job_and_bad_worker_are_rejected(client):
    p = add_model(client)
    assert client.post("/api/collector/jobs/claim", headers=COLLECTOR, json={"worker_id": "short"}).status_code == 422
    assert client.post("/api/collector/observations", headers=COLLECTOR, json=capture(p["id"], job_id=str(uuid.uuid4()), lease_token="a" * 32)).status_code == 404
