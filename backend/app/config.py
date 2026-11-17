"""Environment only configuration; no production credentials in source."""
import os
import re
from dataclasses import dataclass, field
from cryptography.fernet import Fernet


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./cenoscope.db"))
    brand: str = field(default_factory=lambda: os.getenv("APP_NAME", "Ценоскоп"))
    admin_token: str = field(default_factory=lambda: os.getenv("ADMIN_TOKEN", ""))
    telegram_token: str = field(default_factory=lambda: os.getenv("TELEGRAM_BOT_TOKEN", ""))
    telegram_username: str = field(default_factory=lambda: os.getenv("TELEGRAM_BOT_USERNAME", "").removeprefix("@"))
    encryption_key: str = field(default_factory=lambda: os.getenv("TELEGRAM_ID_ENCRYPTION_KEY", ""))
    public_base_url: str = field(default_factory=lambda: os.getenv("PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/"))
    cors_origins: list[str] = field(default_factory=lambda: os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","))
    allowed_hosts: set[str] = field(default_factory=lambda: set(os.getenv("ALLOWED_OUTBOUND_HOSTS", "ozon.ru,www.ozon.ru,wildberries.ru,www.wildberries.ru").split(",")))
    demo_mode: bool = field(default_factory=lambda: os.getenv("DEMO_MODE", "true").lower() == "true")
    retention_days: int = field(default_factory=lambda: int(os.getenv("DATA_RETENTION_DAYS", "90")))
    collector_enabled: bool = field(default_factory=lambda: os.getenv("COLLECTOR_ENABLED", "false").lower() == "true")
    collector_token: str = field(default_factory=lambda: os.getenv("COLLECTOR_TOKEN", ""))
    collector_permission_reference: str = field(default_factory=lambda: os.getenv("COLLECTOR_PERMISSION_REFERENCE", ""))
    collector_lease_seconds: int = field(default_factory=lambda: max(30, min(3600, int(os.getenv("COLLECTOR_LEASE_SECONDS", "300")))))

    @property
    def collector_configured(self) -> bool:
        return bool(self.collector_enabled and len(self.collector_token) >= 16 and self.collector_token != self.admin_token and len(self.collector_permission_reference.strip()) >= 8)

    @property
    def telegram_enabled(self) -> bool:
        if not self.telegram_token or not re.fullmatch(r"[A-Za-z0-9_]{5,32}", self.telegram_username):
            return False
        try:
            Fernet(self.encryption_key.encode())
        except (ValueError, TypeError):
            return False
        return True


settings = Settings()
