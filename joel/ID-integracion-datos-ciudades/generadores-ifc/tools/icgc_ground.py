"""Ground height on ICGC's photogrammetric Barcelona mesh (3D Tiles «Scene-28»), for placing authored IFC models.

For each lat/lon it walks the tileset down to the finest tiles whose bounding sphere holds the point, decodes their
b3dm triangles (CESIUM_RTC, glTF y-up -> ECEF (x, -z, y)), and reports the mesh surface heights (ellipsoidal) found
in a ring around the point, so the object already standing there in the mesh (a fountain, a kiosk) is not measured:
the pavement is a low percentile of the ring.

usage: uv run --with numpy python tools/icgc_ground.py 41.3855,2.1700 [41.38,2.17 ...] [--ring 2.5,6] [--pct 20]
Output: one JSON line per point {lat, lon, ground_raw, p05, p50, p95, n}. ground_raw is ellipsoidal (the scene places
the mesh with ELLIPSOIDAL -49.70, so orthometric ≈ ground_raw - 49.70).
"""
import json, math, struct, sys, urllib.request
import numpy as np

ROOT = 'https://tilemaps.icgc.cat/vector/3dtiles/ciutats/v1/Scene-28/tileset.json'
A, F = 6378137.0, 1 / 298.257223563
E2 = F * (2 - F)
_cache = {}


def fetch(url):
    if url not in _cache:
        with urllib.request.urlopen(url, timeout=60) as r:
            _cache[url] = r.read()
    return _cache[url]


def ecef(lat, lon, h):
    la, lo = math.radians(lat), math.radians(lon)
    n = A / math.sqrt(1 - E2 * math.sin(la) ** 2)
    return np.array([(n + h) * math.cos(la) * math.cos(lo), (n + h) * math.cos(la) * math.sin(lo), (n * (1 - E2) + h) * math.sin(la)])


def enu_basis(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    e = np.array([-math.sin(lo), math.cos(lo), 0])
    n = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    u = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    return e, n, u


def leaves(url, p, out, depth=0):
    """Collect the finest b3dm urls whose content sits under spheres holding p."""
    t = json.loads(fetch(url))
    base = url.rsplit('/', 1)[0] + '/'

    def walk(node):
        bv = node.get('boundingVolume', {})
        if 'sphere' in bv:
            c = np.array(bv['sphere'][:3]); r = bv['sphere'][3]
            if np.linalg.norm(p - c) > r + 10:
                return
        kids = [k for k in node.get('children', [])]
        uri = (node.get('content') or {}).get('uri') or (node.get('content') or {}).get('url')
        took_child = False
        for k in kids:
            before = len(out)
            walk(k)
            took_child = took_child or len(out) > before
        if uri and not took_child:
            full = base + uri
            if full.endswith('.json'):
                leaves(full, p, out, depth + 1)
            elif full.endswith('.b3dm'):
                out.append(full)

    walk(t['root'])
    return out


def triangles(b3dm_url):
    b = fetch(b3dm_url)
    _, _, _, ftj, ftb, btj, btb = struct.unpack('<4sIIIIII', b[:28])
    ft = json.loads(b[28:28 + ftj]) if ftj else {}
    rtc = np.array(ft.get('RTC_CENTER', [0, 0, 0]), dtype=float)
    glb = b[28 + ftj + ftb + btj + btb:]
    jl = struct.unpack('<I', glb[12:16])[0]
    g = json.loads(glb[20:20 + jl])
    binoff = 20 + jl + 8
    ext = g.get('extensions', {}).get('CESIUM_RTC', {})
    if 'center' in ext:
        rtc = np.array(ext['center'], dtype=float)
    tris = []
    for mesh in g['meshes']:
        for prim in mesh['primitives']:
            acc = g['accessors'][prim['attributes']['POSITION']]
            bv = g['bufferViews'][acc['bufferView']]
            start = binoff + bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
            stride = bv.get('byteStride', 12)
            raw = np.frombuffer(glb, dtype=np.uint8, count=acc['count'] * stride, offset=start).reshape(acc['count'], stride)
            pos = raw[:, :12].copy().view(np.float32).reshape(-1, 3).astype(float)
            if 'indices' in prim:
                ia = g['accessors'][prim['indices']]
                ib = g['bufferViews'][ia['bufferView']]
                dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[ia['componentType']]
                idx = np.frombuffer(glb, dtype=dt, count=ia['count'], offset=binoff + ib.get('byteOffset', 0) + ia.get('byteOffset', 0))
            else:
                idx = np.arange(acc['count'])
            # glTF y-up -> ECEF z-up
            ecefp = np.stack([pos[:, 0], -pos[:, 2], pos[:, 1]], axis=1) + rtc
            tris.append(ecefp[idx.reshape(-1, 3)])
    return np.concatenate(tris) if tris else np.zeros((0, 3, 3))


def ground(lat, lon, ring=(2.5, 6.0), pct=20.0):
    p = ecef(lat, lon, 60.0)
    urls = leaves(ROOT, p, [])
    e, n, u = enu_basis(lat, lon)
    o = ecef(lat, lon, 0.0)
    heights = []
    for url in urls:
        t = triangles(url)
        if len(t) == 0:
            continue
        c = t.mean(axis=1) - o
        le, ln, lu = c @ e, c @ n, c @ u
        d = np.hypot(le, ln)
        sel = (d >= ring[0]) & (d <= ring[1])
        heights.extend(lu[sel].tolist())
    h = np.array(heights)
    if len(h) == 0:
        return {'lat': lat, 'lon': lon, 'n': 0, 'tiles': len(urls)}
    return {'lat': lat, 'lon': lon, 'ground_raw': round(float(np.percentile(h, pct)), 2),
            'p05': round(float(np.percentile(h, 5)), 2), 'p50': round(float(np.percentile(h, 50)), 2),
            'p95': round(float(np.percentile(h, 95)), 2), 'n': int(len(h)), 'tiles': len(urls)}


if __name__ == '__main__':
    args = sys.argv[1:]
    ring, pct = (2.5, 6.0), 20.0
    if '--ring' in args:
        i = args.index('--ring'); ring = tuple(float(v) for v in args[i + 1].split(',')); del args[i:i + 2]
    if '--pct' in args:
        i = args.index('--pct'); pct = float(args[i + 1]); del args[i:i + 2]
    for a in args:
        lat, lon = (float(v) for v in a.split(','))
        print(json.dumps(ground(lat, lon, ring, pct)))
