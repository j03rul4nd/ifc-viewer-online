"""Helsinki Central Station (Rautatieasema) — authored IFC4, v4.

Eliel Saarinen won the competition in 1904; the station opened in 1919. Sources:
  LOD2   City of Helsinki LOD2 model, CC BY 4.0 — roof heights (1 m raster) and the block footprint,
         from which every wing below is sized
  OSM    OpenStreetMap, ODbL — main hall outline, clock tower footprint, the 19 platforms, the tracks
         (railway=rail) and the glazed roof over the platform heads; building:colour #b38f80
  MFA    Saarinen's perspectives (Architecture & Design Museum, CC BY 4.0) and the 1903 competition
         ground plan (public domain)
  PHOTO  Wikimedia Commons photographs (CC0 / CC BY / CC BY-SA, 2005–2023): main facade, clock
         tower, west entrance on Asema-aukio, east wing on Rautatientori, platform hall — proportions
         scaled from them against LOD2 heights
  FIWP   fi.wikipedia "Helsingin päärautatieasema": Hanko red granite, sheet-iron roofs, tower 48.5 m
         with four balconies under the clocks, a 4.5 m dome crowned by a sphere on four winged wheels,
         clock faces 3.0 m with hands of 1.19 and 1.50 m, half-columns dividing the Kaivokatu front
  REG    City of Helsinki building register (WFS), CC BY 4.0 — building-level figures
  WEB    paarautatieasema.fi, HAM (Lamp Bearers, Emil Wikström 1914)
v4 authors the whole block: the historic core element by element (scalloped copper arch, stepped
archivolts, mullioned arch window, copper canopy, fluted pylons, four Lamp Bearers, the clock tower
with its corner piers, balconies and copper crown, the west and east entrances) and every wing as
walls, granite plinth, piers or engaged columns, windows per floor, cornice and a mansard or round
roof with semicircular dormers. Every element carries Pset_CDE_Provenance. Demonstration model, not a
survey.

Model frame: local ENU at the LOD2 block centre (+x east, +y north), z=0 at the LOD2 base. The
building grid is rotated ROT_DEG from east; every element is rotated about its own centre.
"""
import json, math, os, sys
import numpy as np
from shapely.geometry import LineString, Point, Polygon, box as sbox
from shapely.affinity import rotate
from pyproj import Transformer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ifcbuild import Model

LAT, LON, ELEV = 60.17179, 24.94183, 1.54      # LOD2 base, N2000
ROT_DEG = 2.4
ROT = math.radians(ROT_DEG)
U = (math.cos(ROT), math.sin(ROT))             # building grid +x (east-ish)
V = (-math.sin(ROT), math.cos(ROT))            # building grid +y (north-ish)
S_ = (-V[0], -V[1])                            # south, outward from Kaivokatu
DEMO = 'Pset_CDE_AssetManagement (demo)'
HERE = os.path.dirname(__file__)

m = Model('Helsinki Central Station — authored IFC (InGreen demo)', 'Rautatientori / Kaivokatu block',
          'Helsingin päärautatieasema', LAT, LON, ELEV, rotation_deg=0.0, tag_prefix='RA',
          description="Authored from Eliel Saarinen's drawings (public domain), photographs, City of Helsinki LOD2 "
                      'and OpenStreetMap. Demonstration model, not a survey.')
m.material('granite', 'Hanko red granite, rock-faced ashlar', (0.56, 0.45, 0.41), 'Stone', 2650,
           'Pink-brown Hanko granite cladding (OSM building:colour #b38f80)')
m.material('granite_d', 'Hanko red granite, dressed plinth', (0.47, 0.39, 0.36), 'Stone', 2700)
m.material('copper', 'Patinated copper sheet', (0.43, 0.66, 0.58), 'Metal', 8900, 'Verdigris copper: caps, rims, canopies, cornices')
m.material('roof', 'Black sheet-iron roofing', (0.18, 0.19, 0.20), 'Metal', 7850, 'Standing-seam sheet iron (FIWP)')
m.material('roof_seam', 'Sheet-iron standing seams', (0.27, 0.28, 0.29), 'Metal', 7850)
m.material('render', 'Ochre lime render', (0.80, 0.68, 0.52), 'Plaster', 1800, 'Rendered upper storeys of the wings')
m.material('render_l', 'Light render, dormer surrounds', (0.90, 0.88, 0.83), 'Plaster', 1800)
m.material('glass', 'Glazing', (0.50, 0.60, 0.66), 'Glass', 2500, transparency=0.2)
m.material('frame', 'Bronze-coloured glazing bars', (0.62, 0.50, 0.28), 'Metal', 7800)
m.material('frame_d', 'Dark painted window frames', (0.20, 0.21, 0.20), 'Wood', 600)
m.material('frame_w', 'White painted window frames', (0.93, 0.93, 0.90), 'Wood', 600)
m.material('clock', 'Clock face', (0.82, 0.90, 0.86), 'Metal', None, 'Copper dial, light patina')
m.material('hands', 'Clock hands and hour marks', (0.08, 0.08, 0.09), 'Metal', None)
m.material('door', 'Oak and bronze doors', (0.55, 0.37, 0.18), 'Wood', 750)
m.material('statue', 'Hanko red granite sculpture', (0.60, 0.52, 0.48), 'Stone', 2700)
m.material('lamp', 'Opal glass lamp', (0.96, 0.96, 0.92), 'Glass', None)
m.material('sign', 'Bronze lettering', (0.18, 0.18, 0.17), 'Metal', None)

m.storey('Ground', 0.0, 'Station hall level')
m.storey('Roof', 14.0, 'Hall springing level')
m.storey('Tower', 31.0, 'Balconies, clock stage and crown')
bld = m.building
m.pset(bld, 'Pset_BuildingCommon', {'BuildingID': '103036759D', 'IsLandmarked': True, 'YearOfConstruction': 1919,
                                     'NumberOfStoreys': 5, 'GrossPlannedArea': 66708.0, 'NetPlannedArea': 46486.0})
m.pset(bld, 'Pset_CDE_CityRegister', {'PermanentBuildingID_VTJPRT': '103036759D', 'MunicipalBuildingNo_RATU': 324,
                                       'PropertyID': '091-002-0011-0001', 'Address': 'Kaivokatu 1, 00100 Helsinki',
                                       'BuildingType': 'Asemarakennus (station building)', 'BuildingClass2018': '0320',
                                       'RegisterCompletionDate': '1909-12-31', 'Volume_m3': 315974, 'GrossArea_m2': 66708,
                                       'FloorArea_m2': 46486, 'BasementArea_m2': 6256, 'Storeys': 5, 'Premises': 21,
                                       'LOD2_MeasuredHeight_m': 50.4,
                                       'Source': 'City of Helsinki building register and LOD2 (CC BY 4.0), retrieved 2026-09-30'})
m.pset(bld, 'Pset_CDE_Heritage', {'Architect': 'Eliel Saarinen', 'Competition': 1904, 'Opened': 1919,
                                  'Style': 'National Romanticism / early Modernism', 'Sculptor': 'Emil Wikström (Lamp Bearers, 1914)',
                                  'FacadeStone': 'Hanko red granite', 'MainRoofs': 'Sheet iron',
                                  'AdministrationWing': '1905-1909, hotel since 2021',
                                  'PlatformRoof': 'Glass and steel, Esa Piironen, 2001',
                                  'Drawings': 'Architecture & Design Museum, Saarinen collection (CC BY 4.0)'})
m.pset(m.site, 'Pset_CDE_Georeference', {'CRS': 'EPSG:3879 (ETRS89 / GK25FIN)', 'HeightSystem': 'N2000',
                                         'OriginLatitude': LAT, 'OriginLongitude': LON, 'OriginElevation_m': ELEV,
                                         'GridRotationFromEast_deg': ROT_DEG})


def demo_am(asset_class, interval, life, criticality='Medium'):
    return {'AssetClass': asset_class, 'InspectionInterval_months': interval, 'DesignServiceLife_years': life,
            'Criticality': criticality, 'DataStatus': "Demo values — to be replaced with the owner's asset register"}


def loc(zone, facade=None, level='Ground'):
    return {'Zone': zone, 'Facade': facade, 'Level': level}


def g(cx, cy, s=0.0, t=0.0):
    """Point at grid offset (s along U, t along V) from ENU centre (cx, cy)."""
    return (cx + U[0] * s + V[0] * t, cy + U[1] * s + V[1] * t)


def rbox(cx, cy, z0, w, d, h):
    return m.box(cx, cy, z0, w, d, h, angle=ROT)


def rrect(cx, cy, w, d):
    return rotate(sbox(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2), ROT_DEG, origin=(cx, cy))


class Face:
    """A vertical facade plane: origin on the face, u along it, n outward. s runs along u, o along n."""

    def __init__(self, ox, oy, u, n):
        self.ox, self.oy, self.u, self.n = ox, oy, u, n
        self.ang = math.atan2(u[1], u[0])

    def p(self, s, o=0.0):
        return (self.ox + self.u[0] * s + self.n[0] * o, self.oy + self.u[1] * s + self.n[1] * o)

    def box(self, s, o, z0, w, d, h):
        """Box centred at (s, o): w along the face, d across it."""
        return m.box(*self.p(s, o), z0, w, d, h, self.ang)

    def prof(self, pts, o, z0, depth, s=0.0):
        """Profile [(s, t)] in the facade plane, extruded `depth` across it, centred at offset o."""
        return m.extrude_vertical_profile(pts, (*self.p(s, o), z0), self.u, depth)

    def cyl(self, s, o, z0, r, h, n=8):
        """Column of radius r as an n-sided prism: reads round at city scale for a fraction of the triangles."""
        return poly_col(*self.p(s, o), z0, r, h, n, self.ang)


def poly_col(cx, cy, z0, r, h, n=8, ang=0.0):
    return m.prism([(cx + r * math.cos(ang + (i + 0.5) * 2 * math.pi / n), cy + r * math.sin(ang + (i + 0.5) * 2 * math.pi / n))
                    for i in range(n)], z0, h)


def arc(r, a0, a1, n, cx=0.0, cz=0.0, rz=None):
    rz = r if rz is None else rz
    return [(cx + r * math.cos(a), cz + rz * math.sin(a)) for a in np.linspace(a0, a1, n)]


def ring(r_out, r_in, spring, n=28, rz_out=None, rz_in=None):
    """Half-annulus (arch band) in a facade plane, centred at height `spring`."""
    return arc(r_out, 0, math.pi, n, cz=spring, rz=rz_out) + arc(r_in, math.pi, 0, n, cz=spring, rz=rz_in)


def compass(cx, cy, half):
    """The four faces of a square plan centred at (cx, cy): (name, Face) with u along and n outward."""
    out = []
    for name, (fs, ft) in (('North', (0, 1)), ('East', (1, 0)), ('South', (0, -1)), ('West', (-1, 0))):
        nx, ny = U[0] * fs + V[0] * ft, U[1] * fs + V[1] * ft
        out.append((name, Face(cx + nx * half, cy + ny * half, (-ny, nx), (nx, ny))))
    return out


# ================================================================== wings
def wing(name, cx, cy, L, D, eave, ridge, axis='U', style='ochre', floors=3, bay=4.2, roof='mansard',
         facades=('+a', '-a', '+b', '-b'), dormer_sides=('+b', '-b'), zone=None, note=None,
         src_note='LOD2 roof raster, rectangle fitted by hand; facade from photographs'):
    """One wing of the block: four walls, plinth, piers, windows per floor, cornice, roof and dormers.

    style 'ochre'   granite basement and engaged granite columns over two floors, rendered walls above
                    (the administration wing on Rautatientori, PHOTO)
          'granite' granite walls and piers, tall ground-floor windows, rendered panels in the attic
                    (the Asema-aukio and Kaivokatu wings, PHOTO)
          'hall'    granite half-columns and tall hall windows over one storey (the Kaivokatu halls, FIWP)
    roof  'mansard' | 'barrel' | 'flat'.  a = the long axis (U or V), b its left normal.
    """
    a = U if axis == 'U' else V
    b = (-a[1], a[0])
    ang = math.atan2(a[1], a[0])
    zone = zone or name
    asm = m.assembly(name, 'Ground', object_type={'ochre': 'Rendered wing', 'granite': 'Granite wing',
                                                  'hall': 'Granite hall range'}[style],
                     psets={'Pset_CDE_Wing': {'Length_m': round(L, 1), 'Depth_m': round(D, 1), 'EaveHeight_m': eave,
                                              'RidgeHeight_m': ridge, 'Floors': floors, 'Roof': roof, 'Note': note},
                            'Pset_CDE_Location': loc(zone),
                            'Pset_CDE_Provenance': {'GeometrySource': src_note, 'Confidence': 'Medium'}})
    faces = {'+b': (Face(cx + b[0] * D / 2, cy + b[1] * D / 2, (-a[0], -a[1]), b), L),
             '-b': (Face(cx - b[0] * D / 2, cy - b[1] * D / 2, a, (-b[0], -b[1])), L),
             '+a': (Face(cx + a[0] * L / 2, cy + a[1] * L / 2, b, a), D),
             '-a': (Face(cx - a[0] * L / 2, cy - a[1] * L / 2, (-b[0], -b[1]), (-a[0], -a[1])), D)}
    wall_mat = 'granite' if style in ('granite', 'hall') else 'render'
    T = 0.7
    for k, (fc, Lf) in faces.items():
        inner = Lf if k in ('+b', '-b') else Lf - 2 * T
        m.element('IfcWall', f'{name} {k} wall', fc.box(0, -T / 2, 0, inner, T, eave), 'Ground', wall_mat,
                  predefined='SOLIDWALL', object_type='External wall', parent=asm,
                  src=('LOD2 footprint; thickness estimated', 'Medium', 'LOD2'),
                  psets={'Pset_CDE_Location': loc(zone, k), DEMO: demo_am('Envelope > Walls', 60, 150)})
    plinth_h = 1.4 if style == 'ochre' else 1.1
    pl_items, pier_items, col_items, sill_items, panel_items = [], [], [], [], []
    for k in facades:
        fc, Lf = faces[k]
        pl_items.append(fc.box(0, 0.2, 0, Lf + 0.8, 0.4, plinth_h))
        nb = max(1, int((Lf - 1.6) // bay))
        bw = (Lf - 1.6) / nb
        piers = [-Lf / 2 + 0.8 + bw * i for i in range(nb + 1)]
        bays = [-Lf / 2 + 0.8 + bw * (i + 0.5) for i in range(nb)]
        win_w = max(bw - 1.5, 0.9)
        if style == 'ochre':
            fh = (eave - plinth_h - 0.8) / floors
            col_top = plinth_h + 2 * fh if floors >= 3 else eave - 0.8
            pl_items.append(fc.box(0, 0.08, plinth_h, Lf + 0.16, 0.16, fh - 0.25))   # granite ground storey
            for s in piers:
                col_items.append(fc.cyl(s, 0.05, plinth_h, 0.42, col_top - plinth_h))
            for f_ in range(floors):
                sill_items.append(fc.box(0, 0.09, plinth_h + f_ * fh + 0.55, Lf, 0.18, 0.22))
            sill_items.append(fc.box(0, 0.12, col_top, Lf + 0.2, 0.24, 0.35))
            levels = [(plinth_h + f_ * fh + 0.8, fh - 1.35) for f_ in range(floors)]
        elif style == 'granite':
            for s in piers:
                pier_items.append(fc.box(s, 0.2, plinth_h, 1.1, 0.4, eave - plinth_h - 0.6))
            gh = min(8.6, eave - 6.0)
            levels = [(plinth_h + 0.5, gh - plinth_h - 0.5)]
            sill_items.append(fc.box(0, 0.15, gh + 0.2, Lf, 0.3, 0.45))
            if floors > 1:
                levels.append((gh + 1.0, eave - gh - 2.5))
            else:
                for s in bays:
                    panel_items.append(fc.box(s, 0.0, gh + 0.9, bw - 1.1, 0.06, eave - gh - 2.2))
        else:  # hall: half-columns without base or capital (FIWP)
            for s in piers:
                pier_items.append(fc.cyl(s, 0.0, plinth_h, 0.6, eave - plinth_h - 0.6))
            levels = [(plinth_h + 0.6, eave - plinth_h - 3.0)]
        for li, (z0, wh) in enumerate(levels):
            glass, frames = [], []
            for s in bays:
                glass.append(fc.box(s, 0.03, z0, win_w, 0.06, wh))
                frames.append(fc.box(s, 0.08, z0 + wh - 0.02, win_w + 0.2, 0.08, 0.12))  # head
                frames.append(fc.box(s, 0.08, z0, 0.08, 0.06, wh))                      # mullion
                frames.append(fc.box(s, 0.08, z0 + wh * (0.62 if wh < 4 else 0.78), win_w, 0.06, 0.08))  # transom
            lvl = 'Ground' if li == 0 else f'Floor {li}'
            m.element('IfcWindow', f'{name} {k} windows L{li}', glass, 'Ground', 'glass', predefined='WINDOW',
                      object_type='Window row', parent=asm, src=('Bay rhythm and window size from photographs', 'Low', 'PHOTO'),
                      psets={'Pset_CDE_WindowRow': {'Count': len(bays), 'Width_m': round(win_w, 2), 'Height_m': round(wh, 2),
                                                    'SillHeight_m': round(z0, 2)},
                             'Pset_CDE_Location': loc(zone, k, lvl), DEMO: demo_am('Envelope > Windows', 12, 60)})
            m.element('IfcMember', f'{name} {k} window frames L{li}', frames, 'Ground',
                      'frame_w' if style == 'ochre' else 'frame_d', predefined='MULLION', object_type='Window frames',
                      parent=asm, src=('Photographs', 'Low', 'PHOTO'))
    m.element('IfcCovering', f'{name} granite plinth', pl_items, 'Ground', 'granite_d', predefined='CLADDING',
              object_type='Granite plinth and ground-storey cladding', parent=asm, src=('Photographs', 'Medium', 'PHOTO'))
    if pier_items:
        m.element('IfcColumn', f'{name} granite piers', pier_items, 'Ground', 'granite', predefined='PILASTER',
                  object_type='Granite half-columns' if style == 'hall' else 'Granite piers', parent=asm,
                  src=('Photographs; FIWP', 'Medium', 'PHOTO'))
    if col_items:
        m.element('IfcColumn', f'{name} engaged columns', col_items, 'Ground', 'granite', predefined='PILASTER',
                  object_type='Engaged granite columns', parent=asm, src=('Photographs (administration wing)', 'Medium', 'PHOTO'))
    if sill_items:
        m.element('IfcMember', f'{name} string courses', sill_items, 'Ground', 'granite_d', predefined='USERDEFINED',
                  object_type='String courses and sills', parent=asm, src=('Photographs', 'Low', 'PHOTO'))
    if panel_items:
        m.element('IfcCovering', f'{name} rendered panels', panel_items, 'Ground', 'render', predefined='CLADDING',
                  object_type='Rendered attic panels between piers', parent=asm, src=('Photograph (Asema-aukio)', 'Medium', 'PHOTO'))
    m.element('IfcMember', f'{name} cornice', m.box(cx, cy, eave - 0.55, L + 0.9, D + 0.9, 0.55, ang), 'Roof',
              'copper' if style in ('granite', 'hall') else 'granite_d', predefined='USERDEFINED', object_type='Cornice',
              parent=asm, src=('Photographs; copper cornices (FIWP)', 'Medium', 'PHOTO'))
    rh = ridge - eave
    if roof == 'mansard':
        h1 = rh * 0.72
        top_d = D + 0.3 - 2.6
        items = [m.frustum(cx, cy, eave, L + 0.3, D + 0.3, h1, 1.3, 1.3, ang),
                 m.frustum(cx, cy, eave + h1, L + 0.3 - 2.6, top_d, rh - h1, top_d / 2 - 0.3, top_d / 2 - 0.3, ang)]
        m.element('IfcRoof', f'{name} mansard roof', items, 'Roof', 'roof', predefined='MANSARD_ROOF',
                  object_type='Mansard roof, sheet iron', parent=asm,
                  src=('LOD2 eave and ridge heights; slopes estimated', 'Medium', 'LOD2'),
                  psets={DEMO: demo_am('Envelope > Roofs', 12, 50)})
    elif roof == 'barrel':
        half = (D + 0.3) / 2
        ts = np.linspace(0, math.pi, 25)
        prof = [(half * math.cos(t), rh * math.sin(t)) for t in ts] + \
               [((half - 0.5) * math.cos(t), (rh - 0.5) * math.sin(t)) for t in ts[::-1]]
        items = [m.extrude_vertical_profile(prof, (cx, cy, eave), b, L + 0.3), m.box(cx, cy, eave, L + 0.3, D + 0.3, 0.3, ang)]
        m.element('IfcRoof', f'{name} round roof', items, 'Roof', 'roof', predefined='BARREL_ROOF',
                  object_type='Round roof, sheet iron', parent=asm, src=('OSM roof:shape=round; LOD2 crown', 'Medium', 'OSM / LOD2'),
                  psets={DEMO: demo_am('Envelope > Roofs', 12, 50)})
    else:
        m.element('IfcRoof', f'{name} flat roof', [m.box(cx, cy, eave, L, D, 0.4, ang)], 'Roof', 'roof', predefined='FLAT_ROOF',
                  object_type='Flat roof with parapet', parent=asm, src=('LOD2', 'Medium', 'LOD2'))
        m.element('IfcMember', f'{name} parapet', [fc.box(0, -0.25, eave, Lf, 0.5, 0.9) for fc, Lf in faces.values()], 'Roof',
                  wall_mat, predefined='USERDEFINED', object_type='Parapet', parent=asm, src=('Estimated', 'Low'))
    if roof != 'flat' and dormer_sides:
        bodies, panes = [], []
        rd = 0.85 if style != 'hall' else 0.75
        ts = np.linspace(0, math.pi, 13)
        for k in dormer_sides:
            fc, Lf = faces[k]
            nb = max(1, int((Lf - 1.6) // bay))
            bw = (Lf - 1.6) / nb
            for i in range(nb):
                s = -Lf / 2 + 0.8 + bw * (i + 0.5)
                z0 = eave + 0.25
                outline = [(-rd, 0.), (rd, 0.)] + [(rd * math.cos(t), 0.45 + rd * math.sin(t)) for t in ts]
                bodies.append(fc.prof(outline, -1.05, z0, 2.2, s=s))
                r2 = rd - 0.18
                inner = [(-r2, 0.12), (r2, 0.12)] + [(r2 * math.cos(t), 0.45 + r2 * math.sin(t)) for t in ts]
                panes.append(fc.prof(inner, 0.07, z0, 0.06, s=s))
        m.element('IfcBuildingElementProxy', f'{name} dormers', bodies, 'Roof', 'render_l' if style == 'ochre' else 'copper',
                  predefined='USERDEFINED', object_type='Semicircular dormer', parent=asm,
                  src=('Photographs; one dormer per bay', 'Low', 'PHOTO'))
        m.element('IfcWindow', f'{name} dormer windows', panes, 'Roof', 'glass', predefined='LIGHTDOME',
                  object_type='Dormer window', parent=asm, src=('Photographs', 'Low', 'PHOTO'),
                  psets={'Pset_CDE_WindowRow': {'Count': len(panes), 'Shape': 'Semicircular'}})
    return asm


# Every wing is a rectangle fitted to the LOD2 roof-height raster: ENU centre, length along the grid
# axis, depth, eave and ridge in metres above the LOD2 base.
wing('West wing (Asema-aukio)', -71.75, -9.5, 113.0, 14.5, 15.5, 19.0, axis='V', style='granite', floors=2,
     note='Express-goods wing along the western tracks, shopping arcade since 2003')
wing('West platform annex', -61.6, -9.5, 113.0, 5.0, 8.0, 8.0, axis='V', style='ochre', floors=2, roof='flat',
     facades=('-b',), dormer_sides=(), note='Low range on the platform side')
wing('North pavilion (west wing)', -77.75, 55.0, 16.0, 14.5, 11.0, 14.0, axis='V', style='ochre', floors=3)
wing('West hall (Kaivokatu)', -54.0, -95.0, 51.0, 23.0, 14.5, 19.3, axis='U', style='hall', roof='barrel',
     facades=('-b', '-a'), dormer_sides=('-b',), zone='West hall', note='Departure hall and former 3rd-class restaurant')
wing('East hall (Kaivokatu)', 8.0, -95.0, 36.0, 17.0, 15.0, 19.3, axis='U', style='hall', roof='barrel',
     facades=('-b',), dormer_sides=('-b',), zone='East hall', note='Former 1st/2nd-class restaurant (Eliel hall)')
wing('Concourse range', -23.0, -73.25, 70.0, 20.5, 13.5, 14.0, axis='U', style='ochre', floors=3, roof='flat',
     facades=('+b',), note='Faces the platform concourse (laiturihalli)')
wing('Link range (tower)', 19.0, -72.25, 27.5, 14.0, 13.5, 17.0, axis='V', style='ochre', floors=3, facades=('-b', '+b'))
wing('Administration wing (Rautatientori)', 21.0, -5.75, 105.5, 21.0, 16.5, 22.0, axis='V', style='ochre', floors=4,
     note='Finnish State Railways administration, 1905-1909; Scandic Grand Central hotel since 2021')
wing('Administration south range', 46.5, 36.0, 30.0, 22.0, 17.0, 22.0, axis='U', style='ochre', floors=4)
wing('Administration east range', 70.75, 72.5, 95.0, 18.5, 17.0, 22.0, axis='V', style='ochre', floors=4)
wing('Administration west range', 15.25, 82.0, 70.0, 15.5, 17.0, 22.5, axis='V', style='ochre', floors=4)
wing('Administration north range', 42.25, 109.5, 38.5, 15.0, 17.0, 22.0, axis='U', style='ochre', floors=4)
wing('Administration courtyard range', 42.0, 92.5, 27.0, 17.0, 16.0, 21.0, axis='U', style='ochre', floors=4)
wing('Administration corner pavilion', 10.5, 104.5, 9.5, 9.5, 21.0, 27.0, axis='U', style='ochre', floors=5, dormer_sides=())

# ================================================================== main hall (Keskushalli)
HX, HY, HW, HL = -19.5, -99.0, 19.3, 36.0       # LOD2 crown band; width from OSM
HSPRING, HCROWN = 15.5, 23.6                    # LOD2 crown
hall = m.assembly('Main hall', 'Ground', object_type='Barrel-vaulted central hall (Keskushalli)',
                  psets={'Pset_CDE_Hall': {'Span_m': HW, 'Length_m': HL, 'CrownHeight_m': HCROWN, 'FloorArea_m2': 780,
                                           'Vault': 'Reinforced concrete barrel vault (Hennebique)'},
                         'Pset_CDE_Location': loc('Main hall')})
for side in (-1, 1):
    px, py = g(HX, HY, side * (HW / 2 - 0.7), 0)
    m.element('IfcWall', f'Main hall {"east" if side > 0 else "west"} wall', rbox(px, py, 0, 1.4, HL, HSPRING), 'Ground',
              'granite', predefined='SOLIDWALL', object_type='Granite-clad load-bearing wall', parent=hall,
              src=('OSM outline, LOD2 height; est. thickness', 'Medium', 'OSM / LOD2'),
              psets={DEMO: demo_am('Envelope > Walls', 60, 150, 'High')})
rise = HCROWN - HSPRING
vault = arc(HW / 2, 0, math.pi, 33, rz=rise) + arc(HW / 2 - 0.6, math.pi, 0, 33, rz=rise - 0.6)
m.element('IfcRoof', 'Main hall barrel vault', m.extrude_vertical_profile(vault, (*g(HX, HY), HSPRING), (V[1], -V[0]), HL),
          'Roof', 'roof', predefined='BARREL_ROOF', object_type='Barrel vault, sheet-iron roofing', parent=hall,
          src=('OSM outline, LOD2 crown 23.6 m', 'Medium', 'OSM / LOD2'), common={'ProjectedArea': round(HW * HL, 1)},
          psets={DEMO: demo_am('Envelope > Roofs', 12, 80, 'High')})
seams = []
for k in range(1, 12):
    t = -HL / 2 + HL * k / 12
    seam = arc(HW / 2 + 0.1, 0, math.pi, 33, rz=rise + 0.1) + arc(HW / 2 - 0.1, math.pi, 0, 33, rz=rise - 0.1)
    seams.append(m.extrude_vertical_profile(seam, (*g(HX, HY, 0, t), HSPRING), U, 0.25))
m.element('IfcMember', 'Main hall roof seams', seams, 'Roof', 'roof_seam', predefined='USERDEFINED',
          object_type='Standing seams over the vault ribs', parent=hall, src=('Aerial photograph (2013)', 'Low', 'PHOTO'))
north = arc(HW / 2, 0, math.pi, 33, rz=rise) + [(-HW / 2, -2.0), (HW / 2, -2.0)]
m.element('IfcWall', 'Main hall north gable', m.extrude_vertical_profile(north, (*g(HX, HY, 0, HL / 2 - 0.6), HSPRING), U, 1.2),
          'Roof', 'granite', predefined='SOLIDWALL', object_type='Gable wall over the concourse range', parent=hall,
          src=('Estimated', 'Low'))
m.space('Main hall', 'Keskushalli — central hall', 'Ground', m.prism(list(rrect(HX, HY, HW - 2.8, HL - 2.0).exterior.coords)[:-1], 0.2, HSPRING),
        psets={'Pset_SpaceCommon': {'IsExternal': False, 'PubliclyAccessible': True, 'Reference': 'Keskushalli'},
               'Pset_CDE_SpaceUse': {'Use': 'Concourse, ticketing, waiting'},
               'Pset_CDE_Provenance': {'GeometrySource': 'OSM part outline', 'Confidence': 'Medium'}})
for nm, (cx, cy, w, d) in [('West hall', (-52.6, -95.0, 44.0, 19.0)), ('East hall', (8.0, -95.0, 33.0, 14.0))]:
    m.space(nm, nm, 'Ground', m.prism(list(rrect(cx, cy, w, d).exterior.coords)[:-1], 0.2, 14.0),
            psets={'Pset_SpaceCommon': {'IsExternal': False, 'PubliclyAccessible': True, 'Reference': nm},
                   'Pset_CDE_Provenance': {'GeometrySource': 'LOD2 outline', 'Confidence': 'Medium'}})

# ================================================================== main entrance on Kaivokatu
# Proportions scaled from a frontal photograph against the LOD2 crown (23.6 m) and pylon tops (16 m):
# the arch gable is the hall's own south end; the pylons stand 8.5 m wide either side of it (LOD2).
front = m.assembly('Main entrance (Kaivokatu)', 'Ground', object_type='Arched main entrance', parent=hall,
                   psets={'Pset_CDE_Location': loc('Main entrance', 'South'),
                          'Pset_CDE_Provenance': {'GeometrySource': 'Frontal photograph scaled to LOD2 heights', 'Confidence': 'Medium'}})
gf = Face(*g(HX, HY, 0, -HL / 2), U, S_)         # gable face
GW, GSPR = HW, 13.0                              # gable width, springing of the outer arch
GR, GRZ = GW / 2, HCROWN - GSPR
GD = 1.8                                         # gable wall depth
gable = [(-GR, 0.), (GR, 0.)] + arc(GR, 0, math.pi, 41, cz=GSPR, rz=GRZ)
gwall = m.element('IfcWall', 'Arch gable', gf.prof(gable, -GD / 2 + 0.01, 0, GD), 'Ground', 'granite', predefined='SOLIDWALL',
                  object_type='Granite arch gable', parent=front, src=('Photograph, LOD2 crown', 'Medium', 'PHOTO / LOD2'),
                  psets={DEMO: demo_am('Envelope > Walls', 60, 150, 'High')})
N_SC = 9                                         # cusps of the scalloped rim, counted on the photograph
rim_out = [((GR + 1.45 - 0.95 * abs(math.sin(N_SC * t / 2)) ** 0.7) * math.cos(t),
            GSPR + (GRZ + 1.45 - 0.95 * abs(math.sin(N_SC * t / 2)) ** 0.7) * math.sin(t)) for t in np.linspace(0, math.pi, 109)]
rim = [(GR + 0.4, 5.6)] + rim_out + [(-GR - 0.4, 5.6), (-GR + 0.15, 5.6)] + \
      arc(GR - 0.15, math.pi, 0, 41, cz=GSPR, rz=GRZ - 0.15) + [(GR - 0.15, 5.6)]
m.element('IfcMember', 'Scalloped copper arch rim', gf.prof(rim, 0.35, 0, 0.7), 'Roof', 'copper', predefined='USERDEFINED',
          object_type='Copper rim with scalloped edge', parent=front, src=('Photograph, nine cusps counted', 'Medium', 'PHOTO'),
          psets={DEMO: demo_am('Envelope > Roofs', 12, 80, 'High')})
steps = []
for i in range(4):                               # stepped concentric archivolts inside the rim
    r0, z0 = GR - 0.35 - i * 0.42, GRZ - 0.35 - i * 0.42
    steps.append(gf.prof(ring(r0, r0 - 0.22, GSPR, 33, z0, z0 - 0.22), 0.12, 0, 0.24))
m.element('IfcMember', 'Stepped archivolts', steps, 'Ground', 'granite_d', predefined='USERDEFINED',
          object_type='Concentric stepped archivolts', parent=front, src=('Photograph', 'Medium', 'PHOTO'))
RW, RSPR = 10.3 / 2, 10.35                       # recessed arch
WW, WSPR, WBOT = 8.4 / 2, 9.5, 6.6               # window
recess = [(-RW, WBOT - 0.4), (RW, WBOT - 0.4)] + arc(RW, 0, math.pi, 33, cz=RSPR)
m.opening(gwall, gf.prof(recess, -0.45, 0, 0.92))
win_o = [(-WW, WBOT), (WW, WBOT)] + arc(WW, 0, math.pi, 33, cz=WSPR)
m.opening(gwall, gf.prof(win_o, -GD / 2, 0, GD + 0.2))
m.element('IfcMember', 'Inner archivolt', gf.prof(ring(RW, WW, RSPR, 33, RW, WW + (RSPR - WSPR)), -0.95, 0, 0.12), 'Ground',
          'granite_d', predefined='USERDEFINED', object_type='Carved inner archivolt', parent=front, src=('Photograph', 'Low', 'PHOTO'))
m.element('IfcWindow', 'Main arch window', gf.prof(win_o, -1.2, 0, 0.08), 'Ground', 'glass', predefined='WINDOW',
          object_type='Arched main window', parent=front, src=('Photograph, scaled', 'Medium', 'PHOTO'),
          psets={'Pset_CDE_Opening': {'Width_m': 2 * WW, 'SillHeight_m': WBOT, 'HeadHeight_m': WSPR + WW, 'HeadShape': 'Semicircular'},
                 DEMO: demo_am('Envelope > Windows', 12, 60, 'High')})
grid = []
for i in range(-5, 6):                           # bars every 0.84 m and 0.75 m, clipped to the arch
    s = i * (2 * WW / 10)
    top = WSPR + math.sqrt(max(WW ** 2 - s ** 2, 0))
    if top - WBOT > 0.3:
        grid.append(gf.box(s, -1.1, WBOT, 0.09, 0.1, top - WBOT))
z = WBOT
while z < WSPR + WW - 0.3:
    half = WW if z <= WSPR else math.sqrt(max(WW ** 2 - (z - WSPR) ** 2, 0))
    grid.append(gf.box(0, -1.1, z, 2 * half, 0.1, 0.09))
    z += 0.75
m.element('IfcMember', 'Arch window glazing bars', grid, 'Ground', 'frame', predefined='MULLION',
          object_type='Bronze glazing bars', parent=front, src=('Photograph: 10 x 12 grid', 'Medium', 'PHOTO'))
m.element('IfcBuildingElementProxy', 'Arch window clock', [gf.box(0, -1.0, 8.0, 1.15, 0.2, 1.15),
                                                          gf.prof(arc(0.45, 0, 2 * math.pi, 25), -0.86, 8.575, 0.05)],
          'Ground', 'frame_d', predefined='USERDEFINED', object_type='Clock in the arch window', parent=front,
          src=('Photograph', 'Medium', 'PHOTO'))
CW = GW + 6.0
m.element('IfcRoof', 'Entrance canopy', [gf.box(0, 1.6, 5.0, CW, 3.2, 0.25), gf.box(0, 3.1, 4.75, CW, 0.2, 0.85)], 'Ground',
          'copper', predefined='FLAT_ROOF', object_type='Copper entrance canopy', parent=front,
          src=('Photograph', 'Medium', 'PHOTO'), psets={DEMO: demo_am('Envelope > Canopies', 12, 60)})
m.element('IfcBuildingElementProxy', 'Station name lettering', [gf.box(s, 2.9, 5.25, 0.62, 0.08, 0.8) for s in
                                                               np.linspace(-CW / 2 + 1.5, CW / 2 - 1.5, 28) if abs(s) > 0.6],
          'Ground', 'sign', predefined='USERDEFINED', object_type='Station name sign', parent=front,
          src=('Photograph', 'High', 'PHOTO'), psets={'Pset_CDE_Sign': {'Text': 'RAUTATIEASEMA  JÄRNVÄGSSTATION'}})
for k, s in enumerate(np.linspace(-6.6, 6.6, 4)):
    m.element('IfcDoor', f'Main entrance door {k + 1}', gf.box(s, 0.05, 0, 2.6, 0.12, 3.9), 'Ground', 'door',
              predefined='DOOR', object_type='Oak doors with bronze roundels', parent=front,
              src=('Photograph', 'Medium', 'PHOTO'), common={'FireExit': True},
              psets={'Pset_CDE_Opening': {'Width_m': 2.6, 'Height_m': 3.9}, DEMO: demo_am('Envelope > Doors', 6, 40, 'High')})

# fluted pylons and the Lamp Bearers: four casts of one plaster model, the lower part a stylised pier (FIWP)
PW, PD, PH = 8.5, 13.0, 15.6
ped_items, flute_items, cap_items, louvre_items = [], [], [], []
for side, nm in ((-1, 'West'), (1, 'East')):
    pf = Face(*gf.p(side * (GW / 2 + PW / 2), 2.5), U, S_)          # pylon front, 2.5 m proud of the gable
    m.element('IfcWall', f'{nm} entrance pylon', pf.box(0, -PD / 2, 0, PW, PD, PH), 'Ground', 'granite',
              predefined='SOLIDWALL', object_type='Fluted granite pylon', parent=front,
              src=('LOD2 8.5 x 16 m blocks either side of the gable', 'High', 'LOD2'),
              psets={DEMO: demo_am('Envelope > Walls', 60, 150, 'High')})
    for s in np.arange(-PW / 2 + 0.45, PW / 2 - 0.3, 0.62):
        flute_items.append(pf.cyl(s, 0.0, 2.6, 0.2, PH - 3.4))
    sf = Face(*pf.p(side * PW / 2, -PD / 2), S_, (U[0] * side, U[1] * side))
    for s in np.arange(-PD / 2 + 0.6, PD / 2 - 0.4, 0.62):
        flute_items.append(sf.cyl(s, 0.0, 2.6, 0.2, PH - 3.4))
    cap_items += [pf.box(0, -PD / 2, PH, PW + 0.6, PD + 0.6, 0.45), pf.box(0, -PD / 2, PH + 0.45, PW - 1.2, PD - 1.2, 1.9),
                  pf.box(0, -PD / 2, PH + 2.35, PW - 0.6, PD - 0.6, 0.4), pf.box(0, -PD / 2, PH + 2.75, PW - 2.6, PD - 2.6, 0.5)]
    for z_ in np.arange(PH + 0.65, PH + 2.25, 0.32):
        louvre_items.append(pf.box(0, -0.62, z_, PW - 1.6, 0.12, 0.08))
    ped_items.append(pf.box(0, 0.8, 0, PW, 1.6, 2.4))
    for k, ss in enumerate((-1.95, 1.95)):
        ped_items.append(pf.box(ss, 0.85, 2.4, 1.6, 1.7, 6.0))
        for rr in (-0.5, 0.0, 0.5):
            ped_items.append(pf.box(ss + rr, 1.75, 2.6, 0.22, 0.12, 5.6))
        bx, by = pf.p(ss, 1.05)
        zb, ang = 8.4, pf.ang
        # The figure as a herm: the pier runs into the waist, the torso widens to broad shoulders, the
        # long hair falls behind the head and both forearms reach forward to carry the lamp (PHOTO).
        fig = [m.frustum(bx, by, zb, 1.5, 1.15, 1.7, -0.5, -0.12, ang),          # waist widening to the chest
               m.box(bx, by, zb + 1.7, 2.5, 1.4, 0.95, ang),                     # chest and shoulders
               m.frustum(bx, by, zb + 2.65, 2.5, 1.4, 0.45, 0.6, 0.25, ang),     # shoulder slope
               m.cylinder(bx, by, zb + 2.95, 0.38, 0.4),                         # neck
               m.box(*pf.p(ss, 1.1), zb + 3.3, 0.92, 1.0, 1.3, ang),             # head
               m.box(*pf.p(ss, 1.62), zb + 4.0, 0.42, 0.25, 0.22, ang),          # brow and nose
               m.frustum(*pf.p(ss, 0.75), zb + 2.35, 1.5, 0.9, 2.35, 0.16, 0.08, ang)]  # hair to the shoulders
        for arm in (-1, 1):
            fig.append(m.box(*pf.p(ss + arm * 1.05, 1.0), zb + 1.0, 0.5, 0.9, 1.5, ang))   # upper arms
            fig.append(m.box(*pf.p(ss + arm * 0.62, 1.75), zb + 0.95, 0.48, 1.3, 0.48, ang))  # forearms
        lx, ly = pf.p(ss + (0.55 if side < 0 else -0.55), 2.45)
        m.element('IfcFurnishingElement', f'Lamp Bearer {nm.lower()} {k + 1}', fig, 'Ground', 'statue',
                  object_type='Lyhdynkantaja — granite figure', parent=front,
                  src=('Photographs; figure simplified to about 4.6 m', 'Low', 'PHOTO'),
                  psets={'Pset_CDE_Artwork': {'Title': 'Lyhdynkantajat (Lamp Bearers)', 'Sculptor': 'Emil Wikström',
                                              'Year': 1914, 'Material': 'Hanko red granite', 'Pair': nm,
                                              'Note': 'Four casts of one plaster model; LED lamps since 2013',
                                              'Collection': 'HAM Helsinki Art Museum, public art'},
                         'Pset_CDE_Location': loc('Main entrance', 'South'),
                         DEMO: demo_am('Art > Sculpture', 12, 150, 'High')})
        m.element('IfcLightFixture', f'Lamp Bearer {nm.lower()} {k + 1} lamp', m.sphere(lx, ly, zb + 1.25, 0.78),
                  'Ground', 'lamp', predefined='NOTDEFINED', object_type='Spherical opal-glass lamp', parent=front,
                  src=('Photographs', 'Medium', 'PHOTO'), psets={DEMO: demo_am('Systems > Lighting', 12, 20)})
m.element('IfcCovering', 'Pylon flutes', flute_items, 'Ground', 'granite', predefined='CLADDING',
          object_type='Vertical granite flutes', parent=front, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcBuildingElementProxy', 'Lamp Bearer piers', ped_items, 'Ground', 'granite_d', predefined='USERDEFINED',
          object_type='Granite plinths and stylised piers', parent=front, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcRoof', 'Pylon copper lanterns', cap_items, 'Roof', 'copper', predefined='FLAT_ROOF',
          object_type='Stepped copper cap with louvred lantern', parent=front, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcMember', 'Pylon lantern louvres', louvre_items, 'Roof', 'roof_seam', predefined='USERDEFINED',
          object_type='Ventilation louvres', parent=front, src=('Photograph', 'Low', 'PHOTO'))

# ================================================================== clock tower
TX, TY, TS = 31.2, -81.7, 10.2           # OSM centre (ENU) and footprint
SH = 31.0                                # balcony level: top of the granite shaft between the piers
CS_ = 7.4                                # copper clock stage
CZ = 40.0                                # clock centre
tower = m.assembly('Clock tower', 'Ground', object_type='Granite clock tower',
                   psets={'Pset_CDE_Tower': {'Height_m': 48.5, 'ClockFaces': 4, 'ClockDiameter_m': 3.0, 'Balconies': 4,
                                             'Steps': 250, 'DomeBaseDiameter_m': 4.5, 'Cladding': 'About 3600 Hanko granite blocks'},
                          'Pset_CDE_Location': loc('Clock tower', 'East'), 'Pset_CDE_Provenance':
                              {'GeometrySource': 'OSM footprint; LOD2 stages; FIWP figures; details from photographs', 'Confidence': 'Medium'}})
m.element('IfcWall', 'Clock tower shaft', rbox(TX, TY, 0, TS - 0.8, TS - 0.8, SH), 'Ground', 'granite', predefined='SOLIDWALL',
          object_type='Brick shaft clad in Hanko granite', parent=tower, src=('OSM footprint', 'Medium', 'OSM'),
          psets={DEMO: demo_am('Structure > Tower', 24, 200, 'High')})
piers, pier_caps, parapets, slits, panes = [], [], [], [], []
for cs in (-1, 1):
    for ct in (-1, 1):
        px, py = g(TX, TY, cs * (TS / 2 - 1.3), ct * (TS / 2 - 1.3))
        piers.append(rbox(px, py, 0, 2.6, 2.6, 35.2))
        pier_caps += [rbox(px, py, 35.2, 2.9, 2.9, 0.35), rbox(px, py, 35.55, 2.4, 2.4, 1.6), rbox(px, py, 37.15, 2.0, 2.0, 0.3),
                      m.revolve(m.dome_profile(0.95, 0.85, n=8), px, py, 37.45)]
for side, fc in compass(TX, TY, TS / 2 - 0.4):
    parapets.append(fc.box(0, 0.0, SH, TS - 5.2, 0.6, 2.7))           # balcony parapet between the piers
    for s in np.linspace(-1.6, 1.6, 6):
        slits.append(fc.box(s, 0.31, SH + 0.5, 0.2, 0.03, 1.9))        # its slits
    for zz in (6.0, 13.0, 20.0, 26.5):
        panes.append(fc.box(0, 0.02, zz, 0.9, 0.05, 1.5))
m.element('IfcColumn', 'Clock tower corner piers', piers, 'Ground', 'granite', predefined='PILASTER',
          object_type='Corner piers', parent=tower, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcRailing', 'Clock tower balcony parapets', parapets, 'Tower', 'granite', predefined='BALUSTRADE',
          object_type='Granite balcony parapet', parent=tower, src=('Photograph; four balconies (FIWP)', 'Medium', 'PHOTO'))
m.element('IfcMember', 'Clock tower parapet slits', slits, 'Tower', 'frame_d', predefined='USERDEFINED',
          object_type='Vertical slits', parent=tower, src=('Photograph', 'Low', 'PHOTO'))
m.element('IfcWindow', 'Clock tower windows', panes, 'Ground', 'glass', predefined='WINDOW', object_type='Stair windows',
          parent=tower, src=('Photograph', 'Low', 'PHOTO'))
m.element('IfcRoof', 'Corner pier copper caps', pier_caps, 'Tower', 'copper', predefined='DOME_ROOF',
          object_type='Copper caps with small domes', parent=tower, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcWall', 'Clock stage', [rbox(TX, TY, SH, CS_, CS_, 12.1)], 'Tower', 'copper', predefined='SOLIDWALL',
          object_type='Copper-clad clock stage', parent=tower, src=('LOD2 8.3 x 8.9 m at 32-44 m; photograph', 'High', 'LOD2 / PHOTO'))
m.element('IfcBeam', 'Clock stage cornice', [rbox(TX, TY, SH + 12.1, CS_ + 0.9, CS_ + 0.9, 0.45),
                                             rbox(TX, TY, SH + 12.55, CS_ + 0.2, CS_ + 0.2, 0.45),
                                             m.frustum(TX, TY, SH + 13.0, CS_ - 0.4, CS_ - 0.4, 0.6, 1.0, 1.0, ROT)],
          'Tower', 'copper', predefined='USERDEFINED', object_type='Stepped copper cornice', parent=tower, src=('Photograph', 'Medium', 'PHOTO'))
ribs_t, doors_t, clocks_t = [], [], []
for side, fc in compass(TX, TY, CS_ / 2):
    for s in (-3.1, 3.1):
        ribs_t.append(fc.box(s, 0.1, SH, 0.45, 0.2, 12.1))
    for s in (-1.9, 1.9):
        ribs_t.append(fc.box(s, 0.06, SH + 2.6, 0.25, 0.12, 5.0))
    door = [(-0.75, 0), (0.75, 0)] + arc(0.75, 0, math.pi, 13, cz=2.0)
    ribs_t.append(fc.prof([(-1.15, 0), (1.15, 0)] + arc(1.15, 0, math.pi, 13, cz=2.0), 0.06, SH, 0.12))
    doors_t.append(fc.prof(door, 0.14, SH, 0.06))
m.element('IfcMember', 'Clock stage ribs', ribs_t, 'Tower', 'copper', predefined='USERDEFINED',
          object_type='Vertical copper ribs and door surrounds', parent=tower, src=('Photograph', 'Low', 'PHOTO'))
m.element('IfcDoor', 'Clock tower balcony doors', doors_t, 'Tower', 'frame_d', predefined='DOOR',
          object_type='Balcony doors', parent=tower, src=('Photograph; four balconies (FIWP)', 'Medium', 'PHOTO'))
DOME_Z = SH + 13.6
m.element('IfcRoof', 'Tower copper crown', [m.revolve([(0, 0), (2.9, 0), (2.9, 0.5), (2.25, 0.7), (2.25, 1.1), (2.05, 2.0),
                                                      (1.6, 2.7), (0.95, 3.15), (0.35, 3.3), (0, 3.3)], TX, TY, DOME_Z),
                                           m.revolve([(2.2, 0.35), (2.75, 0.35), (2.75, 1.0), (2.2, 1.0)], TX, TY, DOME_Z)],
          'Tower', 'copper', predefined='DOME_ROOF', object_type='Copper dome (4.5 m at the base) with garland', parent=tower,
          src=('FIWP 4.5 m dome; LOD2 top', 'Medium', 'FIWP / LOD2'), psets={DEMO: demo_am('Envelope > Roofs', 12, 80, 'High')})
fin = [m.cylinder(TX, TY, DOME_Z + 3.3, 0.12, 0.9), m.sphere(TX, TY, DOME_Z + 4.55, 0.42, n=8)]
for k in range(4):                                                    # four winged wheels carrying the sphere (FIWP)
    a_ = ROT + k * math.pi / 2
    fin.append(m.box(TX + 0.45 * math.cos(a_), TY + 0.45 * math.sin(a_), DOME_Z + 3.6, 0.9, 0.06, 0.6, a_))
m.element('IfcBuildingElementProxy', 'Tower finial', fin, 'Tower', 'copper', predefined='USERDEFINED',
          object_type='Sphere on four winged wheels', parent=tower, src=('FIWP description; size estimated', 'Low', 'FIWP'))
hands_items = []
for side, fc in compass(TX, TY, CS_ / 2):
    clocks_t.append(fc.prof(arc(1.5, 0, 2 * math.pi, 33), 0.12, CZ, 0.22))
    m.element('IfcBuildingElementProxy', f'Tower clock {side}', fc.prof(arc(1.5, 0, 2 * math.pi, 33), 0.12, CZ, 0.22),
              'Tower', 'clock', predefined='USERDEFINED', object_type='Clock face', parent=tower,
              src=('Diameter 3.0 m (FIWP, paarautatieasema.fi)', 'High', 'WEB'),
              psets={'Pset_CDE_Clock': {'Diameter_m': 3.0, 'HourHand_m': 1.19, 'MinuteHand_m': 1.50, 'Facing': side},
                     'Pset_CDE_Location': loc('Clock tower', side, 'Tower'),
                     DEMO: demo_am('Systems > Clocks', 6, 25, 'High')})
    hands_items += [fc.prof([(-0.07, -0.1), (0.07, -0.1), (0.04, 1.19), (-0.04, 1.19)], 0.26, CZ, 0.05),
                    fc.prof([(-0.1, -0.05), (1.45, -0.03), (1.45, 0.03), (-0.1, 0.05)], 0.29, CZ, 0.05)]
    hands_items += [fc.box(1.25 * math.cos(a_), 0.25, CZ + 1.25 * math.sin(a_) - 0.12, 0.1, 0.04, 0.24)
                    for a_ in np.linspace(0, 2 * math.pi, 13)[:-1]]
m.element('IfcBuildingElementProxy', 'Tower clock hands', hands_items, 'Tower', 'hands', predefined='USERDEFINED',
          object_type='Clock hands and hour marks', parent=tower, src=('FIWP hand lengths; photograph', 'Medium', 'FIWP'))

# ================================================================== west entrance on Asema-aukio
wcx, wcy, wL, wD, wH = -67.5, -74.0, 24.0, 19.0, 21.0
went = m.assembly('West entrance (Asema-aukio)', 'Ground', object_type='Arched west entrance',
                  psets={'Pset_CDE_Location': loc('West entrance', 'West'),
                         'Pset_CDE_Provenance': {'GeometrySource': 'LOD2 21 m block; photograph from Asema-aukio', 'Confidence': 'Medium'}})
wf = Face(*g(wcx, wcy, -wL / 2, 0), S_, (-U[0], -U[1]))              # west face
wblock = m.element('IfcWall', 'West entrance block', rbox(wcx, wcy, 0, wL, wD, wH), 'Ground', 'granite', predefined='SOLIDWALL',
                   object_type='Flat-topped granite entrance block', parent=went, src=('LOD2', 'High', 'LOD2'),
                   psets={DEMO: demo_am('Envelope > Walls', 60, 150, 'High')})
m.element('IfcRoof', 'West entrance copper coping', [rbox(wcx, wcy, wH, wL + 0.6, wD + 0.6, 0.5), rbox(wcx, wcy, wH + 0.5, wL - 0.4, wD - 0.4, 0.3)],
          'Roof', 'copper', predefined='FLAT_ROOF', object_type='Copper coping', parent=went, src=('Photograph', 'Medium', 'PHOTO'))
WR, WSP = 4.6, 10.0
m.element('IfcMember', 'West entrance archivolt', wf.prof(ring(WR + 1.3, WR, WSP, 29), 0.15, 0, 0.3), 'Ground', 'granite_d',
          predefined='USERDEFINED', object_type='Granite archivolt', parent=went, src=('Photograph', 'Medium', 'PHOTO'))
wwin = [(-WR, 6.0), (WR, 6.0)] + arc(WR, 0, math.pi, 29, cz=WSP)
m.opening(wblock, wf.prof(wwin, -0.6, 0, 1.25))
m.element('IfcWindow', 'West entrance arch window', wf.prof(wwin, -1.1, 0, 0.08), 'Ground', 'glass', predefined='WINDOW',
          object_type='Arched window', parent=went, src=('Photograph', 'Medium', 'PHOTO'),
          psets={'Pset_CDE_Opening': {'Width_m': 2 * WR, 'HeadHeight_m': WSP + WR}})
wgrid = [wf.box(s, -1.0, 6.0, 0.09, 0.1, WSP + math.sqrt(max(WR ** 2 - s ** 2, 0)) - 6.0) for s in np.linspace(-WR + 0.77, WR - 0.77, 11)]
wgrid += [wf.box(0, -1.0, zz, 2 * (WR if zz <= WSP else math.sqrt(max(WR ** 2 - (zz - WSP) ** 2, 0))), 0.1, 0.09)
          for zz in np.arange(6.75, WSP + WR - 0.4, 0.75)]
m.element('IfcMember', 'West arch glazing bars', wgrid, 'Ground', 'frame', predefined='MULLION', object_type='Glazing bars',
          parent=went, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcRoof', 'West entrance canopy', [wf.box(0, 1.5, 4.7, 17.0, 3.0, 0.25), wf.box(0, 2.95, 4.45, 17.0, 0.2, 0.8)], 'Ground',
          'copper', predefined='FLAT_ROOF', object_type='Copper entrance canopy', parent=went, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcBuildingElementProxy', 'West entrance lettering', [wf.box(s, 2.8, 4.95, 0.5, 0.08, 0.65) for s in np.linspace(-7, 7, 24)
                                                                if abs(s) > 0.5], 'Ground', 'sign', predefined='USERDEFINED',
          object_type='Station name sign', parent=went, src=('Photograph', 'High', 'PHOTO'),
          psets={'Pset_CDE_Sign': {'Text': 'RAUTATIEASEMA  JÄRNVÄGSSTATION'}})
for k, s in enumerate((-4.2, -1.4, 1.4, 4.2)):
    m.element('IfcDoor', f'West entrance door {k + 1}', wf.box(s, 0.05, 0, 2.3, 0.12, 3.6), 'Ground', 'door', predefined='DOOR',
              object_type='Oak doors', parent=went, src=('Photograph', 'Medium', 'PHOTO'), common={'FireExit': True})
wp_items, wp_caps = [], []
for s in (-11.0, 11.0):                                               # round-cornered pylons with copper caps
    wp_items += [wf.cyl(s, 0.4, 0, 2.3, 15.4), wf.box(s, -1.2, 0, 4.6, 3.2, 15.4)]
    wp_caps += [wf.cyl(s, 0.4, 15.4, 2.55, 0.4), wf.cyl(s, 0.4, 15.8, 2.3, 1.5), wf.cyl(s, 0.4, 17.3, 2.0, 0.35)]
m.element('IfcColumn', 'West entrance pylons', wp_items, 'Ground', 'granite', predefined='PILASTER', object_type='Round pylons',
          parent=went, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcRoof', 'West pylon copper caps', wp_caps, 'Roof', 'copper', predefined='DOME_ROOF', object_type='Copper caps',
          parent=went, src=('Photograph', 'Medium', 'PHOTO'))

# ================================================================== east entrance on Rautatientori
# The east departure hall stands about 1.5 m above the square, hence the wide steps (FIWP).
ecx, ecy, eL, eD, eH = 32.75, -95.0, 13.5, 17.0, 18.5
eent = m.assembly('East entrance (Rautatientori)', 'Ground', object_type='Colonnaded east entrance',
                  psets={'Pset_CDE_Location': loc('East entrance', 'East'),
                         'Pset_CDE_Provenance': {'GeometrySource': 'LOD2 block; photograph from Rautatientori', 'Confidence': 'Medium'}})
ef = Face(*g(ecx, ecy, eL / 2, 0), V, U)
m.element('IfcWall', 'East entrance block', rbox(ecx, ecy, 0, eL, eD, eH), 'Ground', 'granite', predefined='SOLIDWALL',
          object_type='Granite entrance block', parent=eent, src=('LOD2', 'High', 'LOD2'))
m.element('IfcRoof', 'East entrance copper coping', rbox(ecx, ecy, eH, eL + 0.6, eD + 0.6, 0.5), 'Roof', 'copper',
          predefined='FLAT_ROOF', object_type='Copper coping', parent=eent, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcColumn', 'East entrance colonnade', [ef.cyl(s, 0.35, 2.2, 0.62, 11.8) for s in np.linspace(-6.4, 6.4, 6)], 'Ground',
          'granite', predefined='COLUMN', object_type='Engaged granite columns', parent=eent, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcWindow', 'East entrance windows', [ef.box(s, 0.03, 4.8, 1.5, 0.06, 8.2) for s in np.linspace(-5.12, 5.12, 5)],
          'Ground', 'glass', predefined='WINDOW', object_type='Tall windows between the columns', parent=eent,
          src=('Photograph', 'Low', 'PHOTO'))
m.element('IfcDoor', 'East entrance doors', [ef.box(s, 0.05, 1.5, 1.5, 0.12, 3.0) for s in (-2.56, 0.0, 2.56)], 'Ground', 'door',
          predefined='DOOR', object_type='Oak doors', parent=eent, src=('Photograph', 'Medium', 'PHOTO'))
m.element('IfcSlab', 'East entrance landing', ef.box(0, 1.2, 0, 15.0, 2.4, 1.5), 'Ground', 'granite_d', predefined='LANDING',
          object_type='Granite landing 1.5 m above the square', parent=eent, src=('FIWP', 'Medium', 'FIWP'))
m.element('IfcStairFlight', 'East entrance steps', [ef.box(0, 2.4 + 0.2 + 0.4 * (8 - i) / 2, i * 0.1875, 15.0, 0.4 * (8 - i), 0.1875)
                                                    for i in range(8)], 'Ground', 'granite_d', predefined='STRAIGHT',
          object_type='Granite steps to Rautatientori', parent=eent, src=('Photograph', 'Medium', 'PHOTO'),
          common={'NumberOfRiser': 8, 'RiserHeight': 0.1875, 'TreadLength': 0.4})

# ================================================================== platforms, tracks and roofs (OSM, ODbL)
# The 19 platforms (railway=platform, "Laituri 1-19"), the tracks (railway=rail, 1524 mm gauge) and the
# glass-and-steel roof over the platform heads (building=roof, min_height 10; Esa Piironen, 2001),
# © OpenStreetMap contributors, ODbL. Canopy extent along each platform is estimated. Local coordinates:
# EPSG:3879 relative to the model origin, as the site's IfcMapConversion states.
m.material('platform', 'Concrete platform', (0.66, 0.65, 0.62), 'Concrete', 2400)
m.material('platform_edge', 'Light granite platform edge', (0.86, 0.84, 0.76), 'Stone', 2700)
m.material('canopy', 'Platform canopy, sheet roofing', (0.30, 0.33, 0.36), 'Metal', None, 'Profiled sheet on steel purlins')
m.material('canopy_steel', 'Painted structural steel', (0.18, 0.20, 0.22), 'Metal', 7850)
m.material('hall_roof', 'Toughened glass roof', (0.72, 0.80, 0.84), 'Glass', 2500, transparency=0.55)
m.material('ballast', 'Track ballast', (0.43, 0.40, 0.37), 'Stone', 1700)
m.material('rail', 'Rail steel', (0.56, 0.54, 0.51), 'Metal', 7850)
PLATFORM_H = 0.55
CANOPY_Z = 5.2
CANOPY_END_Y = 235.0
COLUMN_STEP = 12.0
_to_grid = Transformer.from_crs(4326, 3879, always_xy=True)
_e0, _n0 = _to_grid.transform(LON, LAT)


def _local(p):
    e, n = _to_grid.transform(p['lon'], p['lat'])
    return (e - _e0, n - _n0)


def _pts(poly):
    return [(float(x), float(y)) for x, y in list(poly.exterior.coords)[:-1]]


def _parts(geom):
    return [geom] if geom.geom_type in ('Polygon', 'LineString') else list(getattr(geom, 'geoms', []))


osm = json.load(open(os.path.join(HERE, 'station_osm_platforms.json')))
platforms = m.assembly('Platforms and canopies', 'Ground', object_type='Platform area',
                       psets={'Pset_CDE_Provenance': {'GeometrySource': 'OpenStreetMap railway=platform (ODbL)',
                                                      'Confidence': 'Medium',
                                                      'Note': 'Canopy extent along the platforms is estimated'}})
n_plat = n_col = 0
for e in osm['elements']:
    t = e.get('tags', {})
    if t.get('railway') != 'platform' or not str(t.get('ref', '')).isdigit():
        continue
    poly = Polygon([_local(p) for p in e['geometry']]).buffer(0)
    if poly.is_empty or poly.area < 50:
        continue
    ref = int(t['ref'])
    inner = poly.buffer(-0.7, join_style=2)
    m.element('IfcSlab', f'Platform {ref}', m.prism(_pts(poly), 0, PLATFORM_H - 0.04), 'Ground', 'platform', predefined='FLOOR',
              object_type='Railway platform', parent=platforms, src=('OpenStreetMap railway=platform (ODbL)', 'Medium'),
              psets={'Pset_CDE_Platform': {'PlatformNumber': ref, 'Name': t.get('name', f'Laituri {ref}'),
                                           'Length_m': round(poly.minimum_rotated_rectangle.length / 2, 1)}})
    if inner.geom_type == 'Polygon' and not inner.is_empty:
        m.element('IfcCovering', f'Platform {ref} edge', m.prism_holes(_pts(poly.simplify(0.2)), [_pts(inner.simplify(0.2))],
                                                                         PLATFORM_H - 0.04, 0.04),
                  'Ground', 'platform_edge', predefined='FLOORING', object_type='Platform edge band', parent=platforms,
                  src=('Edge band 0.7 m, estimated', 'Low'))
        m.element('IfcCovering', f'Platform {ref} surface', m.prism(_pts(inner), PLATFORM_H - 0.04, 0.03), 'Ground', 'platform',
                  predefined='FLOORING', object_type='Platform surface', parent=platforms, src=('OSM', 'Medium'))
    n_plat += 1
    roof = poly.intersection(sbox(-1e4, -1e4, 1e4, CANOPY_END_Y)).buffer(0.8, join_style=2)
    if roof.is_empty or roof.area < 30:
        continue
    for r in _parts(roof):
        rp = _pts(r.simplify(0.3))
        rin = r.buffer(-0.35, join_style=2)
        m.element('IfcRoof', f'Platform {ref} canopy', m.prism(rp, CANOPY_Z + 0.3, 0.18), 'Ground', 'canopy',
                  predefined='FLAT_ROOF', object_type='Platform canopy', parent=platforms,
                  src=('OpenStreetMap platform outline; canopy extent estimated', 'Low'))
        if rin.geom_type == 'Polygon' and not rin.is_empty:
            m.element('IfcMember', f'Platform {ref} canopy fascia', m.prism_holes(rp, [_pts(rin.simplify(0.3))], CANOPY_Z + 0.05, 0.5),
                      'Ground', 'canopy_steel', predefined='USERDEFINED', object_type='Canopy edge fascia', parent=platforms,
                      src=('Estimated', 'Low'))
        rect = list(r.minimum_rotated_rectangle.exterior.coords)[:4]
        a, b, c = rect[0], rect[1], rect[2]
        (p0, p1), (q0, q1) = ((a, b), (b, c)) if math.dist(a, b) >= math.dist(b, c) else ((b, c), (a, b))
        start = (p0[0] + (q1[0] - q0[0]) / 2, p0[1] + (q1[1] - q0[1]) / 2)
        length, width = math.dist(p0, p1), math.dist(q0, q1)
        ux, uy = (p1[0] - p0[0]) / length, (p1[1] - p0[1]) / length
        ang = math.atan2(uy, ux)
        steel = [m.box(start[0] + ux * length / 2, start[1] + uy * length / 2, CANOPY_Z - 0.35, length - 1.0, 0.35, 0.6, ang)]
        k = 1
        while k * COLUMN_STEP < length - 2:
            cx, cy = start[0] + ux * k * COLUMN_STEP, start[1] + uy * k * COLUMN_STEP
            steel += [m.box(cx, cy, PLATFORM_H, 0.32, 0.32, CANOPY_Z - 0.35 - PLATFORM_H, ang),
                      m.box(cx, cy, CANOPY_Z - 0.1, 0.3, width - 0.6, 0.4, ang)]          # cantilever cross beam
            n_col += 1; k += 1
        m.element('IfcColumn', f'Platform {ref} canopy structure', steel, 'Ground', 'canopy_steel',
                  predefined='COLUMN', object_type='Canopy columns, spine and cross beams', parent=platforms,
                  src=('Spacing 12 m, estimated', 'Low'))
for e in osm['elements']:
    t = e.get('tags', {})
    if not (t.get('building') == 'roof' and t.get('min_height') == '10'):
        continue
    poly = Polygon([_local(p) for p in e['geometry']]).buffer(0)
    m.element('IfcRoof', 'Platform head roof', m.prism(_pts(poly.simplify(0.3)), 10.3, 0.12), 'Ground', 'hall_roof',
              predefined='FLAT_ROOF', object_type='Glass-and-steel roof over the platform heads (2001)', parent=platforms,
              src=('OpenStreetMap building=roof, min_height 10 (ODbL)', 'Medium'),
              psets={'Pset_CDE_Heritage': {'Architect': 'Esa Piironen', 'Completed': 2001, 'CoveredLength_m': 165}})
    x0, y0, x1, y1 = poly.bounds
    lattice, cols = [], []
    for xx in np.arange(x0 + 3, x1, 6.0):
        for sg in _parts(poly.intersection(LineString([(xx, y0 - 1), (xx, y1 + 1)]))):
            if sg.length > 2:
                (ax_, ay_), (bx_, by_) = sg.coords[0], sg.coords[-1]
                lattice.append(m.box((ax_ + bx_) / 2, (ay_ + by_) / 2, 9.7, 0.25, sg.length, 0.6, 0))
    for yy in np.arange(y0 + 3, y1, 6.0):
        for sg in _parts(poly.intersection(LineString([(x0 - 1, yy), (x1 + 1, yy)]))):
            if sg.length > 2:
                (ax_, ay_), (bx_, by_) = sg.coords[0], sg.coords[-1]
                lattice.append(m.box((ax_ + bx_) / 2, (ay_ + by_) / 2, 10.0, sg.length, 0.2, 0.3, 0))
    core = poly.buffer(-2.0)
    for xx in np.arange(x0 + 9, x1, 18.0):
        for yy in np.arange(y0 + 9, y1, 18.0):
            if core.contains(Point(xx, yy)):
                cols.append(poly_col(xx, yy, 0, 0.3, 9.7, 8))
    if lattice:
        m.element('IfcMember', 'Platform head roof lattice', lattice, 'Ground', 'canopy_steel', predefined='USERDEFINED',
                  object_type='Steel roof lattice', parent=platforms, src=('Photograph; 6 m grid estimated', 'Low', 'PHOTO'))
    if cols:
        m.element('IfcColumn', 'Platform head roof columns', cols, 'Ground', 'canopy_steel', predefined='COLUMN',
                  object_type='Steel columns', parent=platforms, src=('Photograph; 18 m grid estimated', 'Low', 'PHOTO'))

tracks = m.assembly('Tracks', 'Ground', object_type='Station tracks',
                    psets={'Pset_CDE_Provenance': {'GeometrySource': 'OpenStreetMap railway=rail (ODbL)', 'Confidence': 'Medium',
                                                   'Note': 'Rails as 72 mm strips at 1524 mm gauge; sleepers not modelled'}})
area = sbox(-130, -70, 160, 520)
n_tr = 0
for e in osm['elements']:
    t = e.get('tags', {})
    if t.get('railway') != 'rail':
        continue
    for ln in _parts(LineString([_local(p) for p in e['geometry']]).intersection(area)):
        if ln.is_empty or ln.geom_type != 'LineString' or ln.length < 8:
            continue
        bed = ln.buffer(1.6, cap_style=2, join_style=2)
        if bed.geom_type != 'Polygon':
            continue
        n_tr += 1
        rails = []
        for off in (-0.798, 0.798):
            for r_ in _parts(ln.offset_curve(off)):
                if r_.geom_type == 'LineString' and r_.length > 2:
                    rp = r_.buffer(0.036, cap_style=2, join_style=2)
                    if rp.geom_type == 'Polygon':
                        rails.append(m.prism(_pts(rp.simplify(0.01)), 0.18, 0.17))
        m.element('IfcBuildingElementProxy', f'Track bed {n_tr:03d}', m.prism(_pts(bed.simplify(0.1)), 0, 0.18), 'Ground', 'ballast',
                  predefined='USERDEFINED', object_type='Track ballast bed', parent=tracks,
                  src=('OpenStreetMap railway=rail (ODbL)', 'Medium'),
                  psets={'Pset_CDE_Track': {'OsmWay': e.get('id'), 'Length_m': round(ln.length, 1), 'Gauge_mm': 1524}})
        if rails:
            m.element('IfcBuildingElementProxy', f'Track rails {n_tr:03d}', rails, 'Ground', 'rail', predefined='USERDEFINED',
                      object_type='Rail pair', parent=tracks, src=('OpenStreetMap railway=rail (ODbL)', 'Medium'))
print('platforms', n_plat, 'canopy columns', n_col, 'tracks', n_tr)

out = sys.argv[1] if len(sys.argv) > 1 else 'helsinki-central-station.ifc'
m.finish(out)
print('written', out, len(m.f.by_type('IfcProduct')), 'products')
