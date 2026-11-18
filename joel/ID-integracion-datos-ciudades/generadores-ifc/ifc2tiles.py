"""IFC -> single-tile OGC 3D Tiles 1.0 (b3dm) + a static, Fusion-shaped WFS of its element tree.

usage: ifc2tiles.py <in.ifc> <tiles_outdir> <lat> <lon> <height_m> <heading_deg> [--keep-origin]
                    [--wfs <wfs_outdir> --wfs-name <typeName>] [--extras <json>]

--crs <EPSG:code> says the IFC's world coordinates are in that projected CRS (e.g. EPSG:25831, a civil
project drawn in ETRS89 / UTM 31N with orthometric z): every vertex is reprojected to the local east/north/up
frame at <lat> <lon>, so grid convergence and scale factor are handled exactly; pass heading 0 and the height
the z values are relative to (0 for absolute z).

--skip-name <regex> leaves out every element whose Name matches (origin markers, a terrain surface the viewer
already draws). --drop-below <z> drops every triangle with a vertex under that z (in the IFC's own units): exporters
sometimes leave stray vertices at the coordinate origin, which draw as spikes hundreds of metres long.

--extras merges a JSON object into the tileset's `extras` (3D Tiles allows application data there): e.g. the
mesh cut-outs a landmark script writes (`cdeMeshCutouts`, read by CDE-Frontend).

Tiles: every IfcElement with geometry (not IfcSpace, not openings) is one batch feature whose
FeatureID is its batch id. The batch table stays small (FeatureID, Name, Type, GlobalId, Tag): the
full data goes to the WFS.

WFS: features.json is what CDE Scenes asks for with GetFeature (GeoJSON, CRS:84). One feature per
node of the IFC tree — project, site, building, storeys, assemblies, spaces and elements — with
Children / AncestorPath (the scene builds its BIM tree from them), PropertySets in the Fusion shape
{pset: {Name, Properties: {...}}} including the quantity sets, MinZ/MaxZ in metres, and the plan
footprint as geometry so the scene can fly to any node. Element ids equal their tile FeatureID.
capabilities.xml answers GetCapabilities so Luciad can resolve the typeName.
"""
import json, math, struct, sys, os
import numpy as np
import ifcopenshell, ifcopenshell.geom, ifcopenshell.util.element as ue
from shapely.geometry import MultiPoint

args = sys.argv[1:]
KEEP_ORIGIN = '--keep-origin' in args
WFS_DIR = args[args.index('--wfs') + 1] if '--wfs' in args else None
WFS_NAME = args[args.index('--wfs-name') + 1] if '--wfs-name' in args else None
EXTRAS = json.load(open(args[args.index('--extras') + 1])) if '--extras' in args else None
CRS = args[args.index('--crs') + 1] if '--crs' in args else None
SKIP = args[args.index('--skip-name') + 1] if '--skip-name' in args else None
DROP_BELOW = float(args[args.index('--drop-below') + 1]) if '--drop-below' in args else None
pos = [a for i, a in enumerate(args) if not a.startswith('--')
       and (i == 0 or args[i - 1] not in ('--wfs', '--wfs-name', '--extras', '--crs', '--skip-name', '--drop-below'))]
src, out, lat, lon, h, heading = pos[0], pos[1], *map(float, pos[2:6])
os.makedirs(out, exist_ok=True)
f = ifcopenshell.open(src)

st = ifcopenshell.geom.settings()
st.set('use-world-coords', True)
st.set('weld-vertices', False)
st.set('mesher-angular-deflection', 0.35)   # ~18 segments per circle: plenty at city scale
st.set('mesher-linear-deflection', 0.02)
import re
products = [p for p in f.by_type('IfcProduct') if p.Representation and not p.is_a('IfcOpeningElement')
            and not (SKIP and re.search(SKIP, p.Name or ''))]
it = ifcopenshell.geom.iterator(st, f, os.cpu_count(), include=products)

geoms = {}                     # guid -> (verts, normals, faces, face_mat, materials)
if it.initialize():
    while True:
        s = it.get()
        g = s.geometry
        v = np.array(g.verts, dtype=np.float64).reshape(-1, 3)
        if len(v):
            mats = [(list(m.diffuse.components) if m.diffuse else [0.7, 0.7, 0.7],
                     float(m.transparency) if m.transparency == m.transparency else 0.0)
                    for m in g.materials] or [([0.7, 0.7, 0.7], 0.0)]
            faces = np.array(g.faces, dtype=np.int64).reshape(-1, 3)
            fm = np.array(g.material_ids, dtype=np.int64)
            if len(fm) != len(faces):
                fm = np.zeros(len(faces), dtype=np.int64)
            fm[fm < 0] = 0
            n = np.array(g.normals, dtype=np.float64).reshape(-1, 3)
            geoms[s.guid] = (v, n, faces, fm, mats)
        if not it.next():
            break


if DROP_BELOW is not None:
    dropped = 0
    for guid, (v, n, faces, fm, mats) in list(geoms.items()):
        keep = (v[faces][:, :, 2] >= DROP_BELOW).all(1)
        dropped += int((~keep).sum())
        if keep.all():
            continue
        if not keep.any():
            del geoms[guid]
            continue
        used = np.unique(faces[keep])  # compact: a stray vertex left unreferenced would still widen the extent
        remap = np.full(len(v), -1, dtype=np.int64); remap[used] = np.arange(len(used))
        geoms[guid] = (v[used], n[used] if len(n) == len(v) else n, remap[faces[keep]], fm[keep], mats)
    print(f'dropped {dropped} triangles under z {DROP_BELOW}')

if CRS:
    from pyproj import Transformer
    to_geo = Transformer.from_crs(CRS, 'EPSG:4979', always_xy=True)
    to_ecef = Transformer.from_crs('EPSG:4979', 'EPSG:4978', always_xy=True)
    o = np.array(to_ecef.transform(lon, lat, 0.0))
    sl, cl, so, co = math.sin(math.radians(lat)), math.cos(math.radians(lat)), math.sin(math.radians(lon)), math.cos(math.radians(lon))
    R = np.array([[-so, co, 0], [-sl * co, -sl * so, cl], [cl * co, cl * so, sl]])  # ECEF -> ENU
    for guid, (v, n, faces, fm, mats) in geoms.items():
        glon, glat = to_geo.transform(v[:, 0], v[:, 1])
        p = np.column_stack(to_ecef.transform(glon, glat, np.zeros(len(v)))) - o
        enu = p @ R.T
        geoms[guid] = (np.column_stack([enu[:, 0], enu[:, 1], v[:, 2] + enu[:, 2]]), n, faces, fm, mats)
    KEEP_ORIGIN = True


def drawable(el):
    if el.is_a('IfcBuildingElementProxy') and (el.Name or '').lower() == 'geo-reference':
        return False  # SketchUp's georeference marker, not part of the structure
    if SKIP and re.search(SKIP, el.Name or ''):
        return False
    return el.GlobalId in geoms and not el.is_a('IfcSpace') and not el.is_a('IfcSpatialStructureElement')


elements = [el for el in f.by_type('IfcProduct') if drawable(el)]
if not elements:
    sys.exit('no drawable geometry')
allv = np.vstack([geoms[el.GlobalId][0] for el in elements])
mn, mx = allv.min(0), allv.max(0)
cx, cy = (0.0, 0.0) if KEEP_ORIGIN else ((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2)
print(f'{len(elements)} drawable elements, extent {(mx - mn).round(2)}')

# ---------------------------------------------------------------- tiles
prims = {}
for bid, el in enumerate(elements):
    v, n, faces, fm, mats = geoms[el.GlobalId]
    local = v - [cx, cy, 0.0]
    if len(n) != len(v):
        n = np.zeros_like(v); n[:, 2] = 1
    for mi in np.unique(fm):
        col, tr = mats[mi] if mi < len(mats) else mats[0]
        key = (tuple(round(c, 3) for c in col), round(tr, 3))
        tri = faces[fm == mi].reshape(-1)
        p = prims.setdefault(key, {'pos': [], 'nrm': [], 'bid': []})
        p['pos'].append(local[tri]); p['nrm'].append(n[tri]); p['bid'].append(np.full(len(tri), bid))


def yup(a):  # IFC Z-up (x east, y north) -> glTF Y-up
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1).astype(np.float32)


bin_ = bytearray(); views = []; accs = []; meshprims = []; materials = []


def add(arr, target, comp, typ, mm=False):
    data = arr.tobytes()
    while len(bin_) % 4: bin_.append(0)
    views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data), 'target': target})
    bin_.extend(data)
    a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1


for (col, tr), p in prims.items():
    posa = yup(np.vstack(p['pos'])); nrm = yup(np.vstack(p['nrm']))
    ln = np.linalg.norm(nrm, axis=1, keepdims=True); ln[ln == 0] = 1; nrm = (nrm / ln).astype(np.float32)
    bid = np.concatenate(p['bid']).astype(np.float32)
    ai = {'POSITION': add(posa, 34962, 5126, 'VEC3', True), 'NORMAL': add(nrm, 34962, 5126, 'VEC3'),
          '_BATCHID': add(bid, 34962, 5126, 'SCALAR')}
    alpha = max(0.0, min(1.0, 1 - tr))
    m = {'pbrMetallicRoughness': {'baseColorFactor': [*col, alpha], 'metallicFactor': 0.1, 'roughnessFactor': 0.8},
         'doubleSided': True}
    if alpha < 1: m['alphaMode'] = 'BLEND'
    materials.append(m)
    meshprims.append({'attributes': ai, 'material': len(materials) - 1, 'mode': 4})
while len(bin_) % 4: bin_.append(0)
gltf = {'asset': {'version': '2.0', 'generator': 'cde-demo ifc2tiles'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0}], 'meshes': [{'primitives': meshprims}], 'materials': materials,
        'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + \
      struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
batch = {'FeatureID': list(range(len(elements))),
         'Name': [el.Name or '' for el in elements], 'Type': [el.is_a() for el in elements],
         'GlobalId': [el.GlobalId for el in elements], 'Tag': [getattr(el, 'Tag', None) or '' for el in elements]}
ft = json.dumps({'BATCH_LENGTH': len(elements)}, separators=(',', ':')).encode(); ft += b' ' * (-(28 + len(ft)) % 8)
bt = json.dumps(batch, separators=(',', ':')).encode(); bt += b' ' * (-(28 + len(ft) + len(bt)) % 8)
b3dm = struct.pack('<4sIIIIII', b'b3dm', 1, 28 + len(ft) + len(bt) + len(glb), len(ft), 0, len(bt), 0) + ft + bt + glb
open(os.path.join(out, 'model.b3dm'), 'wb').write(b3dm)

a_, e2 = 6378137.0, 6.69437999014e-3
la, lo = math.radians(lat), math.radians(lon)
N = a_ / math.sqrt(1 - e2 * math.sin(la) ** 2)
ecef0 = np.array([(N + h) * math.cos(la) * math.cos(lo), (N + h) * math.cos(la) * math.sin(lo), (N * (1 - e2) + h) * math.sin(la)])
E = np.array([-math.sin(lo), math.cos(lo), 0]); Nn = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
U = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
t = math.radians(heading)
X = math.cos(t) * E - math.sin(t) * Nn  # model +x
Y = math.sin(t) * E + math.cos(t) * Nn  # model +y
half = (mx - mn) / 2 + 1
tileset = {'asset': {'version': '1.0', 'generator': 'cde-demo ifc2tiles'},
           'properties': {k: {} for k in batch},
           'geometricError': 200,
           'root': {'transform': [*X, 0, *Y, 0, *U, 0, *ecef0, 1], 'refine': 'ADD', 'geometricError': 0,
                    'boundingVolume': {'box': [(mn[0] + mx[0]) / 2 - cx, (mn[1] + mx[1]) / 2 - cy, (mx[2] + mn[2]) / 2,
                                               half[0], 0, 0, 0, half[1], 0, 0, 0, half[2]]},
                    'content': {'uri': 'model.b3dm'}}}
if EXTRAS:
    tileset['extras'] = EXTRAS
json.dump(tileset, open(os.path.join(out, 'tileset.json'), 'w'), indent=1)
print('tiles:', out, len(b3dm), 'bytes,', len(prims), 'materials')

# ---------------------------------------------------------------- WFS
if not WFS_DIR:
    sys.exit(0)
os.makedirs(WFS_DIR, exist_ok=True)


def to_lonlat(xy):
    """model XY (metres) -> (lon, lat) through the same frame as the tileset."""
    p = ecef0 + np.outer(xy[:, 0] - cx, X) + np.outer(xy[:, 1] - cy, Y)
    b = a_ * math.sqrt(1 - e2); ep = (a_ * a_ - b * b) / (b * b)
    px = np.hypot(p[:, 0], p[:, 1]); th = np.arctan2(p[:, 2] * a_, px * b)
    lat_ = np.arctan2(p[:, 2] + ep * b * np.sin(th) ** 3, px - e2 * a_ * np.cos(th) ** 3)
    return np.degrees(np.arctan2(p[:, 1], p[:, 0])), np.degrees(lat_)


def parent_of(el):
    if el.is_a('IfcProject'):
        return None
    agg = ue.get_aggregate(el)
    if agg is not None:
        return agg
    return ue.get_container(el)


def clean(v):
    if isinstance(v, float):
        return round(v, 3) if math.isfinite(v) else None
    return v


nodes = list(f.by_type('IfcProject')) + [el for el in f.by_type('IfcProduct')
                                   if not el.is_a('IfcOpeningElement') and not el.is_a('IfcAnnotation')]
ids = {el.GlobalId: i for i, el in enumerate(elements)}
nxt = len(elements)
for n in nodes:
    if n.GlobalId not in ids:
        ids[n.GlobalId] = nxt; nxt += 1
children = {}
for n in nodes:
    p = parent_of(n)
    if p is not None and p.GlobalId in ids:
        children.setdefault(p.GlobalId, []).append(n)


def ancestors(n):
    path = []
    p = parent_of(n)
    while p is not None:
        path.insert(0, str(ids[p.GlobalId]))
        p = parent_of(p)
    return path


extent = {}


def node_extent(n):
    if n.GlobalId in extent:
        return extent[n.GlobalId]
    pts = []
    if n.GlobalId in geoms:
        pts.append(geoms[n.GlobalId][0])
    for c in children.get(n.GlobalId, []):
        e = node_extent(c)
        if e is not None:
            pts.append(e)
    extent[n.GlobalId] = np.vstack(pts) if pts else None
    return extent[n.GlobalId]


features = []
for n in nodes:
    props = {'Name': n.Name or n.is_a(), 'Type': n.is_a(), 'GlobalId': n.GlobalId}
    for attr in ('ObjectType', 'Description', 'Tag', 'LongName', 'PredefinedType', 'Elevation'):
        val = getattr(n, attr, None)
        if val not in (None, ''):
            props[attr] = clean(val)
    mat = ue.get_material(n) if n.is_a('IfcElement') else None
    if mat is not None and mat.is_a('IfcMaterial'):
        props['Material'] = mat.Name
    psets = {}
    for pname, vals in ue.get_psets(n).items():
        clean_vals = {k: clean(v) for k, v in vals.items() if k != 'id' and not isinstance(v, (list, dict))}
        if clean_vals:
            psets[pname] = {'Name': pname, 'Properties': clean_vals}
    props['PropertySets'] = psets
    props['Children'] = [str(ids[c.GlobalId]) for c in children.get(n.GlobalId, [])]
    props['AncestorPath'] = ancestors(n)
    props['FeatureID'] = ids[n.GlobalId]
    geom = None
    ext = node_extent(n)
    if ext is not None and len(ext):
        props['MinZ'] = round(float(h + ext[:, 2].min()), 2)
        props['MaxZ'] = round(float(h + ext[:, 2].max()), 2)
        hull = MultiPoint(ext[:, :2]).convex_hull
        if hull.geom_type == 'Polygon':
            ring = np.array(hull.exterior.coords)
            lons, lats = to_lonlat(ring)
            geom = {'type': 'Polygon', 'coordinates': [[[round(a, 8), round(b, 8)] for a, b in zip(lons, lats)]]}
    features.append({'type': 'Feature', 'id': ids[n.GlobalId], 'geometry': geom, 'properties': props})

json.dump({'type': 'FeatureCollection', 'features': features}, open(os.path.join(WFS_DIR, 'features.json'), 'w'),
          ensure_ascii=False, separators=(',', ':'))
coords = np.array([c for ft_ in features if ft_['geometry'] for c in ft_['geometry']['coordinates'][0]])
bb = (coords[:, 0].min(), coords[:, 1].min(), coords[:, 0].max(), coords[:, 1].max())
caps = f'''<?xml version="1.0" encoding="UTF-8"?>
<wfs:WFS_Capabilities version="2.0.0" xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:ows="http://www.opengis.net/ows/1.1"
  xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:cde="https://ingreen.earth/cde">
  <ows:ServiceIdentification><ows:Title>{WFS_NAME} (static)</ows:Title><ows:ServiceType>WFS</ows:ServiceType>
    <ows:ServiceTypeVersion>2.0.0</ows:ServiceTypeVersion></ows:ServiceIdentification>
  <ows:OperationsMetadata>
    <ows:Operation name="GetCapabilities"><ows:DCP><ows:HTTP><ows:Get xlink:href="./"/></ows:HTTP></ows:DCP></ows:Operation>
    <ows:Operation name="GetFeature"><ows:DCP><ows:HTTP><ows:Get xlink:href="./"/></ows:HTTP></ows:DCP>
      <ows:Parameter name="outputFormat"><ows:AllowedValues><ows:Value>application/json</ows:Value></ows:AllowedValues></ows:Parameter>
    </ows:Operation>
  </ows:OperationsMetadata>
  <wfs:FeatureTypeList>
    <wfs:FeatureType>
      <wfs:Name>cde:{WFS_NAME}</wfs:Name><wfs:Title>{WFS_NAME}</wfs:Title>
      <wfs:DefaultCRS>urn:ogc:def:crs:OGC:1.3:CRS84</wfs:DefaultCRS>
      <wfs:OutputFormats><wfs:Format>application/json</wfs:Format></wfs:OutputFormats>
      <ows:WGS84BoundingBox><ows:LowerCorner>{bb[0]} {bb[1]}</ows:LowerCorner><ows:UpperCorner>{bb[2]} {bb[3]}</ows:UpperCorner></ows:WGS84BoundingBox>
    </wfs:FeatureType>
  </wfs:FeatureTypeList>
</wfs:WFS_Capabilities>
'''
open(os.path.join(WFS_DIR, 'capabilities.xml'), 'w').write(caps)
print('wfs:', WFS_DIR, len(features), 'features')
