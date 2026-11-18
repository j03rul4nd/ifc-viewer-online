"""Plaça de Catalunya — Passeig de Gràcia corner: a mobility hub as an authored IFC4X3 model.

What it holds, all within 45 m of the lift on the north pavement of the square:
  * the metro entrance «Passeig de Gràcia» (Catalunya, L1 · L3, with FGC and Rodalies in the same
    interchange): a two-flight stair with an intermediate landing and an up escalator beside it, the
    stairwell walls, parapet and glass balustrade, the covered stretch under the pavement and the
    signage totem;
  * the step-free lift from the pavement to the vestibule: glass kiosk, car, guide rails, shaft;
  * TMB bus stop 1210 «Pl Catalunya - Pg de Gràcia»: shelter, bench, real-time display, flag, kerb;
  * Bicing station 65 «Plaça Catalunya» (21 docks): base, docks, locks, terminal and the bikes in it;
  * street furniture: a post box, a litter bin, cast-iron tree grates with their trees.

Detailed geometry (roughly LOD 400) carrying LOD 500-style asset data, so a click on any element shows what an
as-built asset register would hold. It is NOT the owners' as-built model and the asset values are invented:
every element says so in Pset_CDE_AssetManagement (demo) and Pset_CDE_Provenance.

What is real:
  * positions from OpenStreetMap (© OpenStreetMap contributors, ODbL): the lift (node 6444804610), the stair
    opening (fence way 1425662351, steps 1552650527/1552650517), the entrance (node 1400468988), bus stop 1210
    (node 2484218128), Bicing 65 (node 430848865, capacity 21), the road axis (way 8380812), the post box,
    the bin and the trees;
  * shapes and heights measured on ICGC's photogrammetric Barcelona mesh (3D Tiles «Scene-28»), rasterised to a
    0.2 m surface model: the stair's first flight falls 2.4 m to a landing with an escalator beside it, the lift
    kiosk is 3.0 m square and 3.96 m tall, the shelter roof is 3.5 × 1.4 m at 2.5 m, the Bicing row is 24.8 m
    long, the kerbs stand 0.19 m above the road, and each pavement's level (landmarks/catalunya_site.json).
What is typical, not measured: everything below the pavement, sections, materials, the bikes, the furniture.

Local axes: +x east, +y north, metres, origin at the lift (OSM node 6444804610), z = 0 on its pavement, which
the ICGC mesh puts at 69.96 m ellipsoidal (≈ 20.26 m above the Alicante datum: EGM08 undulation ≈ 49.70 m).

Scene tiles: anchored at h = 69.96 (the raw, ellipsoidal mesh height) and linked with the same placement as the
ICGC mesh, ELLIPSOIDAL −49.70, so model and mesh move together if that offset is ever corrected.

usage: uv run --with ifcopenshell --with pyproj python landmarks/catalunya_mobility_hub.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/catalunya-mobility-hub.ifc src/catalunya-mobility-hub_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/catalunya-mobility-hub_qto.ifc \
           tiles/barcelona-catalunya-hub 41.3878551 2.1695421 69.96 0 --keep-origin \
           --wfs tiles/wfs/barcelona-catalunya-hub --wfs-name barcelona_catalunya_hub_features \
           --extras src/catalunya-mobility-hub_cutouts.json
"""
import json, math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model  # noqa: E402
from pyproj import Transformer  # noqa: E402

HERE = os.path.dirname(__file__)
SITE = json.load(open(os.path.join(HERE, 'catalunya_site.json'), encoding='utf-8'))
LAT0, LON0 = SITE['origin']['lat'], SITE['origin']['lon']
RAW0 = SITE['datum_raw_ellipsoidal']
ELEV0 = round(RAW0 + SITE['icgc_offset_m'], 2)          # ≈ orthometric (Alicante)
LV = {k: round(v - RAW0, 2) for k, v in SITE['levels_raw'].items()}
BCN_CRS = (25831, 'ETRS89 / UTM zone 31N', 'ETRS89', 'Alicante (REDNAP)')

m = Model('Plaça de Catalunya — Passeig de Gràcia mobility hub', 'Plaça de Catalunya, north corner',
          'Nus de mobilitat Pl. Catalunya · Pg. de Gràcia', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 model (≈LOD 400 geometry, LOD 500-style asset data with demo values). '
                      'Positions © OpenStreetMap contributors (ODbL); shapes and levels measured on the ICGC 3D mesh. '
                      'Not the owners\' as-built model.',
          tag_prefix='PCAT', crs=BCN_CRS, schema='IFC4X3_ADD2')

# The model's +y is true north; UTM grid north is not. Give the map conversion the grid direction of +x.
_tr = Transformer.from_crs(4326, 25831, always_xy=True)
_e0, _n0 = _tr.transform(LON0, LAT0)
_e1, _n1 = _tr.transform(LON0, LAT0 + 100 / 110574)
_alpha = math.atan2(_e1 - _e0, _n1 - _n0)              # grid azimuth of true north
_mc = m.f.by_type('IfcMapConversion')[0]
_mc.XAxisAbscissa, _mc.XAxisOrdinate = math.cos(_alpha), -math.sin(_alpha)

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('concrete', 'Reinforced concrete C30/37', (0.72, 0.71, 0.68), 'Concrete', 2500, 'Cast in place')
M('granite', 'Granite, flamed finish, light grey', (0.66, 0.65, 0.63), 'Stone', 2650, 'Flamed, 30 mm cladding / 80 mm treads')
M('granite_dark', 'Granite, polished, dark grey', (0.30, 0.30, 0.31), 'Stone', 2700, 'Kerbs and copings')
M('tile', 'Glazed ceramic tile 20×20, white', (0.93, 0.93, 0.91), 'Ceramic', 2000)
M('tile_red', 'Glazed ceramic tile, TMB red band', (0.80, 0.09, 0.13), 'Ceramic', 2000)
M('inox', 'Stainless steel AISI 316, brushed', (0.78, 0.79, 0.80), 'Steel', 8000)
M('steel', 'Structural steel S275, RAL 7016 anthracite', (0.23, 0.25, 0.27), 'Steel', 7850)
M('alu', 'Anodised aluminium, natural', (0.75, 0.76, 0.78), 'Aluminium', 2700)
M('glass', 'Laminated safety glass 10+10, extra clear', (0.78, 0.88, 0.88), 'Glass', 2500, transparency=0.6)
M('glass_lift', 'Laminated safety glass 8+8, low iron', (0.82, 0.90, 0.92), 'Glass', 2500, transparency=0.65)
M('nosing', 'Anti-slip nosing insert, yellow', (0.95, 0.76, 0.08), 'Polymer', 1300)
M('tactile', 'Tactile paving (stud), ochre', (0.86, 0.62, 0.16), 'Concrete', 2300)
M('rubber', 'Rubber handrail, black', (0.06, 0.06, 0.06), 'Rubber', 1200)
M('tmb_red', 'Coated aluminium, TMB red', (0.85, 0.07, 0.14), 'Aluminium', 2700)
M('white', 'Powder-coated aluminium, signal white', (0.95, 0.95, 0.94), 'Aluminium', 2700)
M('navy', 'Coated aluminium, navy blue', (0.10, 0.16, 0.33), 'Aluminium', 2700)
M('l1', 'Line badge, L1 red', (0.86, 0.13, 0.15), 'Aluminium', 2700)
M('l3', 'Line badge, L3 green', (0.20, 0.62, 0.25), 'Aluminium', 2700)
M('rodalies', 'Line badge, Rodalies orange', (0.93, 0.45, 0.05), 'Aluminium', 2700)
M('fgc', 'Line badge, FGC lime', (0.55, 0.75, 0.12), 'Aluminium', 2700)
M('light', 'Opal polycarbonate diffuser', (0.99, 0.98, 0.92), 'Plastic', 1200)
M('display', 'LED/TFT display, black glass', (0.06, 0.07, 0.08), 'Glass', 2500)
M('green_led', 'LED indicator, green', (0.15, 0.85, 0.30), 'Plastic', 1200)
M('access_blue', 'Accessibility sign, blue', (0.05, 0.33, 0.70), 'Aluminium', 2700)
M('dock', 'Powder-coated steel, Bicing white', (0.93, 0.93, 0.92), 'Steel', 7850)
M('bicing_red', 'Powder-coated, Bicing red', (0.84, 0.10, 0.12), 'Steel', 7850)
M('bike_white', 'Aluminium frame, white', (0.94, 0.94, 0.93), 'Aluminium', 2700)
M('bike_red', 'Aluminium frame, red', (0.80, 0.08, 0.12), 'Aluminium', 2700)
M('tyre', 'Puncture-proof tyre, black', (0.07, 0.07, 0.07), 'Rubber', 1200)
M('black', 'Polymer, black', (0.10, 0.10, 0.11), 'Plastic', 1200)
M('battery', 'Battery housing, dark grey', (0.20, 0.21, 0.23), 'Plastic', 1500)
M('cast_iron', 'Cast iron, painted dark grey', (0.18, 0.18, 0.18), 'Iron', 7200)
M('correos', 'Enamelled steel, Correos yellow', (1.00, 0.80, 0.00), 'Steel', 7850)
M('bin', 'Powder-coated steel, dark green-grey', (0.29, 0.33, 0.30), 'Steel', 7850)
M('bark', 'Plane-tree bark', (0.55, 0.50, 0.40), 'Wood', 700)
M('panot', 'Hydraulic panot paving 20×20, grey', (0.80, 0.79, 0.76), 'Concrete', 2300, 'Barcelona standard pavement')
M('chequer', 'Aluminium chequer plate', (0.68, 0.69, 0.70), 'Aluminium', 2700)

# ─── Geometry helpers ──────────────────────────────────────────────────────────────────────────────
f = m.f


def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def _perp(d):
    """Any unit vector perpendicular to d."""
    a = (0., 0., 1.) if abs(d[2]) < 0.9 else (1., 0., 0.)
    c = (d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0])
    return _unit(c)


def rod(p0, p1, r, r_in=None):
    """Round bar (or tube) from p0 to p1 (3D points)."""
    d = tuple(b - a for a, b in zip(p0, p1))
    L = math.sqrt(sum(c * c for c in d))
    u = _unit(d)
    prof = (f.createIfcCircleHollowProfileDef('AREA', None, m._pl2(), float(r), float(r - r_in)) if r_in
            else f.createIfcCircleProfileDef('AREA', None, m._pl2(), float(r)))
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
        """A direction given in frame components."""
        return (ds * self.u[0] + dt * self.L[0], ds * self.u[1] + dt * self.L[1], dz)

    def box(self, s0, s1, t0, t1, z0, h):
        cx, cy = self.P((s0 + s1) / 2, (t0 + t1) / 2)
        return m.box(cx, cy, self.z0 + z0, abs(s1 - s0), abs(t1 - t0), h, angle=self.ang)

    def cyl(self, s, t, z0, r, h):
        x, y = self.P(s, t)
        return m.cylinder(x, y, self.z0 + z0, r, h)

    def side(self, pts, t, width):
        """Polygon [(s, z)] in the vertical plane at t, `width` thick across it."""
        x, y = self.P(0, t)
        return m.extrude_vertical_profile([(s, z) for s, z in pts], (x, y, self.z0), self.u, width)

    def cross(self, pts, s, width):
        """Polygon [(t, z)] in the vertical plane at s, `width` thick along s."""
        x, y = self.P(s, 0)
        return m.extrude_vertical_profile([(t, z) for t, z in pts], (x, y, self.z0), self.L, width)


# ─── Mesh cut-outs ─────────────────────────────────────────────────────────────────────────────────
# The ICGC mesh already holds the real kiosk, shelter, bikes and the stair's sloped surfaces as photogrammetric
# lumps, and the IFC stood inside them. Each volume below is where this model *replaces* the mesh: the scene hides
# the ground mesh inside it while the model is shown (written to tileset.json `extras.cdeMeshCutouts`, read by
# CDE-Frontend). A 2.5D mesh has no ground under a lump, so where a cut leaves a hole the model lays a pavement
# patch over it (`patch=True`).
CUTOUTS = []
PATCH_TOP, CUT_FLOOR = 0.03, 0.06       # above each pavement: patch top, and where the cut starts
PATCH_MARGIN = 0.25                      # the patch overlaps the mesh around the cut, so no seam shows the terrain


def cutout(frame, name, s, t, z, patch=False):
    """Register a cut-out box in a plan frame: s, t ranges; z range relative to the frame's z0."""
    x, y = frame.P(0, 0)
    lon = LON0 + x / (111320 * math.cos(math.radians(LAT0)))
    lat = LAT0 + y / 110574
    CUTOUTS.append({'name': name, 'lon': round(lon, 8), 'lat': round(lat, 8), 'bearing': round(math.degrees(math.atan2(*frame.u)), 3),
                    's': [round(v, 3) for v in s], 't': [round(v, 3) for v in t],
                    'z': [round(frame.z0 + v, 3) for v in z]})
    if patch:
        m.element('IfcCovering', f'Paviment de reposició · Pavement patch ({name})',
                  frame.box(s[0] - PATCH_MARGIN, s[1] + PATCH_MARGIN, t[0] - PATCH_MARGIN, t[1] + PATCH_MARGIN, PATCH_TOP - 0.10, 0.10),
                  STREET, 'panot', predefined='FLOORING',
                  object_type='Panot pavement 20×20 over the cut-out (covers the mesh where this model replaces it)',
                  src=TYP_SRC, psets=spec(Purpose='Visual: replaces the photogrammetric ground under modelled objects'))


YEAR = {'metro': 1995, 'refurb': 2019, 'lift': 2011, 'escalator': 2016, 'bus': 2017, 'bicing': 2019,
        'furniture': 2014, 'tree': 1985}


def am(kind, interval_months, condition, owner, **extra):
    """Pset_CDE_AssetManagement (demo): the fields an as-built asset register holds, with invented values."""
    base = {'DataStatus': 'Illustrative demo values — not the asset owner\'s records',
            'AssetOwner': owner, 'LifecycleStatus': 'In service', 'InstallationYear': YEAR[kind],
            'InspectionInterval_months': interval_months, 'LastInspection': '2026-07-08',
            'NextInspection': '2026-10-08' if interval_months <= 3 else ('2027-01-08' if interval_months <= 6 else '2027-07-08'),
            'ConditionIndex_1to5': condition, 'MaintenanceStrategy': 'Condition-based'}
    base.update({k: v for k, v in extra.items() if v is not None})
    return {'Pset_CDE_AssetManagement (demo)': base}


def spec(**props):
    return {'Pset_CDE_Specification': props}


TMB, AJ, BIC, COR = 'TMB — Metro de Barcelona (demo)', 'Ajuntament de Barcelona (demo)', 'Bicing — Ajuntament de Barcelona (demo)', 'Correos (demo)'
OSM_STAIR = ('OSM stair opening and steps (ODbL); levels and flights measured on the ICGC 3D mesh', 'Medium',
             'OSM way 1425662351, ways 1552650527 and 1552650517; ICGC Scene-28')
ICGC_SRC = ('Measured on the ICGC 3D mesh (0.2 m surface model); position from OSM (ODbL)', 'Medium', 'ICGC Scene-28')
TYP_SRC = ('Typical dimensions and detailing; position from OSM and the ICGC mesh', 'Low')
BELOW_SRC = ('Below the pavement: not visible in any open source; typical for a Barcelona metro access', 'Low')

# ─── Spatial structure ─────────────────────────────────────────────────────────────────────────────
STREET = 'Nivell carrer · Street level'
LEVEL1 = 'Vestíbul · Level −1'

# ═══ 1. Metro entrance «Passeig de Gràcia» ════════════════════════════════════════════════════════
ST = Frame(tuple(SITE['stair_centre']), SITE['stair_bearing_deg'], LV['stair'])
S_IN, S_OUT, T_HALF = -4.05, 4.05, 2.60           # OSM fence: open at the north-west (entry) end
T_WALL = 2.35                                      # inner face of the stairwell walls
STAIR_T = (-T_WALL, 0.70)                          # stair, south-west side
ESC_T = (0.90, T_WALL)                             # escalator, north-east side (centre 1.625)
RISER, GOING = 0.1714, 0.29
F1_TOP, F1_N = -1.90, 14                           # first flight: 14 risers, 2.40 m
LAND_Z = -F1_N * RISER
LAND_S0 = F1_TOP + (F1_N - 1) * GOING
F2_TOP = LAND_S0 + 1.50
F2_N = 13
F2_S1 = F2_TOP + (F2_N - 1) * GOING
Z_LOW = LAND_Z - F2_N * RISER                      # the corridor floor, in the stair frame
Z_V = round(LV['stair'] + Z_LOW, 3)                # ... and below the lift's pavement (the vestibule level)
m.storey(STREET, 0., 'Pavements of Plaça de Catalunya and Passeig de Gràcia')
m.storey(LEVEL1, Z_V, 'Access corridor towards the Catalunya vestibule (L1 · L3)')
S_END = 9.80
ESC_TOP, ESC_SLOPE = -2.60, math.tan(math.radians(30))
ESC_BOT = ESC_TOP + (-Z_LOW) / ESC_SLOPE


def stair_z(s):
    """Top surface of the stair side at s (stair frame)."""
    if s <= F1_TOP:
        return 0.
    if s < LAND_S0:
        return -RISER * min(F1_N, math.ceil((s - F1_TOP) / GOING + 1e-9))
    if s <= F2_TOP:
        return LAND_Z
    if s < F2_S1:
        return LAND_Z - RISER * min(F2_N, math.ceil((s - F2_TOP) / GOING + 1e-9))
    return Z_LOW


def esc_z(s):
    if s <= ESC_TOP:
        return 0.
    if s >= ESC_BOT:
        return Z_LOW
    return -(s - ESC_TOP) * ESC_SLOPE


def flight_profile(s_top, z_top, n):
    pts = [(s_top - 0.30, z_top), (s_top, z_top)]
    for k in range(n):
        pts += [(s_top + k * GOING, z_top - (k + 1) * RISER), (s_top + (k + 1) * GOING, z_top - (k + 1) * RISER)]
    s_end, z_end = s_top + n * GOING, z_top - n * RISER
    return pts + [(s_end, z_end - 0.25), (s_top - 0.30, z_top - 0.25)]


acc = m.assembly('Accés metro «Passeig de Gràcia» · Metro entrance', STREET, object_type='Metro station entrance',
                 psets={**spec(Station='Catalunya', Lines='L1 · L3 (interchange with FGC and Rodalies)',
                               EntranceName='Passeig de Gràcia', StepFree='No — use the lift 25 m south-west',
                               OpenHours='05:00–24:00 (Fri to 02:00, Sat 24 h)'),
                        **am('metro', 12, 4, TMB)})

# stair
stair = m.assembly('Escala fixa · Stair (two flights)', None, object_type='Stair', parent=acc,
                   psets=spec(Risers=F1_N + F2_N, Riser_mm=round(RISER * 1000), Going_mm=round(GOING * 1000),
                              ClearWidth_mm=round((STAIR_T[1] - STAIR_T[0]) * 1000), Rise_m=round(-Z_LOW, 2)))
stair_w = STAIR_T[1] - STAIR_T[0]
stair_tc = (STAIR_T[0] + STAIR_T[1]) / 2
m.element('IfcStairFlight', 'Tram 1 · Flight 1 (14 risers)', ST.side(flight_profile(F1_TOP, 0., F1_N), stair_tc, stair_w),
          STREET, 'granite', predefined='STRAIGHT', object_type='Granite stair flight on RC', parent=stair, src=OSM_STAIR,
          psets={**spec(NumberOfRiser=F1_N, NumberOfTreads=F1_N - 1, RiserHeight_mm=171, TreadLength_mm=290,
                        Finish='Flamed granite 80 mm, anti-slip'), **am('refurb', 6, 4, TMB)},
          common={'NumberOfRiser': F1_N, 'NumberOfTreads': F1_N - 1, 'RiserHeight': RISER, 'TreadLength': GOING})
m.element('IfcSlab', 'Replà intermedi · Intermediate landing',
          ST.box(LAND_S0, F2_TOP, STAIR_T[0], STAIR_T[1], LAND_Z - 0.30, 0.30), STREET, 'granite', predefined='LANDING',
          object_type='Stair landing, granite on RC', parent=stair, src=OSM_STAIR,
          psets={**spec(Length_mm=round((F2_TOP - LAND_S0) * 1000)), **am('refurb', 6, 4, TMB)})
m.element('IfcStairFlight', 'Tram 2 · Flight 2 (13 risers)', ST.side(flight_profile(F2_TOP, LAND_Z, F2_N), stair_tc, stair_w),
          STREET, 'granite', predefined='STRAIGHT', object_type='Granite stair flight on RC', parent=stair, src=BELOW_SRC,
          psets={**spec(NumberOfRiser=F2_N, NumberOfTreads=F2_N - 1, RiserHeight_mm=171, TreadLength_mm=290), **am('refurb', 6, 4, TMB)},
          common={'NumberOfRiser': F2_N, 'NumberOfTreads': F2_N - 1, 'RiserHeight': RISER, 'TreadLength': GOING})
nos = []
for s_top, z_top, n in ((F1_TOP, 0., F1_N), (F2_TOP, LAND_Z, F2_N)):
    for j in range(n):
        s = s_top + j * GOING
        nos.append(ST.box(s, s + 0.05, STAIR_T[0] + 0.05, STAIR_T[1] - 0.05, z_top - j * RISER, 0.006))
m.element('IfcCovering', 'Bandes antilliscants · Anti-slip nosings', nos, STREET, 'nosing', predefined='USERDEFINED',
          object_type='Nosing insert 50 mm, contrasting', parent=stair, src=TYP_SRC,
          psets={**spec(Count=len(nos), Contrast='Yellow on grey granite, LRV difference > 30'),
                 **am('refurb', 3, 3, TMB, Note='Four inserts worn on flight 1, replacement planned (demo)')})
m.element('IfcCovering', 'Paviment podotàctil d\'avís · Tactile warning strip',
          [ST.box(F1_TOP - 0.62, F1_TOP - 0.02, STAIR_T[0] + 0.05, STAIR_T[1] - 0.05, 0., 0.012),
           ST.box(LAND_S0 + 0.02, LAND_S0 + 0.62, STAIR_T[0] + 0.05, STAIR_T[1] - 0.05, LAND_Z, 0.012)],
          STREET, 'tactile', predefined='FLOORING', object_type='Tactile warning paving (studs), 600 mm', parent=stair,
          src=TYP_SRC, psets={**spec(Standard='UNE-CEN/TS 15209'), **am('refurb', 6, 4, TMB)})

# handrails: wall side, centre and the divider with the escalator
hr = []
for t in (STAIR_T[0] + 0.07, stair_tc, STAIR_T[1] - 0.07):
    for s_top, z_top, n in ((F1_TOP, 0., F1_N), (F2_TOP, LAND_Z, F2_N)):
        s_end, z_end = s_top + (n - 1) * GOING, z_top - n * RISER
        a = ST.p3(s_top - 0.30, t, z_top + 0.90)
        b = ST.p3(s_top, t, z_top + 0.90)
        c = ST.p3(s_end, t, z_end + RISER + 0.90)
        d = ST.p3(s_end + 0.30, t, z_end + 0.90)
        hr += [rod(a, b, 0.024), rod(b, c, 0.024), rod(c, d, 0.024)]
        for k in range(0, n, 4):
            s = s_top + k * GOING + 0.10
            zt = z_top - (k + 1) * RISER if k else z_top
            hr.append(rod(ST.p3(s, t, zt), ST.p3(s, t, zt + 0.90), 0.020))
m.element('IfcRailing', 'Passamans de l\'escala · Stair handrails', hr, STREET, 'inox', predefined='HANDRAIL',
          object_type='Handrail Ø48 AISI 316 on posts', parent=stair, src=TYP_SRC,
          psets={**spec(Diameter_mm=48, Height_mm=900, Extension_mm=300), **am('refurb', 12, 4, TMB)})

# escalator
esc = m.assembly('Escala mecànica · Up escalator', None, object_type='Escalator', parent=acc,
                 psets={**spec(Direction='Up (vestibule → street)', Inclination_deg=30, StepWidth_mm=800,
                               Rise_m=round(-Z_LOW, 2), Speed_m_s=0.5, Capacity_persons_h=6000,
                               Drive='Variable speed, standby when idle'),
                        **am('escalator', 1, 4, TMB, OperatingHours_total=61840, Starts_last_30_days=4120,
                             Availability_pct_12m=98.6, LastStepChainInspection='2026-09-02')})
etc = (ESC_T[0] + ESC_T[1]) / 2
stepw = 0.80
esteps = [(ESC_TOP, 0.)]
n_esc = int((ESC_BOT - ESC_TOP) / 0.40)
for k in range(n_esc):
    s0 = ESC_TOP + k * 0.40
    esteps += [(s0, esc_z(s0) - 0.231), (s0 + 0.40, esc_z(s0) - 0.231)]
esteps += [(ESC_BOT, Z_LOW), (ESC_BOT, Z_LOW - 0.40), (ESC_TOP, -0.40)]
m.element('IfcTransportElement', 'Escala mecànica E-1 · Escalator E-1', ST.side(esteps, etc, stepw), STREET, 'chequer',
          predefined='ESCALATOR', object_type='Public-service escalator, 30°, 800 mm steps', parent=esc, src=ICGC_SRC,
          psets={**spec(Steps=n_esc + 6, StepMaterial='Die-cast aluminium, yellow demarcation'),
                 **am('escalator', 1, 4, TMB)})
dem = []
for k in range(n_esc):
    s0 = ESC_TOP + k * 0.40
    z0 = esc_z(s0) - 0.231
    dem.append(ST.box(s0 + 0.36, s0 + 0.40, etc - stepw / 2, etc + stepw / 2, z0, 0.004))
    for side in (-1, 1):
        dem.append(ST.box(s0, s0 + 0.40, etc + side * (stepw / 2 - 0.02) - 0.02, etc + side * (stepw / 2 - 0.02) + 0.02, z0, 0.004))
m.element('IfcCovering', 'Línies de demarcació dels graons · Step demarcation', dem, STREET, 'nosing', predefined='USERDEFINED',
          object_type='Yellow step demarcation (EN 115-1)', parent=esc, src=TYP_SRC, psets=am('escalator', 6, 4, TMB))
incl = [(ESC_TOP - 1.0, 0.), (ESC_TOP, 0.), (ESC_BOT, Z_LOW), (ESC_BOT + 1.0, Z_LOW)]


def band(z_lo, z_hi, pts=incl):
    """A strip following the escalator's line, z_lo..z_hi above it."""
    top = [(s, z + z_hi) for s, z in pts]
    bot = [(s, z + z_lo) for s, z in reversed(pts)]
    return top + bot


for side, label in ((-1, 'costat escala · stair side'), (1, 'costat mur · wall side')):
    tg = etc + side * 0.44
    m.element('IfcPlate', f'Sòcol · Skirt panel ({label})', ST.side(band(-0.05, 0.10), etc + side * 0.41, 0.012), STREET, 'inox',
              predefined='USERDEFINED', object_type='Skirt panel, low-friction coated', parent=esc, src=TYP_SRC,
              psets=am('escalator', 3, 4, TMB))
    m.element('IfcPlate', f'Balustrada de vidre · Glass balustrade ({label})', ST.side(band(0.14, 0.94), tg, 0.012), STREET, 'glass',
              predefined='CURTAIN_PANEL', object_type='Tempered glass balustrade 10 mm', parent=esc, src=TYP_SRC,
              psets=am('escalator', 6, 5, TMB))
    m.element('IfcRailing', f'Passamà mòbil · Moving handrail ({label})', ST.side(band(0.94, 1.00), tg, 0.08), STREET, 'rubber',
              predefined='HANDRAIL', object_type='Moving handrail, synchronised with steps', parent=esc, src=TYP_SRC,
              psets={**spec(SpeedDeviationLimit_pct=2), **am('escalator', 1, 3, TMB, Note='Handrail wear at upper newel (demo)')})
    t0, t1 = (STAIR_T[1], etc - 0.45) if side < 0 else (etc + 0.45, T_WALL)
    m.element('IfcCovering', f'Coberta del sòcol · Decking ({label})', ST.side(band(0.06, 0.13), (t0 + t1) / 2, abs(t1 - t0)),
              STREET, 'inox', predefined='CLADDING', object_type='Inner/outer decking, brushed stainless', parent=esc,
              src=TYP_SRC, psets=am('escalator', 6, 4, TMB))
for s, z, label in ((ESC_TOP, 0., 'superior · upper'), (ESC_BOT, Z_LOW, 'inferior · lower')):
    m.element('IfcCovering', f'Pinta · Comb plate ({label})', ST.box(s - 0.12, s + 0.06, etc - 0.42, etc + 0.42, z, 0.012), STREET, 'nosing',
              predefined='USERDEFINED', object_type='Comb plate, yellow segments', parent=esc, src=TYP_SRC, psets=am('escalator', 1, 4, TMB))
    s0, s1 = (s - 1.20, s - 0.12) if s == ESC_TOP else (s + 0.06, s + 1.20)
    m.element('IfcCovering', f'Placa de replà · Landing plate ({label})', ST.box(s0, s1, etc - 0.55, etc + 0.55, z - 0.01, 0.015), STREET,
              'chequer', predefined='FLOORING', object_type='Landing floor plate, removable', parent=esc, src=TYP_SRC,
              psets=am('escalator', 3, 4, TMB))
    sb = s - 0.9 if s == ESC_TOP else s + 0.9
    m.element('IfcSwitchingDevice', f'Polsador de parada d\'emergència ({label})',
              ST.box(sb - 0.06, sb + 0.06, etc + 0.62, etc + 0.70, z + 0.13, 0.08), STREET, 'tmb_red', predefined='EMERGENCYSTOP',
              object_type='Emergency stop button, red, with cover', parent=esc, src=TYP_SRC,
              psets={**spec(Function='Stops the escalator with controlled deceleration'), **am('escalator', 1, 5, TMB)})
    m.element('IfcLightFixture', f'Indicador de sentit ({label})', ST.box(sb - 0.08, sb + 0.08, etc - 0.70, etc - 0.62, z + 0.13, 0.08),
              STREET, 'green_led', predefined='POINTSOURCE', object_type='Direction indicator (green arrow / red no-entry)',
              parent=esc, src=TYP_SRC, psets=am('escalator', 6, 5, TMB))
truss = [(ESC_TOP - 1.0, -0.15), (ESC_TOP, -0.15), (ESC_BOT, Z_LOW - 0.15), (ESC_BOT + 1.0, Z_LOW - 0.15),
         (ESC_BOT + 1.0, Z_LOW - 1.20), (ESC_BOT, Z_LOW - 1.20), (ESC_TOP, -1.20), (ESC_TOP - 1.0, -1.20)]
m.element('IfcMember', 'Gelosia de l\'escala mecànica · Escalator truss', ST.side(truss, etc, 1.40), STREET, 'steel',
          predefined='USERDEFINED', object_type='Welded steel truss with drive station', parent=esc, src=BELOW_SRC,
          psets=am('escalator', 12, 4, TMB))

# stairwell structure
wel = m.assembly('Estructura del pou d\'escala · Stairwell structure', None, object_type='Stairwell', parent=acc)
for t, label in ((-T_WALL - 0.15, 'sud-oest · south-west'), (T_WALL + 0.15, 'nord-est · north-east')):
    m.element('IfcWall', f'Mur de contenció {label}',
              ST.side([(S_IN, 0.18), (S_OUT + 0.35, 0.18), (S_OUT + 0.35, -0.40), (S_END + 0.3, -0.40),
                       (S_END + 0.3, Z_LOW - 0.45), (F2_S1, Z_LOW - 0.45),
                       (F1_TOP, -0.60), (S_IN, -0.60)], t, 0.30), STREET, 'concrete', predefined='RETAININGWALL',
              object_type='RC retaining wall 300 mm', parent=wel, src=BELOW_SRC,
              psets={**spec(Thickness_mm=300, Concrete='C30/37 XC4', Waterproofing='Bentonite + drained cavity'),
                     **am('metro', 24, 4, TMB)})
m.element('IfcBeam', 'Llinda de l\'obertura · Opening edge beam',
          ST.box(S_OUT - 0.05, S_OUT + 0.35, -T_WALL - 0.30, T_WALL + 0.30, -0.55, 0.73), STREET, 'concrete', predefined='LINTEL',
          object_type='RC edge beam 400×730', parent=wel, src=ICGC_SRC, psets=am('metro', 24, 4, TMB))
m.element('IfcSlab', 'Llosa de cobertura sota vorera · Roof slab under the pavement',
          ST.box(S_OUT + 0.35, S_END + 0.30, -T_WALL - 0.30, T_WALL + 0.30, -0.40, 0.38), STREET, 'concrete', predefined='ROOF',
          object_type='RC roof slab 380 mm, pavement build-up above', parent=wel, src=BELOW_SRC,
          psets={**spec(Thickness_mm=380, LiveLoad_kN_m2=5.0, Note='Pavement and drainage layers above'), **am('metro', 24, 4, TMB)})
m.element('IfcSlab', 'Llosa del passadís · Corridor floor slab', ST.box(F2_S1, S_END + 0.30, -T_WALL, T_WALL, Z_LOW - 0.30, 0.30),
          LEVEL1, 'granite', predefined='FLOOR', object_type='Granite floor on RC slab', src=BELOW_SRC, psets=am('metro', 12, 4, TMB))
m.element('IfcWall', 'Mur de fons · End wall towards the vestibule', ST.box(S_END + 0.30, S_END + 0.60, -T_WALL - 0.30, T_WALL + 0.30, Z_LOW - 0.30, -Z_LOW - 0.10),
          LEVEL1, 'concrete', predefined='SOLIDWALL', object_type='RC wall with the corridor turning south-east', src=BELOW_SRC,
          psets=am('metro', 24, 4, TMB))

# cladding: granite panels in the open stairwell, white tile with the TMB band under the slab
for side, t in ((-1, -T_WALL + 0.015), (1, T_WALL - 0.015)):
    gran, tile, red = [], [], []
    zf = stair_z if side < 0 else esc_z
    s = S_IN + 0.05
    while s < S_END - 0.05:
        s1 = min(s + 1.19, S_END - 0.05)
        zb0, zb1 = zf(s) + (0.02 if side < 0 else 0.10), zf(s1) + (0.02 if side < 0 else 0.10)
        if side < 0:
            zb0, zb1 = min(zf(s), zf(s1 - 1e-3)) + 0.02, min(zf(s), zf(s1 - 1e-3)) + 0.02
        if s1 <= S_OUT:
            if max(zb0, zb1) < 0.12:
                gran.append(ST.side([(s, zb0), (s1, zb1), (s1, 0.16), (s, 0.16)], t, 0.03))
        else:
            top = -0.42
            if max(zb0, zb1) < top - 0.1:
                tile.append(ST.side([(s, zb0), (s1, zb1), (s1, top), (s, top)], t, 0.025))
                red.append(ST.side([(s, zf(s) + 1.10), (s1, zf(s1 - 1e-3) + 1.10), (s1, zf(s1 - 1e-3) + 1.25), (s, zf(s) + 1.25)], t - side * 0.014, 0.004))
        s = s1 + 0.006
    lab = 'sud-oest · south-west' if side < 0 else 'nord-est · north-east'
    if gran:
        m.element('IfcCovering', f'Aplacat de granit, mur {lab}', gran, STREET, 'granite', predefined='CLADDING',
                  object_type='Granite cladding panels 1 190 mm, 6 mm joints', parent=wel, src=TYP_SRC, psets=am('refurb', 24, 4, TMB))
    if tile:
        m.element('IfcCovering', f'Revestiment ceràmic, mur {lab}', tile, LEVEL1, 'tile', predefined='CLADDING',
                  object_type='White glazed tile 20×20', src=BELOW_SRC, psets=am('refurb', 24, 4, TMB))
        m.element('IfcCovering', f'Franja corporativa, mur {lab}', red, LEVEL1, 'tile_red', predefined='CLADDING',
                  object_type='TMB red tile band', src=BELOW_SRC, psets=am('refurb', 24, 5, TMB))

# parapet: granite coping, posts, glass and top rail along the two sides and the far end
par = m.assembly('Ampit i barana perimetral · Parapet and balustrade', None, object_type='Opening guard', parent=acc,
                 psets=spec(Height_mm=1100, InfillPanel='Laminated glass 10+10', LineLoad_kN_m=1.0))
cop = [ST.box(S_IN, S_OUT + 0.35, t - 0.17, t + 0.17, 0.0, 0.20) for t in (-T_HALF + 0.12, T_HALF - 0.12)]
cop.append(ST.box(S_OUT - 0.05, S_OUT + 0.35, -T_HALF - 0.05, T_HALF + 0.05, 0.0, 0.20))
m.element('IfcCovering', 'Coronament de granit · Granite coping', cop, STREET, 'granite_dark', predefined='COPING',
          object_type='Polished granite coping 340×200', parent=par, src=ICGC_SRC, psets=am('refurb', 24, 4, TMB))
posts, rails, panes = [], [], []
lines = [((S_IN + 0.05, t), (S_OUT + 0.15, t)) for t in (-T_HALF + 0.12, T_HALF - 0.12)]
lines.append(((S_OUT + 0.15, -T_HALF + 0.12), (S_OUT + 0.15, T_HALF - 0.12)))
for (sa, ta), (sb, tb) in lines:
    L = math.hypot(sb - sa, tb - ta)
    n = max(2, round(L / 1.25))
    pts = [(sa + (sb - sa) * k / n, ta + (tb - ta) * k / n) for k in range(n + 1)]
    for s, t in pts:
        posts.append(ST.box(s - 0.025, s + 0.025, t - 0.025, t + 0.025, 0.20, 0.90))
    for (s0, t0), (s1, t1) in zip(pts, pts[1:]):
        g0 = (s0 + (s1 - s0) * 0.03, t0 + (t1 - t0) * 0.03)
        g1 = (s0 + (s1 - s0) * 0.97, t0 + (t1 - t0) * 0.97)
        cx, cy = ST.P((g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2)
        ang = math.atan2(*reversed(tuple(b - a for a, b in zip(ST.P(*g0), ST.P(*g1)))))
        panes.append(m.box(cx, cy, ST.z0 + 0.26, math.dist(ST.P(*g0), ST.P(*g1)), 0.02, 0.74, angle=ang))
    rails.append(rod(ST.p3(sa, ta, 1.10), ST.p3(sb, tb, 1.10), 0.025))
m.element('IfcMember', 'Muntants de la barana · Balustrade posts', posts, STREET, 'inox', predefined='POST',
          object_type='Post 50×50 AISI 316, core-drilled into coping', parent=par, src=TYP_SRC, psets=am('refurb', 12, 4, TMB))
m.element('IfcPlate', 'Vidres de la barana · Balustrade glass', panes, STREET, 'glass', predefined='CURTAIN_PANEL',
          object_type='Laminated glass infill 10+10', parent=par, src=TYP_SRC,
          psets={**spec(Panels=len(panes)), **am('refurb', 6, 3, TMB, Note='One pane scratched (graffiti), replacement ordered (demo)')})
m.element('IfcRailing', 'Passamà superior · Top rail', rails, STREET, 'inox', predefined='GUARDRAIL',
          object_type='Top rail Ø50 AISI 316 at 1 100 mm', parent=par, src=TYP_SRC, psets=am('refurb', 12, 4, TMB))
m.element('IfcWasteTerminal', 'Canal de drenatge de l\'entrada · Entrance channel drain',
          ST.box(S_IN + 0.05, S_IN + 0.20, -T_WALL, T_WALL, -0.002, 0.012), STREET, 'inox', predefined='USERDEFINED',
          object_type='Slot channel drain with stainless grating', parent=acc, src=TYP_SRC,
          psets={**spec(Width_mm=150, Outlet='Combined sewer'), **am('refurb', 3, 3, AJ, Note='Silt in channel after 29 Sep storm (demo)')})

# under the slab: lights, signs, camera
equip = m.assembly('Equipament del tram cobert · Covered-stretch equipment', LEVEL1, object_type='Access equipment')
for k, s in enumerate((5.0, 6.6, 8.2, 9.4), 1):
    m.element('IfcLightFixture', f'Lluminària lineal {k}', ST.box(s - 0.6, s + 0.6, stair_tc - 0.05, stair_tc + 0.05, -0.47, 0.06), LEVEL1,
              'light', predefined='DIRECTIONSOURCE', object_type='LED linear luminaire 40 W, IK10', parent=equip, src=BELOW_SRC,
              psets={**spec(Power_W=40, LuminousFlux_lm=5200, EmergencyBattery_h=1), **am('refurb', 12, 5 if k != 3 else 2, TMB,
                     Note='Luminaire out, ticket open (demo)' if k == 3 else None)})
m.element('IfcSign', 'Rètol «Sortida · Salida · Exit»', ST.box(S_OUT + 0.38, S_OUT + 0.44, -1.6, 1.6, -0.82, 0.30), LEVEL1, 'navy',
          predefined='PICTORAL', object_type='Suspended exit sign, back-lit', parent=equip, src=BELOW_SRC, psets=am('refurb', 12, 5, TMB))
m.element('IfcLightFixture', 'Senyal d\'evacuació', ST.box(S_END + 0.22, S_END + 0.30, -0.35, 0.35, Z_LOW + 2.25, 0.18), LEVEL1, 'green_led',
          predefined='SECURITYLIGHTING', object_type='Emergency exit luminaire, maintained', parent=equip, src=BELOW_SRC,
          psets={**spec(Autonomy_h=1, LastFunctionalTest='2026-09-15'), **am('refurb', 1, 5, TMB)})
m.element('IfcAudioVisualAppliance', 'Càmera CCTV de l\'escala', ST.box(S_OUT + 0.40, S_OUT + 0.62, 0.55, 0.77, -0.75, 0.20), LEVEL1, 'white',
          predefined='CAMERA', object_type='Dome camera 4 MP, IR, facing the stair', parent=equip, src=BELOW_SRC,
          psets={**spec(Resolution='4 MP', Recording='Station NVR, 30 days'), **am('refurb', 6, 5, TMB)})

# signage totem at the entry
TOT = ST.p3(S_IN - 0.55, -T_HALF - 0.45, 0.)
tot = m.assembly('Tòtem de senyalització del metro · Metro totem', None, object_type='Entrance signage totem', parent=acc,
                 psets=spec(Height_mm=3600, Illuminated=True, Faces='Two (towards the square and Pg. de Gràcia)'))
tx, ty = TOT[0], TOT[1]
m.element('IfcMember', 'Pal del tòtem · Totem post', m.cylinder(tx, ty, TOT[2], 0.057, 3.05), STREET, 'steel', predefined='POST',
          object_type='Steel tube Ø114, anthracite', parent=tot, src=TYP_SRC, psets=am('refurb', 24, 4, TMB))
SF = Frame((tx, ty), SITE['stair_bearing_deg'], TOT[2])        # faces look along ±s
diamond = [(-0.45, 3.15), (0.0, 2.70), (0.45, 3.15), (0.0, 3.60)]
m.element('IfcSign', 'Rombe «M» · Metro diamond', SF.cross(diamond, 0., 0.10), STREET, 'tmb_red', predefined='PICTORAL',
          object_type='Back-lit metro diamond 900×900', parent=tot, src=TYP_SRC,
          psets={**spec(Illumination='LED, dusk-to-dawn'), **am('refurb', 12, 5, TMB)})
M_LETTER = [(-0.22, 2.97), (-0.15, 2.97), (-0.15, 3.24), (0.0, 3.08), (0.15, 3.24), (0.15, 2.97), (0.22, 2.97),
            (0.22, 3.36), (0.15, 3.36), (0.0, 3.19), (-0.15, 3.36), (-0.22, 3.36)]
m.element('IfcSign', 'Lletra «M» (dues cares)', [SF.cross(M_LETTER, s, 0.012) for s in (-0.056, 0.056)], STREET, 'white',
          predefined='MARKER', object_type='Letter M, opal acrylic', parent=tot, src=TYP_SRC, psets=am('refurb', 12, 5, TMB))
m.element('IfcSign', 'Placa «Catalunya»', SF.cross([(-0.42, 2.38), (0.42, 2.38), (0.42, 2.62), (-0.42, 2.62)], 0., 0.06), STREET, 'navy',
          predefined='PICTORAL', object_type='Station name plate', parent=tot, src=TYP_SRC,
          psets={**spec(Text='Catalunya'), **am('refurb', 24, 5, TMB)})
for k, (mat, label) in enumerate((('l1', 'L1'), ('l3', 'L3'), ('rodalies', 'R · Rodalies'), ('fgc', 'FGC'))):
    tt = -0.30 + k * 0.20
    cx, cy = SF.P(0., tt)
    m.element('IfcSign', f'Distintiu de línia {label}', [disc((cx, cy, TOT[2] + 2.20), (SF.u[0], SF.u[1], 0.), 0.075, 0.07)],
              STREET, mat, predefined='MARKER', object_type='Line badge Ø150', parent=tot, src=TYP_SRC, psets=am('refurb', 24, 5, TMB))

# ═══ 2. Lift ══════════════════════════════════════════════════════════════════════════════════════
LK = Frame(tuple(SITE['lift_kiosk']['centre']), 63.2, LV['lift'])    # t+ towards the buildings: the door side
H = 1.15
lift = m.assembly('Ascensor · Step-free lift to the vestibule', STREET, object_type='Lift (pavement ↔ level −1)',
                  psets={**spec(Stops='Street, vestibule −1', Travel_m=round(-Z_V, 2), RatedLoad_kg=1000, Persons=13,
                                CarSize_mm='1 100 × 1 400', Speed_m_s=1.0, Drive='Gearless traction, machine-room-less',
                                Standard='EN 81-20/50, EN 81-70 (accessibility)'),
                         **am('lift', 1, 4, TMB, Availability_pct_12m=97.9, TripsPerDay_avg=1430,
                              LastStatutoryInspection='2026-03-19', NextStatutoryInspection='2028-03-19')})
m.element('IfcSlab', 'Sòcol de granit · Granite plinth', LK.box(-1.48, 1.48, -1.48, 1.48, -0.02, 0.05), STREET, 'granite_dark',
          predefined='BASESLAB', object_type='Granite plinth 2 960 × 2 960', parent=lift, src=ICGC_SRC, psets=am('lift', 24, 4, TMB))
m.element('IfcColumn', 'Pilars de cantonada · Corner posts', [LK.box(s - 0.06, s + 0.06, t - 0.06, t + 0.06, 0.03, 3.42)
                                                              for s in (-H, H) for t in (-H, H)], STREET, 'steel', predefined='COLUMN',
          object_type='SHS 120×120×8, anthracite', parent=lift, src=TYP_SRC, psets=am('lift', 24, 4, TMB))
ring = [LK.box(-H, H, t - 0.06, t + 0.06, 3.30, 0.15) for t in (-H, H)] + [LK.box(s - 0.06, s + 0.06, -H, H, 3.30, 0.15) for s in (-H, H)]
ring += [LK.box(-H, H, t - 0.04, t + 0.04, 2.38, 0.08) for t in (-H,)] + [LK.box(s - 0.04, s + 0.04, -H, H, 2.38, 0.08) for s in (-H, H)]
ring += [LK.box(-H, H, H - 0.05, H + 0.05, 2.18, 0.20)]
m.element('IfcMember', 'Travessers · Transoms and head beam', ring, STREET, 'steel', predefined='MULLION',
          object_type='Transoms 120×150 / 80×80', parent=lift, src=TYP_SRC, psets=am('lift', 24, 4, TMB))
glass = []
for t in (-H,):
    glass += [LK.box(-H + 0.06, H - 0.06, t - 0.01, t + 0.01, 0.06, 2.30), LK.box(-H + 0.06, H - 0.06, t - 0.01, t + 0.01, 2.47, 0.82)]
for s in (-H, H):
    glass += [LK.box(s - 0.01, s + 0.01, -H + 0.06, H - 0.06, 0.06, 2.30), LK.box(s - 0.01, s + 0.01, -H + 0.06, H - 0.06, 2.47, 0.82)]
glass += [LK.box(-H + 0.06, -0.56, H - 0.01, H + 0.01, 0.06, 2.10), LK.box(0.56, H - 0.06, H - 0.01, H + 0.01, 0.06, 2.10),
          LK.box(-H + 0.06, H - 0.06, H - 0.01, H + 0.01, 2.40, 0.88)]
m.element('IfcPlate', 'Envidrament del quiosc · Kiosk glazing', glass, STREET, 'glass_lift', predefined='CURTAIN_PANEL',
          object_type='Structural laminated glass 8+8, low iron', parent=lift, src=TYP_SRC,
          psets={**spec(Panels=len(glass), UV_Value='n/a (unheated)'), **am('lift', 6, 4, TMB)})
door = m.element('IfcDoor', 'Portes de replà (carrer) · Landing doors, street',
                 [LK.box(-0.55, 0.0, H + 0.03, H + 0.06, 0.04, 2.12), LK.box(0.0, 0.55, H + 0.03, H + 0.06, 0.04, 2.12)],
                 STREET, 'glass_lift', predefined='DOOR', object_type='Glazed telescopic landing doors 1 000 × 2 100',
                 parent=lift, src=TYP_SRC, psets={**spec(ClearOpening_mm=1000, FireRating='E 30'), **am('lift', 1, 4, TMB)},
                 common={'HandicapAccessible': True})
door.OperationType = 'DOUBLE_DOOR_SLIDING'
door.OverallWidth, door.OverallHeight = 1.0, 2.1
m.element('IfcMember', 'Marcs de les portes · Door frames',
          [LK.box(s - 0.025, s + 0.025, H + 0.02, H + 0.07, 0.04, 2.12) for s in (-0.55, 0.0, 0.55)] +
          [LK.box(-0.55, 0.55, H + 0.02, H + 0.07, 2.12, 0.05)], STREET, 'inox', predefined='MULLION',
          object_type='Door leaf frames, brushed stainless', parent=lift, src=TYP_SRC, psets=am('lift', 6, 4, TMB))
m.element('IfcRoof', 'Coberta del quiosc · Kiosk roof', [LK.box(-1.47, 1.47, -1.47, 1.47, 3.45, 0.25)], STREET, 'steel',
          predefined='FLAT_ROOF', object_type='Aluminium composite roof, 250 mm, internal gutter', parent=lift, src=ICGC_SRC,
          psets={**spec(Drainage='Internal gutter to a downpipe in a corner post'), **am('lift', 12, 4, TMB)})
m.element('IfcSign', 'Caixa lluminosa «M» · Roof lightbox', [LK.box(-0.30, 0.30, -0.30, 0.30, 3.70, 0.26)], STREET, 'white',
          predefined='PICTORAL', object_type='Back-lit roof sign, opal', parent=lift, src=ICGC_SRC, psets=am('lift', 12, 5, TMB))
m.element('IfcSign', 'Rombes «M» de la caixa lluminosa',
          [LK.cross([(-0.13, 3.83), (0.0, 3.71), (0.13, 3.83), (0.0, 3.95)], s, 0.01) for s in (-0.305, 0.305)] +
          [LK.side([(-0.13, 3.83), (0.0, 3.71), (0.13, 3.83), (0.0, 3.95)], t, 0.01) for t in (-0.305, 0.305)],
          STREET, 'tmb_red', predefined='MARKER', object_type='Metro diamond, four faces', parent=lift, src=TYP_SRC,
          psets=am('lift', 12, 5, TMB))
for k, (s, t) in enumerate(((-0.8, -0.8), (0.8, -0.8), (-0.8, 0.8), (0.8, 0.8)), 1):
    x, y = LK.P(s, t)
    m.element('IfcLightFixture', f'Downlight de marquesina {k}', m.cylinder(x, y, LK.z0 + 3.42, 0.09, 0.03), STREET, 'light',
              predefined='POINTSOURCE', object_type='LED downlight 18 W, IP66', parent=lift, src=TYP_SRC,
              psets={**spec(Power_W=18, LuminousFlux_lm=2100), **am('lift', 12, 5, TMB)})
# car, rails, machine
car = []
for s in (-0.55, 0.55):
    car.append(LK.box(s - 0.03, s + 0.03, -0.70, 0.62, 0.0, 2.25))
car += [LK.box(-0.58, 0.58, -0.73, 0.62, 0.0, 0.08), LK.box(-0.58, 0.58, -0.73, 0.62, 2.22, 0.10),
        LK.box(-0.58, 0.58, -0.73, -0.67, 0.0, 2.32)]
m.element('IfcTransportElement', 'Cabina de l\'ascensor · Lift car', car, STREET, 'inox', predefined='ELEVATOR',
          object_type='Panoramic car 1 100 × 1 400, stainless frame', parent=lift, src=TYP_SRC,
          psets={**spec(RatedLoad_kg=1000, Persons=13, Finish='Brushed stainless, glass side walls, granite floor'),
                 **am('lift', 1, 4, TMB, DoorCyclesSinceService=21480)}, common={'CapacityByWeight': 1000.0, 'CapacityByNumber': 13})
m.element('IfcPlate', 'Parets de vidre de la cabina · Car glass walls',
          [LK.box(-0.52, 0.52, -0.69, -0.67, 0.10, 2.10)] + [LK.box(s - 0.01, s + 0.01, -0.66, 0.60, 0.10, 2.10) for s in (-0.56, 0.56)],
          STREET, 'glass_lift', predefined='CURTAIN_PANEL', object_type='Car glazing, laminated 6+6', parent=lift, src=TYP_SRC,
          psets=am('lift', 6, 4, TMB))
m.element('IfcRailing', 'Passamà de la cabina', [rod(LK.p3(-0.50, -0.62, 0.90), LK.p3(0.50, -0.62, 0.90), 0.018)], STREET, 'inox',
          predefined='HANDRAIL', object_type='Car handrail Ø35', parent=lift, src=TYP_SRC, psets=am('lift', 12, 5, TMB))
m.element('IfcSwitchingDevice', 'Botonera de cabina (COP)', LK.box(0.40, 0.52, 0.56, 0.60, 0.85, 0.45), STREET, 'inox',
          predefined='MOMENTARYSWITCH', object_type='Car operating panel, Braille, voice announcer', parent=lift, src=TYP_SRC,
          psets={**spec(Braille=True, VoiceAnnouncement='ca/es/en'), **am('lift', 6, 5, TMB)})
m.element('IfcMember', 'Guies de la cabina · Car guide rails',
          [LK.box(s - 0.04, s + 0.04, -0.06, 0.06, -6.10 - LK.z0, 9.40) for s in (-0.80, 0.80)], STREET, 'steel', predefined='USERDEFINED',
          object_type='Machined guide rail T89/B', parent=lift, src=TYP_SRC, psets=am('lift', 12, 4, TMB))
m.element('IfcElectricAppliance', 'Màquina de tracció · Gearless machine', LK.box(-0.35, 0.35, -1.00, -0.55, 2.98, 0.30), STREET,
          'steel', predefined='USERDEFINED', object_type='Permanent-magnet gearless machine 6.6 kW', parent=lift, src=TYP_SRC,
          psets={**spec(Power_kW=6.6, Ropes='Coated steel belts'), **am('lift', 3, 4, TMB, MotorHours=9120)})
m.element('IfcSwitchingDevice', 'Botonera de replà · Call station', LK.box(0.62, 0.74, H + 0.06, H + 0.09, 0.95, 0.30), STREET, 'inox',
          predefined='MOMENTARYSWITCH', object_type='Landing call button, Braille, acoustic signal', parent=lift, src=TYP_SRC,
          psets={**spec(Braille=True, MountingHeight_mm=1000), **am('lift', 3, 5, TMB)})
m.element('IfcCommunicationsAppliance', 'Interfon d\'emergència', LK.box(0.62, 0.74, H + 0.06, H + 0.09, 1.30, 0.18), STREET, 'inox',
          predefined='USERDEFINED', object_type='Emergency intercom to the TMB control centre, induction loop', parent=lift, src=TYP_SRC,
          psets={**spec(Link='4G + PSTN backup', InductionLoop=True), **am('lift', 1, 5, TMB, LastTestCall='2026-09-28')})
m.element('IfcSign', 'Pictograma d\'accessibilitat', LK.box(0.60, 0.76, H + 0.06, H + 0.08, 1.55, 0.16), STREET, 'access_blue',
          predefined='PICTORAL', object_type='ISA pictogram', parent=lift, src=TYP_SRC, psets=am('lift', 24, 5, TMB))
shaft = m.assembly('Fossat de l\'ascensor · Lift shaft below the pavement', LEVEL1, object_type='Lift shaft')
sh = [LK.box(-1.20, 1.20, t - 0.13, t + 0.13, -6.10 - LK.z0, 6.10) for t in (-1.33, 1.33)] + \
     [LK.box(s - 0.13, s + 0.13, -1.20, 1.20, -6.10 - LK.z0, 6.10) for s in (-1.33, 1.33)]
m.element('IfcWall', 'Murs del fossat · Shaft walls', sh, LEVEL1, 'concrete', predefined='SHEAR', object_type='RC shaft 250 mm',
          parent=shaft, src=BELOW_SRC, psets=am('lift', 24, 4, TMB))
m.element('IfcSlab', 'Llosa del pou · Pit slab', LK.box(-1.46, 1.46, -1.46, 1.46, -6.40 - LK.z0, 0.30), LEVEL1, 'concrete',
          predefined='BASESLAB', object_type='Pit slab, 1.2 m pit with buffers', parent=shaft, src=BELOW_SRC, psets=am('lift', 24, 4, TMB))
d2 = m.element('IfcDoor', 'Portes de replà (vestíbul) · Landing doors, level −1',
               [LK.box(-0.55, 0.55, -1.22, -1.18, Z_V - LK.z0, 2.10)], LEVEL1, 'inox', predefined='DOOR',
               object_type='Stainless telescopic landing doors 1 000 × 2 100', parent=shaft, src=BELOW_SRC,
               psets=am('lift', 1, 4, TMB), common={'HandicapAccessible': True})
d2.OperationType = 'DOUBLE_DOOR_SLIDING'

# ═══ 3. Bus stop 1210 ═════════════════════════════════════════════════════════════════════════════
RA = SITE['road_axis']
ra_u = (math.sin(math.radians(RA['bearing_deg'])), math.cos(math.radians(RA['bearing_deg'])))
ra_n = (-ra_u[1], ra_u[0])
BS = Frame((RA['point'][0] + 0.35 * ra_u[0] + 8.50 * ra_n[0], RA['point'][1] + 0.35 * ra_u[1] + 8.50 * ra_n[1]),
           RA['bearing_deg'], LV['bus'])                      # t+ = away from the road
KERB_T = RA['kerb_offset_north_m'] - 8.50
bus = m.assembly('Parada de bus 1210 «Pl Catalunya - Pg de Gràcia»', STREET, object_type='Bus stop with shelter',
                 psets={**spec(StopCode='1210', Operator='TMB', Accessible=True, RealTimeInformation=True,
                               Lines='See the stop flag; served by several day and night lines (not modelled)'),
                        **am('bus', 6, 4, AJ)})
m.element('IfcKerb', 'Vorada de la parada · Kerb', BS.box(-6.0, 6.0, KERB_T - 0.10, KERB_T + 0.10, -0.19, 0.20), STREET, 'granite_dark',
          object_type='Granite kerb 200 mm, 190 mm upstand (measured)', parent=bus, src=ICGC_SRC,
          psets={**spec(Upstand_mm=190, Note='Boarding height raised for low-floor buses'), **am('bus', 24, 4, AJ)})
m.element('IfcCovering', 'Franja podotàctil d\'encaminament', BS.box(-2.95, -1.75, KERB_T + 0.10, 3.0, 0.0, 0.012), STREET, 'tactile',
          predefined='FLOORING', object_type='Directional tactile strip to the front door', parent=bus, src=TYP_SRC,
          psets={**spec(Width_mm=1200, Standard='Orden TMA/851/2021'), **am('bus', 12, 4, AJ)})
shel = m.assembly('Marquesina · Shelter', None, object_type='Bus shelter', parent=bus,
                  psets=spec(Length_mm=3600, Depth_mm=1450, ClearHeight_mm=2400))
m.element('IfcColumn', 'Pilars posteriors · Rear posts', [BS.box(s - 0.05, s + 0.05, 0.60, 0.68, 0.0, 2.44) for s in (-1.62, 1.62)],
          STREET, 'steel', predefined='COLUMN', object_type='Steel post 100×80', parent=shel, src=TYP_SRC, psets=am('bus', 24, 4, AJ))
m.element('IfcBeam', 'Mènsules de coberta · Roof cantilevers',
          [BS.cross([(0.68, 2.36), (0.68, 2.50), (-0.78, 2.50), (-0.78, 2.45)], s, 0.06) for s in (-1.62, 0.0, 1.62)],
          STREET, 'steel', predefined='BEAM', object_type='Tapered cantilever arm', parent=shel, src=ICGC_SRC, psets=am('bus', 24, 4, AJ))
m.element('IfcRoof', 'Coberta de vidre · Glass roof', [BS.box(-1.80, 1.80, -0.80, 0.72, 2.50, 0.02)], STREET, 'glass',
          predefined='FLAT_ROOF', object_type='Laminated glass roof, fritted', parent=shel, src=ICGC_SRC,
          psets={**spec(Thickness_mm=20, Frit='40 % dot'), **am('bus', 12, 4, AJ)})
m.element('IfcMember', 'Perfil perimetral de coberta', [BS.box(-1.82, 1.82, t - 0.03, t + 0.03, 2.47, 0.07) for t in (-0.80, 0.72)] +
          [BS.box(s - 0.03, s + 0.03, -0.80, 0.72, 2.47, 0.07) for s in (-1.82, 1.82)], STREET, 'alu', predefined='USERDEFINED',
          object_type='Roof edge profile with drip', parent=shel, src=TYP_SRC, psets=am('bus', 24, 4, AJ))
m.element('IfcPlate', 'Vidres posteriors · Rear glass', [BS.box(s0, s1, 0.63, 0.65, 0.12, 2.12) for s0, s1 in ((-1.56, -0.03), (0.03, 1.40))],
          STREET, 'glass', predefined='CURTAIN_PANEL', object_type='Toughened glass 10 mm', parent=shel, src=TYP_SRC,
          psets=am('bus', 6, 3, AJ, Note='Lower panel etched by vandalism (demo)'))
m.element('IfcSign', 'Mupi publicitari lluminós · Illuminated ad panel',
          [BS.box(1.44, 1.62, -0.75, 0.66, 0.08, 1.95)], STREET, 'steel', predefined='USERDEFINED',
          object_type='Double-sided back-lit 4-sheet panel', parent=shel, src=TYP_SRC,
          psets={**spec(Power_W=110, Faces=2), **am('bus', 3, 4, AJ)})
m.element('IfcSign', 'Cares lluminoses del mupi', [BS.box(1.435, 1.445, -0.68, 0.59, 0.25, 1.62), BS.box(1.615, 1.625, -0.68, 0.59, 0.25, 1.62)],
          STREET, 'light', predefined='PICTORAL', object_type='Poster faces (content not modelled)', parent=shel, src=TYP_SRC,
          psets=am('bus', 3, 5, AJ))
seats = [BS.box(s - 0.22, s + 0.22, 0.20, 0.58, 0.44, 0.04) for s in (-1.15, -0.62, -0.09)]
seats += [BS.box(-1.45, 0.20, 0.55, 0.60, 0.44, 0.04), BS.box(-1.45, 0.20, 0.58, 0.60, 0.62, 0.30)]
seats += [BS.box(s - 0.025, s + 0.025, 0.22, 0.58, 0.0, 0.44) for s in (-1.40, 0.15)]
m.element('IfcFurniture', 'Banc de la marquesina · Shelter bench', seats, STREET, 'inox', predefined='USERDEFINED',
          object_type='Three perforated stainless seats with armrests', parent=shel, src=TYP_SRC,
          psets={**spec(Seats=3, SeatHeight_mm=440), **am('bus', 6, 4, AJ)})
m.element('IfcRailing', 'Recolzador isquiàtic · Lean rail', [rod(BS.p3(0.30, 0.55, 0.75), BS.p3(1.10, 0.55, 0.75), 0.025)],
          STREET, 'inox', predefined='HANDRAIL', object_type='Lean rail Ø50 at 750 mm', parent=shel, src=TYP_SRC, psets=am('bus', 12, 4, AJ))
m.element('IfcAudioVisualAppliance', 'Pantalla d\'informació en temps real', [BS.box(-1.00, 0.10, -0.62, -0.50, 2.06, 0.30)],
          STREET, 'display', predefined='DISPLAY', object_type='Real-time arrivals display, e-paper, solar backed', parent=shel, src=TYP_SRC,
          psets={**spec(Technology='E-paper 32"', Feed='TMB iBus real-time', Languages='ca/es/en', TextToSpeech=True),
                 **am('bus', 3, 4, AJ, FirmwareVersion='3.8.2', Uptime_pct_30d=99.1)})
m.element('IfcSign', 'Plànol de la xarxa i horaris', [BS.box(-1.45, -0.35, 0.61, 0.62, 1.05, 0.85)], STREET, 'white',
          predefined='PICTORAL', object_type='Network map and timetables, 1 100 × 850', parent=shel, src=TYP_SRC, psets=am('bus', 6, 4, AJ))
m.element('IfcLightFixture', 'Lluminària de la marquesina', [BS.box(-1.40, 1.00, -0.10, 0.02, 2.40, 0.05)], STREET, 'light',
          predefined='DIRECTIONSOURCE', object_type='LED strip 24 W, dusk sensor', parent=shel, src=TYP_SRC,
          psets={**spec(Power_W=24), **am('bus', 12, 5, AJ)})
pole = m.assembly('Pal de parada · Stop flag', None, object_type='Bus stop flag', parent=bus)
m.element('IfcMember', 'Pal del senyal de parada', BS.cyl(-2.55, KERB_T + 0.55, 0.0, 0.038, 2.75), STREET, 'steel', predefined='POST',
          object_type='Post Ø76', parent=pole, src=TYP_SRC, psets=am('bus', 24, 4, AJ))
m.element('IfcSign', 'Bandera de parada TMB «1210»', BS.box(-2.58, -2.52, KERB_T + 0.30, KERB_T + 0.80, 2.10, 0.55), STREET, 'tmb_red',
          predefined='PICTORAL', object_type='Stop flag with stop code 1210 and line plates', parent=pole, src=TYP_SRC,
          psets={**spec(StopCode='1210', BrailleCode=True, QRCode='Real-time arrivals'), **am('bus', 12, 5, AJ)})
m.element('IfcSign', 'Plaques de línia', [BS.box(-2.585, -2.515, KERB_T + 0.32, KERB_T + 0.78, 1.62 + k * 0.15, 0.12) for k in range(3)],
          STREET, 'white', predefined='MARKER', object_type='Line plates (lines not modelled)', parent=pole, src=TYP_SRC,
          psets=am('bus', 12, 5, AJ))
m.element('IfcFurniture', 'Paperera de la parada', [BS.cyl(2.35, 0.45, 0.0, 0.03, 0.90), BS.cyl(2.35, 0.27, 0.30, 0.20, 0.62)], STREET, 'bin',
          predefined='USERDEFINED', object_type='Litter bin 60 l on post', parent=bus, src=TYP_SRC, psets=am('furniture', 1, 4, AJ))

# ═══ 4. Bicing station 65 ═════════════════════════════════════════════════════════════════════════
BC = Frame(tuple(SITE['bicing']['row_centre']), SITE['bicing']['bearing_deg'], LV['bicing'])   # t+ = road side
N_DOCK = SITE['bicing']['capacity']
DOCK_T = 0.92
DOCKS = [(-10.0 + k * 1.0) for k in range(N_DOCK)]
# docks taken in this snapshot (the live count is in the scene's Bicing layer)
OCCUPIED = {0: 'e', 1: 'm', 3: 'e', 4: 'e', 6: 'm', 7: 'e', 9: 'e', 10: 'm', 12: 'e', 14: 'e', 15: 'm', 18: 'e', 20: 'e'}
bic = m.assembly('Estació Bicing 65 «Plaça Catalunya»', STREET, object_type='Public bike-share station',
                 psets={**spec(StationId='065', Docks=N_DOCK, Bikes='Mechanical and electric', Payment='Bicing card / app',
                               Power='Grid-connected, charges e-bikes in dock', LiveStatus='See the «Estacions de bicis» layer'),
                        **am('bicing', 3, 4, BIC, DockFaultsOpen=1, RebalancingVisits_30d=46)})
m.element('IfcSlab', 'Plataforma de l\'estació · Station base', BC.box(-11.9, 10.6, DOCK_T - 0.30, DOCK_T + 0.30, -0.02, 0.08), STREET,
          'steel', predefined='USERDEFINED', object_type='Modular steel base with cable trunking', parent=bic, src=ICGC_SRC,
          psets={**spec(Length_mm=22500, Anchoring='Chemical anchors into pavement'), **am('bicing', 12, 4, BIC)})
DOCK_PROFILE = [(0.07, 0.06), (0.07, 0.68), (0.03, 0.84), (-0.14, 0.92), (-0.22, 0.88), (-0.24, 0.78), (-0.08, 0.72), (-0.06, 0.06)]
for k, s in enumerate(DOCKS):
    dk = m.assembly(f'Ancoratge {k + 1:02d}', None, object_type='Bike dock', parent=bic)
    x, y = BC.P(s, DOCK_T)
    m.element('IfcBuildingElementProxy', f'Pilona d\'ancoratge {k + 1:02d}',
              m.extrude_vertical_profile(DOCK_PROFILE, (x, y, BC.z0), BC.L, 0.11), STREET, 'dock', predefined='USERDEFINED',
              object_type='Bike dock post, cast aluminium', parent=dk, src=TYP_SRC,
              psets={**spec(DockNumber=k + 1, Charging='Yes, 36 V'), **am('bicing', 3, 4 if k != 11 else 2, BIC,
                     Note='Out of service: lock jammed, repair visit scheduled (demo)' if k == 11 else None)})
    m.element('IfcDiscreteAccessory', f'Pany electromecànic {k + 1:02d}', BC.box(s - 0.065, s + 0.065, DOCK_T - 0.25, DOCK_T - 0.13, 0.74, 0.13),
              STREET, 'bicing_red', predefined='USERDEFINED', object_type='Electromechanical lock with RFID', parent=dk, src=TYP_SRC,
              psets=am('bicing', 3, 4 if k != 11 else 1, BIC))
    m.element('IfcLightFixture', f'Indicador LED {k + 1:02d}', BC.box(s - 0.025, s + 0.025, DOCK_T - 0.10, DOCK_T - 0.04, 0.88, 0.02), STREET,
              'green_led' if k != 11 else 'bicing_red', predefined='POINTSOURCE', object_type='Dock status LED (green free / red fault)',
              parent=dk, src=TYP_SRC, psets=am('bicing', 3, 5, BIC))
term = m.assembly('Terminal de l\'estació · Station terminal', None, object_type='Bike-share terminal', parent=bic)
m.element('IfcCommunicationsAppliance', 'Tòtem del terminal', BC.box(-11.75, -11.15, DOCK_T - 0.20, DOCK_T + 0.12, 0.06, 2.10), STREET,
          'dock', predefined='USERDEFINED', object_type='Station terminal: card reader, 4G router, station controller', parent=term,
          src=TYP_SRC, psets={**spec(Connectivity='4G', Reader='RFID / NFC'), **am('bicing', 3, 4, BIC, FirmwareVersion='7.1.0')})
m.element('IfcAudioVisualAppliance', 'Pantalla tàctil del terminal', BC.box(-11.68, -11.22, DOCK_T - 0.215, DOCK_T - 0.20, 1.20, 0.52), STREET,
          'display', predefined='DISPLAY', object_type='Sunlight-readable touch screen 15"', parent=term, src=TYP_SRC, psets=am('bicing', 3, 4, BIC))
m.element('IfcSign', 'Capçal Bicing del terminal', BC.box(-11.78, -11.12, DOCK_T - 0.22, DOCK_T + 0.14, 1.95, 0.22), STREET, 'bicing_red',
          predefined='PICTORAL', object_type='Station header with name and number', parent=term, src=TYP_SRC,
          psets={**spec(Text='65 · Plaça Catalunya'), **am('bicing', 12, 5, BIC)})


def bike(n, s, kind):
    """A docked bike: front at the dock (t+), its plane at s. Local x from rear axle to front axle, y lateral."""
    ax = 0.60 - 1.10                                   # rear axle t
    def P(x, y, z):
        return BC.p3(s + y, ax + x, z)
    frame_m = 'bike_white' if kind == 'e' else 'bike_red'
    a = m.assembly(f'Bicicleta {"elèctrica" if kind == "e" else "mecànica"} BCN-{n:04d}', None,
                   object_type='Bike-share bicycle', parent=bic,
                   psets={'Pset_CDE_Vehicle (demo)': {'FleetNumber': f'BCN-{n:04d}', 'Type': 'E-bike' if kind == 'e' else 'Mechanical',
                                                     'WheelSize_in': 26, 'Gears': 'Hub 3-speed' if kind == 'm' else 'Hub 7-speed',
                                                     'Battery_Wh': 500 if kind == 'e' else None,
                                                     'StateOfCharge_pct': (62 + (n * 13) % 37) if kind == 'e' else None,
                                                     'Odometer_km': 1200 + (n * 977) % 9000,
                                                     'DataStatus': 'Illustrative — live availability is in the scene layer'}})
    rr = 0.021
    fr = [rod(P(0.95, 0, 0.74), P(0.62, 0, 0.36), rr), rod(P(0.62, 0, 0.36), P(0.42, 0, 0.30), rr),
          rod(P(0.42, 0, 0.30), P(0.30, 0, 0.80), rr), rod(P(0.90, 0, 0.94), P(0.96, 0, 0.72), 0.024)]
    for y in (-0.035, 0.035):
        fr += [rod(P(0.42, y, 0.30), P(0.0, y * 1.6, 0.33), 0.012), rod(P(0.31, y, 0.76), P(0.0, y * 1.6, 0.33), 0.011),
               rod(P(0.96, y * 1.4, 0.72), P(1.10, y * 1.6, 0.33), 0.013)]
    fr.append(obox(P(0.25, 0, 0.82), BC.v3(0, 1, 0), BC.v3(1, 0, 0), 0.40, 0.16, 0.012))           # rear rack
    fr += [rod(P(0.05, y, 0.81), P(0.02, y * 1.6, 0.36), 0.008) for y in (-0.07, 0.07)]
    m.element('IfcBuildingElementProxy', f'Quadre BCN-{n:04d}', fr, STREET, frame_m, predefined='USERDEFINED',
              object_type='Step-through aluminium frame with fork and rack', parent=a, src=TYP_SRC, psets=am('bicing', 1, 4, BIC))
    axle = BC.v3(1, 0, 0)
    wh, rim = [], []
    for x in (0.0, 1.10):
        c = P(x, 0, 0.335)
        wh.append(disc(c, axle, 0.335, 0.045, r_in=0.297))
        rim += [disc(c, axle, 0.297, 0.024, r_in=0.277), disc(c, axle, 0.08 if (kind == 'e' and x > 1) else 0.045, 0.10)]
        for k in range(12):
            th = k * math.pi / 6
            d = BC.v3(0, math.cos(th), math.sin(th))
            mid = tuple(ci + di * 0.17 for ci, di in zip(c, d))
            rim.append(obox(mid, d, axle, 0.25, 0.004, 0.004))
        for k in range(4):
            th = math.radians(40 + k * 30) if x == 0 else math.radians(60 + k * 30)
            d = BC.v3(0, math.cos(th), math.sin(th))
            tg = BC.v3(0, -math.sin(th), math.cos(th))
            pc = tuple(ci + di * 0.36 for ci, di in zip(c, d))
            fr_m = obox(pc, tg, axle, 0.20, 0.06, 0.006)
            rim.append(fr_m)
    m.element('IfcBuildingElementProxy', f'Pneumàtics BCN-{n:04d}', wh, STREET, 'tyre', predefined='USERDEFINED',
              object_type='26" puncture-proof tyres', parent=a, src=TYP_SRC, psets=am('bicing', 1, 4, BIC, TreadDepth_mm=2.4))
    m.element('IfcBuildingElementProxy', f'Rodes i parafangs BCN-{n:04d}', rim, STREET, 'alu', predefined='USERDEFINED',
              object_type='Rims, 12-spoke wheels, hubs and mudguards', parent=a, src=TYP_SRC, psets=am('bicing', 1, 4, BIC))
    ctl = [obox(P(0.29, 0, 0.92), BC.v3(0, 1, 0), BC.v3(1, 0, 0), 0.27, 0.15, 0.06), rod(P(0.30, 0, 0.80), P(0.29, 0, 0.90), 0.014),
           rod(P(0.90, 0, 0.94), P(0.86, 0, 1.05), 0.016), rod(P(0.84, -0.29, 1.05), P(0.84, 0.29, 1.05), 0.012)]
    ctl += [rod(P(0.84, y, 1.05), P(0.84, y + 0.11 * (1 if y > 0 else -1), 1.05), 0.017) for y in (-0.29, 0.29)]
    ctl.append(obox(P(0.22, 0.06, 0.33), BC.v3(0, 1, 0), (0., 0., 1.), 0.40, 0.10, 0.004))   # chain guard
    m.element('IfcBuildingElementProxy', f'Selló i manillar BCN-{n:04d}', ctl, STREET, 'black', predefined='USERDEFINED',
              object_type='Saddle, stem, handlebar, grips, chain guard', parent=a, src=TYP_SRC, psets=am('bicing', 1, 4, BIC))
    bsk = [obox(P(1.18, 0, 0.93), BC.v3(0, 1, 0), BC.v3(1, 0, 0), 0.34, 0.30, 0.012)]
    for y in (-0.15, 0.15):
        bsk += [rod(P(1.01, y, 1.02), P(1.35, y, 1.02), 0.007), rod(P(1.01, y, 0.93), P(1.01, y, 1.02), 0.007),
                rod(P(1.35, y, 0.93), P(1.35, y, 1.02), 0.007)]
    bsk += [rod(P(x, -0.15, 1.02), P(x, 0.15, 1.02), 0.007) for x in (1.01, 1.35)]
    bsk += [rod(P(1.18, y, 0.92), P(1.08, y * 0.4, 0.40), 0.008) for y in (-0.10, 0.10)]
    m.element('IfcBuildingElementProxy', f'Cistella frontal BCN-{n:04d}', bsk, STREET, 'black', predefined='USERDEFINED',
              object_type='Front carrier, docking interface', parent=a, src=TYP_SRC, psets=am('bicing', 1, 4, BIC))
    lights = [obox(P(1.37, 0, 0.97), BC.v3(0, 1, 0), BC.v3(1, 0, 0), 0.05, 0.10, 0.05), obox(P(0.04, 0, 0.84), BC.v3(0, 1, 0), BC.v3(1, 0, 0), 0.04, 0.08, 0.04)]
    m.element('IfcLightFixture', f'Llums BCN-{n:04d}', lights, STREET, 'light', predefined='POINTSOURCE',
              object_type='Dynamo/battery front and rear LED lights', parent=a, src=TYP_SRC, psets=am('bicing', 1, 5, BIC))
    if kind == 'e':
        m.element('IfcElectricAppliance', f'Bateria BCN-{n:04d}', obox(P(0.79, 0, 0.56), BC.v3(0, 0.33, 0.38), BC.v3(1, 0, 0), 0.40, 0.09, 0.08),
                  STREET, 'battery', predefined='USERDEFINED', object_type='Down-tube battery 36 V 500 Wh, charged in dock', parent=a,
                  src=TYP_SRC, psets={**spec(Voltage_V=36, Capacity_Wh=500), **am('bicing', 1, 4, BIC, ChargeCycles=180 + (n * 31) % 400)})


for i, (k, kind) in enumerate(sorted(OCCUPIED.items())):
    bike(2100 + i * 37 + k, DOCKS[k], kind)

cutout(LK, 'lift kiosk', (-1.7, 1.7), (-1.7, 1.7), (CUT_FLOOR, 5.0), patch=True)
cutout(BS, 'bus shelter', (-2.0, 2.0), (-0.95, 0.85), (CUT_FLOOR, 3.3), patch=True)
cutout(BS, 'bus stop flag', (-2.85, -2.25), (KERB_T + 0.25, KERB_T + 0.85), (CUT_FLOOR, 3.0), patch=True)
cutout(BS, 'bus stop bin', (2.05, 2.65), (0.0, 0.75), (CUT_FLOOR, 1.3), patch=True)
cutout(BC, 'Bicing station', (-12.3, 11.0), (-1.05, 1.3), (CUT_FLOOR, 2.4), patch=True)
cutout(ST, 'metro stairwell', (S_IN + 0.05, S_OUT - 0.05), (-T_WALL - 0.10, T_WALL + 0.10), (-7.0, -0.07))

# ═══ 5. Street furniture and trees ════════════════════════════════════════════════════════════════
furn = m.assembly('Mobiliari urbà · Street furniture', STREET, object_type='Street furniture')
pb = SITE['post_box']
PB = Frame((pb['x'], pb['y']), 136.0, LV['post'])
m.element('IfcBuildingElementProxy', 'Bústia de Correos · Post box',
          [PB.box(-0.06, 0.06, -0.06, 0.06, 0.0, 0.62), PB.box(-0.23, 0.23, -0.18, 0.18, 0.62, 0.52),
           disc(PB.p3(0, 0, 1.14), PB.v3(0, 1, 0), 0.23, 0.36)], STREET, 'correos', predefined='USERDEFINED',
          object_type='Pillar post box, yellow', parent=furn, src=('OSM position (ODbL, node 6328108611); typical model', 'Low'),
          psets={**spec(Collection='Mon–Fri 18:30 (demo)'), **am('furniture', 12, 4, COR)})
m.element('IfcBuildingElementProxy', 'Bocana de la bústia', PB.box(-0.12, 0.12, -0.185, -0.17, 1.00, 0.04), STREET, 'black',
          predefined='USERDEFINED', object_type='Letter slot', parent=furn, src=TYP_SRC, psets=am('furniture', 12, 4, COR))
bn = SITE['bin']
m.element('IfcFurniture', 'Paperera · Litter bin',
          [m.cylinder(bn['x'], bn['y'], LV['bin'], 0.03, 0.95), m.tube(bn['x'] + 0.24, bn['y'], LV['bin'] + 0.32, 0.21, 0.19, 0.62),
           m.cylinder(bn['x'] + 0.24, bn['y'], LV['bin'] + 0.32, 0.19, 0.02)], STREET, 'bin', predefined='USERDEFINED',
          object_type='Litter bin 60 l on post', parent=furn, src=('OSM position (ODbL, node 9776538016); typical model', 'Low'),
          psets=am('furniture', 1, 4, AJ, EmptyingFrequency='3× daily'))
for k, tr in enumerate(SITE['trees'], 1):
    z = round(tr['ground_raw'] - RAW0, 2)
    G = Frame((tr['x'], tr['y']), 136.0, z)
    grate = [G.box(-0.70, 0.70, t - 0.03, t + 0.03, 0.0, 0.03) for t in (-0.67, 0.67)] + [G.box(s - 0.03, s + 0.03, -0.70, 0.70, 0.0, 0.03) for s in (-0.67, 0.67)]
    grate.append(m.tube(*G.P(0, 0), z, 0.30, 0.25, 0.03))
    for j in range(8):
        th = j * math.pi / 4
        r0, r1 = 0.30, 0.66 / max(abs(math.cos(th)), abs(math.sin(th)))
        p0, p1 = G.P(r0 * math.cos(th), r0 * math.sin(th)), G.P(r1 * math.cos(th), r1 * math.sin(th))
        grate.append(m.box((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, z, math.dist(p0, p1), 0.03, 0.03, angle=math.atan2(p1[1] - p0[1], p1[0] - p0[0])))
    for r in (0.42, 0.55):
        grate.append(m.tube(*G.P(0, 0), z, r + 0.015, r - 0.015, 0.03))
    m.element('IfcCovering', f'Escocell {k} · Tree grate', grate, STREET, 'cast_iron', predefined='USERDEFINED',
              object_type='Cast-iron tree grate 1 400 × 1 400', parent=furn, src=(f'OSM tree node {tr["osm"]} (ODbL); level from the ICGC mesh', 'Medium'),
              psets=am('furniture', 12, 4, AJ))
    m.element('IfcGeographicElement', f'Arbre {k} · Tree', [m.cylinder(*G.P(0, 0), z, 0.17, 2.6)], STREET, 'bark', predefined='VEGETATION',
              object_type='Street tree (trunk only; the crown is in the ICGC mesh)', parent=furn,
              src=(f'OSM tree node {tr["osm"]} (ODbL)', 'Medium'),
              psets={'Pset_CDE_Vegetation': {'Species': 'Platanus × hispanica (presumed, Pg. de Gràcia planting)',
                                             'LeafType': 'Broadleaved', 'Trunk_Circumference_cm': 110 + (k * 17) % 60,
                                             'OSMNode': tr['osm']},
                     **am('tree', 12, 4, AJ, LastPruning='2025-12-10')})

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'catalunya-mobility-hub.ifc')
m.finish(out)
cut_path = os.path.splitext(out)[0] + '_cutouts.json'
json.dump({'cdeMeshCutouts': {'version': 1, 'anchor': {'lon': LON0, 'lat': LAT0, 'height': RAW0},
                              'note': 'Boxes in metres: s along bearing (deg clockwise from north), t to its left, z above the '
                                      'anchor height (the tileset anchor, before the scene placement offset).',
                              'boxes': CUTOUTS}}, open(cut_path, 'w'), indent=1)
print('written', out, len(m.f.by_type('IfcProduct')), 'products,', len(CUTOUTS), 'cut-outs ->', cut_path)
