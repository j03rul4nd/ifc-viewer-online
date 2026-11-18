"""Monument a Francesc Macià — Plaça de Catalunya, as an authored IFC4X3 heritage-asset model.

What it holds, at the south end of Plaça de Catalunya, facing La Rambla:
  * Josep Maria Subirachs's «Catalunya a Francesc Macià» (inaugurated 25 December 1991, OSM way 128230182,
    Wikidata Q13405928, Barcelona public-art id 2048-1): a travertine pedestal of stone courses in broken bond,
    tapering upwards, with the inscription «CATALUNYA A FRANCESC MACIÀ» at the top of its south face; on it a
    concrete inverted staircase — nine steps, the first three set into the pedestal (Macià's three years as
    President), the other six cantilevering southwards over the inscription and ending abruptly in a broken,
    «unfinished» crown (the country's future, built step by step); a concrete side wall on the east; the iron
    coat of arms of Catalonia and Macià's sentence of 14 December 1932 on the back;
  * the separate bronze monolith in front of it with Macià's bust (replica of Josep Clarà's 1932 portrait), on its
    plinth, with its plaque;
  * what nobody sees: the foundation raft (over the L3 Catalunya metro station, which runs directly beneath) and
    the steel core that anchors the cantilever into the pedestal;
  * three in-ground uplights and the square's sett paving over the place where this model replaces the mesh.

Detailed geometry (roughly LOD 400) carrying LOD 500-style asset data: every element has
Pset_CDE_AssetManagement (demo), Pset_CDE_Heritage (demo) and Pset_CDE_Provenance. It is NOT the owner's
as-built model and every register value is invented.

What is real:
  * the position and plan outline from OpenStreetMap (© OpenStreetMap contributors, ODbL): way 128230182, read as
    the aerial outline of the cantilevered stair (it matches the ICGC mesh's top-down extent); the reflecting pool
    (way 128230183) and La Deessa (node 5404638138) to the north; the L3 platforms (ways 966064737, 966064738)
    under it (landmarks/macia_monument_site.json);
  * artist, date, materials (travertine pedestal, concrete stair, iron arms, bronze bust), the meaning and
    arrangement of the steps, the inscription and the bust after Clarà (Wikipedia ca «Monument a Francesc Macià»,
    Wikidata Q13405928);
  * the form and orientation — inscription to the south, stair rising southwards, side wall on the east — from the
    photographs in Wikimedia Commons «Category:Monument a Francesc Macià (Barcelona)», cross-checked with the mesh;
  * the heights from ICGC's photogrammetric Barcelona mesh: paving 66.31 m (ellipsoidal) in a 7-12 m ring, the top
    about 9.1 m above it, the paving rising ~0.9 m northwards across the monument.
What is estimated, not measured: every dimension (riser 0.63 m, going 0.69 m, pedestal taper), the step count
(nine, counted on photographs), the bust and plaque sizes, everything below the paving, the steel core, the
uplights (none is documented), the position of the arms and the quote on the back, the inscription's lettering.
There is no railing around the monument (none in any photograph), so none is modelled.

Local axes: +x east, +y north, metres, origin at the centroid of OSM way 128230182, z = 0 at the paving level that
the ICGC mesh gives in a 7-12 m ring around it, 66.31 m ellipsoidal (≈ 16.61 m above the Alicante datum: EGM08
undulation ≈ 49.70 m).

Scene tiles: anchored at h = 66.31 (raw, ellipsoidal) and linked with the same placement as the ICGC mesh,
ELLIPSOIDAL −49.70, so model and mesh move together if that offset is ever corrected.

usage: uv run --with ifcopenshell --with pyproj python landmarks/macia_monument.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/macia-monument.ifc src/macia-monument_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/macia-monument_qto.ifc \
           tiles/barcelona-macia-monument 41.386252 2.170102 66.31 0 --keep-origin \
           --wfs tiles/wfs/barcelona-macia-monument --wfs-name barcelona_macia_monument_features \
           --extras src/macia-monument_cutouts.json
"""
import json, math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model  # noqa: E402
from pyproj import Transformer  # noqa: E402

HERE = os.path.dirname(__file__)
SITE = json.load(open(os.path.join(HERE, 'macia_monument_site.json'), encoding='utf-8'))
LAT0, LON0 = SITE['origin']['lat'], SITE['origin']['lon']
RAW0 = SITE['datum_raw_ellipsoidal']
ELEV0 = round(RAW0 + SITE['icgc_offset_m'], 2)          # ≈ orthometric (Alicante)
BCN_CRS = (25831, 'ETRS89 / UTM zone 31N', 'ETRS89', 'Alicante (REDNAP)')

m = Model('Monument a Francesc Macià', 'Plaça de Catalunya, south end',
          'Catalunya a Francesc Macià · J. M. Subirachs, 1991', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 heritage-asset model (≈LOD 400 geometry, LOD 500-style asset data with demo '
                      'values). Position © OpenStreetMap contributors (ODbL); heights measured on the ICGC 3D mesh. '
                      'Not the owner\'s as-built model.',
          tag_prefix='MMAC', crs=BCN_CRS, schema='IFC4X3_ADD2')

# The model's +y is true north; UTM grid north is not. Give the map conversion the grid direction of +x.
_tr = Transformer.from_crs(4326, 25831, always_xy=True)
_e0, _n0 = _tr.transform(LON0, LAT0)
_e1, _n1 = _tr.transform(LON0, LAT0 + 100 / 110574)
_alpha = math.atan2(_e1 - _e0, _n1 - _n0)              # grid azimuth of true north
_mc = m.f.by_type('IfcMapConversion')[0]
_mc.XAxisAbscissa, _mc.XAxisOrdinate = math.cos(_alpha), -math.sin(_alpha)

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('travertine', 'Travertine, honed, warm cream', (0.83, 0.78, 0.68), 'Stone', 2450,
  'Pedestal courses in broken bond, fine horizontal tooling on the front')
M('travertine_cut', 'Travertine, incised lettering (shadowed)', (0.42, 0.38, 0.32), 'Stone', 2450,
  'The carved letters of the inscription, shown as their shadow')
M('concrete', 'White architectural concrete, board-marked', (0.88, 0.85, 0.78), 'Concrete', 2400,
  'Cast inverted staircase and side wall')
M('concrete_rough', 'Concrete, broken face with exposed aggregate', (0.62, 0.60, 0.56), 'Concrete', 2400,
  'The deliberately unfinished crown of the stair')
M('rc', 'Reinforced concrete C30/37', (0.66, 0.65, 0.62), 'Concrete', 2500)
M('steel', 'Structural steel S355, hot-dip galvanised', (0.55, 0.57, 0.60), 'Steel', 7850)
M('iron', 'Wrought iron, dark oxide finish', (0.20, 0.17, 0.15), 'Iron', 7700)
M('bronze', 'Bronze, dark green patina', (0.24, 0.27, 0.20), 'Copper alloy', 8800, 'Bust, monolith and plaque')
M('setts', 'Granite setts, dark grey, with grass joints', (0.36, 0.37, 0.34), 'Stone', 2650,
  'The square\'s cobbled paving laid in arcs')
M('inox', 'Stainless steel AISI 316, bead-blasted', (0.70, 0.71, 0.72), 'Steel', 8000)

f = m.f


# ─── Geometry helpers ──────────────────────────────────────────────────────────────────────────────
def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def _perp(d):
    a = (0., 0., 1.) if abs(d[2]) < 0.9 else (1., 0., 0.)
    c = (d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0])
    return _unit(c)


def bar(p0, p1, w, h):
    """Rectangular bar w x h from p0 to p1 (3D points)."""
    d = tuple(b - a for a, b in zip(p0, p1))
    L = math.sqrt(sum(c * c for c in d))
    u = _unit(d)
    prof = f.createIfcRectangleProfileDef('AREA', None, m._pl2(), float(w), float(h))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=u, ref=_perp(u)), f.createIfcDirection((0., 0., 1.)), float(L))


def _area(pts):
    return 0.5 * sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))


def _dedupe(pts, eps=1e-6):
    out = []
    for p in pts:
        if not out or abs(p[0] - out[-1][0]) > eps or abs(p[1] - out[-1][1]) > eps:
            out.append(p)
    while len(out) > 1 and abs(out[0][0] - out[-1][0]) < eps and abs(out[0][1] - out[-1][1]) < eps:
        out.pop()
    return out


def prof_brep(pts, xl, xr):
    """Solid from a profile [(y, z)] in the north-south vertical plane, spanning x from xl(z) to xr(z) (both linear
    in z, so a battered side stays one plane)."""
    pts = _dedupe(pts)
    if _area(pts) < 0:
        pts = pts[::-1]
    n = len(pts)
    L = [(xl(z), y, z) for y, z in pts]
    R = [(xr(z), y, z) for y, z in pts]
    faces = [tuple(range(n, 2 * n)), tuple(range(n - 1, -1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return m.brep(L + R, faces)


def clip_band(pts, za, zb):
    """Sutherland-Hodgman clip of a (y, z) polygon to za <= z <= zb."""
    def clip(poly, keep, cut):
        out = []
        for a, b in zip(poly, poly[1:] + poly[:1]):
            ia, ib = keep(a), keep(b)
            if ia:
                out.append(a)
            if ia != ib:
                t = (cut - a[1]) / (b[1] - a[1])
                out.append((a[0] + t * (b[0] - a[0]), cut))
        return out
    p = clip(pts, lambda q: q[1] >= za - 1e-9, za)
    p = clip(p, lambda q: q[1] <= zb + 1e-9, zb) if p else p
    return _dedupe(p)


def face_slab(poly_xz, yf, sgn, off0, off1):
    """Thin solid on an inclined pedestal face: polygon [(x, z)] on the face y = yf(z), from off0 to off1 outwards
    (sgn = -1 for the south face, +1 for the north face)."""
    poly_xz = _dedupe(poly_xz)
    if _area(poly_xz) < 0:
        poly_xz = poly_xz[::-1]
    n = len(poly_xz)
    B = [(x, yf(z) + sgn * off0, z) for x, z in poly_xz]
    F = [(x, yf(z) + sgn * off1, z) for x, z in poly_xz]
    faces = [tuple(range(n, 2 * n)), tuple(range(n - 1, -1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    if sgn > 0:                                   # mirrored view: flip every loop
        faces = [tuple(reversed(fc)) for fc in faces]
    return m.brep(B + F, faces)


def rect(x0, x1, z0, z1):
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


# ─── Dimensions (estimated from photographs; see the site json) ───────────────────────────────────
ZP = lambda y: 0.31 + 0.093 * (y + 1.0)                 # the square's paving, rising northwards (ICGC mesh)
NST = SITE['steps']['count']                           # 9 steps
RISE, GO = SITE['steps']['riser_m'], SITE['steps']['going_m']
Y_N, Y_S = SITE['steps']['north_end_y'], SITE['steps']['south_end_y']
Z_STEP0 = 3.41                                         # underside of the lowest step
STEP_Y = [(Y_N - GO * (k + 1), Y_N - GO * k) for k in range(NST)]
STEP_Z = [round(Z_STEP0 + RISE * k, 3) for k in range(NST)]
SET_IN = 3                                             # steps set into the pedestal
X_W, X_E, X_WALL = -1.90, 1.45, 1.75                   # stair width; side wall on the east
Z_CROWN = 8.85                                         # crown underside
Z_BASE = -0.40                                         # pedestal bearing on the foundation raft
Z_TOP = STEP_Z[SET_IN]                                 # pedestal top = underside of the first free step (5.30)
Y_TOP_S = STEP_Y[SET_IN][0]                            # south edge of the pedestal top (0.14)
assert abs(Z_TOP - 5.30) < 1e-6

# pedestal faces: south face battered, north face steep (through the first step's north end), sides tapering
Y_FACE = lambda z: -0.80 + (Y_TOP_S + 0.80) * (z - Z_BASE) / (Z_TOP - Z_BASE)
Y_NORTH = lambda z: 4.30 - (4.30 - Y_N) * z / Z_STEP0
XL = lambda z: -1.60 + 0.55 * z / Z_TOP
XR = lambda z: 1.80 - 0.85 * z / Z_TOP
PEDESTAL = [(Y_FACE(Z_BASE), Z_BASE), (Y_NORTH(Z_BASE), Z_BASE), (Y_N, STEP_Z[0])]
for k in range(SET_IN):                                 # three sockets that receive the first three steps
    y_s = STEP_Y[k][0]
    PEDESTAL += [(y_s, STEP_Z[k]), (y_s, STEP_Z[k + 1])]
PEDESTAL += [(Y_TOP_S, Z_TOP)]

# ─── Asset and heritage data ───────────────────────────────────────────────────────────────────────
YEAR = {'monument': 1991, 'stair': 1991, 'structure': 1991, 'bust': 1991, 'sign': 1991, 'lighting': 2019,
        'paving': 2009}
WARRANTY_Y = {'monument': 0, 'stair': 0, 'structure': 0, 'bust': 0, 'sign': 0, 'lighting': 5, 'paving': 10}
DATA_STATUS = 'Illustrative demo values — not the owner\'s as-built register'
_serial = {}


def _add_months(iso, months):
    y, mo, d = map(int, iso.split('-'))
    mo += months
    y, mo = y + (mo - 1) // 12, (mo - 1) % 12 + 1
    return f'{y:04d}-{mo:02d}-{min(d, 28):02d}'


def am(kind, interval_months, condition, owner, manufacturer, model, contractor, last='2026-06-15', **extra):
    """Pset_CDE_AssetManagement (demo): the fields an as-built asset register holds, with invented values."""
    code = {'monument': 'MON', 'stair': 'MON', 'structure': 'EST', 'bust': 'ESC', 'sign': 'ESC', 'lighting': 'ENL',
            'paving': 'PAV'}[kind]
    n = _serial.get(code, 0) + 1
    _serial[code] = n
    y = YEAR[kind]
    w = WARRANTY_Y[kind]
    warranty = 'None (heritage asset, warranties long expired)' if w == 0 else \
        (f'{y + w}-12-31' + (' (expired)' if y + w < 2026 else ''))
    base = {'DataStatus': DATA_STATUS, 'AssetOwner': owner, 'Manufacturer': manufacturer, 'Model': model,
            'SerialNumber': f'BCN-{code}-2048-{n:03d}', 'LifecycleStatus': 'In service', 'InstallationYear': y,
            'LastInspection': last, 'InspectionInterval_months': interval_months,
            'NextInspection': _add_months(last, interval_months), 'ConditionIndex_1to5': condition,
            'WarrantyEnd': warranty, 'MaintenanceContractor': contractor,
            'MaintenanceStrategy': 'Condition-based (heritage conservation plan)' if kind != 'lighting' else 'Condition-based'}
    base.update({k: v for k, v in extra.items() if v is not None})
    return {'Pset_CDE_AssetManagement (demo)': base}


def heritage(role, artist='Josep Maria Subirachs', **extra):
    """Pset_CDE_Heritage (demo): the heritage-register view of the element."""
    props = {'DataStatus': DATA_STATUS, 'Artist': artist, 'Year': 1991, 'Inaugurated': '1991-12-25',
             'CatalogueId': 'Art Públic Barcelona 2048-1 (Wikidata P8601)', 'Wikidata': 'Q13405928',
             'ProtectionLevel': 'Municipal public-art catalogue; legal protection level not verified (demo)',
             'ElementRole': role, 'Dedicatee': 'Francesc Macià i Llussà (1859-1933), President of the Generalitat 1931-1933'}
    props.update({k: v for k, v in extra.items() if v is not None})
    return {'Pset_CDE_Heritage (demo)': props}


def spec(**props):
    return {'Pset_CDE_Specification': props}


def prov(src):
    return {'Pset_CDE_Provenance': {'GeometrySource': src[0], 'Confidence': src[1], 'Reference': src[2] if len(src) > 2 else None}}


OWNER = 'Ajuntament de Barcelona — public art (owner per the municipal catalogue; not verified, demo)'
CON_CONS = 'Demo contractor — stone and concrete conservation'
CON_BRZ = 'Demo contractor — metal conservation (bronze and iron)'
CON_STR = 'Demo contractor — structural inspection'
CON_LGT = 'Demo contractor — public lighting'
CON_URB = 'Demo contractor — paving'
SUBI = 'Taller Subirachs (design); execution contractor not documented'
WIKI = 'Wikipedia ca «Monument a Francesc Macià»; Wikidata Q13405928'
COMMONS = 'Wikimedia Commons «Category:Monument a Francesc Macià (Barcelona)»'

FORM_SRC = ('Form and orientation from photographs, dimensions estimated; plan outline from OSM (ODbL); top height '
            'from the ICGC mesh', 'Medium', f'OSM way 128230182; {COMMONS}; ICGC Barcelona mesh')
FACT_SRC = ('Element documented; its dimensions and exact position estimated from photographs', 'Medium',
            f'{WIKI}; {COMMONS}')
BACK_SRC = ('Documented on the back of the monument; position, size and design here illustrative', 'Low', WIKI)
BELOW_SRC = ('Not visible in any open source; a typical solution for a cantilevered monument over a metro station', 'Low',
             'OSM ways 966064737/966064738 (L3 Catalunya platforms, level -2) run beneath')
ILLU_SRC = ('Not documented in OSM or photographs; illustrative fitting of a typical in-ground uplight', 'Low')
PAVE_SRC = ('Paving type from photographs; level and slope from the ICGC mesh', 'Medium',
            f'{COMMONS}; ICGC Barcelona mesh (see landmarks/macia_monument_site.json)')

# ─── Spatial structure ─────────────────────────────────────────────────────────────────────────────
SQUARE = 'Plaça de Catalunya · Paving level'
m.storey(SQUARE, 0., 'The south end of Plaça de Catalunya at the ring paving level the ICGC mesh gives around the monument')

mon = m.assembly('Catalunya a Francesc Macià · Monument', SQUARE, object_type='Commemorative monument (public sculpture)',
                 description='Pedestal of history, three steps of government, an unfinished stair into the future.',
                 psets={**spec(OSMWay=128230182, Wikidata='Q13405928', ArtPublicId='2048-1', PoblesDeCatalunyaId=2736,
                               OverallHeight_m=8.8, Steps=NST, StepsSetIntoPedestal=SET_IN,
                               UrbanDesign='Helio Piñón and Albert Viaplana (pool and setting)',
                               Inscription='CATALUNYA A FRANCESC MACIÀ'),
                        **am('monument', 12, 3, OWNER, SUBI, 'Catalunya a Francesc Macià (unique work)', CON_CONS,
                             Note='Rust streaks from the side wall, biological growth on the crown (demo)'),
                        **heritage('Monument (whole work)'), **prov(FORM_SRC)})


def el(ifc_class, name, items, material, kind, cond=4, src=FORM_SRC, role='Artwork', parent=None, predefined=None,
       object_type=None, description=None, common=None, specs=None, interval=12, owner=OWNER, maker=SUBI,
       model='Catalunya a Francesc Macià (unique work)', contractor=CON_CONS, artist='Josep Maria Subirachs', **extra):
    if ifc_class == 'IfcBuildingElementProxy':
        predefined, object_type = 'USERDEFINED', 'Monument'
    return m.element(ifc_class, name, items, SQUARE, material, predefined=predefined, object_type=object_type,
                     description=description, parent=parent if parent is not None else mon, src=src, common=common,
                     psets={**spec(**(specs or {})),
                            **am(kind, interval, cond, owner, maker, model, contractor, **extra),
                            **heritage(role, artist=artist)})


# ═══ 1. Foundation and steel core (hidden) ════════════════════════════════════════════════════════
el('IfcFooting', 'Llosa de fonamentació · Foundation raft', m.box(0.10, 1.85, -1.30, 4.40, 6.30, 0.90), 'rc', 'structure',
   src=BELOW_SRC, role='Structure (hidden)', predefined='PAD_FOOTING', object_type='Reinforced-concrete raft 4.4 × 6.3 × 0.9 m',
   description='Spreads the eccentric load of the cantilever; bears on the structure of the L3 Catalunya station below.',
   specs={'Thickness_mm': 900, 'Concrete': 'C30/37', 'Reinforcement': 'B500S, two-way top and bottom mats (demo)',
          'BearsOn': 'Roof structure of the L3 Catalunya station (OSM ways 966064737/966064738) — load path not documented'},
   interval=60, maker='Demo structural contractor', model='RC raft', contractor=CON_STR)

core = []
for x in (-0.55, 0.55):
    p0 = (x, STEP_Y[0][0], STEP_Z[1] + 0.15)
    p1 = (x, -2.80, STEP_Z[1] + 0.15 + RISE / GO * (STEP_Y[0][0] + 2.80))
    core.append(bar(p0, p1, 0.16, 0.16))
el('IfcMember', 'Nucli d\'acer de la volada · Cantilever steel core', core, 'steel', 'structure', src=BELOW_SRC,
   role='Structure (hidden)', predefined='MEMBER', object_type='Two HEB 160 spines cast into the stair, parallel to its soffit',
   description='Carries the 3.5 m cantilever back into the pedestal (assumed; the stair is documented as concrete only).',
   specs={'Section': 'HEB 160 (shown as 160 × 160)', 'Cover_mm': 70, 'Length_m': round(math.dist(p0, p1), 2)},
   interval=60, maker='Demo steel fabricator', model='HEB 160 S355', contractor=CON_STR)
el('IfcMember', 'Ancoratges del nucli · Core anchors', [bar((x, 2.0, -1.10), (x, 2.0, STEP_Z[1] + 0.30), 0.12, 0.12) for x in (-0.55, 0.55)],
   'steel', 'structure', src=BELOW_SRC, role='Structure (hidden)', predefined='MEMBER',
   object_type='Two vertical tie-down members from the raft through the pedestal into the stair',
   specs={'Section': 'SHS 120 × 120 × 10 (demo)', 'EmbedmentInRaft_mm': 700}, interval=60,
   maker='Demo steel fabricator', model='SHS 120 S355', contractor=CON_STR)

# ═══ 2. Pedestal: travertine courses ══════════════════════════════════════════════════════════════
ped = m.assembly('Pedestal de travertí · Travertine pedestal', None, object_type='Tapering pedestal of travertine courses',
                 parent=mon, description='«The history of Catalonia»: stone blocks in broken bond, rising to the inscription.',
                 psets={**spec(Courses=9, BaseFootprint_m='3.4 × 5.3', Height_m=Z_TOP, Bond='Broken bond (trencajunt)'),
                        **am('monument', 12, 3, OWNER, SUBI, 'Travertine pedestal', CON_CONS),
                        **heritage('Pedestal'), **prov(FACT_SRC)})
COURSES = [Z_BASE, 0.30, 0.95, 1.60, 2.25, 2.85, STEP_Z[0], STEP_Z[1], STEP_Z[2], Z_TOP]
for i, (za, zb) in enumerate(zip(COURSES, COURSES[1:]), 1):
    band = clip_band(PEDESTAL, za, zb)
    note = None
    if za >= STEP_Z[0] - 1e-6:
        note = f'Holds the socket of step {i - 6} (the year {1930 + i - 6} of Macià\'s presidency)'
    el('IfcBuildingElementProxy', f'Filada {i} del pedestal · Pedestal course {i}', prof_brep(band, XL, XR), 'travertine',
       'monument', cond=3 if i in (1, 2) else 4, parent=ped, role='Pedestal course',
       description=f'Travertine course {i} of 9, z {za:.2f} to {zb:.2f} m' + (f'. {note}' if note else ''),
       specs={'Course': i, 'Height_mm': round((zb - za) * 1000), 'Stone': 'Travertine (Wikipedia ca)',
              'Note': 'Partly below the paving' if i == 1 else note},
       Note='Soiling and rising damp at the foot (demo)' if i in (1, 2) else None)

# inscription on the top of the south face: panel + incised letters (5 × 7 grid letters)
GLYPH = {
    'C': [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '],
    'A': [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
    'T': ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
    'L': ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
    'U': ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
    'N': ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'],
    'Y': ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
    'F': ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
    'R': ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
    'E': ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
    'S': [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
    'M': ['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #'],
    'I': [' ### ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
}
GLYPH['À'] = [' #   ', '  #  '] + GLYPH['A']                # grave accent over the A (two extra rows)
PX = 0.034
LINES = ['CATALUNYA', 'A', 'FRANCESC', 'MACIÀ']
Z_LINE0 = 5.12
letters = []
for li, word in enumerate(LINES):
    ztop = Z_LINE0 - li * 0.31
    width = len(word) * 6 * PX - PX
    x0 = -0.05 - width / 2
    for ci, ch in enumerate(word):
        g = GLYPH[ch]
        rows = len(g)
        for r, row in enumerate(g):
            zr = ztop - (r - (rows - 7)) * PX           # accent rows sit above the cap height
            c = 0
            while c < 5:
                if row[c] == '#':
                    c1 = c
                    while c1 < 5 and row[c1] == '#':
                        c1 += 1
                    xa = x0 + (ci * 6 + c) * PX
                    letters.append(face_slab(rect(xa, xa + (c1 - c) * PX, zr - PX, zr), Y_FACE, -1, 0.0, 0.012))
                    c = c1
                else:
                    c += 1
insc = m.assembly('Inscripció «Catalunya a Francesc Macià» · Inscription', None, object_type='Carved inscription',
                  parent=mon, psets={**spec(Text='CATALUNYA A FRANCESC MACIÀ', Lines=4, LetterHeight_mm=round(7 * PX * 1000)),
                                     **am('sign', 12, 4, OWNER, SUBI, 'Incised lettering', CON_CONS),
                                     **heritage('Inscription'), **prov(FACT_SRC)})
el('IfcSign', 'Camp de la inscripció · Inscription field', face_slab(rect(-1.00, 0.90, 3.88, 5.22), Y_FACE, -1, 0.0, 0.004),
   'travertine', 'sign', parent=insc, role='Inscription', predefined='MARKER',
   object_type='Smooth-dressed field at the top of the south face that carries the lettering',
   specs={'Width_mm': 1900, 'Height_mm': 1340})
el('IfcSign', 'Lletres incises · Incised letters', letters, 'travertine_cut', 'sign', parent=insc, role='Inscription',
   predefined='MARKER', object_type='Capital letters cut into the stone (shown as their shadow, block letterforms illustrative)',
   specs={'Text': 'CATALUNYA / A / FRANCESC / MACIÀ', 'Letterform': 'Roman capitals on the monument; 5 × 7 block letters here'})

# back: iron coat of arms and Macià's sentence, on the steep north face
YN_FACE = lambda z: Y_NORTH(z)
shield = [face_slab([(-0.65, 1.55), (-0.20, 1.05), (0.25, 1.55), (-0.20, 2.05)], YN_FACE, 1, 0.0, 0.03)]
for j in range(4):                                     # the four bars of the senyera, raised
    xb = -0.20 + (j - 1.5) * 0.105
    half = 0.45 - abs(xb + 0.20)
    shield.append(face_slab(rect(xb - 0.025, xb + 0.025, 1.55 - half + 0.05, 1.55 + half - 0.05), YN_FACE, 1, 0.03, 0.05))
back = m.assembly('Part posterior · Back of the monument', None, object_type='Arms and dedication on the back', parent=mon,
                  psets={**spec(Face='North'), **am('sign', 12, 4, OWNER, SUBI, 'Back elements', CON_BRZ),
                         **heritage('Back elements'), **prov(BACK_SRC)})
el('IfcSign', 'Escut de Catalunya · Coat of arms of Catalonia', shield, 'iron', 'sign', src=BACK_SRC, parent=back,
   role='Heraldry', predefined='PICTORAL', object_type='Lozenge shield with the four bars, wrought iron',
   specs={'Material': 'Iron (Wikipedia ca: «realitzat en ferro»)', 'Size_mm': '900 × 1000 (demo)'},
   contractor=CON_BRZ, cond=3, Note='Run-off staining below the shield (demo)')
el('IfcSign', 'Frase del president Macià · Macià\'s sentence of 14 December 1932', face_slab(rect(0.40, 1.30, 0.75, 2.15), YN_FACE, 1, 0.0, 0.01),
   'travertine_cut', 'sign', src=BACK_SRC, parent=back, role='Dedication', predefined='MARKER',
   object_type='Carved text: Macià\'s words to the Catalan deputies, 14-12-1932 (text not transcribed here)',
   specs={'Date': '1932-12-14', 'Text': 'Not transcribed (see Wikipedia ca)'}, contractor=CON_CONS)

# ═══ 3. Inverted staircase ════════════════════════════════════════════════════════════════════════
stair = m.assembly('Escala invertida · Inverted staircase', None, object_type='Cantilevered concrete stair, upside down',
                   parent=mon, description='The first three steps are set into the pedestal; the other six end abruptly.',
                   psets={**spec(Steps=NST, Riser_mm=round(RISE * 1000), Going_mm=round(GO * 1000),
                                 Width_mm=round((X_WALL - X_W) * 1000), Cantilever_m=round(Y_TOP_S - Y_S, 2),
                                 Material='Concrete (Wikipedia ca: «executada en formigó»)'),
                          **am('stair', 12, 3, OWNER, SUBI, 'Inverted stair', CON_CONS), **heritage('Inverted staircase'),
                          **prov(FACT_SRC)})
for k in range(NST):
    y0, y1 = STEP_Y[k]
    meaning = (f'Set into the pedestal: the year {1931 + k} of Macià\'s presidency' if k < SET_IN
               else 'Free step: the country\'s future, built step by step')
    el('IfcBuildingElementProxy', f'Esglaó {k + 1} · Step {k + 1}' + (' (set into the pedestal)' if k < SET_IN else ''),
       m.box((X_W + X_E) / 2, (y0 + y1) / 2, STEP_Z[k], X_E - X_W, y1 - y0, Z_CROWN - STEP_Z[k]), 'concrete', 'stair',
       cond=3 if k >= NST - 2 else 4, parent=stair, role='Step', src=FACT_SRC if k < SET_IN else FORM_SRC,
       description=meaning,
       specs={'Step': k + 1, 'UndersideLevel_m': STEP_Z[k], 'Going_mm': round(GO * 1000), 'Riser_mm': round(RISE * 1000),
              'Meaning': meaning, 'Graffiti': 'Incised names, dates and places of Macià\'s life (documented; not modelled)'},
       Note='Spalling at the nosing, rebar cover to check (demo)' if k == NST - 1 else None)

WALL = [(Y_N, STEP_Z[0])]
for k in range(NST):
    WALL += [(STEP_Y[k][0], STEP_Z[k])] + ([(STEP_Y[k][0], STEP_Z[k + 1])] if k + 1 < NST else [])
WALL += [(Y_S, Z_CROWN), (Y_N, Z_CROWN)]
el('IfcPlate', 'Mur lateral · East side wall', prof_brep(WALL, lambda z: X_E, lambda z: X_WALL), 'concrete', 'stair', cond=3,
   parent=stair, role='Side wall', predefined='USERDEFINED', object_type='Concrete side wall (cheek) on the east of the stair',
   specs={'Thickness_mm': round((X_WALL - X_E) * 1000), 'Length_m': round(Y_N - Y_S, 2)},
   Note='Rust streaks from embedded steel on the east face (demo)')

CROWN = [(Y_S, Z_CROWN), (Y_N, Z_CROWN)]
NJ = 26
for i in range(NJ + 1):
    y = Y_N - (Y_N - Y_S) * i / NJ
    z = 9.02 + 0.20 * (Y_N - y) / (Y_N - Y_S) + 0.05 * math.sin(3.1 * i + 0.4) + 0.03 * math.sin(7.3 * i)
    CROWN.append((y, round(z, 3)))
el('IfcSlab', 'Coronament inacabat · Unfinished crown', prof_brep(CROWN, lambda z: X_W, lambda z: X_WALL), 'concrete_rough',
   'stair', cond=3, parent=stair, role='Crown', predefined='USERDEFINED',
   object_type='Broken-off top of the stair, rough exposed aggregate', common={'LoadBearing': False},
   specs={'Finish': 'Deliberately broken, «unfinished»', 'TopLevel_m': 'about 9.0 to 9.25 (ICGC mesh top ≈ 9.1)'},
   Note='Moss and biological growth on the rough top (demo)')

# ═══ 4. Bust of Macià ═════════════════════════════════════════════════════════════════════════════
BX, BY = 0.35, -1.70
z0 = ZP(BY)
bust = m.assembly('Bust del president Macià · Bust of President Macià', None, object_type='Bronze bust on a monolith',
                  parent=mon, description='Replica of the portrait Josep Clarà made of Macià in 1932; realistic, as a link '
                                          'with the noucentista sculpture of the square.',
                  psets={**spec(Material='Bronze', After='Josep Clarà, portrait of Macià (1932)', Height_m=2.15),
                         **am('bust', 12, 4, OWNER, 'Demo art foundry (bronze casting)', 'Bust after Clarà, cast bronze', CON_BRZ),
                         **heritage('Bust', artist='Josep Maria Subirachs, after the 1932 portrait by Josep Clarà'),
                         **prov(FACT_SRC)})
BUST_ART = 'Josep Maria Subirachs, after the 1932 portrait by Josep Clarà'
el('IfcFooting', 'Dau de fonamentació del bust · Bust footing', m.box(BX, BY, z0 - 0.70, 0.90, 0.80, 0.50), 'rc', 'structure',
   src=BELOW_SRC, role='Structure (hidden)', parent=bust, predefined='PAD_FOOTING', object_type='Concrete pad 0.9 × 0.8 × 0.5 m',
   specs={'Anchors': '4 × M16 stainless studs into the monolith (demo)'}, interval=60, maker='Demo structural contractor',
   model='RC pad', contractor=CON_STR, artist=BUST_ART)
el('IfcSlab', 'Sòcol del bust · Bust plinth', m.box(BX, BY, z0 - 0.20, 0.72, 0.60, 0.26), 'travertine', 'bust', parent=bust,
   role='Plinth', src=FACT_SRC, predefined='BASESLAB', object_type='Low travertine plinth, flush with the setts but for 60 mm',
   common={'LoadBearing': True}, specs={'Size_mm': '720 × 600 × 260'}, maker=SUBI, model='Plinth', contractor=CON_CONS,
   artist=BUST_ART)
el('IfcBuildingElementProxy', 'Monòlit · Bronze monolith', m.box(BX, BY, z0 + 0.06, 0.42, 0.34, 1.56), 'bronze', 'bust',
   parent=bust, role='Monolith', src=FACT_SRC, description='Tall bronze block from which the bust rises',
   specs={'Size_mm': '420 × 340 × 1560'}, maker='Demo art foundry (bronze casting)', model='Monolith, cast bronze',
   contractor=CON_BRZ, artist=BUST_ART, Note='Patina streaked, wax treatment due (demo)')
ZB = z0 + 1.62
head = [m.box(BX, BY + 0.02, ZB, 0.46, 0.26, 0.22),
        m.cylinder(BX, BY + 0.01, ZB + 0.22, 0.065, 0.09),
        m.revolve([(0., 0.), (0.085, 0.01), (0.11, 0.07), (0.115, 0.14), (0.105, 0.21), (0.075, 0.26), (0., 0.28)],
                  BX, BY, ZB + 0.29),
        m.box(BX, BY - 0.11, ZB + 0.38, 0.03, 0.04, 0.06)]                     # nose, facing the Rambla
el('IfcBuildingElementProxy', 'Bust de Francesc Macià · Bust of Francesc Macià', head, 'bronze', 'bust', parent=bust,
   role='Bust', src=FACT_SRC, description='Head and shoulders of Macià, facing south towards La Rambla',
   specs={'Height_mm': 570, 'Facing': 'South'}, maker='Demo art foundry (bronze casting)', model='Bust after Clarà, cast bronze',
   contractor=CON_BRZ, artist=BUST_ART)
el('IfcSign', 'Placa del monòlit · Monolith plaque', m.box(BX, BY - 0.173, z0 + 0.90, 0.26, 0.006, 0.45), 'bronze', 'sign',
   parent=bust, role='Inscription', src=('Lettering visible on the monolith\'s front in photographs; text not legible', 'Low', COMMONS),
   predefined='MARKER', object_type='Cast lettering panel on the front of the monolith (text not transcribed)',
   specs={'Text': 'Not legible in the sources used'}, maker='Demo art foundry (bronze casting)', model='Cast plaque',
   contractor=CON_BRZ, artist=BUST_ART)

# ═══ 5. Lighting and paving (setting) ═════════════════════════════════════════════════════════════
lights = m.assembly('Il·luminació del monument · Monument lighting', None, object_type='In-ground uplights', parent=mon,
                    psets={**spec(Circuit='Square public-lighting circuit (demo)', Control='Astronomical clock, off 01:00-06:00 (demo)'),
                           **am('lighting', 12, 4, OWNER, 'Demo luminaire maker', 'In-ground uplight 30 W', CON_LGT),
                           **heritage('Lighting (setting)', artist='Not an artwork element'), **prov(ILLU_SRC)})
for n, (lx, ly, aim) in enumerate([(-1.10, -3.95, 'stepped soffit, west'), (1.05, -3.95, 'stepped soffit and side wall, east'),
                                   (0.35, -2.55, 'bust and inscription')], 1):
    zl = ZP(ly)
    el('IfcLightFixture', f'Projector encastat {n} · In-ground uplight {n}',
       [m.cylinder(lx, ly, zl - 0.25, 0.11, 0.25), m.cylinder(lx, ly, zl, 0.12, 0.012)], 'inox', 'lighting', src=ILLU_SRC,
       parent=lights, role='Lighting (setting)', predefined='DIRECTIONSOURCE',
       object_type='Recessed LED uplight, IP68, drive-over', specs={'Aim': aim, 'Power_W': 30, 'ColourTemperature_K': 3000,
                                                                    'BeamAngle_deg': 24 if n < 3 else 36, 'IngressProtection': 'IP68'},
       interval=12, maker='Demo luminaire maker', model='In-ground uplight 30 W 3000 K', contractor=CON_LGT,
       artist='Not an artwork element', BurningHours=17400 + 110 * n, Note='Lens scratched, glass replacement booked (demo)' if n == 3 else None)

# ─── Mesh cut-out and paving patch ─────────────────────────────────────────────────────────────────
# The ICGC mesh holds the real monument as a photogrammetric lump and the IFC stands inside it. This box is where
# the model replaces the mesh (tileset.json `extras.cdeMeshCutouts`, read by CDE-Frontend); under it the model
# lays the square's sett paving, following the mesh's northward rise, so no hole shows.
S_CUT, T_CUT = (-4.30, 4.90), (-2.60, 2.60)            # s = north (bearing 0), t = west
CUT_FLOOR, CUT_TOP = ZP(-4.3) + 0.06, 9.80
MARGIN = 0.25
y0, y1 = S_CUT[0] - MARGIN, S_CUT[1] + MARGIN
x0, x1 = -T_CUT[1] - MARGIN, -T_CUT[0] + MARGIN
pave = [(y0, ZP(y0) - 0.07), (y1, ZP(y1) - 0.07), (y1, ZP(y1) + 0.03), (y0, ZP(y0) + 0.03)]
el('IfcSlab', 'Paviment de llambordes · Sett paving (patch over the cut-out)', prof_brep(pave, lambda z: x0, lambda z: x1),
   'setts', 'paving', src=PAVE_SRC, role='Setting', predefined='PAVING', common={'LoadBearing': False},
   object_type='Granite setts in arcs with grass joints, over the place where this model replaces the mesh',
   specs={'Purpose': 'Visual: replaces the photogrammetric ground under the monument', 'Slope_pct': 9.3,
          'Pattern': 'Setts laid in arcs, grass in the joints', 'Thickness_mm': 100},
   interval=12, maker='Demo stone supplier', model='Granite sett 10 × 10', contractor=CON_URB,
   artist='Not an artwork element (square paving)')
CUTOUTS = [{'name': 'Monument a Francesc Macià', 'lon': LON0, 'lat': LAT0, 'bearing': 0.0,
            's': list(S_CUT), 't': list(T_CUT), 'z': [round(CUT_FLOOR, 3), CUT_TOP]}]

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'macia-monument.ifc')
m.finish(out)
cut_path = os.path.splitext(out)[0] + '_cutouts.json'
json.dump({'cdeMeshCutouts': {'version': 1, 'anchor': {'lon': LON0, 'lat': LAT0, 'height': RAW0},
                              'note': 'Boxes in metres: s along bearing (deg clockwise from north), t to its left, z above the '
                                      'anchor height (the tileset anchor, before the scene placement offset).',
                              'boxes': CUTOUTS}}, open(cut_path, 'w'), indent=1)
print('written', out, len(m.f.by_type('IfcProduct')), 'products,', len(CUTOUTS), 'cut-outs ->', cut_path)
