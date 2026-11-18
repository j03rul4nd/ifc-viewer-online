"""Helsinki Cathedral (Tuomiokirkko) — authored IFC4, v2.

Carl Ludvig Engel designed it (1830); Ernst Lohrmann completed it (1852) and added the four corner
cupolas and the zinc apostles. The model is authored element by element from:
  LOD2   City of Helsinki LOD2 model, CC BY 4.0 — measured heights and footprint (base 9.93 m N2000)
  OSM    OpenStreetMap building parts, ODbL — portico column positions, drum colonnade radius,
         stair towers, attic ring (horizontal positions; its heights are mapper estimates)
  A05/A08/A09  Engel's elevation, N-S section and plan — Finnish Heritage Agency, CC BY 4.0
  REG    City of Helsinki building register (WFS), CC BY 4.0 — building-level figures
Each element says which of these its geometry came from in Pset_CDE_Provenance. Estimates are
flagged there and marked `# est.` here. Demonstration model, not a survey.

Model frame: origin at the crossing on the platform floor; +x = east arm, +y = north arm; the whole
frame is rotated ROT_DEG counter-clockwise from true east (LOD2 footprint edges).
"""
import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model

LAT, LON, ELEV = 60.170378, 24.952175, 9.93    # LOD2 base, N2000
ROT_DEG = 3.0
DEMO = 'Pset_CDE_AssetManagement (demo)'

m = Model('Helsinki Cathedral — authored IFC (InGreen demo)', 'Tuomiokirkko — Senaatintori block',
          'Helsingin tuomiokirkko', LAT, LON, ELEV, rotation_deg=ROT_DEG, tag_prefix='TK',
          description='Authored from public-domain drawings (C. L. Engel), City of Helsinki LOD2 and '
                      'OpenStreetMap. Demonstration model, not a survey.')

# ---- materials -------------------------------------------------------------------------------
m.material('render', 'Rendered brick masonry, painted white', (0.95, 0.95, 0.92), 'Masonry', 1800,
           'Solid brick masonry with lime render')
m.material('column', 'Rendered masonry column, painted white', (0.97, 0.97, 0.94), 'Masonry', 1800,
           'Brick core, lime render, Corinthian order')
m.material('capital', 'Moulded render, capital ornament', (0.90, 0.88, 0.80), 'Masonry', 1800)
m.material('granite', 'Finnish grey granite', (0.62, 0.62, 0.60), 'Stone', 2700, 'Dressed granite')
m.material('terrace', 'Granite-faced terrace on fill', (0.55, 0.55, 0.53), 'Stone', None,
           'Retaining walls in granite, fill behind — no single density')
m.material('copper', 'Patinated copper sheet', (0.33, 0.58, 0.50), 'Metal', None,
           'Copper sheet roofing on the domes; supporting structure not modelled')
m.material('roof', 'Sheet-metal roofing', (0.50, 0.56, 0.54), 'Metal', None, 'Painted sheet metal on timber')
m.material('gold', 'Gilded metal', (0.86, 0.70, 0.26), 'Metal', None)
m.material('oak', 'Oak door leaves', (0.36, 0.23, 0.13), 'Wood', 700)
# Light and barely transparent: with no interior modelled, dark see-through glass read as black holes.
m.material('glass', 'Clear glass in timber frames', (0.52, 0.62, 0.70), 'Glass', 2500, transparency=0.12)
m.material('zinc', 'Cast zinc sculpture', (0.55, 0.58, 0.55), 'Metal', None, 'Hollow cast zinc')
m.material('iron', 'Cast-iron railing, painted black', (0.12, 0.12, 0.12), 'Metal', None)
m.material('interior', 'Interior volume', (0.9, 0.9, 0.9), 'Space', None)

# ---- spatial structure -----------------------------------------------------------------------
m.storey('Terrace and crypt', -5.5, 'Senate Square level to platform')
m.storey('Church level', 0.0, 'Platform / church floor')
m.storey('Roof', 25.0, 'Main eaves (LOD2)')
m.storey('Drum and dome', 33.0, 'Above the circular attic')
bld = m.building
m.pset(bld, 'Pset_BuildingCommon', {'BuildingID': '103027179C', 'IsLandmarked': True, 'YearOfConstruction': 1852,
                                     'NumberOfStoreys': 3, 'GrossPlannedArea': 4855.0, 'NetPlannedArea': 3528.0})
m.pset(bld, 'Pset_CDE_CityRegister', {'PermanentBuildingID_VTJPRT': '103027179C', 'MunicipalBuildingNo_RATU': 211,
                                       'PropertyID': '091-001-0029-0029', 'Address': 'Hallituskatu 7, 00170 Helsinki',
                                       'BuildingType': 'Kirkko (church)', 'BuildingClass2018': '0730',
                                       'Volume_m3': 45194, 'GrossArea_m2': 4855, 'FloorArea_m2': 3528, 'Storeys': 3,
                                       'LOD2_MeasuredHeight_m': 58.9, 'LOD2_TopElevation_N2000_m': 72.33,
                                       'Source': 'City of Helsinki building register and LOD2 (CC BY 4.0), retrieved 2026-09-30'})
m.pset(bld, 'Pset_CDE_Heritage', {'Architect': 'Carl Ludvig Engel', 'CompletedBy': 'Ernst Lohrmann',
                                  'DesignYear': 1830, 'Completed': 1852, 'Style': 'Neoclassical (Empire)',
                                  'Owner': 'Helsinki Parish Union', 'Drawings': 'Finnish Heritage Agency, Engel collection (CC BY 4.0)',
                                  'Note': 'Corner cupolas and apostle statues are Lohrmann\'s additions to Engel\'s design'})
m.pset(m.site, 'Pset_CDE_Georeference', {'CRS': 'EPSG:3879 (ETRS89 / GK25FIN)', 'HeightSystem': 'N2000',
                                         'OriginLatitude': LAT, 'OriginLongitude': LON, 'OriginElevation_m': ELEV,
                                         'RotationFromEast_deg': ROT_DEG})

PLINTH = 1.5          # est. stylobate (A05)
EAVES = 25.0          # LOD2 main-body eaves
GABLE_PEAK = 29.0     # LOD2 highest point over the arms
ARM_HALF = 11.5       # LOD2
ARM_WALL = 24.0       # OSM arm parts end ≈24.9; portico depth ≈5 m
ARM_TIP = 29.0        # LOD2
CORE = 17.0           # LOD2
T = 1.6               # est. wall thickness
COL_S = [-10.1, -6.4, -2.7, 2.7, 6.4, 10.1]   # OSM column positions (central bay 5.4 m, others 3.7 m)
COL_LINE = 27.6       # OSM
COL_D = 1.3           # est. shaft; OSM's 2.1 m is the plinth
COL_TOP = 14.5        # OSM portico part starts at 16 m (entablature + cornice above)
PORT_ENT = 16.5
PORT_PEAK = 20.7      # OSM portico gable top
SQUARE = -5.5         # LOD2: Senate Square ≈4.4 m vs platform 9.93 m

ARMS = {'South': (0, -1), 'North': (0, 1), 'East': (1, 0), 'West': (-1, 0)}


def frame(ux, uy):
    across = (-uy, ux)
    def at(along, side=0.0):
        return (ux * along + across[0] * side, uy * along + across[1] * side)
    return across, at


def demo_am(asset_class, interval, life, criticality='Medium'):
    return {'AssetClass': asset_class, 'InspectionInterval_months': interval, 'DesignServiceLife_years': life,
            'Criticality': criticality, 'DataStatus': 'Demo values — to be replaced with the owner\'s asset register'}


def loc(zone, facade=None, level='Church level'):
    return {'Zone': zone, 'Facade': facade, 'Level': level}


class Wall:
    """Straight wall from p0 to p1 (plan), thickness T, outward normal given by `out`."""
    def __init__(self, name, p0, p1, z0, z1, out, zone, facade, t=T, parent=None):
        self.parent = parent
        self.p0, self.p1, self.z0, self.z1, self.t = p0, p1, z0, z1, t
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        self.L = math.hypot(dx, dy)
        self.u = (dx / self.L, dy / self.L)
        self.n = out
        self.c = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        self.el = m.element('IfcWall', name, m.box(self.c[0], self.c[1], z0, self.L, t, z1 - z0, angle=math.atan2(dy, dx)),
                            'Church level', 'render', predefined='SOLIDWALL', object_type='Load-bearing masonry wall',
                            src=('LOD2 footprint + est. thickness', 'Medium', 'LOD2 / A09'),
                            common={'FireRating': 'Not assessed', 'Compartmentation': False},
                            psets={'Pset_CDE_Location': loc(zone, facade), DEMO: demo_am('Envelope > Walls', 60, 200)},
                            parent=parent)
        self.zone, self.facade = zone, facade

    def window(self, s, sill, w, h_spring, rise=None, name='Window', door=False):
        """Round-headed opening at distance s along the wall (from its centre), with its filler."""
        px, py = self.c[0] + self.u[0] * s, self.c[1] + self.u[1] * s
        outline = m.arch_outline(w, h_spring, rise)
        void = m.extrude_vertical_profile(outline, (px, py, sill), self.u, self.t + 0.4)
        inset = self.t / 2 - 0.35
        fx, fy = px + self.n[0] * inset, py + self.n[1] * inset
        panel = m.extrude_vertical_profile(outline, (fx, fy, sill), self.u, 0.12 if not door else 0.25)
        cls, mat, pre = ('IfcDoor', 'oak', 'DOOR') if door else ('IfcWindow', 'glass', 'WINDOW')
        top = h_spring + (w / 2 if rise is None else rise)
        filler = m.element(cls, name, panel, 'Church level', mat, predefined=pre,
                           object_type='Round-headed ' + ('double door' if door else 'window'),
                           src=('A05 elevation, scaled', 'Low', 'Engel drawing A05'),
                           common={'IsExternal': True, **({'FireExit': True} if door else {})},
                           psets={'Pset_CDE_Location': loc(self.zone, self.facade),
                                  'Pset_CDE_Opening': {'Width_m': w, 'SillHeight_m': sill, 'HeadHeight_m': sill + top,
                                                       'HeadShape': 'Semicircular'},
                                  DEMO: demo_am('Envelope > ' + ('Doors' if door else 'Windows'), 12, 40)},
                           parent=self.parent)
        m.opening(self.el, void, filler)
        return filler


# ---- terrace, grand staircase and railings ----------------------------------------------------
TT = ARM_TIP + 2.0
m.element('IfcSlab', 'Granite terrace', m.box(0, 0, SQUARE, 2 * TT, 2 * TT, -SQUARE), 'Terrace and crypt', 'terrace',
          predefined='BASESLAB', object_type='Retaining terrace',
          src=('LOD2 base vs Senate Square level', 'Medium', 'LOD2 / A05 / A10'),
          psets={'Pset_CDE_Location': loc('Terrace', level='Terrace and crypt'), DEMO: demo_am('Site > Terraces', 24, 150)})
stair = m.assembly('Grand staircase to Senate Square', 'Terrace and crypt', object_type='Monumental stair',
                   psets={'Pset_StairCommon': {'NumberOfRiser': 30, 'RiserHeight': round(-SQUARE / 30, 3),
                                               'TreadLength': 0.46, 'IsExternal': True, 'Status': 'EXISTING'},
                          'Pset_CDE_Location': loc('Grand staircase', 'South', 'Terrace and crypt'),
                          DEMO: demo_am('Site > Stairs', 12, 150, 'High')})
STEPS, RISER, TREAD, LANDING, WIDTH = 30, -SQUARE / 30, 0.46, 3.2, 44.0   # est. width from A05 / parish ≈60 m overall
y = -TT
for k in range(STEPS):
    top = -RISER * k
    if k == STEPS // 2:
        m.element('IfcSlab', 'Staircase landing', m.box(0, y - LANDING / 2, SQUARE, WIDTH, LANDING, top - SQUARE),
                  'Terrace and crypt', 'granite', predefined='LANDING', parent=stair,
                  src=('Estimated', 'Low', 'A05'))
        y -= LANDING
    m.element('IfcStairFlight', f'Step {k + 1:02d}', m.box(0, y - TREAD / 2, SQUARE, WIDTH, TREAD, top - RISER - SQUARE),
              'Terrace and crypt', 'granite', predefined='STRAIGHT', object_type='Granite step', parent=stair,
              src=('Estimated from level difference', 'Low', 'LOD2'),
              common={'NumberOfRiser': 1, 'RiserHeight': round(RISER, 3), 'TreadLength': TREAD})
    y -= TREAD
for sx in (-1, 1):
    side = 'W' if sx < 0 else 'E'
    m.element('IfcRailing', f'Terrace railing {side} front', m.box(sx * (WIDTH / 2 + (TT - WIDTH / 2) / 2), -TT + 0.1, 0.0, TT - WIDTH / 2, 0.08, 1.0),
              'Church level', 'iron', predefined='BALUSTRADE', src=('A05 elevation', 'Low'),
              common={'Height': 1.0}, psets={'Pset_CDE_Location': loc('Terrace', 'South')})
    m.element('IfcRailing', f'Terrace railing {side} side', m.box(sx * (TT - 0.1), 0, 0.0, 0.08, 2 * TT, 1.0),
              'Church level', 'iron', predefined='BALUSTRADE', src=('A05 elevation', 'Low'),
              common={'Height': 1.0}, psets={'Pset_CDE_Location': loc('Terrace', 'West' if sx < 0 else 'East')})

# ---- platform ---------------------------------------------------------------------------------
cross = [(-ARM_HALF, -ARM_TIP - 0.8), (ARM_HALF, -ARM_TIP - 0.8), (ARM_HALF, -CORE), (CORE, -CORE),
         (CORE, -ARM_HALF), (ARM_TIP + 0.8, -ARM_HALF), (ARM_TIP + 0.8, ARM_HALF), (CORE, ARM_HALF),
         (CORE, CORE), (ARM_HALF, CORE), (ARM_HALF, ARM_TIP + 0.8), (-ARM_HALF, ARM_TIP + 0.8),
         (-ARM_HALF, CORE), (-CORE, CORE), (-CORE, ARM_HALF), (-ARM_TIP - 0.8, ARM_HALF),
         (-ARM_TIP - 0.8, -ARM_HALF), (-CORE, -ARM_HALF), (-CORE, -CORE), (-ARM_HALF, -CORE)]
m.element('IfcSlab', 'Stylobate and church floor', m.prism(cross, 0, PLINTH), 'Church level', 'granite',
          predefined='FLOOR', object_type='Cross-shaped stylobate',
          src=('LOD2 footprint; est. height', 'Medium', 'LOD2 / A05'),
          psets={'Pset_CDE_Location': loc('Platform'), DEMO: demo_am('Structure > Floors', 60, 200)})

# ---- interior spaces --------------------------------------------------------------------------
inner = [(x * (1 - T / abs(x)) if abs(x) > 1 else x, y_ * (1 - T / abs(y_)) if abs(y_) > 1 else y_) for x, y_ in cross]
m.space('Church hall', 'Kirkkosali — nave and crossing', 'Church level', m.prism(inner, PLINTH, EAVES - PLINTH - 2.0),
        psets={'Pset_SpaceCommon': {'IsExternal': False, 'PubliclyAccessible': True, 'Reference': 'Church hall'},
               'Pset_CDE_SpaceUse': {'Use': 'Worship, concerts, visits', 'Note': 'Vaults not modelled; height to est. vault springing'},
               'Pset_CDE_Provenance': {'GeometrySource': 'Inner offset of LOD2 footprint', 'Confidence': 'Low'}})
m.space('Crypt', 'Krypta', 'Terrace and crypt', m.box(0, 0, SQUARE + 0.5, 2 * CORE - 4, 2 * CORE - 4, -SQUARE - 1.0),
        psets={'Pset_SpaceCommon': {'IsExternal': False, 'PubliclyAccessible': True, 'Reference': 'Crypt'},
               'Pset_CDE_SpaceUse': {'Use': 'Exhibitions and events'},
               'Pset_CDE_Provenance': {'GeometrySource': 'Estimated extent (A01 partial cellar plan)', 'Confidence': 'Low'}})

# ---- core corner walls (the re-entrant corners between the arms) ------------------------------
for qx in (-1, 1):
    for qy in (-1, 1):
        tag = f'{"N" if qy > 0 else "S"}{"E" if qx > 0 else "W"}'
        corner = m.assembly(f'Core corner {tag}', 'Church level', object_type='Re-entrant corner of the cross',
                            psets={'Pset_CDE_Location': loc(f'Core {tag}')})
        wa = Wall(f'Core wall {tag} (facing {"north" if qy > 0 else "south"})',
                  (qx * ARM_HALF, qy * (CORE - T / 2)), (qx * CORE, qy * (CORE - T / 2)), PLINTH, EAVES, (0, qy),
                  f'Core {tag}', 'North' if qy > 0 else 'South', parent=corner)
        wb = Wall(f'Core wall {tag} (facing {"east" if qx > 0 else "west"})',
                  (qx * (CORE - T / 2), qy * ARM_HALF), (qx * (CORE - T / 2), qy * CORE), PLINTH, EAVES, (qx, 0),
                  f'Core {tag}', 'East' if qx > 0 else 'West', parent=corner)
        for w_ in (wa, wb):
            w_.window(0.0, 10.0, 1.8, 13.5, name=f'{w_.zone} upper window')

# ---- arms: walls, windows, doors, gables, porticoes, apostles ----------------------------------
for name, (ux, uy) in ARMS.items():
    across, at = frame(ux, uy)
    arm = m.assembly(f'{name} arm', 'Church level', object_type='Cross arm with portico',
                     psets={'Pset_CDE_Location': loc(f'{name} arm', name)})
    # front wall behind the portico with main door and two windows
    p0, p1 = at(ARM_WALL - T / 2, -ARM_HALF), at(ARM_WALL - T / 2, ARM_HALF)
    front = Wall(f'{name} front wall', p0, p1, PLINTH, EAVES, (ux, uy), f'{name} portico', name, parent=arm)
    d = front.window(0.0, PLINTH, 3.6, 5.2, name=f'{name} main door', door=True)
    for s in (-6.4, 6.4):
        front.window(s, 5.5, 2.0, 6.5, name=f'{name} front window {"L" if s < 0 else "R"}')
    front.window(0.0, 14.5, 2.4, 3.5, name=f'{name} lunette window')
    # side walls with two tall windows each
    for sd in (-1, 1):
        q0, q1 = at(CORE, sd * (ARM_HALF - T / 2)), at(ARM_WALL - T, sd * (ARM_HALF - T / 2))
        sw = Wall(f'{name} arm {"left" if sd < 0 else "right"} wall', q0, q1, PLINTH, EAVES,
                  (across[0] * sd, across[1] * sd), f'{name} arm', name, parent=arm)
        sw.window(0.0, 6.0, 2.2, 11.0, name=f'{name} arm {"left" if sd < 0 else "right"} window')
    # corner pilasters on the arm front
    for sd in (-1, 1):
        px, py = at(ARM_WALL + 0.25, sd * (ARM_HALF - 0.6))
        m.element('IfcColumn', f'{name} corner pilaster {"L" if sd < 0 else "R"}',
                  m.box(px, py, PLINTH, 1.2, 1.2, EAVES - PLINTH - 1.3), 'Church level', 'render', predefined='PILASTER',
                  object_type='Corinthian pilaster', parent=arm, src=('A05 elevation', 'Low'),
                  psets={'Pset_CDE_Location': loc(f'{name} arm', name)})
    # main cornice and upper gable of the arm
    L = ARM_WALL - CORE
    ox, oy = at(CORE + L / 2)
    dx, dy = (L + 0.8, 2 * ARM_HALF + 0.8) if ux else (2 * ARM_HALF + 0.8, L + 0.8)
    m.element('IfcBeam', f'{name} arm cornice', m.box(ox, oy, EAVES - 1.2, dx, dy, 1.2), 'Roof', 'render',
              predefined='USERDEFINED', object_type='Main cornice', parent=arm, src=('LOD2 eaves', 'High', 'LOD2'),
              psets={'Pset_CDE_Location': loc(f'{name} arm', name, 'Roof')})
    half = ARM_HALF + 0.4
    run = ARM_WALL + 0.4 - CORE
    ox, oy = at(CORE + run / 2)
    m.element('IfcRoof', f'{name} arm gable roof',
              m.extrude_vertical_profile([(-half, 0.0), (half, 0.0), (0.0, GABLE_PEAK - EAVES)], (ox, oy, EAVES), across, run),
              'Roof', 'roof', predefined='GABLE_ROOF', object_type='Gable roof with tympanum', parent=arm,
              src=('LOD2 ridge height', 'High', 'LOD2'),
              common={'ProjectedArea': round(2 * half * run, 1)},
              psets={'Pset_CDE_Location': loc(f'{name} arm', name, 'Roof'), DEMO: demo_am('Envelope > Roofs', 12, 60, 'High')})
    # hexastyle Corinthian portico
    port = m.assembly(f'{name} portico', 'Church level', object_type='Hexastyle Corinthian portico', parent=arm,
                      psets={'Pset_CDE_Location': loc(f'{name} portico', name),
                             'Pset_CDE_Portico': {'Columns': 6, 'Order': 'Corinthian', 'CentralBay_m': 5.4, 'SideBays_m': 3.7}})
    for i, sft in enumerate(COL_S):
        px, py = at(COL_LINE, sft)
        m.element('IfcColumn', f'{name} portico column {i + 1}',
                  [m.box(px, py, PLINTH, COL_D + 0.6, COL_D + 0.6, 0.45), m.cylinder(px, py, PLINTH + 0.45, COL_D / 2 + 0.08, 0.35),
                   m.cylinder(px, py, PLINTH + 0.8, COL_D / 2, COL_TOP - 1.5 - PLINTH - 0.8)],
                  'Church level', 'column', predefined='COLUMN', object_type='Corinthian column', parent=port,
                  src=('OSM column position; est. diameter and height', 'Medium', 'OSM / A05'),
                  common={'Slope': 0.0},
                  psets={'Pset_CDE_Column': {'Order': 'Corinthian', 'ShaftDiameter_m': COL_D, 'BayPosition': i + 1},
                         'Pset_CDE_Location': loc(f'{name} portico', name),
                         DEMO: demo_am('Structure > Columns', 24, 200, 'High')})
        m.element('IfcMember', f'{name} portico capital {i + 1}',
                  [m.box(px, py, COL_TOP - 1.5, COL_D + 0.3, COL_D + 0.3, 1.2), m.box(px, py, COL_TOP - 0.3, COL_D + 0.8, COL_D + 0.8, 0.3)],
                  'Church level', 'capital', predefined='USERDEFINED', object_type='Corinthian capital and abacus', parent=port,
                  src=('Classical proportion', 'Low'), psets={'Pset_CDE_Location': loc(f'{name} portico', name)})
    depth = ARM_TIP + 0.4 - ARM_WALL
    ox, oy = at(ARM_WALL + depth / 2)
    dx, dy = (depth, 2 * ARM_HALF - 0.6) if ux else (2 * ARM_HALF - 0.6, depth)
    m.element('IfcBeam', f'{name} portico entablature', m.box(ox, oy, COL_TOP, dx, dy, PORT_ENT - COL_TOP), 'Church level',
              'render', predefined='USERDEFINED', object_type='Architrave, frieze and cornice', parent=port,
              src=('OSM portico part level', 'Medium', 'OSM'), psets={'Pset_CDE_Location': loc(f'{name} portico', name)})
    half_p = ARM_HALF - 0.3
    m.element('IfcRoof', f'{name} portico pediment',
              m.extrude_vertical_profile([(-half_p, 0.0), (half_p, 0.0), (0.0, PORT_PEAK - PORT_ENT)], (ox, oy, PORT_ENT), across, depth),
              'Church level', 'render', predefined='GABLE_ROOF', object_type='Pediment with tympanum relief', parent=port,
              src=('OSM portico gable top', 'Medium', 'OSM / A05'), psets={'Pset_CDE_Location': loc(f'{name} portico', name)})
    # apostles: apex and both corners of the upper gable (4 arms x 3 = twelve)
    for k, (sft, z) in enumerate([(0.0, GABLE_PEAK), (-half + 0.6, EAVES), (half - 0.6, EAVES)]):
        sx, sy = at(ARM_WALL + 0.2, sft)
        m.element('IfcFurnishingElement', f'{name} gable apostle statue {k + 1}',
                  [m.cylinder(sx, sy, z, 0.42, 0.25), m.cylinder(sx, sy, z + 0.25, 0.38, 2.2), m.cylinder(sx, sy, z + 2.45, 0.22, 0.45)],
                  'Roof', 'zinc', object_type='Apostle statue (cast zinc)', parent=arm,
                  src=('Position from photographs; figure simplified', 'Low'),
                  psets={'Pset_CDE_Artwork': {'Subject': 'One of the Twelve Apostles', 'Material': 'Cast zinc',
                                              'AddedBy': 'Ernst Lohrmann (completion 1840-1852)', 'Height_m': 2.9},
                         'Pset_CDE_Location': loc(f'{name} gable', name, 'Roof'),
                         DEMO: demo_am('Art > Statues', 12, 100, 'High')})

# ---- central block: cornice, attic, attic ring -----------------------------------------------
m.element('IfcBeam', 'Central cornice', m.box(0, 0, EAVES - 1.2, 2 * CORE + 0.8, 2 * CORE + 0.8, 1.2), 'Roof', 'render',
          predefined='USERDEFINED', object_type='Main cornice', src=('LOD2 eaves', 'High', 'LOD2'),
          psets={'Pset_CDE_Location': loc('Crossing', level='Roof')})
m.element('IfcRoof', 'Central roof', m.box(0, 0, EAVES, 2 * CORE - 1.0, 2 * CORE - 1.0, 1.0), 'Roof', 'roof',
          predefined='FLAT_ROOF', src=('LOD2', 'Medium'), psets={'Pset_CDE_Location': loc('Crossing', level='Roof'),
                                                                 DEMO: demo_am('Envelope > Roofs', 12, 60, 'High')})
m.element('IfcWall', 'Circular attic under the drum', m.tube(0, 0, EAVES + 1.0, 12.05, 10.6, 33.0 - EAVES - 1.0), 'Roof',
          'render', predefined='SOLIDWALL', object_type='Attic ring (Ø24.1 m)', src=('OSM Ø24.1 m; LOD2 top ≈33 m', 'Medium', 'OSM / LOD2'),
          psets={'Pset_CDE_Location': loc('Crossing', level='Roof')})

# ---- stair towers with corner cupolas (Lohrmann) ----------------------------------------------
for qx in (-1, 1):
    for qy in (-1, 1):
        cx, cy = qx * 13.2, qy * 13.2          # OSM (±12.3..14.2); LOD2 (14.0, 14.3)
        tag = f'{"N" if qy > 0 else "S"}{"E" if qx > 0 else "W"}'
        tw = m.assembly(f'{tag} corner tower', 'Roof', object_type='Stair tower with cupola',
                        psets={'Pset_CDE_Location': loc(f'Tower {tag}', level='Roof'),
                               'Pset_CDE_Heritage': {'AddedBy': 'Ernst Lohrmann', 'Note': 'Cupola not in Engel\'s design'}})
        m.element('IfcWall', f'{tag} tower shaft', m.box(cx, cy, EAVES, 6.9, 6.9, 3.0), 'Roof', 'render', predefined='SOLIDWALL',
                  object_type='Square tower shaft above the eaves (OSM 6.9 m)', parent=tw, src=('OSM part', 'Medium', 'OSM'))
        m.element('IfcWall', f'{tag} tower drum', m.tube(cx, cy, EAVES + 3.0, 2.9, 2.2, 8.0), 'Drum and dome', 'render',
                  predefined='SOLIDWALL', object_type='Cylindrical drum', parent=tw, src=('LOD2 r≈3.6 incl. colonnettes', 'Medium', 'LOD2'))
        for i in range(8):
            a = 2 * math.pi * i / 8 + math.pi / 8
            m.element('IfcColumn', f'{tag} tower colonnette {i + 1}',
                      m.cylinder(cx + 3.3 * math.cos(a), cy + 3.3 * math.sin(a), EAVES + 3.0, 0.2, 7.3), 'Drum and dome', 'column',
                      predefined='COLUMN', object_type='Colonnette', parent=tw, src=('Photographs', 'Low'))
        m.element('IfcBeam', f'{tag} tower cornice', m.cylinder(cx, cy, EAVES + 10.3, 3.65, 0.7), 'Drum and dome', 'render',
                  predefined='USERDEFINED', object_type='Ring cornice', parent=tw, src=('Estimated', 'Low'))
        m.element('IfcRoof', f'{tag} cupola', m.revolve(m.dome_profile(3.3, 4.1, n=16), cx, cy, EAVES + 11.0), 'Drum and dome',
                  'copper', predefined='DOME_ROOF', object_type='Copper cupola', parent=tw, src=('LOD2 top 43.4 m', 'Medium', 'LOD2'),
                  psets={DEMO: demo_am('Envelope > Domes', 12, 80, 'High')})
        m.element('IfcMember', f'{tag} gilded finial', [m.revolve(m.dome_profile(0.55, 0.9, n=8), cx, cy, EAVES + 15.1),
                                                          m.box(cx, cy, EAVES + 16.0, 0.12, 0.12, 1.4), m.box(cx, cy, EAVES + 16.9, 0.6, 0.12, 0.1)],
                  'Drum and dome', 'gold', predefined='USERDEFINED', object_type='Gilded onion and cross', parent=tw,
                  src=('OSM gold onion part', 'Medium', 'OSM'))

# ---- drum, dome, lantern ----------------------------------------------------------------------
drum = m.assembly('Main drum and dome', 'Drum and dome', object_type='Drum, colonnade, dome and lantern',
                  psets={'Pset_CDE_Location': loc('Dome', level='Drum and dome'),
                         'Pset_CDE_Dome': {'DrumDiameter_m': 15.3, 'ColonnadeColumns': 10, 'TopOfCross_m_above_platform': 62.4,
                                           'Note': 'Colonnade count from OSM mapped positions — verify on site'}})
DR, D0, D1 = 6.3, 33.0, 46.0      # OSM Ø15.3 m incl. colonnade; LOD2 dome base ≈49 m
m.element('IfcWall', 'Drum wall', m.tube(0, 0, D0, DR, DR - 1.2, D1 - D0), 'Drum and dome', 'render', predefined='SOLIDWALL',
          object_type='Cylindrical drum wall', parent=drum, src=('OSM/LOD2', 'Medium'),
          psets={DEMO: demo_am('Structure > Walls', 60, 200, 'High')})
for i in range(10):
    a = 2 * math.pi * i / 10 + math.radians(26)                 # OSM angles start ≈26°
    m.element('IfcColumn', f'Drum colonnade column {i + 1}', m.cylinder(7.0 * math.cos(a), 7.0 * math.sin(a), D0, 0.45, D1 - D0 - 1.0),
              'Drum and dome', 'column', predefined='COLUMN', object_type='Corinthian column (drum)', parent=drum,
              src=('OSM mapped position, radius 7.0 m', 'Medium', 'OSM'))
    b = a + math.pi / 10
    m.element('IfcWindow', f'Drum window {i + 1}',
              m.extrude_vertical_profile(m.arch_outline(1.5, 5.0), (DR * math.cos(b), DR * math.sin(b), D0 + 3.0),
                                         (-math.sin(b), math.cos(b)), 0.25),
              'Drum and dome', 'glass', predefined='WINDOW', object_type='Round-headed drum window', parent=drum,
              src=('A05 elevation', 'Low'))
m.element('IfcBeam', 'Drum entablature', m.tube(0, 0, D1 - 1.0, 7.9, DR - 0.6, 1.4), 'Drum and dome', 'render',
          predefined='USERDEFINED', object_type='Ring entablature', parent=drum, src=('OSM Ø16.4 m ring', 'Medium', 'OSM'))
m.element('IfcWall', 'Drum attic', m.tube(0, 0, D1 + 0.4, 7.3, DR - 0.6, 2.6), 'Drum and dome', 'render', predefined='SOLIDWALL',
          parent=drum, src=('OSM', 'Medium'))
DOME0, DOME_R, DOME_H = 49.0, 7.9, 11.0
outer = [(DOME_R * math.cos(a), DOME_H * math.sin(a)) for a in [i * math.pi / 2 / 24 for i in range(25)]]
inner_ = [((DOME_R - 0.5) * math.cos(a), (DOME_H - 0.5) * math.sin(a)) for a in [i * math.pi / 2 / 24 for i in range(24, -1, -1)]]
m.element('IfcRoof', 'Main dome', m.revolve(outer + inner_, 0, 0, DOME0), 'Drum and dome', 'copper', predefined='DOME_ROOF',
          object_type='Copper-clad dome shell', parent=drum, src=('LOD2 r≈8.4 at 53 m, top ≈62 m', 'Medium', 'LOD2'),
          psets={DEMO: demo_am('Envelope > Domes', 12, 80, 'High')})
m.element('IfcColumn', 'Lantern', m.tube(0, 0, 59.6, 1.6, 1.1, 1.9), 'Drum and dome', 'column', predefined='COLUMN',
          object_type='Lantern drum', parent=drum, src=('OSM onion parts 53-59 m', 'Low', 'OSM'))
m.element('IfcRoof', 'Lantern cupola', m.revolve(m.dome_profile(1.85, 0.9, n=12), 0, 0, 61.5), 'Drum and dome', 'copper',
          predefined='DOME_ROOF', parent=drum, src=('LOD2 top 62.4 m', 'Medium', 'LOD2'))
m.element('IfcMember', 'Gilded orb and cross', [m.revolve(m.dome_profile(0.35, 0.35, n=8), 0, 0, 62.4),
                                                 m.box(0, 0, 62.4, 0.14, 0.14, 2.0), m.box(0, 0, 63.7, 0.9, 0.14, 0.12)],
          'Drum and dome', 'gold', predefined='USERDEFINED', object_type='Gilded orb and cross', parent=drum,
          src=('Photographs; LOD2 omits the cross', 'Low'))

out = sys.argv[1] if len(sys.argv) > 1 else 'helsinki-cathedral.ifc'
m.finish(out)
print('written', out, len(m.f.by_type('IfcProduct')), 'products')
