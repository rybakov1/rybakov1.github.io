"""Transfer checks use only independently migrated temporary databases."""
import importlib.util
import hashlib
import io
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, create_engine, select, text
from sqlalchemy.dialects import postgresql

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("transfer_database", ROOT / "scripts" / "transfer-database.py")
transfer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(transfer)


def migrated(path):
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{path.as_posix()}"
    env["DEMO_MODE"] = "false"
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT / "backend", env=env, check=True, capture_output=True)
    return create_engine(env["DATABASE_URL"])


def add_data(engine):
    now = datetime(2026, 11, 15, 13, 14, 15, tzinfo=timezone.utc)
    metadata = MetaData()
    metadata.reflect(bind=engine)
    with engine.begin() as connection:
        def insert(table_name, **fields):
            connection.execute(metadata.tables[table_name].insert().values(**fields))

        insert("canonical_products", id="p1", slug="p1", name="Товар", brand="Бренд", category="gpu", active=True, data={"title": "данные", "nested": {"type": "datetime", "value": "literal"}})
        insert("product_variants", id="v1", product_id="p1", mpn="M-1", gtin=None, condition="new", specifications={"память": "16 ГБ"})
        insert("sellers", id="s1", name="Магазин", rating=None, reviews_count=None, provenance={"source": "тест"})
        insert("marketplace_offers", id="o1", product_id="p1", variant_id="v1", seller_id="s1", marketplace="ozon", source_id="test", url=None, data={"available": True})
        insert("price_observations", id=41, offer_id="o1", price=12345.5, currency="RUB", region="RU-MOW", price_type="regular", payment_condition="any_card", availability=True, observed_at=now, source_id="test", data_provenance={"source": "test"})
        insert("review_observations", id=5, product_id="p1", variant_id="v1", source_id="test", observed_at=now, count=1, average=4.0, data={"count": 1})
        insert("reviews", id="r1", product_id="p1", variant_id="v1", rating=4, reviewed_at=now, verified_purchase=None, source_id="test")
        insert("product_matches", id=8, source_id="test", external_id="e1", product_id="p1", confidence=0.9, status="pending", reason="manual", payload={"a": "б"})
        insert("alert_subscriptions", id="a1", product_id="p1", target_price=1000, token_hash="b" * 64, chat_id_encrypted=None, chat_id_hash=None, active=False, created_at=now, consent_at=None, last_sent_at=None, last_fingerprint=None)
        insert("outbound_clicks", id=22, product_id="p1", offer_id="o1", event="click", created_at=now)
        insert("collector_workers", worker_id_hash="c" * 64, last_seen_at=now)
        insert("source_sync_runs", id=7, source_id="test", started_at=now, finished_at=None, status="success", imported=1, duplicates=0, error=None, provenance={"permission": "test"})
        insert("browser_snapshots", fingerprint="a" * 64, listing_id="browser-ozon-1", marketplace="ozon", sku="1", url="https://www.ozon.ru/product/1/", observed_at=now, imported_at=now, data={"source": {"captured_at": "2026-11-15T13:14:15+00:00"}, "offer": {"price": 12345}})
        insert("browser_listing_moderation", listing_id="browser-ozon-1", category="gpu", visible=False, updated_at=now)
        insert("collector_jobs", id="job1", product_id="p1", url="https://www.ozon.ru/product/1/", marketplace="ozon", permission_reference="test-reference", status="pending", created_at=now, lease_expires_at=None, lease_token_hash=None, worker_id_hash=None, attempts=0, last_error=None, completed_at=None, result_product_id=None, result_offer_id=None, result=None)
        # Distinguish a SQL NULL from the JSON literal null in a nullable JSON column.
        connection.execute(text("UPDATE collector_jobs SET result=NULL WHERE id='job1'"))
        insert("collector_jobs", id="job2", product_id="p1", url="https://www.ozon.ru/product/1/", marketplace="ozon", permission_reference="test-reference", status="pending", created_at=now, lease_expires_at=None, lease_token_hash=None, worker_id_hash=None, attempts=0, last_error=None, completed_at=None, result_product_id=None, result_offer_id=None, result=JSON.NULL)


def table_rows(engine):
    with engine.connect() as connection:
        tables, revision = transfer.metadata_and_revision(connection)
        return revision, {table.name: [dict(row) for row in connection.execute(select(table).order_by(*table.primary_key.columns)).mappings()] for table in tables}


def test_complete_snapshot_roundtrip_preserves_relations_types_and_json_null(tmp_path):
    source_path = tmp_path / "source.sqlite"
    source, target = migrated(source_path), migrated(tmp_path / "target.sqlite")
    try:
        add_data(source)
        output = tmp_path / "transfer.ndjson"
        written = transfer.export_sqlite(source_path, output)
        assert written["browser_snapshots"] == 1
        assert all(count >= 1 for count in written.values()), "Every application table should contain a fixture row"
        with output.open("rb") as file:
            assert transfer.import_stream(target, file) == written
        assert table_rows(source) == table_rows(target)
        with target.connect() as connection:
            values = connection.execute(text("SELECT id, result IS NULL FROM collector_jobs ORDER BY id")).all()
        assert values == [("job1", 1), ("job2", 0)]
        if os.name != "nt":
            assert output.stat().st_mode & 0o077 == 0
    finally:
        source.dispose()
        target.dispose()


def test_corrupt_or_incomplete_dump_rolls_back_every_table(tmp_path):
    source_path = tmp_path / "source.sqlite"
    source, target = migrated(source_path), migrated(tmp_path / "target.sqlite")
    try:
        add_data(source)
        output = tmp_path / "transfer.ndjson"
        transfer.export_sqlite(source_path, output)
        content = output.read_bytes()
        for bad in [content[:-4], content.replace(b'"sha256":"', b'"sha256":"bad', 1), content + b"extra"]:
            with pytest.raises((transfer.TransferError, ValueError)):
                transfer.import_stream(target, io.BytesIO(bad))
            _, rows = table_rows(target)
            assert all(not values for values in rows.values())
    finally:
        source.dispose()
        target.dispose()


def test_nonempty_and_mismatched_targets_are_rejected_without_changes(tmp_path):
    source_path = tmp_path / "source.sqlite"
    source, target = migrated(source_path), migrated(tmp_path / "target.sqlite")
    try:
        add_data(source)
        output = tmp_path / "transfer.ndjson"
        transfer.export_sqlite(source_path, output)
        with target.begin() as connection:
            connection.execute(text("UPDATE alembic_version SET version_num='0004'"))
        with pytest.raises(transfer.TransferError, match="revision"):
            transfer.import_stream(target, io.BytesIO(output.read_bytes()))
        with target.begin() as connection:
            connection.execute(text("UPDATE alembic_version SET version_num='0005'"))
        add_data(target)
        before = table_rows(target)
        with pytest.raises(transfer.TransferError, match="not empty"):
            transfer.import_stream(target, io.BytesIO(output.read_bytes()))
        assert table_rows(target) == before
        with pytest.raises(FileExistsError):
            transfer.export_sqlite(source_path, output)
    finally:
        source.dispose()
        target.dispose()


def test_reflection_column_order_differences_do_not_block_import(tmp_path):
    source_path = tmp_path / "source.sqlite"
    source, target = migrated(source_path), migrated(tmp_path / "target.sqlite")
    try:
        add_data(source)
        output = tmp_path / "transfer.ndjson"
        transfer.export_sqlite(source_path, output)
        lines = output.read_bytes().splitlines(keepends=True)
        header = json.loads(lines[0])
        for table in header["tables"]:
            table["columns"].reverse()
        lines[0] = transfer.encode_line(header)
        footer = json.loads(lines[-1])
        footer["sha256"] = hashlib.sha256(b"".join(lines[:-1])).hexdigest()
        lines[-1] = transfer.encode_line(footer)
        transfer.import_stream(target, io.BytesIO(b"".join(lines)))
        assert table_rows(source) == table_rows(target)
    finally:
        source.dispose()
        target.dispose()


def test_production_startup_seed_keeps_migrated_target_empty(tmp_path):
    path = tmp_path / "target.sqlite"
    target = migrated(path)
    try:
        env = os.environ.copy()
        env["DATABASE_URL"] = f"sqlite:///{path.as_posix()}"
        env["DEMO_MODE"] = "false"
        subprocess.run([sys.executable, "-m", "app.seed"], cwd=ROOT / "backend", env=env, check=True, capture_output=True)
        _, rows = table_rows(target)
        assert all(not records for records in rows.values())
    finally:
        target.dispose()


def test_postgres_sequences_restart_transactionally_after_max_id():
    metadata = MetaData()
    table = Table("rows", metadata, Column("id", Integer, primary_key=True), Column("name", String))

    class Result:
        def __init__(self, result):
            self.result = result

        def first(self):
            return self.result

        def scalar(self):
            return self.result

    class Connection:
        dialect = postgresql.dialect()

        def __init__(self):
            self.statements = []

        def execute(self, statement, parameters=None):
            if parameters is not None:
                assert parameters == {"relation": "public.rows", "column": "id"}
                return Result(("public", "rows_id_seq"))
            return Result(41)

        def exec_driver_sql(self, sql):
            self.statements.append(sql)

    connection = Connection()
    transfer.reset_postgres_sequences(connection, [table])
    assert connection.statements == ["ALTER SEQUENCE public.rows_id_seq RESTART WITH 42"]
