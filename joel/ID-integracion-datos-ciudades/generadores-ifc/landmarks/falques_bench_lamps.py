"""Bancs-fanals de Pere Falqués — Passeig de Gràcia: two of the modernista bench-lamps as an authored IFC4X3 model.

What it holds, on the tree-lined island between the Besòs side lane and the central carriageway of Passeig de
Gràcia, on the block between Gran Via de les Corts Catalanes and Carrer de la Diputació:
  * two bench-lamps (bancs-fanals) designed by Pere Falqués i Urpí (1906), 34.8 m apart along the island: each a
    curved bench clad in white trencadís (broken-tile mosaic) on its own mosaic plinth, with a backrest and the
    rounded end bolster the lamp post rises from; the iron lamp — square main post with its cast base, collar ring
    and ornamental band, the curved stay rising from the far end of the bench, the scrollwork and iron flowers
    between them, the long top arm with its brace, cresting and end knob, the short scroll arm, the crown, and
    the two hanging lanterns (iron body and shade, opal glass globe, LED lamp);
  * the lamp's electrical feed: concrete pad footing, the connection box in the post base, a draw pit beside
    each bench, and the buried street-lighting cable in its duct running along the island between them;
  * the paving: a patch of the Passeig's hexagonal Gaudí «panot» over a concrete base around each bench-lamp,
    with the granite kerb to the central carriageway;
  * the island's plane trees (five OSM tree nodes around and between the two bench-lamps) in cast-iron grates.

Detailed geometry (roughly LOD 400) carrying LOD 500-style asset data, so a click on any element shows what an
as-built asset register would hold. It is NOT the owner's as-built model and the asset values are invented:
every element says so in Pset_CDE_AssetManagement (demo) and Pset_CDE_Provenance.

What is real:
  * the street geometry from OpenStreetMap (© OpenStreetMap contributors, ODbL): the Besòs side lane (way
    116343002), the central carriageway (way 908375889), the island sidewalk (way 909097447) and the tree nodes of
    the island row, whose bearing here is 316.9° (landmarks/falques_bench_lamps_site.json);
  * the positions of the bench-lamps: OSM maps none of them, but the island's tree row (spacing 6–8.5 m) has two
    gaps on this block, 24.8 m and 13.9 m long, and each bench-lamp is placed in the middle of one;
  * the form — bench, post, curved stay, long and short arm, two hanging lanterns, crown — from photographs on
    Wikimedia Commons (Category:Fanals-bancs), and the designer and date;
  * the pavement levels from ICGC's photogrammetric Barcelona mesh: 72.92 m (ellipsoidal) at bench-lamp 1, 73.45 m
    at bench-lamp 2 (the Passeig climbs ≈ 1.5 % towards Diputació).
What is estimated, not measured: every dimension (bench ≈ 2.6 m long, seat 0.46 m, overall height ≈ 7.0 m, from
photographs), the ironwork's ornament (simplified to rings, discs and bars), the island's width and kerb, the
paving pattern on this island (OSM says paving_stones), the trees' sizes, and everything below the pavement.

Local axes: +x east, +y north, metres, origin at bench-lamp 1, z = 0 on its pavement, which the ICGC mesh puts at
72.92 m ellipsoidal (≈ 23.22 m above the Alicante datum: EGM08 undulation ≈ 49.70 m). Plan frame F: s along
316.9° (up the Passeig, towards Diputació), t to its left (south-west, towards the central carriageway).

Scene tiles: anchored at h = 72.92 (the raw, ellipsoidal mesh height) and linked with the same placement as the
ICGC mesh, ELLIPSOIDAL −49.70, so model and mesh move together if that offset is ever corrected.

usage: uv run --with ifcopenshell --with pyproj python landmarks/falques_bench_lamps.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/falques-bench-lamps.ifc src/falques-bench-lamps_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/falques-bench-lamps_qto.ifc \
           tiles/barcelona-falques-bench-lamps 41.389942 2.167819 72.92 0 --keep-origin \
           --wfs tiles/wfs/barcelona-falques-bench-lamps --wfs-name barcelona_falques_bench_lamps_features \
           --extras src/falques-bench-lamps_cutouts.json
"""
import json, math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model  # noqa: E402
from pyproj import Transformer  # noqa: E402

HERE = os.path.dirname(__file__)
SITE = json.load(open(os.path.join(HERE, 'falques_bench_lamps_site.json'), encoding='utf-8'))
LAT0, LON0 = SITE['origin']['lat'], SITE['origin']['lon']
RAW0 = SITE['datum_raw_ellipsoidal']
ELEV0 = round(RAW0 + SITE['icgc_offset_m'], 2)          # ≈ orthometric (Alicante): 23.22
BEAR = SITE['axis']['bearing_deg']                       # up the Passeig, towards Diputació
BL = SITE['bench_lamps']
SLOPE = BL[1]['z'] / BL[1]['s']                          # the Passeig climbs ≈ 1.5 % along s
BCN_CRS = (25831, 'ETRS89 / UTM zone 31N', 'ETRS89', 'Alicante (REDNAP)')

m = Model('Bancs-fanals de Pere Falqués — Passeig de Gràcia', 'Passeig de Gràcia, Besòs island, Gran Via–Diputació',
          'Bancs-fanals de Pere Falqués · Passeig de Gràcia', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 model (≈LOD 400 geometry, LOD 500-style asset data with demo values). '
                      'Street geometry © OpenStreetMap contributors (ODbL); pavement levels measured on the ICGC 3D mesh; '
                      'form from Wikimedia Commons photographs. Not the owner\'s as-built model.',
          tag_prefix='PFAL', crs=BCN_CRS, schema='IFC4X3_ADD2')

# The model's +y is true north; UTM grid north is not. Give the map conversion the grid direction of +x.
_tr = Transformer.from_crs(4326, 25831, always_xy=True)
_e0, _n0 = _tr.transform(LON0, LAT0)
_e1, _n1 = _tr.transform(LON0, LAT0 + 100 / 110574)
_alpha = math.atan2(_e1 - _e0, _n1 - _n0)              # grid azimuth of true north
_mc = m.f.by_type('IfcMapConversion')[0]
_mc.XAxisAbscissa, _mc.XAxisOrdinate = math.cos(_alpha), -math.sin(_alpha)

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('trencadis', 'Trencadís, white glazed ceramic on mortar', (0.92, 0.91, 0.86), 'Ceramic', 2000,
  'Broken white glazed tiles set in mortar over a brick and concrete core: the modernista «trencadís»')
M('iron', 'Wrought and cast iron, painted dark brown-black', (0.13, 0.10, 0.08), 'Iron', 7600,
  'Forged scrollwork and cast parts, the near-black brown of the Passeig\'s 1906 ironwork')
M('iron_grey', 'Cast iron, painted dark grey', (0.20, 0.20, 0.20), 'Iron', 7200)
M('globe', 'Opal glass globe', (0.95, 0.94, 0.90), 'Glass', 2500, transparency=0.30)
M('led', 'LED lamp, warm white diffuser', (1.00, 0.94, 0.72), 'Plastic', 1200)
M('panot', 'Hydraulic concrete tile «panot» with the hexagonal Gaudí relief, grey-green', (0.55, 0.60, 0.57), 'Concrete', 2300,
  'Hexagonal 3-sided relief tile (starfish, ammonite, seaweed) designed by Antoni Gaudí, Passeig de Gràcia standard')
M('concrete', 'Concrete C20/25, base and footings', (0.68, 0.67, 0.64), 'Concrete', 2400)
M('granite', 'Granite kerb, flamed finish, grey', (0.62, 0.61, 0.59), 'Stone', 2650)
M('cable', 'Copper conductors, XLPE insulation, black PVC sheath', (0.08, 0.08, 0.08), 'Copper', 3500)
M('duct', 'Corrugated HDPE duct, red (power)', (0.70, 0.12, 0.10), 'Plastic', 950)
M('pit', 'Precast concrete C30/37', (0.70, 0.69, 0.66), 'Concrete', 2400)
M('box', 'Glass-fibre polyester (GRP), grey', (0.55, 0.56, 0.57), 'Plastic', 1800)
M('bark', 'Plane-tree bark', (0.55, 0.50, 0.40), 'Wood', 700)

# ─── Geometry helpers ──────────────────────────────────────────────────────────────────────────────
f = m.f


def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def _perp(d):
    a = (0., 0., 1.) if abs(d[2]) < 0.9 else (1., 0., 0.)
    c = (d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0])
    return _unit(c)


def rod(p0, p1, r):
    """Round bar from p0 to p1 (3D points)."""
    d = tuple(b - a for a, b in zip(p0, p1))
    L = math.sqrt(sum(c * c for c in d))
    u = _unit(d)
    prof = f.createIfcCircleProfileDef('AREA', None, m._pl2(), float(r))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=u, ref=_perp(u)), f.createIfcDirection((0., 0., 1.)), float(L))


def disc(c, axis, r, w):
    """Disc centred at c, its axis along `axis`, w thick."""
    u = _unit(axis)
    p0 = tuple(ci - ui * w / 2 for ci, ui in zip(c, u))
    prof = f.createIfcCircleProfileDef('AREA', None, m._pl2(), float(r))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=u, ref=_perp(u)), f.createIfcDirection((0., 0., 1.)), float(w))


class Frame:
    """A plan frame: s along `bearing` (degrees from north, clockwise), t to its left, z up from `z0`."""

    def __init__(self, origin, bearing, z0=0.):
        b = math.radians(bearing)
        self.o, self.z0 = origin, z0
        self.u = (math.sin(b), math.cos(b))
        self.L = (-self.u[1], self.u[0])
        self.ang = math.atan2(self.u[1], self.u[0])

    def P(self, s, t):
        return (self.o[0] + s * self.u[0] + t * self.L[0], self.o[1] + s * self.u[1] + t * self.L[1])

    def p3(self, s, t, z):
        x, y = self.P(s, t)
        return (x, y, self.z0 + z)

    def v3(self, ds, dt, dz):
        return (ds * self.u[0] + dt * self.L[0], ds * self.u[1] + dt * self.L[1], dz)

    def box(self, s0, s1, t0, t1, z0, h):
        cx, cy = self.P((s0 + s1) / 2, (t0 + t1) / 2)
        return m.box(cx, cy, self.z0 + z0, abs(s1 - s0), abs(t1 - t0), h, angle=self.ang)

    def ngon(self, r, n, z0, h, phase=0., s=0., t=0.):
        """Regular n-gon prism (vertices at radius r), centred at (s, t)."""
        pts = [self.P(s + r * math.cos(math.radians(phase + k * 360 / n)), t + r * math.sin(math.radians(phase + k * 360 / n)))
               for k in range(n)]
        return m.prism(pts, self.z0 + z0, h)

    def rev(self, rz, z0, s=0., t=0.):
        x, y = self.P(s, t)
        return m.revolve(rz, x, y, self.z0 + z0)

    def poly(self, st, z0, h):
        return m.prism([self.P(s, t) for s, t in st], self.z0 + z0, h)


# Bench plan: a shallow arc, its ends coming forward towards the seat side (−t). R is the arc radius.
R_BENCH = 3.2


def bend(s):
    return -(R_BENCH - math.sqrt(R_BENCH ** 2 - s * s))


def band(F, s0, s1, ta, tb, z0, h, n=8):
    """Curved prism: between offsets ta < tb from the bench arc, from s0 to s1, z0 up h."""
    ss = [s0 + (s1 - s0) * i / n for i in range(n + 1)]
    pts = [(s, bend(s) + ta) for s in ss] + [(s, bend(s) + tb) for s in reversed(ss)]
    return F.poly(pts, z0, h)


def ring(F, s, z, r, t, n=10, rr=0.011):
    """A wrought-iron ring in the lamp's vertical s-z plane at t: n straight bars."""
    pts = [F.p3(s + r * math.cos(2 * math.pi * k / n), t, z + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    return [rod(pts[k], pts[(k + 1) % n], rr) for k in range(n)]


def bezier_pts(p0, p1, p2, n):
    return [tuple((1 - a) ** 2 * p0[i] + 2 * a * (1 - a) * p1[i] + a * a * p2[i] for i in range(2))
            for a in [k / n for k in range(n + 1)]]


def curve(F, sz, t, r):
    """Bars along a polyline of (s, z) points in the lamp plane at t."""
    return [rod(F.p3(a[0], t, a[1]), F.p3(b[0], t, b[1]), r) for a, b in zip(sz[:-1], sz[1:])]


# ─── Mesh cut-outs ─────────────────────────────────────────────────────────────────────────────────
# The ICGC mesh holds each real bench-lamp as a photogrammetric lump, and the IFC stands inside it. Each box below
# is where this model *replaces* the mesh: the scene hides the ground mesh inside it while the model is shown
# (tileset.json `extras.cdeMeshCutouts`, read by CDE-Frontend). Where a cut leaves a hole, the model lays the
# Passeig's paving over it.
CUTOUTS = []
PATCH_TOP, CUT_FLOOR = 0.03, 0.06       # above each pavement: patch top, and where the cut starts
PATCH_MARGIN = 0.6                       # the patch overlaps the mesh around the cut, so no seam shows the terrain
KERB_T = 1.10                            # the island's kerb face to the central carriageway (frame t)

# ─── Asset data ────────────────────────────────────────────────────────────────────────────────────
YEAR = {'heritage': 1906, 'lamp': 2019, 'feed': 2009, 'paving': 2009, 'tree': 1975}
WARRANTY_Y = {'heritage': 0, 'lamp': 5, 'feed': 10, 'paving': 10, 'tree': 2}
DATA_STATUS = 'Illustrative demo values — not the owner\'s as-built register'
_serial = {}


def _add_months(iso, months):
    y, mo, d = map(int, iso.split('-'))
    mo += months
    y, mo = y + (mo - 1) // 12, (mo - 1) % 12 + 1
    return f'{y:04d}-{mo:02d}-{min(d, 28):02d}'


def am(kind, interval_months, condition, owner, manufacturer, model, contractor, last='2026-06-17', **extra):
    """Pset_CDE_AssetManagement (demo): the fields an as-built asset register holds, with invented values."""
    code = {'heritage': 'PFA', 'lamp': 'ENL', 'feed': 'ELE', 'paving': 'PAV', 'tree': 'ARB'}[kind]
    n = _serial.get(code, 0) + 1
    _serial[code] = n
    y = YEAR[kind]
    w = WARRANTY_Y[kind]
    warranty = 'None (heritage asset, pre-dates warranties)' if w == 0 else \
        (f'{y + w}-12-31' + (' (expired)' if y + w < 2026 else ''))
    base = {'DataStatus': DATA_STATUS, 'AssetOwner': owner, 'Manufacturer': manufacturer, 'Model': model,
            'SerialNumber': f'BCN-{code}-PGR-{n:03d}', 'LifecycleStatus': 'In service', 'InstallationYear': y,
            'LastInspection': last, 'InspectionInterval_months': interval_months,
            'NextInspection': _add_months(last, interval_months), 'ConditionIndex_1to5': condition,
            'WarrantyEnd': warranty, 'MaintenanceContractor': contractor, 'MaintenanceStrategy': 'Condition-based'}
    base.update({k: v for k, v in extra.items() if v is not None})
    return {'Pset_CDE_AssetManagement (demo)': base}


def spec(**props):
    return {'Pset_CDE_Specification': props}


def prov(src):
    return {'Pset_CDE_Provenance': {'GeometrySource': src[0], 'Confidence': src[1], 'Reference': src[2] if len(src) > 2 else None}}


AJ = 'Ajuntament de Barcelona (register values are demo)'
AJ_LGT = 'Ajuntament de Barcelona — public lighting (demo)'
AJ_PARKS = 'Ajuntament de Barcelona — parks and trees (demo)'
CON_HER = 'Demo contractor — heritage ironwork and ceramics'
CON_LGT = 'Demo contractor — public lighting'
CON_URB = 'Demo contractor — street furniture and paving'
CON_ARB = 'Demo contractor — urban arboriculture'
FALQUES = 'Banc-fanal, municipal model by Pere Falqués i Urpí (1906)'
SMITH = 'Original ironwork, 1906 (workshop not recorded here)'

FORM_SRC = ('Form from Wikimedia Commons photographs; dimensions estimated; position in a gap of the OSM island tree row', 'Medium',
            'Commons Category:Fanals-bancs («Banc-fanal del passeig de Gràcia.jpg», «109 Banc fanal…», «035 Banc de trencadís…»); '
            'OSM tree nodes 12633020995/96 and 12633020992/93 (ODbL)')
ORN_SRC = ('Ornament simplified to rings, discs and bars; layout after photographs', 'Low',
           'Commons «Banc-fanal del passeig de Gràcia.jpg», «109 Banc fanal del passeig de Gràcia (Barcelona).jpg»')
TYP_SRC = ('Typical dimensions and detailing for Barcelona street lighting; not visible in any open source', 'Low')
BELOW_SRC = ('Below the pavement: not visible in any open source; typical for a Barcelona street-lighting circuit', 'Low')
OSM_GEO = ('Island geometry from OSM (ODbL); pavement level from the ICGC 3D mesh; paving pattern assumed', 'Medium',
           'OSM ways 116343002, 908375889, 909097447 (surface paving_stones); ICGC Barcelona mesh')

# ─── Spatial structure ─────────────────────────────────────────────────────────────────────────────
STREET = 'Andana Besòs del Passeig de Gràcia · Island level'
m.storey(STREET, 0., 'The tree-lined island between the Besòs side lane and the central carriageway, at bench-lamp 1\'s pavement')

F0 = Frame((0., 0.), BEAR, 0.)                         # the whole island, z on bench-lamp 1's pavement


def z_at(s):
    return SLOPE * s


def cutout(F, name, s, t, z, label):
    """Register a cut-out box in a plan frame and lay the paving patch (base slab + panot) over it."""
    x, y = F.P(0, 0)
    lon = LON0 + x / (111320 * math.cos(math.radians(LAT0)))
    lat = LAT0 + y / 110574
    CUTOUTS.append({'name': name, 'lon': round(lon, 8), 'lat': round(lat, 8), 'bearing': round(math.degrees(math.atan2(*F.u)), 3),
                    's': [round(v, 3) for v in s], 't': [round(v, 3) for v in t],
                    'z': [round(F.z0 + v, 3) for v in z]})
    s0, s1 = s[0] - PATCH_MARGIN, s[1] + PATCH_MARGIN
    t0, t1 = t[0] - PATCH_MARGIN, KERB_T - 0.30
    m.element('IfcSlab', f'Base de formigó · Paving base ({label})', F.box(s0, s1, t0, t1, PATCH_TOP - 0.17, 0.14), STREET,
              'concrete', predefined='BASESLAB', object_type='Concrete base under the panot', src=OSM_GEO,
              common={'LoadBearing': False},
              psets={**spec(Thickness_mm=140, Purpose='Base of the paving patch over the mesh cut-out'),
                     **am('paving', 24, 4, AJ, 'Demo ready-mix plant', 'HM-20 base 14 cm', CON_URB)})
    m.element('IfcCovering', f'Panot hexagonal de Gaudí · Hexagonal panot paving ({label})',
              F.box(s0, s1, t0, t1, PATCH_TOP - 0.03, 0.03), STREET, 'panot', predefined='FLOORING',
              object_type='Hexagonal Gaudí panot 40 cm (across flats), 6 cm, on mortar bed', src=OSM_GEO,
              psets={**spec(Pattern='Hexagonal relief, three motifs (Antoni Gaudí design)', TileSize_mm=400, Thickness_mm=60,
                            Bedding='Mortar on concrete base', Purpose='Visual: replaces the photogrammetric ground under the bench-lamp'),
                     **am('paving', 12, 4, AJ, 'Demo hydraulic-tile manufacturer', 'Panot hexagonal Gaudí 40', CON_URB,
                          Note='Two cracked tiles at the bench plinth, replacement scheduled (demo)' if label.endswith('2') else None)})
    m.element('IfcKerb', f'Vorada de granit · Granite kerb ({label})', F.box(s0, s1, KERB_T - 0.30, KERB_T, -0.25, 0.25 + PATCH_TOP),
              STREET, 'granite', predefined='USERDEFINED', object_type='Granite kerb 300 × 250 to the central carriageway',
              src=('Island edge from OSM carriageway and lane axes (ODbL); kerb section typical', 'Low', 'OSM ways 908375889, 116343002'),
              psets={**spec(Section_mm='300 × 250', Upstand_mm=140),
                     **am('paving', 24, 4, AJ, 'Demo stone supplier', 'Granite kerb C3 30×25', CON_URB)})


# ═══ Bench-lamps ══════════════════════════════════════════════════════════════════════════════════
S_POST, T_POST = 1.25, bend(1.25) + 0.12          # main post: through the end bolster, at the back of the bench
STAY = bezier_pts((-1.45, 0.05), (-1.35, 3.9), (S_POST, 4.95), 10)   # curved stay, (s, z)


def stay_s(z):
    """s of the curved stay at height z (it rises monotonically)."""
    for a, b in zip(STAY[:-1], STAY[1:]):
        if a[1] <= z <= b[1]:
            return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])
    return STAY[-1][0]


def bench_lamp(k, F):
    tp = T_POST
    pole = m.assembly(f'Banc-fanal {k} · Bench-lamp {k}', STREET, object_type='Banc-fanal: trencadís bench with two-light iron lamp',
                      description='Modernista bench-lamp of Passeig de Gràcia, designed by Pere Falqués i Urpí (1906).',
                      psets={**spec(Designer='Pere Falqués i Urpí', DesignYear=1906, Type='Banc-fanal (bench-lamp)',
                                    Bench='Trencadís over a masonry core', Lanterns=2, OverallHeight_m=7.0,
                                    BenchLength_m=2.6, HeritageStatus='Municipal heritage (demo — not checked)',
                                    InventoryRef=f'PG-BF-{k:02d} (demo)'),
                             **am('heritage', 12, 4 if k == 1 else 3, AJ, SMITH, FALQUES, CON_HER, LastRestoration='2014 (demo)'),
                             **prov(FORM_SRC)})

    # ── the bench
    m.element('IfcSlab', f'Sòcol del banc {k} · Bench plinth', band(F, -1.50, 1.62, -0.62, 0.42, 0.0, 0.05), STREET, 'trencadis',
              predefined='BASESLAB', object_type='Low mosaic-clad plinth following the bench\'s curve', parent=pole, src=FORM_SRC,
              common={'LoadBearing': True},
              psets={**spec(Height_mm=50, Finish='Trencadís, white'), **am('heritage', 12, 4, AJ, SMITH, FALQUES, CON_HER)})
    m.element('IfcFurniture', f'Banc de trencadís {k} · Mosaic bench',
              [band(F, -1.18, 1.10, -0.22, 0.30, 0.05, 0.31),                      # recessed body
               band(F, -1.32, 1.18, -0.44, 0.30, 0.36, 0.10),                      # seat slab with its front overhang
               F.rev([(0., 0.), (0.32, 0.), (0.34, 0.20), (0.30, 0.42), (0.20, 0.56), (0.0, 0.63)], 0.05, S_POST, tp - 0.02)],
              STREET, 'trencadis', predefined='USERDEFINED', object_type='Curved bench, brick core clad in white trencadís, with end bolster',
              parent=pole, src=FORM_SRC,
              psets={**spec(SeatHeight_mm=460, SeatDepth_mm=740, Length_mm=2600, Seats=3, Finish='Trencadís, white glazed ceramic'),
                     **am('heritage', 6, 3 if k == 2 else 4, AJ, SMITH, FALQUES, CON_HER,
                          Note='Loose tesserae at the seat front, re-set scheduled (demo)' if k == 2 else None)})
    m.element('IfcFurniture', f'Respatller {k} · Backrest',
              [band(F, -1.22, 1.00, 0.12, 0.32, 0.46, 0.40)] +
              [rod(F.p3(a, bend(a) + 0.22, 0.86), F.p3(b, bend(b) + 0.22, 0.86), 0.10)
               for a, b in zip([-1.22 + 2.22 * i / 6 for i in range(6)], [-1.22 + 2.22 * i / 6 for i in range(1, 7)])],
              STREET, 'trencadis', predefined='USERDEFINED', object_type='Curved backrest with a rounded top roll, trencadís',
              parent=pole, src=FORM_SRC, psets={**spec(BackHeight_mm=500), **am('heritage', 6, 4, AJ, SMITH, FALQUES, CON_HER)})

    # ── footing and feed at the base
    m.element('IfcFooting', f'Fonament del fanal {k} · Lamp footing', F.box(S_POST - 0.35, S_POST + 0.35, tp - 0.35, tp + 0.35, -0.95, 0.80),
              STREET, 'concrete', predefined='PAD_FOOTING', object_type='Concrete pad 700 × 700 × 800 with anchor cage',
              parent=pole, src=BELOW_SRC,
              psets={**spec(Size_mm='700 × 700 × 800', Anchors='4 × M24 (demo)'), **am('feed', 60, 4, AJ_LGT, 'Demo civil contractor', 'Pad footing', CON_LGT)})
    m.element('IfcJunctionBox', f'Caixa de connexió {k} · Connection box in the post base',
              [F.box(S_POST - 0.09, S_POST + 0.09, tp - 0.09, tp + 0.09, 0.62, 0.40),
               F.box(S_POST - 0.06, S_POST + 0.06, tp - 0.10, tp - 0.09, 0.68, 0.28)],
              STREET, 'iron_grey', predefined='POWER', object_type='Connection box with fuses behind a bolted door in the post base',
              parent=pole, src=TYP_SRC,
              psets={**spec(Fuses='2 × 6 A gG (demo)', Class='II', IngressProtection='IP44', Access='Bolted door, triangular key'),
                     **am('feed', 12, 4, AJ_LGT, 'Demo electrical supplier', 'Pole connection box CL-2', CON_LGT)})

    # ── the lamp
    lamp = m.assembly(f'Fanal de dos llums {k} · Two-light lamp {k}', None, object_type='Iron lamp rising from the bench', parent=pole,
                      psets={**spec(Lights=2, Control='Street-lighting circuit, astronomical clock', Retrofit='LED, 2019 (demo)'),
                             **am('lamp', 12, 4, AJ_LGT, SMITH, FALQUES, CON_LGT), **prov(FORM_SRC)})
    m.element('IfcColumn', f'Pal principal {k} · Main post',
              [F.box(S_POST - 0.055, S_POST + 0.055, tp - 0.055, tp + 0.055, -0.55, 7.40),
               F.rev([(0., 0.), (0.13, 0.), (0.13, 0.05), (0.09, 0.12), (0.10, 0.20), (0.075, 0.30), (0., 0.30)], 1.02, S_POST, tp)],
              STREET, 'iron', predefined='USERDEFINED', object_type='Square wrought-iron post 110 mm with cast base moulding, embedded 0.55 m in the footing',
              parent=lamp, src=FORM_SRC, common={'LoadBearing': True},
              psets={**spec(Section_mm='110 × 110', Height_mm=6850), **am('lamp', 12, 4, AJ_LGT, SMITH, FALQUES, CON_LGT)})
    m.element('IfcMember', f'Montant corbat {k} · Curved stay', curve(F, STAY, tp, 0.03), STREET, 'iron', predefined='MEMBER',
              object_type='Curved flat-bar stay from the far end of the bench to the post', parent=lamp, src=FORM_SRC,
              psets={**spec(Section_mm='60 × 20 (as round bar Ø60 here)'), **am('lamp', 12, 4, AJ_LGT, SMITH, FALQUES, CON_LGT)})
    band_items = [F.ngon(0.16, 8, 3.50, 0.12, 22.5, S_POST, tp)]
    for z in (3.52, 3.66):
        band_items.append(rod(F.p3(stay_s(z), tp, z), F.p3(S_POST, tp, z), 0.018))
    for j in range(4):
        sj = stay_s(3.59) + (S_POST - stay_s(3.59)) * (j + 0.5) / 4
        band_items.append(disc(F.p3(sj, tp, 3.59), F.v3(0, 1, 0), 0.06, 0.03))
    m.element('IfcMember', f'Anell i banda decorada {k} · Collar ring and ornamental band', band_items, STREET, 'iron',
              predefined='USERDEFINED', object_type='Octagonal collar with a flowered band tying the stay to the post', parent=lamp,
              src=ORN_SRC, psets=am('lamp', 12, 4, AJ_LGT, SMITH, FALQUES, CON_LGT))
    scroll = []
    for s, z, r in ((-0.80, 1.55, 0.22), (-0.45, 2.45, 0.26), (0.35, 2.85, 0.22), (0.80, 1.95, 0.18),
                    (-0.05, 4.25, 0.30), (0.75, 4.55, 0.18), (0.45, 5.45, 0.22), (-0.55, 5.62, 0.15)):
        scroll += ring(F, s, z, r, tp)
    for s, z in ((-0.62, 2.00), (-0.10, 2.70), (0.62, 2.40), (0.95, 2.95), (0.30, 3.95), (-0.40, 4.70), (0.95, 5.05),
                 (0.10, 5.75), (-0.95, 5.85), (0.70, 3.30)):
        scroll.append(disc(F.p3(s, tp, z), F.v3(0, 1, 0), 0.075, 0.03))
    scroll += [rod(F.p3(-0.58, tp, 1.68), F.p3(S_POST, tp, 1.75), 0.012), rod(F.p3(-0.20, tp, 2.50), F.p3(S_POST, tp, 2.55), 0.012)]
    for j, a in enumerate((-0.6, 0.0, 0.6)):                   # leaf pendants over the backrest
        x0 = a
        scroll.append(F.poly([(x0 - 0.07, bend(x0) + 0.33), (x0 + 0.07, bend(x0) + 0.33), (x0 + 0.07, bend(x0) + 0.35), (x0 - 0.07, bend(x0) + 0.35)], 0.70, 0.22))
        scroll.append(rod(F.p3(x0, bend(x0) + 0.34, 0.92), F.p3(x0, tp, 1.68 + 0.04 * (x0 + 0.6)), 0.010))
    m.element('IfcMember', f'Forja ornamental {k} · Scrollwork and iron flowers', scroll, STREET, 'iron', predefined='USERDEFINED',
              object_type='Wrought-iron scrolls, rings and forged flowers between stay and post; leaf pendants over the backrest',
              parent=lamp, src=ORN_SRC, psets=am('lamp', 12, 3 if k == 1 else 4, AJ_LGT, SMITH, FALQUES, CON_HER,
                                                  Note='Two forged petals missing, recast on order (demo)' if k == 1 else None))
    # long arm towards −s: top bar, brace, cresting, end knob
    arm = [rod(F.p3(S_POST, tp, 6.02), F.p3(-2.05, tp, 6.02), 0.025),
           m.sphere(*F.p3(-2.12, tp, 6.02), 0.08, n=8)]
    arm += curve(F, bezier_pts((S_POST, 4.95), (0.15, 5.95), (-1.45, 6.0), 8), tp, 0.02)
    for j in range(10):
        arm += ring(F, -1.55 + 0.27 * j, 6.10, 0.055, tp, n=6, rr=0.008)
    arm += ring(F, -1.78, 6.17, 0.10, tp, n=8) + ring(F, -1.62, 5.88, 0.07, tp, n=6)
    m.element('IfcMember', f'Braç llarg {k} · Long arm', arm, STREET, 'iron', predefined='USERDEFINED',
              object_type='Cantilevered top arm 3.3 m with curved brace, scroll cresting and end knob', parent=lamp, src=FORM_SRC,
              psets={**spec(Reach_mm=3300, Height_mm=6020), **am('lamp', 12, 4, AJ_LGT, SMITH, FALQUES, CON_LGT)})
    # short scroll arm towards +s
    sh = curve(F, bezier_pts((S_POST, 4.15), (2.05, 4.15), (2.02, 4.70), 6), tp, 0.022) + ring(F, 1.88, 4.80, 0.13, tp, n=8)
    m.element('IfcMember', f'Braç curt {k} · Short scroll arm', sh, STREET, 'iron', predefined='USERDEFINED',
              object_type='Gooseneck arm ending in a scroll, carrying the lower lantern', parent=lamp, src=FORM_SRC,
              psets={**spec(Reach_mm=780, Height_mm=4700), **am('lamp', 12, 4, AJ_LGT, SMITH, FALQUES, CON_LGT)})
    # crown
    crown = [F.rev([(0., 0.), (0.07, 0.), (0.09, 0.10), (0.20, 0.28), (0.22, 0.34), (0.16, 0.37), (0.06, 0.31), (0., 0.31)], 6.85, S_POST, tp),
             m.sphere(*F.p3(S_POST, tp, 7.28), 0.06, n=8), rod(F.p3(S_POST, tp, 7.32), F.p3(S_POST, tp, 7.45), 0.012)]
    for j in range(8):
        a = math.radians(22.5 + 45 * j)
        crown.append(rod(F.p3(S_POST + 0.20 * math.cos(a), tp + 0.20 * math.sin(a), 7.16),
                         F.p3(S_POST + 0.25 * math.cos(a), tp + 0.25 * math.sin(a), 7.36), 0.012))
    m.element('IfcMember', f'Corona {k} · Crown', crown, STREET, 'iron', predefined='USERDEFINED',
              object_type='Cast crown with eight points and finial over the post', parent=lamp, src=ORN_SRC,
              psets={**spec(Height_mm=600), **am('lamp', 12, 4, AJ_LGT, SMITH, FALQUES, CON_LGT)})

    # the two hanging lanterns: (name, s, hanger top, shade level)
    for j, (pos, s, z_top, z_shade) in enumerate((('upper, long arm', -1.95, 6.00, 5.25), ('lower, short arm', 2.02, 4.66, 3.90)), 1):
        m.element('IfcMember', f'Cos de la lanterna {k}.{j} · Lantern body ({pos})',
                  [rod(F.p3(s, tp, z_shade + 0.55), F.p3(s, tp, z_top), 0.008),
                   F.rev([(0., 0.), (0.17, 0.), (0.17, 0.025), (0.07, 0.06), (0.065, 0.12), (0.08, 0.14), (0.065, 0.16),
                          (0.065, 0.42), (0.08, 0.44), (0.04, 0.55), (0., 0.55)], z_shade, s, tp)],
                  STREET, 'iron', predefined='USERDEFINED', object_type='Cylindrical cast lantern body with ribs and a flat shade',
                  parent=lamp, src=FORM_SRC, psets={**spec(Height_mm=550, ShadeDiameter_mm=340),
                                                    **am('lamp', 12, 4, AJ_LGT, 'Demo heritage-lantern maker', 'Falqués lantern, replica', CON_LGT)})
        m.element('IfcLightFixture', f'Globus {k}.{j} · Glass globe ({pos})', [m.sphere(*F.p3(s, tp, z_shade - 0.11), 0.12, n=10)], STREET,
                  'globe', predefined='POINTSOURCE', object_type='Opal glass globe Ø240 under the shade', parent=lamp, src=FORM_SRC,
                  psets={**spec(IngressProtection='IP54', Glazing='Opal blown glass, net-pattern relief'),
                         **am('lamp', 12, 2 if (k, j) == (2, 2) else 4, AJ_LGT, 'Demo glassworks', 'Opal globe Ø240', CON_LGT,
                              Note='Globe chipped at the rim, replacement on order (demo)' if (k, j) == (2, 2) else None)})
        m.element('IfcLamp', f'Làmpada LED {k}.{j} · LED lamp ({pos})', [m.sphere(*F.p3(s, tp, z_shade - 0.10), 0.045, n=8)], STREET,
                  'led', predefined='LED', object_type='LED retrofit lamp 30 W, 3000 K', parent=lamp, src=TYP_SRC,
                  psets={**spec(Power_W=30, ColourTemperature_K=3000, LuminousFlux_lm=3300, Driver='DALI, dimmed 50 % after 00:00'),
                         **am('lamp', 12, 5, AJ_LGT, 'Demo LED manufacturer', 'LED retrofit E27 30 W', CON_LGT,
                              BurningHours=26100 + 140 * k + 31 * j)})

    cutout(F, f'Banc-fanal {k}', (-2.30, 2.30), (-1.05, 0.80), (CUT_FLOOR, 7.6), label=f'bench-lamp {k}')


FRAMES = [Frame(F0.P(b['s'], b['t']), BEAR, b['z']) for b in BL]
for k, F in enumerate(FRAMES, 1):
    bench_lamp(k, F)

# ═══ Street-lighting feed between the bench-lamps ═════════════════════════════════════════════════
feed = m.assembly('Alimentació de l\'enllumenat · Street-lighting feed', STREET, object_type='Buried lighting circuit along the island',
                  psets={**spec(Circuit='Passeig de Gràcia Besòs island, circuit 3 (demo)', Voltage='400/230 V, 3 ph + N',
                                Cable='RV-K 0.6/1 kV 4 × 6 mm² + earth 16 mm²', Duct='HDPE Ø90'),
                         **am('feed', 12, 4, AJ_LGT, 'Demo cable maker', 'RV-K 4×6', CON_LGT), **prov(BELOW_SRC)})
T_RUN, DEPTH = -0.90, 0.60                                    # the run, on the seat side of the benches
PITS = [b['s'] + 1.80 for b in BL]
xs = [-8.0, PITS[0], PITS[1], BL[1]['s'] + 8.0]
run, duct = [], []
for a, b in zip(xs[:-1], xs[1:]):
    p0, p1 = F0.p3(a, T_RUN, z_at(a) - DEPTH), F0.p3(b, T_RUN, z_at(b) - DEPTH)
    run.append(rod(p0, p1, 0.014)); duct.append(rod(p0, p1, 0.045))
for k, (b, sp) in enumerate(zip(BL, PITS), 1):
    zb = z_at(b['s'])
    tp = b['t'] + T_POST
    a0, a1, a2 = F0.p3(sp, T_RUN, zb - DEPTH), F0.p3(b['s'] + S_POST, tp, zb - DEPTH), F0.p3(b['s'] + S_POST, tp, zb + 0.70)
    run += [rod(a0, a1, 0.012), rod(a1, a2, 0.012)]
    duct.append(rod(a0, a1, 0.032))
m.element('IfcCableSegment', 'Cable d\'enllumenat · Lighting cable', run, STREET, 'cable', predefined='CABLESEGMENT',
          object_type='RV-K 0.6/1 kV 4 × 6 mm², with risers to the post bases', parent=feed, src=BELOW_SRC,
          psets={**spec(Conductors='4 × 6 mm² Cu', Insulation='XLPE', Sheath='PVC', Depth_m=DEPTH, Length_m=round(xs[-1] - xs[0] + 2 * 3.0, 1)),
                 **am('feed', 24, 4, AJ_LGT, 'Demo cable maker', 'RV-K 0.6/1 kV 4×6', CON_LGT, InsulationResistance_MOhm=480)})
m.element('IfcCableCarrierSegment', 'Tub corrugat · Cable duct', duct, STREET, 'duct', predefined='CONDUITSEGMENT',
          object_type='Corrugated HDPE duct Ø90 (Ø63 to the posts) in sand bedding', parent=feed, src=BELOW_SRC,
          psets={**spec(Diameter_mm=90, Bedding='Sand, warning tape 0.3 m above'), **am('feed', 60, 4, AJ_LGT, 'Demo duct maker', 'HDPE corrugated Ø90', CON_LGT)})
for k, (b, sp) in enumerate(zip(BL, PITS), 1):
    P = Frame(F0.P(sp, T_RUN), BEAR, z_at(sp))
    m.element('IfcDistributionChamberElement', f'Arqueta de registre {k} · Draw pit {k}',
              [P.box(-0.25, 0.25, -0.25, -0.20, -0.75, 0.72), P.box(-0.25, 0.25, 0.20, 0.25, -0.75, 0.72),
               P.box(-0.25, -0.20, -0.20, 0.20, -0.75, 0.72), P.box(0.20, 0.25, -0.20, 0.20, -0.75, 0.72),
               P.box(-0.25, 0.25, -0.25, 0.25, -0.83, 0.08)],
              STREET, 'pit', predefined='INSPECTIONCHAMBER', object_type='Precast draw pit 500 × 500, 750 deep', parent=feed, src=BELOW_SRC,
              psets={**spec(InnerSize_mm='400 × 400', Depth_mm=750), **am('feed', 12, 4, AJ_LGT, 'Demo precast plant', 'Draw pit 50×50', CON_LGT)})
    m.element('IfcCovering', f'Tapa de l\'arqueta {k} · Draw-pit cover', P.box(-0.25, 0.25, -0.25, 0.25, PATCH_TOP - 0.05, 0.05), STREET,
              'iron_grey', predefined='USERDEFINED', object_type='Ductile-iron cover 500 × 500, B125, marked «ENLLUMENAT»',
              parent=feed, src=TYP_SRC,
              psets={**spec(Class='B125 (EN 124)'), **am('feed', 12, 4, AJ_LGT, 'Demo foundry', 'Cover 50×50 B125', CON_LGT)})

# ═══ Plane trees in grates ════════════════════════════════════════════════════════════════════════
trees = m.assembly('Arbrat de l\'andana · Island trees', STREET, object_type='Street trees and grates',
                   psets={**am('tree', 12, 4, AJ_PARKS, 'Municipal nursery (demo)', 'Platanus × hispanica', CON_ARB),
                          **prov(('Positions from OSM tree nodes (ODbL); sizes typical', 'Medium', 'OSM nodes 12633020992–96'))})
for k, tr in enumerate(SITE['trees'], 1):
    G = Frame((tr['x'], tr['y']), BEAR, z_at(tr['s']))
    z = G.z0
    src = ('Position from OSM tree node (ODbL); grate typical', 'Medium', f'OSM node {tr["osm"]}')
    grate = [G.box(-0.70, 0.70, t - 0.03, t + 0.03, 0.0, 0.035) for t in (-0.67, 0.67)] + \
            [G.box(s - 0.03, s + 0.03, -0.70, 0.70, 0.0, 0.035) for s in (-0.67, 0.67)]
    grate.append(m.tube(*G.P(0, 0), z, 0.30, 0.25, 0.035))
    for j in range(8):
        th = j * math.pi / 4
        r0, r1 = 0.30, 0.66 / max(abs(math.cos(th)), abs(math.sin(th)))
        p0, p1 = G.P(r0 * math.cos(th), r0 * math.sin(th)), G.P(r1 * math.cos(th), r1 * math.sin(th))
        grate.append(m.box((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, z, math.dist(p0, p1), 0.03, 0.035,
                           angle=math.atan2(p1[1] - p0[1], p1[0] - p0[0])))
    for r in (0.42, 0.55):
        grate.append(m.tube(*G.P(0, 0), z, r + 0.015, r - 0.015, 0.035))
    m.element('IfcCovering', f'Escocell {k} · Tree grate {k}', grate, STREET, 'iron_grey', predefined='USERDEFINED',
              object_type='Cast-iron tree grate 1 400 × 1 400', parent=trees, src=src,
              psets=am('paving', 12, 4, AJ, 'Demo foundry', 'Tree grate 140×140, radial', CON_URB))
    m.element('IfcGeographicElement', f'Plàtan {k} · Plane tree {k}',
              [m.cylinder(*G.P(0, 0), z, 0.19, 3.0),
               rod(G.p3(0, 0, 2.8), G.p3(0.9, 0.6, 4.5), 0.12), rod(G.p3(0, 0, 2.8), G.p3(-0.8, 0.5, 4.6), 0.11),
               rod(G.p3(0, 0, 2.8), G.p3(0.1, -0.9, 4.4), 0.11)],
              STREET, 'bark', predefined='VEGETATION', object_type='Street tree (trunk and first limbs; the crown is in the ICGC mesh)',
              parent=trees, src=src,
              psets={'Pset_CDE_Vegetation': {'Species': 'Platanus × hispanica (assumed: the Passeig\'s plane trees; OSM node has no species)',
                                             'LeafType': 'Broadleaved', 'Trunk_Circumference_cm': 140 + 9 * k,
                                             'Height_m': 16 + (k % 3), 'OSMNode': tr['osm']},
                     **am('tree', 12, 4 if k != 4 else 3, AJ_PARKS, 'Municipal nursery (demo)', 'Platanus × hispanica, planting stock 20/25',
                          CON_ARB, LastPruning='2025-12-03', RiskAssessment='Low (visual tree assessment, demo)' if k != 4 else
                          'Moderate: cavity at 1.2 m, re-inspect in 6 months (demo)')})

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'falques-bench-lamps.ifc')
m.finish(out)
cut_path = os.path.splitext(out)[0] + '_cutouts.json'
json.dump({'cdeMeshCutouts': {'version': 1, 'anchor': {'lon': LON0, 'lat': LAT0, 'height': RAW0},
                              'note': 'Boxes in metres: s along bearing (deg clockwise from north), t to its left, z above the '
                                      'anchor height (the tileset anchor, before the scene placement offset).',
                              'boxes': CUTOUTS}}, open(cut_path, 'w'), indent=1)
print('written', out, len(m.f.by_type('IfcProduct')), 'products,', len(CUTOUTS), 'cut-outs ->', cut_path)
