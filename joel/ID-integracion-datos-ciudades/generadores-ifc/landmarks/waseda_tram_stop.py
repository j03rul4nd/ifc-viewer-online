"""Waseda tram stop (早稲田停留場, SA-30), terminus of the Tokyo Sakura Tram (Toden Arakawa Line) — v2.

An authored IFC4X3 model for the CDE Scenes demo: detailed geometry (roughly LOD 400) carrying
LOD 500-style asset data, so a click on any rail, sleeper, rib, column or luminaire shows what an as-built
asset register would hold. It is NOT the operator's as-built model and the asset values are invented:
every element says so in Pset_CDE_AssetManagement (demo) and Pset_CDE_Provenance.

What is real:
  * the track axis at the stop and the two tracks towards the west, and the stop's footprint, from
    OpenStreetMap (ways 666081133, 37866121, 180140467, 260395380; © OpenStreetMap contributors, ODbL):
    platforms either side of a stub track that ends at a buffer stop, joined behind it by a concourse
    that opens onto Shin-Mejiro-dori through an entrance portal;
  * the ground height, TP 7.8 m, from the GSI 1 m laser DEM;
  * the 1 372 mm gauge of the Arakawa Line;
  * the look of the stop, from photographs on Wikimedia Commons (Category:Waseda Station (Toden), 2004–2024,
    CC0 / CC BY / CC BY-SA): the vaulted canopies in dark bronze with cream ceiling panels between ribs, the
    portal with its clerestory band and the arched crest carrying the 2022 name board (white, Sakura Tram pink
    band, SA-30 blossom), the red-brown brick paving, the ballasted track in its trench between precast block
    walls with orange edge lines, the concrete buffer block with its target board, the brass handrail along
    the set-down platform, concrete OCS poles, vending machines, potted plants and parked bicycles.
What is estimated from those photographs, not measured: every dimension of the canopy, portal and furniture.

Local axes: +x east, +y north, metres, origin at the OSM stop node (35.711807 N, 139.7191703 E), z = 0
on the ground at TP 7.8 m. The stop frame (s, t) runs s along the stub track from the turnout towards
the buffer stop (and on to the street) and t to its left (north side).

Scene tiles: anchored at h = 7.88, the model's own TP height (z = 0), the laser ground at the stop. Since
2026-10-01 (later that day) the scene's Japanese terrain is GSI's 5 m laser DEM from z13 down, in float metres
(CDE-Frontend basemapImagery.ts); before, it was DEM10B rounded to the metre, 10 m here, and v2 was anchored there.
The laser ground is not flat (7.82–7.97 m along the stop, 8.05 m on the open track west), and live trams are drawn
on it, so the track follows it: every ballast block, rail length, sleeper and tie plate stands on the ground under
it (gsi_laser.py, ≤3 m pieces), while the platforms, concourse and canopies stay level and reach 0.3 m down.
That is also why the ballast sits 3 cm above the ground: anything below the terrain is hidden by it. The rail
head is 10 cm above the terrain, a compromise: v1 kept it at 4.5 cm for the trams' wheels and the rails
vanished into the bed; a true ballasted section (head ≈ 0.32 m up) left every tram sunk in its rails. At
10 cm the wheels sink into the rail inside the trench, where the trench walls and the trams' skirts hide
them, and the rails read. The rail foot still dips into the sleepers: read that as drawn, not as a clash.

Lettering is real geometry: glyph outlines from Noto Sans CJK JP (SIL Open Font License 1.1), extruded.

usage: uv run --with ifcopenshell --with pyproj --with shapely --with fonttools python landmarks/waseda_tram_stop.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/waseda-tram-stop.ifc src/waseda-tram-stop_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/waseda-tram-stop_qto.ifc \
           tiles/tokyo-waseda-tram-stop 35.711807 139.7191703 7.88 0 --keep-origin \
           --wfs tiles/wfs/tokyo-waseda-tram-stop --wfs-name tokyo_waseda_tram_stop_features
"""
import json, math, os, sys

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTCollection
from shapely.geometry import Polygon
from shapely.ops import unary_union

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model  # noqa: E402
from gsi_laser import LaserGround  # noqa: E402

HERE = os.path.dirname(__file__)
LAT0, LON0, ELEV0 = 35.711807, 139.7191703, 7.88
TOKYO_CRS = (6677, 'JGD2011 / Japan Plane Rectangular CS IX', 'JGD2011', 'TP (Tokyo Peil)')

m = Model('Toden Arakawa Line — Waseda stop (SA-30)', 'Waseda tram stop site',
          'Tokyo Sakura Tram — Waseda stop', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 model (≈LOD 400 geometry, LOD 500-style asset data with demo values). '
                      'Track axis and footprint © OpenStreetMap contributors (ODbL); ground height GSI DEM; '
                      'appearance from Wikimedia Commons photographs. Not the operator\'s as-built model.',
          tag_prefix='SA30', crs=TOKYO_CRS, schema='IFC4X3_ADD2', facility='railway')
f = m.f

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('concrete', 'Reinforced concrete C30/37', (0.70, 0.69, 0.66), 'Concrete', 2500, 'Cast in place')
M('precast', 'Precast concrete', (0.74, 0.73, 0.70), 'Concrete', 2400, 'Prestressed, factory cast')
M('block', 'Precast hollow block facing, weathered', (0.62, 0.62, 0.59), 'Concrete', 2200)
M('ballast', 'Crushed stone ballast 20–40 mm', (0.43, 0.39, 0.35), 'Stone', 1700, 'Andesite, weathered')
M('rail', 'Rail steel R260, rusted web', (0.38, 0.29, 0.24), 'Steel', 7850, 'Rail grade R260, head hardened')
M('railhead', 'Rail head, polished by wheels', (0.66, 0.66, 0.67), 'Steel', 7850)
M('brick', 'Clay brick paver 200×100, red-brown', (0.56, 0.30, 0.23), 'Ceramic', 2000)
M('brick_d', 'Clay brick paver, dark flashed', (0.44, 0.22, 0.17), 'Ceramic', 2000)
M('brick_l', 'Clay brick paver, light terracotta', (0.66, 0.40, 0.31), 'Ceramic', 2000)
M('tile_dk', 'Granite sett, dark grey', (0.32, 0.32, 0.33), 'Stone', 2650)
M('tile_lt', 'Granite sett, light grey', (0.80, 0.79, 0.76), 'Stone', 2650)
M('edge', 'Platform edge warning tile, grey (comb pattern)', (0.58, 0.59, 0.60), 'Polymer concrete', 2200)
M('tactile', 'Tactile paving, yellow (JIS T 9251)', (0.95, 0.76, 0.10), 'Polymer', 1300)
M('orange', 'Safety orange line paint', (0.95, 0.47, 0.07), 'Paint', 1400)
M('bronze', 'Coated aluminium, dark bronze', (0.23, 0.19, 0.16), 'Aluminium', 2700, 'Fluoropolymer coating')
M('bronze_l', 'Coated steel, bronze brown', (0.33, 0.26, 0.20), 'Steel', 7850)
M('cream', 'Ceiling panel, cream enamelled aluminium', (0.93, 0.88, 0.76), 'Aluminium', 2700)
M('glass_cl', 'Laminated glass, grey tint (clerestory)', (0.42, 0.47, 0.50), 'Glass', 2500, transparency=0.35)
M('glass', 'Toughened glass, clear', (0.75, 0.84, 0.88), 'Glass', 2500, transparency=0.6)
M('frame_l', 'Anodised aluminium frame, silver', (0.78, 0.79, 0.80), 'Aluminium', 2700)
M('brass', 'Stainless handrail, champagne gold PVD', (0.78, 0.64, 0.40), 'Steel', 7900)
M('stainless', 'Stainless steel, brushed', (0.80, 0.81, 0.82), 'Steel', 7900)
M('galv', 'Hot-dip galvanized steel', (0.66, 0.68, 0.70), 'Steel', 7850)
M('pole', 'Spun concrete pole', (0.72, 0.72, 0.70), 'Concrete', 2600, 'Centrifugally cast, prestressed')
M('white', 'Enamelled steel panel, white', (0.96, 0.96, 0.95), 'Steel', 7850)
M('pink', 'Sakura Tram rose pink', (0.85, 0.30, 0.49), 'Paint', 1400)
M('ink', 'Cut vinyl lettering, black', (0.07, 0.07, 0.08), 'Polymer', 1300)
M('black', 'LED display housing', (0.08, 0.08, 0.09), 'Aluminium', 2700)
M('led', 'Amber LED matrix', (1.00, 0.55, 0.10), 'Electronics', 1500)
M('light', 'Opal polycarbonate diffuser', (1.00, 0.99, 0.92), 'Plastic', 1200)
M('red', 'Signal red coating', (0.80, 0.10, 0.10), 'Steel', 7850)
M('green', 'Tokyo green coating', (0.10, 0.55, 0.30), 'Steel', 7850)
M('copper', 'Hard-drawn copper Cu-ETP', (0.74, 0.46, 0.22), 'Copper', 8900)
M('insul', 'Porcelain insulator, brown glaze', (0.45, 0.25, 0.15), 'Ceramic', 2400)
M('wood', 'Thermo-treated ash slats', (0.63, 0.44, 0.26), 'Wood', 650)
M('timber', 'Creosoted timber', (0.25, 0.18, 0.12), 'Wood', 800)
M('terracotta', 'Glazed terracotta pot', (0.62, 0.32, 0.20), 'Ceramic', 1900)
M('foliage', 'Shrub foliage', (0.22, 0.44, 0.20), 'Vegetation', 600)
M('foliage_d', 'Evergreen foliage, dark', (0.13, 0.32, 0.15), 'Vegetation', 600)
M('bloom', 'Rose blooms', (0.90, 0.36, 0.55), 'Vegetation', 300)
M('bloom_y', 'Pansy blooms, yellow', (0.98, 0.84, 0.20), 'Vegetation', 300)
M('vend_red', 'Vending cabinet, red', (0.80, 0.08, 0.12), 'Steel', 7850)
M('vend_white', 'Vending cabinet, white', (0.94, 0.94, 0.93), 'Steel', 7850)
M('vend_blue', 'Vending cabinet, blue', (0.08, 0.30, 0.66), 'Steel', 7850)
M('display', 'Vending display window, backlit', (0.90, 0.94, 0.97), 'Plastic', 1200)
M('can_a', 'Product dummy, green', (0.20, 0.62, 0.30), 'Plastic', 1000)
M('can_b', 'Product dummy, orange', (0.95, 0.55, 0.12), 'Plastic', 1000)
M('can_c', 'Product dummy, blue', (0.18, 0.35, 0.78), 'Plastic', 1000)
M('bike_s', 'Bicycle frame, silver', (0.76, 0.77, 0.78), 'Steel', 7850)
M('bike_b', 'Bicycle frame, navy', (0.12, 0.18, 0.36), 'Steel', 7850)
M('bike_w', 'Bicycle frame, cream', (0.92, 0.89, 0.80), 'Steel', 7850)
M('tyre', 'Tyre, black', (0.07, 0.07, 0.07), 'Rubber', 1200)

# ─── Geometry helpers ──────────────────────────────────────────────────────────────────────────────
osm = json.load(open(os.path.join(HERE, 'waseda_osm_local.json')))
A = (-31.56, 9.70)          # turnout: the two tracks from the west become the stub (OSM way 666081133)
B = (-2.65, -0.75)          # end of track (OSM)
LEN = math.dist(A, B)
U = ((B[0] - A[0]) / LEN, (B[1] - A[1]) / LEN)
N = (-U[1], U[0])
ANG = math.atan2(U[1], U[0])


def P(s, t):
    return (A[0] + s * U[0] + t * N[0], A[1] + s * U[1] + t * N[1])


def p3(s, t, z):
    x, y = P(s, t)
    return (x, y, z)


def v3(ds, dt, dz):
    return (ds * U[0] + dt * N[0], ds * U[1] + dt * N[1], dz)


def sbox(s0, s1, t0, t1, z0, h):
    """Box aligned with the stop frame."""
    cx, cy = P((s0 + s1) / 2, (t0 + t1) / 2)
    return m.box(cx, cy, z0, abs(s1 - s0), abs(t1 - t0), h, angle=ANG)


def seg_box(p0, p1, w, z0, h):
    """Box along a plan segment p0→p1, w wide."""
    cx, cy = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    return m.box(cx, cy, z0, math.dist(p0, p1), w, h, angle=math.atan2(p1[1] - p0[1], p1[0] - p0[0]))


def scyl(s, t, z0, r, h):
    x, y = P(s, t)
    return m.cylinder(x, y, z0, r, h)


def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def _perp(d):
    a = (0., 0., 1.) if abs(d[2]) < 0.9 else (1., 0., 0.)
    return _unit((d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]))


def rod(p0, p1, r):
    """Round bar from p0 to p1 (3D points)."""
    d = tuple(b - a for a, b in zip(p0, p1))
    L = math.sqrt(sum(c * c for c in d))
    u = _unit(d)
    prof = f.createIfcCircleProfileDef('AREA', None, m._pl2(), float(r))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=u, ref=_perp(u)), f.createIfcDirection((0., 0., 1.)), float(L))


def disc(c, axis, r, w, r_in=None):
    """Disc (or ring) centred at c, its axis along `axis`, w thick."""
    u = _unit(axis)
    p0 = tuple(ci - ui * w / 2 for ci, ui in zip(c, u))
    prof = (f.createIfcCircleHollowProfileDef('AREA', None, m._pl2(), float(r), float(r - r_in)) if r_in
            else f.createIfcCircleProfileDef('AREA', None, m._pl2(), float(r)))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=u, ref=_perp(u)), f.createIfcDirection((0., 0., 1.)), float(w))


def obox(c, u, v, du, dv, dw):
    """Box centred at c with edges along unit vectors u, v and w = u × v."""
    u = _unit(u); v = _unit(v)
    w = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    p0 = tuple(ci - wi * dw / 2 for ci, wi in zip(c, w))
    prof = f.createIfcRectangleProfileDef('AREA', None, m._pl2(), float(du), float(dv))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=w, ref=u), f.createIfcDirection((0., 0., 1.)), float(dw))


def _poly(pts):
    return f.createIfcPolyline([f.createIfcCartesianPoint((float(a), float(b))) for a, b in list(pts) + [pts[0]]])


def plane_solid(outer, holes, origin, u, depth):
    """Polygon (with holes) drawn in the vertical plane through `origin` spanned by horizontal unit u and +Z,
    extruded `depth` along the plane's normal (u turned 90° clockwise), centred on the plane."""
    ux, uy = u
    nx, ny = -uy, ux
    ox, oy, oz = origin
    pl = m._pl3(ox + nx * depth / 2, oy + ny * depth / 2, oz, axis=(-nx, -ny, 0.), ref=(ux, uy, 0.))
    prof = (f.createIfcArbitraryProfileDefWithVoids('AREA', None, _poly(outer), [_poly(h) for h in holes]) if holes
            else f.createIfcArbitraryClosedProfileDef('AREA', None, _poly(outer)))
    return f.createIfcExtrudedAreaSolid(prof, pl, f.createIfcDirection((0., 0., 1.)), float(depth))


def xsec(pts, s0, s1, sign=1):
    """Cross-section [(t', z)] (t' measured away from the track axis on side `sign`), extruded along s."""
    return plane_solid([(sign * a, b) for a, b in pts], None, (*P((s0 + s1) / 2, 0), 0.), N, s1 - s0)


def lsec(pts, t0, t1):
    """Long section [(s, z)] extruded across t between t0 and t1."""
    return plane_solid(pts, None, (*P(0, (t0 + t1) / 2), 0.), U, abs(t1 - t0))


def arc(cx, cz, r, a0, a1, n=10):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def offset(curve, d):
    """Polyline offset `d` to its left (per-vertex averaged normals)."""
    out = []
    for i, p in enumerate(curve):
        a = curve[max(i - 1, 0)]; b = curve[min(i + 1, len(curve) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy)
        out.append((p[0] - dy / L * d, p[1] + dx / L * d))
    return out


def band(curve, d0, d1):
    """Closed polygon between two offsets of a polyline."""
    return offset(curve, d0) + offset(curve, d1)[::-1]


def hash01(*k):
    """Deterministic pseudo-random number in [0, 1): the model comes out the same every run."""
    h = 2166136261
    for v in k:
        h = ((h ^ (int(v * 1000) & 0xffffffff)) * 16777619) & 0xffffffff
    return (h % 10007) / 10007


# ─── Lettering (real geometry) ─────────────────────────────────────────────────────────────────────
_FONTS = {}


def _font(weight):
    if weight not in _FONTS:
        _FONTS[weight] = TTCollection(f'/usr/share/fonts/opentype/noto/NotoSansCJK-{weight}.ttc').fonts[0]   # JP
    return _FONTS[weight]


class _Flatten(BasePen):
    """Glyph outline → list of flattened contours."""
    def __init__(self, gs):
        super().__init__(gs); self.contours = []; self.cur = []

    def _moveTo(self, p): self.cur = [p]
    def _lineTo(self, p): self.cur.append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for i in range(1, 7):
            t = i / 6; a = (1 - t) ** 3; b = 3 * t * (1 - t) ** 2; c = 3 * t * t * (1 - t); d = t ** 3
            self.cur.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for i in range(1, 5):
            t = i / 4
            self.cur.append(((1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0],
                             (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1]))

    def _closePath(self):
        if len(self.cur) > 2: self.contours.append(self.cur)
        self.cur = []
    _endPath = _closePath


def _signed_area(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def text_shapes(text, height, weight='Bold', spacing=0.0):
    """Shapely polygons of `text`, cap height ≈ `height` m, baseline at 0, starting at x = 0; and its width.
    Non-zero fill: contours wound like the largest one add, the others cut, applied from the largest down
    (so an island inside a counter, as in 面, comes back)."""
    font = _font(weight)
    gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
    k = height / (upm * 0.73)
    x, polys = 0., []
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None:
            x += upm * 0.3; continue
        pen = _Flatten(gs); gs[g].draw(pen)
        rings = [([((x + px) * k, py * k) for px, py in c]) for c in pen.contours]
        rings = [(abs(_signed_area(r)), _signed_area(r) > 0, Polygon(r).buffer(0)) for r in rings if len(r) > 2]
        rings = [r for r in rings if r[0] > 1e-8 and not r[2].is_empty]
        rings.sort(key=lambda r: -r[0])
        shape = None
        if rings:
            outer = rings[0][1]
            for _, ccw, poly in rings:
                shape = poly if shape is None else (shape.union(poly) if ccw == outer else shape.difference(poly))
        if shape is not None and not shape.is_empty:
            polys += [g_ for g_ in getattr(shape, 'geoms', [shape]) if g_.geom_type == 'Polygon']
        x += gs[g].width + spacing * upm
    return [p.simplify(height * 0.010) for p in polys], x * k


def _solids_in_plane(shapes, org, u, depth):
    out = []
    for p in shapes:
        for g in getattr(p, 'geoms', [p]):
            if g.is_empty or g.area < 1e-7: continue
            out.append(plane_solid(list(g.exterior.coords)[:-1], [list(r.coords)[:-1] for r in g.interiors], org, u, depth))
    return out


def _sign_plane(s, t, facing, depth):
    """Origin and reading direction of a sign plane. facing = +1 / -1: the face looks along +s / -s;
    'N' / 'S': along +t / -t. The solid occupies [plane, plane + depth] on the viewer's side."""
    if facing in (1, -1):
        return (*P(s + facing * depth / 2, t), 0.), (N[0] * facing, N[1] * facing)
    sg = 1 if facing == 'N' else -1
    return (*P(s, t + sg * depth / 2), 0.), (-U[0] * sg, -U[1] * sg)


def lettering(text, height, s, t, z, facing, weight='Bold', depth=0.006, align='center', spacing=0.0):
    """Solids of `text` on a vertical sign plane at (s, t), baseline at z, reading left to right for the viewer."""
    polys, w = text_shapes(text, height, weight, spacing)
    x0 = {'center': -w / 2, 'left': 0., 'right': -w}[align]
    org, u = _sign_plane(s, t, facing, depth)
    org = (org[0] + u[0] * x0, org[1] + u[1] * x0, z)
    return _solids_in_plane(polys, org, u, depth)


def plane_shapes(shapes, s, t, facing, depth):
    """Shapely shapes drawn in sign-plane coordinates (x along the reading direction from (s, t), y = z)."""
    org, u = _sign_plane(s, t, facing, depth)
    return _solids_in_plane(shapes, org, u, depth)


def sakura_shape(cx, cy, r):
    """The stop-number mark's five-petal blossom, petals notched at the tip."""
    petals = []
    for k in range(5):
        a = math.pi / 2 + k * 2 * math.pi / 5
        pc = (cx + 0.52 * r * math.cos(a), cy + 0.52 * r * math.sin(a))
        petal = Polygon([(pc[0] + 0.44 * r * math.cos(b) * (1 + 0.2 * math.cos(b - a)),
                          pc[1] + 0.44 * r * math.sin(b) * (1 + 0.2 * math.cos(b - a))) for b in [i * math.pi / 18 for i in range(36)]])
        tip = (cx + 1.02 * r * math.cos(a), cy + 1.02 * r * math.sin(a))
        notch = Polygon([tip, (tip[0] - 0.16 * r * math.cos(a - 0.9), tip[1] - 0.16 * r * math.sin(a - 0.9)),
                         (cx + 0.80 * r * math.cos(a), cy + 0.80 * r * math.sin(a)),
                         (tip[0] - 0.16 * r * math.cos(a + 0.9), tip[1] - 0.16 * r * math.sin(a + 0.9))])
        petals.append(petal.difference(notch))
    centre = Polygon([(cx + 0.3 * r * math.cos(b), cy + 0.3 * r * math.sin(b)) for b in [i * math.pi / 8 for i in range(16)]])
    return unary_union(petals + [centre])


def stop_mark(s, t, zc, r, facing, depth=0.006):
    """The SA-30 stop-number mark: pink disc, white blossom, «SA 30» in black. Returns {material: [solids]}."""
    disc_ = Polygon([(r * math.cos(b), zc + r * math.sin(b)) for b in [i * math.pi / 24 for i in range(48)]])
    return {'pink': plane_shapes([disc_], s, t, facing, depth),
            'white': plane_shapes([sakura_shape(0, zc, r * 0.86)], s + facing * depth, t, facing, depth),
            'ink': lettering('SA', r * 0.30, s + facing * 2 * depth, t, zc + r * 0.12, facing, depth=depth) +
                   lettering('30', r * 0.46, s + facing * 2 * depth, t, zc - r * 0.42, facing, depth=depth)}


# ─── Asset data ────────────────────────────────────────────────────────────────────────────────────
YEAR = {'track': 2015, 'platform': 2008, 'canopy': 2008, 'ocs': 2012, 'furniture': 2019, 'equipment': 2021,
        'signage': 2022}


def am(kind, interval_months, condition, **extra):
    """Pset_CDE_AssetManagement (demo): the fields an as-built asset register holds, with invented values."""
    base = {'DataStatus': 'Illustrative demo values — not the asset owner\'s records',
            'LifecycleStatus': 'In service', 'InstallationYear': YEAR[kind],
            'InspectionInterval_months': interval_months, 'LastInspection': '2026-06-12',
            'NextInspection': '2026-12-12' if interval_months <= 6 else '2027-06-12',
            'ConditionIndex_1to5': condition, 'MaintenanceStrategy': 'Condition-based'}
    base.update(extra)
    return {'Pset_CDE_AssetManagement (demo)': base}


def spec(**props):
    return {'Pset_CDE_Specification': props}


OSM_SRC = ('OpenStreetMap track axis and stop footprint (ODbL); typical Toden dimensions', 'Medium',
           'OSM ways 666081133, 37866121, 180140467, 260395380')
PHOTO_SRC = ('Estimated from photographs (Wikimedia Commons, Category:Waseda Station (Toden)); position from OSM', 'Low',
             'Commons: Waseda Stop.jpg, Waseda Stop 2.jpg, Waseda Stop 3.jpg (CC0, 2022); Toden Waseda DSCN8778 20100311.JPG '
             '(CC BY-SA 3.0); Tokyo Sakura Tram Waseda Station Signage.jpg (CC BY-SA 4.0, 2024)')
TYP_SRC = ('Typical dimensions for a Toden stop; position from the OSM footprint', 'Low')

# ─── Spatial structure ─────────────────────────────────────────────────────────────────────────────
TRACK = 'Superestructura de vía · Track'
PN = 'Andén norte · North platform (set-down)'
PS = 'Andén sur · South platform (boarding)'
HALL = 'Vestíbulo y pórtico · Concourse and entrance'
OCS = 'Línea aérea de contacto · Overhead line'
LINE = 'Señalización y equipos · Lineside'
m.storey(TRACK, 0., 'Rails, sleepers, ballast, turnout and buffer stop', part_type='TRACK')
m.storey(PN, 0., 'Platform on the north side of the stub track, where trams set down', part_type='USERDEFINED', usage='LATERAL')
m.storey(PS, 0., 'Platform on the south side of the stub track, where trams take up', part_type='USERDEFINED', usage='LATERAL')
m.storey(HALL, 0., 'Concourse behind the buffer stop and the entrance portal on Shin-Mejiro-dori', part_type='USERDEFINED', usage='LATERAL')
m.storey(OCS, 0., 'Poles, cantilevers, messenger and contact wire', part_type='ABOVETRACK')
m.storey(LINE, 0., 'Signals, signs, safety and passenger information', part_type='LINESIDE')

# ─── Levels and plan ───────────────────────────────────────────────────────────────────────────────
GAUGE = 1.372
RAIL_T = GAUGE / 2 + 0.032        # rail centre from the track axis (gauge is measured inside the heads)
# Ballast 3 cm above the scene terrain: at 1 cm the terrain won the depth test and flickered. Rail head 10 cm
# above the terrain, where live trams are drawn (see the module docstring for why not 4.5 cm or 0.32 m).
BALLAST_TOP = 0.03
SLEEPER_TOP = BALLAST_TOP + 0.022
RAIL_HEAD = 0.10
RAIL_FOOT = RAIL_HEAD - 0.153
Z_P = 0.425                       # platform top: 0.38 m above v1's rail head, kept so trams still meet it
T_IN, T_OUT = 1.30, 4.00          # platform track edge and outer edge, from the track axis
S0, S1 = 0.6, 31.3                # platform ends: west ramp, concourse
S_ST = 37.6                       # concourse edge on the street (OSM footprint: 38.2, less the kerb)
S_PORT = 37.15                    # portal centre line
HALL_T = 4.30                     # concourse half-width
SE = LEN - 0.45                   # buffer stop face


def zf(s):
    """Floor level of platforms and concourse: flat to the concourse, then down to the street's own ground."""
    if s <= S1: return Z_P
    return Z_P + (Z_ST - Z_P) * min(1., (s - S1) / (S_ST - S1))


RAIL_PROFILE = [(-0.0635, 0), (0.0635, 0), (0.0635, 0.012), (0.008, 0.03), (0.008, 0.115), (0.0325, 0.12),
                (0.0325, 0.153), (-0.0325, 0.153), (-0.0325, 0.12), (-0.008, 0.115), (-0.008, 0.03),
                (-0.0635, 0.012)]
HEAD_PROFILE = [(-0.0326, 0.146), (0.0326, 0.146), (0.0326, 0.1535), (-0.0326, 0.1535)]


_ground = LaserGround().local(LAT0, LON0, ELEV0)
_gcache = {}


def G(p):
    """The scene's ground under plan point p, relative to z = 0 (the laser DEM its terrain is built from)."""
    key = (round(p[0], 2), round(p[1], 2))
    if key not in _gcache:
        _gcache[key] = _ground(*key)
    return _gcache[key]


def gst(s, t):
    return G(P(s, t))


Z_ST = max(gst(S_ST, t) for t in (-HALL_T, 0., HALL_T)) + 0.04   # the concourse meets the street 4 cm above its ground


def track_ground(p, d=None):
    """The highest ground across the track bed at p, so nothing of the bed sinks under the terrain."""
    if d is None:
        return G(p)
    c = (-d[1], d[0])
    return max(G((p[0] + c[0] * k, p[1] + c[1] * k)) for k in (-1.2, 0., 1.2))


def subdivide(pts, step=3.0):
    """A polyline cut into pieces no longer than `step`."""
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, math.ceil(math.dist(a, b) / step))
        out += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(1, n + 1)]
    return out


def rail_solid(p0, p1, prof=RAIL_PROFILE, dz=0.):
    d = (p1[0] - p0[0], p1[1] - p0[1])
    L = math.hypot(*d)
    cross = (-d[1] / L, d[0] / L)
    mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, RAIL_FOOT + dz)
    return m.extrude_vertical_profile(prof, mid, cross, L)


def along(pts, step, start=0.):
    """Points and unit directions every `step` metres along a polyline."""
    res, acc, target = [], 0., start
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b)
        while target <= acc + L:
            k = (target - acc) / L
            res.append(((a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k), ((b[0] - a[0]) / L, (b[1] - a[1]) / L)))
            target += step
        acc += L
    return res


def clip_west(pts, max_dist=46., min_dist=0.):
    """The OSM track from the turnout westwards, between `min_dist` and `max_dist` metres along it."""
    if math.dist(pts[0], A) > math.dist(pts[-1], A):
        pts = pts[::-1]
    out, acc = [], 0.
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b)
        for d in (min_dist,):
            if acc <= d < acc + L and not out:
                k = (d - acc) / L
                out.append((a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k))
        if acc + L >= max_dist:
            k = (max_dist - acc) / L
            out.append((a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)); break
        if acc + L > min_dist:
            out.append(tuple(b))
        acc += L
    return out


# ─── Track ─────────────────────────────────────────────────────────────────────────────────────────
stub = [P(-0.5, 0), P(SE - 0.15, 0)]
west_n = clip_west(osm['37866121'])
west_s = clip_west(osm['180140467'])
tracks = [('Vía de llegada (stub) · Stub track', stub),
          ('Vía 1 · Track 1 (west, north)', west_n),
          ('Vía 2 · Track 2 (west, south)', west_s)]

for ti, (tname, axis) in enumerate(tracks, 1):
    short = tname.split(' · ')[0]
    asm = m.assembly(tname, TRACK, object_type='Track section',
                     psets=spec(Gauge_mm=1372, RailProfile='50N (JIS E 1101)', Fastening='Elastic clip on tie plate',
                                TrackBed='Ballasted, crushed stone 250 mm under sleeper',
                                Electrification='600 V DC overhead line'))
    axis = subdivide(axis)
    seg_dz = [track_ground(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), _unit((b[0] - a[0], b[1] - a[1], 0.))[:2]) for a, b in zip(axis, axis[1:])]
    for side, sign in (('izquierdo · left', 1), ('derecho · right', -1)):
        line = offset(axis, sign * RAIL_T)
        segs = list(zip(line, line[1:]))
        m.element('IfcRail', f'Carril {side} — {short}', [rail_solid(a, b, dz=dz) for (a, b), dz in zip(segs, seg_dz)],
                  TRACK, 'rail', predefined='RAIL', object_type='Rail 50N', parent=asm, src=OSM_SRC,
                  psets={**spec(Profile='50N (JIS E 1101)', Mass_kg_m=50.4, SteelGrade='R260', Weld='Continuous welded rail',
                                Length_m=round(sum(math.dist(a, b) for a, b in segs), 2)),
                         **am('track', 6, 4, WearMeasure_mm=1.8, WearLimit_mm=9.0, LastUltrasonicTest='2026-03-04')})
        m.element('IfcRail', f'Banda de rodadura {side} — {short}', [rail_solid(a, b, HEAD_PROFILE, dz) for (a, b), dz in zip(segs, seg_dz)],
                  TRACK, 'railhead', predefined='RAIL', object_type='Rail head running band', parent=asm, src=OSM_SRC,
                  psets=am('track', 6, 4, Note='The wheel-polished band of the head, kept apart so it reads'))
    width = 2.55 if ti == 1 else 2.9          # between the trench walls at the stop, with shoulders outside it
    m.element('IfcCourse', f'Banqueta de balasto — {short}',
              [seg_box(a, b, width, BALLAST_TOP - 0.25 + dz, 0.25) for (a, b), dz in zip(zip(axis, axis[1:]), seg_dz)], TRACK,
              'ballast', predefined='BALLASTBED', object_type='Ballast bed, crushed stone', parent=asm, src=OSM_SRC,
              psets={**spec(Depth_mm=250, Grading='20–40 mm', Shoulder_mm=300 if ti > 1 else 0),
                     **am('track', 12, 3, Note='Fouling and weeds at the buffer end (demo)' if ti == 1 else None)})
    sl, fx = [], []
    seg_len = [math.dist(a, b) for a, b in zip(axis, axis[1:])]
    starts = [sum(seg_len[:i]) for i in range(len(seg_len))]

    def dz_at(dist):
        """The ground offset of the track piece at `dist` along the axis."""
        i = max(k for k, st_ in enumerate(starts) if st_ <= dist + 1e-9)
        return seg_dz[i]

    for k, (p, d) in enumerate(along(axis, 0.62, 0.3)):
        dz = dz_at(0.3 + 0.62 * k)
        cross = (-d[1], d[0])
        sl.append(seg_box((p[0] - cross[0], p[1] - cross[1]), (p[0] + cross[0], p[1] + cross[1]), 0.21, SLEEPER_TOP - 0.17 + dz, 0.17))
        for sg in (1, -1):
            c = (p[0] + cross[0] * sg * RAIL_T, p[1] + cross[1] * sg * RAIL_T, SLEEPER_TOP + 0.006 + dz)
            fx.append(obox(c, (*cross, 0.), (*d, 0.), 0.30, 0.16, 0.012))
    m.element('IfcTrackElement', f'Traviesas — {short}', sl, TRACK, 'precast', predefined='SLEEPER',
              object_type='Prestressed concrete sleepers 2 000 × 210, @ 620', parent=asm, src=OSM_SRC,
              psets={**spec(Count=len(sl), Length_mm=2000, Width_mm=210, Height_mm=170, Spacing_mm=620),
                     **am('track', 12, 4, CrackedSleepers=2 if ti == 1 else 0)})
    m.element('IfcFastener', f'Placas de asiento y clips — {short}', fx, TRACK, 'galv', predefined='USERDEFINED',
              object_type='Tie plate with elastic clips', parent=asm, src=TYP_SRC,
              psets={**spec(Count=len(fx), Type='Elastic e-clip on cast tie plate'), **am('track', 12, 4)})

m.element('IfcSign', 'Marcas de parada (naranja)', [sbox(s - 0.05, s + 0.05, -0.85, 0.85, SLEEPER_TOP + track_ground(P(s, 0), U), 0.008) for s in (SE - 3.2, SE - 1.4)],
          TRACK, 'orange', predefined='MARKER', object_type='Stopping position marks, painted on the sleepers', src=PHOTO_SRC,
          psets=am('track', 12, 4))

# turnout
asm = m.assembly('Desvío · Turnout', TRACK, object_type='Track equipment')
fr = P(-5.0, 0)
DZ_T = track_ground(fr, U)                 # the turnout stands on the ground there
m.element('IfcTrackElement', 'Corazón del desvío · Frog', m.box(fr[0], fr[1], RAIL_FOOT + DZ_T, 1.6, 0.30, 0.15, angle=ANG), TRACK, 'rail',
          predefined='FROG', object_type='Cast manganese frog 1:8', parent=asm, src=TYP_SRC,
          psets={**spec(Angle='1:8', Material='Austenitic manganese steel'), **am('track', 3, 3, Note='Grinding scheduled (demo)')})
for side in (1, -1):
    p0, p1 = P(-12.0, side * RAIL_T * 0.55), P(-6.0, side * RAIL_T)
    m.element('IfcRail', f'Aguja {"izquierda" if side > 0 else "derecha"} · Switch blade', seg_box(p0, p1, 0.07, RAIL_FOOT + DZ_T, 0.15), TRACK,
              'railhead', predefined='BLADE', object_type='Switch blade', parent=asm, src=TYP_SRC, psets=am('track', 3, 4))
m.element('IfcTrackElement', 'Máquina de cambio · Point machine',
          [m.box(*P(-10.0, 1.9), gst(-10.0, 1.9) - 0.05, 1.1, 0.45, 0.45, angle=ANG), sbox(-10.05, -9.95, 0.70, 1.65, SLEEPER_TOP + DZ_T, 0.04)], TRACK, 'galv',
          predefined='USERDEFINED', object_type='Electric point machine with throw rod', parent=asm, src=TYP_SRC,
          psets={**spec(Supply='100 V AC', ThrowTime_s=3.5), **am('equipment', 3, 4, OperatingCycles=184233)})

# buffer stop: a concrete block on a timber sill, the black-and-white target board, an orange marker pole
DZ_B = track_ground(P(SE, 0), U)
asm = m.assembly('Topera · Buffer stop', TRACK, object_type='Fixed buffer stop (concrete)')
m.element('IfcTrackElement', 'Bloque de topera', [sbox(SE, SE + 0.55, -0.80, 0.80, BALLAST_TOP + DZ_B, 0.62),
                                                  sbox(SE + 0.04, SE + 0.51, -0.76, 0.76, BALLAST_TOP + DZ_B + 0.62, 0.03)], TRACK, 'concrete',
          predefined='VEHICLESTOP', object_type='Concrete buffer block 1 600 × 550 × 650', parent=asm, src=PHOTO_SRC,
          psets={**spec(DesignImpactSpeed_kmh=5, DesignMass_t=30, Mass_t=1.4), **am('track', 12, 4)})
m.element('IfcTrackElement', 'Durmiente de choque', sbox(SE - 0.14, SE, -0.85, 0.85, BALLAST_TOP + DZ_B, 0.16), TRACK, 'timber',
          predefined='USERDEFINED', object_type='Timber buffer sill 140 × 160', parent=asm, src=PHOTO_SRC, psets=am('track', 12, 3))
m.element('IfcSign', 'Placa de diana de fin de vía', sbox(SE - 0.012, SE, -0.17, 0.17, 0.25 + DZ_B, 0.34), TRACK, 'white', predefined='MARKER',
          object_type='End-of-track target board 340 × 340', parent=asm, src=PHOTO_SRC, psets=am('track', 12, 5))
cx = p3(SE - 0.016, 0, 0.42 + DZ_B)
m.element('IfcSign', 'Aspa de la diana', [obox(cx, v3(0, math.cos(a), math.sin(a)), v3(1, 0, 0), 0.42, 0.06, 0.006) for a in (math.pi / 4, -math.pi / 4)],
          TRACK, 'ink', predefined='MARKER', object_type='Target cross, black', parent=asm, src=PHOTO_SRC, psets=am('track', 12, 5))
m.element('IfcMember', 'Mástil naranja de la topera', scyl(SE + 0.30, 0.0, BALLAST_TOP + DZ_B + 0.65, 0.025, 1.5), TRACK, 'orange',
          predefined='POST', object_type='Marker pole Ø50', parent=asm, src=PHOTO_SRC, psets=am('track', 24, 4))

# ─── Platforms ─────────────────────────────────────────────────────────────────────────────────────
BAYS = [S0 + 0.4 + 3.4 * i for i in range(11)] + [S_PORT - 0.45]   # canopy columns, ≈3.4 m apart, the last at the portal


def platform(storey, sign, label):
    t_in, t_out = sorted((sign * T_IN, sign * T_OUT))
    body = m.assembly(f'Estructura de andén — {label}', storey, object_type='Platform',
                      psets=spec(Length_m=round(S1 - S0, 1), Width_mm=2700, HeightAboveRail_mm=380,
                                 Accessibility='Step-free from the concourse, tactile guidance'))
    m.element('IfcSlab', f'Losa de andén — {label}', sbox(S0, S1, t_in, t_out, -0.30, Z_P + 0.24), storey, 'concrete',
              predefined='USERDEFINED', object_type='Platform structure (reinforced concrete)', parent=body, src=OSM_SRC,
              psets=am('platform', 24, 4))
    # trench wall: precast hollow blocks, read as a grid of projecting joints
    face = sign * (T_IN - 0.015)
    joints = [sbox(s - 0.02, s + 0.02, face - 0.015, face + 0.015, -0.10, Z_P - 0.02) for s in
              [S0 + 0.25 + 0.40 * i for i in range(int((S1 - S0 - 0.5) / 0.40) + 1)]]
    joints.append(sbox(S0, S1, face - 0.015, face + 0.015, (Z_P + BALLAST_TOP) / 2 - 0.08, 0.04))
    m.element('IfcCovering', f'Paramento de bloques — {label}', joints, storey, 'block', predefined='CLADDING',
              object_type='Precast hollow block facing to the trench', parent=body, src=PHOTO_SRC, psets=am('platform', 24, 3))
    m.element('IfcCovering', f'Línea naranja de borde — {label}',
              sbox(S0, S1, sign * (T_IN - 0.02) - 0.006, sign * (T_IN - 0.02) + 0.006, Z_P - 0.12, 0.07),
              storey, 'orange', predefined='CLADDING', object_type='Orange edge line on the coping face', parent=body, src=PHOTO_SRC,
              psets=am('platform', 12, 4))
    edge = sorted((sign * T_IN, sign * (T_IN + 0.32)))
    m.element('IfcCovering', f'Baldosa de borde con peine — {label}', sbox(S0, S1, *edge, Z_P - 0.06, 0.06), storey, 'edge',
              predefined='COPING', object_type='Platform edge warning tile, comb pattern', parent=body, src=PHOTO_SRC,
              psets={**spec(EdgeGap_mm=60), **am('platform', 6, 4)})
    ridges = [sbox(S0, S1, sign * (T_IN + 0.05 + 0.055 * i) - 0.012, sign * (T_IN + 0.05 + 0.055 * i) + 0.012, Z_P, 0.006) for i in range(5)]
    m.element('IfcCovering', f'Estrías del borde — {label}', ridges, storey, 'edge', predefined='FLOORING',
              object_type='Edge tile ribs', parent=body, src=PHOTO_SRC, psets=am('platform', 6, 4))
    # brick paving: a red-brown base course, dark and light bricks laid over it in stretcher bond
    pav = sorted((sign * (T_IN + 0.32), sign * (T_OUT - 0.02)))
    m.element('IfcCovering', f'Pavimento de ladrillo — {label}', sbox(S0, S1, *pav, Z_P - 0.06, 0.06), storey, 'brick',
              predefined='FLOORING', object_type='Clay brick pavers 200×100 on mortar bed', parent=body, src=PHOTO_SRC,
              psets={**spec(SlipResistance='R11', Bond='Stretcher'), **am('platform', 12, 4)})
    dark, lite = [], []
    for j in range(int((pav[1] - pav[0]) / 0.20)):
        t0 = pav[0] + j * 0.20
        s = S0 + (0.20 if j % 2 else 0.)
        while s < S1 - 0.4:
            r = hash01(s, t0, sign)
            if r < 0.28 or r > 0.80:
                (dark if r < 0.28 else lite).append(sbox(s + 0.005, s + 0.395, t0 + 0.005, t0 + 0.195, Z_P, 0.003))
            s += 0.40
    m.element('IfcCovering', f'Ladrillos oscuros — {label}', dark, storey, 'brick_d', predefined='FLOORING',
              object_type='Flashed clay brick pavers', parent=body, src=PHOTO_SRC, psets=am('platform', 12, 4))
    m.element('IfcCovering', f'Ladrillos claros — {label}', lite, storey, 'brick_l', predefined='FLOORING',
              object_type='Light terracotta brick pavers', parent=body, src=PHOTO_SRC, psets=am('platform', 12, 4))
    tac = sorted((sign * (T_IN + 0.62), sign * (T_IN + 0.92)))
    m.element('IfcCovering', f'Pavimento táctil de advertencia — {label}', sbox(S0 + 0.2, S1 - 0.2, *tac, Z_P, 0.006), storey, 'tactile',
              predefined='FLOORING', object_type='Tactile warning paving (dot type, JIS T 9251)', parent=body, src=PHOTO_SRC,
              psets={**spec(Pattern='Dot, 300×300'), **am('platform', 6, 4)})
    tg_ = sign * 3.1
    m.element('IfcCovering', f'Pavimento táctil de guía — {label}', sbox(S0 + 1.0, S1, tg_ - 0.15, tg_ + 0.15, Z_P, 0.006), storey, 'tactile',
              predefined='FLOORING', object_type='Tactile guidance paving (line type, JIS T 9251)', parent=body, src=PHOTO_SRC,
              psets=am('platform', 6, 4))
    # ramp down to the street at the west end (1:14)
    cx, cy = P(S0, (t_in + t_out) / 2)
    ramp = m.extrude_vertical_profile([(-5.6, -0.25), (-5.6, gst(S0 - 5.6, (t_in + t_out) / 2) + 0.03), (0., Z_P), (0., -0.25)], (cx, cy, 0.), U, t_out - t_in)
    m.element('IfcRampFlight', f'Rampa de acceso — {label}', ramp, storey, 'concrete', predefined='STRAIGHT',
              object_type='Access ramp 1:14', parent=body, src=TYP_SRC, psets={**spec(Gradient='1:14', Width_mm=2700), **am('platform', 12, 4)})


platform(PN, 1, 'norte')
platform(PS, -1, 'sur')

# ─── Canopies: vaulted, dark bronze over cream ceiling panels ──────────────────────────────────────
ZC = Z_P + 2.55                   # column top, outer eave
T_COL = T_OUT - 0.14
CROWN = ZC + 0.62
# Centre line of the roof shell in (t', z), from the outer column, round over the platform, down to the inner eave.
SHELL = ([(T_COL + 0.10, ZC - 0.05)] + arc(T_COL - 0.52, ZC, 0.62, 0., math.pi / 2, 9)
         + [(2.40, CROWN + 0.04)] + arc(1.78, CROWN - 0.34, 0.34, math.pi / 2, math.pi, 7) + [(1.44, ZC + 0.02)])
CEIL = SHELL[1:-1]
S_CA, S_CB = S0 - 0.3, S_PORT - 0.45


def canopy(storey, sign, label):
    can = m.assembly(f'Marquesina abovedada — {label}', storey, object_type='Platform canopy, vaulted',
                     psets=spec(Structure='Steel ribs on square columns', Roofing='Dark bronze coated aluminium, standing seam',
                                Ceiling='Cream enamelled panels between ribs', DesignSnowLoad_kN_m2=0.6, DesignWindSpeed_m_s=34))
    m.element('IfcRoof', f'Cubierta curva — {label}', xsec(band(SHELL, -0.025, 0.025), S_CA, S_CB, sign), storey, 'bronze',
              predefined='BARREL_ROOF', object_type='Curved metal roof shell', parent=can, src=PHOTO_SRC,
              psets={**spec(Thickness_mm=50, Finish='Fluoropolymer, dark bronze'), **am('canopy', 12, 4)})
    seams, s, sc = [], S_CA + 0.2, SHELL[1:-2:2] + SHELL[-2:]
    while s < S_CB - 0.1:
        seams.append(xsec(band(sc, -0.055, -0.02), s - 0.012, s + 0.012, sign)); s += 0.90
    m.element('IfcCovering', f'Juntas alzadas de cubierta — {label}', seams, storey, 'bronze_l', predefined='ROOFING',
              object_type='Standing seams @ 900', parent=can, src=PHOTO_SRC, psets=am('canopy', 12, 4))
    m.element('IfcCovering', f'Falso techo crema — {label}', xsec(band(CEIL, 0.17, 0.19), S_CA + 0.05, S_CB - 0.05, sign), storey, 'cream',
              predefined='CEILING', object_type='Curved ceiling panels, cream', parent=can, src=PHOTO_SRC,
              psets={**spec(Panel='Enamelled aluminium 1.2 mm'), **am('canopy', 24, 4)})
    ribs, s = [], S_CA + 0.15
    while s < S_CB:
        ribs.append(xsec(band(CEIL, 0.0, 0.25), s - 0.04, s + 0.04, sign)); s += 1.70
    m.element('IfcBeam', f'Costillas curvas — {label}', ribs, storey, 'bronze_l', predefined='BEAM',
              object_type='Curved rib, built-up section 80 × 250, @ 1 700', parent=can, src=PHOTO_SRC,
              psets={**spec(Count=len(ribs), Spacing_mm=1700), **am('canopy', 12, 4)})
    m.element('IfcBeam', f'Viga de alero interior — {label}', xsec([(1.40, ZC - 0.12), (1.50, ZC - 0.12), (1.50, ZC + 0.12), (1.40, ZC + 0.12)], S_CA, S_CB, sign),
              storey, 'bronze', predefined='EDGEBEAM', object_type='Eave beam 100 × 240', parent=can, src=PHOTO_SRC, psets=am('canopy', 12, 4))
    m.element('IfcCableCarrierSegment', f'Bandeja de cables — {label}', xsec([(1.55, ZC + 0.06), (1.75, ZC + 0.06), (1.75, ZC + 0.12), (1.55, ZC + 0.12)], S_CA, S_CB, sign),
              storey, 'galv', predefined='CABLETRAYSEGMENT', object_type='Cable tray 200 × 60', parent=can, src=PHOTO_SRC, psets=am('equipment', 12, 4))
    gutter = [(T_COL + 0.08, ZC - 0.12), (T_COL + 0.26, ZC - 0.12), (T_COL + 0.26, ZC + 0.02), (T_COL + 0.22, ZC + 0.02),
              (T_COL + 0.22, ZC - 0.08), (T_COL + 0.12, ZC - 0.08), (T_COL + 0.12, ZC - 0.03), (T_COL + 0.08, ZC - 0.03)]
    m.element('IfcPipeSegment', f'Canalón exterior — {label}', xsec(gutter, S_CA, S_CB, sign), storey, 'bronze', predefined='GUTTER',
              object_type='Box gutter 180', parent=can, src=PHOTO_SRC, psets={**spec(Capacity_l_s=2.1), **am('canopy', 6, 3, Note='Leaves to clear (demo)')})
    tc = sign * T_COL
    for i, s in enumerate(BAYS, 1):
        z0 = zf(s)
        m.element('IfcColumn', f'Pilar {i} — {label}', [sbox(s - 0.09, s + 0.09, tc - 0.09, tc + 0.09, z0, ZC - z0 + 0.05),
                                                       sbox(s - 0.12, s + 0.12, tc - 0.12, tc + 0.12, z0, 0.35)], storey, 'bronze',
                  predefined='COLUMN', object_type='SHS 180 × 180 × 9 with base cover', parent=can, src=PHOTO_SRC,
                  psets={**spec(Section='SHS 180×180×9', Height_mm=round((ZC - z0) * 1000)),
                         **am('canopy', 12, 4 if i != 4 else 3, Note='Paint touch-up at base (demo)' if i == 4 else None)})
        if i % 3 == 1:
            m.element('IfcPipeSegment', f'Bajante {i} — {label}', scyl(s + 0.16, tc + sign * 0.10, z0, 0.04, ZC - z0 - 0.08), storey, 'bronze',
                      predefined='RIGIDSEGMENT', object_type='Downpipe Ø80', parent=can, src=TYP_SRC, psets=am('canopy', 12, 4))
    z = CROWN - 0.245
    for i, s in enumerate([S_CA + 1.0 + 3.4 * k for k in range(int((S_CB - S_CA - 1.0) / 3.4) + 1)], 1):
        m.element('IfcLightFixture', f'Luminaria {i} — {label}', [sbox(s - 0.06, s + 0.06, *sorted((sign * 2.05, sign * 3.25)), z, 0.07),
                                                                 sbox(s - 0.035, s + 0.035, *sorted((sign * 2.07, sign * 3.23)), z - 0.012, 0.012)],
                  storey, 'light', predefined='DIRECTIONSOURCE', object_type='LED linear luminaire 1 200, 38 W, IP65, 4 000 K',
                  parent=can, src=PHOTO_SRC,
                  psets={**spec(Power_W=38, LuminousFlux_lm=5200, ColourTemperature_K=4000, IP='IP65'),
                         **am('equipment', 12, 5 if i != 5 else 2, OperatingHours=31420 + 400 * i,
                              Note='Driver failure reported, replacement ordered (demo)' if i == 5 else None)})


canopy(PN, 1, 'norte')
canopy(PS, -1, 'sur')

# ─── Outer side: ring-motif balustrade, poster frames; brass handrails at the edge ─────────────────


def balustrade(storey, sign, label):
    to = sign * (T_OUT - 0.05)
    rails = [sbox(S0 + 0.2, S1, to - 0.02, to + 0.02, Z_P + z, 0.04) for z in (0.05, 0.98)]
    bars, s = [], S0 + 0.3
    while s < S1 - 0.1:
        bars.append(sbox(s - 0.012, s + 0.012, to - 0.012, to + 0.012, Z_P + 0.09, 0.89)); s += 0.13
    ring = Polygon([(0.17 * math.cos(a), 0.17 * math.sin(a)) for a in [i * math.pi / 6 for i in range(12)]]).difference(
        Polygon([(0.15 * math.cos(a), 0.15 * math.sin(a)) for a in [i * math.pi / 6 for i in range(12)]]))
    rings = [plane_solid(list(ring.exterior.coords)[:-1], [list(r.coords)[:-1] for r in ring.interiors],
                         (*P(S0 + 0.9 + 0.78 * i, to), Z_P + 0.52), U, 0.02) for i in range(int((S1 - S0 - 1.2) / 0.78))]
    m.element('IfcRailing', f'Barandilla de anillos — {label}', rails + bars + rings, storey, 'bronze_l', predefined='BALUSTRADE',
              object_type='Steel balustrade with ring motif, H 1 020', src=PHOTO_SRC,
              psets={**spec(Height_mm=1020, InfillGap_mm=106), **am('platform', 12, 4)})
    if sign < 0:
        return
    for k, (a, b) in enumerate(zip(BAYS[:11], BAYS[1:11]), 1):        # north side: glazed poster frames above it
        if k % 2: continue
        m.element('IfcPlate', f'Panel publicitario {k // 2} — {label}', sbox(a + 0.25, b - 0.25, to - 0.02, to + 0.02, Z_P + 1.05, 1.15),
                  storey, 'glass', predefined='SHEET', object_type='Glazed poster frame, backlit', src=PHOTO_SRC, psets=am('furniture', 12, 4))
        m.element('IfcMember', f'Marco del panel {k // 2} — {label}',
                  [sbox(a + 0.22, b - 0.22, to - 0.03, to + 0.03, Z_P + z, 0.04) for z in (1.02, 2.20)] +
                  [sbox(x - 0.02, x + 0.02, to - 0.03, to + 0.03, Z_P + 1.02, 1.22) for x in (a + 0.24, b - 0.24)],
                  storey, 'frame_l', predefined='MULLION', object_type='Aluminium poster frame', src=PHOTO_SRC, psets=am('furniture', 12, 4))


balustrade(PN, 1, 'norte')
balustrade(PS, -1, 'sur')


def handrail(storey, sign, label, s0, s1):
    t = sign * (T_IN + 0.42)
    posts = [scyl(s, t, Z_P, 0.022, 0.95) for s in [s0 + 0.1 + 1.5 * i for i in range(int((s1 - s0 - 0.2) / 1.5) + 1)] + [s1 - 0.1]]
    bars = [rod(p3(s0 + 0.1, t, Z_P + 0.95), p3(s1 - 0.1, t, Z_P + 0.95), 0.025),
            rod(p3(s0 + 0.1, t, Z_P + 0.55), p3(s1 - 0.1, t, Z_P + 0.55), 0.016)]
    m.element('IfcRailing', f'Pasamanos dorado — {label}', posts + bars, storey, 'brass', predefined='HANDRAIL',
              object_type='Stainless handrail Ø50, champagne PVD, H 950', src=PHOTO_SRC,
              psets={**spec(Height_mm=950, Purpose='Keeps passengers off the platform edge on the set-down side'), **am('platform', 12, 5)})


handrail(PN, 1, 'norte', S0 + 3.0, S1 - 0.2)
handrail(PS, -1, 'sur', S1 - 4.5, S1 - 0.2)

# ─── Platform furniture and information ────────────────────────────────────────────────────────────
POTS = [s + 0.55 for s in BAYS[1:10]]


def furniture(storey, sign, label):
    for k, s in enumerate((6.6, 23.5), 1):
        tb = sign * 3.45
        seat = [sbox(s - 0.9, s + 0.9, tb - 0.2 + d, tb - 0.2 + d + 0.09, Z_P + 0.43, 0.03) for d in (0.0, 0.13, 0.26)]
        seat += [sbox(s - 0.9, s + 0.9, tb + sign * 0.22 - 0.02, tb + sign * 0.22 + 0.02, Z_P + 0.55 + dz, 0.08) for dz in (0.0, 0.14)]
        m.element('IfcFurniture', f'Banco {k} — {label}', seat, storey, 'wood', predefined='USERDEFINED',
                  object_type='Platform bench, 3 seats', src=TYP_SRC, psets={**spec(Seats=3, Material='Ash slats on steel frame'), **am('furniture', 6, 4)})
        m.element('IfcMember', f'Bastidor del banco {k} — {label}',
                  [sbox(x - 0.03, x + 0.03, tb - 0.2, tb + 0.2, Z_P, 0.43) for x in (s - 0.75, s, s + 0.75)] +
                  [sbox(x - 0.02, x + 0.02, tb + sign * 0.22 - 0.02, tb + sign * 0.22 + 0.02, Z_P + 0.43, 0.35) for x in (s - 0.75, s + 0.75)],
                  storey, 'stainless', predefined='MEMBER', object_type='Bench frame, stainless', src=TYP_SRC, psets=am('furniture', 6, 4))
    pots, leaves, flowers = [], [], []
    t = sign * (T_COL - 0.42)
    for k, s in enumerate(POTS):
        pots.append(m.revolve([(0, 0), (0.15, 0), (0.21, 0.30), (0.19, 0.30), (0.0, 0.30)], *P(s, t), Z_P))
        leaves.append(m.revolve(Model.dome_profile(0.25, 0.32 + 0.1 * hash01(k, sign), n=5), *P(s, t), Z_P + 0.29))
        for j in range(3):
            a = j * 2 * math.pi / 3 + hash01(k, j)
            x, y = P(s + 0.15 * math.cos(a), t + 0.15 * math.sin(a))
            flowers.append(m.box(x, y, Z_P + 0.50 + 0.08 * hash01(j, k), 0.08, 0.08, 0.05, angle=a))
    m.element('IfcFurniture', f'Macetas — {label}', pots, storey, 'terracotta', predefined='USERDEFINED',
              object_type='Glazed terracotta planters Ø420', src=PHOTO_SRC, psets={**spec(Count=len(pots)), **am('furniture', 6, 4)})
    m.element('IfcGeographicElement', f'Plantas en maceta — {label}', leaves, storey, 'foliage', predefined='VEGETATION', object_type='Potted shrubs',
              src=PHOTO_SRC, psets={'Pset_CDE_Vegetation': {'Species': 'Mixed (azalea, rose, pansy)', 'Plants': len(leaves)}, **am('furniture', 3, 5)})
    m.element('IfcGeographicElement', f'Flores — {label}', flowers, storey, 'bloom' if sign > 0 else 'bloom_y', predefined='VEGETATION',
              object_type='Seasonal blooms', src=PHOTO_SRC, psets=am('furniture', 3, 5))
    for k, s in enumerate((BAYS[2], BAYS[6]), 1):
        t = sign * (T_COL - 0.11)
        m.element('IfcSign', f'Plano de línea y horarios {k} — {label}', sbox(s - 0.40, s + 0.40, t - 0.02, t + 0.02, Z_P + 0.8, 1.25), storey,
                  'white', predefined='PICTORAL', object_type='Route map and timetable board 800 × 1 250', src=PHOTO_SRC,
                  psets={**spec(Content='Line map SA-01–SA-30, timetable, fares'), **am('signage', 12, 4)})
        m.element('IfcSign', f'Franja rosa del tablón {k} — {label}', sbox(s - 0.40, s + 0.40, t - 0.024, t + 0.024, Z_P + 1.92, 0.13), storey,
                  'pink', predefined='MARKER', object_type='Line colour band', src=PHOTO_SRC, psets=am('signage', 24, 5))
    md, zb, tb = (BAYS[3] + BAYS[4]) / 2, ZC - 0.05, sign * 2.45      # hung across the platform, read along it
    m.element('IfcAudioVisualAppliance', f'Pantalla de próximas salidas — {label}',
              [sbox(md - 0.06, md + 0.06, tb - 0.60, tb + 0.60, zb - 0.30, 0.30)] +
              [sbox(md - 0.015, md + 0.015, x - 0.015, x + 0.015, zb, CROWN - 0.2 - zb) for x in (tb - 0.48, tb + 0.48)],
              storey, 'black', predefined='DISPLAY', object_type='LED departure board, double-sided', src=TYP_SRC,
              psets={**spec(Resolution='192×32', Languages='ja/en', Feed='Real-time arrivals'), **am('equipment', 6, 4, FirmwareVersion='4.2.1')})
    m.element('IfcAudioVisualAppliance', f'Matriz LED de la pantalla — {label}', sbox(md - 0.064, md + 0.064, tb - 0.54, tb + 0.54, zb - 0.26, 0.20),
              storey, 'led', predefined='DISPLAY', object_type='LED matrix faces, amber', src=TYP_SRC, psets=am('equipment', 6, 4))
    for k, s in enumerate((BAYS[1], BAYS[8]), 1):
        dome = [(0, 0), (0.09, 0), (0.09, -0.03), (0.075, -0.07), (0.04, -0.095), (0, -0.10)]
        m.element('IfcAudioVisualAppliance', f'Cámara CCTV {k} — {label}', m.revolve(dome, *P(s, sign * 1.58), ZC - 0.12),
                  storey, 'white', predefined='CAMERA', object_type='Dome camera 4 MP, IR', src=TYP_SRC,
                  psets={**spec(Resolution='4 MP', Coverage='Platform edge'), **am('equipment', 6, 5)})
        ts = sign * (T_COL - 0.25)
        m.element('IfcAudioVisualAppliance', f'Altavoz {k} — {label}', sbox(s + 2.85, s + 3.15, ts - 0.1, ts + 0.1, ZC - 0.35, 0.22),
                  storey, 'white', predefined='SPEAKER', object_type='Horn speaker 15 W', src=TYP_SRC, psets=am('equipment', 12, 4))
    cx, cy = P(BAYS[5], sign * (T_COL - 0.12))
    m.element('IfcAlarm', f'Pulsador de emergencia — {label}', m.box(cx, cy, Z_P + 1.2, 0.16, 0.08, 0.22, angle=ANG), storey, 'red',
              predefined='BREAKGLASSBUTTON', object_type='Emergency stop call point', src=TYP_SRC,
              psets={**spec(Function='Stops approaching trams, calls operations centre'), **am('equipment', 3, 5)})


furniture(PN, 1, 'norte')
furniture(PS, -1, 'sur')

# ─── Signage, with real lettering ──────────────────────────────────────────────────────────────────


def hanging_board(storey, s, t, name, lines, w=1.5, h=0.46):
    """A double-sided sign hung across the platform: white panel, pink band, lettering on both faces."""
    z_top = CROWN - 0.20
    z0 = z_top - 0.30 - h
    a = m.assembly(name, storey, object_type='Hanging direction sign (案内標)',
                   psets={**spec(Text=' / '.join(l[0] for l in lines), Illuminated=True), **am('signage', 12, 5)})
    m.element('IfcSign', f'Panel — {name}', sbox(s - 0.03, s + 0.03, t - w / 2, t + w / 2, z0, h), storey, 'white', predefined='PICTORAL',
              object_type=f'Sign panel {int(w * 1000)} × {int(h * 1000)}', parent=a, src=PHOTO_SRC, psets=am('signage', 12, 5))
    m.element('IfcSign', f'Franja — {name}', sbox(s - 0.034, s + 0.034, t - w / 2, t + w / 2, z0, 0.09), storey, 'pink', predefined='MARKER',
              object_type='Line colour band', parent=a, src=PHOTO_SRC, psets=am('signage', 24, 5))
    m.element('IfcMember', f'Cuelgues — {name}', [scyl(s, t + d, z0 + h, 0.008, z_top - z0 - h) for d in (-w / 2 + 0.12, w / 2 - 0.12)],
              storey, 'stainless', predefined='MEMBER', object_type='Suspension rods M8', parent=a, src=PHOTO_SRC, psets=am('signage', 24, 4))
    ink = []
    for fc in (1, -1):
        for text, hh, zz, wt in lines:
            ink += lettering(text, hh, s + fc * 0.03, t, z0 + zz, fc, weight=wt, depth=0.004)
    m.element('IfcSign', f'Rotulación — {name}', ink, storey, 'ink', predefined='PICTORAL', object_type='Cut vinyl lettering',
              parent=a, src=PHOTO_SRC, psets=am('signage', 24, 5))


hanging_board(PS, BAYS[2] + 1.7, -2.65, '案内 三ノ輪橋方面 · For Minowabashi (sur)',
              [('三ノ輪橋 方面', 0.15, 0.24, 'Bold'), ('for Minowabashi', 0.065, 0.13, 'Medium')])
hanging_board(PN, BAYS[8] + 1.7, 2.65, '案内 出口 · Exit (norte)', [('出口 Exit', 0.16, 0.20, 'Bold')], w=1.1)


def name_board(storey, s, sign, label):
    """Station name board (駅名標) parallel to the track on the outer side, facing the track."""
    t = sign * (T_COL - 0.18)
    fc = 'S' if sign > 0 else 'N'
    z0 = Z_P + 1.65
    tag = f'{label} s={s:.0f}'
    a = m.assembly(f'Letrero de parada 早稲田 — {tag}', storey, object_type='Station name board (駅名標)',
                   psets={**spec(Text='早稲田 Waseda SA-30 / next: 面影橋 Omokagebashi SA-29', Illuminated=True), **am('signage', 12, 5)})
    m.element('IfcSign', f'Panel 早稲田 — {tag}', sbox(s - 0.9, s + 0.9, t - 0.025, t + 0.025, z0, 0.62), storey, 'white',
              predefined='PICTORAL', object_type='Name board 1 800 × 620, internally lit', parent=a, src=PHOTO_SRC, psets=am('signage', 12, 5))
    m.element('IfcSign', f'Franja 面影橋 — {tag}', sbox(s - 0.9, s + 0.9, t - 0.029, t + 0.029, z0, 0.15), storey, 'pink',
              predefined='MARKER', object_type='Line colour band with next stop', parent=a, src=PHOTO_SRC, psets=am('signage', 24, 5))
    ink = lettering('早稲田', 0.24, s, t - sign * 0.029, z0 + 0.30, fc, weight='Bold', spacing=0.05)
    ink += lettering('Waseda', 0.075, s, t - sign * 0.029, z0 + 0.19, fc, weight='Medium')
    m.element('IfcSign', f'Rotulación 早稲田 — {tag}', ink, storey, 'ink', predefined='PICTORAL',
              object_type='Cut vinyl lettering', parent=a, src=PHOTO_SRC, psets=am('signage', 24, 5))
    # the next stop, Omokagebashi, is to the west: an arrow on the side the reader sees as west
    nxt = '← 面影橋 Omokagebashi' if sign > 0 else '面影橋 Omokagebashi →'
    m.element('IfcSign', f'Rotulación 面影橋 — {tag}', lettering(nxt, 0.065, s, t - sign * 0.033, z0 + 0.045, fc, weight='Medium'),
              storey, 'white', predefined='PICTORAL', object_type='Next stop lettering', parent=a, src=PHOTO_SRC, psets=am('signage', 24, 5))
    m.element('IfcMember', f'Postes del letrero — {tag}', [scyl(x, t + sign * 0.06, Z_P, 0.035, 2.3) for x in (s - 0.8, s + 0.8)],
              storey, 'bronze', predefined='POST', object_type='Sign post Ø70', parent=a, src=PHOTO_SRC, psets=am('signage', 24, 4))


name_board(PN, 13.45, 1, 'norte')
name_board(PS, 13.45, -1, 'sur')
name_board(PS, 26.95, -1, 'sur')

cs = BAYS[9] + 0.8
m.element('IfcAudioVisualAppliance', 'Reloj de andén', [disc(p3(cs, 2.4, ZC - 0.35), v3(1, 0, 0), 0.20, 0.07),
                                                        scyl(cs, 2.4, ZC - 0.15, 0.01, CROWN - ZC - 0.1)],
          PN, 'green', predefined='USERDEFINED', object_type='Double-sided station clock Ø400', src=PHOTO_SRC,
          psets={**spec(Sync='GPS'), **am('equipment', 12, 5)})
m.element('IfcAudioVisualAppliance', 'Esferas del reloj', [disc(p3(cs + d * 0.037, 2.4, ZC - 0.35), v3(1, 0, 0), 0.17, 0.004) for d in (1, -1)],
          PN, 'white', predefined='USERDEFINED', object_type='Clock faces', src=PHOTO_SRC, psets=am('equipment', 12, 5))
hands = []
for d in (1, -1):
    c = p3(cs + d * 0.040, 2.4, ZC - 0.35)
    hands += [obox(tuple(ci + di * 0.06 for ci, di in zip(c, v3(0, math.cos(1.2), math.sin(1.2)))), v3(0, math.cos(1.2), math.sin(1.2)), v3(1, 0, 0), 0.12, 0.012, 0.003),
              obox(tuple(ci + di * 0.07 for ci, di in zip(c, v3(0, math.cos(-0.5), math.sin(-0.5)))), v3(0, math.cos(-0.5), math.sin(-0.5)), v3(1, 0, 0), 0.14, 0.008, 0.003)]
m.element('IfcAudioVisualAppliance', 'Agujas del reloj', hands, PN, 'ink', predefined='USERDEFINED', object_type='Clock hands',
          src=PHOTO_SRC, psets=am('equipment', 12, 5))

# ─── Concourse ─────────────────────────────────────────────────────────────────────────────────────
hall = m.assembly('Vestíbulo · Concourse', HALL, object_type='Concourse floor')
m.element('IfcSlab', 'Losa del vestíbulo', lsec([(S1, -0.30), (S_ST, -0.30), (S_ST, Z_ST - 0.03), (S1, Z_P - 0.06)], -HALL_T, HALL_T),
          HALL, 'concrete', predefined='USERDEFINED', object_type='Concourse slab, falling 1:15 to the street', parent=hall, src=OSM_SRC,
          psets=am('platform', 24, 4))
m.element('IfcWall', 'Muro de fondo de la trinchera', sbox(S1 - 0.25, S1, -T_IN, T_IN, -0.30, Z_P + 0.24), HALL, 'concrete',
          predefined='RETAININGWALL', object_type='Trench end wall', parent=hall, src=PHOTO_SRC, psets=am('platform', 24, 4))
m.element('IfcCovering', 'Pavimento de ladrillo del vestíbulo', lsec([(S1, Z_P - 0.06), (S_ST, Z_ST - 0.03), (S_ST, Z_ST), (S1, Z_P)], -HALL_T, HALL_T),
          HALL, 'brick', predefined='FLOORING', object_type='Clay brick pavers 200×100', parent=hall, src=PHOTO_SRC, psets=am('platform', 12, 4))


def sloped_cell(s0, s1, t0, t1, lift, h):
    return lsec([(s0, zf(s0) + lift), (s1, zf(s1) + lift), (s1, zf(s1) + lift + h), (s0, zf(s0) + lift + h)], t0, t1)


dark, lite, dk, lt = [], [], [], []
for j in range(int(2 * HALL_T / 0.20)):
    t0 = -HALL_T + j * 0.20
    s = S1 + (0.2 if j % 2 else 0.)
    while s < S_ST - 1.6:
        r = hash01(s, t0, 7)
        if r < 0.28 or r > 0.80:
            (dark if r < 0.28 else lite).append(sloped_cell(s + 0.005, s + 0.395, t0 + 0.005, t0 + 0.195, 0., 0.003))
        s += 0.40
for i in range(4):                       # the band of dark and light granite setts at the street edge
    for j in range(int(2 * HALL_T / 0.30)):
        s0 = S_ST - 1.50 + i * 0.30; t0 = -HALL_T + j * 0.30
        (dk if (i + j) % 2 else lt).append(sloped_cell(s0 + 0.004, s0 + 0.296, t0 + 0.004, t0 + 0.296, 0., 0.004))
m.element('IfcCovering', 'Ladrillos oscuros del vestíbulo', dark, HALL, 'brick_d', predefined='FLOORING', object_type='Flashed brick pavers',
          parent=hall, src=PHOTO_SRC, psets=am('platform', 12, 4))
m.element('IfcCovering', 'Ladrillos claros del vestíbulo', lite, HALL, 'brick_l', predefined='FLOORING', object_type='Light brick pavers',
          parent=hall, src=PHOTO_SRC, psets=am('platform', 12, 4))
m.element('IfcCovering', 'Banda de adoquín oscuro', dk, HALL, 'tile_dk', predefined='FLOORING', object_type='Granite setts 300×300, dark',
          parent=hall, src=PHOTO_SRC, psets=am('platform', 24, 5))
m.element('IfcCovering', 'Banda de adoquín claro', lt, HALL, 'tile_lt', predefined='FLOORING', object_type='Granite setts 300×300, light',
          parent=hall, src=PHOTO_SRC, psets=am('platform', 24, 5))
tac = [sloped_cell(S1, S_ST - 0.1, tg_ - 0.15, tg_ + 0.15, 0.004, 0.006) for tg_ in (3.1, -3.1)]
tac.append(sloped_cell(S1 + 0.05, S1 + 0.35, -T_IN - 0.3, T_IN + 0.3, 0.004, 0.006))
tac.append(sloped_cell(S_ST - 0.42, S_ST - 0.12, -HALL_T + 0.1, HALL_T - 0.1, 0.004, 0.006))
m.element('IfcCovering', 'Pavimento táctil del vestíbulo', tac, HALL, 'tactile', predefined='FLOORING',
          object_type='Tactile guidance and warning paving (JIS T 9251)', parent=hall, src=PHOTO_SRC, psets=am('platform', 6, 4))

# concourse roof between the two canopies, over the trench end and the buffer
sh_c = [(-1.44, ZC + 0.10), (-0.6, ZC + 0.24), (0., ZC + 0.27), (0.6, ZC + 0.24), (1.44, ZC + 0.10)]
roof_c = m.assembly('Cubierta del vestíbulo · Concourse roof', HALL, object_type='Concourse roof')
mid_c, len_c = (SE + S_CB) / 2, S_CB - SE
m.element('IfcRoof', 'Cubierta central del vestíbulo', plane_solid(band(sh_c, -0.025, 0.025), None, (*P(mid_c, 0), 0.), N, len_c),
          HALL, 'bronze', predefined='BARREL_ROOF', object_type='Curved metal roof shell', parent=roof_c, src=PHOTO_SRC, psets=am('canopy', 12, 4))
m.element('IfcCovering', 'Falso techo del vestíbulo', plane_solid(band(sh_c, 0.15, 0.17), None, (*P(mid_c, 0), 0.), N, len_c - 0.1),
          HALL, 'cream', predefined='CEILING', object_type='Ceiling panels, cream', parent=roof_c, src=PHOTO_SRC, psets=am('canopy', 24, 4))
m.element('IfcBeam', 'Costillas del vestíbulo', [plane_solid(band(sh_c, 0.0, 0.24), None, (*P(s, 0), 0.), N, 0.08)
                                                 for s in [SE + 0.3 + 1.7 * k for k in range(int(len_c / 1.7) + 1)]],
          HALL, 'bronze_l', predefined='BEAM', object_type='Curved rib 80 × 240', parent=roof_c, src=PHOTO_SRC, psets=am('canopy', 12, 4))

# ─── Entrance portal ───────────────────────────────────────────────────────────────────────────────
portal = m.assembly('Pórtico de entrada · Entrance portal', HALL, object_type='Entrance portal',
                    psets=spec(Structure='Steel frame, aluminium cladding', Width_m=round(2 * (HALL_T + 0.15), 2)))
D_P = 0.90                                   # portal depth along s
PT, PB, PTOP, R_SH = HALL_T + 0.15, ZC - 0.05, ZC + 0.95, 1.00
fascia = ([(-PT, PB), (PT, PB)] + arc(PT - R_SH, PTOP - R_SH, R_SH, 0., math.pi / 2, 10)
          + arc(-PT + R_SH, PTOP - R_SH, R_SH, math.pi / 2, math.pi, 10))
m.element('IfcBeam', 'Frontis del pórtico', plane_solid(fascia, None, (*P(S_PORT, 0), 0.), N, D_P), HALL, 'bronze',
          predefined='USERDEFINED', object_type='Portal fascia with rounded shoulders, clad', parent=portal, src=PHOTO_SRC,
          psets=am('canopy', 12, 4))
CR_W, CR_H = 2.35, 1.85
crest = arc(0., PTOP - 0.02, 1., 0., math.pi, 24)
crest = [(CR_W * x, PTOP - 0.02 + CR_H * (z - PTOP + 0.02)) for x, z in crest]
m.element('IfcBeam', 'Cresta del pórtico', plane_solid(crest, None, (*P(S_PORT - 0.05, 0), 0.), N, D_P - 0.1), HALL, 'bronze',
          predefined='USERDEFINED', object_type='Arched crest carrying the name board', parent=portal, src=PHOTO_SRC, psets=am('canopy', 12, 4))
m.element('IfcColumn', 'Pilares del pórtico', [sbox(S_PORT - 0.25, S_PORT + 0.25, sg * HALL_T - 0.25, sg * HALL_T + 0.25, -0.30, PB + 0.35) for sg in (1, -1)],
          HALL, 'bronze', predefined='COLUMN', object_type='Portal columns 500 × 500, clad', parent=portal, src=PHOTO_SRC, psets=am('canopy', 12, 4))
GL0, GL1, GW = PB + 0.13, PB + 0.62, PT - 0.75
for face, nm in ((1, 'calle'), (-1, 'andenes')):
    sf = S_PORT + face * (D_P / 2 + 0.004)
    m.element('IfcPlate', f'Vidrio del lucernario — {nm}', sbox(sf - 0.004, sf + 0.004, -GW, GW, GL0, GL1 - GL0), HALL, 'glass_cl',
              predefined='SHEET', object_type='Clerestory glazing, grey laminated', parent=portal, src=PHOTO_SRC, psets=am('canopy', 24, 4))
    mull = [sbox(sf - 0.012, sf + 0.012, x - 0.025, x + 0.025, GL0, GL1 - GL0) for x in [-GW + i * GW / 4 for i in range(9)]]
    mull += [sbox(sf - 0.012, sf + 0.012, -GW - 0.03, GW + 0.03, z, 0.035) for z in (GL0 - 0.035, GL1)]
    m.element('IfcMember', f'Montantes del lucernario — {nm}', mull, HALL, 'frame_l', predefined='MULLION',
              object_type='Aluminium mullions and transoms', parent=portal, src=PHOTO_SRC, psets=am('canopy', 24, 4))

# the crest's name board (2022 rebranding): white, the pink band with «Waseda», the SA-30 mark, 早稲田 and the operator
sb = S_PORT + D_P / 2 - 0.05
nb = m.assembly('Rótulo del pórtico 早稲田 · Portal name board', HALL, object_type='Station name board on the portal',
                psets={**spec(Text='東京さくらトラム SA30 早稲田 Waseda', Illuminated=True, Installed='2022 rebranding'), **am('signage', 12, 5)})
BW, B0, BH = 1.85, PTOP + 0.12, 1.15
board = Polygon([(-BW, B0), (BW, B0), (BW, B0 + BH - 0.12), (BW - 0.12, B0 + BH), (-BW + 0.12, B0 + BH), (-BW, B0 + BH - 0.12)])
m.element('IfcSign', 'Panel blanco del pórtico', plane_shapes([board], sb, 0., 1, 0.03), HALL, 'white', predefined='PICTORAL',
          object_type='Name board 3 700 × 1 150, internally lit', parent=nb, src=PHOTO_SRC, psets=am('signage', 12, 5))
m.element('IfcSign', 'Franja rosa del pórtico', plane_shapes([Polygon([(-BW, B0), (BW, B0), (BW, B0 + 0.27), (-BW, B0 + 0.27)])], sb + 0.03, 0., 1, 0.004),
          HALL, 'pink', predefined='MARKER', object_type='Sakura Tram band', parent=nb, src=PHOTO_SRC, psets=am('signage', 24, 5))
m.element('IfcSign', 'Rótulo «Waseda»', lettering('Waseda', 0.15, sb + 0.034, 0., B0 + 0.07, 1, weight='Bold'), HALL, 'white',
          predefined='PICTORAL', object_type='Cut lettering, white', parent=nb, src=PHOTO_SRC, psets=am('signage', 24, 5))
m.element('IfcSign', 'Rótulo «早稲田»', lettering('早稲田', 0.40, sb + 0.03, 0.42, B0 + 0.43, 1, weight='Bold', spacing=0.06), HALL, 'ink',
          predefined='PICTORAL', object_type='Cut lettering, black', parent=nb, src=PHOTO_SRC, psets=am('signage', 24, 5))
m.element('IfcSign', 'Rótulo «東京さくらトラム»', lettering('東京さくらトラム', 0.07, sb + 0.03, -1.10, B0 + 0.97, 1, weight='Medium'), HALL, 'ink',
          predefined='PICTORAL', object_type='Operator lettering', parent=nb, src=PHOTO_SRC, psets=am('signage', 24, 5))
for k, v in stop_mark(sb + 0.03, -0.95, B0 + 0.60, 0.27, 1).items():
    m.element('IfcSign', f'Marca SA-30 ({ {"pink": "disco", "white": "flor", "ink": "texto"}[k] })', v, HALL, k, predefined='PICTORAL',
              object_type='SA-30 stop-number mark', parent=nb, src=PHOTO_SRC, psets=am('signage', 24, 5))

# ─── Concourse equipment ───────────────────────────────────────────────────────────────────────────
ap = (SE + 1.3, 0.0)                         # central anchor pole, through the concourse roof
m.element('IfcMember', 'Poste de anclaje central', [m.revolve([(0, 0), (0.24, 0), (0.16, 9.6), (0, 9.6)], *P(*ap), zf(ap[0])),
                                                    disc(p3(ap[0], 0, 9.62), (0, 0, 1), 0.17, 0.04)],
          OCS, 'pole', predefined='POST', object_type='Spun concrete anchor pole Ø480/320, H 9 600', src=PHOTO_SRC,
          psets={**spec(Height_mm=9600, Function='Terminates the contact and messenger wires'), **am('ocs', 12, 4, EarthingResistance_ohm=2.7)})
m.element('IfcCableCarrierSegment', 'Conductos naranja del poste', [scyl(ap[0] + 0.27 * math.cos(a), 0.27 * math.sin(a), zf(ap[0]), 0.025, 6.5) for a in (2.7, 3.1, 3.5)],
          OCS, 'orange', predefined='CONDUITSEGMENT', object_type='Cable conduits Ø50, orange', src=PHOTO_SRC, psets=am('ocs', 12, 4))
zc_ = zf(ap[0] + 0.6)
m.element('IfcCommunicationsAppliance', 'Armario de señalización del vestíbulo',
          [sbox(ap[0] + 0.3, ap[0] + 0.9, -0.55, 0.55, zc_, 1.45), sbox(ap[0] + 0.28, ap[0] + 0.92, -0.58, 0.58, zc_ + 1.45, 0.05)],
          LINE, 'white', predefined='LINESIDEELECTRONICUNIT', object_type='Signalling and point-control cabinet', src=PHOTO_SRC,
          psets={**spec(IP='IP54', Power='100 V AC + UPS 2 h'), **am('equipment', 6, 4)})

VEND = [('vend_red', 'Hot and cold drinks', 31.58), ('vend_white', 'Water and tea', 32.60), ('vend_blue', 'Sports drinks', 33.62),
        ('vend_red', 'Coffee', 34.97)]
for k, (mat, what, s0) in enumerate(VEND, 1):
    z0, t0 = zf(s0 + 1.0), -HALL_T + 0.05
    a = m.assembly(f'Máquina expendedora {k}', HALL, object_type='Drink vending machine',
                   psets={**spec(Power_W=450, Payment='Cash, IC card (Suica/PASMO)', Content=what), **am('furniture', 1, 4)})
    tf = t0 + 0.72                           # front face; the display sits 10 cm back in a recess
    body = [sbox(s0, s0 + 1.0, t0, tf, z0, 0.95), sbox(s0, s0 + 1.0, t0, tf, z0 + 1.75, 0.08), sbox(s0, s0 + 1.0, t0, tf - 0.10, z0 + 0.95, 0.80),
            sbox(s0, s0 + 0.06, tf - 0.10, tf, z0 + 0.95, 0.80), sbox(s0 + 0.94, s0 + 1.0, tf - 0.10, tf, z0 + 0.95, 0.80),
            sbox(s0 - 0.01, s0 + 1.01, t0, tf + 0.02, z0 + 1.83, 0.06)]
    m.element('IfcElectricAppliance', f'Mueble expendedora {k}', body, HALL, mat, predefined='VENDINGMACHINE',
              object_type='Vending cabinet 1 000 × 720 × 1 830', parent=a, src=PHOTO_SRC, psets=am('furniture', 1, 4))
    m.element('IfcElectricAppliance', f'Escaparate expendedora {k}', sbox(s0 + 0.06, s0 + 0.94, tf - 0.10, tf - 0.09, z0 + 0.95, 0.80), HALL, 'display',
              predefined='VENDINGMACHINE', object_type='Backlit display window', parent=a, src=PHOTO_SRC, psets=am('furniture', 1, 4))
    cans = {'can_a': [], 'can_b': [], 'can_c': []}
    for row in range(3):
        for col in range(8):
            cans[('can_a', 'can_b', 'can_c')[int(hash01(k, row, col) * 3)]].append(
                scyl(s0 + 0.12 + col * 0.108, tf - 0.05, z0 + 1.0 + row * 0.25, 0.032, 0.17))
    for key, items in cans.items():
        if items:
            m.element('IfcElectricAppliance', f'Muestras {key[-1].upper()} expendedora {k}', items, HALL, key, predefined='VENDINGMACHINE',
                      object_type='Product dummies', parent=a, src=TYP_SRC, psets=am('furniture', 1, 4))
    m.element('IfcElectricAppliance', f'Panel de pago y bandeja {k}', [sbox(s0 + 0.70, s0 + 0.90, tf, tf + 0.03, z0 + 0.55, 0.35),
                                                                     sbox(s0 + 0.12, s0 + 0.62, tf, tf + 0.05, z0 + 0.18, 0.22)],
              HALL, 'black', predefined='VENDINGMACHINE', object_type='Coin/IC unit and dispensing tray', parent=a, src=TYP_SRC, psets=am('furniture', 1, 4))
m.element('IfcFurniture', 'Papeleras de reciclaje', [sbox(s, s + 0.26, -HALL_T + 0.1, -HALL_T + 0.5, zf(s + 0.26), 0.9) for s in (36.02, 36.31)],
          HALL, 'galv', predefined='USERDEFINED', object_type='Can and bottle recycling bins', src=TYP_SRC, psets=am('furniture', 1, 4))

# ─── Parked bicycles on the sidewalk by the portal (in every photograph): context, not assets ──────
bikes = m.assembly('Bicicletas aparcadas · Parked bicycles (context)', HALL, object_type='Context objects')


def bicycle(k, s, t, mat):
    zg = min(gst(s, t), gst(s + 1.1, t))

    def Q(x, y, z):              # x along the bike from the rear contact point, y lateral, on the sidewalk's ground
        return p3(s + x, t + y, z + zg)
    ax = v3(0, 1, 0)
    a = m.assembly(f'Bicicleta aparcada {k}', None, object_type='Parked bicycle (context)', parent=bikes,
                   psets={'Pset_CDE_Context': {'Note': 'Context only, not a managed asset', 'Type': 'City bicycle (mamachari)'}})
    fr = [rod(Q(0.45, 0, 0.30), Q(0.95, 0, 0.75), 0.018), rod(Q(0.45, 0, 0.30), Q(0.38, 0, 0.82), 0.018),
          rod(Q(1.02, 0, 0.88), Q(1.10, 0, 0.34), 0.016), rod(Q(0.95, 0, 0.75), Q(1.02, 0, 0.88), 0.02)]
    for y in (-0.035, 0.035):
        fr += [rod(Q(0.45, y, 0.30), Q(0.0, y * 1.5, 0.33), 0.010), rod(Q(0.38, y, 0.78), Q(0.0, y * 1.5, 0.33), 0.010)]
    fr += [rod(Q(1.02, -0.28, 1.02), Q(1.02, 0.28, 1.02), 0.011), rod(Q(1.02, 0, 0.88), Q(1.02, 0, 1.02), 0.012),
           obox(Q(0.15, 0, 0.75), v3(1, 0, 0), ax, 0.38, 0.16, 0.012)]
    m.element('IfcBuildingElementProxy', f'Cuadro bicicleta {k}', fr, None, mat, predefined='USERDEFINED',
              object_type='Step-through steel frame, rear rack', parent=a, src=TYP_SRC)
    m.element('IfcBuildingElementProxy', f'Ruedas bicicleta {k}', [disc(Q(x, 0, 0.33), ax, 0.33, 0.04, r_in=0.30) for x in (0.0, 1.10)],
              None, 'tyre', predefined='USERDEFINED', object_type='26" tyres', parent=a, src=TYP_SRC)
    sp = []
    for x in (0.0, 1.10):
        c = Q(x, 0, 0.33)
        sp += [disc(c, ax, 0.30, 0.02, r_in=0.285), disc(c, ax, 0.04, 0.09)]
        sp += [obox(tuple(ci + di * 0.15 for ci, di in zip(c, d)), d, ax, 0.29, 0.003, 0.003)
               for d in [v3(math.cos(i * math.pi / 8), 0, math.sin(i * math.pi / 8)) for i in range(8)]]
    m.element('IfcBuildingElementProxy', f'Llantas y radios bicicleta {k}', sp, None, 'stainless', predefined='USERDEFINED',
              object_type='Rims, spokes and hubs', parent=a, src=TYP_SRC)
    bsk = [obox(Q(1.25, 0, 0.92), v3(1, 0, 0), ax, 0.30, 0.38, 0.01)]
    bsk += [obox(Q(1.25, y, 1.01), v3(1, 0, 0), (0, 0, 1), 0.30, 0.18, 0.006) for y in (-0.19, 0.19)]
    bsk += [obox(Q(x, 0, 1.01), ax, (0, 0, 1), 0.38, 0.18, 0.006) for x in (1.10, 1.40)]
    bsk.append(obox(Q(0.38, 0, 0.86), v3(1, 0, 0), ax, 0.26, 0.15, 0.06))
    m.element('IfcBuildingElementProxy', f'Cesta y sillín bicicleta {k}', bsk, None, 'black', predefined='USERDEFINED',
              object_type='Front basket and saddle', parent=a, src=TYP_SRC)


for k in range(7):
    bicycle(k + 1, S_ST + 0.45, -HALL_T - 0.55 - 0.62 * k + (0.08 if k % 2 else 0.), ('bike_s', 'bike_b', 'bike_w')[k % 3])
for k in range(4):
    bicycle(k + 8, S_ST + 0.45, HALL_T + 0.75 + 0.62 * k, ('bike_w', 'bike_s', 'bike_b')[k % 3])
m.element('IfcSign', 'Señal 駐輪禁止 · No bicycle parking', [scyl(S_ST + 0.3, HALL_T + 0.3, gst(S_ST + 0.3, HALL_T + 0.3) - 0.05, 0.02, 1.65),
                                                            sbox(S_ST + 0.28, S_ST + 0.32, HALL_T + 0.1, HALL_T + 0.5, gst(S_ST + 0.3, HALL_T + 0.3) + 1.15, 0.45)],
          HALL, 'white', predefined='PICTORAL', object_type='No bicycle parking sign', src=PHOTO_SRC, psets=am('signage', 24, 4))

# ─── Planting ──────────────────────────────────────────────────────────────────────────────────────
for k, (s, t) in enumerate(((-6.2, 5.0), (-6.2, -5.0)), 1):
    storey = PN if t > 0 else PS
    cx, cy = P(s, t)
    m.element('IfcFurniture', f'Jardinera {k}', m.box(cx, cy, G((cx, cy)) - 0.05, 2.2, 0.9, 0.60, angle=ANG), storey, 'precast',
              predefined='USERDEFINED', object_type='Planter 2 200×900', src=TYP_SRC, psets=am('furniture', 6, 4))
    m.element('IfcGeographicElement', f'Rosales {k}', [m.revolve(Model.dome_profile(0.42, 0.55, n=6), *P(s + d, t), G((cx, cy)) + 0.55) for d in (-0.7, 0.0, 0.7)],
              storey, 'foliage', predefined='VEGETATION', object_type='Shrub roses (Rosa), Arakawa Line rose planting', src=TYP_SRC,
              psets={'Pset_CDE_Vegetation': {'Species': 'Rosa hybrid', 'Plants': 3, 'FloweringSeason': 'May, October'}, **am('furniture', 3, 5)})
    m.element('IfcGeographicElement', f'Floración {k}',
              [m.box(*P(s + d, t + e), G((cx, cy)) + 0.95 + 0.07 * ((i * 7) % 3), 0.13, 0.13, 0.08, angle=ANG + i)
               for i, (d, e) in enumerate(((-0.8, 0.15), (-0.55, -0.2), (-0.2, 0.18), (0.1, -0.12), (0.45, 0.2), (0.75, -0.15)))],
              storey, 'bloom', predefined='VEGETATION', object_type='Rose blooms', src=TYP_SRC, psets=am('furniture', 3, 5))
hedge = []
for line in (offset(clip_west(osm['37866121'], 46., 9.), -2.1), offset(clip_west(osm['180140467'], 46., 9.), 2.1)):
    hedge += [seg_box(a, b, 0.6, G(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) - 0.05, 0.80) for a, b in zip(line, line[1:])]
m.element('IfcGeographicElement', 'Seto de la vía', hedge, TRACK, 'foliage_d', predefined='VEGETATION',
          object_type='Clipped evergreen hedge (Ilex, Ligustrum)', src=PHOTO_SRC,
          psets={'Pset_CDE_Vegetation': {'Species': 'Ilex crenata, Ligustrum', 'Height_mm': 750}, **am('furniture', 6, 4)})

# ─── Overhead contact line ─────────────────────────────────────────────────────────────────────────
Z_CW, Z_MW = 5.0, 5.9
ocs = m.assembly('Catenaria simple · Simple catenary', OCS, object_type='Overhead contact line, 600 V DC',
                 psets=spec(Voltage='600 V DC', System='Simple catenary', ContactWire='GT 110 mm² Cu',
                            MessengerWire='St 55 mm²', ContactWireHeight_mm=5000))


def ocs_pole(name, base, tip, parent):
    """Spun concrete pole at `base` with a steel cantilever reaching `tip` (plan points), insulators at the tip."""
    zb = G(base) - 0.10
    m.element('IfcMember', f'Poste {name}', [m.revolve([(0, 0), (0.17, 0), (0.11, 7.6 - zb), (0, 7.6 - zb)], base[0], base[1], zb),
                                             disc((*base, 7.62), (0, 0, 1), 0.12, 0.04)], OCS, 'pole', predefined='POST',
              object_type='Spun concrete pole Ø340/220', parent=parent, src=PHOTO_SRC,
              psets={**spec(Diameter_mm=340, Height_mm=7600, Foundation='Bored pile Ø800×3 000'), **am('ocs', 12, 4, EarthingResistance_ohm=3.2)})
    m.element('IfcMember', f'Abrazaderas {name}', [disc((*base, z), (0, 0, 1), 0.175 - 0.06 * z / 7.6, 0.08) for z in (Z_MW - 0.12, Z_MW + 0.38)],
              OCS, 'galv', predefined='MEMBER', object_type='Pole bands', parent=parent, src=TYP_SRC, psets=am('ocs', 12, 4))
    mid = ((base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2)
    m.element('IfcMember', f'Ménsula {name}', [rod((*base, Z_MW + 0.38), (*tip, Z_MW + 0.38), 0.03), rod((*base, Z_MW - 0.12), (*mid, Z_MW + 0.36), 0.02)],
              OCS, 'galv', predefined='BRACE', object_type='Cantilever tube Ø60 with stay', parent=parent, src=TYP_SRC, psets=am('ocs', 12, 4))
    m.element('IfcMember', f'Brazo de registro {name}', rod((*base, Z_CW + 0.05), (*tip, Z_CW + 0.05), 0.015), OCS, 'galv', predefined='BRACE',
              object_type='Registration arm', parent=parent, src=TYP_SRC, psets=am('ocs', 12, 4))
    ins = []
    for z, r in ((Z_MW + 0.05, 0.05), (Z_CW + 0.1, 0.045)):
        ins += [disc((*tip, z + 0.05 * i), (0, 0, 1), r, 0.025) for i in range(5)]
    m.element('IfcDiscreteAccessory', f'Aisladores {name}', ins, OCS, 'insul', predefined='INSULATOR',
              object_type='Porcelain disc insulators 1 kV', parent=parent, src=TYP_SRC, psets={**spec(RatedVoltage='1.5 kV DC'), **am('ocs', 12, 4)})


for k, s in enumerate((2.0, 15.6, 26.0), 1):
    ocs_pole(f'P{k} (andén norte)', P(s, 4.45), P(s, 0.0), ocs)


def wire(name, line, z, mat, predefined, obj, r=0.012):
    m.element('IfcCableSegment', name, [rod((*a, z), (*b, z), r) for a, b in zip(line, line[1:])], OCS, mat,
              predefined=predefined, object_type=obj, parent=ocs, src=TYP_SRC,
              psets={**spec(Length_m=round(sum(math.dist(a, b) for a, b in zip(line, line[1:])), 1)),
                     **am('ocs', 6, 4, WearMeasure_pct=11 if predefined == 'CONTACTWIRESEGMENT' else None)})


wire('Hilo de contacto — vía stub', [P(-0.5, 0), P(ap[0] - 0.25, 0)], Z_CW, 'copper', 'CONTACTWIRESEGMENT', 'Contact wire GT 110 mm²')
wire('Sustentador — vía stub', [P(-0.5, 0), P(ap[0] - 0.25, 0)], Z_MW, 'galv', 'USERDEFINED', 'Messenger wire St 55 mm²')
m.element('IfcCableSegment', 'Péndolas — vía stub', [rod(p3(s, 0, Z_CW), p3(s, 0, Z_MW), 0.004) for s in [1.0 + 2.5 * i for i in range(12)]],
          OCS, 'copper', predefined='USERDEFINED', object_type='Droppers Cu 10 mm²', parent=ocs, src=TYP_SRC, psets=am('ocs', 12, 4))
for nm, axis in (('vía 1', west_n), ('vía 2', west_s)):
    wire(f'Hilo de contacto — {nm}', axis, Z_CW, 'copper', 'CONTACTWIRESEGMENT', 'Contact wire GT 110 mm²')
    wire(f'Sustentador — {nm}', axis, Z_MW, 'galv', 'USERDEFINED', 'Messenger wire St 55 mm²')
for k, dist in enumerate((12.0, 27.0, 42.0), 1):
    pa = along(west_n, 1e9, dist)[0][0]
    pb = along(west_s, 1e9, dist)[0][0]
    mid = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
    ocs_pole(f'W{k} (entrevía)', mid, pa, ocs)
    m.element('IfcMember', f'Ménsula W{k} (vía 2)', rod((*mid, Z_MW + 0.38), (*pb, Z_MW + 0.38), 0.03), OCS, 'galv', predefined='BRACE',
              object_type='Cantilever tube Ø60', parent=ocs, src=TYP_SRC, psets=am('ocs', 12, 4))

# ─── Lineside ──────────────────────────────────────────────────────────────────────────────────────
sig = P(-9.0, -2.3)
m.element('IfcSignal', 'Señal de maniobra del desvío', [m.cylinder(sig[0], sig[1], G(sig) - 0.1, 0.06, 3.1 - G(sig)),
                                                       m.box(sig[0], sig[1], 3.0, 0.32, 0.22, 0.75, angle=ANG)], LINE, 'black',
          predefined='VISUAL', object_type='Tram point indicator, LED', src=TYP_SRC,
          psets={**spec(Aspects='Straight / diverging / stop', Lamp='LED'), **am('equipment', 3, 5)})
m.element('IfcSignal', 'Lámparas de la señal', [disc(p3(-9.0 - 0.165, -2.3, 3.2 + 0.18 * i), v3(1, 0, 0), 0.05, 0.012) for i in range(3)], LINE, 'led',
          predefined='VISUAL', object_type='LED aspects', src=TYP_SRC, psets=am('equipment', 3, 5))
cab = P(-14.0, 4.2)
m.element('IfcCommunicationsAppliance', 'Armario de equipos de vía', m.box(cab[0], cab[1], G(cab) - 0.05, 0.9, 0.5, 1.55, angle=ANG), LINE, 'galv',
          predefined='LINESIDEELECTRONICUNIT', object_type='Lineside cabinet: interlocking I/O, network switch', src=TYP_SRC,
          psets={**spec(IP='IP54', Power='100 V AC + UPS 2 h'), **am('equipment', 6, 4)})
m.element('IfcSign', 'Placa 信号確認 en poste P1', sbox(1.80, 2.20, 4.45 - 0.185, 4.45 - 0.175, 2.08, 0.20), LINE, 'white', predefined='PICTORAL',
          object_type='Driver reminder plate «check the signal»', src=PHOTO_SRC, psets=am('signage', 24, 4))
m.element('IfcSign', 'Rotulación 信号確認', lettering('信号確認', 0.065, 2.0, 4.45 - 0.185, 2.15, 'S', weight='Bold'), LINE, 'ink',
          predefined='PICTORAL', object_type='Cut vinyl lettering', src=PHOTO_SRC, psets=am('signage', 24, 4))

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'waseda-tram-stop.ifc')
m.finish(out)
print('written', out, len(m.f.by_type('IfcProduct')), 'products')
