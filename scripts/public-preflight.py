"""Validate public deployment settings without printing secrets."""
import argparse
import ipaddress
import os
import re
from pathlib import Path


def load_settings(path):
    result = {}
    for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=([^\s#]*)", line)
        if not match or match.group(1) in result:
            raise ValueError(f"Некорректная или повторная настройка в строке {number}.")
        result[match.group(1)] = match.group(2)
    return result


def validate(settings, environment):
    errors = []
    if settings.get("PUBLIC_INDEXABLE", "false") not in {"true", "false"}:
        errors.append("PUBLIC_INDEXABLE: допустимы только true или false.")
    domain = settings.get("SITE_DOMAIN", "").lower()
    if not re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", domain) or domain.endswith((".example", ".invalid", ".localhost", ".test", ".example.com", ".example.net", ".example.org")) or domain in {"example.com", "example.net", "example.org"}:
        errors.append("SITE_DOMAIN: укажите настоящее DNS-имя без https:// и пути.")
    try:
        ipaddress.ip_address(domain)
        errors.append("SITE_DOMAIN: требуется домен, а не IP-адрес.")
    except ValueError:
        pass
    for key in ("POSTGRES_PASSWORD", "ADMIN_TOKEN"):
        if not re.fullmatch(r"[0-9a-fA-F]{64,}", settings.get(key, "")):
            errors.append(f"{key}: создайте случайное hex-значение длиной не менее 64 символов.")
    if settings.get("ADMIN_TOKEN") and settings.get("ADMIN_TOKEN") == settings.get("POSTGRES_PASSWORD"):
        errors.append("ADMIN_TOKEN и POSTGRES_PASSWORD должны быть разными.")
    for key in ("SITE_DOMAIN", "POSTGRES_PASSWORD", "ADMIN_TOKEN", "PUBLIC_INDEXABLE"):
        value = settings.get(key, "false" if key == "PUBLIC_INDEXABLE" else None)
        if key in environment and environment[key] != value:
            errors.append(f"{key} задан в окружении и переопределит файл; удалите эту переменную окружения.")
    return errors


def main():
    parser = argparse.ArgumentParser(description="Проверка настроек публичного VPS без вывода секретов")
    parser.add_argument("env_file", type=Path, nargs="?", default=Path(".env.public"))
    args = parser.parse_args()
    try:
        errors = validate(load_settings(args.env_file), os.environ)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Ошибка файла настроек: {exc}\n")
    if errors:
        parser.exit(1, "\n".join(errors) + "\n")
    print("Настройки выглядят корректно. DNS, сетевые порты и права на контент проверяются отдельно.")


if __name__ == "__main__":
    main()
