"""Fonts Bessones — the twin fountains in the centre of Plaça de Catalunya, as an authored IFC4X3 model.

What it holds, in the central oval of Plaça de Catalunya, Barcelona:
  * the two fountains of the Fonts Bessones («Twin Fountains», 1959, architect Fernando Espiau Seoane per OSM
    multipolygon relation 21286243): the south-west basin (way 128230180) and the north-east one (way 128230181).
    Each is a raised circular stone basin whose water stands level with its coping and overflows all round, as a
    thin sheet down the outer face, into a collector channel at the foot; the strip footing, the basin wall and
    its rounded coping, the backfill and floor slab, the waterproof lining, the water body, the overflow sheet,
    the channel with its water and four gully outlets, the granite paving ring;
  * the water features: a central foam jet, a ring of eight tall vertical jets, a ring of 24 jets arcing inwards
    and an outer ring of 32 low arcs — every nozzle a bronze terminal of its own, with the running water as
    one element per ring — the ring mains and spokes on the basin floor, 32 underwater LED lights, the basin
    floor drain and a water-level probe;
  * the buried plant room beside each basin, as a hint of what serves it: the chamber, its roof slab with a
    trapdoor hatch and ladder, the balance tank, the jet pump and the filtration pump, the sand filter, valves, the
    make-up water connection with its meter, the control panel, the delivery main, the overflow return, the
    drain and the sewer connection;
  * the eight stone sculptures standing at and around the fountains (OSM tourism=artwork, within 25 m):
    El Forjador (Josep Llimona) and Joventut (Josep Clarà) on plinths at the rim, and Noia (Josep Dunyach),
    Pastor del flabiol (Pau Gargallo), Maternitat (Vicenç Navarro), La Navegació (Eusebi Arnau), Figura femenina
    (Enric Casanovas) and Dona amb nen i flabiol (Josep Viladomat) on the paths beside them — simplified but
    recognisable figures (pose and attributes from Wikimedia Commons photographs) on their plinths;
  * the lawn and the plaza paving over the places where this model replaces the photogrammetric mesh.

Detailed geometry (roughly LOD 400) carrying LOD 500-style asset data, so a click on any element shows what an
as-built asset register would hold. It is NOT the owners' as-built model and the asset values are invented:
every element says so in Pset_CDE_AssetManagement (demo) and Pset_CDE_Provenance.

What is real:
  * positions and sizes from OpenStreetMap (© OpenStreetMap contributors, ODbL), via the OSM API on 2026-10-01:
    the basin walls (ways 128230180, 128230181: circles of r ≈ 8.87 and 8.75 m), the pond outlines around them
    (ways 305707371, 305707372, r ≈ 9.81 and 9.87 m), the fountain relation 21286243 (name, architect, 1959,
    stone), the eight artwork nodes (5170812384–5170812392: title, artist, material, date where tagged) and the
    lawn (way 128230179) — all in landmarks/fonts_bessones_site.json;
  * levels from ICGC's photogrammetric Barcelona mesh (ellipsoidal, raw): 70.18 m at the origin, 70.11 / 70.06 m
    on the ground around the SW / NE basin, and the water surface at 71.67 / 71.65 m, so the water stands
    ≈ 1.56 / 1.59 m above the surrounding ground;
  * the overflowing rim, the jet arrangement (tall central jets, rings of arcs, short dark nozzle stems), the
    underwater lights and the sculptures' poses: Wikimedia Commons «Category:Fonts Bessones (Plaça de Catalunya,
    Barcelona)» and the sculptures' own categories.
What is estimated, not measured: the wall thickness and coping, the water depth (0.42 m), the channel, every
nozzle and light count and position, the jet heights, everything below ground (footing, fill, pipework, plant
rooms — whose position is illustrative; the square sits over the metro and rail vestibules), all sculpture and
plinth dimensions, and all asset-register values.

Local axes: +x east, +y north, metres, origin at the midpoint between the centroids of the two basin ways,
z = 0 on the ground there, which the ICGC mesh puts at 70.18 m ellipsoidal (≈ 20.48 m above the Alicante datum:
EGM08 undulation ≈ 49.70 m).

Scene tiles: anchored at h = 70.18 (the raw, ellipsoidal mesh height) and linked with the same placement as the
ICGC mesh, ELLIPSOIDAL −49.70, so model and mesh move together if that offset is ever corrected.

usage: uv run --with ifcopenshell --with pyproj python landmarks/fonts_bessones.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/fonts-bessones.ifc src/fonts-bessones_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/fonts-bessones_qto.ifc \
           tiles/barcelona-fonts-bessones 41.387399 2.169636 70.18 0 --keep-origin \
           --wfs tiles/wfs/barcelona-fonts-bessones --wfs-name barcelona_fonts_bessones_features \
           --extras src/fonts-bessones_cutouts.json
"""
import json, math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model  # noqa: E402
from pyproj import Transformer  # noqa: E402

HERE = os.path.dirname(__file__)
SITE = json.load(open(os.path.join(HERE, 'fonts_bessones_site.json'), encoding='utf-8'))
LAT0, LON0 = SITE['origin']['lat'], SITE['origin']['lon']
RAW0 = SITE['datum_raw_ellipsoidal']
ELEV0 = round(RAW0 + SITE['icgc_offset_m'], 2)          # ≈ orthometric (Alicante)
LVR = SITE['levels_raw']
BCN_CRS = (25831, 'ETRS89 / UTM zone 31N', 'ETRS89', 'Alicante (REDNAP)')

m = Model('Fonts Bessones — Plaça de Catalunya', 'Plaça de Catalunya, central oval',
          'Fonts Bessones · Twin fountains of Plaça de Catalunya', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 model (≈LOD 400 geometry, LOD 500-style asset data with demo values). '
                      'Positions © OpenStreetMap contributors (ODbL); levels measured on the ICGC 3D mesh. '
                      'Not the owners\' as-built model.',
          tag_prefix='FBES', crs=BCN_CRS, schema='IFC4X3_ADD2')

# The model's +y is true north; UTM grid north is not. Give the map conversion the grid direction of +x.
_tr = Transformer.from_crs(4326, 25831, always_xy=True)
_e0, _n0 = _tr.transform(LON0, LAT0)
_e1, _n1 = _tr.transform(LON0, LAT0 + 100 / 110574)
_alpha = math.atan2(_e1 - _e0, _n1 - _n0)              # grid azimuth of true north
_mc = m.f.by_type('IfcMapConversion')[0]
_mc.XAxisAbscissa, _mc.XAxisOrdinate = math.cos(_alpha), -math.sin(_alpha)

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('stone', 'Sandstone ashlar, warm ochre', (0.74, 0.62, 0.45), 'Stone', 2300,
  'Basin wall facing and coping: the warm ochre stone seen in photographs (OSM material=stone)')
M('granite', 'Granite, flamed finish, grey', (0.58, 0.57, 0.55), 'Stone', 2650, 'Paving ring and channel kerb')
M('concrete', 'Reinforced concrete C30/37', (0.66, 0.65, 0.62), 'Concrete', 2400)
M('fill', 'Compacted granular fill', (0.55, 0.47, 0.36), 'Soil', 1900)
M('lining', 'Cementitious waterproof lining, painted blue-grey', (0.30, 0.40, 0.44), 'Concrete', 2000)
M('water', 'Water (basin)', (0.30, 0.50, 0.52), 'Water', 1000, 'Recirculated, filtered fountain water', transparency=0.55)
M('jet', 'Water (aerated jets)', (0.90, 0.95, 0.97), 'Water', 1000, 'Running state of the jets', transparency=0.45)
M('bronze', 'Bronze, patinated dark', (0.30, 0.22, 0.13), 'Copper alloy', 8800, 'Nozzle stems and heads')
M('inox', 'Stainless steel AISI 316L', (0.76, 0.77, 0.78), 'Steel', 8000, 'Ring mains, light housings, fittings')
M('lens', 'LED underwater light, tempered glass lens', (1.00, 0.93, 0.70), 'Glass', 2500)
M('ductile', 'Ductile iron, coated', (0.20, 0.21, 0.22), 'Iron', 7100)
M('steel', 'Hot-dip galvanised steel', (0.62, 0.64, 0.65), 'Steel', 7850)
M('pvc', 'PVC-U pressure pipe, grey', (0.45, 0.47, 0.50), 'Plastic', 1400)
M('pvc_sewer', 'PVC-U sewer pipe, orange-brown', (0.70, 0.36, 0.16), 'Plastic', 1400)
M('pe', 'Polyethylene PE100, blue (potable water)', (0.13, 0.25, 0.60), 'Plastic', 960)
M('grp', 'Glass-reinforced plastic', (0.40, 0.55, 0.62), 'Plastic', 1800)
M('pump', 'Pump casing, cast iron, painted blue', (0.12, 0.28, 0.55), 'Iron', 7200)
M('cabinet', 'Steel cabinet, powder-coated RAL 7035', (0.80, 0.81, 0.79), 'Steel', 7850)
M('brass', 'Dezincification-resistant brass', (0.78, 0.65, 0.30), 'Copper alloy', 8500)
M('lawn', 'Lawn on topsoil', (0.36, 0.52, 0.25), 'Vegetation', 1600)
M('paving', 'Plaza paving, light grey', (0.72, 0.71, 0.68), 'Stone', 2400)
M('sculpt', 'Limestone, weathered (OSM material=stone)', (0.80, 0.76, 0.67), 'Stone', 2500,
  'The plaza\'s 1920s stone sculptures')
M('marble', 'White marble (appearance; OSM material=stone)', (0.90, 0.89, 0.86), 'Stone', 2700)
M('plinth', 'Limestone plinth blocks', (0.74, 0.71, 0.64), 'Stone', 2500)

# ─── Geometry helpers ──────────────────────────────────────────────────────────────────────────────
f = m.f


def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def _perp(d):
    a = (0., 0., 1.) if abs(d[2]) < 0.9 else (1., 0., 0.)
    c = (d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0])
    return _unit(c)


def _ngon_n(r):
    return 6 if r <= 0.03 else 8 if r <= 0.12 else 12 if r <= 0.5 else 24


def rod(p0, p1, r, n=None):
    """Bar from p0 to p1 (3D points): an n-gon prism (low polygon count; radius r to the vertices)."""
    d = tuple(b - a for a, b in zip(p0, p1))
    L = math.sqrt(sum(c * c for c in d))
    u = _unit(d)
    n = n or _ngon_n(r)
    pts = [f.createIfcCartesianPoint((float(r * math.cos(2 * math.pi * j / n)), float(r * math.sin(2 * math.pi * j / n))))
           for j in range(n)]
    prof = f.createIfcArbitraryClosedProfileDef('AREA', None, f.createIfcPolyline(pts + [pts[0]]))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=u, ref=_perp(u)), f.createIfcDirection((0., 0., 1.)), float(L))


def loft(cx, cy, z0, rz, n=8, phase=0.):
    """Closed faceted solid of revolution (n facets) for a profile [(r, z)] with z non-decreasing; a profile that
    starts or ends on the axis (r = 0) closes there with a flat cap (same z) or a cone tip (higher / lower z)."""
    pts = [(0. if r < 1e-6 else r, z) for r, z in rz]
    while len(pts) > 2 and pts[0][0] == 0 and pts[1][0] == 0:
        pts.pop(1)
    while len(pts) > 2 and pts[-1][0] == 0 and pts[-2][0] == 0:
        pts.pop(-2)
    bot = top = None
    if pts[0][0] == 0:
        b = pts.pop(0)
        bot = None if abs(b[1] - pts[0][1]) < 1e-9 else b[1]
    if pts[-1][0] == 0:
        t = pts.pop()
        top = None if abs(t[1] - pts[-1][1]) < 1e-9 else t[1]
    verts, rings = [], []
    for r, z in pts:
        rings.append(list(range(len(verts), len(verts) + n)))
        verts += [(cx + r * math.cos(phase + 2 * math.pi * j / n), cy + r * math.sin(phase + 2 * math.pi * j / n), z0 + z)
                  for j in range(n)]
    faces = []
    for a, b in zip(rings, rings[1:]):
        faces += [(a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]) for j in range(n)]
    if bot is None:
        faces.append(tuple(reversed(rings[0])))
    else:
        verts.append((cx, cy, z0 + bot)); ap = len(verts) - 1
        faces += [(ap, rings[0][(j + 1) % n], rings[0][j]) for j in range(n)]
    if top is None:
        faces.append(tuple(rings[-1]))
    else:
        verts.append((cx, cy, z0 + top)); ap = len(verts) - 1
        faces += [(rings[-1][j], rings[-1][(j + 1) % n], ap) for j in range(n)]
    return m.brep(verts, faces)


def _monotonic(rz):
    return rz[0][0] == 0 and rz[-1][0] == 0 and all(b[1] >= a[1] - 1e-9 for a, b in zip(rz, rz[1:]))


def ball(x, y, z, r):
    lat = (-60, -30, 0, 30, 60) if r > 0.08 else (-45, 0, 45)
    prof = [(0., -r)] + [(r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a in lat] + [(0., r)]
    return loft(x, y, z, prof, n=8 if r > 0.08 else 6)


def polyline_rods(pts, r):
    return [rod(a, b, r) for a, b in zip(pts, pts[1:])]


class Frame:
    """A plan frame: s along `bearing` (degrees from north, clockwise), t to its left, z up from `z0`."""

    def __init__(self, origin, bearing, z0=0.):
        b = math.radians(bearing)
        self.o, self.z0 = origin, z0
        self.u = (math.sin(b), math.cos(b))
        self.L = (-self.u[1], self.u[0])
        self.ang = math.atan2(self.u[1], self.u[0])
        self.bearing = bearing

    def P(self, s, t):
        return (self.o[0] + s * self.u[0] + t * self.L[0], self.o[1] + s * self.u[1] + t * self.L[1])

    def p3(self, s, t, z):
        x, y = self.P(s, t)
        return (x, y, self.z0 + z)

    def polar(self, r, phi, z):
        """Point at radius r, angle phi (degrees from +s towards +t), height z."""
        a = math.radians(phi)
        return self.p3(r * math.cos(a), r * math.sin(a), z)

    def box(self, s0, s1, t0, t1, z0, h):
        cx, cy = self.P((s0 + s1) / 2, (t0 + t1) / 2)
        return m.box(cx, cy, self.z0 + z0, abs(s1 - s0), abs(t1 - t0), h, angle=self.ang)

    def rbox(self, r0, r1, phi, w, z0, h):
        """Box spanning radius r0..r1 along direction phi, w wide tangentially."""
        a = math.radians(phi)
        cx, cy = self.P((r0 + r1) / 2 * math.cos(a), (r0 + r1) / 2 * math.sin(a))
        return m.box(cx, cy, self.z0 + z0, abs(r1 - r0), w, h, angle=self.ang + a)

    def cyl(self, r, z0, h, s=0., t=0.):
        x, y = self.P(s, t)
        if r >= 1.0:
            return m.cylinder(x, y, self.z0 + z0, r, h)
        n = _ngon_n(r)
        return m.prism([(x + r * math.cos(2 * math.pi * j / n), y + r * math.sin(2 * math.pi * j / n)) for j in range(n)],
                       self.z0 + z0, h)

    def ring(self, r_in, r_out, z0, h, s=0., t=0.):
        return m.tube(*self.P(s, t), self.z0 + z0, r_out, r_in, h)

    def rev(self, rz, z0, s=0., t=0., n=None):
        x, y = self.P(s, t)
        if _monotonic(rz):
            rmax = max(r for r, _ in rz)
            return loft(x, y, self.z0 + z0, rz, n=n or (6 if rmax < 0.06 else 8 if rmax < 0.2 else 12))
        return m.revolve(rz, x, y, self.z0 + z0)

    def sphere(self, s, t, z, r, n=None):
        return ball(*self.p3(s, t, z), r)


def circle_pts(fr, r, n, z, phase=0.):
    return [fr.polar(r, phase + 360. * k / n, z) for k in range(n + 1)]


# ─── Mesh cut-outs ─────────────────────────────────────────────────────────────────────────────────
# The ICGC mesh already holds the real fountains and sculptures as photogrammetric lumps, and the IFC stands
# inside them. Each volume below is where this model *replaces* the mesh: the scene hides the ground mesh inside
# it while the model is shown (written to tileset.json `extras.cdeMeshCutouts`, read by CDE-Frontend). A 2.5D mesh
# has no ground under a lump, so where a cut leaves a hole the model lays lawn or plaza paving over it.
CUTOUTS = []
PATCH_TOP, CUT_FLOOR = 0.03, 0.06       # above each ground level: patch top, and where the cut starts
PATCH_MARGIN = 0.25


def cutout(frame, name, s, t, z):
    """Register a cut-out box in a plan frame: s, t ranges; z range relative to the frame's z0."""
    x, y = frame.P(0, 0)
    lon = LON0 + x / (111320 * math.cos(math.radians(LAT0)))
    lat = LAT0 + y / 110574
    CUTOUTS.append({'name': name, 'lon': round(lon, 8), 'lat': round(lat, 8), 'bearing': round(frame.bearing % 360, 3),
                    's': [round(v, 3) for v in s], 't': [round(v, 3) for v in t],
                    'z': [round(frame.z0 + v, 3) for v in z]})


# ─── Asset data ────────────────────────────────────────────────────────────────────────────────────
YEAR = {'structure': 1959, 'stone': 1959, 'jets': 2017, 'light': 2019, 'hydraulic': 2017, 'mech': 2017,
        'controls': 2021, 'paving': 2015, 'ground': 2023, 'sculpture': 1928}
WARRANTY_Y = {'structure': 0, 'stone': 0, 'jets': 5, 'light': 5, 'hydraulic': 10, 'mech': 3, 'controls': 3,
              'paving': 10, 'ground': 1, 'sculpture': 0}
CODE = {'structure': 'OBC', 'stone': 'OBC', 'jets': 'BRL', 'light': 'ENL', 'hydraulic': 'AIG', 'mech': 'BOM',
        'controls': 'CTL', 'paving': 'PAV', 'ground': 'JAR', 'sculpture': 'ESC'}
DATA_STATUS = 'Illustrative demo values — not the owner\'s as-built register'
_serial = {}


def _add_months(iso, months):
    y, mo, d = map(int, iso.split('-'))
    mo += months
    y, mo = y + (mo - 1) // 12, (mo - 1) % 12 + 1
    return f'{y:04d}-{mo:02d}-{min(d, 28):02d}'


def am(kind, interval_months, condition, owner, manufacturer, model, contractor, last='2026-06-17', year=None, **extra):
    """Pset_CDE_AssetManagement (demo): the fields an as-built asset register holds, with invented values."""
    code = CODE[kind]
    n = _serial.get(code, 0) + 1
    _serial[code] = n
    y = year or YEAR[kind]
    w = WARRANTY_Y[kind]
    warranty = 'None (heritage asset, pre-dates warranties)' if w == 0 else \
        (f'{y + w}-12-31' + (' (expired)' if y + w < 2026 else ''))
    base = {'DataStatus': DATA_STATUS, 'AssetOwner': owner, 'Manufacturer': manufacturer, 'Model': model,
            'SerialNumber': f'BCN-{code}-FBES-{n:03d}',
            'LifecycleStatus': 'In service', 'InstallationYear': y, 'LastInspection': last,
            'InspectionInterval_months': interval_months, 'NextInspection': _add_months(last, interval_months),
            'ConditionIndex_1to5': condition, 'WarrantyEnd': warranty, 'MaintenanceContractor': contractor,
            'MaintenanceStrategy': {'mech': 'Time-based (run hours) and condition-based',
                                    'controls': 'Time-based', 'ground': 'Seasonal programme'}.get(kind, 'Condition-based')}
    base.update({k: v for k, v in extra.items() if v is not None})
    return {'Pset_CDE_AssetManagement (demo)': base}


def spec(**props):
    return {'Pset_CDE_Specification': props}


def prov(src):
    return {'Pset_CDE_Provenance': {'GeometrySource': src[0], 'Confidence': src[1], 'Reference': src[2] if len(src) > 2 else None}}


AJ = 'Ajuntament de Barcelona (owner and operator of the square; register values are demo)'
AJ_ART = 'Ajuntament de Barcelona — public art collection (demo)'
AJ_PARKS = 'Ajuntament de Barcelona — parks and gardens (demo)'
CON_FNT = 'Demo contractor — ornamental fountains'
CON_LGT = 'Demo contractor — fountain lighting'
CON_HYD = 'Demo contractor — fountain hydraulics'
CON_CIV = 'Demo contractor — civil works and stone'
CON_ART = 'Demo conservator — stone sculpture'
CON_GRD = 'Demo contractor — urban gardening'
ESPIAU = 'Fonts Bessones, design by Fernando Espiau Seoane (1959, per OSM relation 21286243)'

FNT_REF = ('OSM ways 128230180, 128230181, 305707371, 305707372, relation 21286243; ICGC Barcelona mesh; '
           'Wikimedia Commons «Category:Fonts Bessones (Plaça de Catalunya, Barcelona)»')
OSM_GEO = ('Plan circle from the OSM way (ODbL); heights from the ICGC 3D mesh', 'Medium', FNT_REF)
FNT_EST = ('Seen in photographs; dimensions estimated around the OSM outline and ICGC levels', 'Medium', FNT_REF)
JET_SRC = ('Jet arrangement as seen in photographs (central jets, rings of arcs); counts and positions estimated', 'Low', FNT_REF)
BELOW_SRC = ('Below ground or under water: not visible in any open source; typical for a recirculating ornamental fountain', 'Low')
PLANT_SRC = ('Plant room: existence and position illustrative (the square sits over the metro and rail vestibules)', 'Low')
GROUND_SRC = ('Lawn from OSM way 128230179 (landuse=grass, ODbL), paving elsewhere; level from the ICGC mesh', 'Medium',
              'OSM way 128230179; ICGC Barcelona mesh')

# ─── Spatial structure ─────────────────────────────────────────────────────────────────────────────
PLAZA = 'Plaça de Catalunya · Plaza level'
BELOW = 'Instal·lacions soterrades · Below ground'
m.storey(PLAZA, 0., 'The central oval of Plaça de Catalunya, at the ground around the fountains')
m.storey(BELOW, -3.1, 'Buried plant rooms, pipework and foundations')

# ═══ 1. The two fountains ═════════════════════════════════════════════════════════════════════════
NOZ = {'central': 1, 'inner': 8, 'arc': 24, 'outer': 32}
R_INNER, R_ARC, R_OUTER = 1.4, 4.2, 6.6
WATER_DEPTH = 0.42


def fountain(key):
    fo = SITE['fountains'][key]
    side = fo['label']
    cx, cy = fo['basin_wall']['centroid']
    R_W = fo['basin_wall']['r_equiv']                       # outer face of the basin wall (OSM wall way)
    R_P = fo['pond_outline']['r_equiv']                      # outer edge of the collector channel (OSM pond way)
    z0 = round(LVR[f'ground_{key}'] - RAW0, 2)
    WL = round(LVR[f'water_{key}'] - LVR[f'ground_{key}'], 2)  # water level above the ground around it
    FL = round(WL - WATER_DEPTH, 2)                          # top of the basin floor
    R_I = R_W - 0.55                                         # inner face of the wall
    F = Frame((cx, cy), 0., z0)                              # s north, t west
    # direction pointing away from the plaza centre (the origin), as a Frame angle (from +s=north towards +t=west)
    out_phi = math.degrees(math.atan2(-cx, cy))
    tag = f'{key} ({side})'
    nm = {'A': 'Font sud-oest', 'B': 'Font nord-est'}[key]
    way = fo['basin_wall']['way']

    fnt = m.assembly(f'{nm} · {side.capitalize()} fountain', PLAZA, object_type='Ornamental fountain, raised overflowing basin',
                     description='One of the Fonts Bessones («Twin Fountains») of Plaça de Catalunya.',
                     psets={**spec(OSMWay=way, OSMRelation=21286243, Architect='Fernando Espiau Seoane (per OSM)',
                                   Built=1959, BasinDiameter_m=round(2 * R_W, 2), OverallDiameter_m=round(2 * R_P, 2),
                                   WaterLevelAboveGround_m=WL, WaterDepth_m=WATER_DEPTH,
                                   WaterVolume_m3=round(math.pi * R_I ** 2 * WATER_DEPTH, 1),
                                   Nozzles=sum(NOZ.values()), UnderwaterLights=32, Recirculating=True,
                                   HeritageStatus='Municipal heritage (demo — not checked)'),
                            **am('structure', 6, 4, AJ, 'Original civil works (1959)', ESPIAU, CON_FNT,
                                 LastRefurbishment='2017 (jets and plant, demo)', OperatingHours='10:00–23:00 (demo)'),
                            **prov(OSM_GEO)})

    # --- structure -----------------------------------------------------------------------------
    st = m.assembly(f'Vas i estructura {key} · Basin structure {tag}', None, object_type='Basin structure', parent=fnt,
                    psets={**am('structure', 12, 4, AJ, 'Original civil works (1959)', ESPIAU, CON_CIV), **prov(OSM_GEO)})
    m.element('IfcFooting', f'Fonament corregut {key} · Strip footing {tag}', F.ring(R_W - 0.85, R_W + 0.15, -0.90, 0.40),
              BELOW, 'concrete', predefined='STRIP_FOOTING', object_type='Ring strip footing under the basin wall',
              parent=st, src=BELOW_SRC,
              psets={**spec(Width_mm=1000, Depth_mm=400, Concrete='C25/30 (assumed)'),
                     **am('structure', 120, 4, AJ, 'Original civil works (1959)', 'Mass-concrete ring footing', CON_CIV)})
    m.element('IfcWall', f'Mur del vas {key} · Basin wall {tag}', F.ring(R_I, R_W, -0.50, WL - 0.13 + 0.50), PLAZA, 'stone',
              predefined='SOLIDWALL', object_type='Circular basin wall, concrete core faced in ochre stone', parent=st,
              src=OSM_GEO, common={'LoadBearing': True},
              psets={**spec(OuterDiameter_m=round(2 * R_W, 2), Thickness_mm=550, HeightAboveGround_m=round(WL - 0.13, 2),
                            Facing='Sandstone ashlar 300 mm courses (as seen)', OSMWay=way),
                     **am('stone', 12, 3 if key == 'A' else 4, AJ, 'Original civil works (1959)', ESPIAU, CON_CIV,
                          Note='Efflorescence and scaling at the waterline on the south face (demo)' if key == 'A' else None)})
    cop = [(R_I - 0.07, 0.), (R_W - 0.02, 0.), (R_W + 0.03, 0.03), (R_W + 0.05, 0.07), (R_W + 0.03, 0.105),
           (R_W - 0.05, 0.12), (R_I - 0.04, 0.12), (R_I - 0.07, 0.10)]
    m.element('IfcCovering', f'Coronament {key} · Overflow coping {tag}', F.rev(cop, WL - 0.13), PLAZA, 'stone',
              predefined='COPING', object_type='Rounded stone coping, the overflow weir all round', parent=st, src=FNT_EST,
              psets={**spec(Width_mm=670, WeirLength_m=round(2 * math.pi * R_W, 1), WeirLevel='Water level −10 mm',
                            Levelness_mm='±3 (needed for an even sheet)'),
                     **am('stone', 12, 4, AJ, 'Demo stonemason', 'Bullnose coping, sandstone, 24 segments', CON_CIV,
                          Note='Uneven sheet on 2 segments, re-levelling quoted (demo)' if key == 'B' else None)})
    m.element('IfcEarthworksFill', f'Rebliment del vas {key} · Basin backfill {tag}', F.cyl(R_I, -0.50, FL - 0.25 + 0.50),
              BELOW, 'fill', predefined='BACKFILL', object_type='Compacted granular fill under the raised basin floor',
              parent=st, src=BELOW_SRC,
              psets={**spec(Compaction='98 % Proctor (assumed)'),
                     **am('structure', 120, 4, AJ, 'Original civil works (1959)', 'Granular fill', CON_CIV)})
    m.element('IfcSlab', f'Llosa de fons {key} · Basin floor slab {tag}', F.cyl(R_I, FL - 0.25, 0.25), PLAZA, 'concrete',
              predefined='BASESLAB', object_type='Reinforced concrete basin floor, 250 mm, falls to the drain', parent=st,
              src=BELOW_SRC, common={'LoadBearing': True, 'IsExternal': True},
              psets={**spec(Thickness_mm=250, Falls='1 % to the floor drain'),
                     **am('structure', 60, 4, AJ, 'Original civil works (1959)', 'RC slab 250', CON_CIV)})
    m.element('IfcCovering', f'Impermeabilització del vas {key} · Basin lining {tag}', F.cyl(R_I, FL, 0.015), PLAZA, 'lining',
              predefined='MEMBRANE', object_type='Cementitious waterproofing with blue-grey pool paint', parent=st, src=BELOW_SRC,
              psets={**spec(System='Cementitious membrane 3 mm + chlorinated-rubber paint', Area_m2=round(math.pi * R_I ** 2, 1)),
                     **am('structure', 12, 3, AJ, 'Demo coatings maker', 'Pool lining system', CON_FNT, year=2017,
                          Note='Repaint due at next annual drain-down (demo)')})

    # --- water ---------------------------------------------------------------------------------
    wat = m.assembly(f'Aigua {key} · Water {tag}', None, object_type='Fountain water (running state)', parent=fnt,
                     psets={**spec(Treatment='Sand filtration + chlorine dosing (assumed)', TurnoverTime_h=4),
                            **am('hydraulic', 1, 4, AJ, '—', 'Recirculated fountain water', CON_HYD,
                                 Last_pH=7.4, LastFreeChlorine_mg_l=0.8, LastSample='2026-09-29'), **prov(FNT_EST)})
    m.element('IfcBuildingElementProxy', f'Làmina d\'aigua {key} · Water body {tag}', F.cyl(R_I, FL + 0.015, WL - FL - 0.015),
              PLAZA, 'water', predefined='USERDEFINED', object_type='Water body', parent=wat,
              src=('Water level from the ICGC mesh; depth estimated', 'Medium', FNT_REF),
              psets={**spec(Volume_m3=round(math.pi * R_I ** 2 * (WL - FL), 1), SurfaceLevel_raw_m=LVR[f'water_{key}']),
                     **am('hydraulic', 1, 4, AJ, '—', 'Basin water', CON_HYD)})
    m.element('IfcBuildingElementProxy', f'Vel de desbordament {key} · Overflow sheet {tag}',
              F.ring(R_W + 0.055, R_W + 0.075, -0.12, WL - 0.06 + 0.12), PLAZA, 'water', predefined='USERDEFINED',
              object_type='Overflow water sheet down the outer face', parent=wat, src=FNT_EST,
              psets={**spec(SheetThickness_mm=6, Flow_l_s=round(2 * math.pi * R_W * 0.9, 0)),
                     **am('hydraulic', 1, 4, AJ, '—', 'Weir overflow', CON_HYD)})
    m.element('IfcBuildingElementProxy', f'Aigua del canal {key} · Channel water {tag}',
              F.ring(R_W + 0.01, R_P - 0.17, -0.22, 0.10), PLAZA, 'water', predefined='USERDEFINED',
              object_type='Water in the collector channel', parent=wat, src=FNT_EST,
              psets=am('hydraulic', 1, 4, AJ, '—', 'Channel water', CON_HYD))

    # --- collector channel, gullies and paving ring ---------------------------------------------
    m.element('IfcDistributionChamberElement', f'Canal col·lector {key} · Collector channel {tag}',
              [F.ring(R_W, R_P - 0.16, -0.30, 0.08), F.ring(R_P - 0.16, R_P, -0.30, 0.36)], PLAZA, 'granite',
              predefined='TRENCH', object_type='Open channel at the foot of the wall, granite kerb', parent=fnt, src=OSM_GEO,
              psets={**spec(Width_mm=round((R_P - 0.16 - R_W) * 1000), Depth_mm=220, KerbAboveGround_mm=60,
                            OSMWay=fo['pond_outline']['way']),
                     **am('stone', 6, 4, AJ, 'Demo stonemason', 'Granite channel and kerb', CON_CIV,
                          Note='Leaves and coins cleared weekly (demo)')})
    for k, phi in enumerate((45., 135., 225., 315.), 1):
        rc = (R_W + R_P - 0.16) / 2
        w = R_P - 0.16 - R_W
        gr = [F.rbox(rc - w / 2 + 0.02, rc + w / 2 - 0.02, phi, 0.50, -0.55, 0.25)]          # sump body
        gr += [F.rbox(rc - w / 2 + 0.03, rc + w / 2 - 0.03, phi + dphi, 0.018, -0.26, 0.03)
               for dphi in [j * 0.75 for j in range(-4, 5)]]                                   # grate bars
        m.element('IfcWasteTerminal', f'Interceptor {key}{k} · Channel gully {key}{k}', gr, PLAZA, 'ductile',
                  predefined='GULLYTRAP', object_type='Channel outlet with ductile-iron grate, to the balance tank',
                  parent=fnt, src=BELOW_SRC,
                  psets={**spec(Outlet_DN=150, Grate='Ductile iron, 10 mm bars', Class='B125 (EN 124)'),
                         **am('hydraulic', 3, 4, AJ, 'Demo foundry', 'Channel gully 500', CON_HYD)})
    m.element('IfcSlab', f'Anell de paviment {key} · Paving ring {tag}', F.ring(R_P, R_P + 0.50, -0.08, 0.12), PLAZA,
              'granite', predefined='PAVING', object_type='Granite maintenance strip around the channel', parent=fnt,
              src=FNT_EST, common={'LoadBearing': False},
              psets={**spec(Width_mm=500, Finish='Flamed granite, 80 mm on mortar'),
                     **am('paving', 12, 4, AJ, 'Demo stone supplier', 'Granite flags 500 × 80', CON_CIV)})

    # --- nozzles and jets ----------------------------------------------------------------------
    jets = m.assembly(f'Brolladors {key} · Water jets {tag}', None, object_type='Jet set', parent=fnt,
                      psets={**spec(Nozzles=sum(NOZ.values()), Sequences='Static, wind-dependent reduction (demo)',
                                    MaxJetHeight_m=7.0), **am('jets', 6, 4, AJ, 'Demo fountain-nozzle maker',
                                                               'Bronze nozzle range', CON_FNT), **prov(JET_SRC)})
    STEM_TOP = WL + 0.18

    def nozzle(name, s, t, head, otype, specs, cond=4, note=None, tilt=None):
        it = [F.cyl(0.035, FL, STEM_TOP - FL, s, t), F.cyl(head, STEM_TOP, 0.05, s, t)]
        if tilt is not None:                      # angled tip
            dx, dy = tilt
            p0 = F.p3(s, t, STEM_TOP + 0.05)
            p1 = (p0[0] + dx * 0.09, p0[1] + dy * 0.09, p0[2] + 0.07)
            it.append(rod(p0, p1, 0.022))
        m.element('IfcSanitaryTerminal', name, it, PLAZA, 'bronze', predefined='USERDEFINED', object_type=otype,
                  parent=jets, src=JET_SRC, psets={**spec(**specs),
                                                    **am('jets', 6, cond, AJ, 'Demo fountain-nozzle maker', otype, CON_FNT,
                                                         Note=note)})

    nozzle(f'Brollador central {key} · Central foam jet {key}', 0., 0., 0.09, 'Foam jet nozzle DN80',
           {'Type': 'Aerated foam jet', 'JetHeight_m': 7.0, 'Flow_m3_h': 38.0, 'Connection': 'DN80 flange'})
    for k in range(NOZ['inner']):
        phi = 22.5 + k * 45
        s, t = R_INNER * math.cos(math.radians(phi)), R_INNER * math.sin(math.radians(phi))
        nozzle(f'Brollador vertical {key}{k + 1} · Vertical jet {key}{k + 1}', s, t, 0.05, 'Smooth-bore vertical jet DN40',
               {'Type': 'Vertical smooth jet', 'JetHeight_m': 4.5, 'Flow_m3_h': 6.5, 'Ring': 'Inner', 'Angle_deg': phi},
               cond=3 if (key == 'B' and k == 5) else 4,
               note='Partly blocked, jet 0.8 m low; clean nozzle (demo)' if (key == 'B' and k == 5) else None)
    for k in range(NOZ['arc']):
        phi = k * 360 / NOZ['arc']
        a = math.radians(phi)
        s, t = R_ARC * math.cos(a), R_ARC * math.sin(a)
        din = F.P(-math.cos(a), -math.sin(a)); d0 = F.P(0, 0)
        nozzle(f'Brollador d\'arc {key}{k + 1} · Inward arc jet {key}{k + 1}', s, t, 0.035, 'Adjustable arc jet DN25',
               {'Type': 'Laminar-look arc jet, adjustable ball joint', 'ArcApex_m': 3.0, 'Reach_m': 1.8,
                'Flow_m3_h': 2.2, 'Ring': 'Arc (inward)', 'Angle_deg': round(phi, 1)},
               tilt=(din[0] - d0[0], din[1] - d0[1]),
               cond=2 if (key == 'A' and k == 7) else 4,
               note='Ball joint seized, arc lands short (demo)' if (key == 'A' and k == 7) else None)
    for k in range(NOZ['outer']):
        phi = 5.625 + k * 360 / NOZ['outer']
        a = math.radians(phi)
        s, t = R_OUTER * math.cos(a), R_OUTER * math.sin(a)
        dout = F.P(math.cos(a), math.sin(a)); d0 = F.P(0, 0)
        nozzle(f'Brollador perimetral {key}{k + 1} · Outer arc jet {key}{k + 1}', s, t, 0.03, 'Adjustable arc jet DN20',
               {'Type': 'Arc jet, outward', 'ArcApex_m': 1.6, 'Reach_m': 1.3, 'Flow_m3_h': 1.1,
                'Ring': 'Outer (outward)', 'Angle_deg': round(phi, 1)},
               tilt=(dout[0] - d0[0], dout[1] - d0[1]))

    # running water of the jets, one element per ring
    plume = F.rev([(0., 0.), (0.10, 0.), (0.22, 2.5), (0.34, 5.6), (0.30, 6.6), (0.12, 7.0), (0., 7.0)], STEM_TOP + 0.05)
    m.element('IfcBuildingElementProxy', f'Raig central {key} · Central plume {key}', [plume], PLAZA, 'jet',
              predefined='USERDEFINED', object_type='Water jet (running state): central foam plume', parent=jets, src=JET_SRC,
              psets={**spec(Height_m=7.0, State='Running'), **am('jets', 6, 4, AJ, '—', 'Central plume', CON_FNT)})
    vj = []
    for k in range(NOZ['inner']):
        phi = 22.5 + k * 45
        s, t = R_INNER * math.cos(math.radians(phi)), R_INNER * math.sin(math.radians(phi))
        h = 4.5 - (0.8 if (key == 'B' and k == 5) else 0.)
        vj.append(F.rev([(0., 0.), (0.03, 0.), (0.07, h * 0.6), (0.10, h * 0.92), (0.05, h), (0., h)], STEM_TOP + 0.05, s, t))
    m.element('IfcBuildingElementProxy', f'Raigs verticals {key} · Vertical jets {key}', vj, PLAZA, 'jet',
              predefined='USERDEFINED', object_type='Water jets (running state): inner vertical ring', parent=jets, src=JET_SRC,
              psets={**spec(Jets=NOZ['inner'], Height_m=4.5, State='Running'), **am('jets', 6, 4, AJ, '—', 'Vertical jets', CON_FNT)})

    def arcs(n, r0, reach, apex, phase, r_tube, short=None):
        items = []
        for k in range(n):
            phi = phase + k * 360 / n
            a = math.radians(phi)
            rr = reach * (0.55 if short == k else 1.0)
            pts = []
            for j in range(9):
                u = j / 8
                r = r0 + rr * u
                z = STEM_TOP + 0.10 + (apex * (0.7 if short == k else 1.0)) * 4 * u * (1 - u) - (STEM_TOP + 0.10 - WL) * u
                pts.append(F.p3(r * math.cos(a), r * math.sin(a), z))
            items += polyline_rods(pts, r_tube)
        return items
    m.element('IfcBuildingElementProxy', f'Arcs interiors {key} · Inward arcs {key}',
              arcs(NOZ['arc'], R_ARC, -1.8, 3.0, 0., 0.03, short=7 if key == 'A' else None), PLAZA, 'jet',
              predefined='USERDEFINED', object_type='Water jets (running state): inward arc ring', parent=jets, src=JET_SRC,
              psets={**spec(Jets=NOZ['arc'], Apex_m=3.0, State='Running'), **am('jets', 6, 4, AJ, '—', 'Inward arcs', CON_FNT)})
    m.element('IfcBuildingElementProxy', f'Arcs perimetrals {key} · Outer arcs {key}',
              arcs(NOZ['outer'], R_OUTER, 1.3, 1.6, 5.625, 0.022), PLAZA, 'jet',
              predefined='USERDEFINED', object_type='Water jets (running state): outer arc ring', parent=jets, src=JET_SRC,
              psets={**spec(Jets=NOZ['outer'], Apex_m=1.6, State='Running'), **am('jets', 6, 4, AJ, '—', 'Outer arcs', CON_FNT)})

    # --- underwater lighting -------------------------------------------------------------------
    lgt = m.assembly(f'Il·luminació subaquàtica {key} · Underwater lighting {tag}', None, object_type='Underwater lighting',
                     parent=fnt, psets={**spec(Fixtures=32, Control='DMX512 from the plant-room panel', Supply='24 V DC SELV'),
                                        **am('light', 12, 4, AJ, 'Demo underwater-lighting maker', 'RGBW LED, IP68',
                                             CON_LGT), **prov(JET_SRC)})
    rings = [(0.80, 8, 22.5, 'Central uplight ring', 18), (4.65, 24, 7.5, 'Arc-ring uplight', 9)]
    n = 0
    for r, cnt, phase, ring_name, watt in rings:
        for k in range(cnt):
            n += 1
            phi = phase + k * 360 / cnt
            a = math.radians(phi)
            s, t = r * math.cos(a), r * math.sin(a)
            m.element('IfcLightFixture', f'Projector subaquàtic {key}{n:02d} · Underwater light {key}{n:02d}',
                      [F.cyl(0.10, FL + 0.015, 0.03, s, t), F.cyl(0.075, FL + 0.045, 0.09, s, t),
                       F.cyl(0.065, FL + 0.135, 0.015, s, t)], PLAZA, 'inox', predefined='DIRECTIONSOURCE',
                      object_type=f'Underwater LED projector {watt} W RGBW, IP68 ({ring_name.lower()})', parent=lgt, src=JET_SRC,
                      psets={**spec(Power_W=watt, IngressProtection='IP68 (10 m)', BeamAngle_deg=25 if r < 2 else 40,
                                    ColourTemperature_K='RGBW, 3000 K white', Ring=ring_name, DMXAddress=1 + 4 * (n - 1)),
                             **am('light', 12, 1 if (key == 'B' and n == 14) else 4, AJ, 'Demo underwater-lighting maker',
                                  f'Pool projector {watt} W RGBW', CON_LGT, BurningHours=11200 + 23 * n,
                                  Note='Out: water ingress, replacement ordered (demo)' if (key == 'B' and n == 14) else None)})

    # --- pipework on the basin floor and below --------------------------------------------------
    pip = m.assembly(f'Xarxa hidràulica {key} · Hydraulic network {tag}', None, object_type='Fountain pipework',
                     parent=fnt, psets={**spec(DesignFlow_m3_h=150, OperatingPressure_bar=2.2),
                                        **am('hydraulic', 12, 4, AJ, 'Demo pipe manufacturer', 'Stainless 316L ring mains',
                                             CON_HYD), **prov(BELOW_SRC)})
    zr = FL + 0.08
    for r, n_seg, dn, label in ((R_INNER, 16, 65, 'inner'), (R_ARC, 32, 80, 'arc'), (R_OUTER, 40, 65, 'outer')):
        m.element('IfcPipeSegment', f'Anell de distribució {label} {key} · Ring main ({label}) {key}',
                  polyline_rods(circle_pts(F, r, n_seg, zr), dn / 2000 + 0.004), PLAZA, 'inox', predefined='RIGIDSEGMENT',
                  object_type=f'Stainless ring main DN{dn} on stools, feeding the {label} nozzles', parent=pip, src=BELOW_SRC,
                  psets={**spec(NominalDiameter_mm=dn, Length_m=round(2 * math.pi * r, 1), Material='AISI 316L'),
                         **am('hydraulic', 24, 4, AJ, 'Demo pipe manufacturer', f'316L DN{dn}', CON_HYD)})
    spokes = []
    for phi in (0., 90., 180., 270.):
        spokes += [rod(F.p3(0, 0, zr), F.polar(R_OUTER, phi, zr), 0.048)]
    spokes += [rod(F.p3(0, 0, -1.20), F.p3(0, 0, zr), 0.08)]
    m.element('IfcPipeSegment', f'Muntant i radis {key} · Riser and spokes {key}', spokes, PLAZA, 'inox',
              predefined='RIGIDSEGMENT', object_type='DN150 riser through the floor and four DN80 spokes to the rings',
              parent=pip, src=BELOW_SRC, psets={**spec(RiserDN=150, SpokeDN=80),
                                                **am('hydraulic', 24, 4, AJ, 'Demo pipe manufacturer', '316L DN150/DN80', CON_HYD)})
    # floor drain (towards the plant room) and the level probe
    dphi = out_phi
    ds, dt = 2.8 * math.cos(math.radians(dphi)), 2.8 * math.sin(math.radians(dphi))
    m.element('IfcWasteTerminal', f'Desguàs de fons {key} · Basin floor drain {key}',
              [F.cyl(0.16, FL - 0.20, 0.215, ds, dt)] + [F.box(ds - 0.13, ds + 0.13, dt + o - 0.008, dt + o + 0.008, FL + 0.015, 0.02)
                                                            for o in (-0.09, -0.045, 0., 0.045, 0.09)],
              PLAZA, 'inox', predefined='FLOORWASTE', object_type='Floor drain DN150 with anti-vortex grate, for drain-down',
              parent=pip, src=BELOW_SRC, psets={**spec(Outlet_DN=150, AntiVortex=True, DrainDownTime_h=6),
                                                **am('hydraulic', 12, 4, AJ, 'Demo drainage maker', 'Anti-vortex sump drain DN150', CON_HYD)})
    ls_, lt_ = (R_I - 0.12) * math.cos(math.radians(dphi + 20)), (R_I - 0.12) * math.sin(math.radians(dphi + 20))
    m.element('IfcSensor', f'Sonda de nivell {key} · Basin level probe {key}',
              [F.cyl(0.035, FL + 0.015, WL - FL + 0.04, ls_, lt_), F.cyl(0.06, WL - 0.03, 0.05, ls_, lt_)], PLAZA, 'inox',
              predefined='LEVELSENSOR', object_type='Conductive level probe in a still-well (low-level pump cut-out, make-up)',
              parent=pip, src=BELOW_SRC, psets={**spec(Signals='Low-low, low, normal, high', Output='To the control panel'),
                                                **am('controls', 12, 4, AJ, 'Demo controls maker', '4-electrode level relay', CON_HYD)})

    # --- plant room ----------------------------------------------------------------------------
    a = math.radians(dphi)
    RC = 12.4                                                 # plant room centre radius from the basin centre
    pc = F.P(RC * math.cos(a), RC * math.sin(a))
    bx, by = cx - pc[0], cy - pc[1]
    brg = math.degrees(math.atan2(bx, by))                    # bearing from the plant room to the basin centre
    P = Frame(pc, brg + 90., z0)                              # s along the tangent, t (left of s) towards the basin
    ROOF_TOP, ROOF_T, IN_H, FLOOR_T, WT = -0.12, 0.25, 2.40, 0.30, 0.25
    LS, LT = 2.0, 1.5                                         # inner half-sizes
    FZ = ROOF_TOP - ROOF_T - IN_H                             # inner floor level
    pr = m.assembly(f'Sala de màquines {key} · Plant room {tag}', None, object_type='Buried fountain plant room', parent=fnt,
                    psets={**spec(InnerSize_m=f'{2 * LS:.1f} × {2 * LT:.1f} × {IN_H:.1f}', Access='Trapdoor and fixed ladder',
                                  Ventilation='Passive, two vents in the hatch frame (assumed)', Sump='Pumped to sewer'),
                           **am('structure', 6, 4, AJ, 'Demo civil works', 'Buried RC chamber', CON_HYD, year=2017,
                                ConfinedSpace='Yes — permit to work required (demo)'), **prov(PLANT_SRC)})
    m.space(f'SM-{key}', f'Sala de màquines {key} · Plant room {key}', BELOW,
            [P.box(-LS, LS, -LT, LT, FZ, IN_H)], psets={'Pset_SpaceCommon': {'Reference': 'Plant room', 'IsExternal': False},
                                                        **am('structure', 6, 4, AJ, 'Demo civil works', 'Plant room space', CON_HYD, year=2017)})
    walls = [P.box(-LS - WT, LS + WT, LT, LT + WT, FZ - FLOOR_T, IN_H + FLOOR_T), P.box(-LS - WT, LS + WT, -LT - WT, -LT, FZ - FLOOR_T, IN_H + FLOOR_T),
             P.box(-LS - WT, -LS, -LT, LT, FZ - FLOOR_T, IN_H + FLOOR_T), P.box(LS, LS + WT, -LT, LT, FZ - FLOOR_T, IN_H + FLOOR_T),
             P.box(-LS - WT, LS + WT, -LT - WT, LT + WT, FZ - FLOOR_T, FLOOR_T)]
    m.element('IfcDistributionChamberElement', f'Cambra de la sala {key} · Plant-room chamber {key}', walls, BELOW, 'concrete',
              predefined='USERDEFINED', object_type='Watertight RC chamber, walls 250 mm, floor 300 mm with sump', parent=pr,
              src=PLANT_SRC, psets={**spec(Concrete='C35/45 watertight (assumed)', Waterproofing='Crystalline admixture'),
                                    **am('structure', 60, 4, AJ, 'Demo civil works', 'RC chamber', CON_CIV, year=2017)})
    roof = m.element('IfcSlab', f'Llosa de coberta {key} · Plant-room roof slab {key}',
                     P.box(-LS - WT, LS + WT, -LT - WT, LT + WT, ROOF_TOP - ROOF_T, ROOF_T), BELOW, 'concrete',
                     predefined='ROOF', object_type='RC roof slab under the lawn, with hatch opening', parent=pr, src=PLANT_SRC,
                     common={'LoadBearing': True, 'IsExternal': True},
                     psets={**spec(Thickness_mm=250, Load='Pedestrian + maintenance vehicle 3.5 t (assumed)'),
                            **am('structure', 60, 4, AJ, 'Demo civil works', 'RC slab 250', CON_CIV, year=2017)})
    H0, H1, HT0, HT1 = 1.0, 1.9, -0.45, 0.45                  # hatch, in plant-room s/t
    hatch = m.element('IfcDoor', f'Trapa d\'accés {key} · Access hatch {key}',
                      [P.box(H0, H1, HT0, HT1, PATCH_TOP - 0.005, 0.02), P.box(H0 + 0.05, H1 - 0.05, HT0 + 0.05, HT1 - 0.05, PATCH_TOP - 0.06, 0.04)],
                      PLAZA, 'steel', predefined='TRAPDOOR', object_type='Galvanised steel trapdoor 900 × 900, gas struts, lockable',
                      parent=pr, src=PLANT_SRC,
                      psets={**spec(ClearOpening_mm='800 × 800', Load='B125 (EN 124)', Locking='Municipal key + padlock'),
                             **am('structure', 6, 4, AJ, 'Demo access-cover maker', 'Trapdoor 900 B125', CON_HYD, year=2017)})
    hatch.OperationType, hatch.OverallWidth, hatch.OverallHeight = 'USERDEFINED', 0.9, 0.9
    hatch.UserDefinedOperationType = 'Hinged, opening upwards'
    m.opening(roof, [P.box(H0 + 0.05, H1 - 0.05, HT0 + 0.05, HT1 - 0.05, ROOF_TOP - ROOF_T - 0.05, ROOF_T + 0.10)], filler=hatch)
    lad = [rod(P.p3(LS - 0.12, tt, FZ), P.p3(LS - 0.12, tt, ROOF_TOP - 0.05), 0.02) for tt in (-0.22, 0.22)]
    lad += [rod(P.p3(LS - 0.12, -0.22, z), P.p3(LS - 0.12, 0.22, z), 0.013) for z in [FZ + 0.3 * j for j in range(1, 8)]]
    m.element('IfcMember', f'Escala d\'accés {key} · Access ladder {key}', lad, BELOW, 'steel', predefined='USERDEFINED',
              object_type='Fixed galvanised ladder under the hatch, with a telescopic extension post (stowed)', parent=pr,
              src=PLANT_SRC, psets={**spec(Rungs=7, Width_mm=440), **am('structure', 12, 4, AJ, 'Demo access maker', 'Fixed ladder', CON_HYD, year=2017)})
    TK = (-1.9, -0.5, -1.4, 0.3)
    m.element('IfcTank', f'Dipòsit de compensació {key} · Balance tank {key}',
              [P.box(TK[0], TK[1], TK[2], TK[3], FZ + 0.10, 1.40), P.box(TK[0] - 0.03, TK[1] + 0.03, TK[2] - 0.03, TK[3] + 0.03, FZ, 0.10)],
              BELOW, 'grp', predefined='STORAGE', object_type='GRP balance tank 3.3 m³ receiving the overflow',
              parent=pr, src=PLANT_SRC,
              psets={**spec(Capacity_m3=3.3, Inlet='Overflow return DN200', Outlets='Jet and filtration pump suction'),
                     **am('mech', 12, 4, AJ, 'Demo tank maker', 'GRP sectional tank 1.4 × 1.7 × 1.4', CON_HYD)})
    m.element('IfcSensor', f'Sonda de nivell del dipòsit {key} · Tank level sensor {key}',
              [P.cyl(0.03, FZ + 1.50, 0.12, -1.2, -0.5), rod(P.p3(-1.2, -0.5, FZ + 1.5), P.p3(-1.2, -0.5, FZ + 0.4), 0.008)],
              BELOW, 'inox', predefined='LEVELSENSOR', object_type='Ultrasonic level transmitter 4–20 mA',
              parent=pr, src=PLANT_SRC, psets={**spec(Range_m=1.5, Output='4–20 mA'),
                                               **am('controls', 12, 4, AJ, 'Demo controls maker', 'Ultrasonic level 1.5 m', CON_HYD)})

    def pump(name, s0, t0, size, ptype, specs, cond=4, note=None, hours=0):
        L, r = size
        it = [P.box(s0 - 0.05, s0 + L + 0.30, t0 - r - 0.05, t0 + r + 0.05, FZ, 0.12),            # base frame
              rod(P.p3(s0, t0, FZ + 0.12 + r), P.p3(s0 + L, t0, FZ + 0.12 + r), r * 0.8),             # motor
              rod(P.p3(s0 + L, t0, FZ + 0.12 + r), P.p3(s0 + L + 0.22, t0, FZ + 0.12 + r), r * 1.15),  # volute
              rod(P.p3(s0 + L + 0.11, t0, FZ + 0.12 + 2 * r), P.p3(s0 + L + 0.11, t0, FZ + 0.30 + 2 * r), r * 0.45)]
        m.element('IfcPump', name, it, BELOW, 'pump', predefined=ptype, object_type=specs.pop('Model'), parent=pr, src=PLANT_SRC,
                  psets={**spec(**specs), **am('mech', 6, cond, AJ, 'Demo pump manufacturer', name.split(' · ')[1], CON_HYD,
                                               RunHours=hours, Note=note)})
    pump(f'Bomba de brolladors {key} · Jet pump {key}', -0.2, -1.05, (0.65, 0.20), 'ENDSUCTION',
         {'Model': 'End-suction pump 22 kW with VFD', 'Power_kW': 22.0, 'Flow_m3_h': 150, 'Head_m': 18, 'Speed_rpm': 2950,
          'Drive': 'Variable-frequency drive in the control panel'},
         cond=3 if key == 'A' else 4, note='Mechanical seal weeping, replacement planned (demo)' if key == 'A' else None,
         hours=21400 if key == 'A' else 19850)
    pump(f'Bomba de filtració {key} · Filtration pump {key}', -0.1, 0.25, (0.45, 0.13), 'ENDSUCTION',
         {'Model': 'Self-priming filtration pump 4 kW with pre-filter', 'Power_kW': 4.0, 'Flow_m3_h': 45, 'Head_m': 14,
          'Speed_rpm': 2900}, hours=33100 + (0 if key == 'A' else 900))
    m.element('IfcFilter', f'Filtre de sorra {key} · Sand filter {key}',
              [P.cyl(0.42, 0.10 + FZ, 1.05, 1.15, 0.95), P.rev(Model.dome_profile(0.42, 0.22, n=8), FZ + 1.15, 1.15, 0.95),
               P.cyl(0.46, FZ, 0.10, 1.15, 0.95), P.box(0.55, 0.75, 0.80, 1.10, FZ + 0.80, 0.25)],
              BELOW, 'grp', predefined='WATERFILTER', object_type='Pressure sand filter Ø840, multiport valve', parent=pr,
              src=PLANT_SRC, psets={**spec(Diameter_mm=840, Media='Silica sand 0.4–0.8 mm, 350 kg', FiltrationRate_m3_h_m2=40,
                                           Backwash='Weekly, 4 min (demo)'),
                                    **am('mech', 6, 4, AJ, 'Demo filter maker', 'Sand filter 840', CON_HYD, LastMediaChange='2022-03 (demo)')})
    pp = []
    pp += polyline_rods([P.p3(-0.5, -1.05, FZ + 0.32), P.p3(0.70, -1.05, FZ + 0.32)], 0.06)              # suction, tank -> jet pump
    pp += polyline_rods([P.p3(0.56, -1.05, FZ + 0.70), P.p3(0.56, -1.05, FZ + 1.6), P.p3(0.56, LT + WT + 0.3, FZ + 1.6)], 0.08)
    pp += polyline_rods([P.p3(-0.5, 0.25, FZ + 0.25), P.p3(0.42, 0.25, FZ + 0.25)], 0.04)                 # filtration loop
    pp += polyline_rods([P.p3(0.47, 0.25, FZ + 0.56), P.p3(0.47, 0.25, FZ + 1.3), P.p3(1.15, 0.95, FZ + 1.3)], 0.035)
    m.element('IfcPipeSegment', f'Canonades de la sala {key} · Plant-room pipework {key}', pp, BELOW, 'pvc',
              predefined='RIGIDSEGMENT', object_type='PVC-U PN10 pipework: suction, delivery and filtration loop', parent=pr,
              src=PLANT_SRC, psets={**spec(Material='PVC-U PN10, solvent-welded', DN='DN80–DN150'),
                                    **am('hydraulic', 12, 4, AJ, 'Demo pipe manufacturer', 'PVC-U PN10', CON_HYD)})
    for name, s, t, z, pt, ot, dn in ((f'Vàlvula d\'aspiració {key} · Suction isolating valve {key}', -0.35, -1.05, FZ + 0.32, 'ISOLATING', 'Butterfly valve DN125, lever', 125),
                                      (f'Vàlvula de retenció {key} · Delivery check valve {key}', 0.56, -1.05, FZ + 1.15, 'CHECK', 'Swing check valve DN150', 150),
                                      (f'Vàlvula de regulació {key} · Delivery regulating valve {key}', 0.56, 0.2, FZ + 1.6, 'REGULATING', 'Motorised butterfly DN150, modulating', 150),
                                      (f'Vàlvula de filtració {key} · Filtration isolating valve {key}', -0.3, 0.25, FZ + 0.25, 'ISOLATING', 'Ball valve DN65', 65)):
        body = [P.box(s - 0.07, s + 0.07, t - 0.11, t + 0.11, z - 0.11, 0.22),
                rod(P.p3(s, t, z + 0.08), P.p3(s, t, z + 0.28), 0.015), P.box(s - 0.02, s + 0.18, t - 0.02, t + 0.02, z + 0.27, 0.03)]
        m.element('IfcValve', name, body, BELOW, 'ductile', predefined=pt, object_type=ot, parent=pr, src=PLANT_SRC,
                  psets={**spec(NominalDiameter_mm=dn, PressureRating='PN10'),
                         **am('mech', 12, 4, AJ, 'Demo valve maker', ot, CON_HYD)})
    m.element('IfcValve', f'Vàlvula de flotador {key} · Make-up float valve {key}',
              [P.box(-1.0, -0.8, -0.2, 0.0, FZ + 1.45, 0.1), rod(P.p3(-0.9, -0.1, FZ + 1.45), P.p3(-0.9, -0.5, FZ + 1.2), 0.008),
               P.sphere(-0.9, -0.5, FZ + 1.2, 0.06, n=8)], BELOW, 'brass', predefined='USERDEFINED',
              object_type='Float valve DN25 on the potable make-up', parent=pr, src=PLANT_SRC,
              psets={**spec(NominalDiameter_mm=25, BackflowProtection='Type AA air gap'),
                     **am('mech', 12, 4, AJ, 'Demo valve maker', 'Float valve DN25', CON_HYD)})
    m.element('IfcFlowMeter', f'Comptador d\'aportació {key} · Make-up water meter {key}',
              [P.box(-1.75, -1.45, LT - 0.12, LT - 0.02, FZ + 1.70, 0.14),
               rod(P.p3(-1.95, LT - 0.07, FZ + 1.77), P.p3(-0.9, LT - 0.07, FZ + 1.77), 0.017),
               rod(P.p3(-0.9, LT - 0.07, FZ + 1.77), P.p3(-0.9, -0.1, FZ + 1.55), 0.017)],
              BELOW, 'brass', predefined='WATERMETER', object_type='Ultrasonic water meter DN25 with radio read-out', parent=pr,
              src=PLANT_SRC, psets={**spec(NominalFlow_m3_h=4.0, Reading_m3=5204.3 if key == 'A' else 4871.9,
                                           ReadingDate='2026-09-30', Telemetry='Radio, daily read'),
                                    **am('mech', 12, 5, AJ, 'Demo meter manufacturer', 'Ultrasonic DN25 Q3=4', CON_HYD,
                                         Consumption_m3_30d=96.2 if key == 'A' else 88.7)})
    m.element('IfcElectricDistributionBoard', f'Quadre de control {key} · Control panel {key}',
              [P.box(-0.45, 0.65, LT - 0.30, LT, FZ + 0.40, 1.70), P.box(-0.45, 0.65, LT - 0.32, LT - 0.30, FZ + 0.45, 1.60)],
              BELOW, 'cabinet', predefined='MOTORCONTROLCENTRE', object_type='Fountain control panel: VFD, PLC, DMX, RCDs',
              parent=pr, src=PLANT_SRC,
              psets={**spec(Supply='400 V 3-phase, 40 kW contracted (demo)', PLC='Programmable sequences, wind cut-out',
                            Remote='4G telemetry to the municipal fountain control centre (demo)', IngressProtection='IP55'),
                     **am('controls', 6, 4, AJ, 'Demo panel builder', 'Fountain MCC 40 kW', CON_HYD, year=2021,
                          FirmwareVersion='v3.2.1 (demo)')})

    # buried runs between the plant room and the basin
    wall_pt = P.p3(0.56, LT + WT, FZ + 1.6)
    centre_low = F.p3(0, 0, -1.20)
    m.element('IfcPipeSegment', f'Impulsió als brolladors {key} · Jet delivery main {key}',
              polyline_rods([wall_pt, (wall_pt[0], wall_pt[1], z0 - 1.20), centre_low], 0.08), BELOW, 'pvc',
              predefined='RIGIDSEGMENT', object_type='PVC-U PN10 DN150 delivery main, buried', parent=pip, src=BELOW_SRC,
              psets={**spec(NominalDiameter_mm=150, Depth_m=1.2), **am('hydraulic', 24, 4, AJ, 'Demo pipe manufacturer', 'PVC-U DN150 PN10', CON_HYD)})
    rr = (R_W + R_P - 0.16) / 2
    ret = polyline_rods(circle_pts(F, rr, 32, -0.75), 0.10)
    ret += [rod(F.polar(rr, phi, -0.55), F.polar(rr, phi, -0.75), 0.075) for phi in (45., 135., 225., 315.)]
    near = min((45., 135., 225., 315.), key=lambda p: abs(((p - dphi + 180) % 360) - 180))
    tk_pt = P.p3(-1.2, LT + WT, FZ + 1.3)
    ret += polyline_rods([F.polar(rr, near, -0.75), (tk_pt[0], tk_pt[1], z0 - 0.75), tk_pt], 0.10)
    m.element('IfcPipeSegment', f'Retorn de desbordament {key} · Overflow return {key}', ret, BELOW, 'pvc',
              predefined='RIGIDSEGMENT', object_type='PVC-U DN200 ring collecting the four gullies, to the balance tank',
              parent=pip, src=BELOW_SRC, psets={**spec(NominalDiameter_mm=200, Gradient_pct=1.0),
                                                **am('hydraulic', 24, 4, AJ, 'Demo pipe manufacturer', 'PVC-U SN8 DN200', CON_HYD)})
    dr_pt = P.p3(0.0, LT + WT, FZ + 0.2)
    m.element('IfcPipeSegment', f'Buidat del vas {key} · Basin drain-down pipe {key}',
              polyline_rods([F.p3(ds, dt, FL - 0.20), F.p3(ds, dt, -1.6), (dr_pt[0], dr_pt[1], z0 - 1.6), dr_pt], 0.08), BELOW, 'pvc_sewer',
              predefined='RIGIDSEGMENT', object_type='PVC-U DN150 drain-down to the plant-room sump', parent=pip, src=BELOW_SRC,
              psets={**spec(NominalDiameter_mm=150), **am('hydraulic', 24, 4, AJ, 'Demo pipe manufacturer', 'PVC-U SN8 DN150', CON_HYD)})
    m.element('IfcPipeSegment', f'Escomesa de clavegueram {key} · Sewer connection {key}',
              polyline_rods([P.p3(0.0, -LT - WT, FZ - 0.15), P.p3(0.0, -LT - WT - 4.5, FZ - 0.40)], 0.08), BELOW, 'pvc_sewer',
              predefined='RIGIDSEGMENT', object_type='PVC-U DN160 rising main from the sump pump to the combined sewer',
              parent=pip, src=BELOW_SRC, psets={**spec(NominalDiameter_mm=160, Discharge='Combined sewer (assumed)'),
                                                **am('hydraulic', 24, 4, AJ, 'Demo pipe manufacturer', 'PVC-U DN160', CON_HYD)})
    m.element('IfcPipeSegment', f'Escomesa d\'aigua {key} · Potable make-up supply {key}',
              polyline_rods([P.p3(-1.95, LT - 0.07, FZ + 1.77), P.p3(-LS - WT - 3.0, LT - 0.07, -0.9)], 0.02), BELOW, 'pe',
              predefined='RIGIDSEGMENT', object_type='PE100 DN32 potable supply from the street main', parent=pip, src=BELOW_SRC,
              psets={**spec(NominalDiameter_mm=32, PressureRating='PN16'), **am('hydraulic', 24, 4, AJ, 'Demo pipe manufacturer', 'PE100 DN32', CON_HYD)})
    m.element('IfcPump', f'Bomba de pou {key} · Sump pump {key}', [P.cyl(0.11, FZ - 0.25, 0.42, 0.0, -LT + 0.35),
                                                                   rod(P.p3(0.0, -LT + 0.35, FZ + 0.17), P.p3(0.0, -LT - WT, FZ - 0.15), 0.03)],
              BELOW, 'pump', predefined='SUMPPUMP', object_type='Submersible sump pump 1.1 kW with float switch', parent=pr,
              src=PLANT_SRC, psets={**spec(Power_kW=1.1, Flow_m3_h=12, Head_m=8),
                                    **am('mech', 6, 4, AJ, 'Demo pump manufacturer', 'Sump pump 1.1 kW', CON_HYD, RunHours=640)})

    # --- ground patches over the cut-out --------------------------------------------------------
    PT = SITE['patches'][key]
    for part, cls, mat, label in (('lawn', 'IfcGeographicElement', 'lawn', 'Gespa · Lawn patch'),
                                  ('path', 'IfcSlab', 'paving', 'Paviment · Plaza paving patch')):
        for j, poly in enumerate(PT[part], 1):
            item = m.prism_holes([tuple(p) for p in poly['outer']], [[tuple(p) for p in h] for h in poly['holes']],
                                 z0 + PATCH_TOP - 0.10, 0.10)
            kw = dict(predefined='VEGETATION') if cls == 'IfcGeographicElement' else dict(predefined='PAVING', common={'LoadBearing': False})
            m.element(cls, f'{label} {key}{j}', [item], PLAZA, mat,
                      object_type=('Lawn over the cut-out (covers the mesh where this model replaces it)' if part == 'lawn' else
                                   'Plaza paving over the cut-out (covers the mesh where this model replaces it)'),
                      parent=fnt, src=GROUND_SRC, **kw,
                      psets={**spec(Purpose='Visual: replaces the photogrammetric ground around the fountain', Area_m2=poly['area_m2']),
                             **(am('ground', 3, 4, AJ_PARKS, 'Municipal nursery (demo)', 'Sports-turf mix, irrigated', CON_GRD,
                                   Irrigation='Pop-up sprinklers, night cycle (demo)') if part == 'lawn' else
                                am('paving', 12, 4, AJ, 'Demo paving supplier', 'Plaza paving', CON_CIV))})

    half = PT['box_half_m']
    cutout(F, f'Fonts Bessones — {side} fountain', (-half, half), (-half, half), (CUT_FLOOR, 4.6))
    return F, WL


FA, WL_A = fountain('A')
FB, WL_B = fountain('B')
FR = {'A': (FA, WL_A), 'B': (FB, WL_B)}

# ═══ 2. Sculptures ════════════════════════════════════════════════════════════════════════════════
# Each figure is built in its own frame: s forward (the way it faces), t to its left, z up from its plinth top.
# The poses come from photographs on Wikimedia Commons; the dimensions are estimates (life-size and a bit over).


def ground_z(x, y):
    """Ground level at (x, y): inverse-distance blend of the three ICGC samples (origin, around each basin)."""
    pts = [((0., 0.), LVR['origin']), (tuple(SITE['fountains']['A']['basin_wall']['centroid']), LVR['ground_A']),
           (tuple(SITE['fountains']['B']['basin_wall']['centroid']), LVR['ground_B'])]
    wsum = vsum = 0.
    for (px, py), v in pts:
        d = max(math.hypot(x - px, y - py), 1.0)
        w = 1 / d ** 2
        wsum += w; vsum += w * v
    return round(vsum / wsum - RAW0, 2)


def limb(S, pts, r0, r1):
    """Tapered limb through points [(s, t, z)] as rods, radius r0 at the root to r1 at the end."""
    out = []
    n = len(pts) - 1
    for i in range(n):
        r = r0 + (r1 - r0) * (i + 0.5) / n
        out.append(rod(S.p3(*pts[i]), S.p3(*pts[i + 1]), r))
    return out


def body(S, k, draped='none', female=True):
    """Standing human figure of scale k (1.0 ≈ 1.80 m). draped: 'none', 'skirt' (from the hips), 'full' (gown)."""
    it = []
    sh = 0.21 if not female else 0.19                                 # half shoulder width
    hip = 0.17 if female else 0.15
    if draped == 'full':
        it.append(S.rev([(0., 0.), (0.30 * k, 0.), (0.26 * k, 0.45 * k), (0.21 * k, 0.95 * k), (0.17 * k, 1.20 * k), (0., 1.20 * k)], 0.))
    elif draped == 'skirt':
        it.append(S.rev([(0., 0.), (0.29 * k, 0.), (0.24 * k, 0.55 * k), (0.19 * k, 0.98 * k), (0., 0.98 * k)], 0.))
    else:
        for side in (-1, 1):                                          # legs and feet
            it += limb(S, [(0.0, side * 0.09 * k, 0.95 * k), (0.02 * k, side * 0.10 * k, 0.50 * k), (0.0, side * 0.10 * k, 0.07 * k)],
                       0.085 * k, 0.050 * k)
            it.append(S.box(-0.05 * k, 0.17 * k, side * 0.10 * k - 0.045 * k, side * 0.10 * k + 0.045 * k, 0.0, 0.07 * k))
        it.append(S.sphere(0.0, 0.0, 0.95 * k, 0.16 * k, n=8))          # pelvis
    cx, cy = S.P(0, 0)
    it.append(m.frustum(cx, cy, S.z0 + 0.95 * k, 0.24 * k, 2 * hip * k, 0.55 * k, -0.01 * k, hip * k - sh * k, angle=S.ang))
    it.append(S.sphere(0.0, 0.0, 1.48 * k, 0.15 * k, n=8))             # chest / shoulders rounding
    it.append(S.cyl(0.05 * k, 1.50 * k, 0.12 * k))                      # neck
    it.append(S.sphere(0.01 * k, 0.0, 1.70 * k, 0.11 * k, n=10))       # head
    if female:
        it.append(S.sphere(-0.07 * k, 0.0, 1.74 * k, 0.07 * k, n=8))   # hair bun
    return it, sh


def arm(S, k, side, elbow, hand, r=0.045):
    """Arm from the shoulder (side = +1 left, −1 right) through elbow to hand, given as (s, t, z) in units of k."""
    sh = (0.0, side * 0.20 * k, 1.45 * k)
    e = tuple(c * k for c in elbow)
    h = tuple(c * k for c in hand)
    return limb(S, [sh, e, h], r * k, 0.032 * k) + [S.sphere(h[0], h[1], h[2], 0.04 * k, n=6)]


def child(S, s, t, z, k):
    """A small child figure (scale k of an adult) standing or held, centred at (s, t, z)."""
    it = [S.rev([(0., 0.), (0.12 * k, 0.), (0.13 * k, 0.30 * k), (0.10 * k, 0.55 * k), (0., 0.55 * k)], z, s, t)]
    it.append(S.sphere(s, t, z + 0.66 * k, 0.10 * k, n=8))
    return it


def figure(kind, S, k):
    """The pose of each sculpture, as seen on Wikimedia Commons."""
    if kind == 'forjador':          # muscular smith, hammer head resting on an anvil block, draped from the hips
        it, _ = body(S, k, draped='skirt', female=False)
        it += arm(S, k, 1, (0.12, 0.26, 1.15), (0.24, 0.12, 0.95), 0.05)
        it += arm(S, k, -1, (0.10, -0.28, 1.12), (0.22, -0.10, 0.95), 0.05)
        it += [rod(S.p3(0.24 * k, 0.0, 0.95 * k), S.p3(0.30 * k, 0.0, 0.42 * k), 0.025 * k),
               S.box(0.18 * k, 0.42 * k, -0.07 * k, 0.07 * k, 0.32 * k, 0.12 * k),
               S.box(0.10 * k, 0.50 * k, -0.20 * k, 0.20 * k, 0.0, 0.32 * k)]
    elif kind == 'joventut':        # young woman, both arms raised over the head, drapery from the hips
        it, _ = body(S, k, draped='skirt')
        it += arm(S, k, 1, (0.02, 0.24, 1.78), (0.0, 0.05, 1.92))
        it += arm(S, k, -1, (0.02, -0.24, 1.78), (0.0, -0.05, 1.92))
    elif kind == 'noia':            # girl in a long gown, arms down
        it, _ = body(S, k, draped='full')
        it += arm(S, k, 1, (0.03, 0.25, 1.12), (0.08, 0.22, 0.85))
        it += arm(S, k, -1, (0.03, -0.25, 1.12), (0.08, -0.22, 0.85))
    elif kind == 'pastor':          # shepherd, right hand shading the eyes, flute, a ram at his side
        it, _ = body(S, k, female=False)
        it += arm(S, k, -1, (0.18, -0.30, 1.55), (0.14, -0.04, 1.73))
        it += arm(S, k, 1, (0.06, 0.28, 1.15), (0.14, 0.20, 1.20))
        it += [rod(S.p3(0.14 * k, 0.20 * k, 1.20 * k), S.p3(0.18 * k, 0.02 * k, 1.05 * k), 0.012 * k)]
        it += [rod(S.p3(-0.28 * k, 0.40 * k, 0.48 * k), S.p3(0.18 * k, 0.40 * k, 0.48 * k), 0.14 * k),      # ram: body
               S.sphere(0.30 * k, 0.40 * k, 0.60 * k, 0.085 * k, n=8)]                                         # head
        it += [rod(S.p3(dx * k, 0.40 * k + dy * k, 0.0), S.p3(dx * k, 0.40 * k + dy * k, 0.40 * k), 0.03 * k)
               for dx, dy in ((-0.22, -0.07), (-0.22, 0.07), (0.12, -0.07), (0.12, 0.07))]
    elif kind == 'maternitat':      # mother holding a child on her left shoulder, long gown
        it, _ = body(S, k, draped='full')
        it += arm(S, k, 1, (0.18, 0.24, 1.20), (0.14, -0.05, 1.40))
        it += arm(S, k, -1, (0.16, -0.20, 1.18), (0.16, 0.05, 1.30))
        it += child(S, 0.12 * k, 0.12 * k, 1.20 * k, 0.75 * k)
    elif kind == 'navegacio':       # draped woman with a rudder board at her right side
        it, _ = body(S, k, draped='full')
        it += arm(S, k, 1, (0.04, 0.26, 1.12), (0.10, 0.20, 0.90))
        it += arm(S, k, -1, (0.08, -0.30, 1.15), (0.10, -0.32, 1.02))
        it += [S.box(0.0, 0.10 * k, -0.48 * k, -0.34 * k, 0.0, 1.05 * k), S.box(-0.05 * k, 0.15 * k, -0.50 * k, -0.32 * k, 0.95 * k, 0.12 * k)]
    elif kind == 'femenina':        # woman draped from the hips, holding drapery, a small figure at her side
        it, _ = body(S, k, draped='skirt')
        it += arm(S, k, 1, (0.10, 0.26, 1.20), (0.16, 0.10, 1.42))
        it += arm(S, k, -1, (0.04, -0.26, 1.12), (0.08, -0.26, 0.85))
        it += child(S, 0.05 * k, -0.42 * k, 0.0, 0.55 * k)
    elif kind == 'dona_nen':        # woman with a flute, a child standing at her right side
        it, _ = body(S, k, draped='skirt')
        it += arm(S, k, 1, (0.14, 0.22, 1.20), (0.20, 0.0, 1.30))
        it += arm(S, k, -1, (0.12, -0.24, 1.18), (0.22, -0.02, 1.30))
        it += [rod(S.p3(0.21 * k, 0.12 * k, 1.36 * k), S.p3(0.24 * k, -0.20 * k, 1.20 * k), 0.012 * k)]
        it += child(S, 0.05 * k, -0.40 * k, 0.0, 0.65 * k)
    else:
        raise ValueError(kind)
    return it


SCULPT = {   # OSM node -> (kind, scale, material, Catalan/English label, pose note)
    5170812384: ('forjador', 1.22, 'sculpt', 'El Forjador · The Blacksmith', 'Muscular smith leaning on a hammer, drapery from the hips'),
    5170812387: ('joventut', 1.18, 'marble', 'Joventut · Youth', 'Young woman, both arms raised over the head, drapery from the hips'),
    5170812392: ('noia', 1.20, 'sculpt', 'Noia · Girl', 'Standing girl in a long gown, arms down'),
    5170812389: ('pastor', 1.20, 'sculpt', 'Pastor del flabiol · Shepherd with a flute', 'Shepherd shading his eyes, flute in hand, ram at his side'),
    5170812388: ('maternitat', 1.22, 'sculpt', 'Maternitat · Motherhood', 'Mother in a long gown holding a child on her shoulder'),
    5170812390: ('navegacio', 1.22, 'sculpt', 'La Navegació · Navigation', 'Draped woman with a rudder board at her side'),
    5170812386: ('femenina', 1.20, 'sculpt', 'Figura femenina · Female figure', 'Woman draped from the hips, small figure at her side'),
    5170812385: ('dona_nen', 1.20, 'sculpt', 'Dona amb nen i flabiol · Woman with child and flute', 'Woman with a flute, a child at her side'),
}
art = m.assembly('Escultures de les Fonts Bessones · Sculptures at the fountains', PLAZA,
                 object_type='Public sculptures at and around the twin fountains',
                 psets={**spec(Count=len(SCULPT), Context='The 1920s sculpture programme of Plaça de Catalunya',
                               Catalogue='Art Públic de Barcelona (codes not transcribed)'),
                        **am('sculpture', 12, 4, AJ_ART, 'Various sculptors (1920s)', 'Stone sculpture group', CON_ART),
                        **prov(('Positions from OSM artwork nodes (ODbL); poses from Wikimedia Commons; dimensions estimated', 'Medium',
                                'OSM nodes 5170812384–5170812392; Wikidata Q26836019, Q99462070, Q99459657, Q99459654, '
                                'Q99461346, Q99459652, Q99461349, Q99459662'))})
for a in SITE['sculptures']:
    kind, k, mat, label, pose = SCULPT[a['osm']]
    x, y = a['x'], a['y']
    near = SITE['fountains'][a['nearest']]['basin_wall']['centroid']
    face = math.degrees(math.atan2(x - near[0], y - near[1]))            # bearing away from the nearest basin centre
    at_rim = a['dist_outline_m'] < 1.0
    zg = ground_z(x, y) if not at_rim else FR[a['nearest']][0].z0
    G = Frame((x, y), face, zg)
    top = (FR[a['nearest']][1] - 0.06) if at_rim else 1.05                # plinth top above the ground
    year = int(a['start_date']) if a.get('start_date') else 1928
    sc = m.assembly(f'{label}', None, object_type='Sculpture on a plinth', parent=art,
                    psets={**spec(Title=a['name'], Artist=a['artist'], Date=a.get('start_date') or 'c. 1928 (not tagged in OSM)',
                                  Material=a['material'], OSMNode=a['osm'], Wikidata=a['wikidata'], WikimediaCommons=a['commons'],
                                  Location='On the rim of the fountain' if at_rim else
                                           f'Beside the {SITE["fountains"][a["nearest"]]["label"]} fountain, {a["dist_outline_m"]} m from it'),
                           **am('sculpture', 12, 4, AJ_ART, a['artist'], a['name'], CON_ART, year=year),
                           **prov(('Position from OSM (ODbL), facing away from the fountain (assumed); pose from photographs', 'Medium',
                                   f'OSM node {a["osm"]}; Wikidata {a["wikidata"]}; Wikimedia Commons «{a["commons"]}»'))})
    pl = [G.box(-0.62, 0.62, -0.62, 0.62, -0.05, 0.25), G.box(-0.50, 0.50, -0.50, 0.50, 0.20, top - 0.30),
          G.box(-0.56, 0.56, -0.56, 0.56, top - 0.12, 0.12)]
    m.element('IfcBuildingElementProxy', f'Pedestal · Plinth ({a["name"]})', pl, PLAZA, 'plinth', predefined='USERDEFINED',
              object_type='Sculpture plinth', parent=sc,
              src=('Plinth seen in photographs; dimensions estimated', 'Low', f'Wikimedia Commons «{a["commons"]}»'),
              psets={**spec(Height_mm=round(top * 1000), Footprint_mm='1 240 × 1 240', Inscription='Title and author (assumed)'),
                     **am('sculpture', 24, 4, AJ_ART, 'Demo stonemason', 'Limestone plinth', CON_ART, year=year)})
    S = Frame((x, y), face, zg + top)
    cond = 3 if a['osm'] in (5170812384, 5170812390) else 4
    m.element('IfcBuildingElementProxy', f'Escultura · Sculpture «{a["name"]}»', figure(kind, S, k), PLAZA, mat,
              predefined='USERDEFINED', object_type='Sculpture', parent=sc,
              src=('Simplified figure: pose from photographs, proportions estimated', 'Low',
                   f'Wikimedia Commons «{a["commons"]}»'),
              psets={**spec(Title=a['name'], Artist=a['artist'], Pose=pose, FigureHeight_m=round(1.92 * k, 2),
                            Material=a['material'], Technique='Carved stone'),
                     **am('sculpture', 12, cond, AJ_ART, a['artist'], a['name'], CON_ART, year=year,
                          LastConservation='2019 (cleaning and consolidation, demo)',
                          Note='Biological growth and black crust on the shoulders; cleaning proposed (demo)' if cond == 3 else None)})
    cutout(G, f'sculpture {a["name"]}', (-0.85, 0.85), (-0.85, 0.85), (CUT_FLOOR, top + 2.6))
    if not at_rim:          # the rim sculptures sit inside a fountain cut-out, already patched
        m.element('IfcSlab', f'Paviment · Paving patch ({a["name"]})', G.box(-0.85 - PATCH_MARGIN, 0.85 + PATCH_MARGIN,
                                                                             -0.85 - PATCH_MARGIN, 0.85 + PATCH_MARGIN,
                                                                             PATCH_TOP - 0.10, 0.10),
                  PLAZA, 'paving', predefined='PAVING',
                  object_type='Plaza paving over the cut-out (covers the mesh where this model replaces it)', parent=sc,
                  src=GROUND_SRC, common={'LoadBearing': False},
                  psets={**spec(Purpose='Visual: replaces the photogrammetric ground under the sculpture'),
                         **am('paving', 12, 4, AJ, 'Demo paving supplier', 'Plaza paving', CON_CIV)})

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'fonts-bessones.ifc')
m.finish(out)
cut_path = os.path.splitext(out)[0] + '_cutouts.json'
json.dump({'cdeMeshCutouts': {'version': 1, 'anchor': {'lon': LON0, 'lat': LAT0, 'height': RAW0},
                              'note': 'Boxes in metres: s along bearing (deg clockwise from north), t to its left, z above the '
                                      'anchor height (the tileset anchor, before the scene placement offset).',
                              'boxes': CUTOUTS}}, open(cut_path, 'w'), indent=1)
print('written', out, len(m.f.by_type('IfcProduct')), 'products,', len(CUTOUTS), 'cut-outs ->', cut_path)
