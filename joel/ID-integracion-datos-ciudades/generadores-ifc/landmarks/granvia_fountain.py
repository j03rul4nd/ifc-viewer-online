"""Font Monumental del Passeig de Gràcia — Gran Via: the ornamental fountain at the crossing of Passeig de Gràcia
and Gran Via de les Corts Catalanes, Barcelona, as an authored IFC4X3 model.

What it holds, on the traffic island in the middle of the crossing:
  * the fountain (OSM way 128373344, amenity=fountain, natural=water, lit=yes, drinking_water=no; Wikimedia Commons
    «Category:Font Ornamental del Passeig de Gràcia»: a work by Josep Soteras Mauri, 1952, Art Públic Barcelona code
    420): a raised circular upper basin — concrete core and foundation raft, stone-clad wall, dark stone coping —
    whose water spills over the coping as a lit curtain into a low outer catch channel with its own stone ledge;
    a submerged central pedestal carrying one tall central jet; a ring manifold on the basin floor feeding 36
    arching jets aimed inwards; underwater lights at every jet and round the central jet, LED lines under the
    curtain, and accent uplights in the lawn;
  * the services: return sumps in the catch channel, overflow standpipe, bottom drain, level sensor, the buried
    plant chamber under the lawn with its access hatch and ladder, two pumps, a sand filter, valves, make-up water
    meter and valve, sump pump, control panel, and the pipes between them and to the carriageway sewer and main;
  * the island itself: its lawn (OSM way 128373342, landuse=grass) and the granite kerb round it.
OSM has no bench, bollard, lamp or tree on the island, so none is modelled.

Detailed geometry (roughly LOD 400) carrying LOD 500-style asset data, so a click on any element shows what an
as-built asset register would hold. It is NOT the owner's as-built model and the asset values are invented: every
element says so in Pset_CDE_AssetManagement (demo) and Pset_CDE_Provenance.

What is real:
  * the plan outline from OpenStreetMap (© OpenStreetMap contributors, ODbL): the fountain way 128373344 is a circle
    of radius 6.67 m (±0.03), the lawn way 128373342 the island (≈ 300 m², r ≈ 9.8 m); the metro vestibule and
    corridors under the island (OSM ways 555777767, 555777759, 555777762), kept clear of the plant chamber
    (landmarks/granvia_fountain_site.json);
  * the author and date (Josep Soteras Mauri, 1952) and the catalogue code, from Wikimedia Commons;
  * the form — raised basin, coping, overflow curtain into a lower channel, ring of inward-arching jets, single tall
    central jet, underwater lighting, no sculptural group — from a 2012 photograph on Commons
    («File:13 Font a Gran Via - passeig de Gràcia.jpg», Enfo, CC BY-SA 3.0 es);
  * the levels from ICGC's photogrammetric Barcelona mesh: lawn 72.20 m (ellipsoidal) just outside the basin, the
    upper basin's coping/water ≈ +1.2 to +1.3 m above it, the jets' spray caught as a lump at r 3–5 m ≈ +1.8 to
    +2.1 m (which fixes the arches' reach and height), the carriageway ≈ −0.55 m.
What is estimated, not measured: every other dimension (wall and coping sections, channel width, jet count and
heights, central jet ≈ 5.6 m), everything below ground, all equipment, all asset data. The central pedestal is
a low submerged drum: the photograph shows no sculpture, so none is invented.

Local axes: +x east, +y north, metres, origin at the centroid of OSM way 128373344, z = 0 on the island lawn, which
the ICGC mesh puts at 72.20 m ellipsoidal (≈ 22.50 m above the Alicante datum: EGM08 undulation ≈ 49.70 m).

Scene tiles: anchored at h = 72.20 (the raw, ellipsoidal mesh height) and linked with the same placement as the
ICGC mesh, ELLIPSOIDAL −49.70, so model and mesh move together if that offset is ever corrected.

usage: uv run --with ifcopenshell --with pyproj python landmarks/granvia_fountain.py [out.ifc]
       uv run --with ifcopenshell --with numpy --with shapely python qto.py src/granvia-fountain.ifc src/granvia-fountain_qto.ifc
       uv run --with ifcopenshell --with numpy --with shapely python ifc2tiles.py src/granvia-fountain_qto.ifc \
           tiles/barcelona-granvia-fountain 41.3894302 2.1682913 72.2 0 --keep-origin \
           --wfs tiles/wfs/barcelona-granvia-fountain --wfs-name barcelona_granvia_fountain_features \
           --extras src/granvia-fountain_cutouts.json
"""
import json, math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model  # noqa: E402
from pyproj import Transformer  # noqa: E402

HERE = os.path.dirname(__file__)
SITE = json.load(open(os.path.join(HERE, 'granvia_fountain_site.json'), encoding='utf-8'))
LAT0, LON0 = SITE['origin']['lat'], SITE['origin']['lon']
RAW0 = SITE['datum_raw_ellipsoidal']
ELEV0 = round(RAW0 + SITE['icgc_offset_m'], 2)          # ≈ orthometric (Alicante)
BCN_CRS = (25831, 'ETRS89 / UTM zone 31N', 'ETRS89', 'Alicante (REDNAP)')

m = Model('Font Monumental del Passeig de Gràcia — Gran Via', 'Passeig de Gràcia × Gran Via de les Corts Catalanes, central island',
          'Font Monumental del Passeig de Gràcia', LAT0, LON0, ELEV0,
          description='Illustrative IFC4X3 model (≈LOD 400 geometry, LOD 500-style asset data with demo values). '
                      'Outline © OpenStreetMap contributors (ODbL); form from a Commons photograph; levels measured on the '
                      'ICGC 3D mesh. Not the owner\'s as-built model.',
          tag_prefix='FMGV', crs=BCN_CRS, schema='IFC4X3_ADD2')

# The model's +y is true north; UTM grid north is not. Give the map conversion the grid direction of +x.
_tr = Transformer.from_crs(4326, 25831, always_xy=True)
_e0, _n0 = _tr.transform(LON0, LAT0)
_e1, _n1 = _tr.transform(LON0, LAT0 + 100 / 110574)
_alpha = math.atan2(_e1 - _e0, _n1 - _n0)              # grid azimuth of true north
_mc = m.f.by_type('IfcMapConversion')[0]
_mc.XAxisAbscissa, _mc.XAxisOrdinate = math.cos(_alpha), -math.sin(_alpha)

# ─── Materials ─────────────────────────────────────────────────────────────────────────────────────
M = m.material
M('coping', 'Granite, polished, dark grey-brown', (0.27, 0.24, 0.22), 'Stone', 2700,
  'Coping and weir lip of the upper basin (the dark rim in photographs)')
M('stone', 'Natural stone ashlar, honed, warm grey', (0.56, 0.52, 0.47), 'Stone', 2500,
  'Facing of the basin walls and the catch-channel ledge (stone type assumed)')
M('granite', 'Granite kerb, flamed finish, grey', (0.60, 0.59, 0.57), 'Stone', 2650)
M('concrete', 'Reinforced concrete C30/37', (0.66, 0.65, 0.62), 'Concrete', 2400)
M('render', 'Waterproof cementitious render with blue-grey mosaic finish', (0.30, 0.40, 0.46), 'Concrete', 2000)
M('membrane', 'Polyurea waterproofing membrane, grey', (0.35, 0.36, 0.37), 'Plastic', 1100)
M('water', 'Water (basin)', (0.30, 0.48, 0.62), 'Liquid', 1000, 'Recirculated, filtered fountain water', transparency=0.55)
M('jetwater', 'Water (jets and curtain)', (0.86, 0.92, 0.98), 'Liquid', 1000, 'Aerated water of the jets', transparency=0.45)
M('bronze', 'Bronze, nozzles and inlets', (0.55, 0.42, 0.22), 'Copper alloy', 8800)
M('inox', 'Stainless steel AISI 316L', (0.76, 0.77, 0.78), 'Steel', 8000, 'Submerged fittings and luminaire bodies')
M('led', 'LED lens, clear polycarbonate', (1.00, 0.95, 0.78), 'Plastic', 1200)
M('pvc', 'PVC-U pressure pipe, grey', (0.48, 0.50, 0.52), 'Plastic', 1400)
M('pvc_sewer', 'PVC-U sewer pipe, orange-brown', (0.70, 0.36, 0.16), 'Plastic', 1400)
M('pe', 'Polyethylene PE100, blue (potable water)', (0.13, 0.25, 0.60), 'Plastic', 960)
M('steel', 'Steel, painted RAL 5010 gentian blue', (0.10, 0.26, 0.50), 'Steel', 7850, 'Pumps and filter vessel')
M('steel_grey', 'Steel, galvanised', (0.62, 0.63, 0.62), 'Steel', 7850)
M('panel', 'Steel enclosure, powder-coated RAL 7035', (0.78, 0.79, 0.77), 'Steel', 7850)
M('iron', 'Ductile iron, black', (0.16, 0.16, 0.16), 'Iron', 7100)
M('brass', 'Dezincification-resistant brass', (0.78, 0.65, 0.30), 'Copper alloy', 8500)
M('lawn', 'Lawn on topsoil', (0.33, 0.47, 0.22), 'Soil', 1600, 'Turf over 300 mm of topsoil')

f = m.f


# ─── Geometry helpers ──────────────────────────────────────────────────────────────────────────────
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


def path(pts, r):
    """Pipe along a polyline of 3D points, one rod per leg."""
    return [rod(a, b, r) for a, b in zip(pts, pts[1:])]


def P(r, az, z=None):
    """Point at radius r and azimuth az (degrees clockwise from north) round the fountain axis."""
    a = math.radians(az)
    return (r * math.sin(a), r * math.cos(a)) if z is None else (r * math.sin(a), r * math.cos(a), z)


def rev(rz, z0=0., x=0., y=0.):
    return m.revolve(rz, x, y, z0)


def ring(r_in, r_out, z0, z1):
    """Annulus solid about the fountain axis."""
    return rev([(r_in, z0), (r_out, z0), (r_out, z1), (r_in, z1)])


def circle(r, n=72, cx=0., cy=0.):
    return [(cx + r * math.sin(2 * math.pi * k / n), cy + r * math.cos(2 * math.pi * k / n)) for k in range(n)][::-1]


def arc_rods(r, az0, az1, z, rr, n=6):
    pts = [P(r, az0 + (az1 - az0) * k / n, z) for k in range(n + 1)]
    return path(pts, rr)


# ─── Mesh cut-outs ─────────────────────────────────────────────────────────────────────────────────
# The ICGC mesh already holds the real fountain as a photogrammetric lump (basin, and the jets' spray caught as
# solid), and the IFC stands inside it. Each box below is where this model *replaces* the mesh: the scene hides the
# ground mesh inside it while the model is shown (tileset.json `extras.cdeMeshCutouts`, read by CDE-Frontend). The
# lawn is modelled over the whole island, so wherever a cut leaves a hole the model's own ground shows through.
CUTOUTS = []
CUT_FLOOR = 0.06                                    # above the lawn: where the cut starts (lawn top is +0.03)


def cutout(name, cx, cy, s, t, z, bearing=0.):
    lon = LON0 + cx / (111320 * math.cos(math.radians(LAT0)))
    lat = LAT0 + cy / 110574
    CUTOUTS.append({'name': name, 'lon': round(lon, 8), 'lat': round(lat, 8), 'bearing': round(bearing, 3),
                    's': [round(v, 3) for v in s], 't': [round(v, 3) for v in t], 'z': [round(v, 3) for v in z]})


# ─── Asset data ────────────────────────────────────────────────────────────────────────────────────
YEAR = {'basin': 1952, 'stone': 1952, 'jets': 2016, 'lighting': 2019, 'plant': 2016, 'hydraulics': 2016,
        'controls': 2019, 'meter': 2023, 'chamber': 1992, 'island': 2012, 'water': 2016}
WARRANTY_Y = {'basin': 0, 'stone': 0, 'jets': 5, 'lighting': 5, 'plant': 5, 'hydraulics': 10, 'controls': 5,
              'meter': 5, 'chamber': 10, 'island': 10, 'water': 0}
CODE = {'basin': 'FNT', 'stone': 'FNT', 'jets': 'BRL', 'lighting': 'ENL', 'plant': 'BOM', 'hydraulics': 'HID',
        'controls': 'CTL', 'meter': 'HID', 'chamber': 'CAM', 'island': 'URB', 'water': 'FNT'}
DATA_STATUS = 'Illustrative demo values — not the owner\'s as-built register'
_serial = {}


def _add_months(iso, months):
    y, mo, d = map(int, iso.split('-'))
    mo += months
    y, mo = y + (mo - 1) // 12, (mo - 1) % 12 + 1
    return f'{y:04d}-{mo:02d}-{min(d, 28):02d}'


def am(kind, interval_months, condition, owner, manufacturer, model, contractor, last='2026-06-17', **extra):
    """Pset_CDE_AssetManagement (demo): the fields an as-built asset register holds, with invented values."""
    code = CODE[kind]
    n = _serial.get(code, 0) + 1
    _serial[code] = n
    y = YEAR[kind]
    w = WARRANTY_Y[kind]
    warranty = ('None (heritage asset, pre-dates warranties)' if kind in ('basin', 'stone') else 'Not applicable') if w == 0 else \
        (f'{y + w}-12-31' + (' (expired)' if y + w < 2026 else ''))
    base = {'DataStatus': DATA_STATUS, 'AssetOwner': owner, 'Manufacturer': manufacturer, 'Model': model,
            'SerialNumber': f'BCN-{code}-0420-{n:03d}',
            'LifecycleStatus': 'In service', 'InstallationYear': y, 'LastInspection': last,
            'InspectionInterval_months': interval_months, 'NextInspection': _add_months(last, interval_months),
            'ConditionIndex_1to5': condition, 'WarrantyEnd': warranty, 'MaintenanceContractor': contractor,
            'MaintenanceStrategy': 'Time-based (meter replacement cycle)' if kind == 'meter' else
            ('Preventive, weekly fountain round' if kind in ('jets', 'plant', 'water') else 'Condition-based')}
    base.update({k: v for k, v in extra.items() if v is not None})
    return {'Pset_CDE_AssetManagement (demo)': base}


def spec(**props):
    return {'Pset_CDE_Specification': props}


def prov(src):
    return {'Pset_CDE_Provenance': {'GeometrySource': src[0], 'Confidence': src[1], 'Reference': src[2] if len(src) > 2 else None}}


AJ = 'Ajuntament de Barcelona — Art Públic catalogue 420 (owner assumed; register values are demo)'
AJ_PARKS = 'Ajuntament de Barcelona — parks and gardens (demo)'
CON_FNT = 'Demo contractor — ornamental fountains'
CON_STN = 'Demo contractor — heritage stonework'
CON_LGT = 'Demo contractor — public and fountain lighting'
CON_WAT = 'Demo contractor — water networks'
CON_URB = 'Demo contractor — paving, kerbs and green areas'
SOTERAS = 'Ornamental fountain by Josep Soteras Mauri (1952)'

OUTLINE = ('Plan outline from OSM way 128373344 (ODbL): a circle of r = 6.67 m (±0.03); section estimated', 'High',
           'OSM way 128373344; Wikimedia Commons «Category:Font Ornamental del Passeig de Gràcia»')
FORM = ('Form from a 2012 photograph and the ICGC mesh profile (rim ≈ +1.2 m); dimensions estimated', 'Medium',
        'Commons «File:13 Font a Gran Via - passeig de Gràcia.jpg» (Enfo, CC BY-SA 3.0 es); ICGC Barcelona mesh')
JETS = ('Ring of inward-arching jets and one central jet seen in a 2012 photograph; count, reach and height estimated '
        '(reach and height checked against the spray lump at r 3–5 m, +1.8–2.1 m, in the ICGC mesh)', 'Medium',
        'Commons «File:13 Font a Gran Via - passeig de Gràcia.jpg»; ICGC Barcelona mesh')
LIGHTS = ('Underwater lighting seen in a 2012 night photograph (lit jets and curtain); fittings and positions typical', 'Low',
          'Commons «File:13 Font a Gran Via - passeig de Gràcia.jpg»; OSM lit=yes')
TYP = ('Not visible in any open source; typical for a recirculating ornamental fountain', 'Low')
BELOW = ('Below ground: not visible in any open source; typical for a recirculating ornamental fountain. Placed clear '
         'of the metro vestibule and corridors in OSM (ways 555777767, 555777759, 555777762)', 'Low')
LAWN = ('Island outline from OSM way 128373342 (landuse=grass, ODbL); level from the ICGC mesh', 'High',
        'OSM way 128373342; ICGC Barcelona mesh (72.20 m ellipsoidal)')

# ─── Spatial structure ─────────────────────────────────────────────────────────────────────────────
ISLAND = 'Illa central · Island level'
PLANT = 'Cambra de bombes · Plant level'
m.storey(ISLAND, 0., 'The traffic island in the crossing, at the lawn')
m.storey(PLANT, -2.80, 'The buried plant chamber under the north side of the lawn')

# key levels (z, metres above the lawn)
Z_RAFT0, Z_RAFT1 = -0.70, -0.40
Z_CH_FLOOR, Z_CH_WATER, Z_LEDGE = -0.05, 0.15, 0.30
Z_FLOOR, Z_WATER, Z_COPE0, Z_COPE1 = 0.75, 1.27, 1.10, 1.25
R_CORE, R_WALL, R_CLAD, R_COPE = 6.05, 6.50, 6.56, SITE['fountain_outline']['radius_mean_m']
R_CH_OUT, R_LEDGE = 7.05, 7.45
R_RING, N_JETS = 5.85, 36

# ═══ 1. The fountain ══════════════════════════════════════════════════════════════════════════════
fnt = m.assembly('Font Monumental del Passeig de Gràcia', ISLAND, object_type='Ornamental fountain with overflow curtain and jets',
                 description='Raised circular basin by Josep Soteras Mauri (1952) in the centre of the Passeig de Gràcia × Gran Via crossing.',
                 psets={**spec(OSMWay=128373344, ArtPublicCode=420, ArtPublicRef='08019/2822-1', Architect='Josep Soteras Mauri',
                               Year=1952, Diameter_m=round(2 * R_COPE, 2), OverallDiameter_m=round(2 * R_LEDGE, 2),
                               RimHeight_m=Z_COPE1, ArchingJets=N_JETS, CentralJets=1, CentralJetHeight_m=5.6,
                               WaterVolume_m3=58, Recirculating=True, PotableWater=False, Lit=True,
                               HeritageStatus='Catalogued public art (demo — not checked)'),
                        **am('basin', 6, 4, AJ, 'Original works contractor (1952, unknown)', SOTERAS, CON_FNT,
                             LastRefurbishment='2016 hydraulics, 2019 LED lighting (demo)'),
                        **prov(FORM)})

# -- structure
bas = m.assembly('Vas superior · Upper basin', None, object_type='Raised circular basin', parent=fnt,
                 psets={**spec(InnerDiameter_m=round(2 * R_CORE, 2), WaterDepth_m=round(Z_WATER - Z_FLOOR, 2), WeirLength_m=round(2 * math.pi * R_COPE, 1)),
                        **am('basin', 12, 4, AJ, 'Original works contractor (1952, unknown)', SOTERAS, CON_STN), **prov(OUTLINE)})
m.element('IfcSlab', 'Llosa de fonamentació · Foundation raft', [m.cylinder(0, 0, Z_RAFT0, R_LEDGE, Z_RAFT1 - Z_RAFT0)], ISLAND,
          'concrete', predefined='BASESLAB', object_type='Reinforced concrete raft Ø 14.9 m, 300 mm', parent=bas, src=TYP,
          common={'LoadBearing': True},
          psets={**spec(Thickness_mm=300, Reinforcement='B500S mesh top and bottom (assumed)', Note='Over the metro vestibule roof (not modelled)'),
                 **am('basin', 60, 4, AJ, 'Original works contractor (1952, unknown)', 'In-situ raft', CON_STN)})
m.element('IfcBuildingElementProxy', 'Nucli de formigó · Concrete core of the basin', [m.cylinder(0, 0, Z_RAFT1, R_CORE, Z_FLOOR - 0.20 - Z_RAFT1)],
          ISLAND, 'concrete', predefined='USERDEFINED', object_type='Mass concrete fill under the basin floor, pipe sleeves cast in',
          parent=bas, src=TYP, psets={**spec(Sleeves='DN110 × 2, DN160 × 1, DN50 × 2 (assumed)'),
                                      **am('basin', 60, 4, AJ, 'Original works contractor (1952, unknown)', 'Mass concrete', CON_STN)})
m.element('IfcSlab', 'Solera del vas · Basin floor slab', [m.cylinder(0, 0, Z_FLOOR - 0.20, R_CORE, 0.18)], ISLAND, 'concrete',
          predefined='FLOOR', object_type='Reinforced concrete floor, falls to the bottom drain', parent=bas, src=TYP,
          psets={**spec(Thickness_mm=180, Fall_pct=0.5), **am('basin', 60, 4, AJ, 'Original works contractor (1952, unknown)', 'In-situ slab', CON_STN)})
m.element('IfcCovering', 'Impermeabilització del vas · Basin membrane', [m.cylinder(0, 0, Z_FLOOR - 0.02, R_CORE, 0.005),
                                                                       ring(R_CORE - 0.005, R_CORE, Z_FLOOR - 0.02, Z_COPE0)],
          ISLAND, 'membrane', predefined='MEMBRANE', object_type='Spray-applied polyurea, 2 mm, floor and inner wall face',
          parent=bas, src=TYP, psets={**spec(Thickness_mm=2, Applied='2016 (demo)'),
                                      **am('hydraulics', 24, 4, AJ, 'Demo membrane maker', 'Polyurea 2 mm', CON_FNT)})
m.element('IfcCovering', 'Revestiment del fons · Basin floor finish', [m.cylinder(0, 0, Z_FLOOR - 0.015, R_CORE - 0.005, 0.015)],
          ISLAND, 'render', predefined='FLOORING', object_type='Render with blue-grey glass mosaic (finish assumed)', parent=bas, src=TYP,
          psets={**spec(Finish='Glass mosaic 25 × 25 (assumed)'), **am('basin', 24, 3, AJ, 'Demo tile maker', 'Glass mosaic 25', CON_FNT,
                                                                      Note='Scaling and loose tesserae near the drain (demo)')})
m.element('IfcWall', 'Mur del vas superior · Upper basin wall', [ring(R_CORE, R_WALL, Z_RAFT1, Z_COPE0)], ISLAND, 'concrete',
          predefined='USERDEFINED', object_type='Circular reinforced-concrete basin wall, 450 mm', parent=bas, src=OUTLINE,
          psets={**spec(Thickness_mm=450, Height_mm=int((Z_COPE0 - Z_RAFT1) * 1000)),
                 **am('basin', 24, 4, AJ, 'Original works contractor (1952, unknown)', SOTERAS, CON_STN)})
m.element('IfcCovering', 'Aplacat de pedra · Stone facing of the basin wall', [ring(R_WALL, R_CLAD, Z_CH_FLOOR, Z_COPE0)], ISLAND, 'stone',
          predefined='CLADDING', object_type='Curved stone ashlar facing behind the curtain', parent=bas, src=FORM,
          psets={**spec(Thickness_mm=60, Courses=2), **am('stone', 24, 3, AJ, 'Demo quarry', 'Stone ashlar 60 mm', CON_STN,
                                                          Note='Calcite staining behind the curtain (demo)')})
m.element('IfcCovering', 'Albardilla i llavi d\'abocament · Coping and weir lip',
          [rev([(R_CORE - 0.10, Z_COPE0), (R_COPE - 0.02, Z_COPE0), (R_COPE, Z_COPE0 + 0.02), (R_COPE, Z_COPE1 - 0.03),
                (R_COPE - 0.04, Z_COPE1), (R_CORE - 0.06, Z_COPE1), (R_CORE - 0.10, Z_COPE1 - 0.04)])],
          ISLAND, 'coping', predefined='COPING', object_type='Polished granite coping, 720 mm wide, levelled as the weir',
          parent=bas, src=FORM,
          psets={**spec(Width_mm=int((R_COPE - R_CORE + 0.10) * 1000), Height_mm=150, Segments=24, WeirLevelTolerance_mm=2),
                 **am('stone', 12, 4, AJ, 'Demo quarry', 'Granite coping, curved segments', CON_STN, Note='Joint 7 re-sealed 2025 (demo)')})

# -- catch channel
chn = m.assembly('Canal de recollida · Catch channel', None, object_type='Low outer channel under the overflow curtain', parent=fnt,
                 psets={**spec(Width_mm=int((R_CH_OUT - R_CLAD) * 1000), WaterDepth_mm=int((Z_CH_WATER - Z_CH_FLOOR) * 1000)),
                        **am('basin', 12, 4, AJ, 'Original works contractor (1952, unknown)', SOTERAS, CON_STN), **prov(FORM)})
m.element('IfcSlab', 'Solera del canal · Channel floor', [ring(R_WALL, R_CH_OUT, Z_RAFT1, Z_CH_FLOOR)], ISLAND, 'render',
          predefined='FLOOR', object_type='Concrete channel floor with waterproof render', parent=chn, src=FORM,
          psets={**spec(Thickness_mm=350), **am('basin', 24, 4, AJ, 'Original works contractor (1952, unknown)', 'In-situ, rendered', CON_STN)})
m.element('IfcWall', 'Mur del canal · Channel ledge wall',
          [rev([(R_CH_OUT, Z_RAFT1), (R_LEDGE, Z_RAFT1), (R_LEDGE, Z_LEDGE - 0.06), (R_LEDGE - 0.04, Z_LEDGE),
                (R_CH_OUT + 0.03, Z_LEDGE), (R_CH_OUT, Z_LEDGE - 0.04)])],
          ISLAND, 'stone', predefined='USERDEFINED', object_type='Low stone ledge, 400 mm wide, rounded arris', parent=chn, src=FORM,
          psets={**spec(Width_mm=400, HeightAboveLawn_mm=int(Z_LEDGE * 1000)),
                 **am('stone', 12, 3, AJ, 'Demo quarry', 'Stone ledge, curved', CON_STN, Note='Chipped arris on the Gran Via side (demo)')})

# -- water (not assets, but what the fountain is for)
m.element('IfcBuildingElementProxy', 'Aigua del vas superior · Upper basin water, weir sheet and curtain',
          [m.cylinder(0, 0, Z_FLOOR, R_CORE - 0.006, Z_WATER - Z_FLOOR - 0.02),
           ring(R_CORE - 0.06, R_COPE + 0.005, Z_COPE1, Z_WATER - 0.005),
           ring(R_COPE + 0.005, R_COPE + 0.035, Z_CH_WATER, Z_COPE1 - 0.005)],
          ISLAND, 'water', predefined='USERDEFINED', object_type='Water body, 20 mm sheet over the weir, falling curtain', parent=fnt, src=FORM,
          psets={**spec(Volume_m3=55, WeirHead_mm=20, CurtainFlow_l_s=38, Treatment='Sand filtration, UV and chlorine dosing (demo)'),
                 **am('water', 1, 4, AJ, 'Not applicable', 'Recirculated water', CON_FNT, Note='Water, not a fixed asset; quality values for illustration',
                      Turbidity_NTU=0.8, FreeChlorine_mg_l=0.6, pH=7.4, LastSample='2026-09-29')})
m.element('IfcBuildingElementProxy', 'Aigua del canal · Catch-channel water', [ring(R_CLAD + 0.002, R_CH_OUT - 0.002, Z_CH_FLOOR, Z_CH_WATER)],
          ISLAND, 'water', predefined='USERDEFINED', object_type='Water in the catch channel, held at the overflow level', parent=chn, src=FORM,
          psets={**spec(Volume_m3=3.0), **am('water', 1, 4, AJ, 'Not applicable', 'Recirculated water', CON_FNT,
                                             Note='Water, not a fixed asset; values for illustration')})

# -- central pedestal and jet
ctr = m.assembly('Brollador central · Central jet', None, object_type='Submerged pedestal with the central vertical jet', parent=fnt,
                 psets={**spec(JetHeight_m=5.6, Flow_m3_h=42, NozzleType='Clear-stream jet DN65'),
                        **am('jets', 3, 4, AJ, 'Demo fountain-nozzle maker', 'Clear-stream jet DN65', CON_FNT), **prov(JETS)})
m.element('IfcBuildingElementProxy', 'Pedestal central submergit · Submerged central pedestal',
          [rev([(0., 0.), (0.72, 0.), (0.72, 0.22), (0.66, 0.30), (0., 0.30)], Z_FLOOR)], ISLAND, 'stone', predefined='USERDEFINED',
          object_type='Stone drum Ø 1.44 m, 70 mm below the water (no sculptural group: none in photographs)', parent=ctr, src=FORM,
          psets={**spec(Diameter_mm=1440, Height_mm=300, Submerged=True), **am('stone', 12, 4, AJ, 'Demo quarry', 'Stone drum', CON_STN)})
m.element('IfcSanitaryTerminal', 'Tovera central · Central jet nozzle',
          [rev([(0., 0.), (0.12, 0.), (0.12, 0.06), (0.06, 0.20), (0.04, 0.24), (0., 0.24)], Z_FLOOR + 0.30)], ISLAND, 'bronze',
          predefined='USERDEFINED', object_type='Clear-stream jet nozzle DN65, adjustable', parent=ctr, src=JETS,
          psets={**spec(NominalDiameter_mm=65, Flow_m3_h=42, Pressure_bar=0.9, JetHeight_m=5.6),
                 **am('jets', 3, 4, AJ, 'Demo fountain-nozzle maker', 'Clear-stream jet DN65', CON_FNT, Note='Strainer cleaned weekly (demo)')})
m.element('IfcBuildingElementProxy', 'Raig central · Central jet (water)',
          [rev([(0., 0.), (0.035, 0.), (0.07, 1.2), (0.12, 2.6), (0.20, 3.6), (0.28, 4.3), (0.30, 4.6), (0.24, 4.95), (0.12, 5.12), (0., 5.15)],
               Z_FLOOR + 0.54)], ISLAND, 'jetwater', predefined='USERDEFINED', object_type='Vertical water jet (visual), 5.6 m above the water',
          parent=ctr, src=JETS, psets={**spec(Height_m=5.6), **am('water', 1, 4, AJ, 'Not applicable', 'Water jet', CON_FNT,
                                                                 Note='Water, not a fixed asset; height set by the pump VFD')})
for k in range(4):
    az = 45 + 90 * k
    x, y = P(0.46, az)
    m.element('IfcLightFixture', f'Projector central {k + 1} · Central jet floodlight {k + 1}',
              [m.cylinder(x, y, Z_FLOOR + 0.30, 0.09, 0.07), m.cylinder(x, y, Z_FLOOR + 0.37, 0.075, 0.015)], ISLAND, 'inox',
              predefined='DIRECTIONSOURCE', object_type='Submersible LED floodlight RGBW 30 W, IP68', parent=ctr, src=LIGHTS,
              psets={**spec(Power_W=30, Colour='RGBW, DMX', IngressProtection='IP68', BeamAngle_deg=25, Voltage='24 V DC'),
                     **am('lighting', 12, 4 if k != 2 else 2, AJ, 'Demo underwater-lighting maker', 'Submersible RGBW 30 W', CON_LGT,
                          BurningHours=21400 + 13 * k, Note='Red channel failed, replacement ordered (demo)' if k == 2 else None)})

# -- ring manifold, arching jets and their lights
jet = m.assembly('Anell de brolladors · Ring of arching jets', None, object_type='Ring manifold with 36 inward-arching jets', parent=fnt,
                 psets={**spec(Jets=N_JETS, RingDiameter_m=2 * R_RING, Reach_m=2.45, ArcHeight_m=1.05, Flow_m3_h=54),
                        **am('jets', 3, 4, AJ, 'Demo fountain-nozzle maker', 'Laminar arc jet DN20', CON_FNT), **prov(JETS)})
oct8 = [(R_RING + 0.055 * math.cos(2 * math.pi * k / 8 + math.pi / 8), Z_FLOOR + 0.055 + 0.055 * math.sin(2 * math.pi * k / 8 + math.pi / 8))
        for k in range(8)]
m.element('IfcPipeSegment', 'Anell distribuïdor · Ring manifold', [rev(oct8)], ISLAND, 'inox', predefined='RIGIDSEGMENT',
          object_type='Stainless ring main DN100 on the basin floor, saddle supports', parent=jet, src=TYP,
          psets={**spec(NominalDiameter_mm=100, Outlets=N_JETS, Feeds=2), **am('hydraulics', 24, 4, AJ, 'Demo pipe maker', 'AISI 316L DN100 ring', CON_FNT)})
REACH, ARCH = 2.45, 1.05
for k in range(N_JETS):
    az = 360 * k / N_JETS + 5
    z0 = Z_FLOOR + 0.11
    zn = Z_WATER + 0.03
    noz = [rod(P(R_RING, az, z0), P(R_RING, az, zn - 0.06), 0.016),
           rod(P(R_RING, az, zn - 0.06), P(R_RING - 0.05, az, zn + 0.02), 0.020)]
    m.element('IfcSanitaryTerminal', f'Brollador d\'arc {k + 1:02d} · Arching jet nozzle {k + 1:02d}', noz, ISLAND, 'bronze',
              predefined='USERDEFINED', object_type='Laminar arc-jet nozzle DN20 on a riser, aimed at the centre, 35° elevation',
              parent=jet, src=JETS,
              psets={**spec(NominalDiameter_mm=20, Flow_l_min=25, Elevation_deg=35, Azimuth_deg=round((az + 180) % 360, 1)),
                     **am('jets', 3, 3 if k in (7, 22) else 4, AJ, 'Demo fountain-nozzle maker', 'Laminar arc jet DN20', CON_FNT,
                          Note='Partly blocked by limescale, arc short (demo)' if k in (7, 22) else None)})
    n = 8
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(P(R_RING - 0.05 - (REACH - 0.05) * t, az, zn + 0.02 + 4 * ARCH * t * (1 - t) - 0.08 * t))
    m.element('IfcBuildingElementProxy', f'Arc d\'aigua {k + 1:02d} · Water arc {k + 1:02d}', path(pts, 0.03), ISLAND, 'jetwater',
              predefined='USERDEFINED', object_type='Arching water jet (visual)', parent=jet, src=JETS,
              psets={**spec(Reach_m=REACH, Height_m=ARCH, Nozzle=f'FMGV jet nozzle {k + 1:02d}'),
                     **am('water', 1, 4, AJ, 'Not applicable', 'Water jet', CON_FNT, Note='Water, not a fixed asset')})
    x, y = P(R_RING - 0.30, az)
    m.element('IfcLightFixture', f'Focus subaquàtic {k + 1:02d} · Underwater spot {k + 1:02d}',
              [m.cylinder(x, y, Z_FLOOR, 0.065, 0.06), m.cylinder(x, y, Z_FLOOR + 0.06, 0.05, 0.012)], ISLAND, 'inox',
              predefined='DIRECTIONSOURCE', object_type='Submersible LED spot RGBW 9 W, aimed up the arc, IP68', parent=jet, src=LIGHTS,
              psets={**spec(Power_W=9, Colour='RGBW, DMX', IngressProtection='IP68', BeamAngle_deg=15, Voltage='24 V DC'),
                     **am('lighting', 12, 2 if k == 30 else 4, AJ, 'Demo underwater-lighting maker', 'Submersible RGBW 9 W', CON_LGT,
                          BurningHours=21400 + 7 * k, Note='Water ingress, lamp off (demo)' if k == 30 else None)})

# -- curtain lighting
for k in range(8):
    az0 = 45 * k + 1.5
    m.element('IfcLightFixture', f'Línia LED de la cortina {k + 1} · Curtain LED line {k + 1}',
              arc_rods(R_CLAD + 0.12, az0, az0 + 42, Z_CH_FLOOR + 0.025, 0.025), ISLAND, 'led', predefined='DIRECTIONSOURCE',
              object_type='Submersible linear LED, RGBW, grazing the curtain from below', parent=chn, src=LIGHTS,
              psets={**spec(Length_m=round(math.radians(42) * (R_CLAD + 0.12), 2), Power_W=48, Colour='RGBW, DMX', IngressProtection='IP68'),
                     **am('lighting', 12, 4, AJ, 'Demo underwater-lighting maker', 'Linear LED IP68 RGBW', CON_LGT, BurningHours=20900 + 11 * k)})

# -- returns, overflow, drain, level sensor
RET_AZ = (352., 8.)
for k, az in enumerate(RET_AZ, 1):
    x, y = P((R_CLAD + R_CH_OUT) / 2, az)
    gr = [m.box(x, y, Z_CH_FLOOR - 0.02, 0.36, 0.36, 0.02, angle=math.radians(90 - az))]
    gr += [m.box(*P((R_CLAD + R_CH_OUT) / 2 + d, az), Z_CH_FLOOR, 0.36, 0.02, 0.025, angle=math.radians(90 - az)) for d in (-0.12, -0.06, 0., 0.06, 0.12)]
    m.element('IfcWasteTerminal', f'Pou de retorn {k} · Return sump {k}', gr, ISLAND, 'inox', predefined='GULLYSUMP',
              object_type='Return sump 400 × 400 with stainless grate, suction to the pumps', parent=chn, src=TYP,
              psets={**spec(GrateSize_mm='360 × 360', Outlet='DN110 suction to the plant chamber', AntiVortex=True),
                     **am('hydraulics', 3, 4, AJ, 'Demo fountain-equipment maker', 'Return sump 40×40', CON_FNT)})
OVF = P((R_CLAD + R_CH_OUT) / 2, 32.)
m.element('IfcWasteTerminal', 'Sobreeixidor · Overflow standpipe', [m.tube(OVF[0], OVF[1], Z_CH_FLOOR, 0.063, 0.055, Z_CH_WATER - Z_CH_FLOOR),
                                                               m.cylinder(OVF[0], OVF[1], Z_CH_WATER - 0.005, 0.07, 0.005)],
          ISLAND, 'inox', predefined='USERDEFINED', object_type='Removable overflow standpipe DN110, sets the channel level',
          parent=chn, src=TYP, psets={**spec(NominalDiameter_mm=110, OverflowLevel_m=Z_CH_WATER, Outlet='Combined sewer'),
                                      **am('hydraulics', 3, 4, AJ, 'Demo fountain-equipment maker', 'Overflow standpipe DN110', CON_FNT)})
DRN = P(2.5, 200.)
m.element('IfcWasteTerminal', 'Desguàs de fons · Bottom drain', [m.cylinder(DRN[0], DRN[1], Z_FLOOR - 0.01, 0.16, 0.025)]
          + [m.box(DRN[0] + d, DRN[1], Z_FLOOR + 0.015, 0.02, 0.26, 0.01) for d in (-0.08, -0.04, 0., 0.04, 0.08)],
          ISLAND, 'inox', predefined='FLOORWASTE', object_type='Bottom drain DN160 with anti-entrapment grate', parent=bas, src=TYP,
          psets={**spec(NominalDiameter_mm=160, Grate='Anti-entrapment, EN 13451-3', EmptyingTime_h=2.5),
                 **am('hydraulics', 6, 4, AJ, 'Demo fountain-equipment maker', 'Bottom drain DN160', CON_FNT)})
LS = P(R_CH_OUT - 0.08, 20.)
m.element('IfcSensor', 'Sensor de nivell · Level sensor', [m.box(LS[0], LS[1], Z_CH_FLOOR, 0.08, 0.08, 0.30)], ISLAND, 'inox',
          predefined='LEVELSENSOR', object_type='Hydrostatic level probe in a stilling tube (low-level pump cut-out, make-up)', parent=chn, src=TYP,
          psets={**spec(Range_m=0.5, Output='4–20 mA to the PLC', Setpoints='Make-up 0.12 m, low cut-out 0.07 m (demo)'),
                 **am('controls', 6, 4, AJ, 'Demo instrument maker', 'Hydrostatic probe 0–0.5 m', CON_FNT, LastReading_m=0.148,
                      LastReadingTime='2026-10-01T06:00')})

# ═══ 2. Plant chamber ════════════════════════════════════════════════════════════════════════════
# Under the north side of the lawn, tangential to the basin, clear of the metro corridors in OSM.
CX, CY = 0., 8.60
X0, X1, Y0, Y1 = CX - 1.70, CX + 1.70, CY - 1.10, CY + 1.10       # outer
T = 0.20
ZB, ZR = -3.00, 0.03                                               # bottom of floor slab, top of roof slab (flush with the lawn)
ZF = ZB + T                                                        # floor top -2.80
pl = m.assembly('Cambra de bombes · Plant chamber', PLANT, object_type='Buried plant chamber of the fountain',
                psets={**spec(InnerSize_mm='3 000 × 1 800 × 2 630', Access='Hatch 900 × 900 and fixed ladder',
                              ConfinedSpace=True, Ventilation='Passive, two vent grilles in the hatch frame'),
                       **am('chamber', 12, 4, AJ, 'Demo civil contractor', 'In-situ chamber', CON_FNT), **prov(BELOW)})
m.element('IfcDistributionChamberElement', 'Cambra de bombes · Plant chamber shell',
          [m.box(CX, CY, ZB, X1 - X0, Y1 - Y0, T),
           m.box(CX, Y0 + T / 2, ZF, X1 - X0, T, ZR - T - ZF), m.box(CX, Y1 - T / 2, ZF, X1 - X0, T, ZR - T - ZF),
           m.box(X0 + T / 2, CY, ZF, T, Y1 - Y0 - 2 * T, ZR - T - ZF), m.box(X1 - T / 2, CY, ZF, T, Y1 - Y0 - 2 * T, ZR - T - ZF)],
          PLANT, 'concrete', predefined='USERDEFINED', object_type='Reinforced concrete pump pit, walls and floor 200 mm, tanked',
          parent=pl, src=BELOW, psets={**spec(WallThickness_mm=200, Tanking='Crystalline waterproofing', SumpPit='400 × 400 × 300'),
                                        **am('chamber', 60, 4, AJ, 'Demo civil contractor', 'In-situ RC chamber', CON_FNT)})
HX, HY, HW = X0 + 0.75, CY, 0.90
roof = m.element('IfcSlab', 'Llosa de coberta de la cambra · Chamber roof slab', [m.box(CX, CY, ZR - T, X1 - X0, Y1 - Y0, T)], PLANT, 'concrete',
                 predefined='ROOF', object_type='Reinforced concrete roof slab 200 mm, flush with the lawn, hatch opening',
                 parent=pl, src=BELOW, common={'LoadBearing': True},
                 psets={**spec(Thickness_mm=200, LoadClass='Pedestrian and maintenance vehicles 5 kN/m²'),
                        **am('chamber', 60, 4, AJ, 'Demo civil contractor', 'In-situ RC slab', CON_FNT)})
hatch = m.element('IfcDoor', 'Trapa d\'accés · Access hatch',
                  [m.box(HX, HY, ZR - 0.012, HW, HW, 0.012),
                   m.box(HX, HY - HW / 2 - 0.03, ZR - 0.08, HW + 0.12, 0.06, 0.08), m.box(HX, HY + HW / 2 + 0.03, ZR - 0.08, HW + 0.12, 0.06, 0.08),
                   m.box(HX - HW / 2 - 0.03, HY, ZR - 0.08, 0.06, HW, 0.08), m.box(HX + HW / 2 + 0.03, HY, ZR - 0.08, 0.06, HW, 0.08)],
                  PLANT, 'iron', predefined='TRAPDOOR', object_type='Ductile-iron hatch 900 × 900, gas-strut assisted, lockable',
                  parent=pl, src=BELOW,
                  psets={**spec(ClearOpening_mm='900 × 900', Class='B125 (EN 124)', Locking='Triangular key, padlock (demo)'),
                         **am('chamber', 12, 4, AJ, 'Demo foundry', 'Hatch 90×90 B125', CON_FNT)})
hatch.OverallWidth, hatch.OverallHeight = HW, HW
m.opening(roof, [m.box(HX, HY, ZR - T - 0.01, HW + 0.18, HW + 0.18, T + 0.02)], filler=hatch)
lad = [rod((HX + s, HY + 0.30, ZF), (HX + s, HY + 0.30, ZR + 0.0 - 0.10), 0.02) for s in (-0.22, 0.22)]
lad += [rod((HX - 0.22, HY + 0.30, z), (HX + 0.22, HY + 0.30, z), 0.012) for z in [ZF + 0.30 + 0.28 * i for i in range(9)]]
m.element('IfcMember', 'Escala fixa · Fixed ladder', lad, PLANT, 'steel_grey', predefined='USERDEFINED',
          object_type='Galvanised fixed ladder with extending handhold', parent=pl, src=BELOW,
          psets={**spec(Rungs=9, RungPitch_mm=280), **am('chamber', 12, 4, AJ, 'Demo steelwork', 'Fixed ladder', CON_FNT)})


def pump(name, x, y, kind, flow, head, power, cond=4, note=None, sump=False):
    if sump:
        it = [m.cylinder(x, y, ZF - 0.30, 0.10, 0.36), m.cylinder(x, y, ZF + 0.06, 0.06, 0.12)]
        pre, ot, mdl = 'SUMPPUMP', 'Submersible drainage pump with float switch, in the sump pit', 'Drainage pump 0.4 kW'
    else:
        it = [m.box(x, y, ZF, 0.80, 0.32, 0.10),                                   # base frame
              rod((x - 0.35, y, ZF + 0.32), (x + 0.10, y, ZF + 0.32), 0.14),        # motor
              rod((x + 0.10, y, ZF + 0.32), (x + 0.24, y, ZF + 0.32), 0.18),        # volute
              rod((x + 0.24, y, ZF + 0.32), (x + 0.34, y, ZF + 0.32), 0.07),        # suction branch
              rod((x + 0.17, y, ZF + 0.45), (x + 0.17, y, ZF + 0.62), 0.06)]        # delivery branch
        pre, ot, mdl = 'ENDSUCTION', 'End-suction centrifugal pump, bronze impeller, VFD', f'End-suction {power} kW'
    m.element('IfcPump', name, it, PLANT, 'steel', predefined=pre, object_type=ot, parent=pl, src=BELOW,
              psets={**spec(Flow_m3_h=flow, Head_m=head, MotorPower_kW=power, Supply='400 V 3~' if not sump else '230 V',
                            Drive='Variable-frequency drive' if not sump else 'Direct, float switch', Duty=kind),
                     **am('plant', 3, cond, AJ, 'Demo pump manufacturer', mdl, CON_FNT, RunningHours=24800 if not sump else 610,
                          Note=note)})


pump('Bomba dels brolladors · Jet pump P1', -0.15, 8.05, 'Ring of arching jets and central jet', 96, 14, 7.5,
     note='Mechanical seal weeping, monitor (demo)', cond=3)
pump('Bomba de filtració i cortina · Filtration pump P2', -0.15, 9.15, 'Filtration loop and curtain top-up', 30, 18, 3.0)
SPX, SPY = -1.15, 9.15
pump('Bomba d\'esgotament · Sump pump P3', SPX, SPY, 'Chamber dewatering', 8, 6, 0.4, sump=True)
FX, FY = 1.00, 8.75
m.element('IfcFilter', 'Filtre de sorra · Sand filter', [m.cylinder(FX, FY, ZF, 0.34, 0.12), m.cylinder(FX, FY, ZF + 0.12, 0.30, 0.95),
                                                         m.sphere(FX, FY, ZF + 1.07, 0.30, n=10), rod((FX, FY, ZF + 1.30), (FX, FY, ZF + 1.42), 0.03)],
          PLANT, 'steel', predefined='WATERFILTER', object_type='Pressure sand filter Ø 600, multiport valve, backwash to sewer',
          parent=pl, src=BELOW, psets={**spec(Diameter_mm=600, Media='Silica sand 0.4–0.8 mm, 150 kg', Flow_m3_h=30, BackwashInterval='Weekly'),
                                       **am('plant', 3, 4, AJ, 'Demo filter manufacturer', 'Sand filter Ø600', CON_FNT, LastBackwash='2026-09-28',
                                            DifferentialPressure_bar=0.35)})
m.element('IfcElectricDistributionBoard', 'Quadre de control · Control panel', [m.box(X1 - T - 0.13, 8.10, ZF + 0.80, 0.25, 0.80, 1.00)],
          PLANT, 'panel', predefined='DISTRIBUTIONBOARD', object_type='Fountain control panel: VFDs, PLC, DMX lighting controller, 24 V drivers',
          parent=pl, src=BELOW, psets={**spec(Supply='400 V 3~ 20 kVA from the street-lighting network (demo)', IngressProtection='IP65',
                                              Programs='Day / night / event shows, astronomical clock, wind cut-out', Remote='4G telemetry (demo)'),
                                       **am('controls', 6, 4, AJ, 'Demo panel builder', 'Fountain control panel', CON_FNT,
                                            Alarms30d=2, LastAlarm='2026-09-14 low level (demo)')})

# -- pipework (z = -1.10 under the raft; suction at the pump branches)
ZH, ZC = -1.10, ZF + 0.32
P1D = (-0.15 + 0.17, 8.05, ZF + 0.62)
P2D = (-0.15 + 0.17, 9.15, ZF + 0.62)
YC = Y1 - T - 0.10                                     # sewer collector along the north wall
hyd = m.assembly('Canonades i valvuleria · Pipework and valves', None, object_type='Fountain hydraulics', parent=pl,
                 psets={**spec(PressurePipe='PVC-U PN10', Sewer='PVC-U SN8'), **am('hydraulics', 12, 4, AJ, 'Demo pipe maker', 'PVC-U pipework', CON_FNT), **prov(BELOW)})


def pipe(name, pts, r, mat, ot, dn, extra=None, kind='hydraulics', mdl='PVC-U PN10'):
    m.element('IfcPipeSegment', name, path(pts, r), PLANT, mat, predefined='RIGIDSEGMENT', object_type=ot, parent=hyd, src=BELOW,
              psets={**spec(NominalDiameter_mm=dn, **(extra or {})), **am(kind, 24, 4, AJ, 'Demo pipe maker', mdl, CON_FNT)})


rs = [P((R_CLAD + R_CH_OUT) / 2, az) for az in RET_AZ]
pipe('Aspiració 1 · Return suction 1 (to P1)', [(rs[0][0], rs[0][1], Z_CH_FLOOR - 0.02), (rs[0][0], rs[0][1], ZC), (rs[0][0], 7.80, ZC),
                                                 (0.58, 7.80, ZC), (0.58, 8.05, ZC), (0.19, 8.05, ZC)],
     0.055, 'pvc', 'Suction from return sump 1 to P1, DN110', 110)
pipe('Aspiració 2 · Return suction 2 (to P2)', [(rs[1][0], rs[1][1], Z_CH_FLOOR - 0.02), (rs[1][0], rs[1][1], ZC + 0.25), (rs[1][0], 7.88, ZC + 0.25),
                                                 (0.45, 7.88, ZC + 0.25), (0.45, 9.15, ZC + 0.25), (0.45, 9.15, ZC), (0.19, 9.15, ZC)],
     0.045, 'pvc', 'Suction from return sump 2 to P2, DN90', 90)
RF = P(R_RING, 0., ZH)
pipe('Impulsió a l\'anell · Delivery to the ring manifold', [P1D, (P1D[0], P1D[1], ZH), (P1D[0], Y0 - 0.20, ZH), (RF[0] + 0.02, RF[1], ZH),
                                                            (RF[0] + 0.02, RF[1], Z_FLOOR + 0.02)],
     0.045, 'pvc', 'P1 delivery to the ring main, DN90, through a cast-in sleeve', 90, {'Pressure_bar': 1.4})
pipe('Impulsió al raig central · Delivery to the central jet', [(P1D[0], P1D[1], ZH), (-0.25, P1D[1], ZH), (-0.25, 0.0, ZH), (0.0, 0.0, ZH),
                                                               (0.0, 0.0, Z_FLOOR + 0.30)],
     0.038, 'pvc', 'Branch of the P1 delivery to the central nozzle, DN75', 75, {'Pressure_bar': 1.2})
pipe('Impulsió al filtre · Delivery to the sand filter', [P2D, (P2D[0], P2D[1], ZF + 1.40), (FX, FY, ZF + 1.40)], 0.032, 'pvc',
     'P2 delivery to the filter\'s multiport valve, DN63', 63)
FI = P(4.0, 25., Z_FLOOR)
pipe('Retorn filtrat al vas · Filtered return to the basin', [(FX, FY - 0.30, ZF + 0.50), (FX, Y0 + 0.30, ZF + 0.50), (FX, Y0 - 0.10, ZH + 0.15),
                                                             (FI[0], FI[1], ZH + 0.15), (FI[0], FI[1], Z_FLOOR)],
     0.032, 'pvc', 'Filter outlet to the basin-floor inlet, DN63', 63)
m.element('IfcSanitaryTerminal', 'Boca d\'impulsió filtrada · Filtered-water inlet', [m.cylinder(FI[0], FI[1], Z_FLOOR, 0.07, 0.05)],
          ISLAND, 'bronze', predefined='USERDEFINED', object_type='Floor inlet fitting DN63 with eyeball', parent=bas, src=TYP,
          psets={**spec(NominalDiameter_mm=63), **am('hydraulics', 12, 4, AJ, 'Demo fountain-equipment maker', 'Floor inlet DN63', CON_FNT)})
XD = X0 + 0.30
pipe('Desguàs de fons · Bottom-drain pipe', [(DRN[0], DRN[1], Z_FLOOR - 0.01), (DRN[0], DRN[1], -1.28), (XD, DRN[1], -1.28), (XD, YC, -1.31)],
     0.08, 'pvc_sewer', 'Bottom drain DN160 under the basin to the drain valve in the chamber', 160, {'Gradient_pct': 0.3}, mdl='PVC-U SN8')
pipe('Sobreeixidor · Overflow pipe', [(OVF[0], OVF[1], Z_CH_FLOOR), (OVF[0], OVF[1], -0.80), (X1 - 0.30, Y0 - 0.10, -0.80),
                                      (X1 - 0.30, YC, -0.80), (X1 - 0.30, YC, -1.30)],
     0.055, 'pvc_sewer', 'Overflow DN110 to the sewer collector', 110, mdl='PVC-U SN8')
pipe('Impulsió de la bomba d\'esgotament · Sump-pump rising main', [(SPX, SPY, ZF + 0.18), (SPX, SPY, -1.00), (SPX, YC, -1.00), (SPX, YC, -1.25)],
     0.025, 'pvc', 'Rising main DN50 from the sump pump, with check valve', 50)
SEW = (X1 - 0.30, 12.60, -1.60)
pipe('Col·lector i connexió a la claveguera · Sewer collector and connection', [(XD, YC, -1.31), (X1 - 0.30, YC, -1.34), (X1 - 0.30, Y1 + 0.25, -1.36), SEW],
     0.08, 'pvc_sewer', 'DN160 collector along the chamber wall to the combined sewer under the carriageway', 160, {'Gradient_pct': 1.0},
     mdl='PVC-U SN8')
ZM = -1.05
MKX = -0.40
pipe('Escomesa d\'aigua d\'aportació · Make-up water service', [(-1.00, 12.60, -0.90), (-1.00, Y1, -0.90), (-1.00, 9.25, -0.90), (-1.00, 9.25, ZM),
                                                               (MKX, 9.25, ZM), (MKX, 6.80, ZM), (MKX, 6.80, Z_CH_WATER + 0.08)],
     0.020, 'pe', 'PE100 DN32 from the water main to the catch channel, discharging over an air gap', 32,
     {'BackflowProtection': 'Type AB air gap (EN 1717)'}, kind='meter', mdl='PE100 SDR11 DN32')


def valve(name, at, axis, pre, ot, dn, cond=4, note=None, extra=None):
    x, y, z = at
    h = dn / 2000 + 0.025
    d = {'x': (0.09, 0, 0), 'y': (0, 0.09, 0), 'z': (0, 0, 0.09)}[axis]
    st = (0, 0, 1) if axis != 'z' else (1, 0, 0)
    it = [rod((x - d[0], y - d[1], z - d[2]), (x + d[0], y + d[1], z + d[2]), h),
          rod((x, y, z), (x + st[0] * (h + 0.12), y, z + st[2] * (h + 0.12)), 0.012),
          m.box(x + st[0] * (h + 0.12), y, z + st[2] * (h + 0.12), 0.16 if axis != 'z' else 0.02, 0.03, 0.02 if axis != 'z' else 0.16)]
    m.element('IfcValve', name, it, PLANT, 'brass' if dn < 50 else 'iron', predefined=pre, object_type=ot, parent=hyd, src=BELOW,
              psets={**spec(NominalDiameter_mm=dn, PressureRating='PN10', **(extra or {})),
                     **am('hydraulics', 6, cond, AJ, 'Demo valve maker', f'{ot.split(",")[0]} DN{dn}', CON_FNT, Note=note)})


valve('Vàlvula d\'aspiració P1 · P1 suction valve', (0.40, 8.05, ZC), 'x', 'ISOLATING', 'Butterfly valve DN110, lever', 110)
valve('Vàlvula d\'aspiració P2 · P2 suction valve', (0.45, 8.60, ZC + 0.25), 'y', 'ISOLATING', 'Butterfly valve DN90, lever', 90)
valve('Antiretorn P1 · P1 check valve', (P1D[0], P1D[1], ZF + 1.00), 'z', 'CHECK', 'Swing check valve DN90', 90)
valve('Vàlvula d\'impulsió P1 · P1 delivery valve', (P1D[0], P1D[1], ZF + 1.35), 'z', 'ISOLATING', 'Butterfly valve DN90, gear operator', 90)
valve('Regulació del raig central · Central-jet regulating valve', (-0.25, 7.85, ZH), 'y', 'REGULATING',
      'Globe regulating valve DN75 (sets the jet height)', 75, extra={'SetPosition_pct': 72})
valve('Antiretorn P2 · P2 check valve', (P2D[0], P2D[1], ZF + 1.00), 'z', 'CHECK', 'Swing check valve DN63', 63)
valve('Vàlvula de buidat · Drain valve', (XD, 8.40, -1.30), 'y', 'ISOLATING', 'Knife gate valve DN160, normally closed', 160,
      note='Exercised at the last inspection (demo)')
valve('Antiretorn d\'esgotament · Sump-pump check valve', (SPX, SPY, -1.40), 'z', 'CHECK', 'Ball check valve DN50', 50)
valve('Vàlvula d\'aportació · Make-up valve', (-0.60, 9.25, ZM), 'x', 'REGULATING', 'Solenoid make-up valve DN25, level-controlled', 25,
      extra={'Control': 'PLC, from the level sensor'})
m.element('IfcFlowMeter', 'Comptador d\'aportació · Make-up water meter', [m.box(-0.85, 9.25, ZM - 0.06, 0.18, 0.12, 0.12)],
          PLANT, 'brass', predefined='WATERMETER', object_type='Ultrasonic water meter DN25 with radio read-out', parent=hyd, src=BELOW,
          psets={**spec(NominalFlow_m3_h=4.0, Reading_m3=3127.4, ReadingDate='2026-09-30', Telemetry='Radio, daily read'),
                 **am('meter', 12, 5, AJ, 'Demo meter manufacturer', 'Ultrasonic DN25 Q3=4', CON_WAT, Consumption_m3_30d=96.2,
                      Note='Evaporation and spray losses; higher on windy days (demo)')})

cutout('Font Monumental del Passeig de Gràcia', 0., 0., (-7.7, 7.7), (-7.7, 7.7), (CUT_FLOOR, 8.0))
cutout('plant chamber roof and hatch', CX, CY, (-1.25, 1.25), (-1.85, 1.85), (CUT_FLOOR, 1.0))

# ═══ 3. The island ═══════════════════════════════════════════════════════════════════════════════
isl = m.assembly('Illa central · Central island', ISLAND, object_type='Traffic island with lawn and kerb',
                 psets={**spec(OSMWay=128373342, Area_m2=SITE['island_lawn']['area_m2'], Benches=0, Bollards=0,
                               Note='OSM has no bench, bollard, lamp or tree on the island'),
                        **am('island', 12, 4, AJ_PARKS, 'Demo landscape contractor', 'Lawn island', CON_URB), **prov(LAWN)})
G = [tuple(p) for p in SITE['island_lawn']['points']]
if sum(G[i][0] * G[(i + 1) % len(G)][1] - G[(i + 1) % len(G)][0] * G[i][1] for i in range(len(G))) < 0:
    G = G[::-1]
K = [tuple(p) for p in SITE['island_kerb_outer']['points']]
if sum(K[i][0] * K[(i + 1) % len(K)][1] - K[(i + 1) % len(K)][0] * K[i][1] for i in range(len(K))) < 0:
    K = K[::-1]
chamber_hole = [(X0, Y0), (X0, Y1), (X1, Y1), (X1, Y0)]
m.element('IfcGeographicElement', 'Gespa de l\'illa · Island lawn', [m.prism_holes(G, [circle(R_LEDGE), chamber_hole], -0.30, 0.33)],
          ISLAND, 'lawn', predefined='VEGETATION', object_type='Lawn on 300 mm topsoil, pop-up irrigation (outline from OSM)',
          parent=isl, src=LAWN,
          psets={'Pset_CDE_Vegetation': {'Species': 'Festuca arundinacea / Cynodon mix (demo)', 'Irrigation': 'Pop-up sprinklers, night cycle (demo)',
                                         'Area_m2': round(SITE['island_lawn']['area_m2'] - math.pi * R_LEDGE ** 2 - (X1 - X0) * (Y1 - Y0), 1)},
                 **am('island', 1, 4, AJ_PARKS, 'Municipal nursery (demo)', 'Lawn, sown', CON_URB, LastMowing='2026-09-26')})
m.element('IfcKerb', 'Vorada de l\'illa · Island kerb', [m.prism_holes(K, [G], -0.70, 0.80)], ISLAND, 'granite', predefined='USERDEFINED',
          object_type='Granite kerb 150 mm, top 70 mm above the lawn, on a concrete haunch (follows the OSM lawn outline)',
          parent=isl, src=LAWN,
          psets={**spec(Width_mm=150, Height_mm=800, Upstand_mm=70, Bedding='C20/25 concrete haunch',
                        Note='The ICGC mesh puts the carriageway ≈ 0.55 m below the lawn here; the road is not modelled'),
                 **am('island', 12, 4, AJ, 'Demo quarry', 'Granite kerb 15×30, curved', CON_URB, Note='Two segments scuffed by vehicles (demo)')})
for k in range(8):
    az = 22.5 + 45 * k
    x, y = P(8.60, az)
    m.element('IfcLightFixture', f'Projector encastat {k + 1} · In-ground uplight {k + 1}',
              [m.cylinder(x, y, -0.20, 0.10, 0.20), m.cylinder(x, y, 0.0, 0.12, 0.035)], ISLAND, 'inox',
              predefined='DIRECTIONSOURCE', object_type='Recessed LED uplight 20 W, 3000 K, aimed at the basin',
              parent=isl, src=('Accent uplights: none documented; typical for a lit fountain (OSM lit=yes)', 'Low'),
              psets={**spec(Power_W=20, ColourTemperature_K=3000, IngressProtection='IP67', DriveOverLoad_kN=5),
                     **am('lighting', 12, 4 if k != 5 else 3, AJ, 'Demo lighting maker', 'In-ground LED 20 W', CON_LGT,
                          BurningHours=20100 + 9 * k, Note='Glass dirty, lawn overgrowing the rim (demo)' if k == 5 else None)})

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'granvia-fountain.ifc')
m.finish(out)
cut_path = os.path.splitext(out)[0] + '_cutouts.json'
json.dump({'cdeMeshCutouts': {'version': 1, 'anchor': {'lon': LON0, 'lat': LAT0, 'height': RAW0},
                              'note': 'Boxes in metres: s along bearing (deg clockwise from north), t to its left, z above the '
                                      'anchor height (the tileset anchor, before the scene placement offset).',
                              'boxes': CUTOUTS}}, open(cut_path, 'w'), indent=1)
print('written', out, len(m.f.by_type('IfcProduct')), 'products,', len(CUTOUTS), 'cut-outs ->', cut_path)
