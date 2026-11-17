"""Import the two actually observed user URLs once, using local scoped credentials.

Never fetches marketplace pages or refreshes the recorded timestamp. Run only
within 24h of capture; later, use the extension to make a fresh observation.
"""
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
env = {}
for line in (ROOT / '.env').read_text(encoding='utf-8-sig').splitlines():
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        env[key.strip()] = value.strip().strip('\"\'')


def request(path, token, payload=None):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
    req = Request('http://127.0.0.1:8000' + path, data=data,
                  headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urlopen(req, timeout=20) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f'{exc.code}: {exc.read().decode()[:1000]}') from None


try:
    document = json.loads((ROOT / 'data/initial-browser-observations.json').read_text(encoding='utf-8'))
    catalog = request('/api/admin/products', env['ADMIN_TOKEN'])
    for item in document['items']:
        existing = next((p for p in catalog if p['name'] == item['canonical']['name'] and not p['is_demo']), None)
        product = existing or request('/api/admin/products', env['ADMIN_TOKEN'], item['canonical'])
        payload = {**item['observation'], 'product_id': product['id'],
                   'captured_at': document['captured_at'], 'permission_reference': document['permission_reference'],
                   'worker_id': 'initial-browser-observer-20261115', 'identity_confirmed': True}
        result = request('/api/collector/observations', env['COLLECTOR_TOKEN'], payload)
        print(json.dumps({'slug': result['slug'], 'imported': result['imported'], 'duplicates': result['duplicates']}, ensure_ascii=False))
except (RuntimeError, KeyError) as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
