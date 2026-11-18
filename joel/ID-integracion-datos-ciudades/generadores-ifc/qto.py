"""Add IFC base quantities to every element, computed from its tessellated geometry.

usage: qto.py <in.ifc> [out.ifc]   (in place when out is omitted)

Volumes come from the closed meshes (openings already subtracted, so they are *net*), areas from the
triangles, lengths from the minimum rotated rectangle of the plan projection, and weights from the
element material's Pset_MaterialCommon.MassDensity. Quantity set and quantity names follow the
IFC4 Qto_<Class>BaseQuantities definitions where one exists.
"""
import sys
import numpy as np
import ifcopenshell, ifcopenshell.geom, ifcopenshell.guid, ifcopenshell.util.element as ue
from shapely.geometry import MultiPoint

src = sys.argv[1]
dst = sys.argv[2] if len(sys.argv) > 2 else src
f = ifcopenshell.open(src)
oh = f.by_type('IfcOwnerHistory')[0]

QSET = {'IfcWall': 'Qto_WallBaseQuantities', 'IfcColumn': 'Qto_ColumnBaseQuantities',
        'IfcBeam': 'Qto_BeamBaseQuantities', 'IfcSlab': 'Qto_SlabBaseQuantities',
        'IfcRoof': 'Qto_RoofBaseQuantities', 'IfcDoor': 'Qto_DoorBaseQuantities',
        'IfcWindow': 'Qto_WindowBaseQuantities', 'IfcStairFlight': 'Qto_StairFlightBaseQuantities',
        'IfcRailing': 'Qto_RailingBaseQuantities', 'IfcMember': 'Qto_MemberBaseQuantities',
        'IfcSpace': 'Qto_SpaceBaseQuantities', 'IfcBuildingElementProxy': 'Qto_BuildingElementProxyQuantities'}


def density(el):
    for rel in getattr(el, 'HasAssociations', []):
        if rel.is_a('IfcRelAssociatesMaterial'):
            mat = rel.RelatingMaterial
            for mp in getattr(mat, 'HasProperties', []) or []:
                for p in mp.Properties:
                    if p.Name == 'MassDensity':
                        return float(p.NominalValue.wrappedValue)
    return None


def q(kind, name, value):
    ctor = {'L': f.createIfcQuantityLength, 'A': f.createIfcQuantityArea,
            'V': f.createIfcQuantityVolume, 'W': f.createIfcQuantityWeight}[kind]
    return ctor(name, None, None, round(float(value), 3), None)


st = ifcopenshell.geom.settings()
st.set('use-world-coords', True)
it = ifcopenshell.geom.iterator(st, f, 8, include=f.by_type('IfcElement') + f.by_type('IfcSpace'))
count = 0
if it.initialize():
    while True:
        s = it.get()
        el = f.by_guid(s.guid)
        v = np.array(s.geometry.verts, dtype=float).reshape(-1, 3)
        t = np.array(s.geometry.faces, dtype=int).reshape(-1, 3)
        if len(t):
            a, b, c = v[t[:, 0]], v[t[:, 1]], v[t[:, 2]]
            cross = np.cross(b - a, c - a)
            area = 0.5 * np.linalg.norm(cross, axis=1).sum()
            vol = abs(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6.0)
            h = v[:, 2].max() - v[:, 2].min()
            rect = MultiPoint(v[:, :2]).minimum_rotated_rectangle
            footprint = MultiPoint(v[:, :2]).convex_hull.area
            if rect.geom_type == 'Polygon':
                xs = np.array(rect.exterior.coords)[:4]
                e1, e2 = np.linalg.norm(xs[1] - xs[0]), np.linalg.norm(xs[2] - xs[1])
                length, width = max(e1, e2), min(e1, e2)
            else:
                length = width = 0.0
            rho = density(el)
            cls = el.is_a()
            qs = []
            if cls == 'IfcWall':
                qs = [q('L', 'Length', length), q('L', 'Width', width), q('L', 'Height', h),
                      q('A', 'GrossFootprintArea', footprint), q('V', 'NetVolume', vol)]
            elif cls in ('IfcColumn', 'IfcBeam', 'IfcMember'):
                long_axis = h if cls == 'IfcColumn' else max(length, h)
                qs = [q('L', 'Length', long_axis), q('A', 'CrossSectionArea', vol / long_axis if long_axis else 0),
                      q('A', 'OuterSurfaceArea', area), q('V', 'NetVolume', vol)]
            elif cls == 'IfcSlab':
                qs = [q('L', 'Length', length), q('L', 'Width', width), q('L', 'Depth', h),
                      q('A', 'GrossArea', footprint), q('V', 'NetVolume', vol)]
            elif cls == 'IfcRoof':
                qs = [q('A', 'GrossArea', area / 2), q('A', 'ProjectedArea', footprint)]
            elif cls in ('IfcDoor', 'IfcWindow'):
                w = length
                qs = [q('L', 'Width', w), q('L', 'Height', h), q('A', 'Area', w * h)]
            elif cls == 'IfcStairFlight':
                qs = [q('L', 'Length', width), q('V', 'NetVolume', vol)]
            elif cls == 'IfcSpace':
                qs = [q('L', 'Height', h), q('A', 'NetFloorArea', footprint), q('V', 'NetVolume', vol)]
            else:
                qs = [q('L', 'Length', length), q('L', 'Width', width), q('L', 'Height', h),
                      q('A', 'OuterSurfaceArea', area), q('V', 'NetVolume', vol)]
            if rho and cls not in ('IfcSpace', 'IfcWindow') and vol > 0:
                qs.append(q('W', 'NetWeight', vol * rho))
            eq = f.createIfcElementQuantity(ifcopenshell.guid.new(), oh, QSET.get(cls, 'Qto_CDE_GeometricQuantities'),
                                            'Computed from the model geometry (openings subtracted)', 'CDE qto.py', qs)
            f.createIfcRelDefinesByProperties(ifcopenshell.guid.new(), oh, None, None, [el], eq)
            count += 1
        if not it.next():
            break
f.write(dst)
print('quantities added to', count, 'elements ->', dst)
