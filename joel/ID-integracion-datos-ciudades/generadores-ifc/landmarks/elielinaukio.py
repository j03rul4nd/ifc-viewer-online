"""Elielinaukio bus terminal (Helsinki), next to the Central Station's west wing — authored IFC4.

The open-air terminal on Elielinaukio, between the station, the Postitalo and the Sanomatalo, serves the
regional bus lines. Sources:
  OSM    OpenStreetMap, ODbL (data in elielinaukio_osm.json): the terminal outline (amenity=bus_station),
         the saw-tooth pedestrian island, the canopy footprint (building=roof, 5.7 x 73 m), bays 20-36 with
         their stop codes (H2020-H2036), the bay drive lines, kerbs, guard rail, bollards and street lamps
  LOD2   City of Helsinki LOD2 model, CC BY 4.0 — ground level: the neighbouring building bases sit at
         3.21-3.36 m N2000 (Vltava 3.28, Postitalo 3.36, Sanomatalo 3.21), the same method returning the
         station block's 1.54 m
  PHOTO  Wikimedia Commons photographs (CC0 / CC BY-SA, 2005-2024): the dark steel canopy with glass roof
         panels and transverse beams, masts with tie rods, frameless glass wind screens with benches,
         hanging double clocks, the HSL bay poles (blue number, yellow bus panel, timetable), the black
         information kiosks lettered ELIELINAUKIO · ELIELPLATSEN, red-brown brick pavers with white bay
         lines, granite kerbs and floodlight masts
Dimensions not given by any source (canopy height, column and mast spacing, screen size, sign size) are
scaled from the photographs against people and buses and carry Confidence Low. Demonstration model,
not a survey.

Model frame: EPSG:3879 metres relative to the origin below (the canopy's centre), z=0 at the terminal
ground, as the site's IfcMapConversion states — the same frame as the Central Station model.
"""
import json, math, os, sys
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from pyproj import Transformer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model

LAT, LON, ELEV = 60.17176, 24.93957, 3.30       # canopy centre; ground from LOD2 building bases, N2000
DEMO = 'Pset_CDE_AssetManagement (demo)'
HERE = os.path.dirname(__file__)
osm = json.load(open(os.path.join(HERE, 'elielinaukio_osm.json')))
_T = Transformer.from_crs(4326, 3879, always_xy=True)
_e0, _n0 = _T.transform(LON, LAT)


def L(p):
    e, n = _T.transform(p['lon'], p['lat'])
    return (e - _e0, n - _n0)


def way(i):
    return next(e for e in osm['elements'] if e['type'] == 'way' and e['id'] == i)


def pts(poly):
    return [(float(x), float(y)) for x, y in list(poly.exterior.coords)[:-1]]


m = Model('Elielinaukio bus terminal — authored IFC (InGreen demo)', 'Elielinaukio', 'Elielinaukion bussiterminaali',
          LAT, LON, ELEV, rotation_deg=0.0, tag_prefix='EL',
          description='Authored from OpenStreetMap (ODbL), City of Helsinki LOD2 (CC BY 4.0) and photographs. '
                      'Demonstration model, not a survey.')
m.material('apron', 'Red-brown concrete brick pavers', (0.47, 0.33, 0.29), 'Concrete', 2300, 'Bus apron, herringbone-free stretcher bond')
m.material('paving', 'Dark grey-brown concrete pavers', (0.36, 0.32, 0.30), 'Concrete', 2300, 'Pedestrian island')
m.material('kerb', 'Grey granite kerb', (0.66, 0.65, 0.62), 'Stone', 2700)
m.material('line', 'White road marking', (0.92, 0.92, 0.90), 'Paint', None)
m.material('steel', 'Dark grey painted steel', (0.17, 0.19, 0.20), 'Metal', 7850, 'Canopy structure, poles, kiosks')
m.material('glass', 'Toughened laminated glass', (0.70, 0.80, 0.84), 'Glass', 2500, transparency=0.55)
m.material('screen_glass', 'Frameless toughened glass screen', (0.74, 0.84, 0.86), 'Glass', 2500, transparency=0.6)
m.material('clock', 'Clock dial', (0.95, 0.95, 0.93), 'Metal', None)
m.material('hands', 'Clock hands', (0.06, 0.06, 0.07), 'Metal', None)
m.material('wood', 'Bench slats, oiled wood', (0.55, 0.42, 0.28), 'Wood', 650)
m.material('hsl_blue', 'Stop sign, blue panel', (0.00, 0.47, 0.78), 'Metal', None)
m.material('hsl_yellow', 'Stop sign, yellow panel', (0.98, 0.75, 0.05), 'Metal', None)
m.material('white', 'Timetable panel', (0.95, 0.95, 0.95), 'Metal', None)
m.material('display', 'Departure display', (0.05, 0.10, 0.18), 'Glass', None)
m.material('lamp', 'Luminaire diffuser', (0.97, 0.97, 0.92), 'Glass', None)
m.material('map', 'Map and information panel', (0.88, 0.90, 0.86), 'Plastic', None)

m.storey('Ground', 0.0, 'Terminal level')
m.storey('Canopy', 4.0, 'Canopy underside')
bld = m.building
m.pset(bld, 'Pset_CDE_BusTerminal', {'Name': 'Elielinaukio', 'NameSv': 'Elielplatsen', 'Bays': '20-36',
                                     'StopCodes': 'H2020-H2036', 'Operator': 'Helsinki Regional Transport (HSL)',
                                     'Zone': 'HSL A', 'Neighbours': 'Central Station west wing, Postitalo, Sanomatalo, Vltava',
                                     'Source': 'OpenStreetMap (ODbL), retrieved 2026-10-01'})
m.pset(m.site, 'Pset_CDE_Georeference', {'CRS': 'EPSG:3879 (ETRS89 / GK25FIN)', 'HeightSystem': 'N2000',
                                         'OriginLatitude': LAT, 'OriginLongitude': LON, 'OriginElevation_m': ELEV,
                                         'GroundSource': 'LOD2 building bases 3.21-3.36 m'})


def demo_am(asset_class, interval, life, criticality='Medium'):
    return {'AssetClass': asset_class, 'InspectionInterval_months': interval, 'DesignServiceLife_years': life,
            'Criticality': criticality, 'DataStatus': "Demo values — to be replaced with the owner's asset register"}


def poly_col(cx, cy, z0, r, h, n=8):
    return m.prism([(cx + r * math.cos((i + 0.5) * 2 * math.pi / n), cy + r * math.sin((i + 0.5) * 2 * math.pi / n))
                    for i in range(n)], z0, h)


# ================================================================== ground: apron, island, kerbs, markings
ground = m.assembly('Terminal ground', 'Ground', object_type='Apron and pedestrian island',
                    psets={'Pset_CDE_Provenance': {'GeometrySource': 'OpenStreetMap outlines (ODbL)', 'Confidence': 'Medium'}})
apron = Polygon([L(p) for p in way(33386599)['geometry']]).buffer(0)
island = Polygon([L(p) for p in way(30368517)['geometry']]).buffer(0)
KERB_H = 0.16                                     # boarding kerb, typical HSL value
m.element('IfcSlab', 'Bus apron', m.prism(pts(apron.simplify(0.1)), -0.12, 0.12), 'Ground', 'apron', predefined='USERDEFINED',
          object_type='Bus apron, brick pavers', parent=ground,
          src=('OpenStreetMap amenity=bus_station outline (ODbL)', 'Medium', 'OSM 33386599'),
          common={'IsExternal': True}, psets={'Pset_CDE_Surface': {'Area_m2': round(apron.area, 1), 'Surface': 'paving_stones'},
                                              DEMO: demo_am('Pavements > Apron', 12, 25)})
inner = island.buffer(-0.3, join_style=2)
m.element('IfcSlab', 'Pedestrian island', m.prism(pts(inner.simplify(0.05)), 0, KERB_H - 0.01), 'Ground', 'paving',
          predefined='USERDEFINED', object_type='Raised pedestrian island', parent=ground,
          src=('OpenStreetMap highway=pedestrian area (ODbL)', 'Medium', 'OSM 30368517'),
          psets={'Pset_CDE_Surface': {'Area_m2': round(island.area, 1), 'KerbHeight_m': KERB_H},
                 DEMO: demo_am('Pavements > Platforms', 12, 25)})
m.element('IfcCovering', 'Island granite kerb', m.prism_holes(pts(island.simplify(0.05)), [pts(inner.simplify(0.05))], 0, KERB_H),
          'Ground', 'kerb', predefined='USERDEFINED', object_type='Granite boarding kerb', parent=ground,
          src=('Island outline; 0.3 m kerb width estimated', 'Low', 'PHOTO'),
          psets={'Pset_CDE_Kerb': {'Height_m': KERB_H, 'Length_m': round(island.exterior.length, 1)}})
lines = []
for e in osm['elements']:
    if e['type'] == 'way' and e['tags'].get('highway') == 'service' and len(e['geometry']) == 2:
        ln = LineString([L(p) for p in e['geometry']])
        if ln.length < 30:
            lines.append(m.prism(pts(ln.buffer(0.07, cap_style=2)), 0.0, 0.008))
m.element('IfcBuildingElementProxy', 'Bay markings', lines, 'Ground', 'line', predefined='USERDEFINED',
          object_type='White bay lines', parent=ground, src=('OSM bay drive lines (ODbL); photograph', 'Medium', 'OSM / PHOTO'))
kerbs = []
for e in osm['elements']:
    if e['type'] == 'way' and e['tags'].get('barrier') == 'kerb':
        ln = LineString([L(p) for p in e['geometry']])
        kerbs.append(m.prism(pts(ln.buffer(0.15, cap_style=2, join_style=2)), 0, 0.12))
if kerbs:
    m.element('IfcCovering', 'Street kerbs', kerbs, 'Ground', 'kerb', predefined='USERDEFINED', object_type='Granite kerb',
              parent=ground, src=('OpenStreetMap barrier=kerb (ODbL)', 'Medium', 'OSM'))

# ================================================================== canopy
# The OSM roof is a 5.7 m strip; the axis runs from its south end to its north end, ~3 degrees west of north.
roof = Polygon([L(p) for p in way(30368518)['geometry']])
rc = list(roof.minimum_rotated_rectangle.exterior.coords)[:4]
e01, e12 = math.dist(rc[0], rc[1]), math.dist(rc[1], rc[2])
(a0, a1), (b0, b1) = ((rc[0], rc[1]), (rc[1], rc[2])) if e01 > e12 else ((rc[1], rc[2]), (rc[0], rc[1]))
CL, CW = math.dist(a0, a1), math.dist(b0, b1)
CX, CY = roof.centroid.x, roof.centroid.y
ux, uy = (a1[0] - a0[0]) / CL, (a1[1] - a0[1]) / CL
if uy < 0:
    ux, uy = -ux, -uy                                  # u points north along the canopy
vx, vy = -uy, ux                                       # v points west across it
ANG = math.atan2(uy, ux)


def cp(s, t=0.0):
    """Point at s along the canopy axis (north +) and t across it (west +), from the canopy centre."""
    return (CX + ux * s + vx * t, CY + uy * s + vy * t)


def cbox(s, t, z0, ls, lt, h):
    return m.box(*cp(s, t), z0, ls, lt, h, ANG)


Z_UNDER, Z_ROOF = 4.0, 4.38                            # canopy underside and glass (PHOTO: about 2.2 people high)
can = m.assembly('Canopy', 'Canopy', object_type='Steel and glass bus canopy',
                 psets={'Pset_CDE_Canopy': {'Length_m': round(CL, 1), 'Width_m': round(CW, 1), 'ClearHeight_m': Z_UNDER,
                                            'Structure': 'Steel frame, masts with tie rods', 'Roofing': 'Laminated glass panels'},
                        'Pset_CDE_Provenance': {'GeometrySource': 'OSM building=roof footprint; section from photographs',
                                                'Confidence': 'Medium'}})
m.element('IfcRoof', 'Canopy glass roof', cbox(0, 0, Z_ROOF, CL + 0.3, CW + 0.3, 0.03), 'Canopy', 'glass', predefined='FLAT_ROOF',
          object_type='Glass roof panels', parent=can, src=('OSM building=roof (ODbL)', 'Medium', 'OSM 30368518'),
          common={'ProjectedArea': round(CL * CW, 1)}, psets={DEMO: demo_am('Envelope > Roofs', 12, 30, 'High')})
beams = [cbox(0, t, Z_UNDER, CL + 0.3, 0.22, 0.40) for t in (-CW / 2, CW / 2)]          # edge beams
beams.append(cbox(0, 0, Z_UNDER - 0.15, CL, 0.36, 0.53))                               # spine
for s in np.arange(-CL / 2, CL / 2 + 0.01, 1.5):                                        # transverse beams
    beams.append(cbox(s, 0, Z_UNDER + 0.08, 0.12, CW + 0.5, 0.30))
m.element('IfcBeam', 'Canopy steel frame', beams, 'Canopy', 'steel', predefined='BEAM', object_type='Edge beams, spine, transverse beams',
          parent=can, src=('Photographs: transverse beams every 1.5 m (estimated)', 'Low', 'PHOTO'),
          psets={DEMO: demo_am('Structure > Steel', 24, 50, 'High')})
MAST_STEP = 12.0
mast_s = [s for s in np.arange(-CL / 2 + 6.4, CL / 2 - 4.0, MAST_STEP)]
cols, rods = [], []
for s in mast_s:
    for dt in (-0.32, 0.32):                                                             # paired square columns
        cols.append(m.box(*cp(s, dt), 0, 0.2, 0.2, 7.4, ANG))
    top = (*cp(s, 0), 7.3)
    for ds in (-4.5, 4.5):
        for t in (-CW / 2, CW / 2):
            rods.append(m.rod(top, (*cp(s + ds, t), Z_ROOF + 0.02), 0.025))
    cols.append(m.box(*cp(s, 0), 7.1, 0.5, 0.9, 0.3, ANG))                                # mast head plate
m.element('IfcColumn', 'Canopy columns and masts', cols, 'Ground', 'steel', predefined='COLUMN',
          object_type='Paired columns rising as masts', parent=can, src=('Night photograph: masts above the roof', 'Low', 'PHOTO'),
          psets={'Pset_CDE_Structure': {'Count': len(mast_s), 'Spacing_m': MAST_STEP, 'MastTop_m': 7.4}})
m.element('IfcMember', 'Canopy tie rods', rods, 'Canopy', 'steel', predefined='USERDEFINED', object_type='Tie rods from mast heads',
          parent=can, src=('Night photograph', 'Low', 'PHOTO'))
lights = [m.box(*cp(s, 0), Z_UNDER - 0.32, 1.4, 0.18, 0.08, ANG) for s in np.arange(-CL / 2 + 3, CL / 2 - 2, 4.5)]
m.element('IfcLightFixture', 'Canopy luminaires', lights, 'Canopy', 'lamp', predefined='DIRECTIONSOURCE',
          object_type='Linear LED luminaires under the spine', parent=can, src=('Photograph', 'Low', 'PHOTO'),
          psets={DEMO: demo_am('Systems > Lighting', 12, 15)})
for k, s in enumerate((-22.0, 3.0, 26.0)):                                              # hanging double clocks
    x, y = cp(s, 0)
    items = [m.cylinder(x, y, Z_UNDER - 0.9, 0.025, 0.9)]
    for side in (-1, 1):
        o = (x + ux * side * 0.06, y + uy * side * 0.06)
        items.append(m.extrude_vertical_profile([(0.32 * math.cos(a), 0.32 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 25)[:-1]],
                                                (*o, Z_UNDER - 1.3), (vx, vy), 0.06))
    m.element('IfcBuildingElementProxy', f'Canopy clock {k + 1}', items, 'Canopy', 'clock', predefined='USERDEFINED',
              object_type='Double-sided station clock', parent=can, src=('Photograph: clocks hang from the beams', 'Medium', 'PHOTO'),
              psets={'Pset_CDE_Clock': {'Diameter_m': 0.64, 'Faces': 2}, DEMO: demo_am('Systems > Clocks', 12, 20)})
    m.element('IfcBuildingElementProxy', f'Canopy clock {k + 1} hands',
              [m.box(*((x + ux * side * 0.1), (y + uy * side * 0.1)), Z_UNDER - 1.0 - 0.0, 0.03, 0.02, 0.26, ANG + math.pi / 2)
               for side in (-1, 1)] +
              [m.box(*((x + ux * side * 0.1 + vx * 0.08), (y + uy * side * 0.1 + vy * 0.08)), Z_UNDER - 0.99, 0.03, 0.2, 0.025, ANG)
               for side in (-1, 1)],
              'Canopy', 'hands', predefined='USERDEFINED', object_type='Clock hands', parent=can, src=('Photograph', 'Low', 'PHOTO'))

# wind screens with benches and bins under the canopy
furn = m.assembly('Waiting area', 'Ground', object_type='Wind screens, benches and bins',
                  psets={'Pset_CDE_Provenance': {'GeometrySource': 'Photographs', 'Confidence': 'Low'}})
screens, frames_ = [], []
for s0 in mast_s:
    for s in np.arange(s0 + 0.9, s0 + MAST_STEP - 2.0, 1.75):
        if s > CL / 2 - 1.5:
            break
        screens.append(m.box(*cp(s, 0.75), KERB_H + 0.08, 1.65, 0.012, 2.25, ANG))
        frames_.append(m.box(*cp(s - 0.82, 0.75), KERB_H, 0.05, 0.05, 2.4, ANG))
m.element('IfcPlate', 'Glass wind screens', screens, 'Ground', 'screen_glass', predefined='CURTAIN_PANEL',
          object_type='Frameless glass wind screen', parent=furn, src=('Photographs', 'Low', 'PHOTO'),
          psets={'Pset_CDE_Screen': {'Panels': len(screens), 'PanelWidth_m': 1.65, 'Height_m': 2.25},
                 DEMO: demo_am('Furniture > Screens', 6, 20)})
m.element('IfcMember', 'Wind screen posts', frames_, 'Ground', 'steel', predefined='POST', object_type='Screen posts',
          parent=furn, src=('Photographs', 'Low', 'PHOTO'))
n_b = 0
for s0 in mast_s:
    for side in (-1, 1):
        s = s0 + MAST_STEP / 2
        if s > CL / 2 - 2:
            continue
        t = 0.75 + side * 0.65
        seat = [m.box(*cp(s, t), KERB_H + 0.42, 1.9, 0.46, 0.05, ANG), m.box(*cp(s, t + side * 0.21), KERB_H + 0.47, 1.9, 0.05, 0.4, ANG)]
        legs = [m.box(*cp(s + d, t), KERB_H, 0.06, 0.4, 0.42, ANG) for d in (-0.8, 0.8)]
        n_b += 1
        m.element('IfcFurnishingElement', f'Bench {n_b:02d}', seat, 'Ground', 'wood', object_type='Bench with backrest', parent=furn,
                  src=('Photographs', 'Low', 'PHOTO'), psets={DEMO: demo_am('Furniture > Benches', 12, 15, 'Low')})
        m.element('IfcMember', f'Bench {n_b:02d} frame', legs, 'Ground', 'steel', predefined='USERDEFINED',
                  object_type='Bench frame', parent=furn, src=('Photographs', 'Low', 'PHOTO'))
bins = [poly_col(*cp(s0 + 2.2, -0.9), KERB_H, 0.24, 0.9, 10) for s0 in mast_s]
m.element('IfcFurnishingElement', 'Waste bins', bins, 'Ground', 'steel', object_type='Steel waste bin', parent=furn,
          src=('Photographs', 'Low', 'PHOTO'), psets={DEMO: demo_am('Furniture > Bins', 1, 10, 'Low')})

# ================================================================== bays and their stop poles
bays = m.assembly('Bus bays', 'Ground', object_type='Saw-tooth bus bays 20-36',
                  psets={'Pset_CDE_Provenance': {'GeometrySource': 'OpenStreetMap bus stops (ODbL)', 'Confidence': 'Medium'}})
seen = set()
stops = []
for e in osm['elements']:
    t = e['tags']
    if e['type'] != 'node' or 'laituri' not in t.get('name', '') or t.get('public_transport') == 'stop_position':
        continue
    ref = t.get('local_ref') or t.get('was:local_ref') or t['name'].split()[-1]
    if ref in seen:
        continue
    seen.add(ref)
    stops.append((int(ref), L(e), t))
for ref, (x, y), t in sorted(stops):
    # The sign faces along the island edge, like the canopy (PHOTO); the pole stands on the kerb.
    p = Point(x, y)
    if not island.buffer(0.5).contains(p):
        q = island.exterior.interpolate(island.exterior.project(p))
        x, y = q.x, q.y
    z0 = KERB_H if island.buffer(0.2).contains(Point(x, y)) else 0.0
    pole = [poly_col(x, y, z0, 0.045, 3.5, 8), poly_col(x + vx * 0.9, y + vy * 0.9, z0, 0.04, 2.6, 8)]
    sx, sy = x, y
    panels = {'hsl_blue': [m.box(sx, sy, z0 + 3.05, 0.04, 0.6, 0.32, ANG)],
              'hsl_yellow': [m.box(sx, sy, z0 + 2.7, 0.04, 0.6, 0.35, ANG)],
              'white': [m.box(sx, sy, z0 + 2.25, 0.04, 0.6, 0.45, ANG),
                        m.box(x + vx * 0.9, y + vy * 0.9, z0 + 1.2, 0.05, 0.62, 0.95, ANG)]}
    common = {'Pset_CDE_BusBay': {'BayNumber': ref, 'StopCode': t.get('ref') or t.get('was:ref'), 'Name': t.get('name'),
                                  'NameSv': t.get('name:sv'), 'Bench': t.get('bench'), 'Shelter': t.get('shelter'),
                                  'Wheelchair': t.get('wheelchair'), 'InService': 'bus' in t,
                                  },
              DEMO: demo_am('Signs > Stop poles', 12, 15)}
    m.element('IfcMember', f'Bay {ref} pole', pole, 'Ground', 'steel', predefined='POST', object_type='Stop pole and timetable post',
              parent=bays, src=('OpenStreetMap bus_stop position (ODbL)', 'Medium', 'OSM'), psets=common)
    for mat, items in panels.items():
        m.element('IfcBuildingElementProxy', f'Bay {ref} sign ({mat.replace("hsl_", "")})', items, 'Ground', mat,
                  predefined='USERDEFINED', object_type='Stop sign panel', parent=bays,
                  src=('Photograph: number, bus symbol, lines', 'Medium', 'PHOTO'))
print('bays', len(stops))

# ================================================================== information kiosks and floodlights
info = m.assembly('Information kiosks', 'Ground', object_type='Information kiosks',
                  psets={'Pset_CDE_Provenance': {'GeometrySource': 'Photographs (2022-2023)', 'Confidence': 'Low'}})
for k, s in enumerate((-CL / 2 - 3.5, CL / 2 + 3.0)):
    body = [m.box(*cp(s, 0), KERB_H, 5.2, 0.7, 2.5, ANG)]
    m.element('IfcBuildingElementProxy', f'Information kiosk {"south" if s < 0 else "north"}', body, 'Ground', 'steel',
              predefined='USERDEFINED', object_type='Black steel information kiosk', parent=info,
              src=('Photographs: ELIELINAUKIO · ELIELPLATSEN', 'Medium', 'PHOTO'),
              psets={'Pset_CDE_Sign': {'Text': 'ELIELINAUKIO · ELIELPLATSEN'}, DEMO: demo_am('Signs > Kiosks', 12, 20)})
    m.element('IfcBuildingElementProxy', f'Kiosk {k + 1} lettering', [m.box(*cp(s + d, side * 0.36), KERB_H + 2.2, 0.16, 0.03, 0.18, ANG)
                                                                     for side in (-1, 1) for d in np.linspace(-2.2, 2.2, 23) if abs(d) > 0.15],
              'Ground', 'white', predefined='USERDEFINED', object_type='Lettering ELIELINAUKIO · ELIELPLATSEN', parent=info,
              src=('Photograph', 'Medium', 'PHOTO'))
    for side in (-1, 1):
        m.element('IfcBuildingElementProxy', f'Kiosk {k + 1} maps {"west" if side > 0 else "east"}',
                  [m.box(*cp(s + d, side * 0.37), KERB_H + 0.7, 1.15, 0.03, 1.25, ANG) for d in (-1.8, -0.5)], 'Ground', 'map',
                  predefined='USERDEFINED', object_type='Network map and timetable', parent=info, src=('Photograph', 'Low', 'PHOTO'))
        m.element('IfcBuildingElementProxy', f'Kiosk {k + 1} departure display {"west" if side > 0 else "east"}',
                  [m.box(*cp(s + 1.3, side * 0.37), KERB_H + 0.9, 1.5, 0.04, 0.95, ANG)], 'Ground', 'display',
                  predefined='USERDEFINED', object_type='Departure display', parent=info, src=('Night photograph', 'Medium', 'PHOTO'),
                  psets={DEMO: demo_am('Systems > Passenger information', 6, 10, 'High')})
flood = []
for (x, y) in ((-20.0, 44.0), (14.0, 44.5), (-15.5, -28.0)):
    flood += [poly_col(x, y, KERB_H, 0.2, 15.5, 8), m.box(x, y, KERB_H + 15.5, 1.6, 0.25, 0.15, ANG)]
    flood += [m.box(x + dx, y, KERB_H + 15.25, 0.45, 0.35, 0.25, ANG) for dx in (-0.6, 0.6)]
m.element('IfcLightFixture', 'Floodlight masts', flood, 'Ground', 'steel', predefined='DIRECTIONSOURCE',
          object_type='Floodlight mast, 15.5 m', parent=info, src=('Photographs; positions estimated', 'Low', 'PHOTO'),
          psets={DEMO: demo_am('Systems > Lighting', 12, 30)})

# ================================================================== street furniture from OSM
street = m.assembly('Street furniture', 'Ground', object_type='Bollards, lamps and rails',
                    psets={'Pset_CDE_Provenance': {'GeometrySource': 'OpenStreetMap nodes (ODbL)', 'Confidence': 'Medium'}})
zone = apron.buffer(3)
bol, lamps, lampheads = [], [], []
for e in osm['elements']:
    if e['type'] != 'node':
        continue
    x, y = L(e)
    if not zone.contains(Point(x, y)):
        continue
    if e['tags'].get('barrier') == 'bollard':
        bol.append(poly_col(x, y, 0, 0.1, 0.9, 8))
    elif e['tags'].get('highway') == 'street_lamp':
        lamps.append(poly_col(x, y, 0, 0.07, 6.0, 8))
        lampheads.append(m.box(x, y, 6.0, 0.7, 0.7, 0.12, ANG))
if bol:
    m.element('IfcMember', 'Bollards', bol, 'Ground', 'steel', predefined='POST', object_type='Steel bollard', parent=street,
              src=('OpenStreetMap barrier=bollard (ODbL)', 'Medium', 'OSM'), psets={'Pset_CDE_Count': {'Count': len(bol)}})
if lamps:
    m.element('IfcMember', 'Street lamp posts', lamps, 'Ground', 'steel', predefined='POST', object_type='Lamp post, 6 m',
              parent=street, src=('OpenStreetMap highway=street_lamp (ODbL); height estimated', 'Medium', 'OSM'))
    m.element('IfcLightFixture', 'Street lamp heads', lampheads, 'Ground', 'lamp', predefined='POINTSOURCE',
              object_type='Square lamp head', parent=street, src=('Photograph', 'Low', 'PHOTO'))
for e in osm['elements']:
    if e['type'] == 'way' and e['tags'].get('barrier') == 'guard_rail':
        ln = LineString([L(p) for p in e['geometry']])
        items = [m.prism(pts(ln.buffer(0.03, cap_style=2)), z, 0.05) for z in (0.45, 0.95)]
        items += [poly_col(q.x, q.y, 0, 0.035, 1.0, 6) for q in (ln.interpolate(d) for d in np.arange(0, ln.length + 0.01, 1.6))]
        m.element('IfcRailing', 'Guard rail', items, 'Ground', 'steel', predefined='GUARDRAIL', object_type='Pedestrian guard rail',
                  parent=street, src=('OpenStreetMap barrier=guard_rail (ODbL)', 'Medium', 'OSM'))

out = sys.argv[1] if len(sys.argv) > 1 else 'elielinaukio-bus-terminal.ifc'
m.finish(out)
print('written', out, len(m.f.by_type('IfcProduct')), 'products; canopy', round(CL, 1), 'x', round(CW, 1), 'masts', len(mast_s))
