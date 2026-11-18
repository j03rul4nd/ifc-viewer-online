"""Accés Pelai — Catalunya: the accessible metro / FGC entrance «Pelai» as an authored IFC4X3 model.

What it holds, all within 15 m of the lift on the south pavement of Carrer de Pelai, at Plaça de Catalunya:
  * the stair entrance «Pelai»: an opening in the pavement, open at its west end, with two straight flights and an
    intermediate landing going down 4.99 m to the corridor and a vestibule lobby that is only hinted at; granite
    steps with anti-slip nosings, wall-mounted stainless handrails at two heights on both sides, recessed step
    lights, the granite parapet with the steel balustrade around the opening, drainage at the head and the landing;
  * the step-free lift for the accessible node: glass kiosk at street level, car, guide rails, machine and the shaft
    down to the lobby;
  * the TMB / FGC signage totem (the «M» diamond and an FGC panel as simple coloured panels, station name, line
    badges, accessibility pictogram);
  * on the pavement: the tactile warning field at the stair head, the guidance strip from the sidewalk to the lift
    door, the lift threshold drain and two bollard lights.

Detailed geometry (roughly LOD 400) carrying LOD 500-style asset data on every element, so a click on any element
shows what an as-built asset register would hold. It is NOT the owners' as-built model and every asset value is
invented: Pset_CDE_AssetManagement (demo) says so on each element, Pset_CDE_Provenance says where its geometry
comes from. Manufacturers and models are fictitious placeholders, not real products.

What is real:
  * positions and topology from OpenStreetMap (© OpenStreetMap contributors, ODbL): the lift (node 4582874448,
    wheelchair=yes, level 0;-1), the stair head (node 1238021393), the steps (way 549784037), the opening's fence
    (way 1425664053), the footway from the lift door to the sidewalk (way 1023903726), the sidewalk and the facade
    line that the opening runs parallel to;
  * shapes and heights measured on ICGC's photogrammetric Barcelona mesh (3D Tiles «Scene-28»), sampled on a 0.25 m
    raster: the opening is ≈6.5 × 3.1 m and sits ≈1.2 m south of the OSM fence; its first flight falls ≈1.9 m to a
    landing that is visible from the street; the lift kiosk is 2.6 × 2.45 m and ≈4.1 m tall; the totem stands
    ≈3.1 m tall at the opening's north-east corner (landmarks/pelai_entrance_site.json).
What is typical, not measured: everything below the landing, the lobby, sections, materials, the asset data.
The lift's lower door faces the lobby on the shaft's south side; OSM draws the link at level −1 from the west, a
schematic the lobby hint does not follow.

Local axes: +x east, +y north, metres, origin at the lift (OSM node 4582874448), z = 0 on its pavement, which the
ICGC mesh puts at 66.03 m ellipsoidal (≈ 16.33 m above the Alicante datum: EGM08 undulation ≈ 49.70 m).

Scene tiles: anchored at h = 66.03 (the raw, ellipsoidal mesh height) and linked with the same placement as the
ICGC mesh, ELLIPSOIDAL −49.70, so model and mesh move together if that offset is ever corrected.

usage: uv run --with ifcopenshell --with pyproj python landmarks/pelai_entrance.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/pelai-entrance.ifc src/pelai-entrance_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/pelai-entrance_qto.ifc \
           tiles/barcelona-pelai-entrance 41.385477 2.169690 66.03 0 --keep-origin \
           --wfs tiles/wfs/barcelona-pelai-entrance --wfs-name barcelona_pelai_entrance_features \
           --extras src/pelai-entrance_cutouts.json
"""
import itertools, json, math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model, _guid  # noqa: E402
from pyproj import Transformer  # noqa: E402

HERE = os.path.dirname(__file__)
SITE = json.load(open(os.path.join(HERE, 'pelai_entrance_site.json'), encoding='utf-8'))
LAT0, LON0 = SITE['origin']['lat'], SITE['origin']['lon']
RAW0 = SITE['datum_raw_ellipsoidal']
ELEV0 = round(RAW0 + SITE['icgc_offset_m'], 2)          # ≈ orthometric (Alicante)
BEARING = SITE['bearing_deg']
BCN_CRS = (25831, 'ETRS89 / UTM zone 31N', 'ETRS89', 'Alicante (REDNAP)')

m = Model('Accés Pelai — Catalunya', 'Carrer de Pelai, south side of Plaça de Catalunya',
          'Accés adaptat «Pelai» · Catalunya (Metro L1 · L3, FGC)', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 model (≈LOD 400 geometry, LOD 500-style asset data with demo values). '
                      'Positions © OpenStreetMap contributors (ODbL); shapes and levels measured on the ICGC 3D mesh. '
                      'Not the owners\' as-built model.',
          tag_prefix='PELA', crs=BCN_CRS, schema='IFC4X3_ADD2')
f = m.f

# The model's +y is true north; UTM grid north is not. Give the map conversion the grid direction of +x.
_tr = Transformer.from_crs(4326, 25831, always_xy=True)
_e0, _n0 = _tr.transform(LON0, LAT0)
_e1, _n1 = _tr.transform(LON0, LAT0 + 100 / 110574)
_alpha = math.atan2(_e1 - _e0, _n1 - _n0)              # grid azimuth of true north
_mc = f.by_type('IfcMapConversion')[0]
_mc.XAxisAbscissa, _mc.XAxisOrdinate = math.cos(_alpha), -math.sin(_alpha)

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('concrete', 'Reinforced concrete C30/37', (0.72, 0.71, 0.68), 'Concrete', 2500, 'Cast in place')
M('granite', 'Granite Gris Quintana, flamed', (0.67, 0.66, 0.64), 'Stone', 2650, 'Flamed, 30 mm cladding / 80 mm treads')
M('granite_dark', 'Granite, honed, dark grey', (0.32, 0.32, 0.33), 'Stone', 2700, 'Copings and plinths')
M('tile', 'Glazed ceramic tile 30×60, white', (0.93, 0.93, 0.91), 'Ceramic', 2000)
M('tile_fgc', 'Glazed ceramic tile, FGC lime band', (0.55, 0.75, 0.12), 'Ceramic', 2000)
M('inox', 'Stainless steel AISI 316L, brushed', (0.78, 0.79, 0.80), 'Steel', 8000)
M('steel', 'Steel S275, powder-coated RAL 7016 anthracite', (0.23, 0.25, 0.27), 'Steel', 7850)
M('rail_paint', 'Steel S235, powder-coated, Barcelona dark grey-green', (0.20, 0.24, 0.22), 'Steel', 7850)
M('alu', 'Anodised aluminium, natural', (0.75, 0.76, 0.78), 'Aluminium', 2700)
M('glass_lift', 'Laminated safety glass 8+8, low iron', (0.82, 0.90, 0.92), 'Glass', 2500, transparency=0.65)
M('nosing', 'Anti-slip nosing insert, yellow', (0.95, 0.76, 0.08), 'Polymer', 1300)
M('tactile', 'Tactile paving (studs), ochre', (0.86, 0.62, 0.16), 'Concrete', 2300)
M('tactile_guide', 'Tactile paving (grooves), ochre', (0.82, 0.58, 0.14), 'Concrete', 2300)
M('panot', 'Hydraulic panot paving 20×20, grey', (0.80, 0.79, 0.76), 'Concrete', 2300, 'Barcelona standard pavement')
M('tmb_red', 'Coated aluminium, TMB red', (0.85, 0.07, 0.14), 'Aluminium', 2700)
M('fgc', 'Coated aluminium, FGC lime', (0.55, 0.75, 0.12), 'Aluminium', 2700)
M('fgc_dark', 'Coated aluminium, FGC dark grey', (0.20, 0.22, 0.24), 'Aluminium', 2700)
M('white', 'Powder-coated aluminium, signal white', (0.95, 0.95, 0.94), 'Aluminium', 2700)
M('navy', 'Coated aluminium, navy blue', (0.10, 0.16, 0.33), 'Aluminium', 2700)
M('l1', 'Line badge, L1 red', (0.86, 0.13, 0.15), 'Aluminium', 2700)
M('l3', 'Line badge, L3 green', (0.20, 0.62, 0.25), 'Aluminium', 2700)
M('access_blue', 'Accessibility sign, blue', (0.05, 0.33, 0.70), 'Aluminium', 2700)
M('light', 'Opal polycarbonate diffuser', (0.99, 0.98, 0.92), 'Plastic', 1200)
M('green_led', 'LED indicator, green', (0.15, 0.85, 0.30), 'Plastic', 1200)
M('display', 'TFT display, black glass', (0.06, 0.07, 0.08), 'Glass', 2500)
M('polymer', 'Polymer concrete, grey', (0.45, 0.45, 0.46), 'Concrete', 2200, 'Drainage channel body')
M('cast_iron', 'Ductile iron, coated black', (0.15, 0.15, 0.15), 'Iron', 7200)
M('rubber', 'EPDM, black', (0.07, 0.07, 0.07), 'Rubber', 1200)
M('chequer', 'Aluminium chequer plate', (0.68, 0.69, 0.70), 'Aluminium', 2700)

# ─── Geometry helpers ──────────────────────────────────────────────────────────────────────────────


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

    def local(self, x, y):
        dx, dy = x - self.o[0], y - self.o[1]
        return (dx * self.u[0] + dy * self.u[1], dx * self.L[0] + dy * self.L[1])

    def box(self, s0, s1, t0, t1, z0, h):
        cx, cy = self.P((s0 + s1) / 2, (t0 + t1) / 2)
        return m.box(cx, cy, self.z0 + z0, abs(s1 - s0), abs(t1 - t0), h, angle=self.ang)

    def cyl(self, s, t, z0, r, h):
        x, y = self.P(s, t)
        return m.cylinder(x, y, self.z0 + z0, r, h)

    def prism(self, st_pts, z0, h):
        return m.prism([self.P(s, t) for s, t in st_pts], self.z0 + z0, h)

    def side(self, pts, t, width):
        """Polygon [(s, z)] in the vertical plane at t, `width` thick across it."""
        x, y = self.P(0, t)
        return m.extrude_vertical_profile([(s, z) for s, z in pts], (x, y, self.z0), self.u, width)

    def cross(self, pts, s, width):
        """Polygon [(t, z)] in the vertical plane at s, `width` thick along s."""
        x, y = self.P(s, 0)
        return m.extrude_vertical_profile([(t, z) for t, z in pts], (x, y, self.z0), self.L, width)


# ─── Asset data (LOD 500-style, demo values) ───────────────────────────────────────────────────────
DATA_STATUS = 'Illustrative demo values — not the owner\'s as-built register'
TMB = 'TMB — Ferrocarril Metropolità de Barcelona (demo)'
FGC = 'FGC — Ferrocarrils de la Generalitat de Catalunya (demo)'
AJ = 'Ajuntament de Barcelona (demo)'
SHARED = 'TMB and FGC, shared interchange access (demo)'

# One row per asset family: owner, installation year, warranty years, (fictitious) manufacturer, maintainer.
FAMILY = {
    'civil': (SHARED, 1992, 10, 'Cast in situ — no manufacturer', 'Obra civil i estructures (demo contractor)', 'CIV'),
    'stair': (TMB, 2010, 10, 'Pedreres Demo, S.A. (fictitious)', 'Manteniment d\'estacions TMB (demo contractor)', 'STR'),
    'rail': (TMB, 2010, 10, 'Serralleria Demo, S.L. (fictitious)', 'Manteniment d\'estacions TMB (demo contractor)', 'RAL'),
    'lift': (FGC, 2009, 2, 'Elevadors Demo, S.A. (fictitious)', 'Ascensors Demo Manteniment, S.L. (demo contractor)', 'ELV'),
    'kiosk': (FGC, 2009, 10, 'Estructures Vidre Demo, S.L. (fictitious)', 'Ascensors Demo Manteniment, S.L. (demo contractor)', 'KSK'),
    'sign': (SHARED, 2018, 5, 'Senyalètica Demo, S.L. (fictitious)', 'Senyalètica i informació al viatger (demo contractor)', 'SGN'),
    'light': (TMB, 2019, 5, 'Il·luminació Demo, S.A. (fictitious)', 'Instal·lacions elèctriques estacions (demo contractor)', 'LGT'),
    'street_light': (AJ, 2019, 5, 'Il·luminació Demo, S.A. (fictitious)', 'Enllumenat públic BCN (demo contractor)', 'ENL'),
    'drain': (AJ, 2010, 10, 'Drenatges Demo, S.L. (fictitious)', 'Clavegueram BCN (demo contractor)', 'DRN'),
    'pavement': (AJ, 2015, 5, 'Paviments Urbans Demo, S.A. (fictitious)', 'Manteniment de la via pública (demo contractor)', 'PAV'),
    'security': (TMB, 2021, 3, 'Seguretat Demo, S.L. (fictitious)', 'Centre de control TMB (demo contractor)', 'SEC'),
}
_serial = itertools.count(1)


def am(family, model, interval, condition, owner=None, **extra):
    """Pset_CDE_AssetManagement (demo): the fields an as-built asset register holds, with invented values."""
    own, year, wty, mfr, maint, code = FAMILY[family]
    n = next(_serial)
    last = {1: '2026-09-15', 3: '2026-08-04', 6: '2026-05-20', 12: '2026-02-11', 24: '2025-06-03', 60: '2023-04-18'}[interval]
    y, mo, d = (int(v) for v in last.split('-'))
    mo += interval
    y, mo = y + (mo - 1) // 12, (mo - 1) % 12 + 1
    base = {'DataStatus': DATA_STATUS, 'AssetOwner': owner or own, 'Manufacturer': mfr, 'Model': model,
            'SerialNumber': f'{code}-{year}-{n:05d}', 'InstallationYear': year,
            'WarrantyEnd': f'{year + wty}-{3 + n % 9:02d}-{1 + n % 27:02d}',
            'LastInspection': last, 'NextInspection': f'{y}-{mo:02d}-{d:02d}', 'InspectionInterval_months': interval,
            'ConditionIndex_1to5': condition, 'MaintenanceContractor': maint, 'LifecycleStatus': 'In service',
            'MaintenanceStrategy': 'Condition-based' if interval > 3 else 'Time-based (statutory)'}
    base.update({k: v for k, v in extra.items() if v is not None})
    return {'Pset_CDE_AssetManagement (demo)': base}


def spec(**props):
    return {'Pset_CDE_Specification': props}


# The standard Pset_<Class>Common for the classes ifcbuild does not fill itself.
MORE_COMMON = {
    'IfcCovering': 'Pset_CoveringCommon', 'IfcPlate': 'Pset_PlateCommon', 'IfcSign': 'Pset_SignCommon',
    'IfcTransportElement': 'Pset_TransportElementCommon', 'IfcPipeSegment': 'Pset_PipeSegmentTypeCommon',
    'IfcWasteTerminal': 'Pset_WasteTerminalTypeCommon', 'IfcSwitchingDevice': 'Pset_SwitchingDeviceTypeCommon',
    'IfcCommunicationsAppliance': 'Pset_CommunicationsApplianceTypeCommon',
    'IfcElectricAppliance': 'Pset_ElectricApplianceTypeCommon',
    'IfcAudioVisualAppliance': 'Pset_AudioVisualApplianceTypeCommon',
    'IfcDiscreteAccessory': 'Pset_ElementComponentCommon',
}
ELECTRICAL = ('IfcLightFixture', 'IfcSwitchingDevice', 'IfcCommunicationsAppliance', 'IfcElectricAppliance',
              'IfcAudioVisualAppliance')


def E(ifc_class, name, items, storey, material, asset, src, predefined=None, object_type=None, psets=None,
      parent=None, common=None, extra_common=None, electrical=None):
    """An element that always carries asset data (`asset` = am(...)) and provenance (`src`)."""
    ps = {**(psets or {}), **asset}
    if ifc_class in MORE_COMMON:
        ps[MORE_COMMON[ifc_class]] = {'Reference': object_type or name, 'Status': 'EXISTING', **(extra_common or {})}
    if ifc_class in ELECTRICAL:
        ps['Pset_ElectricalDeviceCommon'] = {'RatedVoltage': 230.0, 'NominalFrequencyRange': 50.0, **(electrical or {})}
    return m.element(ifc_class, name, items, storey, material, predefined=predefined, object_type=object_type,
                     psets=ps, parent=parent, src=src, common=common)


def container(ifc_class, name, storey, predefined, object_type, psets, parent=None, tag='CNT'):
    """A product that aggregates parts and has no body of its own (IfcStair, IfcRailing...)."""
    el = f.create_entity(ifc_class, GlobalId=_guid(), OwnerHistory=m.oh, Name=name, ObjectType=object_type,
                         ObjectPlacement=f.createIfcLocalPlacement(m.bld_pl, m.origin), Tag=m._tag(tag),
                         PredefinedType=predefined)
    if parent is not None:
        m._parts[parent].append(el)
    else:
        m._contained[m.storeys[storey]].append(el)
    m._parts[el] = []
    for pname, props in psets.items():
        m.pset(el, pname, props)
    return el


SRC_MESH = ('Measured on the ICGC 3D mesh (0.25 m raster); position from OSM (ODbL)', 'Medium',
            'ICGC Scene-28; OSM node 4582874448')
SRC_STAIR = ('OSM steps and fence (ODbL); opening, first flight and landing measured on the ICGC 3D mesh', 'Medium',
             'OSM way 549784037, way 1425664053; ICGC Scene-28')
SRC_TYP = ('Typical dimensions and detailing for a Barcelona metro access; position from OSM and the ICGC mesh', 'Low')
SRC_BELOW = ('Below the pavement: not visible in any open source; typical for a Barcelona metro access', 'Low')
SRC_OSM_PATH = ('OSM footway 1023903726 (ODbL), lift door to the sidewalk; typical detailing', 'Medium',
                'OSM way 1023903726, way 882273555')

# ─── Mesh cut-outs ─────────────────────────────────────────────────────────────────────────────────
# Each volume is where this model replaces the ICGC mesh: the scene hides the ground mesh inside it while the
# model is shown (tileset.json `extras.cdeMeshCutouts`, read by CDE-Frontend). Where a cut leaves a hole in the
# 2.5D mesh the model lays a pavement patch over it (`patch=True`).
CUTOUTS = []
PATCH_TOP, CUT_FLOOR = 0.03, 0.06
PATCH_MARGIN = 0.25

STREET = 'Nivell carrer · Street level'
VEST = 'Vestíbul · Level −1'


def cutout(frame, name, s, t, z, patch=False):
    x, y = frame.P(0, 0)
    lon = LON0 + x / (111320 * math.cos(math.radians(LAT0)))
    lat = LAT0 + y / 110574
    CUTOUTS.append({'name': name, 'lon': round(lon, 8), 'lat': round(lat, 8), 'bearing': round(math.degrees(math.atan2(*frame.u)), 3),
                    's': [round(v, 3) for v in s], 't': [round(v, 3) for v in t],
                    'z': [round(frame.z0 + v, 3) for v in z]})
    if patch:
        E('IfcCovering', f'Paviment de reposició · Pavement patch ({name})',
          frame.box(s[0] - PATCH_MARGIN, s[1] + PATCH_MARGIN, t[0] - PATCH_MARGIN, t[1] + PATCH_MARGIN, PATCH_TOP - 0.10, 0.10),
          STREET, 'panot', am('pavement', 'Panot 20×20 «flor», grey', 12, 4), SRC_TYP, predefined='FLOORING',
          object_type='Panot pavement 20×20 over the cut-out (covers the mesh where this model replaces it)',
          psets=spec(Purpose='Visual: replaces the photogrammetric ground under modelled objects'))


# ═══ 1. Stair entrance «Pelai» ════════════════════════════════════════════════════════════════════
ST = Frame(tuple(SITE['stair_opening']['centre']), BEARING, 0.)      # s+ = down the stair (east), t+ = north
S_IN, S_OUT = -3.30, 3.20             # open entry (west) and the far parapet over the edge beam
T_WALL, T_HALF = 1.25, 1.55           # inner face of the stairwell walls, outer face of the parapet
RISER, GOING = 0.172, 0.29
F1_TOP, F1_N = -3.00, 11
LAND_Z = -F1_N * RISER
LAND_S0 = F1_TOP + (F1_N - 1) * GOING
F2_TOP = LAND_S0 + 1.55
F2_N = 18
F2_S1 = F2_TOP + (F2_N - 1) * GOING
Z_LOW = round(LAND_Z - F2_N * RISER, 3)          # the lobby floor (level −1)
S_END = 10.20                                     # lobby end wall, with the doorway into the vestibule

m.storey(STREET, 0., 'Pavement of Carrer de Pelai at Plaça de Catalunya')
m.storey(VEST, Z_LOW, 'Lobby at the foot of the stair and the lift, towards the Catalunya vestibule (FGC · L1)')

# The lift kiosk in the stair frame (needed by the lobby walls).
LK = Frame(tuple(SITE['lift_kiosk']['centre']), BEARING, 0.)
HS, HT = 1.30, 1.225                  # kiosk half-sizes along s / t (2.60 × 2.45 m, measured)
_lk_s, _lk_t = ST.local(*LK.o)
SHAFT_T0 = _lk_t - HT                 # the shaft's south face, in the stair frame
SHAFT_S = (_lk_s - HS, _lk_s + HS)


def stair_z(s):
    """Top surface of the stair at s (stair frame)."""
    if s <= F1_TOP:
        return 0.
    if s < LAND_S0:
        return -RISER * min(F1_N, math.ceil((s - F1_TOP) / GOING - 1e-9))
    if s <= F2_TOP:
        return LAND_Z
    if s < F2_S1:
        return LAND_Z - RISER * min(F2_N, math.ceil((s - F2_TOP) / GOING - 1e-9))
    return Z_LOW


RISERS = [F1_TOP + k * GOING for k in range(F1_N)] + [F2_TOP + k * GOING for k in range(F2_N)]


def stair_line(s0, s1):
    """The stepped top surface of the stair from s0 to s1 as a polyline [(s, z)]."""
    eps = 1e-6
    pts = [(s0, stair_z(s0 + eps))]
    for r in RISERS:
        if s0 + eps < r < s1 - eps:
            pts += [(r, stair_z(r - eps)), (r, stair_z(r + eps))]
    pts.append((s1, stair_z(s1 - eps)))
    return pts


def flight_profile(s_top, z_top, n):
    pts = [(s_top - 0.30, z_top), (s_top, z_top)]
    for k in range(n):
        pts += [(s_top + k * GOING, z_top - (k + 1) * RISER), (s_top + (k + 1) * GOING, z_top - (k + 1) * RISER)]
    s_end, z_end = s_top + n * GOING, z_top - n * RISER
    return pts + [(s_end, z_end - 0.22), (s_top - 0.30, z_top - 0.22)]


acc = m.assembly('Accés «Pelai» · Catalunya entrance', STREET, object_type='Metro / FGC station entrance',
                 psets={**spec(Station='Catalunya', Lines='Metro L1 · L3, FGC Barcelona–Vallès (interchange)',
                               EntranceName='Pelai', StepFree='Yes — lift beside the stair (OSM wheelchair=yes)',
                               OSMNode='4582874448 (lift), 1238021393 (stair head)', Rise_m=round(-Z_LOW, 2)),
                        **am('civil', 'Station entrance, stair + lift (asset group)', 12, 4)})

stair = container('IfcStair', 'Escala d\'accés «Pelai» · Entrance stair', None, 'TWO_STRAIGHT_RUN_STAIR', 'Stair',
                  {'Pset_StairCommon': {'Reference': 'Two-flight straight stair with intermediate landing', 'Status': 'EXISTING',
                                        'NumberOfRiser': F1_N + F2_N, 'NumberOfTreads': F1_N + F2_N - 2,
                                        'RiserHeight': RISER, 'TreadLength': GOING, 'NosingLength': 0.0,
                                        'RequiredHeadroom': 2.20, 'HandicapAccessible': False, 'HasNonSkidSurface': True,
                                        'IsExternal': True, 'LoadBearing': True, 'FireExit': True},
                   **spec(Risers=F1_N + F2_N, Riser_mm=round(RISER * 1000), Going_mm=round(GOING * 1000),
                          ClearWidth_mm=round(2 * T_WALL * 1000), Rise_m=round(-Z_LOW, 2),
                          Blondel_mm=round((2 * RISER + GOING) * 1000)),
                   **am('stair', 'Granite stair, 29 risers (asset group)', 6, 4),
                   'Pset_CDE_Provenance': {'GeometrySource': SRC_STAIR[0], 'Confidence': SRC_STAIR[1], 'Reference': SRC_STAIR[2]}},
                  parent=acc, tag='STR')

W = 2 * T_WALL
for k, (s_top, z_top, n, src) in enumerate(((F1_TOP, 0., F1_N, SRC_STAIR), (F2_TOP, LAND_Z, F2_N, SRC_BELOW)), 1):
    E('IfcStairFlight', f'Tram {k} · Flight {k} ({n} risers)', ST.side(flight_profile(s_top, z_top, n), 0., W),
      STREET, 'granite', am('stair', 'Granit Gris Quintana tread 80 mm on RC waist 220 mm', 6, 4 if k == 1 else 3,
                            Note=None if k == 1 else 'Two treads with cracked arrises near the foot, repair queued (demo)'),
      src, predefined='STRAIGHT', object_type='Granite stair flight on RC waist', parent=stair,
      psets=spec(Finish='Flamed granite 80 mm, anti-slip class 3 (UNE-ENV 12633)', Width_mm=round(W * 1000)),
      common={'NumberOfRiser': n, 'NumberOfTreads': n - 1, 'RiserHeight': RISER, 'TreadLength': GOING,
              })
E('IfcSlab', 'Replà intermedi · Intermediate landing', ST.box(LAND_S0, F2_TOP, -T_WALL, T_WALL, LAND_Z - 0.30, 0.30),
  STREET, 'granite', am('stair', 'Granite landing 80 mm on RC slab', 6, 4), SRC_STAIR, predefined='LANDING',
  object_type='Stair landing, granite on RC', parent=stair,
  psets=spec(Length_mm=round((F2_TOP - LAND_S0) * 1000), Width_mm=round(W * 1000)))
for k, (s_top, z_top, n) in enumerate(((F1_TOP, 0., F1_N), (F2_TOP, LAND_Z, F2_N)), 1):
    nos = [ST.box(s_top + j * GOING, s_top + j * GOING + 0.05, -T_WALL + 0.06, T_WALL - 0.06, z_top - j * RISER, 0.006)
           for j in range(n)]
    E('IfcCovering', f'Bandes antilliscants, tram {k} · Anti-slip nosings, flight {k}', nos, STREET, 'nosing',
      am('stair', 'Nosing insert 50 mm, carborundum, yellow', 3, 3 if k == 1 else 4,
         Note='Three inserts worn on the top treads, replacement planned (demo)' if k == 1 else None),
      SRC_TYP, predefined='USERDEFINED', object_type='Nosing insert 50 mm, contrasting', parent=stair,
      psets=spec(Count=len(nos), Contrast='Yellow on grey granite, LRV difference > 30'))
E('IfcCovering', 'Paviment podotàctil d\'avís · Tactile warning fields',
  [ST.box(F1_TOP - 1.42, F1_TOP - 0.24, -T_WALL + 0.05, T_WALL - 0.05, 0., 0.012),
   ST.box(F2_TOP - 0.62, F2_TOP - 0.02, -T_WALL + 0.05, T_WALL - 0.05, LAND_Z, 0.012),
   ST.box(F2_S1 + 0.02, F2_S1 + 0.62, -T_WALL + 0.05, T_WALL - 0.05, Z_LOW, 0.012)],
  STREET, 'tactile', am('pavement', 'Tactile warning tile 40×40, studs', 6, 4, owner=TMB), SRC_TYP, predefined='FLOORING',
  object_type='Tactile warning paving (studs): 1 200 mm at the head, 600 mm at the landing and foot', parent=stair,
  psets=spec(Standard='Orden TMA/851/2021; UNE-CEN/TS 15209'))

# handrails: wall-mounted, two heights (900 / 700 mm), both sides, continuous over the landing
for side, label in ((-1, 'sud · south'), (1, 'nord · north')):
    t_r = side * (T_WALL - 0.09)
    t_w = side * T_WALL
    items = []
    for h, r in ((0.90, 0.024), (0.70, 0.020)):
        for s_top, z_top, n in ((F1_TOP, 0., F1_N), (F2_TOP, LAND_Z, F2_N)):
            s_end, z_end = s_top + (n - 1) * GOING, z_top - n * RISER
            a = ST.p3(s_top - 0.30, t_r, z_top + h)
            b = ST.p3(s_top, t_r, z_top + h)
            c = ST.p3(s_end, t_r, z_end + RISER + h)
            d = ST.p3(s_end + 0.30, t_r, z_end + h)
            items += [rod(a, b, r), rod(b, c, r), rod(c, d, r)]
            items += [disc(a, ST.v3(1, 0, 0), r, 0.01), disc(d, ST.v3(1, 0, 0), r, 0.01)]
        # the landing stretch joins the two flights
        items.append(rod(ST.p3(LAND_S0 + 0.30, t_r, LAND_Z + h), ST.p3(F2_TOP - 0.30, t_r, LAND_Z + h), r))
    for s_top, z_top, n in ((F1_TOP, 0., F1_N), (F2_TOP, LAND_Z, F2_N)):
        for k in range(0, n, 3):
            s = s_top + k * GOING + 0.12
            zr = z_top - k * RISER * 1.0 - (s - s_top - k * GOING) * RISER / GOING
            for h in (0.90, 0.70):
                items.append(rod(ST.p3(s, t_w, zr + h), ST.p3(s, t_r, zr + h), 0.008))
                items.append(disc(ST.p3(s, side * (T_WALL - 0.034), zr + h), ST.v3(0, 1, 0), 0.035, 0.008))
    E('IfcRailing', f'Passamans de paret, costat {label} · Wall handrails', items, STREET, 'inox',
      am('rail', 'Handrail Ø48 / Ø40 AISI 316L on wall brackets', 12, 4), SRC_TYP, predefined='HANDRAIL',
      object_type='Double-height wall handrail Ø48 at 900 mm and Ø40 at 700 mm', parent=stair,
      psets=spec(Heights_mm='900 / 700', Extension_mm=300, Brackets='Every third tread, chemical anchors',
                 Standard='CTE DB-SUA 1, accessibility'),
      common={'Height': 0.90, 'Diameter': 0.048})

# recessed step lights in the stair walls
for k, (s, side) in enumerate(((F1_TOP + 0.9, -1), (F1_TOP + 2.3, 1), (LAND_S0 + 0.8, -1),
                               (F2_TOP + 1.1, 1), (F2_TOP + 2.6, -1), (F2_TOP + 4.1, 1)), 1):
    z = stair_z(s) + 0.30
    E('IfcLightFixture', f'Llum d\'esglaó {k} · Step light {k}', ST.box(s - 0.11, s + 0.11, side * (T_WALL - 0.04), side * (T_WALL - 0.01), z, 0.07),
      STREET, 'light', am('light', 'Recessed LED step light 3 W, IP67, IK08', 12, 5 if k != 4 else 2,
                          Note='Driver failure, ticket open (demo)' if k == 4 else None),
      SRC_TYP, predefined='POINTSOURCE', object_type='Recessed LED wall step light, asymmetric downward beam', parent=stair,
      psets=spec(Power_W=3, LuminousFlux_lm=180, ColourTemperature_K=3000),
      common={'NumberOfSources': 1, 'TotalWattage': 3.0, 'LightFixtureMountingType': 'RECESSED'})

# stairwell structure
wel = m.assembly('Estructura del pou d\'escala · Stairwell structure', None, object_type='Stairwell', parent=acc,
                 psets=am('civil', 'RC stairwell (asset group)', 24, 4))
for side, label, s_end in ((-1, 'sud · south', S_END + 0.30), (1, 'nord · north', F2_S1)):
    t = side * (T_WALL + 0.15)
    prof = [(S_IN, 0.0), (S_OUT + 0.35, 0.0), (S_OUT + 0.35, -0.40), (s_end, -0.40),
            (s_end, Z_LOW - 0.45), (F2_S1, Z_LOW - 0.45), (F1_TOP, -0.65), (S_IN, -0.65)]
    if s_end <= F2_S1:
        prof = prof[:4] + [(s_end, Z_LOW - 0.45)] + prof[6:]
    E('IfcWall', f'Mur de contenció {label} · Retaining wall', ST.side(prof, t, 0.30), STREET, 'concrete',
      am('civil', 'RC retaining wall 300 mm, C30/37 XC4', 24, 4), SRC_BELOW, predefined='RETAININGWALL',
      object_type='RC retaining wall 300 mm', parent=wel,
      psets=spec(Thickness_mm=300, Concrete='C30/37 XC4', Waterproofing='Bentonite panels + drained cavity'),
      common={'IsExternal': True})
E('IfcBeam', 'Biga de vora · Opening edge beam', ST.box(S_OUT - 0.05, S_OUT + 0.35, -T_HALF, T_HALF, -0.62, 0.62),
  STREET, 'concrete', am('civil', 'RC edge beam 400 × 620', 24, 4), SRC_MESH, predefined='LINTEL',
  object_type='RC edge beam 400×620 under the far parapet', parent=wel)
roof_pts = [(S_OUT + 0.35, -T_HALF), (S_END + 0.30, -T_HALF), (S_END + 0.30, SHAFT_T0), (F2_S1 - 0.30, SHAFT_T0),
            (F2_S1 - 0.30, T_HALF), (S_OUT + 0.35, T_HALF)]
E('IfcSlab', 'Llosa de cobertura sota vorera · Roof slab under the pavement', ST.prism(roof_pts, -0.40, 0.38),
  STREET, 'concrete', am('civil', 'RC roof slab 380 mm', 24, 4), SRC_BELOW, predefined='ROOF',
  object_type='RC roof slab 380 mm, pavement build-up above', parent=wel,
  psets=spec(Thickness_mm=380, LiveLoad_kN_m2=5.0, Note='Pavement, membrane and drainage layers above'))

# cladding: granite panels in the open stairwell, white tile with an FGC band under the slab
for side in (-1, 1):
    t = side * (T_WALL - 0.015)
    gran, tile, band = [], [], []
    s_lim = S_END - 0.05 if side < 0 else F2_S1 - 0.05
    s = S_IN + 0.05
    while s < s_lim:
        open_part = s < S_OUT
        s1 = min(s + 1.19, S_OUT if open_part else s_lim)
        line = stair_line(s, s1)
        bottom = [(ps, pz + 0.02) for ps, pz in reversed(line)]
        if open_part:
            gran.append(ST.side([(s, -0.02), (s1, -0.02)] + bottom, t, 0.03))
        else:
            tile.append(ST.side([(s, -0.42), (s1, -0.42)] + bottom, t, 0.025))
            zb0, zb1 = stair_z(s + 1e-6), stair_z(s1 - 1e-6)
            band.append(ST.side([(s, zb0 + 1.10), (s1, zb1 + 1.10), (s1, zb1 + 1.22), (s, zb0 + 1.22)], t - side * 0.014, 0.004))
        s = s1 + 0.006
    lab = 'sud · south' if side < 0 else 'nord · north'
    E('IfcCovering', f'Aplacat de granit, mur {lab} · Granite cladding', gran, STREET, 'granite',
      am('stair', 'Granite cladding 30 mm, 1 190 mm panels', 24, 4), SRC_TYP, predefined='CLADDING',
      object_type='Granite cladding panels 1 190 mm, 6 mm joints', parent=wel)
    E('IfcCovering', f'Revestiment ceràmic, mur {lab} · Wall tiling', tile, VEST, 'tile',
      am('stair', 'Glazed tile 30×60, white', 24, 4, owner=FGC), SRC_BELOW, predefined='CLADDING',
      object_type='White glazed tile 30×60', parent=wel)
    E('IfcCovering', f'Franja corporativa, mur {lab} · Corporate band', band, VEST, 'tile_fgc',
      am('stair', 'Glazed tile band, FGC lime', 24, 5, owner=FGC), SRC_BELOW, predefined='CLADDING',
      object_type='FGC lime tile band at 1 100 mm', parent=wel)

# parapet: RC upstand, granite coping and the steel balustrade on three sides of the opening
par = m.assembly('Ampit i barana perimetral · Parapet and balustrade', None, object_type='Opening guard', parent=acc,
                 psets={**spec(Height_mm=1100, Type='Steel balustrade with vertical bars on a granite parapet',
                               LineLoad_kN_m=1.6, Standard='CTE DB-SE-AE, DB-SUA 1'),
                        **am('rail', 'Opening guard (asset group)', 12, 4)})
UP_H, COP_H = 0.35, 0.07
runs = [('sud · south', [(S_IN, -T_HALF + 0.15), (S_OUT + 0.35, -T_HALF + 0.15)]),
        ('nord · north', [(S_IN, T_HALF - 0.15), (S_OUT + 0.35, T_HALF - 0.15)]),
        ('est · east', [(S_OUT + 0.15, -T_HALF + 0.15), (S_OUT + 0.15, T_HALF - 0.15)])]
ups, cops = [], []
for _, ((sa, ta), (sb, tb)) in runs:
    if sa == sb:
        ups.append(ST.box(sa - 0.15, sa + 0.15, ta - 0.15, tb + 0.15, 0.0, UP_H))
        cops.append(ST.box(sa - 0.20, sa + 0.20, ta - 0.20, tb + 0.20, UP_H, COP_H))
    else:
        ups.append(ST.box(sa, sb, ta - 0.15, ta + 0.15, 0.0, UP_H))
        cops.append(ST.box(sa - 0.03, sb + 0.05, ta - 0.20, ta + 0.20, UP_H, COP_H))
E('IfcWall', 'Ampit de formigó · Parapet upstand', ups, STREET, 'granite',
  am('civil', 'RC upstand 300 × 350, granite-clad', 24, 4), SRC_MESH, predefined='PARAPET',
  object_type='RC upstand 300 mm, granite-clad, 350 mm above the pavement', parent=par, common={'LoadBearing': False})
E('IfcCovering', 'Coronament de granit · Granite coping', cops, STREET, 'granite_dark',
  am('rail', 'Honed granite coping 400 × 70, drip groove', 24, 4), SRC_TYP, predefined='COPING',
  object_type='Honed granite coping 400×70', parent=par)
Z_RB, Z_RT = UP_H + COP_H, 1.10
for k, (label, ((sa, ta), (sb, tb))) in enumerate(runs):
    L = math.hypot(sb - sa, tb - ta)
    n_posts = max(2, round(L / 1.20))
    items = []
    for j in range(n_posts + 1):
        s, t = sa + (sb - sa) * j / n_posts, ta + (tb - ta) * j / n_posts
        along = (sb - sa) != 0
        if along:
            items.append(ST.box(s - 0.03, s + 0.03, t - 0.006, t + 0.006, Z_RB, Z_RT - Z_RB))
        else:
            items.append(ST.box(s - 0.006, s + 0.006, t - 0.03, t + 0.03, Z_RB, Z_RT - Z_RB))
        items.append(ST.box(s - 0.05, s + 0.05, t - 0.05, t + 0.05, Z_RB, 0.008))      # base plate
    items.append(rod(ST.p3(sa, ta, Z_RT), ST.p3(sb, tb, Z_RT), 0.025))                  # top rail Ø50
    items.append(rod(ST.p3(sa, ta, Z_RB + 0.10), ST.p3(sb, tb, Z_RB + 0.10), 0.015))    # bottom rail Ø30
    n_bal = int(L / 0.115)
    for j in range(1, n_bal):
        s, t = sa + (sb - sa) * j / n_bal, ta + (tb - ta) * j / n_bal
        items.append(rod(ST.p3(s, t, Z_RB + 0.10), ST.p3(s, t, Z_RT), 0.008))           # Ø16 bars, 115 mm pitch
    E('IfcRailing', f'Barana, costat {label} · Balustrade', items, STREET, 'rail_paint',
      am('rail', 'Barcelona metro balustrade, Ø16 bars at 115 mm, Ø50 top rail', 12, 4 if k != 1 else 3,
         Note='Paint damage and rust bloom on two bars near the entry (demo)' if k == 1 else None),
      SRC_TYP, predefined='GUARDRAIL', object_type='Steel balustrade, vertical bars, 1 100 mm above the pavement',
      parent=par, psets=spec(Length_mm=round(L * 1000), Posts=n_posts + 1, Bars=n_bal - 1, BarPitch_mm=115,
                             Coating='Hot-dip galvanised + powder coat'),
      common={'Height': 1.10, 'Diameter': 0.05})
# entry newel posts (the open end) and the "use the lift" sign on the north one
newels = [ST.box(S_IN - 0.06, S_IN + 0.06, t - 0.06, t + 0.06, 0.0, 1.15) for t in (-T_HALF + 0.15, T_HALF - 0.15)]
E('IfcMember', 'Pilars d\'arrencada · Entry newel posts', newels, STREET, 'rail_paint',
  am('rail', 'Newel post 120×120, capped', 12, 4), SRC_TYP, predefined='POST',
  object_type='Steel newel post 120×120 at the open end', parent=par)
E('IfcSign', 'Placa «Ascensor» · Lift direction sign', ST.box(S_IN + 0.08, S_IN + 0.10, T_HALF - 0.38, T_HALF + 0.08, 0.75, 0.30),
  STREET, 'access_blue', am('sign', 'ISA pictogram plate 460×300 with arrow «Ascensor →»', 24, 5), SRC_TYP,
  predefined='PICTORAL', object_type='ISA + arrow pointing to the lift', parent=par,
  extra_common={'IsExternal': True, 'Category': 'Wayfinding', 'TactileMarking': 'Braille + raised arrow'})

# drainage: channel at the head of the stair, floor wastes on the landing and at the foot
drn = m.assembly('Drenatge de l\'accés · Entrance drainage', None, object_type='Surface water drainage', parent=acc,
                 psets=am('drain', 'Entrance drainage (asset group)', 6, 3, owner=TMB))
E('IfcPipeSegment', 'Canal de drenatge del capçal · Head channel drain',
  ST.box(F1_TOP - 0.23, F1_TOP - 0.05, -T_WALL, T_WALL, -0.16, 0.15), STREET, 'polymer',
  am('drain', 'Polymer-concrete channel 150 mm, class C250', 6, 3, owner=TMB,
     Note='Silt build-up after the 29 Sep storm, jetting ordered (demo)'),
  SRC_TYP, predefined='GUTTER', object_type='Slot channel drain 150 mm to the combined sewer', parent=drn,
  psets=spec(Width_mm=150, LoadClass='C250 (EN 1433)', Outlet='Combined sewer, Carrer de Pelai'))
E('IfcDiscreteAccessory', 'Reixa del canal · Channel grating', ST.box(F1_TOP - 0.22, F1_TOP - 0.06, -T_WALL + 0.01, T_WALL - 0.01, -0.010, 0.012),
  STREET, 'inox', am('drain', 'Heelguard stainless grating 160 mm, C250', 6, 4, owner=TMB), SRC_TYP,
  predefined='USERDEFINED', object_type='Stainless heelguard grating, bolted', parent=drn)
for k, (s, z) in enumerate(((LAND_S0 + 0.20, LAND_Z), (F2_S1 + 0.90, Z_LOW)), 1):
    E('IfcWasteTerminal', f'Interceptor de sòl {k} · Floor waste {k}',
      [ST.box(s - 0.15, s + 0.15, -T_WALL + 0.06, -T_WALL + 0.36, z - 0.25, 0.25),
       ST.box(s - 0.14, s + 0.14, -T_WALL + 0.07, -T_WALL + 0.35, z - 0.006, 0.008)], STREET if k == 1 else VEST, 'cast_iron',
      am('drain', 'Floor gully 300×300, ductile iron grate', 6, 4, owner=TMB), SRC_BELOW,
      predefined='FLOORWASTE', object_type='Trapped floor gully 300×300 to the station drainage', parent=drn)

# ═══ 2. Lobby at level −1 (only hinted) ═══════════════════════════════════════════════════════════
lob = m.assembly('Vestíbul inferior · Lobby at level −1', VEST, object_type='Lobby (stair foot and lift)',
                 psets={**spec(Note='Only hinted: the vestibule beyond the doorway is not modelled'),
                        **am('civil', 'Lobby (asset group)', 24, 4, owner=FGC)})
E('IfcSlab', 'Llosa del vestíbul · Lobby floor slab',
  ST.prism([(F2_S1, -T_WALL), (S_END, -T_WALL), (S_END, SHAFT_T0), (F2_S1, SHAFT_T0)], Z_LOW - 0.30, 0.30),
  VEST, 'granite', am('civil', 'Granite floor 50 mm on RC slab 250 mm', 12, 4, owner=FGC), SRC_BELOW, predefined='FLOOR',
  object_type='Granite floor on RC slab', parent=lob)
E('IfcSlab', 'Paviment cap al vestíbul · Floor towards the vestibule', ST.box(S_END + 0.30, S_END + 1.80, -0.95, 1.55, Z_LOW - 0.30, 0.30),
  VEST, 'granite', am('civil', 'Granite floor 50 mm on RC slab 250 mm', 12, 4, owner=FGC), SRC_BELOW, predefined='FLOOR',
  object_type='First metres of the corridor into the Catalunya vestibule (hint)', parent=lob)
lw = [ST.box(F2_S1 - 0.30, SHAFT_S[0], T_WALL, SHAFT_T0 + 0.30, Z_LOW, -0.40 - Z_LOW),      # north-west corner
      ST.box(SHAFT_S[1], S_END + 0.30, SHAFT_T0, SHAFT_T0 + 0.30, Z_LOW, -0.40 - Z_LOW),       # north, east of the shaft
      ST.box(S_END, S_END + 0.30, -T_WALL - 0.30, -0.95, Z_LOW, -0.40 - Z_LOW),                # end wall, south jamb
      ST.box(S_END, S_END + 0.30, 1.55, SHAFT_T0 + 0.30, Z_LOW, -0.40 - Z_LOW),                # end wall, north jamb
      ST.box(S_END, S_END + 0.30, -0.95, 1.55, Z_LOW + 2.60, -0.40 - Z_LOW - 2.60)]           # head over the doorway
E('IfcWall', 'Murs del vestíbul · Lobby walls', lw, VEST, 'concrete', am('civil', 'RC wall 300 mm', 24, 4, owner=FGC),
  SRC_BELOW, predefined='SOLIDWALL', object_type='RC walls with a 2 500 mm doorway towards the vestibule', parent=lob)
E('IfcCovering', 'Fals sostre del vestíbul · Lobby ceiling',
  ST.prism([(F2_S1, -T_WALL), (S_END, -T_WALL), (S_END, SHAFT_T0), (F2_S1, SHAFT_T0)], Z_LOW + 2.90, 0.03),
  VEST, 'alu', am('civil', 'Aluminium strip ceiling 300 mm, removable', 24, 4, owner=FGC), SRC_BELOW, predefined='CEILING',
  object_type='Suspended aluminium strip ceiling at 2 900 mm', parent=lob)
for k, s in enumerate((F2_S1 + 0.8, F2_S1 + 2.2, F2_S1 + 3.6), 1):
    E('IfcLightFixture', f'Lluminària lineal {k} · Linear luminaire {k}', ST.box(s - 0.60, s + 0.60, 0.30, 0.40, Z_LOW + 2.85, 0.05),
      VEST, 'light', am('light', 'LED linear luminaire 1 200 mm 36 W, IK10', 12, 5 if k != 2 else 3, owner=FGC,
                        Note='Flicker reported, driver to be replaced (demo)' if k == 2 else None),
      SRC_BELOW, predefined='DIRECTIONSOURCE', object_type='Recessed LED linear luminaire', parent=lob,
      psets=spec(Power_W=36, LuminousFlux_lm=4600, EmergencyBattery_h=1),
      common={'NumberOfSources': 1, 'TotalWattage': 36.0, 'LightFixtureMountingType': 'RECESSED'})
E('IfcLightFixture', 'Senyal d\'evacuació · Emergency exit sign', ST.box(S_END - 0.06, S_END, -0.30, 0.30, Z_LOW + 2.62, 0.20),
  VEST, 'green_led', am('light', 'Maintained exit luminaire 3 W, 1 h', 1, 5, owner=FGC, LastFunctionalTest='2026-09-15'),
  SRC_BELOW, predefined='SECURITYLIGHTING', object_type='Emergency exit luminaire, maintained, pointing up the stair',
  parent=lob, psets=spec(Autonomy_h=1), common={'NumberOfSources': 1, 'TotalWattage': 3.0})
E('IfcSign', 'Rètol direccional «FGC · L1 · L3» · Direction sign', ST.box(S_END - 0.80, S_END - 0.74, -0.90, 0.90, Z_LOW + 2.35, 0.40),
  VEST, 'navy', am('sign', 'Suspended back-lit direction sign 1 800×400', 24, 5, owner=FGC), SRC_BELOW,
  predefined='PICTORAL', object_type='Suspended direction sign towards the FGC and metro platforms', parent=lob,
  psets=spec(Text='FGC · L1 · L3 — Andanes / Andenes / Platforms →'),
  extra_common={'IsExternal': False, 'Category': 'Wayfinding'})
E('IfcSign', 'Banda FGC del rètol · FGC band of the sign', ST.box(S_END - 0.81, S_END - 0.73, -0.90, -0.55, Z_LOW + 2.38, 0.34),
  VEST, 'fgc', am('sign', 'FGC brand panel 350×340', 24, 5, owner=FGC), SRC_BELOW,
  predefined='MARKER', object_type='FGC brand colour panel on the direction sign', parent=lob)
E('IfcAudioVisualAppliance', 'Càmera CCTV del vestíbul · Lobby CCTV camera', ST.cyl(F2_S1 + 0.4, -T_WALL + 0.35, Z_LOW + 2.72, 0.09, 0.16),
  VEST, 'white', am('security', 'Dome camera 4 MP, IR, IK10', 6, 5), ('OSM node 4582874448 surveillance=indoor (ODbL); typical model', 'Low'),
  predefined='CAMERA', object_type='Dome camera facing the stair foot and the lift door', parent=lob,
  psets=spec(Resolution='4 MP', Recording='Station NVR, 30 days'))

# ═══ 3. Lift ══════════════════════════════════════════════════════════════════════════════════════
H_ROOF = 3.80
lift = m.assembly('Ascensor «Pelai» · Step-free lift', STREET, object_type='Lift (pavement ↔ level −1)',
                  psets={**spec(Stops='Street, lobby −1', Travel_m=round(-Z_LOW, 2), RatedLoad_kg=1000, Persons=13,
                                CarSize_mm='1 100 × 1 400', DoorClear_mm=900, Speed_m_s=1.0,
                                Drive='Gearless traction, machine-room-less', Doors='Single entrance, both stops south',
                                Standard='EN 81-20/50, EN 81-70 type 2', OSMNode='4582874448 (wheelchair=yes)'),
                         **am('lift', 'MRL panoramic lift 1000 kg / 13 p (demo model «Panorama-1000»)', 1, 4,
                              Availability_pct_12m=98.3, TripsPerDay_avg=1180, LastStatutoryInspection='2025-11-06',
                              NextStatutoryInspection='2027-11-06', RegistryNumber='RAE-08-DEMO-0457')})
kio = m.assembly('Quiosc de vidre · Glass kiosk', None, object_type='Lift kiosk at street level', parent=lift,
                 psets={**spec(Footprint_mm='2 600 × 2 450 (measured)', Height_mm=4100),
                        **am('kiosk', 'Glass lift kiosk, steel frame (asset group)', 12, 4)})
E('IfcSlab', 'Sòcol de granit · Granite plinth', LK.box(-HS - 0.12, HS + 0.12, -HT - 0.12, HT + 0.12, -0.02, 0.06), STREET,
  'granite_dark', am('kiosk', 'Granite plinth 30 mm', 24, 4), SRC_MESH, predefined='BASESLAB',
  object_type='Granite plinth around the kiosk', parent=kio)
E('IfcColumn', 'Pilars de cantonada · Corner posts', [LK.box(s - 0.05, s + 0.05, t - 0.05, t + 0.05, 0.03, H_ROOF - 0.03)
                                                      for s in (-HS + 0.05, HS - 0.05) for t in (-HT + 0.05, HT - 0.05)],
  STREET, 'steel', am('kiosk', 'SHS 100×100×8, anthracite', 24, 4), SRC_TYP, predefined='COLUMN',
  object_type='SHS 100×100×8 corner posts', parent=kio)
ring = [LK.box(-HS, HS, t - 0.05, t + 0.05, H_ROOF - 0.15, 0.15) for t in (-HT + 0.05, HT - 0.05)]
ring += [LK.box(s - 0.05, s + 0.05, -HT, HT, H_ROOF - 0.15, 0.15) for s in (-HS + 0.05, HS - 0.05)]
ring += [LK.box(-HS, HS, t - 0.04, t + 0.04, 2.40, 0.08) for t in (-HT + 0.05, HT - 0.05)]
ring += [LK.box(s - 0.04, s + 0.04, -HT, HT, 2.40, 0.08) for s in (-HS + 0.05, HS - 0.05)]
E('IfcMember', 'Travessers · Transoms and ring beam', ring, STREET, 'steel', am('kiosk', 'RHS 100×150 / 80×80', 24, 4),
  SRC_TYP, predefined='MULLION', object_type='Ring beam 100×150 and transom 80×80 at 2 400 mm', parent=kio)
glass = []
for zb, h in ((0.06, 2.32), (2.50, H_ROOF - 0.17 - 2.50)):
    glass.append(LK.box(-HS + 0.10, HS - 0.10, HT - 0.06, HT - 0.04, zb, h))                    # north
    for s in (-HS + 0.05, HS - 0.05):
        glass.append(LK.box(s - 0.01, s + 0.01, -HT + 0.10, HT - 0.10, zb, h))                 # east / west
glass += [LK.box(-HS + 0.10, -0.52, -HT + 0.04, -HT + 0.06, 0.06, 2.10), LK.box(0.52, HS - 0.10, -HT + 0.04, -HT + 0.06, 0.06, 2.10),
          LK.box(-HS + 0.10, HS - 0.10, -HT + 0.04, -HT + 0.06, 2.50, H_ROOF - 0.17 - 2.50)]
E('IfcPlate', 'Envidrament del quiosc · Kiosk glazing', glass, STREET, 'glass_lift',
  am('kiosk', 'Structural laminated glass 8+8, low iron, point-fixed', 6, 3,
     Note='One lower pane etched by vandalism, replacement ordered (demo)'),
  SRC_TYP, predefined='CURTAIN_PANEL', object_type='Structural laminated glass 8+8, low iron', parent=kio,
  psets=spec(Panels=len(glass)), extra_common={'IsExternal': True})
E('IfcRoof', 'Coberta del quiosc · Kiosk roof', LK.box(-HS - 0.10, HS + 0.10, -HT - 0.10, HT + 0.10, H_ROOF, 0.25), STREET,
  'steel', am('kiosk', 'Aluminium composite roof 250 mm, internal gutter', 12, 4), SRC_MESH, predefined='FLAT_ROOF',
  object_type='Aluminium composite roof, 250 mm, 100 mm overhang', parent=kio,
  psets=spec(Drainage='Internal gutter to a downpipe in the north-west post'))
E('IfcLightFixture', 'Downlight del quiosc · Kiosk downlight', LK.cyl(0.0, -HT + 0.35, H_ROOF - 0.03, 0.09, 0.03), STREET, 'light',
  am('light', 'LED downlight 18 W, IP66', 12, 5, owner=FGC), SRC_TYP, predefined='POINTSOURCE',
  object_type='LED downlight over the landing door', parent=kio, psets=spec(Power_W=18, LuminousFlux_lm=2100),
  common={'NumberOfSources': 1, 'TotalWattage': 18.0, 'LightFixtureMountingType': 'RECESSED'})
# roof lightbox: the TMB diamond on the long faces, the FGC panel on the short ones
E('IfcSign', 'Caixa lluminosa · Roof lightbox', LK.box(-0.45, 0.45, -0.30, 0.30, H_ROOF + 0.25, 0.32), STREET, 'white',
  am('sign', 'Back-lit roof lightbox 900×600×320, opal', 12, 5, owner=FGC), SRC_MESH, predefined='PICTORAL',
  object_type='Back-lit roof sign, opal', parent=kio, extra_common={'IsExternal': True, 'Category': 'Identification'})
zc = H_ROOF + 0.25 + 0.16
dia = [(-0.13, zc), (0.0, zc - 0.13), (0.13, zc), (0.0, zc + 0.13)]
E('IfcSign', 'Rombes «M» de la caixa · Metro diamonds', [LK.side([(s + 0.0, z) for s, z in dia], t, 0.01) for t in (-0.305, 0.305)],
  STREET, 'tmb_red', am('sign', 'Metro diamond 260 mm, vinyl on opal', 12, 5, owner=TMB), SRC_TYP, predefined='MARKER',
  object_type='Metro diamond, both long faces', parent=kio)
E('IfcSign', 'Panells FGC de la caixa · FGC panels', [LK.cross([(-0.22, zc - 0.10), (0.22, zc - 0.10), (0.22, zc + 0.10), (-0.22, zc + 0.10)], s, 0.01)
                                                       for s in (-0.455, 0.455)],
  STREET, 'fgc', am('sign', 'FGC brand panel 440×200, vinyl on opal', 12, 5, owner=FGC), SRC_TYP, predefined='MARKER',
  object_type='FGC brand colour panel, both short faces', parent=kio)
# landing doors (street), with frames, call station, intercom, accessibility pictogram
door = E('IfcDoor', 'Portes de replà (carrer) · Landing doors, street',
         [LK.box(-0.46, 0.0, -HT - 0.01, -HT + 0.02, 0.04, 2.10), LK.box(0.0, 0.46, -HT - 0.04, -HT - 0.01, 0.04, 2.10)],
         STREET, 'glass_lift', am('lift', 'Glazed 2-panel telescopic landing door 900 × 2 100', 1, 4, DoorCyclesSinceService=19840),
         SRC_OSM_PATH, predefined='DOOR', object_type='Glazed telescopic landing doors 900 × 2 100, facing the sidewalk',
         parent=lift, psets=spec(ClearOpening_mm=900, FireRating='E 30'), common={'HandicapAccessible': True, 'IsExternal': True})
door.OperationType = 'DOUBLE_DOOR_SLIDING'
door.OverallWidth, door.OverallHeight = 0.92, 2.10
E('IfcMember', 'Marcs de les portes · Door frames',
  [LK.box(s - 0.04, s + 0.04, -HT - 0.03, -HT + 0.05, 0.04, 2.16) for s in (-0.50, 0.50)] +
  [LK.box(-0.54, 0.54, -HT - 0.03, -HT + 0.05, 2.14, 0.10)], STREET, 'inox', am('lift', 'Door frame, brushed stainless', 6, 4),
  SRC_TYP, predefined='MULLION', object_type='Landing door portal, brushed stainless', parent=lift)
E('IfcSwitchingDevice', 'Botonera de replà · Landing call station', LK.box(0.62, 0.76, -HT - 0.035, -HT - 0.005, 0.90, 0.30), STREET,
  'inox', am('lift', 'Landing call station, Braille, acoustic signal', 3, 5), SRC_TYP, predefined='MOMENTARYSWITCH',
  object_type='Landing call button at 1 000 mm, Braille, acoustic signal', parent=lift,
  psets=spec(Braille=True, MountingHeight_mm=1000), electrical={'RatedVoltage': 24.0})
E('IfcCommunicationsAppliance', 'Interfon d\'emergència · Emergency intercom', LK.box(0.62, 0.76, -HT - 0.035, -HT - 0.005, 1.28, 0.18),
  STREET, 'inox', am('lift', 'Emergency intercom, 4G + PSTN, induction loop', 1, 5, LastTestCall='2026-09-28'), SRC_TYP,
  predefined='USERDEFINED', object_type='Emergency intercom to the FGC control centre, induction loop', parent=lift,
  psets=spec(Link='4G + PSTN backup', InductionLoop=True), electrical={'RatedVoltage': 24.0})
E('IfcSign', 'Pictograma d\'accessibilitat · ISA pictogram', LK.box(-0.78, -0.60, -HT - 0.03, -HT - 0.01, 1.45, 0.18), STREET,
  'access_blue', am('sign', 'ISA pictogram 180×180', 24, 5, owner=FGC), SRC_TYP, predefined='PICTORAL',
  object_type='International Symbol of Access', parent=lift, extra_common={'IsExternal': True, 'Category': 'Accessibility'})
# car, car doors, rails, machine
CT = -0.20                            # car centre line: its sill 30 mm from the landing doors
car = [LK.box(s - 0.03, s + 0.03, CT - 0.70, CT + 0.70, 0.0, 2.28) for s in (-0.58, 0.58)]
car += [LK.box(-0.61, 0.61, CT - 0.73, CT + 0.73, -0.10, 0.10), LK.box(-0.61, 0.61, CT - 0.73, CT + 0.73, 2.25, 0.12),
        LK.box(-0.61, 0.61, CT + 0.67, CT + 0.73, 0.0, 2.30)]
E('IfcTransportElement', 'Cabina de l\'ascensor · Lift car', car, STREET, 'inox',
  am('lift', 'Panoramic car 1 100 × 1 400, stainless frame', 1, 4, DoorCyclesSinceService=19840, MotorStartsTotal=412300),
  SRC_TYP, predefined='ELEVATOR', object_type='Panoramic car 1 100 × 1 400 (EN 81-70 type 2)', parent=lift,
  psets={**spec(Finish='Brushed stainless, glass side walls, granite floor', Mirror='Rear wall, from 900 mm'),
         'Pset_TransportElementElevator': {'FireFightingLift': False, 'ClearWidth': 1.10, 'ClearDepth': 1.40, 'ClearHeight': 2.20}},
  extra_common={'CapacityPeople': 13, 'CapacityWeight': 1000.0, 'FireExit': False})
E('IfcPlate', 'Parets de vidre de la cabina · Car glazing', [LK.box(s - 0.01, s + 0.01, CT - 0.66, CT + 0.66, 0.06, 2.12) for s in (-0.55, 0.55)],
  STREET, 'glass_lift', am('lift', 'Car glazing, laminated 6+6', 6, 4), SRC_TYP, predefined='CURTAIN_PANEL',
  object_type='Car side glazing, laminated 6+6', parent=lift)
cd = E('IfcDoor', 'Portes de cabina · Car doors', [LK.box(-0.46, 0.0, CT - 0.76, CT - 0.74, 0.0, 2.10), LK.box(0.0, 0.46, CT - 0.79, CT - 0.77, 0.0, 2.10)],
       STREET, 'inox', am('lift', 'Car door 2-panel telescopic, light curtain', 1, 4), SRC_TYP, predefined='DOOR',
       object_type='Stainless telescopic car doors with full-height light curtain', parent=lift,
       common={'HandicapAccessible': True, 'IsExternal': False})
cd.OperationType = 'DOUBLE_DOOR_SLIDING'
E('IfcRailing', 'Passamà de la cabina · Car handrail', [rod(LK.p3(-0.50, CT + 0.62, 0.90), LK.p3(0.50, CT + 0.62, 0.90), 0.018)] +
  [rod(LK.p3(s, CT + 0.67, 0.90), LK.p3(s, CT + 0.62, 0.90), 0.008) for s in (-0.45, 0.45)], STREET, 'inox',
  am('lift', 'Car handrail Ø35', 12, 5), SRC_TYP, predefined='HANDRAIL', object_type='Car handrail Ø35 at 900 mm', parent=lift,
  common={'Height': 0.90, 'Diameter': 0.035})
E('IfcSwitchingDevice', 'Botonera de cabina (COP) · Car operating panel', LK.box(-0.57, -0.53, CT - 0.42, CT - 0.25, 0.85, 0.45), STREET, 'inox',
  am('lift', 'Car operating panel, Braille, voice announcer ca/es/en', 6, 5), SRC_TYP, predefined='MOMENTARYSWITCH',
  object_type='Car operating panel, Braille, voice announcer', parent=lift,
  psets=spec(Braille=True, VoiceAnnouncement='ca/es/en'), electrical={'RatedVoltage': 24.0})
E('IfcMember', 'Guies de la cabina · Car guide rails', [LK.box(s - 0.04, s + 0.04, CT - 0.06, CT + 0.06, Z_LOW - 1.20, -Z_LOW + 1.20 + H_ROOF - 0.40)
                                                         for s in (-0.80, 0.80)],
  STREET, 'steel', am('lift', 'Machined guide rail T89/B', 12, 4), SRC_TYP, predefined='USERDEFINED',
  object_type='Machined guide rail T89/B', parent=lift)
E('IfcDiscreteAccessory', 'Contrapès · Counterweight', [LK.box(-0.45, 0.45, 0.62, 0.80, Z_LOW - 0.60, 2.20)] +
  [LK.box(s - 0.03, s + 0.03, 0.66, 0.76, Z_LOW - 1.20, -Z_LOW + 1.20 + H_ROOF - 0.40) for s in (-0.52, 0.52)], STREET, 'steel',
  am('lift', 'Counterweight frame with cast-iron fillers, 1 450 kg, and its rails', 12, 4), SRC_TYP, predefined='USERDEFINED',
  object_type='Counterweight at the bottom of its travel (car at street level) and its guide rails', parent=lift)
E('IfcElectricAppliance', 'Màquina de tracció · Gearless machine', LK.box(-0.35, 0.35, 0.78, 1.10, H_ROOF - 0.55, 0.38), STREET,
  'steel', am('lift', 'Permanent-magnet gearless machine 6.6 kW', 3, 4, MotorHours=10450), SRC_TYP, predefined='USERDEFINED',
  object_type='Permanent-magnet gearless machine in the kiosk head', parent=lift,
  psets=spec(Power_kW=6.6, Ropes='Coated steel belts'), electrical={'RatedVoltage': 400.0, 'RatedPowerInput': 6.6})
E('IfcElectricAppliance', 'Quadre de maniobra · Controller cabinet', LK.box(HS - 0.42, HS - 0.12, HT - 0.42, HT - 0.12, H_ROOF - 0.95, 0.70),
  STREET, 'steel', am('lift', 'Lift controller, VVVF, remote monitoring', 3, 4, FirmwareVersion='4.12.1'), SRC_TYP,
  predefined='USERDEFINED', object_type='Controller cabinet with remote monitoring (4G)', parent=lift,
  electrical={'RatedVoltage': 400.0})
# shaft below the pavement
shaft = m.assembly('Fossat de l\'ascensor · Lift shaft', VEST, object_type='Lift shaft',
                   psets=am('civil', 'RC lift shaft (asset group)', 24, 4, owner=FGC))
z_pit = Z_LOW - 1.20
sh_h = -0.05 - z_pit
other = [LK.box(-HS, HS, HT - 0.25, HT, z_pit, sh_h)] + [LK.box(s0, s1, -HT, HT, z_pit, sh_h) for s0, s1 in ((-HS, -HS + 0.25), (HS - 0.25, HS))]
E('IfcWall', 'Murs del fossat · Shaft walls', other, VEST, 'concrete', am('civil', 'RC shaft wall 250 mm', 24, 4, owner=FGC),
  SRC_BELOW, predefined='SHEAR', object_type='RC shaft walls 250 mm (north, east, west)', parent=shaft)
south = E('IfcWall', 'Mur del fossat amb porta · Shaft wall with landing door', [LK.box(-HS, HS, -HT, -HT + 0.25, z_pit, sh_h)], VEST,
          'concrete', am('civil', 'RC shaft wall 250 mm', 24, 4, owner=FGC), SRC_BELOW, predefined='SHEAR',
          object_type='RC shaft wall 250 mm facing the lobby', parent=shaft)
d2 = E('IfcDoor', 'Portes de replà (vestíbul) · Landing doors, level −1',
       [LK.box(-0.46, 0.0, -HT + 0.05, -HT + 0.08, Z_LOW, 2.10), LK.box(0.0, 0.46, -HT + 0.01, -HT + 0.04, Z_LOW, 2.10)],
       VEST, 'inox', am('lift', 'Stainless 2-panel telescopic landing door 900 × 2 100', 1, 4), SRC_BELOW, predefined='DOOR',
       object_type='Stainless telescopic landing doors 900 × 2 100, facing the lobby', parent=shaft,
       common={'HandicapAccessible': True, 'IsExternal': False})
d2.OperationType = 'DOUBLE_DOOR_SLIDING'
d2.OverallWidth, d2.OverallHeight = 0.92, 2.10
m.opening(south, LK.box(-0.50, 0.50, -HT - 0.05, -HT + 0.30, Z_LOW, 2.16), filler=d2)
E('IfcSlab', 'Llosa del pou · Pit slab', LK.box(-HS - 0.15, HS + 0.15, -HT - 0.15, HT + 0.15, z_pit - 0.30, 0.30), VEST, 'concrete',
  am('civil', 'RC pit slab 300 mm, 1.2 m pit with buffers', 24, 4, owner=FGC), SRC_BELOW, predefined='BASESLAB',
  object_type='Pit slab, 1.2 m pit with buffers', parent=shaft)
E('IfcDiscreteAccessory', 'Amortidors del pou · Pit buffers', [LK.cyl(s, 0.0, z_pit, 0.08, 0.45) for s in (-0.30, 0.30)], VEST, 'rubber',
  am('lift', 'Polyurethane buffer Ø160', 12, 4), SRC_BELOW, predefined='USERDEFINED', object_type='Car buffers', parent=shaft)
E('IfcSwitchingDevice', 'Botonera de replà (vestíbul) · Call station, level −1',
  ST.box(SHAFT_S[0] + 2.02, SHAFT_S[0] + 2.16, SHAFT_T0 - 0.03, SHAFT_T0, Z_LOW + 0.90, 0.30), VEST, 'inox',
  am('lift', 'Landing call station, Braille, acoustic signal', 3, 5), SRC_BELOW, predefined='MOMENTARYSWITCH',
  object_type='Landing call button at 1 000 mm, Braille', parent=shaft, electrical={'RatedVoltage': 24.0})

# ═══ 4. Signage totem ═════════════════════════════════════════════════════════════════════════════
TT = Frame((SITE['totem']['x'], SITE['totem']['y']), BEARING, 0.)      # faces look along ±s (up and down Pelai)
tot = m.assembly('Tòtem de senyalització TMB · FGC · Signage totem', None, object_type='Entrance signage totem', parent=acc,
                 psets={**spec(Height_mm=3100, Illuminated=True, Faces='Two (towards Pl. Universitat and La Rambla)'),
                        **am('sign', 'Entrance totem TMB-FGC (asset group)', 12, 4)})
E('IfcSlab', 'Base del tòtem · Totem base', TT.box(-0.20, 0.20, -0.32, 0.32, -0.02, 0.06), STREET, 'granite_dark',
  am('sign', 'Granite base 400×640', 24, 4), SRC_TYP, predefined='BASESLAB', object_type='Granite base plate', parent=tot)
E('IfcMember', 'Cos del tòtem · Totem body', [TT.box(-0.07, 0.07, -0.24, 0.24, 0.04, 2.36)], STREET, 'steel',
  am('sign', 'Folded steel body 140×480, anthracite', 24, 4), SRC_MESH, predefined='POST',
  object_type='Folded steel totem body with service door', parent=tot)
diamond = [(-0.30, 2.70), (0.0, 2.40), (0.30, 2.70), (0.0, 3.00)]
E('IfcSign', 'Rombe «M» · Metro diamond', TT.cross(diamond, 0., 0.10), STREET, 'tmb_red',
  am('sign', 'Back-lit metro diamond 600×600', 12, 5, owner=TMB), SRC_MESH, predefined='PICTORAL',
  object_type='Back-lit metro diamond', parent=tot, psets=spec(Illumination='LED, dusk-to-dawn'),
  extra_common={'IsExternal': True, 'Category': 'Identification'})
M_LETTER = [(-0.15, 2.57), (-0.10, 2.57), (-0.10, 2.76), (0.0, 2.65), (0.10, 2.76), (0.10, 2.57), (0.15, 2.57),
            (0.15, 2.84), (0.10, 2.84), (0.0, 2.73), (-0.10, 2.84), (-0.15, 2.84)]
E('IfcSign', 'Lletra «M» (dues cares) · Letter M', [TT.cross(M_LETTER, s, 0.012) for s in (-0.056, 0.056)], STREET, 'white',
  am('sign', 'Letter M, opal acrylic', 12, 5, owner=TMB), SRC_TYP, predefined='MARKER', object_type='Letter M, both faces', parent=tot)
E('IfcSign', 'Panell FGC · FGC panel', [TT.cross([(-0.24, 2.05), (0.24, 2.05), (0.24, 2.34), (-0.24, 2.34)], s, 0.02) for s in (-0.08, 0.08)],
  STREET, 'fgc', am('sign', 'FGC brand panel 480×290, back-lit', 12, 5, owner=FGC), SRC_TYP, predefined='PICTORAL',
  object_type='FGC brand colour panel (logo not modelled), both faces', parent=tot,
  extra_common={'IsExternal': True, 'Category': 'Identification'})
E('IfcSign', 'Franja «FGC» · FGC lettering band', [TT.cross([(-0.17, 2.15), (0.17, 2.15), (0.17, 2.24), (-0.17, 2.24)], s, 0.006) for s in (-0.093, 0.093)],
  STREET, 'white', am('sign', 'Lettering band, opal', 12, 5, owner=FGC), SRC_TYP, predefined='MARKER',
  object_type='White band standing in for the FGC lettering', parent=tot)
E('IfcSign', 'Placa «Catalunya» · Station name plate', [TT.cross([(-0.24, 1.72), (0.24, 1.72), (0.24, 1.94), (-0.24, 1.94)], s, 0.02) for s in (-0.08, 0.08)],
  STREET, 'navy', am('sign', 'Station name plate 480×220', 24, 5), SRC_TYP, predefined='PICTORAL',
  object_type='Station name plate «Catalunya», both faces', parent=tot, psets=spec(Text='Catalunya'))
for k, (mat, label) in enumerate((('l1', 'L1'), ('l3', 'L3'), ('fgc', 'FGC'))):
    cx, cy = TT.P(0., -0.15 + k * 0.15)
    E('IfcSign', f'Distintiu de línia {label} · Line badge {label}',
      [disc((cx, cy, 1.55), (TT.u[0], TT.u[1], 0.), 0.055, 0.18)], STREET, mat,
      am('sign', 'Line badge Ø110, both faces', 24, 5, owner=FGC if label == 'FGC' else TMB), SRC_TYP,
      predefined='MARKER', object_type='Line badge Ø110', parent=tot)
E('IfcSign', 'Pictograma d\'accessibilitat del tòtem · ISA pictogram', [TT.cross([(-0.08, 1.28), (0.08, 1.28), (0.08, 1.44), (-0.08, 1.44)], s, 0.01)
                                                                       for s in (-0.075, 0.075)],
  STREET, 'access_blue', am('sign', 'ISA pictogram 160×160', 24, 5), SRC_TYP, predefined='PICTORAL',
  object_type='ISA pictogram: step-free access by the lift', parent=tot)
E('IfcAudioVisualAppliance', 'Pantalla d\'informació · Passenger information display', TT.box(0.07, 0.085, -0.20, 0.20, 0.70, 0.45),
  STREET, 'display', am('sign', 'TFT 24", sunlight-readable, IP65', 6, 4, FirmwareVersion='2.3.0', Uptime_pct_30d=99.4),
  SRC_TYP, predefined='DISPLAY', object_type='Service status display (lift availability, line status)', parent=tot,
  psets=spec(Feed='TMB / FGC service status', Languages='ca/es/en'))

# ═══ 5. Pavement: tactile guidance, lift threshold drain, bollard lights ══════════════════════════
pav = m.assembly('Paviment i enllumenat de l\'entorn · Pavement and lighting', STREET, object_type='Public realm',
                 psets=am('pavement', 'Pavement around the entrance (asset group)', 12, 4))
_sw_s, _sw_t = LK.local(-0.2, -4.8)        # where the lift footway meets the sidewalk line (OSM)
E('IfcCovering', 'Franja podotàctil d\'encaminament · Tactile guidance strip',
  [LK.box(-0.20, 0.20, _sw_t, -HT - 1.40, PATCH_TOP, 0.012)], STREET, 'tactile_guide',
  am('pavement', 'Tactile guidance tile 40×40, grooves', 12, 4), SRC_OSM_PATH, predefined='FLOORING',
  object_type='Directional tactile strip 400 mm from the sidewalk line to the lift', parent=pav,
  psets=spec(Width_mm=400, Standard='Orden TMA/851/2021'))
E('IfcCovering', 'Paviment podotàctil davant l\'ascensor · Tactile field at the lift door',
  [LK.box(-0.60, 0.60, -HT - 1.40, -HT - 0.20, PATCH_TOP, 0.012)], STREET, 'tactile',
  am('pavement', 'Tactile warning tile 40×40, studs', 12, 4), SRC_OSM_PATH, predefined='FLOORING',
  object_type='Tactile attention field 1 200 × 1 200 in front of the lift door', parent=pav)
E('IfcPipeSegment', 'Canal del llindar de l\'ascensor · Lift threshold drain',
  [LK.box(-0.60, 0.60, -HT - 0.20, -HT - 0.08, -0.12, 0.13)], STREET, 'polymer',
  am('drain', 'Slot channel 100 mm, class C250', 6, 4), SRC_TYP, predefined='GUTTER',
  object_type='Slot channel drain keeping water off the lift threshold', parent=pav,
  psets=spec(Width_mm=100, LoadClass='C250 (EN 1433)'))
E('IfcDiscreteAccessory', 'Reixa del canal de l\'ascensor · Threshold grating', [LK.box(-0.60, 0.60, -HT - 0.20, -HT - 0.08, PATCH_TOP - 0.010, 0.012)],
  STREET, 'inox', am('drain', 'Slot grating, stainless', 6, 4), SRC_TYP, predefined='USERDEFINED',
  object_type='Stainless slot grating', parent=pav)
for k, (s, t) in enumerate(((S_IN - 0.70, -T_HALF - 0.45), (S_IN - 0.70, T_HALF + 0.45)), 1):
    x, y = ST.P(s, t)
    E('IfcLightFixture', f'Balisa {k} · Bollard light {k}',
      [m.cylinder(x, y, 0.0, 0.085, 0.72), m.cylinder(x, y, 0.72, 0.08, 0.12), m.cylinder(x, y, 0.84, 0.095, 0.06)],
      STREET, 'steel', am('street_light', 'LED bollard 900 mm 12 W, IK10, 3000 K', 12, 5 if k == 1 else 4,
                          Note=None if k == 1 else 'Diffuser scuffed, still working (demo)'),
      SRC_TYP, predefined='POINTSOURCE', object_type='LED bollard light marking the stair entry', parent=pav,
      psets=spec(Power_W=12, LuminousFlux_lm=900, ColourTemperature_K=3000, Circuit='Enllumenat públic, Pelai (demo)'),
      common={'NumberOfSources': 1, 'TotalWattage': 12.0, 'LightFixtureMountingType': 'FREESTANDING'})
    E('IfcLightFixture', f'Difusor de la balisa {k} · Bollard diffuser {k}', [m.tube(x, y, 0.72, 0.086, 0.07, 0.12)], STREET, 'light',
      am('street_light', 'Opal diffuser ring for bollard', 12, 4), SRC_TYP, predefined='POINTSOURCE',
      object_type='Opal diffuser ring', parent=pav)

# ─── Cut-outs ──────────────────────────────────────────────────────────────────────────────────────
cutout(LK, 'lift kiosk', (-HS - 0.30, HS + 0.30), (-HT - 0.30, HT + 0.30), (CUT_FLOOR, 5.0), patch=True)
cutout(TT, 'signage totem', (-0.45, 0.45), (-0.55, 0.55), (CUT_FLOOR, 3.6), patch=True)
cutout(ST, 'parapet and balustrade', (S_IN - 0.30, S_OUT + 1.40), (-T_HALF - 0.30, T_HALF + 0.30), (CUT_FLOOR, 2.2))
cutout(ST, 'stairwell', (S_IN + 0.05, S_OUT - 0.05), (-T_WALL - 0.10, T_WALL + 0.10), (-7.0, -0.07))

# Asset groups carry no geometry of their own; their provenance points at their parts.
for asm in f.by_type('IfcElementAssembly'):
    m.pset(asm, 'Pset_CDE_Provenance', {'GeometrySource': 'Asset group: no geometry of its own, see its parts',
                                        'Confidence': 'Medium', 'Reference': 'OSM node 4582874448 (ODbL); ICGC Scene-28'})

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'pelai-entrance.ifc')
m.finish(out)
cut_path = os.path.splitext(out)[0] + '_cutouts.json'
json.dump({'cdeMeshCutouts': {'version': 1, 'anchor': {'lon': LON0, 'lat': LAT0, 'height': RAW0},
                              'note': 'Boxes in metres: s along bearing (deg clockwise from north), t to its left, z above the '
                                      'anchor height (the tileset anchor, before the scene placement offset).',
                              'boxes': CUTOUTS}}, open(cut_path, 'w'), indent=1)
print('written', out, len(f.by_type('IfcProduct')), 'products,', len(CUTOUTS), 'cut-outs ->', cut_path)
print('stair: rise', round(-Z_LOW, 3), 'flight 2 foot s', round(F2_S1, 2), 'shaft south face t', round(SHAFT_T0, 2),
      'shaft s', [round(v, 2) for v in SHAFT_S])
