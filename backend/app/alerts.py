import hashlib
import secrets
import uuid
from datetime import timedelta, timezone
from cryptography.fernet import Fernet
import httpx
from sqlalchemy import delete, select
from .config import settings
from .analytics import offer_price_is_fresh, price_is_confirmed
from .models import AlertSubscription, Offer, OutboundClick, Product, utcnow
from .security import safe_outbound_url


def token_hash(token: str):
    return hashlib.sha256(token.encode()).hexdigest()


def chat_hash(chat_id: str):
    # Keyed digest resists enumeration of small numerical Telegram ID space.
    import hmac
    return hmac.new(settings.encryption_key.encode(), chat_id.encode(), hashlib.sha256).hexdigest()


def create_alert(session, product_id: str, target_price: float):
    token = secrets.token_urlsafe(24)
    subscription = AlertSubscription(id=str(uuid.uuid4()), product_id=product_id, target_price=target_price, token_hash=token_hash(token), active=False)
    session.add(subscription)
    session.add(OutboundClick(product_id=product_id, event="alert_created"))
    session.commit()
    return {"id": subscription.id, "deep_link": f"https://t.me/{settings.telegram_username}?start={token}", "expires_in_hours": 24, "status": "awaiting_telegram_consent", "notice": "Подписка включится после команды /start в боте. Telegram ID хранится в зашифрованном виде."}


def activate_alert(session, token: str, chat_id: str):
    now = utcnow()
    row = session.scalar(select(AlertSubscription).where(AlertSubscription.token_hash == token_hash(token)).with_for_update())
    if not row or _aware(row.created_at) < now - timedelta(hours=24) or row.consent_at:
        return False
    row.chat_id_encrypted = Fernet(settings.encryption_key.encode()).encrypt(chat_id.encode()).decode()
    row.chat_id_hash = chat_hash(chat_id)
    row.consent_at, row.active = now, True
    session.commit()
    return True


def _aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class TelegramClient:
    def __init__(self, token: str | None = None, transport=None):
        self.token = token or settings.telegram_token
        self.transport = transport

    def call(self, method: str, payload: dict):
        with httpx.Client(transport=self.transport, timeout=35) as client:
            response = client.post(f"https://api.telegram.org/bot{self.token}/{method}", json=payload)
            response.raise_for_status()
            data = response.json()
            if not data.get("ok"):
                raise RuntimeError("Telegram API returned an error")
            return data["result"]

    def send(self, chat_id, text):
        return self.call("sendMessage", {"chat_id": chat_id, "text": text, "disable_web_page_preview": True})


def process_alerts(session, bot: TelegramClient, now=None):
    now = now or utcnow()
    sent = 0
    rows = session.scalars(select(AlertSubscription).where(AlertSubscription.active.is_(True)).with_for_update(skip_locked=True)).all()
    for row in rows:
        if row.last_sent_at and now - _aware(row.last_sent_at) < timedelta(hours=24):
            continue
        product = session.get(Product, row.product_id)
        if not product or not product.active:
            continue
        offers = session.scalars(select(Offer).where(Offer.product_id == product.id)).all()
        context = product.data.get("price_context") or {"currency": "RUB", "region": "RU-MOW", "price_type": "regular", "payment_condition": "any_card"}
        eligible = [o for o in offers if o.data.get("availability") and all(o.data.get(key) == value for key, value in context.items()) and o.data.get("condition") == product.data.get("condition") and 0 < o.data.get("price", 0) <= row.target_price and offer_price_is_fresh(o.data, now) and price_is_confirmed(o.data)]
        if not eligible:
            continue
        offer = min(eligible, key=lambda o: o.data["price"])
        # Re-read at the actual send boundary. A stale import cannot trigger an
        # alert. The demo reference date is intentionally fixed and labelled.
        session.refresh(offer)
        current = offer.data
        if not current["availability"] or current["price"] > row.target_price or not price_is_confirmed(current) or not offer_price_is_fresh(current, now):
            continue
        fingerprint = token_hash(f"{offer.id}|{current['price']}|{row.target_price}")
        if row.last_fingerprint == fingerprint:
            continue
        url = safe_outbound_url(offer.url) if offer.url else f"{settings.public_base_url}/product/{product.slug}"
        label = "[ДЕМО: синтетическая цена] " if current.get("is_demo") else ""
        text = f"{label}{product.name}\nЦена: {current['price']:,.0f} ₽. Ваш порог: {row.target_price:,.0f} ₽.\n{current['seller']['name']}\n{url}\nОтменить: /cancel {row.id}"
        chat_id = Fernet(settings.encryption_key.encode()).decrypt(row.chat_id_encrypted.encode()).decode()
        bot.send(chat_id, text)
        row.last_sent_at, row.last_fingerprint = now, fingerprint
        session.commit()
        sent += 1
    return sent


def cleanup(session, now=None):
    now = now or utcnow()
    cutoff = now - timedelta(days=settings.retention_days)
    events = session.execute(delete(OutboundClick).where(OutboundClick.created_at < cutoff)).rowcount
    session.execute(delete(AlertSubscription).where(AlertSubscription.consent_at.is_(None), AlertSubscription.created_at < now - timedelta(hours=24)))
    session.execute(delete(AlertSubscription).where(AlertSubscription.active.is_(False), AlertSubscription.created_at < cutoff))
    session.commit()
    return events
