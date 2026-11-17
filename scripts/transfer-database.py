"""Transfer a complete SQLite snapshot to an empty, equally migrated database.

The export may contain private data. It is created exclusively with mode 0600;
its rows and database URLs are never written to stdout or error messages.
"""
import argparse
import base64
import hashlib
import json
import math
import os
import sqlite3
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

from sqlalchemy import JSON, MetaData, create_engine, func, select, text

FORMAT = "cenoskop.database-transfer.v1"
MAX_LINE = 64 * 1024 * 1024


class TransferError(Exception):
    """A safe, non-sensitive error suitable for display."""


def metadata_and_revision(connection):
    metadata = MetaData()
    metadata.reflect(bind=connection)
    versions = metadata.tables.get("alembic_version")
    if versions is None:
        raise TransferError("Database has no Alembic revision; run migrations first.")
    rows = connection.execute(select(versions.c.version_num)).scalars().all()
    if len(rows) != 1 or not rows[0]:
        raise TransferError("Database must have exactly one Alembic revision.")
    metadata.remove(versions)
    tables = metadata.sorted_tables
    if not tables:
        raise TransferError("Database has no application tables.")
    return tables, rows[0]


def signature(tables):
    return [{"name": t.name, "columns": [c.name for c in t.columns]} for t in tables]


def matching_signature(candidate, tables):
    """Compare names as sets: dialect reflection does not promise identical ordering."""
    if not isinstance(candidate, list):
        return False
    found = {}
    for entry in candidate:
        if not isinstance(entry, dict) or set(entry) != {"name", "columns"} or not isinstance(entry["name"], str) or not isinstance(entry["columns"], list) or any(not isinstance(column, str) for column in entry["columns"]):
            return False
        columns = entry["columns"]
        if entry["name"] in found or len(columns) != len(set(columns)):
            return False
        found[entry["name"]] = set(columns)
    return found == {table.name: set(table.c.keys()) for table in tables}


def encode_value(value, *, is_json=False, is_sql_null=False):
    if is_sql_null or (value is None and not is_json):
        return {"type": "null"}
    if is_json:
        return {"type": "json", "value": value}
    if isinstance(value, datetime):
        return {"type": "datetime", "value": value.isoformat()}
    if isinstance(value, date):
        return {"type": "date", "value": value.isoformat()}
    if isinstance(value, time):
        return {"type": "time", "value": value.isoformat()}
    if isinstance(value, Decimal):
        return {"type": "decimal", "value": str(value)}
    if isinstance(value, bytes):
        return {"type": "bytes", "value": base64.b64encode(value).decode("ascii")}
    if isinstance(value, (str, bool, int, float)):
        return {"type": "scalar", "value": value}
    raise TransferError("Unsupported database value type.")


def decode_value(cell, column):
    if not isinstance(cell, dict) or cell.get("type") not in {"null", "json", "datetime", "date", "time", "decimal", "bytes", "scalar"}:
        raise TransferError("Invalid value in transfer file.")
    kind = cell["type"]
    if set(cell) != ({"type"} if kind == "null" else {"type", "value"}):
        raise TransferError("Invalid value in transfer file.")
    value = cell.get("value")
    if kind == "null":
        return None
    if kind == "json":
        if not isinstance(column.type, JSON):
            raise TransferError("JSON value does not match database column.")
        return JSON.NULL if value is None else value
    if isinstance(column.type, JSON):
        raise TransferError("Non-JSON value does not match database column.")
    if kind == "datetime":
        return datetime.fromisoformat(value)
    if kind == "date":
        return date.fromisoformat(value)
    if kind == "time":
        return time.fromisoformat(value)
    if kind == "decimal":
        return Decimal(value)
    if kind == "bytes":
        return base64.b64decode(value, validate=True)
    if not isinstance(value, (str, bool, int, float)):
        raise TransferError("Invalid scalar in transfer file.")
    return value


def encode_line(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def export_sqlite(source, destination):
    source = Path(source).resolve(strict=True)
    if not source.is_file():
        raise TransferError("Source must be an existing SQLite database file.")
    uri = source.as_uri() + "?mode=ro"
    engine = create_engine("sqlite://", creator=lambda: sqlite3.connect(uri, uri=True), hide_parameters=True)
    fd = None
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA query_only=ON")
            connection.exec_driver_sql("BEGIN")  # SQLite legacy mode does not begin on SELECT.
            tables, revision = metadata_and_revision(connection)
            counts = {t.name: 0 for t in tables}
            fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as out:
                fd = None
                digest = hashlib.sha256()

                def write(record):
                    line = encode_line(record)
                    if len(line) > MAX_LINE:
                        raise TransferError("A database row is too large to transfer.")
                    digest.update(line)
                    out.write(line)

                write({"format": FORMAT, "revision": revision, "tables": signature(tables)})
                for table in tables:
                    json_columns = [column for column in table.columns if isinstance(column.type, JSON)]
                    statement = select(table, *[column.is_(None).label(f"__sql_null_{i}") for i, column in enumerate(json_columns)])
                    for result in connection.execute(statement):
                        row = result._mapping
                        flags = {column.name: row[f"__sql_null_{i}"] for i, column in enumerate(json_columns)}
                        data = {column.name: encode_value(row[column.name], is_json=isinstance(column.type, JSON), is_sql_null=flags.get(column.name, False)) for column in table.columns}
                        write({"table": table.name, "row": data})
                        counts[table.name] += 1
                out.write(encode_line({"counts": counts, "sha256": digest.hexdigest()}))
            connection.rollback()
            return counts
    finally:
        if fd is not None:
            os.close(fd)
        engine.dispose()


def parse_json(line):
    def no_duplicates(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise TransferError("Duplicate key in transfer file.")
            result[key] = value
        return result

    if len(line) > MAX_LINE or not line.endswith(b"\n"):
        raise TransferError("Transfer file is truncated or has an oversized line.")
    def finite_float(raw):
        value = float(raw)
        if not math.isfinite(value):
            raise TransferError("Invalid JSON number.")
        return value

    return json.loads(line, object_pairs_hook=no_duplicates, parse_float=finite_float, parse_constant=lambda _: (_ for _ in ()).throw(TransferError("Invalid JSON number.")))


def reset_postgres_sequences(connection, tables):
    if connection.dialect.name != "postgresql":
        return
    # ALTER SEQUENCE RESTART is transactional, unlike setval(). Use catalogue
    # lookups and identifier quoting, never interpolate any file-provided SQL.
    preparer = connection.dialect.identifier_preparer
    for table in tables:
        for column in table.primary_key.columns:
            if column.type.python_type is not int:
                continue
            relation = f"{preparer.quote(table.schema or 'public')}.{preparer.quote(table.name)}"
            sequence = connection.execute(text("SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=pg_get_serial_sequence(:relation,:column)::regclass"), {"relation": relation, "column": column.name}).first()
            if sequence is None:
                continue
            largest = connection.execute(select(func.max(column))).scalar()
            next_id = max(1, (largest or 0) + 1)
            if next_id > 9223372036854775807:
                raise TransferError("Sequence cannot be advanced safely.")
            identifier = f"{preparer.quote(sequence[0])}.{preparer.quote(sequence[1])}"
            connection.exec_driver_sql(f"ALTER SEQUENCE {identifier} RESTART WITH {next_id}")


def import_stream(engine, source):
    digest = hashlib.sha256()
    with source:
        header_line = source.readline(MAX_LINE + 1)
        header = parse_json(header_line)
        digest.update(header_line)
        if not isinstance(header, dict) or set(header) != {"format", "revision", "tables"} or header["format"] != FORMAT:
            raise TransferError("Unsupported transfer format.")
        with engine.begin() as connection:
            if connection.dialect.name == "postgresql":
                connection.exec_driver_sql("SET LOCAL TIME ZONE 'UTC'")
            elif connection.dialect.name == "sqlite":
                connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            tables, revision = metadata_and_revision(connection)
            if header["revision"] != revision or not matching_signature(header["tables"], tables):
                raise TransferError("Database revision or table schema differs; migrate both databases to the same version.")
            if connection.dialect.name == "postgresql":
                preparer = connection.dialect.identifier_preparer
                identifiers = ", ".join(f"{preparer.quote(t.schema or 'public')}.{preparer.quote(t.name)}" for t in tables)
                connection.exec_driver_sql(f"LOCK TABLE {identifiers} IN ACCESS EXCLUSIVE MODE")
            for table in tables:
                if connection.execute(select(1).select_from(table).limit(1)).first() is not None:
                    raise TransferError("Target database is not empty; import cancelled.")
                for column in table.columns:
                    if isinstance(column.type, JSON):
                        column.type.none_as_null = True
            counts = {table.name: 0 for table in tables}
            table_map = {table.name: table for table in tables}
            # Rows use the source's dependency order, which can differ among
            # equally valid dialect reflection orders for independent tables.
            order = {entry["name"]: i for i, entry in enumerate(header["tables"])}
            last_index = 0
            footer = None
            for line in iter(lambda: source.readline(MAX_LINE + 1), b""):
                record = parse_json(line)
                if not isinstance(record, dict):
                    raise TransferError("Invalid transfer record.")
                if set(record) == {"counts", "sha256"}:
                    footer = record
                    if source.read(1):
                        raise TransferError("Unexpected data after transfer footer.")
                    break
                digest.update(line)
                if set(record) != {"table", "row"} or record["table"] not in table_map:
                    raise TransferError("Invalid table in transfer file.")
                table = table_map[record["table"]]
                if order[table.name] < last_index:
                    raise TransferError("Tables are not in dependency order.")
                last_index = order[table.name]
                row = record["row"]
                if not isinstance(row, dict) or set(row) != set(table.c.keys()):
                    raise TransferError("Transfer row does not match database schema.")
                values = {column.name: decode_value(row[column.name], column) for column in table.columns}
                connection.execute(table.insert().values(**values))
                counts[table.name] += 1
            if footer is None or footer["counts"] != counts or footer["sha256"] != digest.hexdigest():
                raise TransferError("Transfer checksum or row counts do not match; nothing was imported.")
            reset_postgres_sequences(connection, tables)
            return counts


def main():
    parser = argparse.ArgumentParser(description="Transfer a complete local SQLite database into an empty migrated PostgreSQL database.")
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export")
    export.add_argument("--sqlite", required=True, type=Path)
    export.add_argument("--output", required=True, type=Path)
    restore = sub.add_parser("import")
    restore.add_argument("--input", type=Path, help="Transfer file; defaults to stdin for docker compose exec -T.")
    args = parser.parse_args()
    try:
        if args.command == "export":
            counts = export_sqlite(args.sqlite, args.output)
        else:
            url = os.environ.get("DATABASE_URL", "")
            if not url.startswith(("postgresql://", "postgresql+psycopg://")):
                raise TransferError("DATABASE_URL must point to PostgreSQL and is read only from the environment.")
            engine = create_engine(url, hide_parameters=True)
            try:
                counts = import_stream(engine, args.input.open("rb") if args.input else sys.stdin.buffer)
            finally:
                engine.dispose()
        print(f"Transfer completed: {sum(counts.values())} rows across {len(counts)} tables.")
    except (TransferError, OSError, ValueError, TypeError, KeyError) as exc:
        if isinstance(exc, TransferError):
            print(str(exc), file=sys.stderr)
        else:
            print("Transfer failed. Check file paths and data format; details were not printed.", file=sys.stderr)
        return 1
    except Exception:
        # Database exceptions may contain SQL parameters, credentials or row data.
        print("Transfer failed. Check database connectivity, schema and constraints; nothing was imported.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
