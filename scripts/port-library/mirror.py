#!/usr/bin/env python3
"""Mirror the Port de Barcelona IFC library (CC BY 4.0) into the app.

The Port's server sends no CORS headers, so a browser cannot load its files. For
each object this keeps the richest LOD within CAP bytes in public/models/port-bcn,
a small thumbnail beside it, and writes the catalogue the gallery reads.

  python scripts/port-library/mirror.py
"""
import concurrent.futures as cf, io, json, re, sys, urllib.parse as up, urllib.request as ur
from pathlib import Path
from PIL import Image

BASE = 'https://serveis.portdebarcelona.cat/cataleg_bim_planol/'
CAP = 300_000
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/port-bcn'
CATALOGUE = ROOT / 'src/demo-models/port-library.json'


def get(path, head=None):
    req = ur.Request(BASE + up.quote(path[2:] if path.startswith('./') else path), headers={'User-Agent': 'ifc-viewer-online mirror', **(head or {})})
    with ur.urlopen(req, timeout=120) as r:
        return r.read(), r.headers


def size_of(e):
    _, h = get(e['url'], {'Range': 'bytes=0-0'})
    e['size'] = int(h['Content-Range'].split('/')[1])
    return e


def title(code):
    words = code.split('-')[-1].replace('_', ' ')
    return re.sub(r'\s+', ' ', re.sub(r'(?<=[a-záéíóúñ])(?=[A-Z])', ' ', words)).strip()


def fetch(entry):
    data, _ = get(entry['pick']['url'])
    (OUT / entry['file']).write_bytes(data)
    m = re.search(rb"FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'", data[:4000])
    schema = (m.group(1).decode() if m else 'IFC4').upper()
    entry['schema'] = 'IFC2x3' if schema.startswith('IFC2') else 'IFC4x3' if schema.startswith('IFC4X3') else 'IFC4'
    try:
        img = Image.open(io.BytesIO(get(entry['pick']['imagen'])[0])).convert('RGB')
        img.thumbnail((240, 240))
        img.save(OUT / entry['thumb'], 'WEBP', quality=62)
    except Exception as e:
        print('no thumbnail', entry['id'], e, file=sys.stderr)
        entry['thumb'] = ''


src = get('projects.js')[0].decode('utf8')
items = []
for chunk in re.split(r'category:\s*`', src)[1:]:
    cat = chunk[:chunk.index('`')]
    for m in re.finditer(r'\{\s*name:\s*`([^`]+)`.*?url:\s*`([^`]+)`.*?imagen:\s*`([^`]+)`.*?lod:\s*`([^`]+)`.*?ficha:\s*`([^`]+)`', chunk, re.S):
        items.append(dict(category=cat, name=m[1], url=m[2], imagen=m[3], lod=m[4], ficha=m[5]))

with cf.ThreadPoolExecutor(8) as ex:
    items = list(ex.map(size_of, items))

groups = {}
for e in items:
    groups.setdefault(re.sub(r'_(LOD\d|red)$', '', e['name']), []).append(e)

OUT.mkdir(parents=True, exist_ok=True)
catalogue = []
for code, lods in sorted(groups.items()):
    fits = sorted((e for e in lods if e['size'] <= CAP), key=lambda e: e['size'])
    entry = dict(id=code, name=title(code), category=lods[0]['category'], ficha=lods[0]['ficha'][2:],
                 lods=[dict(lod=e['lod'], size=e['size'], url=e['url'][2:]) for e in lods])
    if fits:
        entry.update(pick=fits[-1], file=f'{code}.ifc', thumb=f'{code}.webp')
    catalogue.append(entry)

with cf.ThreadPoolExecutor(8) as ex:
    list(ex.map(fetch, [c for c in catalogue if 'pick' in c]))
for c in catalogue:
    if 'pick' in c:
        c['lod'], c['size'] = c['pick']['lod'], c['pick']['size']
        del c['pick']
CATALOGUE.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
print(len(catalogue), 'objects,', sum('file' in c for c in catalogue), 'hosted')
