import logging
import time
from .alerts import TelegramClient, cleanup, process_alerts
from .config import settings
from .db import SessionLocal


def main():
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            with SessionLocal() as session:
                cleanup(session)
                if settings.telegram_enabled:
                    sent = process_alerts(session, TelegramClient())
                    if sent:
                        logging.info("Delivered %d personal price notifications", sent)
        except Exception:
            logging.error("Worker cycle failed; consult database/source status")
        time.sleep(60)


if __name__ == "__main__":
    main()
