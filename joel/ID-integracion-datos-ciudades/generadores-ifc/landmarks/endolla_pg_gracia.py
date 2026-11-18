"""Punt de recàrrega Endolla — Passeig de Gràcia: an on-street EV charging point as an authored IFC4X3 model.

What it holds, all within 15 m of OSM node 5310083454 (amenity=charging_station, capacity 2, operator Endolla
Barcelona), on the south-west side of the Passeig de Gràcia carriageway just north of Plaça de Catalunya:
  * two parallel charging bays in the carriageway along the island kerb, with green EV surfacing, bay lines and
    the EV pictogram, the granite kerb, the concrete gutter and a kerb build-out closing the bays at the crossing;
  * two slim charging pedestals (1.6 m): housing, cap, status light bar, screen, RFID reader, emergency stop,
    a Type 2 (AC) and a CCS2 (DC) tethered connector each, parked in their holsters, with cables, glands,
    service panel, labels, base plate, anchor bolts and concrete pad footing;
  * the feeder pillar that supplies them: GRP enclosure on a concrete plinth, door with a meter window (the
    door outline and the meter behind it are visible), mounting plate, DIN rails, CGP fuses, energy meter,
    main switch-disconnector, surge protection, one MCB and one Type B RCD per pedestal, 4G router;
  * the buried installation: corrugated HDPE ducts at 0.6-0.75 m, the cables in them, a draw pit, the earth
    conductor and the warning tape above the ducts;
  * protective bollards and the EV parking sign with its supplementary plate.

Detailed geometry (roughly LOD 400) carrying LOD 500-style asset data, so a click on any element shows what an
as-built asset register would hold. It is NOT the owner's as-built model and every asset value is invented:
each element says so in Pset_CDE_AssetManagement (demo), Pset_CDE_EVCharging (demo) and Pset_CDE_Provenance.
Manufacturers, models and serial numbers are placeholders, not the installed products.

What is real:
  * the position and capacity from OpenStreetMap (© OpenStreetMap contributors, ODbL): node 5310083454, the
    carriageway axis (ways 549518619, 315739558), the side lane (way 295268540), the traffic island (way
    667709530: its south tip and its tree row) and the signalled crossing south-east of the bays;
  * the ICGC photogrammetric Barcelona mesh (3D Tiles «Scene-28»): the pavement level at the node (70.40 m
    ellipsoidal) and two lumps at the island kerb, 3.1 m apart, read as the two pedestals
    (landmarks/endolla_pg_gracia_site.json).
What is approximated: OSM puts the island's carriageway edge 5.4 m south-west of the node; the mesh puts the
pedestal lumps 4.0 m south-west of it. The model follows the mesh: the kerb face runs 3.45 m south-west of the
node, parallel to Passeig de Gràcia (136.8°), so the node itself falls in the bays. The mesh resolves no kerb
step; the road is set 0.16 m below the pavement. Everything below the pavement, all sections, materials,
equipment and electrical data are typical, not measured.

Local axes: +x east, +y north, metres, origin at OSM node 5310083454, z = 0 on the island pavement there, which
the ICGC mesh puts at 70.40 m ellipsoidal (≈ 20.70 m above the Alicante datum: EGM08 undulation ≈ 49.70 m).
Plan frame K: s along 136.8° (towards Plaça de Catalunya, the traffic direction of the bay lane), t to its left
(north-east, towards the carriageway).

Scene tiles: anchored at h = 70.40 (the raw, ellipsoidal mesh height) and linked with the same placement as the
ICGC mesh, ELLIPSOIDAL −49.70, so model and mesh move together if that offset is ever corrected.

usage: uv run --with ifcopenshell --with pyproj python landmarks/endolla_pg_gracia.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/endolla-pg-gracia.ifc src/endolla-pg-gracia_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/endolla-pg-gracia_qto.ifc \
           tiles/barcelona-endolla-pg-gracia 41.388421 2.169485 70.40 0 --keep-origin \
           --wfs tiles/wfs/barcelona-endolla-pg-gracia --wfs-name barcelona_endolla_pg_gracia_features \
           --extras src/endolla-pg-gracia_cutouts.json
"""
import json, math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model, _guid  # noqa: E402
from pyproj import Transformer  # noqa: E402

HERE = os.path.dirname(__file__)
SITE = json.load(open(os.path.join(HERE, 'endolla_pg_gracia_site.json'), encoding='utf-8'))
LAT0, LON0 = SITE['origin']['lat'], SITE['origin']['lon']
RAW0 = SITE['datum_raw_ellipsoidal']
ELEV0 = round(RAW0 + SITE['icgc_offset_m'], 2)          # ≈ orthometric (Alicante): 20.70
BCN_CRS = (25831, 'ETRS89 / UTM zone 31N', 'ETRS89', 'Alicante (REDNAP)')
MD = SITE['model']

m = Model('Punt de recàrrega Endolla — Passeig de Gràcia', 'Passeig de Gràcia, at Plaça de Catalunya',
          'Punt de recàrrega de vehicles elèctrics · EV charging point', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 model (≈LOD 400 geometry, LOD 500-style asset data with demo values) of an '
                      'on-street EV charging point. Position © OpenStreetMap contributors (ODbL); level and pedestal '
                      'positions read on the ICGC 3D mesh. Not the owner\'s as-built model.',
          tag_prefix='EPGR', crs=BCN_CRS, schema='IFC4X3_ADD2')

# The model's +y is true north; UTM grid north is not. Give the map conversion the grid direction of +x.
_tr = Transformer.from_crs(4326, 25831, always_xy=True)
_e0, _n0 = _tr.transform(LON0, LAT0)
_e1, _n1 = _tr.transform(LON0, LAT0 + 100 / 110574)
_alpha = math.atan2(_e1 - _e0, _n1 - _n0)              # grid azimuth of true north
_mc = m.f.by_type('IfcMapConversion')[0]
_mc.XAxisAbscissa, _mc.XAxisOrdinate = math.cos(_alpha), -math.sin(_alpha)

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('concrete', 'Concrete C25/30, cast in place', (0.70, 0.69, 0.66), 'Concrete', 2400, 'Foundations and plinths')
M('lean', 'Lean concrete HM-20 surround', (0.62, 0.61, 0.58), 'Concrete', 2300, 'Duct bed and surround')
M('granite_dark', 'Granite kerb, flamed, dark grey', (0.33, 0.33, 0.34), 'Stone', 2700, 'Kerbs')
M('gutter', 'Precast concrete gutter (rigola), white-grey', (0.78, 0.77, 0.74), 'Concrete', 2400)
M('panot', 'Hydraulic panot paving 20×20, grey', (0.80, 0.79, 0.76), 'Concrete', 2300, 'Barcelona standard pavement')
M('asphalt', 'Asphalt wearing course AC 16 surf', (0.20, 0.20, 0.21), 'Asphalt', 2400)
M('green_resin', 'Coloured MMA resin surfacing, EV green', (0.18, 0.58, 0.36), 'Polymer', 1800)
M('marking', 'Road marking, white thermoplastic', (0.96, 0.96, 0.95), 'Polymer', 2000)
M('housing', 'Powder-coated aluminium, signal white', (0.95, 0.95, 0.94), 'Aluminium', 2700, 'Pedestal housing')
M('cap', 'UV-stable polycarbonate cap, anthracite', (0.17, 0.18, 0.20), 'Plastic', 1200)
M('livery', 'Operator livery panel, teal', (0.00, 0.55, 0.58), 'Aluminium', 2700)
M('display', 'TFT display, black optically bonded glass', (0.05, 0.06, 0.07), 'Glass', 2500)
M('led_green', 'LED light guide, green (available)', (0.15, 0.85, 0.35), 'Plastic', 1200)
M('connector', 'Connector body, black PA66 GF', (0.08, 0.08, 0.09), 'Plastic', 1400)
M('pins', 'Silver-plated copper contacts', (0.82, 0.80, 0.76), 'Copper', 8900)
M('cable', 'EV charging cable sheath, black TPU', (0.06, 0.06, 0.06), 'Rubber', 1300)
M('holster', 'Holster, grey PC/ABS', (0.38, 0.39, 0.41), 'Plastic', 1150)
M('estop_red', 'Emergency stop actuator, red', (0.82, 0.08, 0.08), 'Plastic', 1200)
M('estop_yellow', 'Emergency stop backplate, yellow', (0.98, 0.80, 0.05), 'Plastic', 1200)
M('steel_galv', 'Hot-dip galvanised steel', (0.62, 0.64, 0.66), 'Steel', 7850)
M('stainless', 'Stainless steel A4', (0.78, 0.79, 0.80), 'Steel', 8000)
M('grp', 'GRP enclosure, light grey RAL 7035', (0.80, 0.81, 0.79), 'Polymer', 1800, 'Glass-fibre reinforced polyester')
M('gasket', 'EPDM gasket, black', (0.05, 0.05, 0.05), 'Rubber', 1200)
M('window', 'Polycarbonate viewing window, clear', (0.80, 0.88, 0.90), 'Plastic', 1200, transparency=0.6)
M('din_grey', 'Modular device housing, light grey', (0.86, 0.86, 0.84), 'Plastic', 1400)
M('meter', 'Meter housing, off-white', (0.92, 0.91, 0.86), 'Plastic', 1400)
M('switch_red', 'Switch handle, red', (0.80, 0.10, 0.10), 'Plastic', 1200)
M('mount', 'Mounting plate, galvanised steel', (0.70, 0.71, 0.72), 'Steel', 7850)
M('cast_iron', 'Ductile cast iron, painted dark grey', (0.20, 0.20, 0.21), 'Iron', 7200)
M('duct', 'Corrugated HDPE duct, red', (0.72, 0.12, 0.10), 'Polymer', 950)
M('copper', 'Bare copper', (0.72, 0.45, 0.20), 'Copper', 8900)
M('tape', 'Warning tape, yellow PE', (0.98, 0.82, 0.10), 'Polymer', 950)
M('sign_blue', 'Retro-reflective sign face, blue', (0.05, 0.30, 0.65), 'Aluminium', 2700)
M('sign_white', 'Retro-reflective sign face, white', (0.96, 0.96, 0.96), 'Aluminium', 2700)
M('black', 'Polymer, black', (0.10, 0.10, 0.11), 'Plastic', 1200)
M('label', 'Anodised aluminium label', (0.85, 0.86, 0.87), 'Aluminium', 2700)

# ─── Geometry helpers (as in the mobility hub) ────────────────────────────────────────────────────
f = m.f


def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def _perp(d):
    a = (0., 0., 1.) if abs(d[2]) < 0.9 else (1., 0., 0.)
    c = (d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0])
    return _unit(c)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _add(p, *vs):
    return tuple(p[i] + sum(v[0] * v[1][i] for v in vs) for i in range(3))


def rod(p0, p1, r, r_in=None):
    """Round bar (or tube) from p0 to p1 (3D points)."""
    d = tuple(b - a for a, b in zip(p0, p1))
    L = math.sqrt(sum(c * c for c in d))
    u = _unit(d)
    prof = (f.createIfcCircleHollowProfileDef('AREA', None, m._pl2(), float(r), float(r - r_in)) if r_in
            else f.createIfcCircleProfileDef('AREA', None, m._pl2(), float(r)))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=u, ref=_perp(u)), f.createIfcDirection((0., 0., 1.)), float(L))


def polyrod(pts, r, joints=True):
    """A bent bar through pts: one rod per leg, plus a sphere at each inner joint so the bends close."""
    out = [rod(a, b, r) for a, b in zip(pts, pts[1:])]
    if joints:
        out += [m.sphere(*p, r, n=8) for p in pts[1:-1]]
    return out


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
    w = _cross(u, v)
    p0 = tuple(ci - wi * dw / 2 for ci, wi in zip(c, w))
    prof = f.createIfcRectangleProfileDef('AREA', None, m._pl2(), float(du), float(dv))
    return f.createIfcExtrudedAreaSolid(prof, m._pl3(*p0, axis=w, ref=u), f.createIfcDirection((0., 0., 1.)), float(dw))


class Frame:
    """A plan frame: s along `bearing` (degrees from north, clockwise), t to its left, z up from `z0`."""

    def __init__(self, origin, bearing, z0=0.):
        b = math.radians(bearing)
        self.o, self.z0, self.bearing = origin, z0, bearing
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

    def sub(self, s, t, z=0.):
        """A frame with the same bearing, its origin at (s, t, z) of this one."""
        return Frame(self.P(s, t), self.bearing, self.z0 + z)

    def box(self, s0, s1, t0, t1, z0, h):
        cx, cy = self.P((s0 + s1) / 2, (t0 + t1) / 2)
        return m.box(cx, cy, self.z0 + z0, abs(s1 - s0), abs(t1 - t0), h, angle=self.ang)

    def cyl(self, s, t, z0, r, h):
        x, y = self.P(s, t)
        return m.cylinder(x, y, self.z0 + z0, r, h)

    def prism(self, pts, z0, h):
        return m.prism([self.P(s, t) for s, t in pts], self.z0 + z0, h)

    def rrect(self, sc, tc, ds, dt, r, z0, h, n=4):
        """Rounded-corner rectangle prism, ds × dt, corner radius r."""
        pts = []
        for cs, ct, a0 in ((ds / 2 - r, dt / 2 - r, 0.), (-ds / 2 + r, dt / 2 - r, 90.), (-ds / 2 + r, -dt / 2 + r, 180.),
                           (ds / 2 - r, -dt / 2 + r, 270.)):
            for k in range(n + 1):
                a = math.radians(a0 + 90. * k / n)
                pts.append((sc + cs + r * math.cos(a), tc + ct + r * math.sin(a)))
        return self.prism(pts, z0, h)

    def frustum(self, sc, tc, z0, ds, dt, h, inset_s, inset_t):
        x, y = self.P(sc, tc)
        return m.frustum(x, y, self.z0 + z0, ds, dt, h, inset_s, inset_t, angle=self.ang)

    def side(self, pts, t, width):
        """Polygon [(s, z)] in the vertical plane at t, `width` thick across it."""
        x, y = self.P(0, t)
        return m.extrude_vertical_profile([(s, z) for s, z in pts], (x, y, self.z0), self.u, width)

    def cross(self, pts, s, width):
        """Polygon [(t, z)] in the vertical plane at s, `width` thick along s."""
        x, y = self.P(s, 0)
        return m.extrude_vertical_profile([(t, z) for t, z in pts], (x, y, self.z0), self.L, width)


# ─── Asset data ────────────────────────────────────────────────────────────────────────────────────
DATA_STATUS = 'Illustrative demo values — not the owner\'s as-built register'
BSM = 'Ajuntament de Barcelona / Barcelona de Serveis Municipals (B:SM) — Endolla Barcelona (demo)'
AJ = 'Ajuntament de Barcelona (demo)'
EV_MAINT = 'EV charging maintenance contractor (demo)'
ROAD_MAINT = 'Public-space maintenance contractor (demo)'
ELEC_MAINT = 'LV installation maintenance contractor (demo)'
LAST_INSP = '2026-08-27'

# kind -> owner, manufacturer, model, installation year, inspection interval (months), warranty (years), contractor, serial code
KINDS = {
    'pedestal': (BSM, 'EVSE manufacturer (demo)', 'Slim street pedestal AC 22 kW + DC 24 kW (demo)', 2021, 6, 5, EV_MAINT, 'EVP'),
    'connector': (BSM, 'Connector manufacturer (demo)', 'Tethered connector, IEC 62196 (demo)', 2021, 3, 3, EV_MAINT, 'CON'),
    'evcable': (BSM, 'Cable manufacturer (demo)', 'EV charging cable, IEC 62893 (demo)', 2021, 3, 3, EV_MAINT, 'EVC'),
    'cabinet': (BSM, 'Enclosure manufacturer (demo)', 'GRP feeder pillar 800 × 350 × 1 250 (demo)', 2021, 12, 10, ELEC_MAINT, 'CAB'),
    'switchgear': (BSM, 'Switchgear manufacturer (demo)', 'Modular DIN-rail device (demo)', 2021, 12, 5, ELEC_MAINT, 'SWG'),
    'meter': (BSM, 'Meter manufacturer (demo)', 'Three-phase smart energy meter, MID class B (demo)', 2021, 12, 5, ELEC_MAINT, 'MTR'),
    'comms': (BSM, 'Network equipment manufacturer (demo)', 'Industrial 4G router (demo)', 2023, 12, 3, EV_MAINT, 'NET'),
    'civil': (BSM, 'Civil works contractor (demo)', 'Cast in place (demo)', 2021, 60, 10, ELEC_MAINT, 'CIV'),
    'duct': (BSM, 'Duct manufacturer (demo)', 'Corrugated twin-wall HDPE, EN 61386-24 (demo)', 2021, 60, 10, ELEC_MAINT, 'DCT'),
    'lvcable': (BSM, 'Cable manufacturer (demo)', 'RZ1-K 0.6/1 kV (demo)', 2021, 60, 10, ELEC_MAINT, 'LVC'),
    'road': (AJ, 'Paving contractor (demo)', 'Barcelona public-space standard (demo)', 2021, 12, 2, ROAD_MAINT, 'RD'),
    'marking': (AJ, 'Road marking contractor (demo)', 'Thermoplastic / MMA resin (demo)', 2024, 6, 2, ROAD_MAINT, 'MRK'),
    'bollard': (AJ, 'Street furniture manufacturer (demo)', 'Cast-iron bollard Ø 100, Barcelona model (demo)', 2021, 12, 5, ROAD_MAINT, 'BOL'),
    'sign': (AJ, 'Sign manufacturer (demo)', 'Retro-reflective sign, class RA2 (demo)', 2021, 12, 7, ROAD_MAINT, 'SGN'),
}
_serial = {}


def am(kind, condition=4, **extra):
    """Pset_CDE_AssetManagement (demo) plus the standard IFC asset psets, all with invented values."""
    owner, manu, model, year, interval, wy, contractor, code = KINDS[kind]
    n = _serial.get(code, 0) + 1
    _serial[code] = n
    serial = f'{code}-{year % 100:02d}{(n * 7919 + year) % 100000:05d}'
    nxt_y, nxt_m = divmod(8 - 1 + interval, 12)
    nxt = f'{2026 + nxt_y}-{nxt_m + 1:02d}-27'
    base = {'DataStatus': DATA_STATUS, 'AssetOwner': owner, 'Manufacturer': manu, 'Model': model,
            'SerialNumber': serial, 'InstallationYear': year, 'LastInspection': LAST_INSP, 'NextInspection': nxt,
            'InspectionInterval_months': interval, 'ConditionIndex_1to5': condition,
            'WarrantyEnd': f'{year + wy}-06-30', 'MaintenanceContractor': contractor,
            'LifecycleStatus': 'In service', 'MaintenanceStrategy': 'Condition-based'}
    base.update({k: v for k, v in extra.items() if v is not None})
    return {'Pset_CDE_AssetManagement (demo)': base,
            'Pset_ManufacturerTypeInformation': {'Manufacturer': manu, 'ModelLabel': model, 'ProductionYear': str(year)},
            'Pset_ManufacturerOccurrence': {'SerialNumber': serial, 'AcquisitionDate': f'{year}-05-15'},
            'Pset_InstallationOccurrence': {'InstallationDate': f'{year}-06-30', 'PutIntoOperationDate': f'{year}-07-15'},
            'Pset_Warranty': {'WarrantyIdentifier': f'W-{serial}', 'WarrantyStartDate': f'{year}-06-30',
                              'WarrantyPeriod': f'P{wy}Y', 'PointOfContact': contractor},
            'Pset_Condition': {'AssessmentDate': LAST_INSP, 'AssessmentCondition': f'{condition} of 5',
                               'AssessmentType': 'Visual and functional inspection (demo)', 'NextAssessmentDate': nxt}}


def spec(**props):
    return {'Pset_CDE_Specification': props}


def ev(**props):
    return {'Pset_CDE_EVCharging (demo)': {'DataStatus': DATA_STATUS, **props}}


def elec(**props):
    return {'Pset_ElectricalDeviceCommon': props}


# The standard Pset_<Class>Common (or its IFC4X3 equivalent) for the classes ifcbuild.COMMON does not cover.
STD_COMMON = {
    'IfcKerb': ('Pset_KerbCommon', {'CombinedKerbGutter': False, 'Mountable': False}),
    'IfcCourse': ('Pset_CourseCommon', {}),
    'IfcSign': ('Pset_SignCommon', {'IsExternal': True}),
    'IfcCableCarrierSegment': ('Pset_CableCarrierSegmentTypeCommon', {'Status': 'EXISTING'}),
    'IfcCableCarrierFitting': ('Pset_CableCarrierFittingTypeCommon', {'Status': 'EXISTING'}),
    'IfcCableSegment': ('Pset_CableSegmentTypeCommon', {'Status': 'EXISTING'}),
    'IfcCableFitting': ('Pset_CableFittingTypeCommon', {'Status': 'EXISTING'}),
    'IfcElectricDistributionBoard': ('Pset_DistributionBoardTypeCommon', {'Status': 'EXISTING'}),
    'IfcOutlet': ('Pset_OutletTypeCommon', {'Status': 'EXISTING', 'IsPluggableOutlet': False, 'NumberOfSockets': 1}),
    'IfcFooting': ('Pset_FootingCommon', {'Status': 'EXISTING', 'LoadBearing': True}),
    'IfcProtectiveDevice': ('Pset_ProtectiveDeviceTypeCommon', {'Status': 'EXISTING'}),
    'IfcFlowMeter': ('Pset_FlowMeterTypeCommon', {'Status': 'EXISTING', 'ReadOutType': 'DIGITAL', 'RemoteReading': True}),
    'IfcSwitchingDevice': ('Pset_SwitchingDeviceTypeCommon', {'Status': 'EXISTING'}),
    'IfcAudioVisualAppliance': ('Pset_AudioVisualApplianceTypeCommon', {'Status': 'EXISTING'}),
    'IfcCommunicationsAppliance': ('Pset_CommunicationsApplianceTypeCommon', {'Status': 'EXISTING'}),
    'IfcPlate': ('Pset_PlateCommon', {'Status': 'EXISTING', 'IsExternal': True, 'LoadBearing': False}),
    'IfcDiscreteAccessory': ('Pset_ElementComponentCommon', {'Status': 'EXISTING'}),
    'IfcMechanicalFastener': ('Pset_ElementComponentCommon', {'Status': 'EXISTING', 'CorrosionTreatment': 'Hot-dip galvanised'}),
    'IfcDistributionChamberElement': ('Pset_DistributionChamberElementCommon', {'Status': 'EXISTING'}),
    'IfcCovering': ('Pset_CoveringCommon', {'Status': 'EXISTING', 'IsExternal': True}),
    'IfcPavement': ('Pset_PavementCommon', {'Status': 'EXISTING'}),
}

NO_REFERENCE = {'Pset_KerbCommon', 'Pset_CourseCommon'}     # these two carry no Reference property

# ─── Provenance ────────────────────────────────────────────────────────────────────────────────────
NODE_SRC = ('Position: OSM node 5310083454 (ODbL) and the pedestal lumps on the ICGC 3D mesh; shape typical of a slim '
            'on-street pedestal', 'Medium', 'OSM node 5310083454; ICGC Scene-28')
KERB_SRC = ('Line parallel to Passeig de Gràcia (OSM ways 549518619, 667709530, ODbL), offset to the pedestal lumps on '
            'the ICGC mesh; section typical', 'Low', 'OSM ways 549518619, 667709530; ICGC Scene-28')
TYP_SRC = ('Typical dimensions and detailing for this kind of equipment; position from OSM and the ICGC mesh', 'Low')
BELOW_SRC = ('Below the pavement: not visible in any open source; typical for an on-street charging point', 'Low')

# ─── Spatial structure ─────────────────────────────────────────────────────────────────────────────
STREET = 'Nivell carrer · Street level'
BURIED = 'Instal·lacions soterrades · Buried services'
m.storey(STREET, 0., 'Island pavement and carriageway of Passeig de Gràcia')
m.storey(BURIED, -0.60, 'Foundations, ducts and cables below the pavement')

K = Frame((0., 0.), SITE['axis']['bearing_deg'], 0.)
ROAD = -MD['road_below_pavement_m']
KF = MD['kerb_face_t_m']                       # kerb face (road side), t
KB = KF - 0.20                                 # kerb back
BW = MD['bay_width_m']
T_OUT = KF + BW                                # outer edge of the bays
(B1_S0, B1_S1), (B2_S0, B2_S1) = MD['bays_s_m']
BO_S0, BO_S1 = MD['build_out_s_m']
KERB_S0, KERB_S1 = MD['kerb_s_m']


def E(cls, name, items, storey, material, kind, predefined=None, object_type=None, src=TYP_SRC, parent=None,
      psets=None, condition=4, extra=None, common=None, description=None):
    """An element with the full LOD 500-style data: asset management, standard psets, provenance."""
    ps = dict(am(kind, condition, **(extra or {})))
    if cls in STD_COMMON:
        cname, cprops = STD_COMMON[cls]
        ref = {} if cname in NO_REFERENCE else {'Reference': object_type or name}
        ps[cname] = {**ref, **cprops, **(common or {})}
    for k, v in (psets or {}).items():
        ps[k] = {**ps.get(k, {}), **v}
    return m.element(cls, name, items, storey, material, predefined=predefined, object_type=object_type, src=src,
                     parent=parent, psets=ps, description=description,
                     common=common if cls not in STD_COMMON else None)


# ─── Mesh cut-outs ─────────────────────────────────────────────────────────────────────────────────
# The ICGC mesh already holds the real pedestals and the feeder pillar as photogrammetric lumps, and the IFC stands
# inside them. Each box below is where this model replaces the mesh: the scene hides the ground mesh inside it while
# the model is shown (written to tileset.json `extras.cdeMeshCutouts`, read by CDE-Frontend). A 2.5D mesh has no
# ground under a lump, so the model lays a pavement patch over each cut, kept behind the kerb.
CUTOUTS = []
PATCH_TOP, CUT_FLOOR = 0.03, 0.06
PATCH_MARGIN = 0.25


def cutout(frame, name, s, t, z, patch_t_max=None):
    x, y = frame.P(0, 0)
    lon = LON0 + x / (111320 * math.cos(math.radians(LAT0)))
    lat = LAT0 + y / 110574
    CUTOUTS.append({'name': name, 'lon': round(lon, 8), 'lat': round(lat, 8), 'bearing': round(math.degrees(math.atan2(*frame.u)), 3),
                    's': [round(v, 3) for v in s], 't': [round(v, 3) for v in t],
                    'z': [round(frame.z0 + v, 3) for v in z]})
    t1 = t[1] + PATCH_MARGIN if patch_t_max is None else min(t[1] + PATCH_MARGIN, patch_t_max)
    E('IfcCovering', f'Paviment de reposició · Pavement patch ({name})',
      frame.box(s[0] - PATCH_MARGIN, s[1] + PATCH_MARGIN, t[0] - PATCH_MARGIN, t1, PATCH_TOP - 0.10, 0.10),
      STREET, 'panot', 'road', predefined='FLOORING',
      object_type='Panot pavement 20×20 over the cut-out (covers the mesh where this model replaces it)', src=TYP_SRC,
      psets=spec(Purpose='Visual: replaces the photogrammetric ground under modelled objects'))


# ═══ 1. Kerb, gutter, bays, build-out, markings ═══════════════════════════════════════════════════
street = m.assembly('Places de recàrrega · On-street charging bays', STREET, object_type='EV charging bays (parallel)',
                    psets={**spec(Bays=2, BayLength_m=round(B1_S1 - B1_S0, 2), BayWidth_m=BW, Layout='Parallel to the kerb',
                                  Restriction='Electric vehicles while charging only, max 2 h (demo)',
                                  TrafficDirection='South-east bound (towards Plaça de Catalunya)'),
                           **am('road', 4)})
E('IfcKerb', 'Vorada de l\'illeta · Island kerb', K.box(KERB_S0, BO_S0, KB, KF, -0.30, 0.30), STREET, 'granite_dark', 'road',
  object_type='Granite kerb 200 × 300, 160 mm upstand', src=KERB_SRC, parent=street,
  psets={**spec(Upstand_mm=160, Section_mm='200 × 300', Bedding='Concrete HM-20'),
         'Pset_KerbCommon': {'Upstand': 0.16}, 'Pset_PrecastKerbStone': {'NominalHeight': 0.30, 'NominalWidth': 0.20,
                                                                         'NominalLength': 1.0, 'TypeDesignation': 'C3 (demo)'}})
bo_kerb = [K.box(BO_S0, BO_S0 + 0.20, KF, T_OUT, -0.30, 0.30),          # facing the bays
           K.box(BO_S0, BO_S1, T_OUT - 0.20, T_OUT, -0.30, 0.30),       # facing the traffic lane
           K.box(BO_S1 - 0.20, BO_S1, KB, T_OUT, -0.30, 0.30)]          # facing the crossing
E('IfcKerb', 'Vorada de l\'orella · Build-out kerb', bo_kerb, STREET, 'granite_dark', 'road',
  object_type='Granite kerb 200 × 300 around the build-out', src=KERB_SRC, parent=street,
  psets={**spec(Upstand_mm=160, Length_m=round(2 * BW + (BO_S1 - BO_S0), 2)), 'Pset_KerbCommon': {'Upstand': 0.16}})
E('IfcSlab', 'Orella de vorera · Kerb build-out', K.box(BO_S0 + 0.20, BO_S1 - 0.20, KF, T_OUT - 0.20, -0.30, 0.30), STREET,
  'panot', 'road', predefined='SIDEWALK', object_type='Kerb build-out, panot on concrete, closes the bays at the crossing',
  src=KERB_SRC, parent=street, psets=spec(Finish='Panot 20×20 on 150 mm concrete', Purpose='Protects the bays, shortens the crossing'))
E('IfcCourse', 'Rigola · Gutter', K.box(KERB_S0, BO_S0, KF, KF + 0.30, ROAD - 0.08, 0.08), STREET, 'gutter', 'road',
  predefined='USERDEFINED', object_type='Precast concrete gutter 300 mm (rigola)', src=KERB_SRC, parent=street,
  common={'NominalWidth': 0.30, 'NominalThickness': 0.08})
bay_course = E('IfcCourse', 'Capa de rodadura de les places · Bay wearing course',
               K.box(B1_S0, B2_S1, KF + 0.30, T_OUT, ROAD - 0.05, 0.05), STREET, 'asphalt', 'road', predefined='PAVEMENT',
               object_type='Asphalt wearing course AC 16 surf, 50 mm', src=KERB_SRC, parent=street,
               common={'NominalThickness': 0.05, 'NominalWidth': round(BW - 0.30, 2), 'NominalLength': round(B2_S1 - B1_S0, 2)})
features = []
for k, (s0, s1) in enumerate(((B1_S0, B1_S1), (B2_S0, B2_S1)), 1):
    features.append(E('IfcSurfaceFeature', f'Superfície verda plaça {k} · Bay {k} EV surfacing',
                      K.box(s0 + 0.06, s1 - 0.06, KF + 0.32, T_OUT - 0.11, ROAD + 0.003, 0.005), STREET, 'green_resin', 'marking',
                      predefined='PAVEMENTSURFACEMARKING', object_type='Coloured MMA resin, anti-skid, EV green', src=TYP_SRC,
                      parent=street, psets=spec(SkidResistance_PTV=55, Thickness_mm=3)))
    sc, tc = (s0 + s1) / 2, KF + 0.32 + (BW - 0.43) / 2
    pict = [K.box(sc - 0.65, sc + 0.65, tc - 0.42, tc - 0.34, ROAD + 0.008, 0.004),  # car outline: long sides
            K.box(sc - 0.65, sc + 0.65, tc + 0.34, tc + 0.42, ROAD + 0.008, 0.004),
            K.box(sc - 0.65, sc - 0.57, tc - 0.34, tc + 0.34, ROAD + 0.008, 0.004),
            K.box(sc + 0.57, sc + 0.65, tc - 0.34, tc + 0.34, ROAD + 0.008, 0.004)]
    x, y = K.P(sc, tc)
    pict.append(m.cylinder(x, y, ROAD + 0.008, 0.17, 0.004))                     # plug face
    pict += [K.box(sc - 0.10 - 0.025, sc - 0.10 + 0.025, tc + 0.17, tc + 0.29, ROAD + 0.008, 0.004),
             K.box(sc + 0.10 - 0.025, sc + 0.10 + 0.025, tc + 0.17, tc + 0.29, ROAD + 0.008, 0.004),
             K.box(sc - 0.03, sc + 0.03, tc - 0.34, tc - 0.17, ROAD + 0.008, 0.004)]  # prongs and cord
    features.append(E('IfcSurfaceFeature', f'Pictograma VE plaça {k} · Bay {k} EV pictogram', pict, STREET, 'marking',
                      'marking', predefined='SYMBOLMARKING', object_type='EV charging pictogram (car outline and plug)',
                      src=TYP_SRC, parent=street, psets=spec(Size_mm='1 300 × 840', Material='Thermoplastic, 3 mm')))
lines = [K.box(B1_S0, B2_S1, T_OUT - 0.10, T_OUT, ROAD + 0.003, 0.007),            # outer bay line
         K.box(B1_S0, B1_S0 + 0.10, KF + 0.30, T_OUT, ROAD + 0.003, 0.007),         # start of bay 1
         K.box(B1_S1 - 0.05, B1_S1 + 0.05, KF + 0.30, T_OUT, ROAD + 0.003, 0.007)]  # bay divider
features.append(E('IfcSurfaceFeature', 'Línies de les places · Bay lines', lines, STREET, 'marking', 'marking',
                  predefined='LINEMARKING', object_type='Continuous white line 100 mm, thermoplastic', src=TYP_SRC,
                  parent=street, psets=spec(Width_mm=100, Retroreflectivity_mcd='≥ 150 (demo)')))
f.createIfcRelAdheresToElement(_guid(), m.oh, None, None, bay_course, features)

# ═══ 2. Charging pedestals ════════════════════════════════════════════════════════════════════════
PW, PD, PH = 0.30, 0.22, 1.46                  # housing: along s, across t, height of the white body
CAP_H = 0.14


def connector_geom(PF, side, kind):
    """Holster, connector, cable and gland on one side face (side = -1: -s face, +1: +s face) of a pedestal."""
    sg = side
    n_out = PF.v3(sg, 0, 0)
    tilt = math.radians(35)
    d = _unit(PF.v3(-sg * math.cos(tilt), 0, -math.sin(tilt)))            # connector nose direction: in and down
    e1 = _unit(PF.v3(0, 1, 0))
    e2 = _cross(d, e1)
    ch = PF.p3(sg * (PW / 2 + 0.045), 0., 1.06 if kind == 't2' else 1.00)  # holster centre
    holster = [disc(ch, d, 0.044, 0.085, r_in=0.037),
               obox(_add(ch, (-0.032, n_out)), PF.v3(0, 1, 0), (0., 0., 1.), 0.10, 0.12, 0.012)]
    if kind == 'ccs':
        lower = _add(ch, (0.062, e2))
        holster += [obox(lower, e1, e2, 0.11, 0.05, 0.085)]
    pins, body = [], []
    face = _add(ch, (0.035, d))
    r_body = 0.034 if kind == 't2' else 0.036
    back = _add(ch, (-0.05, d))
    body.append(rod(back, face, r_body))
    body.append(disc(_add(back, (-0.006, d)), d, r_body + 0.006, 0.012))                    # grip collar
    if kind == 't2':
        layout = [(0., -0.018, 0.0045), (0.016, -0.006, 0.0045), (-0.016, -0.006, 0.0045), (0.010, 0.012, 0.0045),
                  (-0.010, 0.012, 0.0045), (0.008, 0.024, 0.0025), (-0.008, 0.024, 0.0025)]   # PE, N, L1-L3, CP, PP
    else:
        layout = [(0., -0.018, 0.0045), (0.008, 0.012, 0.0025), (-0.008, 0.012, 0.0025)]       # PE, CP, PP
        dc_c = _add(ch, (0.062, e2))
        body.append(obox(_add(dc_c, (-0.0075, d)), e1, e2, 0.10, 0.046, 0.085))              # DC inlet block
        for a in (-0.022, 0.022):
            pins.append(rod(_add(dc_c, (a, e1), (0.020, d)), _add(dc_c, (a, e1), (0.034, d)), 0.0065))
    for a, b, r in layout:
        pins.append(rod(_add(face, (a, e1), (b, e2), (-0.012, d)), _add(face, (a, e1), (b, e2), (0.002, d)), r))
    grip_end = _add(back, (-0.02, d), (-0.12, (0., 0., 1.)), (0.03, n_out))
    r_grip = 0.019 if kind == 't2' else 0.023
    body += [rod(back, grip_end, r_grip), m.sphere(*grip_end, r_grip, n=8),
             rod(_add(back, (0.015, e2)), _add(grip_end, (0.02, e2), (0.03, (0., 0., 1.))), 0.010)]  # trigger guard
    gl = PF.p3(sg * (PW / 2 + 0.012), 0.03 if kind == 't2' else -0.03, 0.42)
    rc = 0.013 if kind == 't2' else 0.017
    cpts = [grip_end, _add(grip_end, (sg * 0.06, PF.v3(1, 0, 0)), (-0.22, (0., 0., 1.))),
            PF.p3(sg * (PW / 2 + 0.24), 0.02, 0.34), PF.p3(sg * (PW / 2 + 0.27), 0.02, 0.14),
            PF.p3(sg * (PW / 2 + 0.16), 0.03, 0.07), PF.p3(sg * (PW / 2 + 0.06), 0.03, 0.18),
            _add(gl, (0.03, n_out), (-0.04, (0., 0., 1.))), _add(gl, (0.015, n_out))]
    cable = polyrod(cpts, rc)
    gland = [disc(_add(gl, (0.008, n_out)), n_out, rc + 0.010, 0.022), disc(_add(gl, (0.022, n_out)), n_out, rc + 0.006, 0.010)]
    return holster, body, pins, cable, gland


def pedestal(k, s_c, t_c, condition=4, note=None):
    PF = K.sub(s_c, t_c)                       # t+ towards the kerb and the bay; the screen faces -t (the pavement)
    evse = f'ES*BSM*E{2100 + k:04d}'
    ped = m.assembly(f'Punt de recàrrega {k} · Charging pedestal {k}', STREET, object_type='EV charging pedestal',
                     psets={**spec(EVSEID=evse, ChargingPoints=2, Access='Public, 24 h', Authentication='RFID card / app / QR',
                                   Bay=f'Bay {k}', Notes=note),
                            **ev(RatedPower_kW=46.0, ConnectorTypes='Type 2 (AC, tethered); CCS2 (DC, tethered)',
                                 Phases=3, Voltage='400 V AC 3-phase + N', MeterId=f'MTR-EPGR-{k:02d} (sub-meter in pedestal)',
                                 SimultaneousCharging=True, LoadManagement='Dynamic, shared 80 kW feeder (demo)',
                                 OCPPVersion='OCPP 1.6J (demo)', SessionsLast30Days=212 - 37 * k, EnergyLast30Days_kWh=3480 - 610 * k,
                                 Availability_pct_12m=97.8 - 0.9 * k),
                            **am('pedestal', condition, FirmwareVersion='4.12.3 (demo)', Note=note)})
    # foundation and fixings
    E('IfcFooting', f'Sabata del punt {k} · Pedestal footing {k}', PF.box(-0.30, 0.30, -0.25, 0.25, -0.70, 0.60), BURIED,
      'concrete', 'civil', predefined='PAD_FOOTING', object_type='Concrete pad 600 × 500 × 600, C25/30', src=BELOW_SRC, parent=ped,
      psets=spec(Concrete='C25/30 XC4', Reinforcement='None (mass concrete)', DuctEntries=2, EarthElectrode='Via cabinet earth bar'))
    bolts = []
    for a in (-0.15, 0.15):
        for b in (-0.11, 0.11):
            x, y = PF.P(a, b)
            bolts += [m.cylinder(x, y, -0.55, 0.010, 0.62), m.cylinder(x, y, 0.02, 0.017, 0.016), m.cylinder(x, y, 0.036, 0.007, 0.012)]
    E('IfcMechanicalFastener', f'Perns d\'ancoratge del punt {k}', bolts, BURIED, 'steel_galv', 'civil', predefined='ANCHORBOLT',
      object_type='Anchor bolt cage 4 × M20 × 600, galvanised, with nuts', src=BELOW_SRC, parent=ped,
      psets=spec(Bolts=4, Size='M20 × 600', TighteningTorque_Nm=180))
    E('IfcPlate', f'Placa base del punt {k}', PF.box(-0.21, 0.21, -0.17, 0.17, 0.0, 0.02), STREET, 'steel_galv', 'pedestal',
      predefined='BASE_PLATE', object_type='Base plate 420 × 340 × 20, galvanised', src=TYP_SRC, parent=ped, condition=condition)
    E('IfcPlate', f'Sòcol del punt {k} · Base cover', PF.rrect(0, 0, PW + 0.02, PD + 0.02, 0.05, 0.02, 0.10), STREET, 'cap',
      'pedestal', predefined='COVER_PLATE', object_type='Base skirt, anthracite, hides the fixings', src=TYP_SRC, parent=ped,
      condition=condition)
    # housing
    body = [PF.rrect(0, 0, PW, PD, 0.04, 0.12, PH - 0.12)]
    housing = E('IfcBuildingElementProxy', f'Carcassa del punt {k} · Pedestal housing', body, STREET, 'housing', 'pedestal',
                predefined='USERDEFINED', object_type='EV charging pedestal', src=NODE_SRC, parent=ped, condition=condition,
                psets={**spec(Height_mm=1600, Footprint_mm='300 × 220', IP='IP54', IK='IK10', Enclosure='Aluminium, powder-coated'),
                       **ev(EVSEID=evse, RatedPower_kW=46.0, ConnectorTypes='Type 2 + CCS2', Phases=3, Voltage='400 V AC',
                            MeterId=f'MTR-EPGR-{k:02d}', DCOutput='150-920 V DC, 24 kW (demo)'),
                       **elec(RatedVoltage=400.0, RatedCurrent=80.0, IP_Code='IP54', IK_Code='IK10', NumberOfPoles=4,
                              HasProtectiveEarth=True, EarthingStyle='TN-S')})
    E('IfcPlate', f'Tapa superior del punt {k} · Top cap', PF.frustum(0, 0, PH, PW + 0.012, PD + 0.012, CAP_H, 0.025, 0.02),
      STREET, 'cap', 'pedestal', predefined='COVER_PLATE', object_type='Domed top cap, anthracite PC', src=TYP_SRC, parent=ped,
      condition=condition)
    E('IfcSign', f'Franja corporativa del punt {k}', [PF.box(-PW / 2 - 0.002, PW / 2 + 0.002, -PD / 2 - 0.003, -PD / 2 + 0.01, 0.62, 0.05),
                                                      PF.box(-PW / 2 - 0.002, PW / 2 + 0.002, PD / 2 - 0.01, PD / 2 + 0.003, 0.62, 0.05)],
      STREET, 'livery', 'pedestal', predefined='MARKER', object_type='Operator livery band, front and back', src=TYP_SRC,
      parent=ped, condition=condition)
    E('IfcLightFixture', f'Barra d\'estat del punt {k} · Status light bar',
      [PF.box(-0.11, 0.11, -PD / 2 - 0.006, -PD / 2 + 0.002, PH - 0.05, 0.025), PF.box(-0.11, 0.11, PD / 2 - 0.002, PD / 2 + 0.006, PH - 0.05, 0.025)],
      STREET, 'led_green', 'pedestal', predefined='POINTSOURCE', object_type='RGB status light bar (green available, blue charging, red fault)',
      src=TYP_SRC, parent=ped, condition=condition, psets=spec(State='Available (snapshot)'), common={'TotalWattage': 3.0})
    E('IfcAudioVisualAppliance', f'Pantalla del punt {k} · Screen',
      [PF.box(-0.090, 0.090, -PD / 2 - 0.008, -PD / 2 + 0.001, 1.19, 0.20), PF.box(-0.080, 0.080, -PD / 2 - 0.010, -PD / 2 - 0.007, 1.20, 0.17)],
      STREET, 'display', 'pedestal', predefined='DISPLAY', object_type='7" sunlight-readable TFT, 1 000 cd/m², with bezel', src=TYP_SRC,
      parent=ped, condition=condition, psets={**spec(Size_in=7, Brightness_cd_m2=1000, Languages='ca/es/en'),
                                              **elec(NominalPowerConsumption=6.0)})
    rfid = [PF.box(-0.055, 0.055, -PD / 2 - 0.010, -PD / 2 + 0.001, 1.03, 0.11)]
    for r in (0.018, 0.030):
        rfid.append(disc(PF.p3(0, -PD / 2 - 0.011, 1.085), PF.v3(0, 1, 0), r + 0.002, 0.002, r_in=r - 0.002))
    E('IfcCommunicationsAppliance', f'Lector RFID del punt {k}', rfid, STREET, 'black', 'pedestal', predefined='USERDEFINED',
      object_type='RFID / NFC reader, ISO 14443, with contactless symbol', src=TYP_SRC, parent=ped, condition=condition,
      psets=spec(Standards='ISO 14443 A/B, MIFARE, NFC (demo)'))
    E('IfcSwitchingDevice', f'Polsador d\'emergència del punt {k}',
      [PF.box(-0.035, 0.035, -PD / 2 - 0.006, -PD / 2 + 0.001, 0.885, 0.07)], STREET, 'estop_yellow', 'pedestal',
      predefined='USERDEFINED', object_type='Emergency stop backplate, yellow', src=TYP_SRC, parent=ped, condition=condition)
    E('IfcSwitchingDevice', f'Bolet de parada del punt {k} · Emergency stop',
      [disc(PF.p3(0, -PD / 2 - 0.014, 0.92), PF.v3(0, 1, 0), 0.020, 0.016), disc(PF.p3(0, -PD / 2 - 0.028, 0.92), PF.v3(0, 1, 0), 0.025, 0.014)],
      STREET, 'estop_red', 'pedestal', predefined='EMERGENCYSTOP', object_type='Mushroom-head emergency stop, twist to release',
      src=TYP_SRC, parent=ped, condition=condition, psets=spec(Function='Opens both outputs and the DC stage (IEC 60947-5-5)'),
      common={'HasLock': True})
    E('IfcSign', f'Placa d\'instruccions del punt {k}', PF.box(-0.11, 0.11, -PD / 2 - 0.004, -PD / 2 + 0.001, 0.48, 0.30), STREET,
      'label', 'pedestal', predefined='PICTORAL', object_type='Instructions plate: start, stop, support phone, QR', src=TYP_SRC,
      parent=ped, condition=condition, psets=spec(Languages='ca/es/en', QR='Start session / report a fault'))
    E('IfcSign', f'Etiqueta d\'actiu del punt {k}', PF.box(-0.06, 0.06, PD / 2 - 0.001, PD / 2 + 0.003, 1.05, 0.04), STREET, 'label',
      'pedestal', predefined='MARKER', object_type=f'Asset label {evse}, QR', src=TYP_SRC, parent=ped, condition=condition,
      psets=spec(Text=evse))
    # service panel on the back (bay side) with its outline and lock
    panel = [PF.box(-0.12, 0.12, PD / 2 - 0.001, PD / 2 + 0.003, 0.24, 0.62)]
    outline = [PF.box(-0.125, 0.125, PD / 2 - 0.001, PD / 2 + 0.002, 0.235, 0.005), PF.box(-0.125, 0.125, PD / 2 - 0.001, PD / 2 + 0.002, 0.86, 0.005),
               PF.box(-0.125, -0.120, PD / 2 - 0.001, PD / 2 + 0.002, 0.235, 0.63), PF.box(0.120, 0.125, PD / 2 - 0.001, PD / 2 + 0.002, 0.235, 0.63)]
    E('IfcPlate', f'Tapa de servei del punt {k} · Service panel', panel, STREET, 'housing', 'pedestal', predefined='COVER_PLATE',
      object_type='Removable service panel 240 × 620, tamper-proof screws', src=TYP_SRC, parent=ped, condition=condition)
    E('IfcDiscreteAccessory', f'Junta i pany del panell del punt {k}',
      outline + [disc(PF.p3(0.09, PD / 2 + 0.006, 0.80), PF.v3(0, 1, 0), 0.011, 0.008)], STREET, 'gasket', 'pedestal',
      predefined='LOCK', object_type='Panel gasket outline and triangular-key lock', src=TYP_SRC, parent=ped, condition=condition)
    louv = [PF.box(sg * PW / 2 - 0.003, sg * PW / 2 + 0.003, -0.07, 0.07, 0.22 + j * 0.03, 0.012) for sg in (-1, 1) for j in range(4)]
    E('IfcPlate', f'Reixeta de ventilació del punt {k}', louv, STREET, 'cap', 'pedestal', predefined='USERDEFINED',
      object_type='Ventilation louvres, both sides (DC stage cooling)', src=TYP_SRC, parent=ped, condition=condition)
    # the two charging points
    for kind, sg, label in (('t2', -1, 'Type 2'), ('ccs', 1, 'CCS2')):
        holster, body_c, pins, cable, gland = connector_geom(PF, sg, kind)
        cp = m.assembly(f'Punt {k}.{1 if kind == "t2" else 2} · {label} charging point', None,
                        object_type=f'{label} charging point (connector, cable, holster)', parent=ped,
                        psets=ev(EVSEID=f'{evse}*{1 if kind == "t2" else 2}', ConnectorTypes=label,
                                 RatedPower_kW=22.0 if kind == 't2' else 24.0,
                                 Phases=3 if kind == 't2' else 0, Voltage='400 V AC' if kind == 't2' else '150-920 V DC',
                                 MeterId=f'MTR-EPGR-{k:02d}-{1 if kind == "t2" else 2}',
                                 ChargingMode='Mode 3 (IEC 61851-1)' if kind == 't2' else 'Mode 4 (IEC 61851-23)',
                                 MaxCurrent_A=32.0 if kind == 't2' else 60.0, CableLength_m=5.0 if kind == 't2' else 4.0))
        E('IfcDiscreteAccessory', f'Funda del connector {label} · Holster ({k})', holster, STREET, 'holster', 'connector',
          predefined='USERDEFINED', object_type=f'{label} connector holster with drain and dust lip', src=TYP_SRC, parent=cp,
          condition=condition)
        E('IfcOutlet', f'Connector {label} del punt {k}', body_c, STREET, 'connector', 'connector', predefined='POWEROUTLET',
          object_type=('Type 2 tethered connector, IEC 62196-2, 32 A 3-phase' if kind == 't2'
                       else 'CCS2 (Combo 2) tethered connector, IEC 62196-3, 60 A DC'), src=TYP_SRC, parent=cp,
          condition=condition if kind == 't2' or k != 2 else 3,
          extra={'Note': 'Latch worn, replacement connector ordered (demo)'} if (kind == 'ccs' and k == 2) else None,
          psets={**ev(ConnectorTypes=label, MatingCycles=10000, MatingCyclesUsed=2650 + 900 * k + (400 if kind == 'ccs' else 0)),
                 **elec(RatedCurrent=32.0 if kind == 't2' else 60.0, RatedVoltage=400.0 if kind == 't2' else 920.0,
                        IP_Code='IP44 (mated IP55)', NumberOfPoles=7 if kind == 't2' else 5, HasProtectiveEarth=True)},
          common={'NumberOfSockets': 1})
        E('IfcCableFitting', f'Contactes del connector {label} del punt {k}', pins, STREET, 'pins', 'connector',
          predefined='CONNECTOR', object_type=('Contact set: L1, L2, L3, N, PE, CP, PP' if kind == 't2' else 'Contact set: DC+, DC−, PE, CP, PP'),
          src=TYP_SRC, parent=cp, condition=condition)
        E('IfcCableSegment', f'Cable de càrrega {label} del punt {k}', cable, STREET, 'cable', 'evcable', predefined='CABLESEGMENT',
          object_type=('EV cable 5 × 6 mm² + 1 × 0.5 mm², 5 m (drawn as its hanging loop)' if kind == 't2'
                       else 'DC EV cable 2 × 16 mm² + PE + signal, 4 m (drawn as its hanging loop)'),
          src=TYP_SRC, parent=cp, condition=condition,
          psets={**spec(Length_m=5.0 if kind == 't2' else 4.0, Standard='IEC 62893', Sheath='TPU, UV and oil resistant'),
                 **elec(RatedVoltage=450.0 if kind == 't2' else 1000.0, RatedCurrent=32.0 if kind == 't2' else 60.0)})
        E('IfcCableFitting', f'Premsaestopa del cable {label} del punt {k}', gland, STREET, 'stainless', 'connector', predefined='ENTRY',
          object_type='Cable gland M32 with strain relief', src=TYP_SRC, parent=cp, condition=condition)
    return ped


PEDS = MD['pedestals']
pedestal(1, PEDS[0]['s'], PEDS[0]['t'])
pedestal(2, PEDS[1]['s'], PEDS[1]['t'], condition=3, note='CCS connector latch worn (demo)')
for k, p in enumerate(PEDS, 1):
    cutout(K.sub(p['s'], p['t']), f'charging pedestal {k}', (-0.62, 0.62), (-0.36, 0.30), (CUT_FLOOR, 1.9), patch_t_max=KB - p['t'])

# ═══ 3. Feeder pillar ═════════════════════════════════════════════════════════════════════════════
CB = K.sub(MD['cabinet']['s'], MD['cabinet']['t'])     # t+ = the door side, towards the bays
CW, CD = 0.80, 0.35
Z0C, Z1C = 0.10, 1.35                                   # enclosure bottom (top of plinth) and top
cab = m.assembly('Armari d\'alimentació · Feeder pillar', STREET, object_type='EV charging feeder pillar (CPM + distribution)',
                 psets={**spec(Supply='LV network, 3-phase 400/230 V, 50 Hz', ContractedPower_kW=80, Feeds='Pedestals 1 and 2',
                               Earthing='TT, earth electrode ≤ 30 Ω (demo)'),
                        **ev(RatedPower_kW=80.0, ConnectorTypes='n/a (supplies 2 pedestals: Type 2 + CCS2 each)', Phases=3,
                             Voltage='400/230 V AC', MeterId='ES0031-DEMO-0000-4417-PG (utility meter, demo)'),
                        **am('cabinet', 4)})
E('IfcFooting', 'Sòcol de formigó de l\'armari · Cabinet plinth', CB.box(-0.475, 0.475, -0.25, 0.25, -0.60, 0.70), BURIED,
  'concrete', 'civil', predefined='PAD_FOOTING', object_type='Concrete plinth 950 × 500 × 700, 100 mm above the pavement, 4 duct entries',
  src=BELOW_SRC, parent=cab, psets=spec(Concrete='C25/30 XC4', DuctEntries=4))
shell = [CB.box(-CW / 2, CW / 2, -CD / 2, -CD / 2 + 0.012, Z0C, Z1C - Z0C),                 # back
         CB.box(-CW / 2, -CW / 2 + 0.012, -CD / 2, CD / 2, Z0C, Z1C - Z0C),                 # sides
         CB.box(CW / 2 - 0.012, CW / 2, -CD / 2, CD / 2, Z0C, Z1C - Z0C),
         CB.box(-CW / 2, CW / 2, -CD / 2, CD / 2, Z0C, 0.012),                              # floor
         CB.box(-CW / 2, CW / 2, CD / 2 - 0.025, CD / 2, Z0C, 0.06),                        # front frame: bottom rail
         CB.box(-CW / 2, CW / 2, CD / 2 - 0.025, CD / 2, Z1C - 0.06, 0.06),                 # top rail
         CB.box(-CW / 2, -CW / 2 + 0.04, CD / 2 - 0.025, CD / 2, Z0C, Z1C - Z0C),          # stiles
         CB.box(CW / 2 - 0.04, CW / 2, CD / 2 - 0.025, CD / 2, Z0C, Z1C - Z0C)]
board = E('IfcElectricDistributionBoard', 'Envolvent de l\'armari · Feeder pillar enclosure', shell, STREET, 'grp', 'cabinet',
          predefined='DISTRIBUTIONBOARD', object_type='GRP feeder pillar 800 × 350 × 1 250, IP55, IK10, double insulated',
          src=TYP_SRC, parent=cab,
          psets={**spec(Size_mm='800 × 350 × 1 250', IP='IP55', IK='IK10', Compartments='Utility (CGP + meter) | User (distribution)'),
                 **elec(RatedVoltage=400.0, RatedCurrent=125.0, IP_Code='IP55', IK_Code='IK10', InsulationStandardClass='CLASS2',
                        NumberOfPoles=4, HasProtectiveEarth=True, EarthingStyle='TT')})
E('IfcPlate', 'Barret de l\'armari · Cabinet roof', CB.frustum(0, 0, Z1C, CW + 0.04, CD + 0.04, 0.07, 0.03, 0.03), STREET, 'grp',
  'cabinet', predefined='COVER_PLATE', object_type='Sloped GRP roof with drip edge', src=TYP_SRC, parent=cab)
# the door: a frame of leaf around the meter window, with a 5 mm gap all round that shows its outline
DS0, DS1, DZ0, DZ1 = -CW / 2 + 0.045, CW / 2 - 0.045, Z0C + 0.065, Z1C - 0.065
WS0, WS1, WZ0, WZ1 = -0.30, -0.04, 0.88, 1.14                # meter window, over the utility compartment
TD0, TD1 = CD / 2 - 0.004, CD / 2 + 0.018
leaf = [CB.box(DS0, DS1, TD0, TD1, DZ0, WZ0 - DZ0), CB.box(DS0, DS1, TD0, TD1, WZ1, DZ1 - WZ1),
        CB.box(DS0, WS0, TD0, TD1, WZ0, WZ1 - WZ0), CB.box(WS1, DS1, TD0, TD1, WZ0, WZ1 - WZ0)]
door = E('IfcDoor', 'Porta de l\'armari · Cabinet door', leaf, STREET, 'grp', 'cabinet', predefined='USERDEFINED',
         object_type='Hinged GRP enclosure door with meter window, 3-point lock', src=TYP_SRC, parent=cab,
         psets=spec(OpeningAngle_deg=120, Hinges='Left, concealed'), common={'HandicapAccessible': False, 'SecurityRating': 'Triangular key + padlock'})
door.OperationType = 'SINGLE_SWING_LEFT'
door.OverallWidth, door.OverallHeight = round(DS1 - DS0, 3), round(DZ1 - DZ0, 3)
E('IfcPlate', 'Visor del comptador · Meter viewing window', CB.box(WS0, WS1, TD0 + 0.004, TD0 + 0.010, WZ0, WZ1 - WZ0), STREET,
  'window', 'cabinet', predefined='CURTAIN_PANEL', object_type='UV-stable polycarbonate window 260 × 260 for meter reading',
  src=TYP_SRC, parent=cab)
gask = [CB.box(DS0 - 0.005, DS1 + 0.005, CD / 2 - 0.022, CD / 2 - 0.004, DZ0 - 0.005, 0.005),
        CB.box(DS0 - 0.005, DS1 + 0.005, CD / 2 - 0.022, CD / 2 - 0.004, DZ1, 0.005),
        CB.box(DS0 - 0.005, DS0, CD / 2 - 0.022, CD / 2 - 0.004, DZ0 - 0.005, DZ1 - DZ0 + 0.01),
        CB.box(DS1, DS1 + 0.005, CD / 2 - 0.022, CD / 2 - 0.004, DZ0 - 0.005, DZ1 - DZ0 + 0.01)]
E('IfcDiscreteAccessory', 'Junta de la porta · Door gasket (outline)', gask, STREET, 'gasket', 'cabinet', predefined='USERDEFINED',
  object_type='EPDM door gasket; reads as the door outline', src=TYP_SRC, parent=cab)
E('IfcDiscreteAccessory', 'Pany i maneta de l\'armari', [disc(CB.p3(DS1 - 0.06, TD1 + 0.006, 0.70), CB.v3(0, 1, 0), 0.016, 0.012),
                                                       CB.box(DS1 - 0.075, DS1 - 0.045, TD1, TD1 + 0.025, 0.56, 0.12)],
  STREET, 'stainless', 'cabinet', predefined='LOCK', object_type='3-point espagnolette lock, triangular key, padlock hasp',
  src=TYP_SRC, parent=cab)
E('IfcDiscreteAccessory', 'Frontisses de la porta', [CB.box(DS0 - 0.012, DS0 + 0.01, TD1 - 0.01, TD1 + 0.006, z, 0.08) for z in (0.30, 1.05)],
  STREET, 'stainless', 'cabinet', predefined='USERDEFINED', object_type='Stainless lift-off hinges', src=TYP_SRC, parent=cab)
E('IfcSign', 'Senyal de risc elèctric · Electrical hazard sign', [CB.side([(0.15, 1.00), (0.29, 1.00), (0.22, 1.12)], TD1 + 0.001, 0.002)],
  STREET, 'estop_yellow', 'cabinet', predefined='PICTORAL', object_type='Electrical hazard triangle (ISO 7010 W012)', src=TYP_SRC, parent=cab)
E('IfcSign', 'Etiqueta d\'identificació de l\'armari', [CB.box(0.05, 0.30, TD1, TD1 + 0.002, 0.86, 0.06)], STREET, 'label', 'cabinet',
  predefined='MARKER', object_type='Cabinet ID EPGR-CAB-01, supply point CUPS, emergency phone', src=TYP_SRC, parent=cab,
  psets=spec(Text='EPGR-CAB-01 · CUPS ES0031-DEMO (demo)'))
E('IfcPlate', 'Reixetes de ventilació de l\'armari', [CB.box(sg * (CW / 2) - 0.004, sg * (CW / 2) + 0.004, -0.10 + j * 0.0, 0.10, 1.12 + j * 0.035, 0.015)
                                                     for sg in (-1, 1) for j in range(3)],
  STREET, 'gasket', 'cabinet', predefined='USERDEFINED', object_type='Labyrinth ventilation louvres, both sides', src=TYP_SRC, parent=cab)
# inside: mounting plate, DIN rails and the devices (seen through the window and the door outline)
TP = -CD / 2 + 0.016                                     # mounting plate front face
E('IfcPlate', 'Placa de muntatge · Mounting plate', CB.box(-CW / 2 + 0.03, CW / 2 - 0.03, -CD / 2 + 0.012, TP, Z0C + 0.06, 1.10),
  STREET, 'mount', 'cabinet', predefined='USERDEFINED', object_type='Galvanised mounting plate 2 mm', src=TYP_SRC, parent=cab)
E('IfcMember', 'Separador de compartiments', CB.box(-0.012, 0.0, TP, CD / 2 - 0.03, Z0C + 0.06, 1.10), STREET, 'grp', 'cabinet',
  predefined='USERDEFINED', object_type='Partition, utility | user compartment (sealable)', src=TYP_SRC, parent=cab)
rails = [CB.box(-CW / 2 + 0.05, -0.03, TP, TP + 0.0075, z, 0.035) for z in (0.62, 0.96)] + \
        [CB.box(0.02, CW / 2 - 0.05, TP, TP + 0.0075, z, 0.035) for z in (0.62, 0.96)]
E('IfcMember', 'Carrils DIN · DIN rails', rails, STREET, 'stainless', 'switchgear', predefined='USERDEFINED',
  object_type='DIN rail TS35 × 7.5', src=TYP_SRC, parent=cab)


def din(s0, n_mod, z, depth=0.068, h=0.090):
    """A modular DIN device: n_mod modules of 17.5 mm, centred on the rail at z."""
    return CB.box(s0, s0 + n_mod * 0.0175, TP + 0.0075, TP + 0.0075 + depth, z - h / 2 + 0.0175, h)


utility = m.assembly('Compartiment de companyia · Utility compartment (CGP + meter)', None, object_type='Protection and metering unit',
                     parent=cab, psets=spec(SealedBy='Distribution network operator (demo)'))
E('IfcProtectiveDevice', 'Fusibles de la CGP · Service fuses', [din(-0.36, 6, 0.62 + 0.0175 - 0.0175, depth=0.085, h=0.12)],
  STREET, 'din_grey', 'switchgear', predefined='FUSEDISCONNECTOR', object_type='Fuse switch-disconnector, NH00 gG 125 A, 3-pole + N',
  src=TYP_SRC, parent=utility, psets={**spec(FuseRating_A=125, FuseType='NH00 gG'), **elec(RatedCurrent=125.0, RatedVoltage=400.0, NumberOfPoles=4)})
meter_body = [CB.box(-0.30, -0.12, TP + 0.0075, TP + 0.075, 0.93, 0.20), CB.box(-0.27, -0.15, TP + 0.075, TP + 0.080, 1.05, 0.05)]
E('IfcFlowMeter', 'Comptador d\'energia · Energy meter', meter_body, STREET, 'meter', 'meter', predefined='ENERGYMETER',
  object_type='Three-phase smart energy meter, direct 4-wire, MID class B, PLC/4G', src=TYP_SRC, parent=utility,
  psets={**spec(MeterClass='MID B (active), class 2 (reactive)', Communication='PRIME PLC + 4G (demo)',
                LastReading_kWh=187412, LastReadingDate='2026-09-30'),
         **ev(MeterId='ES0031-DEMO-0000-4417-PG (demo)', Phases=3, Voltage='3 × 230/400 V', RatedPower_kW=80.0,
              ConnectorTypes='n/a'),
         **elec(RatedCurrent=100.0, RatedVoltage=400.0, NumberOfPoles=4)})
E('IfcLightFixture', 'Indicador d\'impulsos del comptador', CB.box(-0.17, -0.155, TP + 0.075, TP + 0.079, 0.98, 0.012), STREET,
  'led_green', 'meter', predefined='POINTSOURCE', object_type='Metrological LED (1 000 imp/kWh)', src=TYP_SRC, parent=utility)
user = m.assembly('Compartiment d\'usuari · Distribution compartment', None, object_type='Charging feeder distribution', parent=cab)
E('IfcSwitchingDevice', 'Interruptor general · Main switch-disconnector', [din(0.03, 4, 0.96), CB.box(0.055, 0.075, TP + 0.075, TP + 0.095, 0.96, 0.04)],
  STREET, 'din_grey', 'switchgear', predefined='SWITCHDISCONNECTOR', object_type='Switch-disconnector 4P 125 A, lockable', src=TYP_SRC,
  parent=user, psets=elec(RatedCurrent=125.0, RatedVoltage=400.0, NumberOfPoles=4), common={'HasLock': True})
E('IfcProtectiveDevice', 'Protector de sobretensions · Surge protective device', [din(0.11, 4, 0.96)], STREET, 'din_grey', 'switchgear',
  predefined='VARISTOR', object_type='SPD Type 2, 4P, In 20 kA, Up ≤ 1.5 kV', src=TYP_SRC, parent=user,
  psets={**spec(Class='Type 2 (IEC 61643-11)', In_kA=20, Up_kV=1.5), **elec(RatedVoltage=400.0, NumberOfPoles=4)})
E('IfcCommunicationsAppliance', 'Router 4G de l\'armari', [din(0.21, 6, 0.96, depth=0.06)], STREET, 'black', 'comms',
  predefined='ROUTER', object_type='Industrial 4G router, OCPP backhaul for both pedestals', src=TYP_SRC, parent=user,
  psets={**spec(Network='4G LTE, private APN (demo)', Ports='2 × Ethernet to the pedestals'), **elec(NominalPowerConsumption=8.0)})
for k in (1, 2):
    s0 = 0.03 + (k - 1) * 0.17
    E('IfcProtectiveDevice', f'Magnetotèrmic del punt {k} · MCB', [din(s0, 4, 0.62), CB.box(s0 + 0.01, s0 + 0.06, TP + 0.075, TP + 0.09, 0.625, 0.02)],
      STREET, 'din_grey', 'switchgear', predefined='CIRCUITBREAKER', object_type='MCB 4P C 80 A, 10 kA', src=TYP_SRC, parent=user,
      psets={**spec(Curve='C', BreakingCapacity_kA=10, Feeds=f'Pedestal {k}'), **elec(RatedCurrent=80.0, RatedVoltage=400.0, NumberOfPoles=4)})
    E('IfcProtectiveDevice', f'Diferencial del punt {k} · RCD Type B', [din(s0 + 0.075, 4, 0.62), CB.box(s0 + 0.085, s0 + 0.135, TP + 0.075, TP + 0.09, 0.625, 0.02)],
      STREET, 'din_grey', 'switchgear', predefined='RESIDUALCURRENTCIRCUITBREAKER', object_type='RCD Type B 4P 80 A, 30 mA',
      src=TYP_SRC, parent=user, condition=4 if k == 1 else 3,
      extra={'LastTripTest': '2026-08-27', 'Note': 'Nuisance trip logged 2026-09-14, test passed (demo)' if k == 2 else None},
      psets={**spec(Type='B (IEC 62423)', Sensitivity_mA=30, Feeds=f'Pedestal {k}'), **elec(RatedCurrent=80.0, RatedVoltage=400.0, NumberOfPoles=4)})
E('IfcCableFitting', 'Bornes de sortida · Outgoing terminal block', [CB.box(0.03, 0.34, TP + 0.0075, TP + 0.05, 0.30, 0.05)], STREET,
  'din_grey', 'switchgear', predefined='JUNCTION', object_type='Terminal block 2 × 5 × 25 mm² + earth bar', src=TYP_SRC, parent=user)
E('IfcCableFitting', 'Premsaestopes d\'entrada de l\'armari', [disc(CB.p3(s, 0.0, Z0C + 0.006), (0., 0., 1.), 0.030, 0.03) for s in (-0.30, -0.15, 0.15, 0.30)],
  STREET, 'black', 'switchgear', predefined='ENTRY', object_type='Cable entry glands M50 in the enclosure floor', src=TYP_SRC, parent=cab)
cutout(CB, 'feeder pillar', (-0.55, 0.55), (-0.32, 0.36), (CUT_FLOOR, 1.7))

# ═══ 4. Buried ducts, cables, draw pit, earth ═════════════════════════════════════════════════════
bur = m.assembly('Canalització soterrada · Buried cable route', BURIED, object_type='LV cable route to the pedestals',
                 psets={**spec(Depth_m='0.60-0.75 to duct crown', Ducts='Corrugated HDPE Ø 110 / Ø 160',
                               Bedding='Lean concrete surround, warning tape at 0.30 m', AsBuiltSurvey='Not available (demo)'),
                        **am('duct', 4)})
cab_xy = (MD['cabinet']['s'], MD['cabinet']['t'])
p1, p2 = (PEDS[0]['s'], PEDS[0]['t']), (PEDS[1]['s'], PEDS[1]['t'])
PIT = (round((p1[0] + p2[0]) / 2, 2), -5.15)


def K3(pts):
    return [K.p3(s, t, z) for s, t, z in pts]


ROUTES = {
    1: [(cab_xy[0] + 0.15, cab_xy[1], 0.10), (cab_xy[0] + 0.15, cab_xy[1], -0.66), (cab_xy[0] + 0.15, -5.00, -0.66),
        (p1[0], -5.00, -0.66), (p1[0], p1[1], -0.66), (p1[0], p1[1], -0.12)],
    2: [(cab_xy[0] - 0.15, cab_xy[1], 0.10), (cab_xy[0] - 0.15, cab_xy[1], -0.74), (cab_xy[0] - 0.15, PIT[1], -0.74),
        (p2[0], PIT[1], -0.74), (p2[0], p2[1], -0.74), (p2[0], p2[1], -0.12)],
    0: [(cab_xy[0] + 0.30, cab_xy[1], 0.10), (cab_xy[0] + 0.30, cab_xy[1], -0.80), (cab_xy[0] + 0.30, -9.80, -0.80)],
}
for k, pts in ROUTES.items():
    r_d = 0.080 if k == 0 else 0.055
    ca = "d'escomesa" if k == 0 else f'del punt {k}'
    cb = "d'escomesa" if k == 0 else f"d'alimentació del punt {k}"
    what = 'supply from the LV network (stub to the network joint, not modelled)' if k == 0 else f'to pedestal {k}'
    seg = [rod(a, b, r_d, r_in=r_d - 0.006) for a, b in zip(K3(pts), K3(pts)[1:])]
    E('IfcCableCarrierSegment', f'Tub soterrat {ca} · Duct {what}', seg, BURIED, 'duct',
      'duct', predefined='CONDUITSEGMENT', object_type=f'Corrugated twin-wall HDPE Ø {int(r_d * 2000)} mm, 450 N, red',
      src=BELOW_SRC, parent=bur, psets=spec(Route=what, Length_m=round(sum(math.dist(a, b) for a, b in zip(pts, pts[1:])), 2),
                                            Diameter_mm=int(r_d * 2000), CompressionStrength_N=450))
    bends = [m.sphere(*p, r_d, n=8) for p in K3(pts)[1:-1]]
    E('IfcCableCarrierFitting', f'Colzes del tub {ca}', bends, BURIED, 'duct', 'duct',
      predefined='BEND', object_type='Long-radius HDPE bends 90°', src=BELOW_SRC, parent=bur)
    r_c = 0.022 if k == 0 else 0.016
    E('IfcCableSegment', f'Cable {cb}', polyrod(K3(pts), r_c), BURIED,
      'cable', 'lvcable', predefined='CABLESEGMENT',
      object_type=('RZ1-K 0.6/1 kV 3 × 50 + 1 × 25 mm² Cu (supply)' if k == 0 else 'RZ1-K 0.6/1 kV 5 G 25 mm² Cu + Cat 6A data'),
      src=BELOW_SRC, parent=bur,
      psets={**spec(Route=what, VoltageDrop_pct=0.8 if k else 0.4), **elec(RatedVoltage=1000.0, RatedCurrent=125.0 if k == 0 else 80.0)})
    tape = []
    for (s0, t0, z0), (s1, t1, z1) in zip(pts, pts[1:]):
        if abs(z1 - z0) < 1e-6:
            tape.append(K.box(min(s0, s1) - 0.075, max(s0, s1) + 0.075, min(t0, t1) - 0.075, max(t0, t1) + 0.075, -0.30, 0.002))
    E('IfcBuildingElementProxy', f'Cinta de senyalització {ca}', tape, BURIED, 'tape',
      'duct', predefined='USERDEFINED', object_type='Warning tape 150 mm «Atenció cables elèctrics» at 0.30 m', src=BELOW_SRC, parent=bur)
pit = m.assembly('Arqueta de registre · Draw pit', None, object_type='Cable draw pit 400 × 400', parent=bur)
PITF = K.sub(*PIT)
pw = [PITF.box(-0.30, 0.30, t - 0.05, t + 0.05, -0.85, 0.80) for t in (-0.25, 0.25)] + \
     [PITF.box(s - 0.05, s + 0.05, -0.20, 0.20, -0.85, 0.80) for s in (-0.25, 0.25)]
E('IfcDistributionChamberElement', 'Arqueta de registre · Draw pit', pw, BURIED, 'concrete', 'civil', predefined='INSPECTIONCHAMBER',
  object_type='Precast concrete draw pit 400 × 400 × 800, open bottom on gravel', src=BELOW_SRC, parent=pit,
  psets=spec(InnerSize_mm='400 × 400', Depth_mm=800))
E('IfcCovering', 'Tapa de l\'arqueta · Pit cover', [PITF.box(-0.27, 0.27, -0.27, 0.27, -0.05, 0.05)] +
  [PITF.box(-0.24 + j * 0.06, -0.22 + j * 0.06, -0.24, 0.24, 0.0, 0.004) for j in range(9)], STREET, 'cast_iron', 'civil',
  predefined='USERDEFINED', object_type='Ductile-iron cover and frame, class B125 (EN 124), anti-slip', src=TYP_SRC, parent=pit,
  psets=spec(LoadClass='B125', Marking='«Enllumenat / VE» (demo)'))
E('IfcCableSegment', 'Conductor de terra · Earth conductor', polyrod(K3([(cab_xy[0] - 0.30, cab_xy[1], -0.10), (cab_xy[0] - 0.30, cab_xy[1], -0.85),
                                                                          (cab_xy[0] - 0.30, -5.30, -0.85), (p2[0] + 0.25, -5.30, -0.85)]), 0.004),
  BURIED, 'copper', 'lvcable', predefined='CONDUCTORSEGMENT', object_type='Bare copper earth conductor 35 mm², laid in the trench',
  src=BELOW_SRC, parent=bur, psets=elec(ConductorFunction='PROTECTIVEEARTH'))
x, y = K.P(cab_xy[0] - 0.30, cab_xy[1] - 0.45)
E('IfcDiscreteAccessory', 'Piqueta de terra · Earth electrode', [m.cylinder(x, y, -2.85, 0.008, 2.0), m.cylinder(x, y, -0.86, 0.02, 0.04)],
  BURIED, 'copper', 'lvcable', predefined='USERDEFINED', object_type='Copper-bonded earth rod Ø 14.2 × 2 000 with clamp', src=BELOW_SRC,
  parent=bur, psets=spec(MeasuredResistance_ohm=18.5, MeasuredOn='2026-08-27 (demo)'))

# ═══ 5. Bollards and the sign ═════════════════════════════════════════════════════════════════════
furn = m.assembly('Proteccions i senyalització · Bollards and signage', STREET, object_type='Street furniture')
BOLL = [(p1[0] - 0.55, KB - 0.15), (p1[0] + 0.55, KB - 0.15), (p2[0] - 0.55, KB - 0.15), (p2[0] + 0.55, KB - 0.15),
        ((BO_S0 + BO_S1) / 2, KF + 0.45), ((BO_S0 + BO_S1) / 2, T_OUT - 0.45)]
BOLL_RZ = [(0., -0.40), (0.07, -0.40), (0.07, 0.0), (0.055, 0.02), (0.055, 0.78), (0.062, 0.80), (0.062, 0.84),
           (0.055, 0.86), (0.050, 0.92), (0.035, 0.95), (0., 0.96)]
for k, (s, t) in enumerate(BOLL, 1):
    on_bo = s > BO_S0
    x, y = K.P(s, t)
    E('IfcBuildingElementProxy', f'Pilona {k} · Bollard', [m.revolve(BOLL_RZ, x, y, 0.0)], STREET, 'cast_iron', 'bollard',
      predefined='USERDEFINED', object_type='Bollard', src=TYP_SRC, parent=furn,
      condition=4 if k != 3 else 3, extra={'Note': 'Paint chipped by a vehicle, repaint scheduled (demo)'} if k == 3 else None,
      psets=spec(Height_mm=960, Diameter_mm=110, Embedment_mm=400, Location='Build-out' if on_bo else f'Beside pedestal {1 if k <= 2 else 2}',
                 Fixing='Embedded in concrete'))
SG = K.sub(B1_S0 - 0.40, KB - 0.20)            # sign post at the start of the bays, the plate faces approaching traffic (-s)
E('IfcFooting', 'Dau del pal del senyal', SG.box(-0.20, 0.20, -0.20, 0.20, -0.60, 0.50), BURIED, 'concrete', 'civil',
  predefined='PAD_FOOTING', object_type='Concrete block 400 × 400 × 500', src=BELOW_SRC, parent=furn)
E('IfcMember', 'Pal del senyal · Sign post', [SG.cyl(0, 0, -0.50, 0.030, 3.05), SG.cyl(0, 0, 2.55, 0.032, 0.02)], STREET, 'steel_galv', 'sign',
  predefined='POST', object_type='Galvanised steel post Ø 60 × 3 mm, capped', src=TYP_SRC, parent=furn)
TC = 0.0                                        # plate centre, t (on the post axis)
plate = [(TC - 0.30, 1.95), (TC + 0.30, 1.95), (TC + 0.30, 2.55), (TC - 0.30, 2.55)]
E('IfcSign', 'Senyal d\'aparcament VE · EV parking sign', [SG.cross(plate, -0.05, 0.012)], STREET, 'sign_blue', 'sign',
  predefined='PICTORAL', object_type='Parking sign S-17 with EV charging pictogram, 600 × 600', src=TYP_SRC, parent=furn,
  psets={**spec(Code='S-17 + EV symbol', Size_mm='600 × 600', Retroreflection='RA2'), 'Pset_SignCommon': {'Category': 'Regulatory/information'}})
P_SYM = [(TC - 0.20, 2.05), (TC - 0.12, 2.05), (TC - 0.12, 2.22), (TC + 0.02, 2.22), (TC + 0.06, 2.26), (TC + 0.06, 2.42),
         (TC + 0.02, 2.46), (TC - 0.20, 2.46)]
plug = [(TC + 0.10, 2.06), (TC + 0.22, 2.06), (TC + 0.22, 2.18), (TC + 0.10, 2.18)]
sym = [SG.cross(P_SYM, -0.058, 0.004), SG.cross(plug, -0.058, 0.004),
       SG.cross([(TC + 0.12, 2.18), (TC + 0.135, 2.18), (TC + 0.135, 2.23), (TC + 0.12, 2.23)], -0.058, 0.004),
       SG.cross([(TC + 0.185, 2.18), (TC + 0.20, 2.18), (TC + 0.20, 2.23), (TC + 0.185, 2.23)], -0.058, 0.004)]
E('IfcSign', 'Símbols del senyal («P» i endoll)', sym, STREET, 'sign_white', 'sign', predefined='MARKER',
  object_type='White legend: P and plug pictogram', src=TYP_SRC, parent=furn,
  psets=spec(Note='The P counter is drawn solid (demo detail level)'))
E('IfcSign', 'Placa complementària · Supplementary plate', [SG.cross([(TC - 0.30, 1.62), (TC + 0.30, 1.62), (TC + 0.30, 1.90), (TC - 0.30, 1.90)], -0.05, 0.012)],
  STREET, 'sign_white', 'sign', predefined='PICTORAL', object_type='Supplementary plate «Només vehicles elèctrics en recàrrega · màx. 2 h»',
  src=TYP_SRC, parent=furn, psets=spec(Text='Només vehicles elèctrics en recàrrega · màx. 2 h', Size_mm='600 × 280'))
E('IfcMechanicalFastener', 'Abraçadores del senyal', [SG.cyl(0, 0, z, 0.036, 0.03) for z in (1.70, 2.05, 2.45)], STREET, 'stainless', 'sign',
  predefined='USERDEFINED', object_type='Stainless band clamps with plate brackets', src=TYP_SRC, parent=furn)
E('IfcMember', 'Suports de les plaques', [SG.box(-0.044, -0.034, TC - 0.25, TC + 0.25, z, 0.04) for z in (1.70, 2.05, 2.45)], STREET, 'steel_galv', 'sign',
  predefined='USERDEFINED', object_type='Galvanised plate brackets', src=TYP_SRC, parent=furn)

# Assemblies carry the asset data too: every element, grouping or not, answers the same register questions.
ASM_KIND = (('charging point', 'connector'), ('pedestal', 'pedestal'), ('Utility', 'meter'), ('Distribution', 'switchgear'),
            ('Feeder', 'cabinet'), ('Draw pit', 'civil'), ('cable route', 'duct'), ('Bollards', 'bollard'), ('bays', 'road'))
for a in f.by_type('IfcElementAssembly'):
    have = {r.RelatingPropertyDefinition.Name for r in a.IsDefinedBy if r.is_a('IfcRelDefinesByProperties')}
    if 'Pset_CDE_AssetManagement (demo)' not in have:
        kind = next(k for key, k in ASM_KIND if key in a.Name)
        for pname, props in am(kind).items():
            if pname not in have:
                m.pset(a, pname, props)
    if 'Pset_CDE_Provenance' not in have:
        src = BELOW_SRC if a.Name.startswith(('Canalització', 'Arqueta')) else NODE_SRC if 'Punt' in a.Name else TYP_SRC
        m.pset(a, 'Pset_CDE_Provenance', {'GeometrySource': 'Assembly of its parts. ' + src[0], 'Confidence': src[1],
                                          'Reference': src[2] if len(src) > 2 else None})

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'endolla-pg-gracia.ifc')
m.finish(out)
cut_path = os.path.splitext(out)[0] + '_cutouts.json'
json.dump({'cdeMeshCutouts': {'version': 1, 'anchor': {'lon': LON0, 'lat': LAT0, 'height': RAW0},
                              'note': 'Boxes in metres: s along bearing (deg clockwise from north), t to its left, z above the '
                                      'anchor height (the tileset anchor, before the scene placement offset).',
                              'boxes': CUTOUTS}}, open(cut_path, 'w'), indent=1)
print('written', out, len(m.f.by_type('IfcProduct')), 'products,', len(CUTOUTS), 'cut-outs ->', cut_path)
