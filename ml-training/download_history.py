"""Read the already connected public history; never invoke betting or account APIs."""
import hashlib
import json
import math
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.data'
OUT.mkdir(exist_ok=True)
API = 'https://xrniwkvfrtchtxjrwwgd.supabase.co/functions/v1/v0xff3-live'
rows, known, pages, total = [], {}, [], None
conflicts = 0
for offset in range(0, 20000, 1000):
    url = f'{API}?limit=1000&offset={offset}&t={time.time_ns()}'
    request = urllib.request.Request(url, headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = json.load(response)
    if body.get('ok') is not True or not isinstance(body.get('history'), list):
        raise ValueError('Invalid history response')
    batch = body['history']
    total = body.get('total')
    for raw in batch:
        value = raw.get('coefficient', raw.get('topCoefficient'))
        identity = str(raw.get('id', '')).strip()
        if isinstance(value, bool) or not identity:
            continue
        try:
            value = float(value)
        except (ValueError, TypeError):
            continue
        if not math.isfinite(value) or value < 1:
            continue
        row = dict(id=identity, coefficient=value, timestamp=raw.get('timestamp'), estimated=raw.get('estimated', False))
        if identity in known:
            if known[identity]['coefficient'] != value:
                conflicts += 1
            continue
        known[identity] = row
        rows.append(row)
    pages.append(dict(offset=offset, delivered=len(batch), unique=len(rows)))
    print(f'offset={offset} unique={len(rows)}', flush=True)
    if not batch or (isinstance(total, (int, float)) and offset + len(batch) >= total):
        break
    time.sleep(0.3)
payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
(OUT/'history.json').write_text(payload, encoding='utf-8')
manifest = dict(source=API, fetched_utc=datetime.now(timezone.utc).isoformat(), rows=len(rows), total=total, pages=pages,
                conflicts=conflicts, sha256=hashlib.sha256(payload.encode()).hexdigest(),
                approximate_rows=sum(bool(r['estimated']) for r in rows),
                order='API delivery order reversed for offline experiments; actual game order and completeness unverified',
                limit=20000)
(OUT/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in manifest.items() if k != 'pages'}, ensure_ascii=False), flush=True)
