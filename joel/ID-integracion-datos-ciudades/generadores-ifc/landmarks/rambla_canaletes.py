"""Capçalera de La Rambla — the Font de Canaletes and the kiosk beside it, as an authored IFC4X3 model.

What it holds, at the top of La Rambla (Rambla de Canaletes), next to Plaça de Catalunya:
  * the Font de Canaletes (OSM node 430607924, ref 01-051, operator Ajuntament de Barcelona): the cast-iron
    «font-fanal» designed by Pere Falqués (1889) and cast by Foneria Colomer, in place since 1892 — stone plinth,
    octagonal pedestal with four bronze spouts over four small basins, the small dog bowl at one corner, a fluted
    column, and the four-light lamp that crowns it (four arms, four glass lanterns, LED lamps); the drain grate
    around it, the supply riser and the buried service connection with its valve chamber and meter, and the
    floor plaque with the legend «qui beu de Canaletes…»;
  * the newspaper kiosk 18 m across the promenade (OSM node 691591931, shop=kiosk): base, frame, panels, counter,
    rolled-up front shutter, awning, roof, display racks with publications, lighting, door and service board;
  * street furniture: four of the Rambla's metal chairs, a litter bin, and two plane trees in cast-iron grates on
    the west tree row (OSM way 306557216);
  * the Rambla's paving over the places where this model replaces the photogrammetric mesh.

Detailed geometry (roughly LOD 400) carrying LOD 500-style asset data, so a click on any element shows what an
as-built asset register would hold. It is NOT the owners' as-built model and the asset values are invented:
every element says so in Pset_CDE_AssetManagement (demo) and Pset_CDE_Provenance.

What is real:
  * positions and orientation from OpenStreetMap (© OpenStreetMap contributors, ODbL): the fountain (node
    430607924), the kiosk (node 691591931), the Rambla's promenade (way 545937950), carriageways (ways 1360091606,
    920602948) and tree rows (ways 306557216, 306557217), from which the Rambla bearing here, 153.9°, is the mean
    (landmarks/rambla_canaletes_site.json);
  * the fountain's type, designer, foundry and date, its four spouts, four-light lamp and dog bowl (Wikipedia
    ca/en «Font de Canaletes»);
  * the pavement level from ICGC's photogrammetric Barcelona mesh: 64.51 m (ellipsoidal) at the fountain, 64.46 m
    at the kiosk.
What is estimated, not measured: every dimension of the fountain (proportions of the Falqués font-fanal as seen
in photographs, ~5.0 m to the finial), the kiosk (a typical Rambla kiosk, 3.6 × 2.3 × 2.8 m), the chairs, bin
and trees' positions along their rows, everything below the pavement, the plaque's position.

Local axes: +x east, +y north, metres, origin at the fountain (OSM node 430607924), z = 0 on its pavement, which
the ICGC mesh puts at 64.51 m ellipsoidal (≈ 14.81 m above the Alicante datum: EGM08 undulation ≈ 49.70 m).

Scene tiles: anchored at h = 64.51 (the raw, ellipsoidal mesh height) and linked with the same placement as the
ICGC mesh, ELLIPSOIDAL −49.70, so model and mesh move together if that offset is ever corrected.

usage: uv run --with ifcopenshell --with pyproj python landmarks/rambla_canaletes.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/rambla-canaletes.ifc src/rambla-canaletes_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/rambla-canaletes_qto.ifc \
           tiles/barcelona-rambla-canaletes 41.385161 2.170176 64.51 0 --keep-origin \
           --wfs tiles/wfs/barcelona-rambla-canaletes --wfs-name barcelona_rambla_canaletes_features \
           --extras src/rambla-canaletes_cutouts.json
"""
import json, math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model  # noqa: E402
from pyproj import Transformer  # noqa: E402

HERE = os.path.dirname(__file__)
SITE = json.load(open(os.path.join(HERE, 'rambla_canaletes_site.json'), encoding='utf-8'))
LAT0, LON0 = SITE['origin']['lat'], SITE['origin']['lon']
RAW0 = SITE['datum_raw_ellipsoidal']
ELEV0 = round(RAW0 + SITE['icgc_offset_m'], 2)          # ≈ orthometric (Alicante)
LV = {k: round(v - RAW0, 2) for k, v in SITE['levels_raw'].items()}
BEAR = SITE['rambla_bearing_deg']                        # down-Rambla, towards the port
BCN_CRS = (25831, 'ETRS89 / UTM zone 31N', 'ETRS89', 'Alicante (REDNAP)')

m = Model('Capçalera de La Rambla — Font de Canaletes', 'La Rambla de Canaletes, upper end',
          'Capçalera de La Rambla · Font i quiosc de Canaletes', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 model (≈LOD 400 geometry, LOD 500-style asset data with demo values). '
                      'Positions © OpenStreetMap contributors (ODbL); pavement level measured on the ICGC 3D mesh. '
                      'Not the owners\' as-built model.',
          tag_prefix='RCAN', crs=BCN_CRS, schema='IFC4X3_ADD2')

# The model's +y is true north; UTM grid north is not. Give the map conversion the grid direction of +x.
_tr = Transformer.from_crs(4326, 25831, always_xy=True)
_e0, _n0 = _tr.transform(LON0, LAT0)
_e1, _n1 = _tr.transform(LON0, LAT0 + 100 / 110574)
_alpha = math.atan2(_e1 - _e0, _n1 - _n0)              # grid azimuth of true north
_mc = m.f.by_type('IfcMapConversion')[0]
_mc.XAxisAbscissa, _mc.XAxisOrdinate = math.cos(_alpha), -math.sin(_alpha)

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('iron', 'Cast iron, painted very dark green', (0.10, 0.14, 0.11), 'Iron', 7200,
  'Grey cast iron, the dark green-black of Barcelona\'s 19th-century street furniture')
M('iron_grey', 'Cast iron, painted dark grey', (0.18, 0.18, 0.18), 'Iron', 7200)
M('bronze', 'Bronze, patinated', (0.52, 0.38, 0.17), 'Copper alloy', 8800, 'Spouts, push buttons and plaque')
M('granite', 'Granite, flamed finish, grey', (0.60, 0.59, 0.57), 'Stone', 2650, 'Plinth steps')
M('terrazzo', 'Hydraulic terrazzo paving, Rambla wave pattern', (0.82, 0.79, 0.73), 'Concrete', 2300,
  'The Rambla\'s undulating paving: grey, white and ochre')
M('lantern_glass', 'Lantern glass, frosted', (0.93, 0.91, 0.82), 'Glass', 2500, transparency=0.45)
M('led', 'LED lamp, warm white diffuser', (1.00, 0.94, 0.72), 'Plastic', 1200)
M('copper', 'Copper tube, EN 1057', (0.72, 0.45, 0.20), 'Copper', 8900)
M('pe', 'Polyethylene PE100, blue (potable water)', (0.13, 0.25, 0.60), 'Plastic', 960)
M('pvc', 'PVC-U sewer pipe, orange-brown', (0.70, 0.36, 0.16), 'Plastic', 1400)
M('concrete', 'Precast concrete C30/37', (0.70, 0.69, 0.66), 'Concrete', 2400)
M('brass', 'Dezincification-resistant brass', (0.78, 0.65, 0.30), 'Copper alloy', 8500)
M('kiosk', 'Steel sheet, powder-coated RAL 6009 fir green', (0.14, 0.24, 0.18), 'Steel', 7850)
M('kiosk_dark', 'Steel, powder-coated RAL 7021 black-grey', (0.15, 0.16, 0.17), 'Steel', 7850)
M('awning', 'Acrylic awning fabric, bottle green', (0.10, 0.30, 0.20), 'Textile', 300)
M('inox', 'Stainless steel AISI 304, brushed', (0.78, 0.79, 0.80), 'Steel', 8000)
M('plywood', 'Birch plywood, lacquered', (0.72, 0.58, 0.40), 'Wood', 680)
M('print', 'Printed paper (newspapers and magazines)', (0.86, 0.60, 0.42), 'Paper', 800)
M('sign_white', 'Opal acrylic sign face, white', (0.95, 0.95, 0.93), 'Plastic', 1190)
M('chair', 'Steel, powder-coated dark green', (0.16, 0.25, 0.19), 'Steel', 7850)
M('bin', 'Powder-coated steel, dark green-grey', (0.29, 0.33, 0.30), 'Steel', 7850)
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

    def polar(self, r, phi, z):
        """Point at radius r, angle phi (degrees from +s towards +t), height z."""
        a = math.radians(phi)
        return self.p3(r * math.cos(a), r * math.sin(a), z)

    def box(self, s0, s1, t0, t1, z0, h):
        cx, cy = self.P((s0 + s1) / 2, (t0 + t1) / 2)
        return m.box(cx, cy, self.z0 + z0, abs(s1 - s0), abs(t1 - t0), h, angle=self.ang)

    def cross(self, pts, s, width):
        """Polygon [(t, z)] in the vertical plane at s, `width` thick along s."""
        x, y = self.P(s, 0)
        return m.extrude_vertical_profile([(t, z) for t, z in pts], (x, y, self.z0), self.L, width)

    def ngon(self, r, n, z0, h, phase=0., s=0., t=0.):
        """Regular n-gon prism (vertices at radius r), centred at (s, t)."""
        pts = [self.P(s + r * math.cos(math.radians(phase + k * 360 / n)), t + r * math.sin(math.radians(phase + k * 360 / n)))
               for k in range(n)]
        return m.prism(pts, self.z0 + z0, h)

    def rev(self, rz, z0, s=0., t=0.):
        x, y = self.P(s, t)
        return m.revolve(rz, x, y, self.z0 + z0)


# ─── Mesh cut-outs ─────────────────────────────────────────────────────────────────────────────────
# The ICGC mesh already holds the real fountain and kiosk as photogrammetric lumps, and the IFC stands inside
# them. Each volume below is where this model *replaces* the mesh: the scene hides the ground mesh inside it while
# the model is shown (written to tileset.json `extras.cdeMeshCutouts`, read by CDE-Frontend). A 2.5D mesh has no
# ground under a lump, so where a cut leaves a hole the model lays the Rambla's paving over it (`patch=True`).
CUTOUTS = []
PATCH_TOP, CUT_FLOOR = 0.03, 0.06       # above each pavement: patch top, and where the cut starts
PATCH_MARGIN = 0.25                      # the patch overlaps the mesh around the cut, so no seam shows the terrain

# ─── Asset data ────────────────────────────────────────────────────────────────────────────────────
YEAR = {'fountain': 1892, 'spouts': 2018, 'lamp': 2021, 'services': 2018, 'meter': 2023, 'paving': 2020,
        'kiosk': 2008, 'furniture': 2016, 'tree': 1968}
WARRANTY_Y = {'fountain': 0, 'spouts': 5, 'lamp': 5, 'services': 10, 'meter': 5, 'paving': 10, 'kiosk': 10,
              'furniture': 5, 'tree': 2}
DATA_STATUS = 'Illustrative demo values — not the owner\'s as-built register'
_serial = {}


def _add_months(iso, months):
    y, mo, d = map(int, iso.split('-'))
    mo += months
    y, mo = y + (mo - 1) // 12, (mo - 1) % 12 + 1
    return f'{y:04d}-{mo:02d}-{min(d, 28):02d}'


def am(kind, interval_months, condition, owner, manufacturer, model, contractor, last='2026-07-08', **extra):
    """Pset_CDE_AssetManagement (demo): the fields an as-built asset register holds, with invented values."""
    code = {'fountain': 'FNT', 'spouts': 'FNT', 'lamp': 'ENL', 'services': 'AIG', 'meter': 'AIG', 'paving': 'PAV',
            'kiosk': 'KSK', 'furniture': 'MOB', 'tree': 'ARB'}[kind]
    n = _serial.get(code, 0) + 1
    _serial[code] = n
    y = YEAR[kind]
    w = WARRANTY_Y[kind]
    warranty = 'None (heritage asset, pre-dates warranties)' if w == 0 else \
        (f'{y + w}-12-31' + (' (expired)' if y + w < 2026 else ''))
    base = {'DataStatus': DATA_STATUS, 'AssetOwner': owner, 'Manufacturer': manufacturer, 'Model': model,
            'SerialNumber': f'BCN-{code}-01051-{n:03d}' if code in ('FNT', 'AIG', 'ENL') else f'BCN-{code}-RC-{n:03d}',
            'LifecycleStatus': 'In service', 'InstallationYear': y, 'LastInspection': last,
            'InspectionInterval_months': interval_months, 'NextInspection': _add_months(last, interval_months),
            'ConditionIndex_1to5': condition, 'WarrantyEnd': warranty, 'MaintenanceContractor': contractor,
            'MaintenanceStrategy': 'Condition-based' if kind != 'meter' else 'Time-based (meter replacement cycle)'}
    base.update({k: v for k, v in extra.items() if v is not None})
    return {'Pset_CDE_AssetManagement (demo)': base}


def spec(**props):
    return {'Pset_CDE_Specification': props}


def prov(src):
    return {'Pset_CDE_Provenance': {'GeometrySource': src[0], 'Confidence': src[1], 'Reference': src[2] if len(src) > 2 else None}}


AJ = 'Ajuntament de Barcelona (operator per OSM; register values are demo)'
AJ_PARKS = 'Ajuntament de Barcelona — parks and trees (demo)'
WATER = 'Water utility for municipal fountains (demo)'
KSK_OWNER = 'Kiosk licensee under a municipal concession (demo)'
CON_FNT = 'Demo contractor — fountains and heritage ironwork'
CON_LGT = 'Demo contractor — public lighting'
CON_WAT = 'Demo contractor — water networks'
CON_URB = 'Demo contractor — street furniture and paving'
CON_KSK = 'Demo contractor — kiosk maintenance'
CON_ARB = 'Demo contractor — urban arboriculture'
FOUNDRY = 'Foneria Colomer (original casting, 1892)'
FALQUES = 'Font-fanal, municipal model by Pere Falqués (1889)'

FNT_SRC = ('Proportions of the Falqués font-fanal estimated from photographs; position from OSM (ODbL)', 'Medium',
           'OSM node 430607924; Wikipedia ca/en «Font de Canaletes»; Wikimedia Commons «Category:Font de Canaletes»')
FNT_FACT = ('Element documented (four spouts, four-light lamp, dog bowl); its dimensions estimated', 'Medium',
            'Wikipedia ca «Font de Canaletes»: ferro colat, quatre brolladors, fanal de quatre llums, font per als gossos')
KSK_SRC = ('Typical Rambla newspaper kiosk; position from OSM (ODbL), long axis along the Rambla tree row', 'Low',
           'OSM node 691591931 (shop=kiosk), way 306557217')
TYP_SRC = ('Typical dimensions and detailing; position illustrative, chosen on the Rambla\'s tree row', 'Low',
           'OSM way 306557216 (tree row) for the line; no OSM node for this object')
BELOW_SRC = ('Below the pavement: not visible in any open source; typical for a Barcelona public fountain', 'Low')
OSM_GEO = ('Rambla geometry from OSM (ODbL); pavement level from the ICGC 3D mesh', 'Medium',
           'OSM ways 545937950, 1360091606, 920602948, 306557216, 306557217; ICGC Barcelona mesh')

# ─── Spatial structure ─────────────────────────────────────────────────────────────────────────────
STREET = 'Passeig central de La Rambla · Promenade level'
m.storey(STREET, 0., 'The central promenade of La Rambla de Canaletes, at the fountain\'s pavement')

F = Frame((0., 0.), BEAR, LV['fountain'])                        # s down-Rambla, t towards the promenade centre
KS = SITE['kiosk']
K = Frame((KS['x'], KS['y']), BEAR, LV['kiosk'])                 # t− faces the promenade (west-south-west)


def cutout(frame, name, s, t, z, patch=False, margin=PATCH_MARGIN, label=None):
    """Register a cut-out box in a plan frame: s, t ranges; z range relative to the frame's z0."""
    x, y = frame.P(0, 0)
    lon = LON0 + x / (111320 * math.cos(math.radians(LAT0)))
    lat = LAT0 + y / 110574
    CUTOUTS.append({'name': name, 'lon': round(lon, 8), 'lat': round(lat, 8), 'bearing': round(math.degrees(math.atan2(*frame.u)), 3),
                    's': [round(v, 3) for v in s], 't': [round(v, 3) for v in t],
                    'z': [round(frame.z0 + v, 3) for v in z]})
    if patch:
        m.element('IfcSlab', f'Paviment de la Rambla · Paving patch ({label or name})',
                  frame.box(s[0] - margin, s[1] + margin, t[0] - margin, t[1] + margin, PATCH_TOP - 0.10, 0.10),
                  STREET, 'terrazzo', predefined='PAVING',
                  object_type='Rambla wave-pattern terrazzo over the cut-out (covers the mesh where this model replaces it)',
                  src=OSM_GEO, common={'LoadBearing': False},
                  psets={**spec(Purpose='Visual: replaces the photogrammetric ground under modelled objects',
                                Pattern='Undulating «ones» terrazzo, 3 colours', Thickness_mm=60, Bedding='Mortar on concrete base'),
                         **am('paving', 12, 4, AJ, 'Demo terrazzo manufacturer', 'Hydraulic terrazzo 40×40, Rambla wave', CON_URB)})


# ═══ 1. Font de Canaletes ═════════════════════════════════════════════════════════════════════════
fnt = m.assembly('Font de Canaletes', STREET, object_type='Drinking fountain with four-light lamp (font-fanal)',
                 description='«Qui beu aigua de Canaletes, torna a Barcelona.» Meeting point of FC Barcelona supporters since the 1930s.',
                 psets={**spec(OSMNode=430607924, InventoryRef='01-051', Wikidata='Q2723971', Designer='Pere Falqués',
                               DesignYear=1889, Foundry='Foneria Colomer', InPlaceSince=1892, Spouts=4, Lights=4,
                               DogBowl=True, PotableWater=True, HeritageStatus='Municipal heritage (demo — not checked)',
                               OverallHeight_m=5.0),
                        **am('fountain', 6, 4, AJ, FOUNDRY, FALQUES, CON_FNT, LastRepaint='2019-05 (demo)'),
                        **prov(FNT_SRC)})
SPOUT_PHI = (0., 90., 180., 270.)         # spouts and basins: up-/down-Rambla and across
LAMP_PHI = (45., 135., 225., 315.)        # lamp arms on the diagonals
DOG_PHI = 225.                            # the dog bowl, at one corner of the plinth

# plinth: two octagonal granite steps
m.element('IfcSlab', 'Sòcol de pedra · Granite plinth (two steps)',
          [F.ngon(0.82, 8, -0.06, 0.18, 22.5), F.ngon(0.64, 8, 0.12, 0.10, 22.5)], STREET, 'granite', predefined='BASESLAB',
          object_type='Octagonal granite plinth, two steps', parent=fnt, src=FNT_SRC, common={'LoadBearing': True},
          psets={**spec(Steps=2, Width_mm=1520, Height_mm=220), **am('fountain', 12, 4, AJ, 'Demo stonemason', 'Granite plinth', CON_FNT)})

# drain grate around the plinth
G_OUT, G_IN = 0.98, 0.80
gr = [F.box(-G_OUT, G_OUT, t - 0.02, t + 0.02, -0.02, 0.055) for t in (-G_OUT + 0.02, G_OUT - 0.02, -G_IN - 0.02, G_IN + 0.02)]
gr += [F.box(s - 0.02, s + 0.02, -G_OUT, G_OUT, -0.02, 0.055) for s in (-G_OUT + 0.02, G_OUT - 0.02, -G_IN - 0.02, G_IN + 0.02)]
k = -G_OUT + 0.08
while k < G_OUT - 0.06:
    for side in (-1, 1):
        gr.append(F.box(k - 0.012, k + 0.012, side * G_IN, side * G_OUT, -0.02, 0.05))
        if abs(k) < G_IN:
            gr.append(F.box(side * G_IN, side * G_OUT, k - 0.012, k + 0.012, -0.02, 0.05))
    k += 0.08
m.element('IfcWasteTerminal', 'Reixa de desguàs · Drain grate around the plinth', gr, STREET, 'iron_grey', predefined='GULLYTRAP',
          object_type='Cast-iron slotted grate 180 mm over a perimeter channel', parent=fnt, src=FNT_SRC,
          psets={**spec(Width_mm=180, Class='C250 (EN 124)', Outlet='Combined sewer, see drain pipe'),
                 **am('services', 3, 3, AJ, 'Demo foundry', 'Slotted perimeter grate 180', CON_URB, Note='Silt and coins in the channel (demo)')})

# pedestal: octagonal cast-iron body with base and cornice mouldings
m.element('IfcBuildingElementProxy', 'Pedestal de fosa · Cast-iron pedestal',
          [F.ngon(0.50, 8, 0.22, 0.10, 22.5), F.ngon(0.45, 8, 0.32, 0.08, 22.5), F.ngon(0.40, 8, 0.40, 0.66, 22.5),
           F.ngon(0.44, 8, 1.06, 0.05, 22.5), F.ngon(0.48, 8, 1.11, 0.05, 22.5)],
          STREET, 'iron', predefined='USERDEFINED', object_type='Octagonal cast-iron pedestal housing the riser', parent=fnt,
          src=FNT_SRC, psets={**spec(Height_mm=940, AccessPanel='Bolted panel on the up-Rambla face'),
                              **am('fountain', 6, 4, AJ, FOUNDRY, FALQUES, CON_FNT)})

# four basins and four bronze spouts
BOWL = [(0., 0.), (0.10, 0.), (0.19, 0.10), (0.21, 0.15), (0.18, 0.15), (0.09, 0.045), (0., 0.045)]
for k, phi in enumerate(SPOUT_PHI, 1):
    side = {0.: 'down-Rambla', 90.: 'promenade side', 180.: 'up-Rambla', 270.: 'carriageway side'}[phi]
    a = math.radians(phi)
    bs, bt = 0.50 * math.cos(a), 0.50 * math.sin(a)
    m.element('IfcSanitaryTerminal', f'Pica {k} · Basin {k} ({side})', [F.rev(BOWL, 0.52, bs, bt), F.rev([(0., 0.), (0.05, 0.), (0.03, 0.10), (0., 0.10)], 0.42, bs, bt)],
              STREET, 'iron', predefined='SINK', object_type='Small cast-iron basin on a corbel, drains to the channel', parent=fnt,
              src=FNT_FACT, psets={**spec(Capacity_l=1.5, Drain='Free fall to the perimeter channel'),
                                   **am('fountain', 6, 4, AJ, FOUNDRY, FALQUES, CON_FNT)})
    sp = [disc(F.polar(0.405, phi, 0.95), F.v3(math.cos(a), math.sin(a), 0), 0.075, 0.02),      # lion-mask boss
          rod(F.polar(0.40, phi, 0.93), F.polar(0.52, phi, 0.91), 0.018),
          rod(F.polar(0.52, phi, 0.91), F.polar(0.54, phi, 0.85), 0.014),
          disc(F.polar(0.44, phi, 0.965), (0., 0., 1.), 0.022, 0.03)]                              # push button
    m.element('IfcSanitaryTerminal', f'Brollador {k} · Spout {k} ({side})', sp, STREET, 'bronze', predefined='SANITARYFOUNTAIN',
              object_type='Bronze push-button drinking spout, self-closing', parent=fnt, src=FNT_FACT,
              psets={**spec(Operation='Push button, timed self-closing valve', FlowRate_l_min=4.0, Height_above_basin_mm=330),
                     **am('spouts', 3, 3 if k == 2 else 4, AJ, 'Demo bronze foundry', 'Self-closing push spout, bronze',
                          CON_FNT, Note='Button sticks, cartridge on order (demo)' if k == 2 else None)})

# the dog bowl at one corner
a = math.radians(DOG_PHI)
ds, dt = 0.70 * math.cos(a), 0.70 * math.sin(a)
m.element('IfcSanitaryTerminal', 'Abeurador per a gossos · Dog bowl',
          [F.rev([(0., 0.), (0.12, 0.), (0.16, 0.09), (0.13, 0.09), (0.10, 0.03), (0., 0.03)], 0.22, ds, dt),
           rod(F.polar(0.46, DOG_PHI, 0.40), F.polar(0.62, DOG_PHI, 0.36), 0.012)],
          STREET, 'iron', predefined='USERDEFINED', object_type='Low drinking bowl for dogs with its own spout', parent=fnt,
          src=FNT_FACT, psets={**spec(Height_mm=310, Supply='Branch from the riser, always-on trickle (demo)'),
                               **am('spouts', 6, 4, AJ, FOUNDRY, FALQUES, CON_FNT)})

# column: base moulding, fluted shaft with a collar, capital
FLUTES = 20
star = []
for kk in range(2 * FLUTES):
    r = 0.150 if kk % 2 == 0 else 0.132
    ph = math.radians(kk * 180 / FLUTES)
    star.append(F.P(r * math.cos(ph), r * math.sin(ph)))
col = [F.rev([(0., 0.), (0.30, 0.), (0.30, 0.06), (0.24, 0.12), (0.24, 0.18), (0.18, 0.30), (0.18, 0.36), (0., 0.36)], 1.16),
       m.prism(star, F.z0 + 1.52, 1.90),
       F.rev([(0., 0.), (0.175, 0.), (0.185, 0.03), (0.175, 0.07), (0., 0.07)], 2.42),
       F.rev([(0., 0.), (0.17, 0.), (0.17, 0.05), (0.22, 0.12), (0.30, 0.24), (0.30, 0.30), (0.12, 0.35), (0., 0.35)], 3.42)]
m.element('IfcColumn', 'Columna estriada · Fluted column', col, STREET, 'iron', predefined='USERDEFINED',
          object_type='Fluted cast-iron column with base moulding, collar and capital', parent=fnt, src=FNT_SRC,
          common={'LoadBearing': False},
          psets={**spec(Flutes=FLUTES, ShaftDiameter_mm=300, Height_mm=2610), **am('fountain', 12, 4, AJ, FOUNDRY, FALQUES, CON_FNT)})

# the four-light lamp
lamp = m.assembly('Fanal de quatre llums · Four-light lamp', None, object_type='Lamp crowning the fountain', parent=fnt,
                  psets={**spec(Lights=4, Control='Street-lighting circuit, astronomical clock', Retrofit='LED, 2021 (demo)'),
                         **am('lamp', 12, 4, AJ, FOUNDRY, FALQUES, CON_LGT), **prov(FNT_FACT)})
m.element('IfcMember', 'Fust del fanal i coronament · Lamp shaft and finial',
          [F.rev([(0., 0.), (0.11, 0.), (0.085, 0.50), (0.075, 0.80), (0., 0.80)], 3.77),
           F.rev([(0., 0.), (0.13, 0.), (0.13, 0.08), (0., 0.08)], 4.22),
           F.rev([(0., 0.), (0.10, 0.), (0.12, 0.05), (0.05, 0.16), (0.035, 0.32), (0.0, 0.44)], 4.57)],
          STREET, 'iron', predefined='POST', object_type='Tapered lamp shaft with arm boss and finial', parent=lamp, src=FNT_SRC,
          psets={**spec(Height_mm=1240), **am('fountain', 12, 4, AJ, FOUNDRY, FALQUES, CON_LGT)})
LR = 0.62
arms = []
for phi in LAMP_PHI:
    arms += [rod(F.polar(0.06, phi, 4.27), F.polar(0.36, phi, 4.40), 0.024),
             rod(F.polar(0.36, phi, 4.40), F.polar(LR, phi, 4.42), 0.024),
             rod(F.polar(0.07, phi, 4.02), F.polar(0.30, phi, 4.12), 0.014),
             rod(F.polar(0.30, phi, 4.12), F.polar(0.46, phi, 4.39), 0.014)]
m.element('IfcMember', 'Braços del fanal · Lamp arms', arms, STREET, 'iron', predefined='USERDEFINED',
          object_type='Four cast-iron arms with scroll braces', parent=lamp, src=FNT_FACT,
          psets={**spec(Arms=4, Reach_mm=620), **am('fountain', 12, 4, AJ, FOUNDRY, FALQUES, CON_LGT)})
for k, phi in enumerate(LAMP_PHI, 1):
    a = math.radians(phi)
    ls, lt = LR * math.cos(a), LR * math.sin(a)
    m.element('IfcLightFixture', f'Lanterna {k} · Lantern {k}',
              [F.rev([(0., 0.), (0.10, 0.), (0.145, 0.36), (0., 0.36)], 4.50, ls, lt)], STREET, 'lantern_glass',
              predefined='POINTSOURCE', object_type='Glass lantern, inverted frustum', parent=lamp, src=FNT_FACT,
              psets={**spec(IngressProtection='IP54', Glazing='Frosted toughened glass'),
                     **am('lamp', 12, 2 if k == 3 else 4, AJ, 'Demo heritage-lantern maker', 'Lantern, Falqués pattern, replica glass',
                          CON_LGT, Note='Cracked pane, temporary film applied (demo)' if k == 3 else None)})
    m.element('IfcMember', f'Cos de la lanterna {k} · Lantern frame {k}',
              [F.rev([(0., 0.), (0.06, 0.), (0.10, 0.08), (0., 0.08)], 4.42, ls, lt),
               F.rev([(0., 0.), (0.18, 0.), (0.16, 0.04), (0.06, 0.13), (0.02, 0.17), (0., 0.17)], 4.86, ls, lt),
               rod(F.p3(ls, lt, 5.03), F.p3(ls, lt, 5.09), 0.012)] +
              [rod(F.p3(ls + 0.10 * math.cos(b), lt + 0.10 * math.sin(b), 4.50), F.p3(ls + 0.145 * math.cos(b), lt + 0.145 * math.sin(b), 4.86), 0.008)
               for b in [math.radians(45 + 90 * j) for j in range(4)]],
              STREET, 'iron', predefined='USERDEFINED', object_type='Lantern cup, corner ribs and cap', parent=lamp, src=FNT_FACT,
              psets=am('lamp', 12, 4, AJ, 'Demo heritage-lantern maker', 'Lantern, Falqués pattern', CON_LGT))
    m.element('IfcLamp', f'Làmpada LED {k} · LED lamp {k}', [m.sphere(*F.p3(ls, lt, 4.68), 0.05, n=8)], STREET, 'led',
              predefined='LED', object_type='LED retrofit lamp 25 W, 2700 K', parent=lamp, src=TYP_SRC,
              psets={**spec(Power_W=25, ColourTemperature_K=2700, LuminousFlux_lm=2600, Driver='DALI, dimmed 50 % after 01:00'),
                     **am('lamp', 12, 5 if k != 3 else 4, AJ, 'Demo LED manufacturer', 'LED retrofit E27 25 W', CON_LGT,
                          BurningHours=19800 + 37 * k)})

# floor plaque with the legend
m.element('IfcSign', 'Placa de la llegenda · Floor plaque', F.box(-0.30, 0.30, 1.30, 1.70, -0.01, 0.045), STREET, 'bronze',
          predefined='MARKER', object_type='Bronze plaque set in the paving', parent=fnt,
          src=('Plaque documented («as the inscription on the floor suggests»); position and size illustrative', 'Low',
               'Wikipedia en «Font de Canaletes»'),
          psets={**spec(Text='The legend of drinking from Canaletes and returning to Barcelona (text not transcribed here)'),
                 **am('fountain', 12, 4, AJ, 'Demo bronze foundry', 'Cast bronze plaque', CON_FNT)})

# water supply and drainage
svc = m.assembly('Escomesa d\'aigua i desguàs · Water service and drain', None, object_type='Fountain services', parent=fnt,
                 psets={**spec(Network='Municipal potable water', ServicePressure_bar=3.5, Drain='Combined sewer'),
                        **am('services', 12, 4, WATER, 'Demo pipe manufacturer', 'Service connection DN32', CON_WAT),
                        **prov(BELOW_SRC)})
CH = (-1.75, 0.95)                                    # valve chamber, up-Rambla, promenade side
m.element('IfcPipeSegment', 'Muntant interior · Riser inside the pedestal',
          [rod(F.p3(0, 0, -0.75), F.p3(0, 0, 0.86), 0.014), rod(F.p3(-0.03, 0, 0.86), F.p3(0.03, 0, 0.86), 0.014)] +
          [rod(F.p3(0, 0, 0.86), F.polar(0.40, phi, 0.93), 0.009) for phi in SPOUT_PHI] +
          [rod(F.p3(0, 0, 0.30), F.polar(0.46, DOG_PHI, 0.40), 0.008)],
          STREET, 'copper', predefined='RIGIDSEGMENT', object_type='Copper riser Ø28 with branches Ø18 to the spouts',
          parent=svc, src=BELOW_SRC, psets={**spec(Diameter_mm=28, Branches=5, Insulation='None (frost-free climate)'),
                                            **am('services', 24, 4, WATER, 'Demo pipe manufacturer', 'Copper EN 1057 28×1', CON_WAT)})
m.element('IfcPipeSegment', 'Escomesa soterrada · Buried service pipe',
          [rod(F.p3(CH[0], CH[1], -0.75), F.p3(0, 0, -0.75), 0.020)], STREET, 'pe', predefined='RIGIDSEGMENT',
          object_type='PE100 DN32 PN16 service pipe in sand bedding', parent=svc, src=BELOW_SRC,
          psets={**spec(Diameter_mm=32, PressureRating='PN16', Depth_m=0.75), **am('services', 24, 4, WATER, 'Demo pipe manufacturer', 'PE100 SDR11 DN32', CON_WAT)})
m.element('IfcPipeSegment', 'Desguàs de la canal · Channel drain pipe',
          [rod(F.p3(-0.89, 0, -0.10), F.p3(-0.89, 0, -0.45), 0.055), rod(F.p3(-0.89, 0, -0.45), F.p3(-0.89, -4.80, -1.10), 0.055)],
          STREET, 'pvc', predefined='RIGIDSEGMENT', object_type='PVC-U DN110 drain to the carriageway sewer', parent=svc, src=BELOW_SRC,
          psets={**spec(Diameter_mm=110, Gradient_pct=13), **am('services', 24, 4, AJ, 'Demo pipe manufacturer', 'PVC-U SN8 DN110', CON_URB)})
cx, cy = F.P(*CH)
m.element('IfcDistributionChamberElement', 'Arqueta de clau i comptador · Valve and meter chamber',
          [F.box(CH[0] - 0.30, CH[0] + 0.30, CH[1] - 0.30, CH[1] - 0.24, -0.95, 0.92), F.box(CH[0] - 0.30, CH[0] + 0.30, CH[1] + 0.24, CH[1] + 0.30, -0.95, 0.92),
           F.box(CH[0] - 0.30, CH[0] - 0.24, CH[1] - 0.24, CH[1] + 0.24, -0.95, 0.92), F.box(CH[0] + 0.24, CH[0] + 0.30, CH[1] - 0.24, CH[1] + 0.24, -0.95, 0.92),
           F.box(CH[0] - 0.30, CH[0] + 0.30, CH[1] - 0.30, CH[1] + 0.30, -1.03, 0.08)],
          STREET, 'concrete', predefined='VALVECHAMBER', object_type='Precast chamber 600 × 600, 950 deep', parent=svc, src=BELOW_SRC,
          psets={**spec(InnerSize_mm='480 × 480', Depth_mm=950), **am('services', 12, 4, WATER, 'Demo precast plant', 'Chamber 60×60', CON_WAT)})
m.element('IfcCovering', 'Tapa de l\'arqueta · Chamber cover',
          [F.box(CH[0] - 0.30, CH[0] + 0.30, CH[1] - 0.30, CH[1] + 0.30, -0.03, 0.065)], STREET, 'iron_grey', predefined='USERDEFINED',
          object_type='Ductile-iron cover 600 × 600, B125, marked «AIGUA»', parent=svc, src=TYP_SRC,
          psets={**spec(Class='B125 (EN 124)', Locking='Triangular key'), **am('services', 12, 4, WATER, 'Demo foundry', 'Cover 60×60 B125', CON_WAT)})
m.element('IfcValve', 'Clau de pas · Isolating valve', [rod(F.p3(CH[0] - 0.12, CH[1], -0.75), F.p3(CH[0] + 0.0, CH[1], -0.75), 0.04),
                                                       rod(F.p3(CH[0] - 0.06, CH[1], -0.75), F.p3(CH[0] - 0.06, CH[1], -0.45), 0.012)],
          STREET, 'brass', predefined='ISOLATING', object_type='Ball valve DN32 with square-key spindle', parent=svc, src=BELOW_SRC,
          psets={**spec(NominalDiameter_mm=32, Operation='Square key from the surface'), **am('services', 12, 4, WATER, 'Demo valve maker', 'Ball valve DN32 PN16', CON_WAT)})
m.element('IfcFlowMeter', 'Comptador d\'aigua · Water meter', [F.box(CH[0] + 0.02, CH[0] + 0.20, CH[1] - 0.07, CH[1] + 0.07, -0.82, 0.14)],
          STREET, 'brass', predefined='WATERMETER', object_type='Ultrasonic water meter DN25 with radio read-out', parent=svc, src=BELOW_SRC,
          psets={**spec(NominalFlow_m3_h=4.0, Reading_m3=8412.6, ReadingDate='2026-09-30', Telemetry='Radio, daily read'),
                 **am('meter', 12, 5, WATER, 'Demo meter manufacturer', 'Ultrasonic DN25 Q3=4', CON_WAT, Consumption_m3_30d=212.4)})

cutout(F, 'Font de Canaletes', (-1.05, 1.05), (-1.05, 1.05), (CUT_FLOOR, 5.6), patch=True, margin=1.0, label='fountain')

# ═══ 2. Newspaper kiosk ═══════════════════════════════════════════════════════════════════════════
KO = (KSK_OWNER, 'Demo kiosk fabricator', 'Rambla newspaper kiosk, steel, 3.6 × 2.3 m', CON_KSK)
ksk = m.assembly('Quiosc de premsa · Newspaper kiosk', STREET, object_type='Newspaper and magazine kiosk on public space',
                 psets={**spec(OSMNode=691591931, Use='Newspapers, magazines, souvenirs', Footprint_mm='3 600 × 2 300',
                               Height_mm=2800, OpeningHours='08:00–22:00 (demo)', Concession='Municipal licence (demo number LQ-01-0137)'),
                        **am('kiosk', 12, 4, *KO), **prov(KSK_SRC)})
m.element('IfcSlab', 'Bancada del quiosc · Kiosk base', K.box(-1.80, 1.80, -1.15, 1.15, -0.02, 0.14), STREET, 'kiosk_dark',
          predefined='BASESLAB', object_type='Steel base frame with chequer floor', parent=ksk, src=KSK_SRC, common={'LoadBearing': True},
          psets={**spec(Anchoring='Four chemical anchors'), **am('kiosk', 24, 4, *KO)})
m.element('IfcColumn', 'Muntants de cantonada · Corner posts',
          [K.box(s - 0.04, s + 0.04, t - 0.04, t + 0.04, 0.12, 2.28) for s in (-1.71, 1.71) for t in (-1.06, 1.06)],
          STREET, 'kiosk_dark', predefined='COLUMN', object_type='SHS 80×80×4', parent=ksk, src=KSK_SRC,
          psets=am('kiosk', 24, 4, *KO))
m.element('IfcPlate', 'Panells de tancament · Enclosure panels',
          [K.box(-1.67, 1.67, 1.06, 1.10, 0.12, 2.28),                                          # rear
           K.box(-1.75, -1.71, -1.02, 1.02, 0.12, 2.28), K.box(1.71, 1.75, -1.02, 1.02, 0.12, 2.28),  # ends
           K.box(-1.67, 1.67, -1.10, -1.06, 0.12, 0.76)],                                        # front, below the counter
          STREET, 'kiosk', predefined='SHEET', object_type='Insulated steel sandwich panel 40 mm, RAL 6009', parent=ksk, src=KSK_SRC,
          psets={**spec(Thickness_mm=40), **am('kiosk', 12, 3, *KO, Note='Graffiti on the rear panel, cleaning booked (demo)')})
m.element('IfcPlate', 'Frontis superior · Front fascia', K.box(-1.75, 1.75, -1.13, -1.06, 2.06, 0.34), STREET, 'kiosk',
          predefined='SHEET', object_type='Fascia panel above the opening', parent=ksk, src=KSK_SRC, psets=am('kiosk', 12, 4, *KO))
m.element('IfcShadingDevice', 'Persiana enrotllable · Roller shutter (open)', K.box(-1.65, 1.65, -1.06, -0.88, 1.88, 0.18),
          STREET, 'kiosk_dark', predefined='SHUTTER', object_type='Galvanised roller shutter, rolled up in its box', parent=ksk,
          src=KSK_SRC, psets={**spec(Operation='Electric, with manual override', Width_mm=3300),
                              **am('kiosk', 6, 4, *KO, MotorCycles=4210)})
m.element('IfcFurniture', 'Taulell · Counter', K.box(-1.68, 1.68, -1.32, -0.86, 0.76, 0.04), STREET, 'inox', predefined='USERDEFINED',
          object_type='Stainless counter, folding front flap', parent=ksk, src=KSK_SRC, psets=am('kiosk', 12, 4, *KO))
sh = [K.box(-1.62, 1.62, 0.76, 1.04, z, 0.02) for z in (0.55, 0.95, 1.35, 1.75)] + \
     [K.box(s - 0.01, s + 0.01, 0.76, 1.04, 0.14, 1.85) for s in (-1.62, -0.54, 0.54, 1.62)]
m.element('IfcFurniture', 'Prestatgeria interior · Rear shelving', sh, STREET, 'plywood', predefined='SHELF',
          object_type='Plywood shelving on the rear wall', parent=ksk, src=KSK_SRC, psets=am('kiosk', 24, 4, *KO))
pubs = []
for side in (-1, 1):
    rack = []
    s0 = side * 1.75
    for j, z in enumerate((0.45, 0.80, 1.15, 1.50, 1.85)):
        rack.append(K.box(s0 + side * 0.0, s0 + side * 0.20, -0.95, 0.95, z, 0.015))
        rack.append(K.box(s0 + side * 0.18, s0 + side * 0.20, -0.95, 0.95, z, 0.08))
        for c in range(6):
            t0 = -0.92 + c * 0.31
            pubs.append(K.box(s0 + side * 0.03, s0 + side * 0.16, t0, t0 + 0.27, z + 0.015, 0.30 if j < 4 else 0.22))
    rack += [K.box(s0, s0 + side * 0.20, t - 0.012, t + 0.012, 0.40, 1.70) for t in (-0.96, 0.96)]
    m.element('IfcFurniture', f'Expositor lateral · Display rack ({"up" if side < 0 else "down"}-Rambla end)', rack, STREET,
              'kiosk_dark', predefined='SHELF', object_type='Five-tier steel magazine rack on the end wall', parent=ksk, src=KSK_SRC,
              psets=am('kiosk', 12, 4, *KO))
for c in range(10):
    s0 = -1.60 + c * 0.32
    pubs.append(K.box(s0, s0 + 0.28, -1.28, -0.90, 0.80, 0.02 + 0.01 * (c % 3)))
m.element('IfcBuildingElementProxy', 'Publicacions exposades · Publications on display', pubs, STREET, 'print',
          predefined='USERDEFINED', object_type='Newspapers and magazines (stock, not an asset)', parent=ksk, src=KSK_SRC,
          psets={**spec(Note='Stock changes daily; modelled to show the kiosk open'),
                 **am('kiosk', 1, 5, *KO, Note='Stock, not a fixed asset: values for illustration only')})
m.element('IfcRoof', 'Coberta del quiosc · Kiosk roof',
          [K.box(-2.00, 2.00, -1.42, 1.35, 2.40, 0.10),
           m.frustum(*K.P(0, -0.03), K.z0 + 2.50, 3.90, 2.67, 0.30, 0.95, angle=K.ang)],
          STREET, 'kiosk', predefined='FLAT_ROOF', object_type='Steel roof with overhang and low hipped cap', parent=ksk, src=KSK_SRC,
          psets={**spec(Overhang_mm=250, Drainage='Edge drip, no gutter'), **am('kiosk', 12, 4, *KO)})
m.element('IfcShadingDevice', 'Tendal · Awning',
          [K.cross([(-1.13, 2.30), (-1.13, 2.36), (-2.10, 2.05), (-2.10, 1.99)], 0., 3.50), K.box(-1.75, 1.75, -2.12, -2.08, 1.80, 0.25)],
          STREET, 'awning', predefined='AWNING', object_type='Fixed acrylic awning with valance, over the counter', parent=ksk, src=KSK_SRC,
          psets={**spec(Projection_mm=970, Fabric='Solution-dyed acrylic 300 g/m², flame-retardant M2'), **am('kiosk', 12, 4, *KO)})
m.element('IfcMember', 'Braços del tendal · Awning arms',
          [rod(K.p3(s, -1.10, 1.95), K.p3(s, -2.08, 2.02), 0.015) for s in (-1.62, 0.0, 1.62)], STREET, 'kiosk_dark',
          predefined='STRUT', object_type='Awning struts Ø30', parent=ksk, src=KSK_SRC, psets=am('kiosk', 24, 4, *KO))
m.element('IfcSign', 'Rètol «PREMSA» · Fascia sign', K.box(-1.20, 1.20, -1.15, -1.13, 2.12, 0.22), STREET, 'sign_white',
          predefined='PICTORAL', object_type='Back-lit fascia sign (text illustrative)', parent=ksk, src=KSK_SRC,
          psets={**spec(Text='PREMSA · PRENSA · PRESS (illustrative)'), **am('kiosk', 12, 5, *KO)})
m.element('IfcLightFixture', 'Lluminària del tendal · Awning light', K.box(-1.50, 1.50, -1.25, -1.18, 2.24, 0.03), STREET, 'led',
          predefined='DIRECTIONSOURCE', object_type='LED strip 36 W under the awning', parent=ksk, src=KSK_SRC,
          psets={**spec(Power_W=36), **am('kiosk', 12, 5, *KO)})
dr = m.element('IfcDoor', 'Porta posterior · Rear door', K.box(-0.40, 0.40, 1.10, 1.13, 0.14, 1.96), STREET, 'kiosk',
               predefined='DOOR', object_type='Steel door 800 × 1 960 with multipoint lock', parent=ksk, src=KSK_SRC,
               psets=am('kiosk', 12, 4, *KO))
dr.OperationType, dr.OverallWidth, dr.OverallHeight = 'SINGLE_SWING_LEFT', 0.8, 1.96
m.element('IfcElectricDistributionBoard', 'Quadre elèctric · Service board', K.box(1.15, 1.55, 1.10, 1.28, 0.14, 0.85), STREET,
          'kiosk_dark', predefined='DISTRIBUTIONBOARD', object_type='Supply pillar with meter and RCD, 5.75 kW', parent=ksk, src=KSK_SRC,
          psets={**spec(ContractedPower_kW=5.75, Supply='Single-phase 230 V from the street-lighting network (demo)'),
                 **am('kiosk', 12, 4, KSK_OWNER, 'Demo switchgear maker', 'Outdoor pillar IP55', CON_KSK)})

cutout(K, 'newspaper kiosk', (-2.10, 2.10), (-2.25, 1.45), (CUT_FLOOR, 3.4), patch=True, label='kiosk')

# ═══ 3. Street furniture and trees ════════════════════════════════════════════════════════════════
furn = m.assembly('Mobiliari urbà · Street furniture', STREET, object_type='Street furniture',
                  psets={**am('furniture', 12, 4, AJ, 'Demo street-furniture maker', 'Barcelona standard range', CON_URB), **prov(TYP_SRC)})


def chair(n, s, t):
    """A Rambla chair facing +t (towards the promenade centre)."""
    C = Frame(F.P(s, t), BEAR, F.z0)
    it = [rod(C.p3(ds, dt, 0.0), C.p3(ds * 0.95, dt * 0.95, 0.44), 0.012) for ds in (-0.21, 0.21) for dt in (-0.21, 0.21)]
    it += [C.box(-0.23, 0.23, -0.22, 0.22, 0.44, 0.02)]
    it += [C.box(-0.23, 0.23, dt - 0.02, dt + 0.02, 0.43, 0.012) for dt in (-0.15, -0.05, 0.05, 0.15)]       # seat slats
    for ds in (-0.21, 0.21):
        it += [rod(C.p3(ds, -0.21, 0.44), C.p3(ds, -0.25, 0.86), 0.011),                                       # back posts
               rod(C.p3(ds, -0.21, 0.66), C.p3(ds, 0.16, 0.66), 0.010), rod(C.p3(ds, 0.16, 0.66), C.p3(ds, 0.16, 0.45), 0.010)]
    it += [C.cross([(-0.235 + 0.01 * k, 0.56 + 0.10 * k), (-0.225 + 0.01 * k, 0.56 + 0.10 * k), (-0.225 + 0.01 * k, 0.62 + 0.10 * k),
                    (-0.235 + 0.01 * k, 0.62 + 0.10 * k)], 0., 0.44) for k in range(3)]                       # back slats
    m.element('IfcFurniture', f'Cadira de la Rambla {n} · Rambla chair {n}', it, STREET, 'chair', predefined='CHAIR',
              object_type='Individual steel chair with arms, slatted seat and back, bolted to the paving', parent=furn, src=TYP_SRC,
              psets={**spec(SeatHeight_mm=440, Width_mm=460, Fixing='Two M10 anchors per leg pair'),
                     **am('furniture', 6, 4 if n != 3 else 3, AJ, 'Demo street-furniture maker', 'Rambla chair, steel', CON_URB,
                          Note='Loose anchor, re-fixing scheduled (demo)' if n == 3 else None)})


for n, s in enumerate((-5.0, -4.2, -3.4, -2.6), 1):
    chair(n, s, 1.75)

BIN = F.P(3.2, 0.55)
m.element('IfcFurniture', 'Paperera · Litter bin',
          [m.cylinder(BIN[0], BIN[1], F.z0, 0.03, 0.95), m.tube(*F.P(3.2, 0.79), F.z0 + 0.32, 0.21, 0.19, 0.62),
           m.cylinder(*F.P(3.2, 0.79), F.z0 + 0.32, 0.19, 0.02)], STREET, 'bin', predefined='USERDEFINED',
          object_type='Litter bin 60 l on post', parent=furn, src=TYP_SRC,
          psets={**spec(Volume_l=60), **am('furniture', 1, 4, AJ, 'Demo street-furniture maker', 'Post bin 60 l', CON_URB,
                                           EmptyingFrequency='4× daily (demo)')})

for k, tr in enumerate(SITE['trees'], 1):
    G = Frame((tr['x'], tr['y']), BEAR, F.z0)
    z = G.z0
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
    m.element('IfcCovering', f'Escocell {k} · Tree grate', grate, STREET, 'iron_grey', predefined='USERDEFINED',
              object_type='Cast-iron tree grate 1 400 × 1 400', parent=furn,
              src=('On OSM tree row way 306557216 (ODbL); position along it typical', 'Low', tr['source']),
              psets=am('furniture', 12, 4, AJ, 'Demo foundry', 'Tree grate 140×140, radial', CON_URB))
    m.element('IfcGeographicElement', f'Plàtan {k} · Plane tree {k}',
              [m.cylinder(*G.P(0, 0), z, 0.20, 2.8),
               rod(G.p3(0, 0, 2.6), G.p3(0.9, 0.5, 4.2), 0.12), rod(G.p3(0, 0, 2.6), G.p3(-0.7, 0.6, 4.3), 0.11),
               rod(G.p3(0, 0, 2.6), G.p3(0.1, -0.9, 4.1), 0.11)],
              STREET, 'bark', predefined='VEGETATION', object_type='Street tree (trunk and first limbs; the crown is in the ICGC mesh)',
              parent=furn, src=('On OSM tree row way 306557216 (Platanus, ODbL); position along it typical', 'Low', tr['source']),
              psets={'Pset_CDE_Vegetation': {'Species': 'Platanus × hispanica (genus from OSM tree row; species as on La Rambla)',
                                             'LeafType': 'Broadleaved', 'Trunk_Circumference_cm': 150 + 17 * k,
                                             'Height_m': 18 + k, 'OSMTreeRow': 306557216},
                     **am('tree', 12, 4, AJ_PARKS, 'Municipal nursery (demo)', 'Platanus × hispanica, planting stock 20/25',
                          CON_ARB, LastPruning='2025-12-10', RiskAssessment='Low (visual tree assessment, demo)')})

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'rambla-canaletes.ifc')
m.finish(out)
cut_path = os.path.splitext(out)[0] + '_cutouts.json'
json.dump({'cdeMeshCutouts': {'version': 1, 'anchor': {'lon': LON0, 'lat': LAT0, 'height': RAW0},
                              'note': 'Boxes in metres: s along bearing (deg clockwise from north), t to its left, z above the '
                                      'anchor height (the tileset anchor, before the scene placement offset).',
                              'boxes': CUTOUTS}}, open(cut_path, 'w'), indent=1)
print('written', out, len(m.f.by_type('IfcProduct')), 'products,', len(CUTOUTS), 'cut-outs ->', cut_path)
