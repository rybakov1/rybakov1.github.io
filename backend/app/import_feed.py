import argparse
from pathlib import Path
from .db import SessionLocal
from .imports import ImportProvider


def main():
    parser = argparse.ArgumentParser(description="Import an authorized local CSV/JSON feed; makes no external requests")
    parser.add_argument("file", type=Path)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--permission", required=True, help="Permission or signed contract reference")
    args = parser.parse_args()
    with SessionLocal() as session:
        print(ImportProvider(session, args.source_id, args.permission).import_content(args.file.read_text(encoding="utf-8-sig"), "json" if args.file.suffix.lower() == ".json" else "csv"))


if __name__ == "__main__":
    main()
