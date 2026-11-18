"""Tochōmae station, exit A4 (都庁前駅 A4出入口), Toei Ōedo Line E-28 — an authored IFC4X3 model.

The glass pavilion on the sidewalk in front of Shinjuku Chūō Park and the Metropolitan Assembly building:
four square bays in a row, each under a glazed hip pyramid with stainless ridges, a stainless fascia
carrying the station and travel-time boards, glazing over a granite dado, and inside the first bay the stair
down towards the concourse. It is NOT the operator's as-built model and the asset values are invented:
every element says so in Pset_CDE_AssetManagement (demo) and Pset_CDE_Provenance.

What is real:
  * position and orientation, from OpenStreetMap (node 1701108900 «都庁前 A4», building way 583899285;
    © OpenStreetMap contributors, ODbL);
  * the ground, from the GSI 5 m laser DEM (dem5a): TP 34.58 m at the entrance, the sidewalk rising ~0.1 m per
    metre towards the Assembly building; every street object stands on it (gsi_laser.py);
  * the look of the exit, from photographs on Wikimedia Commons: Tochomae-Sta-A4.JPG (2010, CC BY 3.0),
    Toei-Tocho-mae-Station-01.jpg (2012, CC BY-SA 3.0), Tochomae stn exit - October 29 2017.jpg (CC BY 3.0):
    four bays with glass pyramids, stainless posts on granite plinths, the boards «都庁前駅 Tochomae Sta.»,
    «六本木 まで11分», «上野御徒町 まで18分», the area map, the «都議会議事堂 とみん広場» pillar, the planter.
What is estimated from those photographs, not measured: every dimension. OSM tags the node as an elevator
too; no lift is visible in the photographs, so none is modelled.

Local axes: +x east, +y north, metres, origin at the OSM entrance node (35.6902282 N, 139.6917301 E), z = 0
at TP 34.58 m, the laser ground in front of the entrance. The pavilion frame (s, t) runs s along its long side (≈11.6° north of east,
from the entrance bay at the west end) and t to its left (north, away from the sidewalk).

Scene tiles: anchored at h = 34.58, the model's own TP height. Since 2026-10-01 the scene's Japanese terrain is
the same laser DEM from z13 down, in float metres (CDE-Frontend basemapImagery.ts), so the model, the PLATEAU
buildings and the ground agree; before, the terrain was DEM10B rounded to the metre, 38 m here. The floor is
0.15 m up with a ramp at the door, because the sidewalk slopes under the pavilion; plinths and dado go 0.5 m
down so no side ever shows a gap. The stair is under the ground: the tileset asks the scene, through
`extras.cdeUnderground`, to draw what the terrain hides as a translucent ghost (CDE-Frontend undergroundView.ts).

usage: uv run --with ifcopenshell --with pyproj --with shapely --with fonttools python landmarks/tochomae_a4_entrance.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/tochomae-a4-entrance.ifc src/tochomae-a4-entrance_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/tochomae-a4-entrance_qto.ifc \
           tiles/tokyo-tochomae-a4 35.6902282 139.6917301 34.58 0 --keep-origin \
           --wfs tiles/wfs/tokyo-tochomae-a4 --wfs-name tokyo_tochomae_a4_features --extras landmarks/underground_extras.json
"""
import math, os, sys

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTCollection
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model  # noqa: E402
from gsi_laser import LaserGround  # noqa: E402

HERE = os.path.dirname(__file__)
LAT0, LON0, ELEV0 = 35.6902282, 139.6917301, 34.58
TOKYO_CRS = (6677, 'JGD2011 / Japan Plane Rectangular CS IX', 'JGD2011', 'TP (Tokyo Peil)')

m = Model('Toei Ōedo Line — Tochōmae station (E-28), exit A4', 'Tochōmae exit A4 site',
          'Tochōmae station exit A4 pavilion', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 model (≈LOD 400 geometry, LOD 500-style asset data with demo values). '
                      'Position © OpenStreetMap contributors (ODbL); ground height GSI DEM; appearance from '
                      'Wikimedia Commons photographs. Not the operator\'s as-built model.',
          tag_prefix='E28A4', crs=TOKYO_CRS, schema='IFC4X3_ADD2')
f = m.f

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('granite', 'Granite cladding, flamed, mid grey', (0.67, 0.66, 0.64), 'Stone', 2650, 'Inada-type granite')
M('granite_d', 'Granite, polished, dark grey', (0.36, 0.36, 0.37), 'Stone', 2700)
M('joint', 'Cladding joint, sealant grey', (0.45, 0.45, 0.45), 'Polymer', 1400)
M('stainless', 'Stainless steel, hairline finish', (0.87, 0.88, 0.89), 'Steel', 7900, 'SUS304 HL')
M('stainless_d', 'Stainless steel, satin, shaded', (0.72, 0.73, 0.74), 'Steel', 7900)
M('glass', 'Laminated safety glass, clear', (0.72, 0.86, 0.86), 'Glass', 2500, transparency=0.55)
M('glass_roof', 'Laminated roof glass, green tint', (0.50, 0.75, 0.68), 'Glass', 2500, transparency=0.40)
M('concrete', 'Reinforced concrete', (0.68, 0.67, 0.64), 'Concrete', 2500)
M('floor', 'Granite floor tile, light grey, anti-slip', (0.74, 0.74, 0.72), 'Stone', 2650)
M('nosing', 'Stair nosing, anti-slip, yellow-grey', (0.86, 0.78, 0.35), 'Polymer', 1300)
M('tactile', 'Tactile paving, yellow (JIS T 9251)', (0.95, 0.76, 0.10), 'Polymer', 1300)
M('pave', 'Interlocking concrete pavers, grey', (0.58, 0.57, 0.55), 'Concrete', 2300)
M('pave_d', 'Interlocking concrete pavers, dark', (0.46, 0.45, 0.44), 'Concrete', 2300)
M('pave_l', 'Interlocking concrete pavers, light', (0.70, 0.69, 0.66), 'Concrete', 2300)
M('white', 'Sign panel, white acrylic', (0.97, 0.97, 0.96), 'Plastic', 1200)
M('black', 'Sign panel, black', (0.08, 0.08, 0.09), 'Aluminium', 2700)
M('ink', 'Cut vinyl lettering, black', (0.06, 0.06, 0.07), 'Polymer', 1300)
M('toei_green', 'Toei green', (0.00, 0.58, 0.30), 'Paint', 1400)
M('yellow', 'Exit number yellow', (1.00, 0.82, 0.05), 'Paint', 1400)
M('oedo', 'Ōedo Line magenta', (0.72, 0.00, 0.47), 'Paint', 1400)
M('map_base', 'Map print, pale', (0.93, 0.93, 0.88), 'Print', 1200)
M('map_park', 'Map print, park green', (0.62, 0.80, 0.55), 'Print', 1200)
M('map_bldg', 'Map print, building grey', (0.74, 0.74, 0.76), 'Print', 1200)
M('map_water', 'Map print, road white', (1.00, 1.00, 1.00), 'Print', 1200)
M('red', 'Signal red', (0.85, 0.10, 0.10), 'Paint', 1400)
M('frame', 'Powder-coated steel, dark grey', (0.22, 0.23, 0.25), 'Steel', 7850)
M('light', 'Opal LED diffuser', (1.00, 0.99, 0.93), 'Plastic', 1200)
M('foliage', 'Shrub foliage', (0.22, 0.44, 0.20), 'Vegetation', 600)
M('foliage_d', 'Evergreen hedge foliage', (0.14, 0.33, 0.16), 'Vegetation', 600)
M('bloom', 'Seasonal blooms, violet', (0.55, 0.35, 0.80), 'Vegetation', 300)
M('planter', 'Precast concrete planter, washed finish', (0.72, 0.71, 0.68), 'Concrete', 2300)
M('bark', 'Zelkova bark, grey-brown', (0.45, 0.40, 0.34), 'Wood', 700)
M('leaf_a', 'Zelkova foliage, summer', (0.30, 0.52, 0.22), 'Vegetation', 500)
M('leaf_b', 'Zelkova foliage, shaded', (0.20, 0.40, 0.17), 'Vegetation', 500)
M('leaf_c', 'Zelkova foliage, sunlit', (0.42, 0.60, 0.27), 'Vegetation', 500)
M('lamp_glass', 'Opal globe, polycarbonate', (0.98, 0.98, 0.95), 'Plastic', 1200, transparency=0.15)

# ─── Frame and helpers ─────────────────────────────────────────────────────────────────────────────
# OSM building 583899285 (metres from the node): the south side (-1.25,-2.51)→(5.75,-1.11), the north side
# (-2.19,2.17)→(4.74,3.64). Centre and long-side bearing from those two edges.
O = (1.76, 0.55)
ANG = math.radians(11.6)
U = (math.cos(ANG), math.sin(ANG))
N = (-U[1], U[0])


def P(s, t):
    return (O[0] + s * U[0] + t * N[0], O[1] + s * U[1] + t * N[1])


def p3(s, t, z):
    return (*P(s, t), z)


def v3(ds, dt, dz):
    return (ds * U[0] + dt * N[0], ds * U[1] + dt * N[1], dz)


def sbox(s0, s1, t0, t1, z0, h):
    cx, cy = P((s0 + s1) / 2, (t0 + t1) / 2)
    return m.box(cx, cy, z0, abs(s1 - s0), abs(t1 - t0), h, angle=ANG)


def scyl(s, t, z0, r, h):
    return m.cylinder(*P(s, t), z0, r, h)


def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def _perp(d):
    a = (0., 0., 1.) if abs(d[2]) < 0.9 else (1., 0., 0.)
    return _unit((d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]))


def rod(p0, p1, r):
    d = tuple(b - a for a, b in zip(p0, p1))
    L = math.sqrt(sum(c * c for c in d))
    u = _unit(d)
    prof = f.createIfcCircleProfileDef('AREA', None, m._pl2(), float(r))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=u, ref=_perp(u)), f.createIfcDirection((0., 0., 1.)), float(L))


def _poly(pts):
    return f.createIfcPolyline([f.createIfcCartesianPoint((float(a), float(b))) for a, b in list(pts) + [pts[0]]])


def plane_solid(outer, holes, origin, u, depth):
    """Polygon (with holes) in the vertical plane through `origin` spanned by horizontal unit u and +Z,
    extruded `depth` along the plane's normal (u turned 90° clockwise), centred on the plane."""
    ux, uy = u
    nx, ny = -uy, ux
    ox, oy, oz = origin
    pl = m._pl3(ox + nx * depth / 2, oy + ny * depth / 2, oz, axis=(-nx, -ny, 0.), ref=(ux, uy, 0.))
    prof = (f.createIfcArbitraryProfileDefWithVoids('AREA', None, _poly(outer), [_poly(h) for h in holes]) if holes
            else f.createIfcArbitraryClosedProfileDef('AREA', None, _poly(outer)))
    return f.createIfcExtrudedAreaSolid(prof, pl, f.createIfcDirection((0., 0., 1.)), float(depth))


def lsec(pts, t0, t1):
    """Long section [(s, z)] extruded across t between t0 and t1."""
    return plane_solid(pts, None, (*P(0, (t0 + t1) / 2), 0.), U, abs(t1 - t0))


def brep(verts, faces):
    """Closed faceted solid from 3D vertices and faces (vertex index lists)."""
    pts = [f.createIfcCartesianPoint(tuple(float(c) for c in v)) for v in verts]
    fcs = [f.createIfcFace([f.createIfcFaceOuterBound(f.createIfcPolyLoop([pts[i] for i in fc]), True)]) for fc in faces]
    return f.createIfcFacetedBrep(f.createIfcClosedShell(fcs))


def el(*a, **k):
    """m.element, with the representation type set right when the items include breps."""
    e = m.element(*a, **k)
    rep = e.Representation.Representations[0]
    kinds = {it.is_a() for it in rep.Items}
    if 'IfcFacetedBrep' in kinds:
        rep.RepresentationType = 'Brep' if kinds == {'IfcFacetedBrep'} else 'SolidModel'
    return e


def hash01(*k):
    h = 2166136261
    for v in k:
        h = ((h ^ (int(v * 1000) & 0xffffffff)) * 16777619) & 0xffffffff
    return (h % 10007) / 10007


# The scene's ground, relative to the model's z = 0: the laser DEM the scene's terrain is built from.
_ground = LaserGround().local(LAT0, LON0, ELEV0)
_gcache = {}


def gz(s, t):
    key = (round(s, 2), round(t, 2))
    if key not in _gcache:
        _gcache[key] = _ground(*P(s, t))
    return _gcache[key]


def drape(s0, s1, t0, t1, lift, h, step=1.0):
    """Slabs following the ground: top at ground + lift + h, bottom at ground + lift, cut in `step` squares."""
    out = []
    ns, nt = max(1, math.ceil(abs(s1 - s0) / step)), max(1, math.ceil(abs(t1 - t0) / step))
    for i in range(ns):
        a, b = s0 + (s1 - s0) * i / ns, s0 + (s1 - s0) * (i + 1) / ns
        for j in range(nt):
            c, d = t0 + (t1 - t0) * j / nt, t0 + (t1 - t0) * (j + 1) / nt
            corners = [(a, c), (b, c), (b, d), (a, d)]
            bot = [p3(u, v, gz(u, v) + lift) for u, v in corners]
            top = [p3(u, v, gz(u, v) + lift + h) for u, v in corners]
            out.append(brep(bot + top, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]))
    return out


def ground_under(s0, s1, t0, t1):
    """The lowest ground under a footprint, where an object's base goes."""
    return min(gz(u, v) for u in (s0, (s0 + s1) / 2, s1) for v in (t0, (t0 + t1) / 2, t1))


# ─── Lettering (real geometry, Noto Sans CJK JP, SIL OFL 1.1) ──────────────────────────────────────
_FONTS = {}


def _font(weight):
    if weight not in _FONTS:
        _FONTS[weight] = TTCollection(f'/usr/share/fonts/opentype/noto/NotoSansCJK-{weight}.ttc').fonts[0]
    return _FONTS[weight]


class _Flatten(BasePen):
    def __init__(self, gs):
        super().__init__(gs); self.contours = []; self.cur = []

    def _moveTo(self, p): self.cur = [p]
    def _lineTo(self, p): self.cur.append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for i in range(1, 6):
            t = i / 5; a = (1 - t) ** 3; b = 3 * t * (1 - t) ** 2; c = 3 * t * t * (1 - t); d = t ** 3
            self.cur.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for i in range(1, 4):
            t = i / 3
            self.cur.append(((1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0],
                             (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1]))

    def _closePath(self):
        if len(self.cur) > 2: self.contours.append(self.cur)
        self.cur = []
    _endPath = _closePath


def _signed_area(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def text_shapes(text, height, weight='Bold', spacing=0.0):
    """Polygons of `text` (cap height ≈ height, baseline 0, from x = 0) and its width; non-zero fill."""
    font = _font(weight)
    gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
    k = height / (upm * 0.73)
    x, polys = 0., []
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None:
            x += upm * 0.3; continue
        pen = _Flatten(gs); gs[g].draw(pen)
        rings = [[((x + px) * k, py * k) for px, py in c] for c in pen.contours]
        rings = [(abs(_signed_area(r)), _signed_area(r) > 0, Polygon(r).buffer(0)) for r in rings if len(r) > 2]
        rings = sorted([r for r in rings if r[0] > 1e-8 and not r[2].is_empty], key=lambda r: -r[0])
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
    """facing 'S' / 'N': the face looks along -t / +t; 'E' / 'W': along +s / -s. The solid occupies
    [plane, plane + depth] on the viewer's side; the reading direction runs left to right for the viewer."""
    if facing in ('N', 'S'):
        sg = 1 if facing == 'N' else -1
        return (*P(s, t + sg * depth / 2), 0.), (-U[0] * sg, -U[1] * sg)
    sg = 1 if facing == 'E' else -1
    return (*P(s + sg * depth / 2, t), 0.), (N[0] * sg, N[1] * sg)


def lettering(text, height, s, t, z, facing, weight='Bold', depth=0.005, align='center', spacing=0.0):
    polys, w = text_shapes(text, height, weight, spacing)
    x0 = {'center': -w / 2, 'left': 0., 'right': -w}[align]
    org, u = _sign_plane(s, t, facing, depth)
    return _solids_in_plane(polys, (org[0] + u[0] * x0, org[1] + u[1] * x0, z), u, depth)


def vertical_lettering(text, height, s, t, z_top, facing, weight='Bold', depth=0.005, pitch=1.12):
    """Japanese set top to bottom: one glyph under the other."""
    out = []
    for i, ch in enumerate(text):
        out += lettering(ch, height, s, t, z_top - (i + 1) * height * pitch / 0.88, facing, weight, depth)
    return out


def plane_shapes(shapes, s, t, facing, depth):
    org, u = _sign_plane(s, t, facing, depth)
    return _solids_in_plane(shapes, org, u, depth)


def ginkgo(cx, cy, r):
    """The Toei mark's ginkgo leaf: a fan with a cleft at the top and a short stem."""
    fan = [(cx, cy - 0.15 * r)] + [(cx + r * math.cos(a), cy - 0.15 * r + r * math.sin(a))
                                   for a in [math.radians(20 + 140 * i / 16) for i in range(17)]]
    leaf = Polygon(fan).buffer(0)
    cleft = Polygon([(cx, cy + 0.15 * r), (cx - 0.12 * r, cy + 0.95 * r), (cx + 0.12 * r, cy + 0.95 * r)])
    stem = Polygon([(cx - 0.06 * r, cy - 0.15 * r), (cx + 0.06 * r, cy - 0.15 * r), (cx + 0.06 * r, cy - 0.55 * r), (cx - 0.06 * r, cy - 0.55 * r)])
    return unary_union([leaf.difference(cleft), stem])


# ─── Asset data ────────────────────────────────────────────────────────────────────────────────────
YEAR = {'structure': 2000, 'glazing': 2000, 'finishes': 2014, 'signage': 2017, 'equipment': 2019, 'street': 2015}


def am(kind, interval_months, condition, **extra):
    base = {'DataStatus': 'Illustrative demo values — not the asset owner\'s records',
            'LifecycleStatus': 'In service', 'InstallationYear': YEAR[kind],
            'InspectionInterval_months': interval_months, 'LastInspection': '2026-05-20',
            'NextInspection': '2026-11-20' if interval_months <= 6 else '2027-05-20',
            'ConditionIndex_1to5': condition, 'MaintenanceStrategy': 'Condition-based'}
    base.update(extra)
    return {'Pset_CDE_AssetManagement (demo)': base}


def spec(**props):
    return {'Pset_CDE_Specification': props}


OSM_SRC = ('OpenStreetMap entrance node and building outline (ODbL)', 'Medium', 'OSM node 1701108900, way 583899285')
PHOTO_SRC = ('Estimated from photographs (Wikimedia Commons); position from OSM', 'Low',
             'Commons: Tochomae-Sta-A4.JPG (CC BY 3.0, 2010); Toei-Tocho-mae-Station-01.jpg (CC BY-SA 3.0, 2012); '
             'Tochomae stn exit - October 29 2017.jpg (CC BY 3.0)')
TYP_SRC = ('Typical dimensions for a Toei subway exit; position from OSM', 'Low')

# ─── Spatial structure ─────────────────────────────────────────────────────────────────────────────
GL = 'Nivel calle · Street level (GL)'
STAIR = 'Escalera · Stair to the concourse'
STREET = 'Entorno · Streetscape'
m.storey(GL, 0., 'Pavilion at sidewalk level')
m.storey(STAIR, -4.93, 'Stair and the first metres of the passage towards the concourse (B1)')
m.storey(STREET, 0., 'Sidewalk, signage and planting around the exit')

# ─── Dimensions ────────────────────────────────────────────────────────────────────────────────────
BAY = 3.10
S_W, S_E = -2 * BAY, 2 * BAY            # pavilion ends
GRID = [S_W + i * BAY for i in range(5)]
T_F, T_B = -1.55, 1.55                  # front (sidewalk, south) and back faces
FL = 0.15                               # finished floor: above the sidewalk everywhere under the pavilion
Z_DADO, Z_TRANSOM, Z_FAS0, Z_FAS1 = 0.85, 1.72, 2.55, 3.05
RISE = 1.25                              # pyramid height above the fascia
ENT = (S_W + 0.55, S_W + BAY - 0.40)    # entrance opening in the front of bay 1
# stair: from the back of bay 1 eastwards, 29 risers of 0.170 m on goings of 0.300 m
ST_S0, N_R, R_H, G = GRID[1] + 0.05, 29, 0.170, 0.300
ST_T = 0.90                              # half-width of the flight between its side walls
Z_BOT = FL - N_R * R_H
ST_S1 = ST_S0 + (N_R - 1) * G
S_END = ST_S1 + G + 2.3                 # end of the modelled passage under the sidewalk

# ─── Pavilion structure ────────────────────────────────────────────────────────────────────────────
pav = m.assembly('Pabellón de acceso A4 · Exit pavilion', GL, object_type='Subway exit pavilion',
                 psets=spec(Bays=4, BaySize_mm=3100, Height_mm=round((Z_FAS1 + RISE) * 1000),
                            Structure='Steel frame, stainless cladding', Roof='Glazed hip pyramids'))
el('IfcSlab', 'Losa de planta', [sbox(S_W, GRID[1], T_F, T_B, -0.50, 0.50 + FL - 0.03),
                                 sbox(GRID[1], S_E, T_F, -ST_T - 0.20, -0.50, 0.50 + FL - 0.03),
                                 sbox(GRID[1], S_E, ST_T + 0.20, T_B, -0.50, 0.50 + FL - 0.03)],
   GL, 'concrete', predefined='FLOOR', object_type='Ground slab with the stair opening', parent=pav, src=OSM_SRC,
   psets=am('structure', 24, 4))
tiles = [sbox(S_W + 0.02, GRID[1], T_F + 0.02, T_B - 0.02, FL - 0.03, 0.03),
         sbox(GRID[1], S_E - 0.02, T_F + 0.02, -ST_T - 0.20, FL - 0.03, 0.03),
         sbox(GRID[1], S_E - 0.02, ST_T + 0.20, T_B - 0.02, FL - 0.03, 0.03)]
el('IfcCovering', 'Solado de granito', tiles, GL, 'floor', predefined='FLOORING', object_type='Granite floor tiles 600×300, anti-slip',
   parent=pav, src=PHOTO_SRC, psets={**spec(SlipResistance='CSR 0.4'), **am('finishes', 12, 4)})
joints = [sbox(s - 0.004, s + 0.004, T_F + 0.02, T_B - 0.02, FL, 0.002) for s in [S_W + 0.6 * i for i in range(1, 6)]]
el('IfcCovering', 'Juntas del solado', joints, GL, 'joint', predefined='FLOORING', object_type='Tile joints', parent=pav,
   src=PHOTO_SRC, psets=am('finishes', 12, 4))
el('IfcCovering', 'Franja táctil de la entrada', [sbox(ENT[0], ENT[1], T_F + 0.05, T_F + 0.35, FL, 0.006),
                                                  sbox(GRID[1] - 0.45, GRID[1] - 0.15, -ST_T, ST_T, FL, 0.006)],
   GL, 'tactile', predefined='FLOORING', object_type='Tactile warning paving at the threshold and stair head', parent=pav,
   src=PHOTO_SRC, psets=am('finishes', 6, 4))

# the sidewalk rises towards the door: a granite ramp from it up to the floor
r0, r1, rt = ENT[0] - 0.25, ENT[1] + 0.25, T_F - 1.6
rv = [p3(r0, T_F - 0.12, -0.10), p3(r1, T_F - 0.12, -0.10), p3(r1, rt, gz(r1, rt) - 0.10), p3(r0, rt, gz(r0, rt) - 0.10),
      p3(r0, T_F - 0.12, FL), p3(r1, T_F - 0.12, FL), p3(r1, rt, gz(r1, rt) + 0.04), p3(r0, rt, gz(r0, rt) + 0.04)]
el('IfcRampFlight', 'Rampa de acceso', brep(rv, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]),
   GL, 'floor', predefined='STRAIGHT', object_type='Entrance ramp, granite, step-free', parent=pav, src=PHOTO_SRC,
   psets={**spec(Purpose='Takes up the sidewalk\'s fall under the pavilion'), **am('finishes', 12, 4)})

# posts on granite plinths at every grid line, front and back
plinths, posts = [], []
for s in GRID:
    for t in (T_F, T_B):
        plinths.append(sbox(s - 0.21, s + 0.21, t - 0.21, t + 0.21, -0.50, Z_DADO + 0.53))
        posts.append(sbox(s - 0.12, s + 0.12, t - 0.12, t + 0.12, Z_DADO + 0.03, Z_FAS0 - Z_DADO - 0.03))
el('IfcCovering', 'Zócalos de granito de los pilares', plinths, GL, 'granite', predefined='CLADDING',
   object_type='Granite plinth 420 × 420', parent=pav, src=PHOTO_SRC, psets=am('finishes', 24, 4))
el('IfcColumn', 'Pilares', posts, GL, 'stainless', predefined='COLUMN', object_type='Steel column, stainless cladding 240 × 240',
   parent=pav, src=PHOTO_SRC, psets={**spec(Count=len(posts), Cladding='SUS304 HL 1.5 mm'), **am('structure', 12, 4)})

# granite dado between the plinths, with its joints, except the entrance opening
dado, djoints = [], []


def dado_run(s0, s1, t0, t1, along_s=True):
    dado.append(sbox(s0, s1, t0, t1, -0.50, Z_DADO + 0.50))
    dado.append(sbox(s0 - 0.01 if along_s else s0, s1 + 0.01 if along_s else s1, t0 - (0 if along_s else 0.01),
                     t1 + (0 if along_s else 0.01), Z_DADO, 0.03))
    if along_s:
        for s in [s0 + 0.6 * i for i in range(1, int((s1 - s0) / 0.6) + 1) if s0 + 0.6 * i < s1 - 0.1]:
            djoints.append(sbox(s - 0.004, s + 0.004, t0 - 0.002, t1 + 0.002, 0.02, Z_DADO - 0.04))
        djoints.append(sbox(s0, s1, t0 - 0.002, t1 + 0.002, Z_DADO / 2 - 0.004, 0.008))


for i, (a, b) in enumerate(zip(GRID, GRID[1:])):
    dado_run(a + 0.21, b - 0.21, T_B - 0.10, T_B + 0.10)
    if i > 0:
        dado_run(a + 0.21, b - 0.21, T_F - 0.10, T_F + 0.10)
dado_run(GRID[0] + 0.21, ENT[0], T_F - 0.10, T_F + 0.10)
for s in (S_W, S_E):
    dado_run(s - 0.10, s + 0.10, T_F + 0.21, T_B - 0.21, along_s=False)
el('IfcWall', 'Murete de granito', dado, GL, 'granite', predefined='PARAPET', object_type='Granite-clad dado wall, H 880',
   parent=pav, src=PHOTO_SRC, psets={**spec(Height_mm=880, Cladding='Flamed granite 30 mm'), **am('finishes', 24, 4)})
el('IfcCovering', 'Juntas del murete', djoints, GL, 'joint', predefined='CLADDING', object_type='Cladding joints', parent=pav,
   src=PHOTO_SRC, psets=am('finishes', 24, 4))

# glazing over the dado: one transom, a mullion per bay
glass, mull = [], []


def glaze(s0, s1, t0, t1):
    glass.append(sbox(s0, s1, t0, t1, Z_DADO + 0.03, Z_FAS0 - Z_DADO - 0.03))
    along_s = abs(s1 - s0) > abs(t1 - t0)
    mid = ((s0 + s1) / 2, (t0 + t1) / 2)
    w = 0.03
    if along_s:
        tc0 = (t0 + t1) / 2
        mull.append(sbox(s0, s1, tc0 - 0.05, tc0 + 0.05, Z_DADO + 0.03, 0.04))
        mull.append(sbox(s0, s1, tc0 - 0.04, tc0 + 0.04, Z_FAS0 - 0.05, 0.05))
    else:
        sc0 = (s0 + s1) / 2
        mull.append(sbox(sc0 - 0.05, sc0 + 0.05, t0, t1, Z_DADO + 0.03, 0.04))
        mull.append(sbox(sc0 - 0.04, sc0 + 0.04, t0, t1, Z_FAS0 - 0.05, 0.05))
    if along_s:
        tc = (t0 + t1) / 2
        mull.append(sbox(s0, s1, tc - w, tc + w, Z_TRANSOM, 0.05))
        mull.append(sbox(mid[0] - 0.025, mid[0] + 0.025, tc - w, tc + w, Z_DADO + 0.03, Z_FAS0 - Z_DADO - 0.03))
    else:
        sc = (s0 + s1) / 2
        mull.append(sbox(sc - w, sc + w, t0, t1, Z_TRANSOM, 0.05))
        mull.append(sbox(sc - w, sc + w, mid[1] - 0.025, mid[1] + 0.025, Z_DADO + 0.03, Z_FAS0 - Z_DADO - 0.03))


for i, (a, b) in enumerate(zip(GRID, GRID[1:])):
    glaze(a + 0.12, b - 0.12, T_B - 0.006, T_B + 0.006)
    if i > 0:
        glaze(a + 0.12, b - 0.12, T_F - 0.006, T_F + 0.006)
for s in (S_W, S_E):
    glaze(s - 0.006, s + 0.006, T_F + 0.12, T_B - 0.12)
glass.append(sbox(GRID[0] + 0.12, ENT[0], T_F - 0.006, T_F + 0.006, Z_DADO + 0.03, Z_FAS0 - Z_DADO - 0.03))
el('IfcPlate', 'Acristalamiento', glass, GL, 'glass', predefined='CURTAIN_PANEL', object_type='Laminated safety glass 8+8 mm',
   parent=pav, src=PHOTO_SRC, psets={**spec(Panes=len(glass), Build='8+8 mm laminated, toughened'), **am('glazing', 12, 4)})
el('IfcMember', 'Montantes y travesaños', mull, GL, 'stainless', predefined='MULLION', object_type='Stainless glazing bars 50 × 60',
   parent=pav, src=PHOTO_SRC, psets=am('glazing', 12, 4))

# fascia: a stainless band round the pavilion and over every grid line, the boards on the sidewalk side
fas = [sbox(S_W - 0.12, S_E + 0.12, T_F - 0.12, T_F + 0.02, Z_FAS0, Z_FAS1 - Z_FAS0),
       sbox(S_W - 0.12, S_E + 0.12, T_B - 0.02, T_B + 0.12, Z_FAS0, Z_FAS1 - Z_FAS0)]
fas += [sbox(s - 0.12 if s in (S_W, S_E) else s - 0.06, s + 0.12 if s in (S_W, S_E) else s + 0.06, T_F + 0.02, T_B - 0.02,
             Z_FAS0, Z_FAS1 - Z_FAS0) for s in GRID]
el('IfcBeam', 'Frontis perimetral', fas, GL, 'stainless', predefined='SPANDREL', object_type='Fascia beam, stainless clad, H 500',
   parent=pav, src=PHOTO_SRC, psets=am('structure', 12, 4))
el('IfcCovering', 'Sofito', sbox(S_W - 0.12, S_E + 0.12, T_F - 0.12, T_F + 0.02, Z_FAS0 - 0.01, 0.01),
   GL, 'stainless_d', predefined='CEILING', object_type='Fascia soffit', parent=pav, src=PHOTO_SRC, psets=am('structure', 12, 4))

# glass pyramids, one per bay: glass faces as breps, stainless hips, mid-face ribs, eaves ring and finial
roof = m.assembly('Cubiertas piramidales · Pyramid roofs', GL, object_type='Glazed hip pyramids', parent=pav,
                  psets=spec(Count=4, Pitch_deg=round(math.degrees(math.atan(RISE / (BAY / 2))), 1), Glass='Laminated 6+6, green tint'))
for i, (a, b) in enumerate(zip(GRID, GRID[1:]), 1):
    c = ((a + b) / 2, 0.)
    corners = [p3(a + 0.04, T_F + 0.04, Z_FAS1), p3(b - 0.04, T_F + 0.04, Z_FAS1),
               p3(b - 0.04, T_B - 0.04, Z_FAS1), p3(a + 0.04, T_B - 0.04, Z_FAS1)]
    apex = p3(*c, Z_FAS1 + RISE)
    el('IfcPlate', f'Vidrio de la pirámide {i}', brep(corners + [apex], [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [3, 2, 1, 0]]),
       GL, 'glass_roof', predefined='SHEET', object_type='Roof glazing, 4 triangular panes', parent=roof, src=PHOTO_SRC,
       psets=am('glazing', 6, 4 if i != 3 else 3, Note='Bird droppings and leaf litter, cleaning due (demo)' if i == 3 else None))
    mid = [p3(c[0], T_F + 0.04, Z_FAS1), p3(b - 0.04, 0., Z_FAS1), p3(c[0], T_B - 0.04, Z_FAS1), p3(a + 0.04, 0., Z_FAS1)]
    ribs = [rod(cn, apex, 0.032) for cn in corners] + [rod(mp, apex, 0.014) for mp in mid]
    ribs += [rod(corners[k], corners[(k + 1) % 4], 0.03) for k in range(4)]
    ribs += [m.revolve([(0, 0), (0.07, 0), (0.07, 0.04), (0.03, 0.10), (0.012, 0.32), (0, 0.34)], *P(*c), Z_FAS1 + RISE - 0.03)]
    el('IfcMember', f'Aristas y remate de la pirámide {i}', ribs, GL, 'stainless', predefined='RAFTER',
       object_type='Stainless hip and mid rafters Ø64/Ø28, eaves ring, finial', parent=roof, src=PHOTO_SRC, psets=am('structure', 12, 4))
    # LED downlights fixed to the inner face of the fascia ring
    lights = [sbox(c[0] - 0.5, c[0] + 0.5, T_F + 0.03, T_F + 0.08, Z_FAS0 + 0.05, 0.05),
              sbox(c[0] - 0.5, c[0] + 0.5, T_B - 0.08, T_B - 0.03, Z_FAS0 + 0.05, 0.05)]
    el('IfcLightFixture', f'Luminarias del módulo {i}', lights, GL, 'light', predefined='DIRECTIONSOURCE',
       object_type='Linear LED wall-washers 1 000, 24 W', parent=pav, src=TYP_SRC,
       psets={**spec(Power_W=48, ColourTemperature_K=3500), **am('equipment', 12, 5 if i != 2 else 2,
              Note='One driver failed, reported (demo)' if i == 2 else None)})

# ─── Boards on the fascia (sidewalk side) ──────────────────────────────────────────────────────────
signs = m.assembly('Rótulos del frontis · Fascia boards', GL, object_type='Station and travel-time boards', parent=pav,
                   psets={**spec(Illuminated=True, Operator='Bureau of Transportation, Tokyo Metropolitan Government'), **am('signage', 12, 5)})
TS = T_F - 0.12                          # fascia face on the sidewalk side
ZS0, ZS1 = Z_FAS0 + 0.10, Z_FAS1 - 0.10
c1 = (GRID[0] + GRID[1]) / 2
el('IfcSign', 'Rótulo 都庁前駅', plane_shapes([Polygon([(-1.0, ZS0), (1.0, ZS0), (1.0, ZS1), (-1.0, ZS1)])], c1, TS, 'S', 0.02),
   GL, 'white', predefined='PICTORAL', object_type='Station name board 2 000 × 300, internally lit', parent=signs, src=PHOTO_SRC,
   psets=spec(Text='都庁前駅 Tochomae Sta.'))
el('IfcSign', 'Marca Toei (fondo verde)', plane_shapes([Polygon([(-0.98, ZS0 + 0.02), (-0.72, ZS0 + 0.02), (-0.72, ZS1 - 0.02), (-0.98, ZS1 - 0.02)])],
                                                         c1, TS - 0.02, 'S', 0.004),
   GL, 'toei_green', predefined='PICTORAL', object_type='Toei Subway mark', parent=signs, src=PHOTO_SRC)
el('IfcSign', 'Marca Toei (ginkgo)', plane_shapes([ginkgo(-0.85, (ZS0 + ZS1) / 2 + 0.01, 0.10)], c1, TS - 0.024, 'S', 0.003),
   GL, 'white', predefined='PICTORAL', object_type='Toei Subway mark, ginkgo leaf', parent=signs, src=PHOTO_SRC)
ink = lettering('都庁前駅', 0.15, c1 + 0.15, TS - 0.02, ZS0 + 0.10, 'S', weight='Bold', spacing=0.04)
ink += lettering('Tochomae Sta.', 0.040, c1 + 0.15, TS - 0.02, ZS0 + 0.035, 'S', weight='Medium')
el('IfcSign', 'Rotulación 都庁前駅', ink, GL, 'ink', predefined='PICTORAL', object_type='Cut lettering', parent=signs, src=PHOTO_SRC)

for k, (place, mins) in enumerate((('六本木', 'まで11分'), ('上野御徒町', 'まで18分')), 2):
    cx = (GRID[k - 1] + GRID[k]) / 2
    el('IfcSign', f'Rótulo {place}{mins}', plane_shapes([Polygon([(-1.25, ZS0), (1.25, ZS0), (1.25, ZS1), (-1.25, ZS1)])], cx, TS, 'S', 0.02),
       GL, 'white', predefined='PICTORAL', object_type='Travel-time board 2 500 × 300', parent=signs, src=PHOTO_SRC,
       psets=spec(Text=f'{place} {mins}', Meaning=f'{mins[2:]} by Ōedo Line to {place}'))
    el('IfcSign', f'Campo negro {place}', plane_shapes([Polygon([(-1.23, ZS0 + 0.02), (-0.02, ZS0 + 0.02), (-0.02, ZS1 - 0.02), (-1.23, ZS1 - 0.02)])],
                                                       cx, TS - 0.02, 'S', 0.004),
       GL, 'black', predefined='PICTORAL', object_type='Destination field', parent=signs, src=PHOTO_SRC)
    # the destination in white on the black field, the time in black on white
    el('IfcSign', f'Rotulación {place}', lettering(place, 0.15, cx - 0.62, TS - 0.024, ZS0 + 0.075, 'S', weight='Bold', spacing=0.10 if len(place) < 4 else 0.0),
       GL, 'white', predefined='PICTORAL', object_type='Cut lettering, white', parent=signs, src=PHOTO_SRC)
    el('IfcSign', f'Rotulación {mins}', lettering(mins, 0.14, cx + 0.60, TS - 0.02, ZS0 + 0.08, 'S', weight='Bold'),
       GL, 'ink', predefined='PICTORAL', object_type='Cut lettering, black', parent=signs, src=PHOTO_SRC)

# exit number plate on the post left of the entrance, and the opening-hours plate
ps = GRID[0]
el('IfcSign', 'Placa de salida A4', plane_shapes([Polygon([(-0.16, 2.05), (0.16, 2.05), (0.16, 2.37), (-0.16, 2.37)])], ps, T_F - 0.12, 'S', 0.01),
   GL, 'yellow', predefined='PICTORAL', object_type='Exit number plate', parent=signs, src=TYP_SRC, psets=spec(Text='A4'))
el('IfcSign', 'Rotulación A4', lettering('A4', 0.17, ps, T_F - 0.13, 2.12, 'S', weight='Black'), GL, 'ink', predefined='PICTORAL',
   object_type='Exit number', parent=signs, src=TYP_SRC)
el('IfcSign', 'Placa de horario', sbox(ENT[1] + 0.06, ENT[1] + 0.36, T_F - 0.13, T_F - 0.12, 1.0, 0.40), GL, 'white', predefined='PICTORAL',
   object_type='Opening hours plate (5:00–0:30)', parent=signs, src=PHOTO_SRC)

# yellow exit sign hung over the stair head, read by passengers coming up
ex = m.assembly('Rótulo de salida A4 (interior)', GL, object_type='Exit sign 出口', parent=pav,
                psets={**spec(Text='出口 A4 Exit · 都庁 都議会議事堂'), **am('signage', 12, 5)})
xs_ = GRID[1] + 0.10
el('IfcSign', 'Panel amarillo de salida', sbox(xs_ - 0.03, xs_ + 0.03, -0.85, 0.85, Z_FAS0 - 0.55, 0.42), GL, 'yellow', predefined='PICTORAL',
   object_type='Exit sign 1 700 × 420, internally lit', parent=ex, src=TYP_SRC)
el('IfcMember', 'Cuelgues del rótulo de salida', [scyl(xs_, d, Z_FAS0 - 0.13, 0.008, 0.13) for d in (-0.7, 0.7)], GL, 'stainless', predefined='MEMBER',
   object_type='Suspension rods', parent=ex, src=TYP_SRC)
ink = []
for fc in ('E', 'W'):
    ink += lettering('出口 A4 Exit', 0.13, xs_ + (0.03 if fc == 'E' else -0.03), 0., Z_FAS0 - 0.36, fc, weight='Bold')
    ink += lettering('都庁 · 都議会議事堂', 0.055, xs_ + (0.03 if fc == 'E' else -0.03), 0., Z_FAS0 - 0.50, fc, weight='Medium')
el('IfcSign', 'Rotulación de salida', ink, GL, 'ink', predefined='PICTORAL', object_type='Lettering, both faces', parent=ex, src=TYP_SRC)

# ─── Stair ─────────────────────────────────────────────────────────────────────────────────────────
st = m.assembly('Escalera A4 · Exit stair', STAIR, object_type='Fixed stair to the concourse',
                psets=spec(Risers=N_R, Riser_mm=round(R_H * 1000), Going_mm=round(G * 1000), Width_mm=round(2 * ST_T * 1000),
                           Rise_mm=round(N_R * R_H * 1000)))
prof = [(ST_S0, FL)]
for k in range(N_R - 1):                 # riser k at s_k, then its tread; the last riser lands on the bottom landing
    s_k = ST_S0 + k * G
    prof += [(s_k, FL - (k + 1) * R_H), (s_k + G, FL - (k + 1) * R_H)]
prof += [(ST_S1, Z_BOT), (ST_S1, Z_BOT - 0.25), (ST_S0, FL - 0.35)]
el('IfcStairFlight', 'Tramo de escalera', lsec(prof, -ST_T, ST_T),
   STAIR, 'concrete', predefined='STRAIGHT', object_type='Reinforced concrete flight, granite treads', parent=st, src=PHOTO_SRC,
   psets={**spec(NumberOfRiser=N_R, NumberOfTreads=N_R - 1), **am('structure', 12, 4)})
nos = [sbox(ST_S0 + k * G - 0.0, ST_S0 + k * G + 0.05, -ST_T, ST_T, FL - (k + 1) * R_H, 0.006) for k in range(1, N_R)]
el('IfcCovering', 'Mamperlanes antideslizantes', nos, STAIR, 'nosing', predefined='FLOORING', object_type='Anti-slip stair nosings',
   parent=st, src=PHOTO_SRC, psets=am('finishes', 6, 4))
el('IfcSlab', 'Rellano inferior', sbox(ST_S1, S_END, -1.5, 1.5, Z_BOT - 0.25, 0.25), STAIR, 'concrete', predefined='LANDING',
   object_type='Bottom landing', parent=st, src=TYP_SRC, psets=am('structure', 24, 4))
WALL = [(ST_S0 - 0.2, FL - 0.03), (S_E, FL - 0.03), (S_E, Z_BOT + 2.6), (S_END, Z_BOT + 2.6), (S_END, Z_BOT - 0.25), (ST_S0 - 0.2, Z_BOT - 0.25)]
walls = [lsec(WALL, *sorted((sg * ST_T, sg * (ST_T + 0.20)))) for sg in (1, -1)]
el('IfcWall', 'Muros laterales de la escalera', walls, STAIR, 'concrete', predefined='RETAININGWALL',
   object_type='Retaining walls, granite-lined', parent=st, src=TYP_SRC, psets=am('structure', 24, 4))
lining = [lsec([(ST_S0 - 0.2, FL - 0.03), (S_E, FL - 0.03), (S_E, Z_BOT + 2.6), (S_END, Z_BOT + 2.6),
                (S_END, Z_BOT), (ST_S0 - 0.2, Z_BOT)], *sorted((sg * ST_T, sg * (ST_T - 0.02)))) for sg in (1, -1)]
el('IfcCovering', 'Chapado de granito de la escalera', lining, STAIR, 'granite', predefined='CLADDING',
   object_type='Granite wall lining', parent=st, src=PHOTO_SRC, psets=am('finishes', 24, 4))
el('IfcSlab', 'Techo del paso inferior', sbox(S_E, S_END, -1.6, 1.6, Z_BOT + 2.6, 0.35), STAIR, 'concrete', predefined='ROOF',
   object_type='Passage roof slab under the sidewalk', parent=st, src=TYP_SRC, psets=am('structure', 24, 4))
# handrails: two heights on both walls, following the pitch, with brackets
rails = []
for sg in (1, -1):
    t = sg * (ST_T - 0.07)
    for h in (0.85, 0.65):
        a, b = p3(ST_S0 - 0.3, t, FL + h), p3(ST_S0, t, FL + h)
        c = p3(ST_S1, t, Z_BOT + h + R_H)
        d = p3(ST_S1 + 0.3, t, Z_BOT + h)
        rails += [rod(a, b, 0.017), rod(b, c, 0.017), rod(c, d, 0.017)]
    for k in range(0, N_R, 5):
        s = ST_S0 + k * G
        z = FL - k * R_H + 0.85 - 0.02
        rails.append(rod(p3(s, sg * ST_T, z - 0.04), p3(s, t, z - 0.0), 0.008))
el('IfcRailing', 'Pasamanos de la escalera', rails, STAIR, 'stainless', predefined='HANDRAIL',
   object_type='Stainless handrails Ø34 at 650 and 850', parent=st, src=PHOTO_SRC,
   psets={**spec(Heights_mm='650 / 850', Braille='Tactile plates at both ends'), **am('finishes', 12, 5)})
# guard along the stair opening at floor level in bays 2–4
guard = []
for sg in (1, -1):
    t = sg * (ST_T + 0.12)
    guard += [scyl(s, t, FL, 0.02, 1.10) for s in [GRID[1] + 0.2 + 1.0 * i for i in range(10) if GRID[1] + 0.2 + 1.0 * i < S_E - 0.1]]
    guard += [rod(p3(GRID[1] + 0.2, t, FL + z), p3(S_E - 0.15, t, FL + z), 0.02 if z > 1 else 0.012) for z in (0.55, 1.10)]
el('IfcRailing', 'Barandilla del hueco de escalera', guard, GL, 'stainless', predefined='GUARDRAIL',
   object_type='Stainless guard rail H 1 100 along the stair well', parent=pav, src=PHOTO_SRC, psets=am('finishes', 12, 4))

# ─── Streetscape (every object on the laser ground) ────────────────────────────────────────────────
# sidewalk patch in interlocking pavers, a yellow guidance line along it with a branch to the entrance
SW0, SW1, ST0, ST1 = S_W - 7.0, S_E + 6.0, T_F - 4.6, T_F - 0.0
el('IfcCovering', 'Acera de adoquín', drape(SW0, SW1, ST0, ST1, -0.10, 0.15), STREET, 'pave', predefined='FLOORING',
   object_type='Interlocking concrete pavers 200×100, following the sidewalk\'s fall', src=PHOTO_SRC, psets=am('street', 24, 4))
dark, lite = [], []
for j in range(int((ST1 - ST0) / 0.20)):
    t0 = ST0 + j * 0.20
    s = SW0 + (0.1 if j % 2 else 0.)
    while s < SW1 - 0.2:
        r = hash01(s, t0)
        inside = S_W - 0.3 < s < S_E + 0.3 and t0 > T_F - 0.35
        ramp = ENT[0] - 0.3 < s < ENT[1] + 0.3 and t0 > T_F - 1.7
        if (r < 0.22 or r > 0.86) and not inside and not ramp:
            (dark if r < 0.22 else lite).extend(drape(s + 0.005, s + 0.195, t0 + 0.005, t0 + 0.195, 0.05, 0.004, step=1))
        s += 0.20
el('IfcCovering', 'Adoquines oscuros', dark, STREET, 'pave_d', predefined='FLOORING', object_type='Dark pavers', src=PHOTO_SRC, psets=am('street', 24, 4))
el('IfcCovering', 'Adoquines claros', lite, STREET, 'pave_l', predefined='FLOORING', object_type='Light pavers', src=PHOTO_SRC, psets=am('street', 24, 4))
tg = T_F - 2.6
ec = (ENT[0] + ENT[1]) / 2
el('IfcCovering', 'Línea táctil de la acera', drape(SW0, SW1, tg - 0.15, tg + 0.15, 0.05, 0.007) + drape(ec - 0.15, ec + 0.15, tg + 0.15, T_F - 1.65, 0.05, 0.007)
   + drape(ec - 0.30, ec + 0.30, tg - 0.15, tg + 0.15, 0.057, 0.004),
   STREET, 'tactile', predefined='FLOORING', object_type='Tactile guidance line with a branch to exit A4 (JIS T 9251)', src=PHOTO_SRC,
   psets=am('street', 12, 4))

# area map (周辺案内図), free-standing in front of bay 3
mp = m.assembly('Plano de barrio 周辺案内図 · Area map', STREET, object_type='Free-standing area map',
                psets={**spec(Content='Area map with Tochōmae exits, Shinjuku Chūō Park, the TMG buildings'), **am('signage', 12, 4)})
ms, mt = (GRID[2] + GRID[3]) / 2 + 0.8, T_F - 0.9
zg = ground_under(ms - 0.7, ms + 0.7, mt - 0.1, mt + 0.1)
el('IfcMember', 'Postes del plano', [sbox(ms + d - 0.05, ms + d + 0.05, mt - 0.05, mt + 0.05, zg - 0.05, 2.20) for d in (-0.62, 0.62)], STREET, 'frame',
   predefined='POST', object_type='Map posts 100 × 100', parent=mp, src=PHOTO_SRC)
el('IfcSign', 'Bastidor del plano', sbox(ms - 0.62, ms + 0.62, mt - 0.04, mt + 0.04, zg + 0.70, 1.40), STREET, 'frame', predefined='PICTORAL',
   object_type='Map frame', parent=mp, src=PHOTO_SRC)
MS = mt - 0.04
mapsh = {'map_base': [Polygon([(-0.56, 0.76), (0.56, 0.76), (0.56, 1.92), (-0.56, 1.92)])],
         'map_park': [Polygon([(-0.50, 1.30), (-0.12, 1.32), (-0.10, 1.80), (-0.50, 1.78)])],
         'map_bldg': [Polygon([(0.0, 1.45), (0.22, 1.45), (0.22, 1.75), (0.0, 1.75)]), Polygon([(0.28, 1.50), (0.48, 1.50), (0.48, 1.80), (0.28, 1.80)]),
                      Polygon([(0.05, 0.90), (0.45, 0.90), (0.45, 1.20), (0.05, 1.20)]), Polygon([(-0.50, 0.85), (-0.15, 0.85), (-0.15, 1.18), (-0.50, 1.18)])],
         'map_water': [Polygon([(-0.56, 1.24), (0.56, 1.24), (0.56, 1.28), (-0.56, 1.28)]), Polygon([(-0.06, 0.76), (-0.02, 0.76), (-0.02, 1.92), (-0.06, 1.92)])],
         'oedo': [Polygon([(-0.56, 1.36), (0.56, 1.40), (0.56, 1.42), (-0.56, 1.38)])],
         'red': [Point(-0.03, 1.27).buffer(0.025, 6)]}
lifted = lambda shapes: [Polygon([(x, y + zg) for x, y in g.exterior.coords]) for g in shapes]   # noqa: E731
for k, (mat, shapes) in enumerate(mapsh.items()):
    el('IfcSign', f'Plano — {mat.split("_")[-1]}', plane_shapes(lifted(shapes), ms, MS - 0.004 * k, 'S', 0.003), STREET, mat, predefined='PICTORAL',
       object_type='Area map print layer', parent=mp, src=TYP_SRC)
el('IfcSign', 'Título del plano', plane_shapes(lifted([Polygon([(-0.56, 1.94), (0.56, 1.94), (0.56, 2.06), (-0.56, 2.06)])]), ms, MS, 'S', 0.004), STREET,
   'black', predefined='PICTORAL', object_type='Map title strip', parent=mp, src=PHOTO_SRC)
el('IfcSign', 'Rotulación 周辺案内図', lettering('周辺案内図  Area Map', 0.055, ms, MS - 0.004, zg + 1.975, 'S', weight='Bold'), STREET, 'white',
   predefined='PICTORAL', object_type='Map title lettering', parent=mp, src=PHOTO_SRC)
el('IfcSign', 'Rotulación 現在地', lettering('現在地', 0.035, ms - 0.03, MS - 0.03, zg + 1.21, 'S', weight='Bold'), STREET, 'red',
   predefined='PICTORAL', object_type='«You are here»', parent=mp, src=TYP_SRC)

# direction pillar to the Assembly building and the Citizens' Plaza (vertical lettering)
pl = m.assembly('Poste indicador 都議会議事堂 とみん広場', STREET, object_type='Direction pillar',
                psets={**spec(Text='都議会議事堂 とみん広場 ← / TM Assembly Bldg. Citizens\' Plaza'), **am('signage', 24, 4)})
ps_, pt_ = S_W - 2.6, T_F - 0.7
zg = ground_under(ps_ - 0.2, ps_ + 0.2, pt_ - 0.15, pt_ + 0.15)
el('IfcSign', 'Fuste del poste indicador', sbox(ps_ - 0.18, ps_ + 0.18, pt_ - 0.13, pt_ + 0.13, zg, 2.10), STREET, 'white',
   predefined='PICTORAL', object_type='Pillar 360 × 260 × 2 100, aluminium', parent=pl, src=PHOTO_SRC)
el('IfcSign', 'Base del poste indicador', sbox(ps_ - 0.20, ps_ + 0.20, pt_ - 0.15, pt_ + 0.15, zg - 0.05, 0.35), STREET, 'stainless_d',
   predefined='PICTORAL', object_type='Pillar plinth', parent=pl, src=PHOTO_SRC)
txt = vertical_lettering('都議会議事堂', 0.10, ps_ + 0.07, pt_ - 0.13, zg + 1.98, 'S')
txt += vertical_lettering('とみん広場', 0.10, ps_ - 0.07, pt_ - 0.13, zg + 1.98, 'S')
txt += lettering('←', 0.10, ps_, pt_ - 0.13, zg + 0.75, 'S')
el('IfcSign', 'Rotulación vertical', txt, STREET, 'ink', predefined='PICTORAL', object_type='Vertical lettering', parent=pl, src=PHOTO_SRC)

# planter in front of bay 2, and a granite-kerbed bed west of the pavilion
pc_ = (GRID[1] + 0.9, T_F - 3.6)
zg = ground_under(pc_[0] - 0.8, pc_[0] + 0.8, pc_[1] - 0.32, pc_[1] + 0.32)
el('IfcFurniture', 'Jardinera de hormigón', sbox(pc_[0] - 0.80, pc_[0] + 0.80, pc_[1] - 0.32, pc_[1] + 0.32, zg - 0.05, 0.67),
   STREET, 'planter', predefined='USERDEFINED', object_type='Precast planter 1 600 × 640 × 620', src=PHOTO_SRC, psets=am('street', 6, 4))
el('IfcGeographicElement', 'Arbustos de la jardinera',
   [m.revolve(Model.dome_profile(0.30, 0.32, n=5), *P(pc_[0] + d, pc_[1]), zg + 0.62) for d in (-0.5, 0.0, 0.5)], STREET, 'foliage',
   predefined='VEGETATION', object_type='Seasonal shrubs', src=PHOTO_SRC,
   psets={'Pset_CDE_Vegetation': {'Species': 'Mixed seasonal planting', 'Plants': 3}, **am('street', 3, 5)})
el('IfcGeographicElement', 'Flores de la jardinera', [m.box(*P(pc_[0] + d, pc_[1] + e), zg + 0.88 + 0.05 * hash01(d, e), 0.10, 0.10, 0.06, angle=ANG + d)
                                                    for d, e in ((-0.6, 0.1), (-0.3, -0.12), (0.1, 0.14), (0.35, -0.1), (0.6, 0.12))],
   STREET, 'bloom', predefined='VEGETATION', object_type='Blooms', src=PHOTO_SRC, psets=am('street', 3, 5))
bed = (S_W - 4.8, S_W - 0.35, T_F + 0.15, T_B + 0.9)
zg = ground_under(*bed)
el('IfcCovering', 'Bordillo de granito del parterre', [sbox(bed[0], bed[1], bed[2], bed[2] + 0.18, zg - 0.1, 0.58), sbox(bed[0], bed[0] + 0.18, bed[2], bed[3], zg - 0.1, 0.58),
                                                       sbox(bed[1] - 0.18, bed[1], bed[2], bed[3], zg - 0.1, 0.58)],
   STREET, 'granite', predefined='CLADDING', object_type='Granite planter kerb H 480', src=PHOTO_SRC, psets=am('street', 24, 4))
hedge = [m.revolve(Model.dome_profile(0.55, 0.85, n=5), *P(bed[0] + 0.7 + 0.95 * i, (bed[2] + bed[3]) / 2 + 0.2 * math.sin(i)), zg + 0.30) for i in range(5)]
el('IfcGeographicElement', 'Seto del parterre', hedge, STREET, 'foliage_d', predefined='VEGETATION', object_type='Clipped evergreen shrubs',
   src=PHOTO_SRC, psets={'Pset_CDE_Vegetation': {'Species': 'Rhododendron, Pittosporum', 'Plants': len(hedge)}, **am('street', 6, 4)})


def to_st(x, y):
    """Model x, y (metres from the OSM node) to the pavilion frame."""
    dx, dy = x - O[0], y - O[1]
    return dx * U[0] + dy * U[1], dx * N[0] + dy * N[1]


def blob(c, r, n=5):
    """A low-poly sphere of foliage."""
    prof = [(0., -r)] + [(r * math.sin(math.pi * i / n), -r * math.cos(math.pi * i / n)) for i in range(1, n)] + [(0., r)]
    return m.revolve(prof, c[0], c[1], c[2])


def zelkova(name, s, t, height, seed, src):
    """A Japanese zelkova (keyaki), the street tree of Nishi-Shinjuku: a short trunk forking into a vase of limbs
    under a broad, uneven crown."""
    zg = gz(s, t) - 0.1
    a = m.assembly(name, STREET, object_type='Street tree, Zelkova serrata',
                   psets={'Pset_CDE_Vegetation': {'Species': 'Zelkova serrata (keyaki)', 'Height_m': height, 'CrownDiameter_m': round(height * 0.75, 1)},
                          **am('street', 12, 4)})
    trunk = [m.revolve([(0, 0), (0.30, 0), (0.21, 0.6), (0.17, height * 0.30), (0, height * 0.30)], *P(s, t), zg)]
    fork = p3(s, t, zg + height * 0.29)
    limbs, masses = [], []
    for k in range(6):
        ang = seed + k * 2 * math.pi / 6 + 0.35 * math.sin(seed * 7 + k)
        reach = height * (0.20 + 0.08 * hash01(seed, k))
        knee = (fork[0] + 0.45 * reach * math.cos(ang), fork[1] + 0.45 * reach * math.sin(ang), fork[2] + height * 0.18)
        tip = (fork[0] + reach * math.cos(ang), fork[1] + reach * math.sin(ang), zg + height * (0.66 + 0.08 * hash01(k, seed)))
        limbs += [rod(fork, knee, 0.12), rod(knee, tip, 0.07)]
        for j in range(3):                                   # three foliage masses round each limb's end
            b2 = ang + (j - 1) * 0.7 + 0.3 * hash01(seed, k, j)
            d = height * 0.07 * (1 + hash01(j, k, seed))
            r = height * (0.10 + 0.05 * hash01(seed, j, k))
            masses.append(((tip[0] + d * math.cos(b2), tip[1] + d * math.sin(b2), tip[2] + height * 0.05 * (hash01(k, j) - 0.3)), r))
    for j in range(4):                                       # and the crown's dome over the fork
        b2 = seed + j * math.pi / 2
        masses.append(((fork[0] + height * 0.08 * math.cos(b2), fork[1] + height * 0.08 * math.sin(b2), zg + height * 0.82), height * 0.15))
    el('IfcGeographicElement', f'Tronco y ramas — {name}', trunk + limbs, STREET, 'bark', predefined='VEGETATION', parent=a,
       object_type='Trunk and main limbs', src=src)
    shades = ('leaf_a', 'leaf_b', 'leaf_c')
    for i, mat in enumerate(shades):
        el('IfcGeographicElement', f'Copa ({mat[-1]}) — {name}', [blob(c, r) for c, r in masses[i::3]], STREET, mat,
           predefined='VEGETATION', parent=a, object_type='Crown, foliage masses', src=src)


TREE_SRC = ('OpenStreetMap natural=tree node (ODbL); species and size typical of the Nishi-Shinjuku street trees', 'Low')
zelkova('Zelkova junto al parterre', bed[0] + 1.6, (bed[2] + bed[3]) / 2, 11.0, 0.7, PHOTO_SRC)
zelkova('Zelkova nordeste (OSM 1701045771)', *to_st(15.21, 12.4), 12.5, 2.1, TREE_SRC)
zelkova('Zelkova de la acera este', S_E + 5.4, T_F - 4.2, 10.0, 4.2, PHOTO_SRC)

# park lamp with an opal globe (2010 photograph, left of the pavilion)
lp = m.assembly('Farola de globo · Park lamp', STREET, object_type='Pedestrian lamp, globe luminaire',
                psets={**spec(Power_W=40, Lamp='LED, 3 000 K', Height_mm=3800), **am('street', 12, 4)})
ls_, lt_ = S_W - 1.3, T_F - 4.1
zg = gz(ls_, lt_) - 0.05
el('IfcMember', 'Fuste de la farola', [m.revolve([(0, 0), (0.12, 0), (0.12, 0.35), (0.07, 0.45), (0.05, 3.55), (0, 3.55)], *P(ls_, lt_), zg)],
   STREET, 'frame', predefined='POST', object_type='Cast aluminium column', parent=lp, src=PHOTO_SRC)
globe = [(0, 0)] + [(0.24 * math.sin(math.pi * i / 10), 0.24 - 0.24 * math.cos(math.pi * i / 10)) for i in range(1, 10)] + [(0, 0.48)]
el('IfcLightFixture', 'Globo de la farola', m.revolve(globe, *P(ls_, lt_), zg + 3.55), STREET, 'lamp_glass', predefined='POINTSOURCE',
   object_type='Opal globe Ø480', parent=lp, src=PHOTO_SRC, psets=am('equipment', 12, 4))

# Toei bus stop 都庁第一本庁舎 (OSM node 1701045773), behind the pavilion
bs = m.assembly('Parada de autobús Toei 都庁第一本庁舎', STREET, object_type='Bus stop pole (都営バス)',
                psets={**spec(Name='都庁第一本庁舎 Tocho-daiichi-choshamae', Operator='Toei Bus'), **am('signage', 12, 4)})
bs_, bt_ = to_st(-16.68, 7.82)
zg = gz(bs_, bt_) - 0.05
el('IfcMember', 'Base y poste de la parada', [m.revolve([(0, 0), (0.30, 0), (0.30, 0.06), (0.10, 0.14), (0, 0.14)], *P(bs_, bt_), zg),
                                              scyl(bs_, bt_, zg, 0.035, 2.75)], STREET, 'stainless_d', predefined='POST',
   object_type='Weighted bus-stop pole', parent=bs, src=OSM_SRC)
el('IfcSign', 'Disco de la parada', plane_shapes([Point(0, zg + 2.45).buffer(0.26, 16)], bs_, bt_ - 0.04, 'S', 0.02), STREET, 'white',
   predefined='PICTORAL', object_type='Stop disc Ø520', parent=bs, src=TYP_SRC)
el('IfcSign', 'Marca del disco', plane_shapes([Polygon([(-0.12, zg + 2.40), (0.12, zg + 2.40), (0.12, zg + 2.62), (-0.12, zg + 2.62)])], bs_, bt_ - 0.06, 'S', 0.003)
   + plane_shapes([ginkgo(0, zg + 2.51, 0.09)], bs_, bt_ - 0.063, 'S', 0.003), STREET, 'toei_green',
   predefined='PICTORAL', object_type='Toei mark', parent=bs, src=TYP_SRC)
el('IfcSign', 'Rotulación 都営バス', lettering('都営バス', 0.055, bs_, bt_ - 0.06, zg + 2.27, 'S', weight='Bold'), STREET, 'ink',
   predefined='PICTORAL', object_type='Lettering', parent=bs, src=TYP_SRC)
el('IfcSign', 'Caja de horarios', sbox(bs_ - 0.20, bs_ + 0.20, bt_ - 0.08, bt_ - 0.035, zg + 0.95, 1.0), STREET, 'white',
   predefined='PICTORAL', object_type='Timetable case 400 × 1 000', parent=bs, src=TYP_SRC)
el('IfcSign', 'Rotulación 都庁第一本庁舎', vertical_lettering('都庁第一本庁舎', 0.085, bs_ + 0.12, bt_ - 0.08, zg + 1.92, 'S'), STREET, 'ink',
   predefined='PICTORAL', object_type='Stop name, vertical', parent=bs, src=OSM_SRC)

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'tochomae-a4-entrance.ifc')
m.finish(out)
print('written', out, len(m.f.by_type('IfcProduct')), 'products')
