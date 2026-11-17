from dataclasses import replace
from cryptography.fernet import Fernet
from app.config import Settings


def test_bot_config_requires_valid_encryption_key_and_username():
    settings = Settings(telegram_token="test-token", telegram_username="test_bot", encryption_key=Fernet.generate_key().decode())
    assert settings.telegram_enabled
    assert not replace(settings, encryption_key="invalid").telegram_enabled
    assert not replace(settings, telegram_username="bad/path").telegram_enabled
    assert not replace(settings, telegram_token="").telegram_enabled
