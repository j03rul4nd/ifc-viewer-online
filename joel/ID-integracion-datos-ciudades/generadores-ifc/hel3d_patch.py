"""Local copy of the City of Helsinki LOD2 tileset with some buildings hidden, so an authored IFC
can stand in their place without z-fighting.

usage: hel3d_patch.py <outdir> <tile.b3dm:batchId,batchId> [...]
Every tile keeps pointing at kartta.hel.fi except the patched ones, which are served from <outdir>.
A hidden building's vertices are collapsed onto one point: its triangles become degenerate, the
buffers keep their size, and every other building in the tile is untouched.
"""
import json, os, struct, sys, urllib.request
import numpy as np

BASE = 'https://kartta.hel.fi/3d/datasource-data/16fc3fd5-df6d-4f48-bfd5-9aeee430a02f/'
out = sys.argv[1]
patches = {a.split(':')[0]: [int(x) for x in a.split(':')[1].split(',')] for a in sys.argv[2:]}

def fetch(rel):
    with urllib.request.urlopen(BASE + rel) as r:
        return r.read()

def collapse(b3dm, ids):
    b = bytearray(b3dm)
    _, _, _, ftj, ftb, btj, btb = struct.unpack('<4sIIIIII', b[:28])
    g0 = 28 + ftj + ftb + btj + btb
    jl = struct.unpack('<I', b[g0 + 12:g0 + 16])[0]
    g = json.loads(b[g0 + 20:g0 + 20 + jl])
    bin0 = g0 + 20 + jl + 8
    def view(i, n):
        a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]
        off = bin0 + v.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = v.get('byteStride', 0) or 4 * n
        assert a['componentType'] == 5126
        raw = np.frombuffer(b, np.uint8, count=stride * (a['count'] - 1) + 4 * n, offset=off)
        return np.lib.stride_tricks.as_strided(raw.view(np.uint8), shape=(a['count'], 4 * n), strides=(stride, 1)), a['count']
    hidden = 0
    for m in g['meshes']:
        for p in m['primitives']:
            pv, cnt = view(p['attributes']['POSITION'], 3)
            bv, _ = view(p['attributes']['_BATCHID'], 1)
            pos = np.ascontiguousarray(pv).view(np.float32).reshape(cnt, 3)
            bid = np.ascontiguousarray(bv).view(np.float32).reshape(cnt)
            mask = np.isin(bid, ids)
            if mask.any():
                pos[mask] = pos[mask][0]
                hidden += int(mask.sum())
                # write back through the strided byte view
                pv[mask] = pos[mask].view(np.uint8).reshape(-1, 12)
    return bytes(b), hidden

os.makedirs(out, exist_ok=True)
ts = json.loads(fetch('tileset.json'))
def walk(t):
    c = t.get('content')
    if c:
        if c['uri'] in patches:
            data, n = collapse(fetch(c['uri']), patches[c['uri']])
            dst = os.path.join(out, c['uri']); os.makedirs(os.path.dirname(dst), exist_ok=True)
            open(dst, 'wb').write(data)
            print('patched', c['uri'], patches[c['uri']], n, 'vertices hidden')
        else:
            c['uri'] = BASE + c['uri']
    for ch in t.get('children', []):
        walk(ch)
walk(ts['root'])
json.dump(ts, open(os.path.join(out, 'tileset.json'), 'w'))
