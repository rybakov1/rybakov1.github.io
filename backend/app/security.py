from urllib.parse import urlsplit
from .config import settings


def safe_outbound_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname not in settings.allowed_hosts or parsed.username or parsed.password or parsed.port not in (None, 443) or "\\" in value or any(ord(c) < 32 for c in value):
        raise ValueError("URL must be HTTPS on an allowed marketplace domain, without credentials or custom port")
    return value
