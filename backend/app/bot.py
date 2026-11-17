"""Personal opt-in bot. Never publishes to channels."""
import logging
import time
from sqlalchemy import select
from .alerts import TelegramClient, activate_alert, chat_hash
from .config import settings
from .db import SessionLocal
from .models import AlertSubscription, Product

log = logging.getLogger(__name__)


def handle_update(session, bot, update):
    message = update.get("message", {})
    chat = message.get("chat", {})
    # Refuse group/channel destinations; opt-in belongs to one private user.
    if chat.get("type") != "private" or not message.get("text"):
        return
    chat_id, text = str(chat["id"]), message["text"].strip()
    command, _, argument = text.partition(" ")
    if command == "/start" and argument:
        success = activate_alert(session, argument, chat_id)
        bot.send(chat_id, "Подписка включена. /list — ваши товары. /cancel ID — отменить подписку. /stop — удалить все ваши подписки." if success else "Ссылка истекла или уже использована. Создайте новую на сайте.")
    elif command == "/list":
        rows = session.scalars(select(AlertSubscription).where(AlertSubscription.chat_id_hash == chat_hash(chat_id), AlertSubscription.active.is_(True))).all()
        bot.send(chat_id, "\n\n".join(f"{session.get(Product, r.product_id).name}: до {r.target_price:,.0f} ₽\n/cancel {r.id}" for r in rows) or "Активных подписок нет.")
    elif command == "/cancel" and argument:
        row = session.scalar(select(AlertSubscription).where(AlertSubscription.id == argument, AlertSubscription.chat_id_hash == chat_hash(chat_id)))
        if row:
            session.delete(row)
            session.commit()
        bot.send(chat_id, "Подписка удалена." if row else "Подписка не найдена.")
    elif command == "/stop":
        rows = session.scalars(select(AlertSubscription).where(AlertSubscription.chat_id_hash == chat_hash(chat_id))).all()
        for row in rows:
            session.delete(row)
        session.commit()
        bot.send(chat_id, "Ваши подписки и Telegram ID удалены.")
    else:
        bot.send(chat_id, "Откройте карточку товара на сайте и выберите «Отслеживать цену». /list — подписки, /stop — удалить данные.")


def main():
    if not settings.telegram_enabled:
        raise SystemExit("Telegram not configured: provide token, username and Fernet encryption key via env")
    bot, offset = TelegramClient(), 0
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            updates = bot.call("getUpdates", {"offset": offset, "timeout": 25, "allowed_updates": ["message"]})
            for update in updates:
                with SessionLocal() as session:
                    handle_update(session, bot, update)
                offset = update["update_id"] + 1
        except Exception:
            # Avoid logging message bodies, chat IDs, tokens or HTTP URLs.
            log.error("Telegram polling failed; retrying")
            time.sleep(5)


if __name__ == "__main__":
    main()
