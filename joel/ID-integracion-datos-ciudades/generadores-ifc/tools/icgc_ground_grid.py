"""Write the ICGC MET 5 m ground under a tileset into its extras, as `cdeGroundGrid`.

A model at real heights (`extras.cdeAbsoluteHeights`) sits right on a viewer whose terrain is the real ground,
like the Luciad scene's ICGC terrain. Mapbox's terrain is not (measured 2026-10-04 at the C-243c roundabout in
Castellbisbal: +0.1 to +3.1 m over the as-built road, median +1.4), so CDE-Frontend lifts each vertex by
Mapbox's terrain minus this grid there. Grid in the tileset's local east/north metres (root frame, heading 0),
heights in metres above sea level, sampled bilinearly from ICGC `terreny-5m-30m-rgb-extent` at z14 — the tiles
the Luciad scene draws.

usage: icgc_ground_grid.py <tileset.json> [cell_m=4]
"""
import io, json, math, sys, urllib.request
import numpy as np
from PIL import Image

path = sys.argv[1]
cell = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0
ts = json.load(open(path))
t = ts['root']['transform']
x, y, z = t[12], t[13], t[14]
a, e2 = 6378137.0, 6.69437999014e-3
lon0 = math.atan2(y, x); p = math.hypot(x, y); lat0 = math.atan2(z, p * (1 - e2))
for _ in range(10):
    n = a / math.sqrt(1 - e2 * math.sin(lat0) ** 2); h = p / math.cos(lat0) - n
    lat0 = math.atan2(z, p * (1 - e2 * n / (n + h)))
box = ts['root']['boundingVolume']['box']
e_min, e_max = box[0] - box[3] - cell, box[0] + box[3] + cell
n_min, n_max = box[1] - box[7] - cell, box[1] + box[7] + cell
cols = int(math.ceil((e_max - e_min) / cell)) + 1
rows = int(math.ceil((n_max - n_min) / cell)) + 1

Z = 14
tiles = {}


def tile(tx, ty):
    if (tx, ty) not in tiles:
        url = f'https://tilemaps.icgc.cat/tileserver/tileserver/terreny-5m-30m-rgb-extent/{Z}/{tx}/{ty}.png'
        req = urllib.request.Request(url, headers={'User-Agent': 'cde-demo-assets'})
        rgb = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(req).read())).convert('RGB'), dtype=np.float64)
        tiles[(tx, ty)] = -10000 + (rgb[..., 0] * 65536 + rgb[..., 1] * 256 + rgb[..., 2]) * 0.1
    return tiles[(tx, ty)]


def height(lon, lat):
    nt = 2 ** Z
    fx = (lon + 180) / 360 * nt
    fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * nt
    im = tile(int(fx), int(fy)); size = im.shape[0]
    px, py = (fx - int(fx)) * size - 0.5, (fy - int(fy)) * size - 0.5
    x0, y0 = int(math.floor(px)), int(math.floor(py)); tx_, ty_ = px - x0, py - y0
    x0, y0 = min(max(x0, 0), size - 2), min(max(y0, 0), size - 2)  # tile edge: clamp, half a pixel at most
    q = im[y0:y0 + 2, x0:x0 + 2]
    return (q[0, 0] * (1 - tx_) + q[0, 1] * tx_) * (1 - ty_) + (q[1, 0] * (1 - tx_) + q[1, 1] * tx_) * ty_


mlat = 111132.954 - 559.822 * math.cos(2 * lat0) + 1.175 * math.cos(4 * lat0)
mlon = math.pi / 180 * a * math.cos(lat0) / math.sqrt(1 - e2 * math.sin(lat0) ** 2)
hs = []
for r in range(rows):
    for c in range(cols):
        e, nn = e_min + c * cell, n_min + r * cell
        hs.append(round(height(math.degrees(lon0) + e / mlon, math.degrees(lat0) + nn / mlat), 2))
ts.setdefault('extras', {})['cdeGroundGrid'] = {
    'source': 'ICGC Model d\'Elevacions del Terreny 5 m (CC BY 4.0), terreny-5m-30m-rgb-extent z14',
    'e0': round(e_min, 3), 'n0': round(n_min, 3), 'cell': cell, 'cols': cols, 'rows': rows, 'heights': hs}
json.dump(ts, open(path, 'w'), indent=1)
print(path, f'{cols}x{rows}', 'min', min(hs), 'max', max(hs))
