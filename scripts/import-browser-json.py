"""Import an extension JSON into this project's local running server.

The extension stays offline. The admin key is read locally, never printed or
passed as a command-line argument. No marketplace or remote server is queried.
"""
import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description="Import browser JSON into the local website catalogue")
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    env = {}
    for line in (root / ".env").read_text(encoding="utf-8-sig").splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip("\"'")
    token = env.get("ADMIN_TOKEN", "")
    if not token:
        raise ValueError("Set ADMIN_TOKEN in the project's .env first")
    if args.file.stat().st_size > 5_000_000:
        raise ValueError("File exceeds 5 MB")
    payload = {"filename": args.file.name, "content": args.file.read_text(encoding="utf-8-sig")}
    req = Request("http://127.0.0.1:8000/api/admin/browser-import",
                  data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                  headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=30) as response:
            result = json.load(response)
    except HTTPError as exc:
        raise ValueError(f"Import failed ({exc.code}): {exc.read().decode('utf-8')[:1500]}") from None
    except URLError:
        raise ValueError("Local server unavailable. Run scripts/start-dev.ps1 first.") from None
    print(json.dumps(result, ensure_ascii=False))
    print("Catalogue: http://localhost:3000/catalog/?source=uploaded")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as problem:
        print(str(problem), file=sys.stderr)
        sys.exit(1)
