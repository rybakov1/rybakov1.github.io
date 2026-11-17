from dataclasses import replace
from datetime import datetime, timedelta, timezone
import httpx
from cryptography.fernet import Fernet
from sqlalchemy import select
from app import alerts
from app.models import AlertSubscription, Offer, Product
from app.seed import seed


def test_opt_in_dedup_cooldown_recheck_and_mock_telegram(session, monkeypatch):
    seed(session)
    configured = replace(alerts.settings, encryption_key=Fernet.generate_key().decode(), telegram_token="mock-token", telegram_username="mock_bot")
    monkeypatch.setattr(alerts, "settings", configured)
    product = session.scalar(select(Product))
    result = alerts.create_alert(session, product.id, 1000000)
    token = result["deep_link"].split("start=")[1]
    assert alerts.activate_alert(session, token, "123456")
    assert not alerts.activate_alert(session, token, "999999")
    subscription = session.get(AlertSubscription, result["id"])
    assert "123456" not in subscription.chat_id_encrypted
    requests = []

    def mock(request):
        requests.append(request)
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})

    bot = alerts.TelegramClient("mock-token", httpx.MockTransport(mock))
    now = datetime.now(timezone.utc)
    assert alerts.process_alerts(session, bot, now) == 1
    assert alerts.process_alerts(session, bot, now + timedelta(hours=1)) == 0
    assert alerts.process_alerts(session, bot, now + timedelta(days=2)) == 0
    assert len(requests) == 1
    offer = session.scalar(select(Offer).where(Offer.product_id == product.id).order_by(Offer.id))
    offer.data = {**offer.data, "price": offer.data["price"] - 100}
    session.commit()
    assert alerts.process_alerts(session, bot, now + timedelta(hours=2)) == 0
    assert alerts.process_alerts(session, bot, now + timedelta(days=2)) == 1
    assert b"DEMO" not in requests[0].content  # Russian demo notice present as UTF-8
    assert "ДЕМО" in requests[0].content.decode()
    subscription.target_price = 1
    session.commit()
    assert alerts.process_alerts(session, bot, now + timedelta(days=4)) == 0


def test_expired_or_invalid_opt_in_is_rejected(session, monkeypatch):
    seed(session)
    monkeypatch.setattr(alerts, "settings", replace(alerts.settings, encryption_key=Fernet.generate_key().decode()))
    product = session.scalar(select(Product))
    result = alerts.create_alert(session, product.id, 100)
    row = session.get(AlertSubscription, result["id"])
    row.created_at = datetime.now(timezone.utc) - timedelta(days=2)
    session.commit()
    assert not alerts.activate_alert(session, result["deep_link"].split("start=")[1], "1")
    assert not alerts.activate_alert(session, "invalid", "1")


def test_delivery_failure_not_marked_sent(session, monkeypatch):
    seed(session)
    monkeypatch.setattr(alerts, "settings", replace(alerts.settings, encryption_key=Fernet.generate_key().decode()))
    product = session.scalar(select(Product))
    result = alerts.create_alert(session, product.id, 1000000)
    alerts.activate_alert(session, result["deep_link"].split("start=")[1], "1")
    import pytest
    bot = alerts.TelegramClient("mock", httpx.MockTransport(lambda _: httpx.Response(500)))
    with pytest.raises(httpx.HTTPStatusError):
        alerts.process_alerts(session, bot)
    assert session.get(AlertSubscription, result["id"]).last_sent_at is None


def test_stale_live_price_and_anomaly_never_trigger_alert(session, monkeypatch):
    seed(session)
    monkeypatch.setattr(alerts, "settings", replace(alerts.settings, encryption_key=Fernet.generate_key().decode()))
    product = session.scalar(select(Product))
    result = alerts.create_alert(session, product.id, 1000000)
    alerts.activate_alert(session, result["deep_link"].split("start=")[1], "1")
    offers = session.scalars(select(Offer).where(Offer.product_id == product.id)).all()
    now = datetime.now(timezone.utc)
    for offer in offers:
        offer.data = {**offer.data, "is_demo": False, "observed_at": (now - timedelta(days=3)).isoformat()}
    session.commit()
    requests = []
    bot = alerts.TelegramClient("mock", httpx.MockTransport(lambda request: requests.append(request) or httpx.Response(200, json={"ok": True, "result": {}})))
    assert alerts.process_alerts(session, bot, now) == 0
    for offer in offers:
        history = [{**p} for p in offer.data["history"]]
        history[-1]["price"] = 1
        offer.data = {**offer.data, "observed_at": now.isoformat(), "price": 1, "history": history}
    session.commit()
    assert alerts.process_alerts(session, bot, now) == 0
    assert requests == []
    assert session.get(AlertSubscription, result["id"]).last_sent_at is None


def test_stale_cheaper_offer_does_not_block_fresh_alert(session, monkeypatch):
    seed(session)
    monkeypatch.setattr(alerts, "settings", replace(alerts.settings, encryption_key=Fernet.generate_key().decode()))
    product = session.scalar(select(Product))
    result = alerts.create_alert(session, product.id, 1000)
    assert alerts.activate_alert(session, result["deep_link"].split("start=")[1], "1")
    now = datetime.now(timezone.utc)
    offers = session.scalars(select(Offer).where(Offer.product_id == product.id)).all()
    context = {"currency": "RUB", "region": "RU-MOW", "price_type": "regular", "payment_condition": "any_card"}
    for index, offer in enumerate(offers):
        price = 90 if index == 0 else 100
        offer.data = {**offer.data, **context, "condition": product.data["condition"], "is_demo": False,
                      "price": price, "availability": index < 2,
                      "observed_at": (now - timedelta(hours=25 if index == 0 else 0)).isoformat(),
                      "history": [{"date": now.date().isoformat(), "price": price}]}
    session.commit()
    requests = []
    bot = alerts.TelegramClient("mock", httpx.MockTransport(lambda request: requests.append(request) or httpx.Response(200, json={"ok": True, "result": {}})))
    assert alerts.process_alerts(session, bot, now) == 1
    assert "100" in requests[0].content.decode()
