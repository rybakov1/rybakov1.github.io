from dataclasses import replace
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from app import config


def test_frozen_migration_roundtrip(tmp_path, monkeypatch):
    url = "sqlite:///" + (tmp_path / "migration.db").as_posix()
    monkeypatch.setattr(config, "settings", replace(config.settings, database_url=url))
    configuration = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    configuration.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    command.upgrade(configuration, "head")
    engine = create_engine(url)
    names = inspect(engine).get_table_names()
    assert "canonical_products" in names
    assert "price_observations" in names
    assert "alert_subscriptions" in names
    command.downgrade(configuration, "base")
    assert inspect(engine).get_table_names() == ["alembic_version"]
    command.upgrade(configuration, "head")
    assert "product_matches" in inspect(engine).get_table_names()
    engine.dispose()


def test_visibility_migration_preserves_existing_snapshots_and_operator_categories(tmp_path, monkeypatch):
    url = "sqlite:///" + (tmp_path / "existing.db").as_posix()
    monkeypatch.setattr(config, "settings", replace(config.settings, database_url=url))
    configuration = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    configuration.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    command.upgrade(configuration, "0004")
    engine = create_engine(url)
    with engine.begin() as db:
        db.execute(text("INSERT INTO browser_snapshots (fingerprint, listing_id, marketplace, sku, url, observed_at, imported_at, data) VALUES (:fingerprint, :listing_id, 'ozon', '123', 'https://www.ozon.ru/product/123/', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '{}')"), {"fingerprint": "a" * 64, "listing_id": "browser-ozon-123"})
        db.execute(text("INSERT INTO browser_listing_moderation (listing_id, category, updated_at) VALUES ('browser-ozon-123', 'gpu', '2026-01-01T00:00:00Z')"))
    command.upgrade(configuration, "head")
    with engine.connect() as db:
        assert db.execute(text("SELECT category, visible FROM browser_listing_moderation WHERE listing_id = 'browser-ozon-123'")).one() == ("gpu", 1)
        assert db.execute(text("SELECT COUNT(*) FROM browser_snapshots")).scalar_one() == 1
    command.downgrade(configuration, "0004")
    with engine.connect() as db:
        assert db.execute(text("SELECT category FROM browser_listing_moderation WHERE listing_id = 'browser-ozon-123'")).scalar_one() == "gpu"
        assert db.execute(text("SELECT COUNT(*) FROM browser_snapshots")).scalar_one() == 1
    command.upgrade(configuration, "head")
    with engine.connect() as db:
        assert db.execute(text("SELECT visible FROM browser_listing_moderation WHERE listing_id = 'browser-ozon-123'")).scalar_one() == 1
    engine.dispose()
