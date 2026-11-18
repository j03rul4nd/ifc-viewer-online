"""Small authoring layer over IfcOpenShell for hand-built, georeferenced IFC4 landmark models.

Local model axes: +x east, +y north, +z up, metres, origin at (lat, lon, elevation) of the IfcSite.
The site carries RefLatitude/RefLongitude/RefElevation *and* an IfcMapConversion to a projected CRS:
EPSG:3879 (ETRS-GK25, the City of Helsinki's CRS) by default, or whatever `crs=` names (Tokyo models use
EPSG:6677, JGD2011 / Japan Plane Rectangular CS IX, with TP heights).

What a model gets from this layer, besides geometry:
  * spatial tree  Project > Site > Building > Storey > (Assembly >) Element, plus IfcSpace
  * materials with category, description and Pset_MaterialCommon.MassDensity
  * the standard Pset_<Class>Common for each element, filled with what is actually known
  * Pset_CDE_Provenance on every element: where its geometry comes from and how much to trust it
  * real openings (IfcOpeningElement voiding the host, filled by the IfcWindow / IfcDoor)
Quantities are added afterwards by qto.py, from the tessellated geometry.
"""
import math, time, uuid
import ifcopenshell, ifcopenshell.guid
from pyproj import Transformer


def _guid():
    return ifcopenshell.guid.compress(uuid.uuid4().hex)


# What each standard Pset_<Class>Common carries by default for a masonry heritage building.
COMMON = {
    'IfcWall': ('Pset_WallCommon', {'IsExternal': True, 'LoadBearing': True, 'Status': 'EXISTING'}),
    'IfcColumn': ('Pset_ColumnCommon', {'IsExternal': True, 'LoadBearing': True, 'Status': 'EXISTING'}),
    'IfcBeam': ('Pset_BeamCommon', {'IsExternal': True, 'LoadBearing': True, 'Status': 'EXISTING'}),
    'IfcSlab': ('Pset_SlabCommon', {'IsExternal': True, 'LoadBearing': True, 'Status': 'EXISTING'}),
    'IfcRoof': ('Pset_RoofCommon', {'IsExternal': True, 'Status': 'EXISTING'}),
    'IfcDoor': ('Pset_DoorCommon', {'IsExternal': True, 'Status': 'EXISTING'}),
    'IfcWindow': ('Pset_WindowCommon', {'IsExternal': True, 'Status': 'EXISTING'}),
    'IfcStairFlight': ('Pset_StairFlightCommon', {'Status': 'EXISTING'}),
    'IfcStair': ('Pset_StairCommon', {'IsExternal': True, 'Status': 'EXISTING'}),
    'IfcRailing': ('Pset_RailingCommon', {'IsExternal': True, 'Status': 'EXISTING'}),
    'IfcMember': ('Pset_MemberCommon', {'IsExternal': True, 'Status': 'EXISTING'}),
    'IfcBuildingElementProxy': ('Pset_BuildingElementProxyCommon', {'IsExternal': True, 'Status': 'EXISTING'}),
    'IfcFurnishingElement': ('Pset_FurnitureTypeCommon', {'Status': 'EXISTING'}),
    'IfcLightFixture': ('Pset_LightFixtureTypeCommon', {'Status': 'EXISTING'}),
}
TAGS = {'IfcWall': 'WAL', 'IfcColumn': 'COL', 'IfcBeam': 'BEA', 'IfcSlab': 'SLB', 'IfcRoof': 'ROF', 'IfcDoor': 'DOR',
        'IfcWindow': 'WIN', 'IfcStairFlight': 'STF', 'IfcStair': 'STR', 'IfcRailing': 'RAL', 'IfcMember': 'MEM',
        'IfcBuildingElementProxy': 'PRX', 'IfcFurnishingElement': 'ART', 'IfcLightFixture': 'LGT',
        'IfcCovering': 'COV', 'IfcPlate': 'PLT'}


class Model:
    def __init__(self, project, site, building, lat, lon, elevation, author='InGreen CDE demo',
                 description='', rotation_deg=0.0, tag_prefix='X',
                 crs=(3879, 'ETRS89 / GK25FIN', 'ETRS89', 'N2000'), schema='IFC4', facility='building'):
        """crs = (EPSG code, name, geodetic datum, vertical datum) of the IfcMapConversion; Helsinki by default.
        facility = 'building' (IfcBuilding > IfcBuildingStorey) or 'railway' (IFC4X3: IfcRailway >
        IfcRailwayPart, whose parts take the place of storeys)."""
        self.facility = facility
        f = self.f = ifcopenshell.file(schema=schema)
        self.lat, self.lon, self.elev = lat, lon, elevation
        self.tag_prefix = tag_prefix
        self._tags = {}
        person = f.createIfcPerson(None, None, author)
        org = f.createIfcOrganization(None, 'InGreen')
        pao = f.createIfcPersonAndOrganization(person, org)
        app = f.createIfcApplication(org, '2.0', 'InGreen landmark builder (IfcOpenShell)', 'ingreen-landmark')
        now = int(time.time())
        self.oh = f.createIfcOwnerHistory(pao, app, None, 'ADDED', now, pao, app, now)
        units = f.createIfcUnitAssignment([
            f.createIfcSIUnit(None, 'LENGTHUNIT', None, 'METRE'),
            f.createIfcSIUnit(None, 'AREAUNIT', None, 'SQUARE_METRE'),
            f.createIfcSIUnit(None, 'VOLUMEUNIT', None, 'CUBIC_METRE'),
            f.createIfcSIUnit(None, 'MASSUNIT', 'KILO', 'GRAM'),
            f.createIfcSIUnit(None, 'PLANEANGLEUNIT', None, 'RADIAN')])
        self.origin = f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0., 0., 0.)), None, None)
        th = math.radians(rotation_deg)
        self.ctx = f.createIfcGeometricRepresentationContext(None, 'Model', 3, 1e-5, self.origin,
                                                             f.createIfcDirection((math.sin(th), math.cos(th))))
        self.body = f.createIfcGeometricRepresentationSubContext('Body', 'Model', None, None, None, None,
                                                                 self.ctx, None, 'MODEL_VIEW', None)
        self.project = f.createIfcProject(_guid(), self.oh, project, description, None, None, None,
                                          [self.ctx], units)
        epsg, crs_name, datum, vdatum = crs
        e, n = Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)
        pcrs = f.createIfcProjectedCRS(f'EPSG:{epsg}', crs_name, datum, vdatum, None, None,
                                       f.createIfcSIUnit(None, 'LENGTHUNIT', None, 'METRE'))
        f.createIfcMapConversion(self.ctx, pcrs, e, n, elevation, math.cos(th), math.sin(th), 1.)

        def dms(v):
            d = int(v); m = int((v - d) * 60); s = (v - d - m / 60) * 3600
            return (d, m, int(s), int((s - int(s)) * 1e6))
        self.site_pl = f.createIfcLocalPlacement(None, self.origin)
        self.site = f.createIfcSite(_guid(), self.oh, site, None, None, self.site_pl, None, None,
                                    'ELEMENT', dms(lat), dms(lon), elevation, None, None)
        self.bld_pl = f.createIfcLocalPlacement(self.site_pl, self.origin)
        if facility == 'railway':
            self.building = f.create_entity('IfcRailway', GlobalId=_guid(), OwnerHistory=self.oh, Name=building,
                                            Description=description, ObjectPlacement=self.bld_pl,
                                            CompositionType='ELEMENT')
        else:
            self.building = f.createIfcBuilding(_guid(), self.oh, building, description, None, self.bld_pl,
                                                None, None, 'ELEMENT', None, None, None)
        self._agg(self.project, [self.site]); self._agg(self.site, [self.building])
        self.storeys = {}
        self._materials = {}
        self._contained = {}
        self._parts = {}

    # ---- structure -------------------------------------------------------------------------
    def _agg(self, parent, children):
        self.f.createIfcRelAggregates(_guid(), self.oh, None, None, parent, children)

    def storey(self, name, elevation, description=None, part_type='USERDEFINED', usage='LONGITUDINAL'):
        """A storey, or for a railway facility an IfcRailwayPart (part_type: TRACK, ABOVETRACK, LINESIDE…)."""
        pl = self.f.createIfcLocalPlacement(self.bld_pl, self.f.createIfcAxis2Placement3D(
            self.f.createIfcCartesianPoint((0., 0., float(elevation))), None, None))
        if self.facility == 'railway':
            s = self.f.create_entity('IfcRailwayPart', GlobalId=_guid(), OwnerHistory=self.oh, Name=name,
                                     Description=description, ObjectPlacement=pl, CompositionType='ELEMENT',
                                     UsageType=usage, PredefinedType=part_type,
                                     ObjectType=name if part_type == 'USERDEFINED' else None)
        else:
            s = self.f.createIfcBuildingStorey(_guid(), self.oh, name, description, None, pl, None, None, 'ELEMENT',
                                               float(elevation))
        self._agg(self.building, [s]); self.storeys[name] = s; self._contained[s] = []
        return s

    def assembly(self, name, storey, object_type='Architectural assembly', description=None, psets=None,
                 parent=None):
        f = self.f
        a = f.createIfcElementAssembly(_guid(), self.oh, name, description, object_type,
                                       f.createIfcLocalPlacement(self.bld_pl, self.origin), None,
                                       self._tag('ASM'), 'NOTDEFINED', 'USERDEFINED')
        if parent is not None:
            self._parts[parent].append(a)
        else:
            self._contained[self.storeys[storey]].append(a)
        self._parts[a] = []
        for pname, props in (psets or {}).items():
            self.pset(a, pname, props)
        return a

    def space(self, name, long_name, storey, items, psets=None, description=None):
        f = self.f
        rep = f.createIfcShapeRepresentation(self.body, 'Body', 'SweptSolid', items if isinstance(items, list) else [items])
        sp = f.createIfcSpace(_guid(), self.oh, name, description, None,
                              f.createIfcLocalPlacement(self.bld_pl, self.origin),
                              f.createIfcProductDefinitionShape(None, None, [rep]), long_name, 'ELEMENT', 'INTERNAL', None)
        self._agg(self.storeys[storey], [sp])
        for pname, props in (psets or {}).items():
            self.pset(sp, pname, props)
        return sp

    def finish(self, path):
        for s, els in self._contained.items():
            if els:
                self.f.createIfcRelContainedInSpatialStructure(_guid(), self.oh, None, None, els, s)
        for a, parts in self._parts.items():
            if parts:
                self._agg(a, parts)
        self.f.write(path)

    def _tag(self, code):
        n = self._tags.get(code, 0) + 1
        self._tags[code] = n
        return f'{self.tag_prefix}-{code}-{n:03d}'

    # ---- materials, psets --------------------------------------------------------------------
    def material(self, key, name, rgb, category, density=None, description=None, transparency=0.):
        """Register a material: IfcMaterial + surface style + Pset_MaterialCommon.MassDensity."""
        f = self.f
        shading = f.createIfcSurfaceStyleShading(f.createIfcColourRgb(None, *rgb), transparency)
        style = f.createIfcSurfaceStyle(name, 'BOTH', [shading])
        mat = f.createIfcMaterial(name, description, category)
        if density:
            f.createIfcMaterialProperties('Pset_MaterialCommon', None,
                                          [f.createIfcPropertySingleValue('MassDensity', None, f.createIfcMassDensityMeasure(float(density)), None)],
                                          mat)
        rep = f.createIfcStyledRepresentation(self.ctx, 'Style', 'Material', [f.createIfcStyledItem(None, [style], None)])
        f.createIfcMaterialDefinitionRepresentation(None, None, [rep], mat)
        self._materials[key] = dict(style=style, mat=mat, name=name, category=category, density=density,
                                    description=description)
        return key

    def pset(self, obj, name, props):
        f = self.f
        vals = []
        for k, v in props.items():
            if v is None: continue
            if isinstance(v, bool): nv = f.createIfcBoolean(v)
            elif isinstance(v, int): nv = f.createIfcInteger(v)
            elif isinstance(v, float): nv = f.createIfcReal(round(v, 4))
            else: nv = f.createIfcLabel(str(v))
            vals.append(f.createIfcPropertySingleValue(k, None, nv, None))
        ps = f.createIfcPropertySet(_guid(), self.oh, name, None, vals)
        f.createIfcRelDefinesByProperties(_guid(), self.oh, None, None, [obj], ps)
        return ps

    # ---- geometry primitives (IfcSolidModel items, model coordinates) -------------------------
    def _pl3(self, x=0., y=0., z=0., axis=None, ref=None):
        f = self.f
        return f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((float(x), float(y), float(z))),
                                           f.createIfcDirection(axis) if axis else None,
                                           f.createIfcDirection(ref) if ref else None)

    def _pl2(self, x=0., y=0., angle=0.):
        f = self.f
        return f.createIfcAxis2Placement2D(f.createIfcCartesianPoint((float(x), float(y))),
                                           f.createIfcDirection((math.cos(angle), math.sin(angle))))

    def box(self, cx, cy, z0, dx, dy, h, angle=0.):
        prof = self.f.createIfcRectangleProfileDef('AREA', None, self._pl2(0, 0, angle), float(dx), float(dy))
        return self.f.createIfcExtrudedAreaSolid(prof, self._pl3(cx, cy, z0), self.f.createIfcDirection((0., 0., 1.)), float(h))

    def cylinder(self, cx, cy, z0, r, h):
        prof = self.f.createIfcCircleProfileDef('AREA', None, self._pl2(), float(r))
        return self.f.createIfcExtrudedAreaSolid(prof, self._pl3(cx, cy, z0), self.f.createIfcDirection((0., 0., 1.)), float(h))

    def tube(self, cx, cy, z0, r_out, r_in, h):
        prof = self.f.createIfcCircleHollowProfileDef('AREA', None, self._pl2(), float(r_out), float(r_out - r_in))
        return self.f.createIfcExtrudedAreaSolid(prof, self._pl3(cx, cy, z0), self.f.createIfcDirection((0., 0., 1.)), float(h))

    def prism(self, pts, z0, h):
        f = self.f
        poly = f.createIfcPolyline([f.createIfcCartesianPoint((float(x), float(y))) for x, y in pts + [pts[0]]])
        prof = f.createIfcArbitraryClosedProfileDef('AREA', None, poly)
        return f.createIfcExtrudedAreaSolid(prof, self._pl3(0, 0, z0), f.createIfcDirection((0., 0., 1.)), float(h))

    def extrude_vertical_profile(self, pts, origin, u, depth):
        """Polygon in a vertical plane, extruded horizontally, centred on the plane.
        pts = [(s, t)]: s along horizontal unit vector u, t up from origin z."""
        f = self.f
        ux, uy = u
        nx, ny = -uy, ux
        ox, oy, oz = origin
        # local x = u, local z = -n  =>  local y = (-n) x u = +Z, so profile t points up
        pl = self._pl3(ox + nx * depth / 2, oy + ny * depth / 2, oz, axis=(-nx, -ny, 0.), ref=(ux, uy, 0.))
        poly = f.createIfcPolyline([f.createIfcCartesianPoint((float(s), float(t))) for s, t in pts + [pts[0]]])
        prof = f.createIfcArbitraryClosedProfileDef('AREA', None, poly)
        return f.createIfcExtrudedAreaSolid(prof, pl, f.createIfcDirection((0., 0., 1.)), float(depth))

    def revolve(self, rz, cx, cy, z0):
        """Solid of revolution about the vertical axis through (cx, cy); rz = closed [(r, z)] half-profile."""
        f = self.f
        pl = self._pl3(cx, cy, z0, axis=(0., -1., 0.), ref=(1., 0., 0.))
        poly = f.createIfcPolyline([f.createIfcCartesianPoint((float(r), float(z))) for r, z in rz + [rz[0]]])
        prof = f.createIfcArbitraryClosedProfileDef('AREA', None, poly)
        axis = f.createIfcAxis1Placement(f.createIfcCartesianPoint((0., 0., 0.)), f.createIfcDirection((0., 1., 0.)))
        return f.createIfcRevolvedAreaSolid(prof, pl, axis, 2 * math.pi)

    @staticmethod
    def dome_profile(r_base, h, n=24, cap_r=0.):
        pts = [(r_base * math.cos(a), h * math.sin(a)) for a in [i * (math.pi / 2) / n for i in range(n + 1)]]
        pts = [(max(r, cap_r), z) for r, z in pts]
        return [(0., 0.)] + pts + [(0., pts[-1][1])]

    @staticmethod
    def arch_outline(w, h_spring, rise=None, n=16):
        """Round-headed opening outline [(s, t)]: w wide, straight jambs to h_spring, then an arch."""
        rise = w / 2 if rise is None else rise
        pts = [(-w / 2, 0.), (w / 2, 0.), (w / 2, h_spring)]
        pts += [(w / 2 * math.cos(a), h_spring + rise * math.sin(a)) for a in [math.pi * i / n for i in range(1, n)]]
        pts += [(-w / 2, h_spring)]
        return pts

    def brep(self, verts, faces):
        """Closed faceted solid: verts [(x, y, z)], faces as vertex-index loops, counter-clockwise seen from outside."""
        f = self.f
        pts = [f.createIfcCartesianPoint(tuple(float(c) for c in v)) for v in verts]
        return f.createIfcFacetedBrep(f.createIfcClosedShell(
            [f.createIfcFace([f.createIfcFaceOuterBound(f.createIfcPolyLoop([pts[i] for i in loop]), True)]) for loop in faces]))

    def frustum(self, cx, cy, z0, dx, dy, h, inset_x, inset_y=None, angle=0.):
        """Rectangular frustum (a hipped or mansard roof stage): base dx x dy, top inset on each side."""
        inset_y = inset_x if inset_y is None else inset_y
        c, s = math.cos(angle), math.sin(angle)
        def p(lx, ly, z):
            return (cx + lx * c - ly * s, cy + lx * s + ly * c, z)
        bx, by, tx, ty = dx / 2, dy / 2, max(dx / 2 - inset_x, 0.01), max(dy / 2 - inset_y, 0.01)
        v = [p(-bx, -by, z0), p(bx, -by, z0), p(bx, by, z0), p(-bx, by, z0),
             p(-tx, -ty, z0 + h), p(tx, -ty, z0 + h), p(tx, ty, z0 + h), p(-tx, ty, z0 + h)]
        return self.brep(v, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])

    def sphere(self, cx, cy, cz, r, n=12):
        rz = [(0., -r)] + [(r * math.cos(a), r * math.sin(a)) for a in [-math.pi / 2 + math.pi * i / n for i in range(1, n)]] + [(0., r)]
        return self.revolve(rz, cx, cy, cz)

    def prism_holes(self, outer, holes, z0, h):
        """Vertical prism of a polygon with holes (IfcArbitraryProfileDefWithVoids)."""
        f = self.f
        def pl(pts):
            return f.createIfcPolyline([f.createIfcCartesianPoint((float(x), float(y))) for x, y in list(pts) + [pts[0]]])
        prof = f.createIfcArbitraryProfileDefWithVoids('AREA', None, pl(outer), [pl(hh) for hh in holes])
        return f.createIfcExtrudedAreaSolid(prof, self._pl3(0, 0, z0), f.createIfcDirection((0., 0., 1.)), float(h))

    def rod(self, p0, p1, r=0.03, square=False):
        """Straight bar from p0 to p1 (3D points), round or square section: tie rods, braces, sloped members."""
        f = self.f
        d = [p1[i] - p0[i] for i in range(3)]
        L = math.sqrt(sum(c * c for c in d))
        ax = tuple(c / L for c in d)
        ref = (1., 0., 0.) if abs(ax[0]) < 0.9 else (0., 1., 0.)
        prof = (f.createIfcRectangleProfileDef('AREA', None, self._pl2(), 2 * r, 2 * r) if square
                else f.createIfcCircleProfileDef('AREA', None, self._pl2(), float(r)))
        return f.createIfcExtrudedAreaSolid(prof, self._pl3(*p0, axis=ax, ref=ref), f.createIfcDirection((0., 0., 1.)), L)

    @staticmethod
    def _rep_type(items):
        kinds = {'Brep' if it.is_a('IfcFacetedBrep') else 'SweptSolid' for it in items}
        return kinds.pop() if len(kinds) == 1 else 'SolidModel'

    # ---- elements -----------------------------------------------------------------------------
    def element(self, ifc_class, name, items, storey, material, predefined=None, description=None,
                object_type=None, psets=None, parent=None, src=None, common=None):
        """src = (geometry source, confidence High|Medium|Low[, reference]) -> Pset_CDE_Provenance."""
        f = self.f
        items = items if isinstance(items, list) else [items]
        m = self._materials[material]
        for it in items:
            f.createIfcStyledItem(it, [m['style']], None)
        rep = f.createIfcShapeRepresentation(self.body, 'Body', self._rep_type(items), items)
        shape = f.createIfcProductDefinitionShape(None, None, [rep])
        pl = f.createIfcLocalPlacement(self.bld_pl, self.origin)
        el = f.create_entity(ifc_class, GlobalId=_guid(), OwnerHistory=self.oh, Name=name, Description=description,
                             ObjectType=object_type, ObjectPlacement=pl, Representation=shape)
        if hasattr(el, 'Tag'):
            el.Tag = self._tag(TAGS.get(ifc_class, 'ELM'))
        if predefined and hasattr(el, 'PredefinedType'):
            el.PredefinedType = predefined
            if predefined == 'USERDEFINED' and not object_type:
                el.ObjectType = name
        f.createIfcRelAssociatesMaterial(_guid(), self.oh, None, None, [el], m['mat'])
        if ifc_class in COMMON:
            cname, cprops = COMMON[ifc_class]
            self.pset(el, cname, {'Reference': object_type or name, **cprops, **(common or {})})
        self.pset(el, 'Pset_CDE_Material', {'Material': m['name'], 'Category': m['category'],
                                            'Description': m['description'],
                                            'MassDensity_kg_m3': float(m['density']) if m['density'] else None})
        if src:
            self.pset(el, 'Pset_CDE_Provenance', {'GeometrySource': src[0], 'Confidence': src[1],
                                                  'Reference': src[2] if len(src) > 2 else None})
        for pname, props in (psets or {}).items():
            self.pset(el, pname, props)
        if parent is not None:
            self._parts[parent].append(el)
        else:
            self._contained[self.storeys[storey]].append(el)
        return el

    def opening(self, host, items, filler=None):
        """Void `host` with an IfcOpeningElement of the given solid(s); optionally fill it."""
        f = self.f
        items = items if isinstance(items, list) else [items]
        rep = f.createIfcShapeRepresentation(self.body, 'Body', 'SweptSolid', items)
        op = f.createIfcOpeningElement(_guid(), self.oh, f'Opening in {host.Name}', None, None,
                                       f.createIfcLocalPlacement(self.bld_pl, self.origin),
                                       f.createIfcProductDefinitionShape(None, None, [rep]), None, 'OPENING')
        f.createIfcRelVoidsElement(_guid(), self.oh, None, None, host, op)
        if filler is not None:
            f.createIfcRelFillsElement(_guid(), self.oh, None, None, op, filler)
        return op
