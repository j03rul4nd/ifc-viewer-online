# ─── build-district.py ────────────────────────────────────────────────────────
# Authors the third reference project — the Poblenou Pavilion — as THREE
# federated IFC4 files, fully georeferenced onto a real plot in Barcelona.
#
#   npm run district      (see package.json — wraps blender --background)
#
# WHAT THIS ONE IS FOR, and it is different from the other two. Hello World
# proves the viewer reads a minimal file. The temple proves it reads a
# realistic one. This proves the three things the product is actually sold on,
# and that no public sample file can demonstrate together:
#
#   • FEDERATION — one building delivered as architecture, structure and
#     services, by three "authors", on one shared grid. Load all three and they
#     land on top of each other to the millimetre, because they were authored
#     against the same origin rather than nudged into place.
#   • MAP MODE — real georeferencing (IfcProjectedCRS + IfcMapConversion,
#     LoGeoRef50), not just a latitude on the site. That is what lets the model
#     drop onto the basemap at the right place AND the right rotation, next to
#     the real OpenStreetMap buildings around it.
#   • SCAN ALIGNMENT — the site scan built by scripts/pointcloud/build-site-
#     scan.mjs is written in the SAME projected CRS, so the point cloud reaches
#     the top rung of the alignment ladder instead of "placed by hand". Until
#     now nothing in the demo set could show that, because no public IFC/scan
#     pair of the same place exists (see the honesty note in point-clouds.ts).
#
# THE PLOT is in Poblenou, Barcelona's 22@ district, a couple of blocks from
# Torre Glòries — chosen because OpenStreetMap coverage there is dense and
# well-tagged, so map mode has real neighbours to draw, and because the Cerdà
# grid is rotated ~45° off north. That rotation is the point: a model placed by
# latitude alone lands square to north and visibly wrong against every street
# around it, and this file is the one that shows the difference.
#
# THE BUILDING is a 36.0 x 21.6 m pavilion on a 7.2 m grid, three occupied
# floors at 4.2 m, flat roof, full-height glazing.
#
#      z
#      ↑   ┌────────────────────────────────────┐ 12.60  Roof
#          │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
#          ├────────────────────────────────────┤  8.40  Level 02
#          │  ░░░░░░░░░░  ▓▓core▓▓  ░░░░░░░░░░  │
#          ├────────────────────────────────────┤  4.20  Level 01
#          │  ░░░░░░░░░░  ▓▓    ▓▓  ░░░░░░░░░░  │
#          ├────────────────────────────────────┤  0.00  Ground
#          │ ▬▬▬▬  ▬▬▬▬  ▬▬▬▬  ▬▬▬▬  ▬▬▬▬  ▬▬▬▬ │ -1.20  Foundation
#      0   └────────────────────────────────────┘        → x   (36.0 m)
#
# HOW THE DISCIPLINES DIVIDE, which is the part that makes federation mean
# something rather than three copies of the same building:
#
#   STR  foundations, columns, beams, structural slabs        (the frame)
#   ARC  curtain walling, core walls, doors, stairs, roof,
#        parapets, railings, spaces                           (the envelope)
#   MEP  supply ductwork, fittings and air terminals, in one
#        IfcSystem, with connected IfcDistributionPorts       (the services)
#
# Nothing is modelled twice. The slabs live in STR because they are structure;
# ARC's floors are the spaces above them.
#
# CLASH DISCIPLINE, same as the temple and for the same reason — a reference
# model that reports itself is not a reference model:
#   • Beams butt at the columns instead of crossing them.
#   • Every level touches the one below at exactly one plane: columns stop at
#     the beam soffit, beams stop at the slab soffit, slabs top out at the
#     level datum.
#   • The curtain walling hangs OUTSIDE the slab edge, where a real one does.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ifcopenshell.api  # noqa: E402
import ifcopenshell.util.element  # noqa: E402

import bonsai_kit as kit  # noqa: E402

# ── The grid, in project metres. Origin: the SW corner at ground level ────────

GRID_X = [0.0, 7.2, 14.4, 21.6, 28.8, 36.0]
GRID_Y = [0.0, 7.2, 14.4, 21.6]
X_LABELS = "ABCDEF"
WIDTH, DEPTH = GRID_X[-1], GRID_Y[-1]

# (name, long name, elevation)
LEVELS = [
    ("Foundation", "Foundation level - pad footings", -1.20),
    ("Ground", "Ground floor - entrance and public space", 0.00),
    ("Level 01", "First floor - open plan office", 4.20),
    ("Level 02", "Second floor - open plan office", 8.40),
    ("Roof", "Roof level - plant and terrace", 12.60),
]
LEVEL_Z = {name: z for name, _, z in LEVELS}
OCCUPIED = ["Ground", "Level 01", "Level 02"]

# ── Member sizes ──────────────────────────────────────────────────────────────

SLAB_T = 0.30           # structural slab, top face AT the level datum
BEAM_W, BEAM_H = 0.30, 0.60
COLUMN = 0.40           # square
FOOTING, FOOTING_T = 2.00, 0.90
GLAZING_T = 0.15        # curtain wall build-up, hung outside the slab edge
CORE_WALL_T = 0.20
PARAPET_T, PARAPET_H = 0.20, 1.00
ROOF_T = 0.12
RAIL_T, RAIL_H = 0.06, 0.30
DUCT_W, DUCT_H = 0.60, 0.35
TERMINAL = 0.60

# Panel widths chosen so each façade divides exactly — a curtain wall with a
# leftover sliver at one end is the classic sign of a grid nobody checked.
PANEL_LONG = (WIDTH + 2 * GLAZING_T) / 11   # 3.3 m
PANEL_SHORT = DEPTH / 6                     # 3.6 m

# The service core, in the middle bay.
CORE = (GRID_X[2], GRID_Y[1], GRID_X[3], GRID_Y[2])   # x0, y0, x1, y1

DOOR_W, DOOR_H = 1.20, 2.40

# ── Where on earth ────────────────────────────────────────────────────────────
# Poblenou, Barcelona. ETRS89 / UTM zone 31N, which is what every Catalan
# survey is delivered in and what the app resolves without being asked.
#
# The axis pair is the project +X expressed in the map grid: 45° anticlockwise
# from grid east, which is the Cerdà grid. Get this wrong and the building is
# in the right place facing the wrong way — the failure that looks like success.

EPSG = "EPSG:25831"
DATUM = "ETRS89"
EASTINGS, NORTHINGS = 432290.0, 4584167.0
ORTHOGONAL_HEIGHT = 12.50
GRID_ROTATION_DEG = 45.0

# The same point as a latitude and longitude, for IfcSite. Derived from the
# eastings/northings above, not typed in separately — two georeferencing
# statements that disagree are worse than one.
SITE_LATITUDE = (41, 24, 22, 310013)
SITE_LONGITUDE = (2, 11, 23, 680963)
SITE_ELEVATION = 12.50

AUTHOR = "IFC Viewer Online"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-08-09T00:00:00+00:00"

PROJECT_NAME = "Poblenou Pavilion"
PROJECT_LONG_NAME = "Poblenou Pavilion - reference federated model, Barcelona 22@"

# ISO 19650 file naming: Project-Originator-Volume-Level-Type-Role-Number.
# The gallery shows the friendly name; the FILE is named the way a CDE expects,
# which is also what makes RULE_ISO19650_FILENAME pass on all three.
DISCIPLINES = {
    "ARC": {
        "file": "BCN-IVO-ZZ-XX-M3-A-0001.ifc",
        "name": "Architecture",
        "description": "Architectural model - envelope, core, circulation and spaces",
        "role": "A",
    },
    "STR": {
        "file": "BCN-IVO-ZZ-XX-M3-S-0001.ifc",
        "name": "Structure",
        "description": "Structural model - foundations, frame and slabs",
        "role": "S",
    },
    "MEP": {
        "file": "BCN-IVO-ZZ-XX-M3-M-0001.ifc",
        "name": "Mechanical services",
        "description": "Mechanical model - supply air distribution",
        "role": "M",
    },
}


# ── Small helpers ─────────────────────────────────────────────────────────────


def rect(width, depth):
    return [(0.0, 0.0), (width, 0.0), (width, depth), (0.0, depth)]


def ring(x0, y0, x1, y1, thickness):
    """The four runs of a rectangular ring around (x0,y0)-(x1,y1), OUTSIDE it.

    Yields (side, origin, rotation, length). Two conventions, both load-bearing:

      • Local +X runs along the wall and local +Y points OUTWARD, so "the outer
        face" is `y = thickness` on all four and a reader never has to work out
        which way round a given wall was drawn.
      • The two long runs take the corners and the two short runs stop short of
        them. Splitting a ring any other way overlaps at the corners, and four
        walls that overlap each other is a clash report on a rectangle.
    """
    t = thickness
    return [
        ("South", (x1 + t, y0), 180.0, (x1 - x0) + 2 * t),
        ("North", (x0 - t, y1), 0.0, (x1 - x0) + 2 * t),
        ("West", (x0, y0), 90.0, y1 - y0),
        ("East", (x1, y1), -90.0, y1 - y0),
    ]


class Model:
    """One discipline file, and everything the build needs to add to it."""

    def __init__(self, discipline):
        self.discipline = discipline
        self.meta = DISCIPLINES[discipline]
        kit.deterministic_guids(f"poblenou-{discipline.lower()}")
        self.ifc = kit.new_project()
        self.body, self.axis = kit.contexts(self.ifc)
        self.storeys = self._spatial_structure()
        self.classification = ifcopenshell.api.run(
            "classification.add_classification", self.ifc,
            classification="Reference Element Classification",
        )
        kit.edit(self.ifc, self.classification, Source=ORGANISATION, Edition="2026",
                 Description="In-house element codes for the reference models")
        self.by_class = {}

    # ── Setup ────────────────────────────────────────────────────────────────

    def _spatial_structure(self):
        ifc = self.ifc
        kit.edit(
            ifc, ifc.by_type("IfcProject")[0],
            Name=f"{PROJECT_NAME} - {self.meta['name']}",
            LongName=PROJECT_LONG_NAME,
            Description=self.meta["description"],
            ObjectType="Reference model",
            Phase="REFERENCE",
        )
        kit.georeference(
            ifc, crs_name=EPSG, datum=DATUM,
            crs_description="ETRS89 / UTM zone 31N - the CRS Catalan survey is delivered in",
            vertical_datum="EVRF2000",
            eastings=EASTINGS, northings=NORTHINGS, height=ORTHOGONAL_HEIGHT,
            x_abscissa=kit.cos_deg(GRID_ROTATION_DEG), x_ordinate=kit.sin_deg(GRID_ROTATION_DEG),
        )
        kit.edit(
            ifc, ifc.by_type("IfcSite")[0],
            Name="Poblenou Plot", LongName="Barcelona 22@ - Poblenou plot",
            Description="Georeferenced to ETRS89 / UTM 31N, aligned to the Cerda grid",
            CompositionType="ELEMENT",
            RefLatitude=SITE_LATITUDE, RefLongitude=SITE_LONGITUDE, RefElevation=SITE_ELEVATION,
        )
        building = kit.edit(
            ifc, ifc.by_type("IfcBuilding")[0],
            Name=PROJECT_NAME, LongName="Three-storey pavilion, 36.0 x 21.6 m",
            CompositionType="ELEMENT",
        )

        storeys = {}
        first = ifc.by_type("IfcBuildingStorey")[0]
        for i, (name, long_name, elevation) in enumerate(LEVELS):
            if i == 0:
                storeys[name] = kit.edit(ifc, first, Name=name, LongName=long_name,
                                         CompositionType="ELEMENT", Elevation=elevation)
            else:
                storeys[name] = kit.add_storey(ifc, building, name, long_name, elevation)
        return storeys

    # ── Adding elements ──────────────────────────────────────────────────────

    def box(self, ifc_class, element_type, name, description, storey, origin, size,
            rotation=0.0, pset=None, qto=None, code=None):
        width, depth, height = size
        matrix = kit.placement_matrix(origin, rotation)
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(
            self.ifc, obj, matrix, ifc_class, element_type, name, description,
            self.storeys[storey] if storey else None,
        )
        kit.attach(self.ifc, obj, element, kit.extruded(self.ifc, self.body, rect(width, depth), height))
        self._finish(element, ifc_class, pset, qto, code)
        return element

    def swept(self, ifc_class, element_type, name, description, storey, origin, axes, profile,
              length, pset=None, qto=None, code=None):
        """An element swept along its own axis — beams, ducts, anything linear."""
        matrix = kit.placement_matrix(origin, **axes)
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(
            self.ifc, obj, matrix, ifc_class, element_type, name, description,
            self.storeys[storey] if storey else None,
        )
        kit.attach(self.ifc, obj, element, kit.extruded(self.ifc, self.body, profile, length))
        self._finish(element, ifc_class, pset, qto, code)
        return element

    def _finish(self, element, ifc_class, pset, qto, code):
        if pset:
            kit.add_pset(self.ifc, element, pset[0], pset[1])
        if qto:
            kit.add_qto(self.ifc, element, qto[0], qto[1])
        self.by_class.setdefault((ifc_class, code), []).append(element)

    def classify_all(self, codes):
        for (ifc_class, code), elements in self.by_class.items():
            label = codes.get(code or ifc_class)
            if label:
                kit.classify(self.ifc, self.classification, elements, label[0], label[1])

    def carry_type_materials(self):
        """Put the type's material on the occurrence when nothing else did.

        Layer sets and profile sets already produce a *Usage per occurrence; a
        bare IfcMaterial on a type does not, which leaves the element knowing
        its material only through its type — true in the schema, invisible to
        every take-off tool and to the app's material rule.
        """
        for element in self.ifc.by_type("IfcElement"):
            if element.is_a("IfcOpeningElement"):
                continue
            if ifcopenshell.util.element.get_material(element, should_inherit=False):
                continue
            element_type = ifcopenshell.util.element.get_type(element)
            material = ifcopenshell.util.element.get_material(element_type) if element_type else None
            if material and material.is_a("IfcMaterial"):
                ifcopenshell.api.run("material.assign_material", self.ifc,
                                     products=[element], material=material)

    def set_layer_directions(self):
        for element in self.ifc.by_type("IfcElement"):
            usage = ifcopenshell.util.element.get_material(element)
            if usage and usage.is_a("IfcMaterialLayerSetUsage"):
                # Layers stack across a wall's or a panel's thickness, and
                # through a slab's or a roof's depth.
                upright = element.is_a("IfcWall") or element.is_a("IfcPlate")
                usage.LayerSetDirection = "AXIS2" if upright else "AXIS3"

    def write(self, out_dir):
        self.carry_type_materials()
        self.set_layer_directions()
        path = os.path.join(out_dir, self.meta["file"])
        kit.set_header(self.ifc, os.path.basename(path), AUTHOR, ORGANISATION, TIMESTAMP)
        kit.write(self.ifc, path)
        return path


# ── Structure ─────────────────────────────────────────────────────────────────

CODES_STR = {
    "footing": ("REF-FTG", "Foundations"),
    "column": ("REF-COL", "Columns"),
    "beam": ("REF-BEA", "Beams"),
    "slab": ("REF-SLB", "Slabs"),
}


def build_structure(out_dir):
    m = Model("STR")
    ifc = m.ifc
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C30/37",
                                    category="concrete")
    slab_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-300-C30/37", "FLOOR", concrete, SLAB_T)
    footing_type = kit.add_simple_type(ifc, "IfcFootingType", "FTG-2000x2000-C30/37", "PAD_FOOTING",
                                       concrete)
    column_type = kit.add_profiled_type(
        ifc, "IfcColumnType", "COL-400x400-C30/37", "COLUMN", concrete,
        ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="400x400",
                          XDim=COLUMN, YDim=COLUMN),
    )
    beam_type = kit.add_profiled_type(
        ifc, "IfcBeamType", "BEA-300x600-C30/37", "BEAM", concrete,
        ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="300x600",
                          XDim=BEAM_W, YDim=BEAM_H),
    )

    half = COLUMN / 2

    # Pad footings, one per grid intersection.
    for xi, x in enumerate(GRID_X):
        for yi, y in enumerate(GRID_Y):
            name = f"Pad Footing {X_LABELS[xi]}{yi + 1}"
            m.box("IfcFooting", footing_type, name, "Reinforced concrete pad under a column",
                  "Foundation",
                  (x - FOOTING / 2, y - FOOTING / 2, LEVEL_Z["Foundation"]),
                  (FOOTING, FOOTING, FOOTING_T),
                  pset=("Pset_FootingCommon", {"LoadBearing": True, "IsExternal": False,
                                               "Reference": "FTG-2000x2000-C30/37"}),
                  qto=("Qto_FootingBaseQuantities", {
                      "Length": FOOTING, "Width": FOOTING, "Height": FOOTING_T,
                      "GrossVolume": round(FOOTING * FOOTING * FOOTING_T, 4)}),
                  code="footing")

    # Slabs: one per level, top face at the level datum.
    for level in ["Ground", "Level 01", "Level 02", "Roof"]:
        z = LEVEL_Z[level]
        name = f"Floor Slab - {level}" if level != "Roof" else "Roof Slab"
        m.box("IfcSlab", slab_type, name, f"300 mm reinforced concrete slab at {level}", level,
              (0.0, 0.0, z - SLAB_T), (WIDTH, DEPTH, SLAB_T),
              pset=("Pset_SlabCommon", {"LoadBearing": True, "IsExternal": level == "Roof",
                                        "Reference": "SLB-300-C30/37"}),
              qto=("Qto_SlabBaseQuantities", {
                  "Width": WIDTH, "Length": DEPTH, "Depth": SLAB_T,
                  "NetArea": round(WIDTH * DEPTH, 4),
                  "NetVolume": round(WIDTH * DEPTH * SLAB_T, 4)}),
              code="slab")

    # Columns: from the slab they stand on up to the soffit of the beams above.
    for below, above in [("Ground", "Level 01"), ("Level 01", "Level 02"), ("Level 02", "Roof")]:
        base = LEVEL_Z[below]
        top = LEVEL_Z[above] - SLAB_T - BEAM_H
        for xi, x in enumerate(GRID_X):
            for yi, y in enumerate(GRID_Y):
                name = f"Column {X_LABELS[xi]}{yi + 1} - {below}"
                m.box("IfcColumn", column_type, name, f"400 x 400 concrete column at {below}",
                      below, (x - half, y - half, base), (COLUMN, COLUMN, top - base),
                      pset=("Pset_ColumnCommon", {"LoadBearing": True, "IsExternal": False,
                                                  "Reference": "COL-400x400-C30/37"}),
                      qto=("Qto_ColumnBaseQuantities", {
                          "Length": round(top - base, 4),
                          "CrossSectionArea": round(COLUMN ** 2, 4),
                          "GrossVolume": round(COLUMN ** 2 * (top - base), 4)}),
                      code="column")

    # Beams: on every grid line, between adjacent columns, butting at the faces.
    beam_profile = rect(BEAM_W, BEAM_H)
    for level in ["Level 01", "Level 02", "Roof"]:
        soffit = LEVEL_Z[level] - SLAB_T - BEAM_H
        for yi, y in enumerate(GRID_Y):
            for xi in range(len(GRID_X) - 1):
                start, span = GRID_X[xi] + half, GRID_X[xi + 1] - GRID_X[xi] - COLUMN
                name = f"Beam {X_LABELS[xi]}{yi + 1}-{X_LABELS[xi + 1]}{yi + 1} - {level}"
                m.swept("IfcBeam", beam_type, name, f"300 x 600 concrete beam on line {yi + 1}",
                        level, (start, y - BEAM_W / 2, soffit),
                        {"x_axis": (0, 1, 0), "y_axis": (0, 0, 1)}, beam_profile, span,
                        pset=("Pset_BeamCommon", {"LoadBearing": True, "IsExternal": False,
                                                  "Reference": "BEA-300x600-C30/37"}),
                        qto=("Qto_BeamBaseQuantities", {
                            "Length": round(span, 4),
                            "CrossSectionArea": round(BEAM_W * BEAM_H, 4),
                            "GrossVolume": round(span * BEAM_W * BEAM_H, 4)}),
                        code="beam")
        for xi, x in enumerate(GRID_X):
            for yi in range(len(GRID_Y) - 1):
                start, span = GRID_Y[yi] + half, GRID_Y[yi + 1] - GRID_Y[yi] - COLUMN
                name = f"Beam {X_LABELS[xi]}{yi + 1}-{X_LABELS[xi]}{yi + 2} - {level}"
                m.swept("IfcBeam", beam_type, name, f"300 x 600 concrete beam on line {X_LABELS[xi]}",
                        level, (x - BEAM_W / 2, start, soffit),
                        {"x_axis": (0, 0, 1), "y_axis": (1, 0, 0)}, rect(BEAM_H, BEAM_W), span,
                        pset=("Pset_BeamCommon", {"LoadBearing": True, "IsExternal": False,
                                                  "Reference": "BEA-300x600-C30/37"}),
                        qto=("Qto_BeamBaseQuantities", {
                            "Length": round(span, 4),
                            "CrossSectionArea": round(BEAM_W * BEAM_H, 4),
                            "GrossVolume": round(span * BEAM_W * BEAM_H, 4)}),
                        code="beam")

    m.classify_all(CODES_STR)
    return m


# ── Architecture ──────────────────────────────────────────────────────────────

CODES_ARC = {
    "curtainwall": ("REF-CWL", "Curtain walling"),
    "plate": ("REF-PLT", "Glazed panels"),
    "wall": ("REF-WAL", "Walls and partitions"),
    "door": ("REF-DOO", "Doors"),
    "stair": ("REF-STA", "Stairs"),
    "flight": ("REF-STF", "Stair flights"),
    "roof": ("REF-ROF", "Roofs"),
    "railing": ("REF-RAI", "Railings"),
}


def build_architecture(out_dir):
    m = Model("ARC")
    ifc = m.ifc

    glass = ifcopenshell.api.run("material.add_material", ifc, name="Glazing", category="glass")
    aluminium = ifcopenshell.api.run("material.add_material", ifc, name="Aluminium", category="metal")
    block = ifcopenshell.api.run("material.add_material", ifc, name="Concrete Block",
                                 category="masonry")
    membrane = ifcopenshell.api.run("material.add_material", ifc, name="Roof Membrane",
                                    category="bitumen")
    oak = ifcopenshell.api.run("material.add_material", ifc, name="Oak", category="wood")
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C30/37",
                                    category="concrete")

    cw_type = kit.add_simple_type(ifc, "IfcCurtainWallType", "CWL-150-Unitised", "NOTDEFINED",
                                  aluminium)
    plate_type = kit.add_layered_type(ifc, "IfcPlateType", "PLT-150-Glazed Unit", "SHEET",
                                      glass, GLAZING_T)
    wall_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-200-Block", "SOLIDWALL",
                                     block, CORE_WALL_T)
    parapet_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-200-Parapet", "PARAPET",
                                        block, PARAPET_T)
    roof_type = kit.add_layered_type(ifc, "IfcRoofType", "ROF-120-Warm Deck", "FLAT_ROOF",
                                     membrane, ROOF_T)
    door_type = kit.add_simple_type(ifc, "IfcDoorType", "DOO-1200x2400-Oak", "DOOR", oak)
    stair_type = kit.add_simple_type(ifc, "IfcStairType", "STA-Core", "STRAIGHT_RUN", concrete)
    flight_type = kit.add_simple_type(ifc, "IfcStairFlightType", "STF-Core", "STRAIGHT", concrete)
    railing_type = kit.add_simple_type(ifc, "IfcRailingType", "RAI-300-Aluminium", "GUARDRAIL",
                                       aluminium)
    space_type = kit.add_simple_type(ifc, "IfcSpaceType", "SPA-Office", "SPACE")

    # ── Curtain walling: one per façade per storey, aggregating its panels ────
    # An IfcCurtainWall is a hosting element — the panels are what is actually
    # there, and IfcRelAggregates is what says so. A single box named
    # "curtain wall" would render the same and answer nothing.
    for level in OCCUPIED:
        z = LEVEL_Z[level]
        height = LEVEL_Z[LEVELS[[n for n, _, _ in LEVELS].index(level) + 1][0]] - z
        for side, origin_xy, rotation, run in ring(0.0, 0.0, WIDTH, DEPTH, GLAZING_T):
            panel_width = PANEL_LONG if side in ("South", "North") else PANEL_SHORT
            origin = (origin_xy[0], origin_xy[1], z)
            name = f"Curtain Wall {side} - {level}"
            matrix = kit.placement_matrix(origin, rotation)
            obj = kit.placed_object(name, matrix)
            # No body of its own: a decomposed element's geometry lives in its
            # parts. Giving the curtain wall a box AND the panels a box each
            # would draw the façade twice and let the two disagree.
            wall = kit.add_occurrence(ifc, obj, matrix, "IfcCurtainWall", cw_type, name,
                                      f"Unitised glazed facade, {side.lower()} elevation",
                                      m.storeys[level])
            kit.add_pset(ifc, wall, "Pset_CurtainWallCommon",
                         {"IsExternal": True, "Reference": "CWL-150-Unitised"})
            kit.add_qto(ifc, wall, "Qto_CurtainWallBaseQuantities",
                        {"Length": round(run, 4), "Height": round(height, 4),
                         "Width": GLAZING_T, "GrossSideArea": round(run * height, 4)})
            m.by_class.setdefault(("IfcCurtainWall", "curtainwall"), []).append(wall)

            panels = []
            count = round(run / panel_width)
            for i in range(count):
                panel_name = f"Glazed Panel {side} {i + 1:02d} - {level}"
                panels.append(m.box(
                    "IfcPlate", plate_type, panel_name, "Unitised glazed panel", None,
                    kit.offset_along(origin, rotation, i * panel_width),
                    (panel_width, GLAZING_T, height), rotation,
                    pset=("Pset_PlateCommon", {"IsExternal": True,
                                               "Reference": "PLT-150-Glazed Unit"}),
                    qto=("Qto_PlateBaseQuantities", {
                        "Width": round(panel_width, 4), "Length": round(height, 4),
                        "Thickness": GLAZING_T,
                        "GrossArea": round(panel_width * height, 4)}),
                    code="plate"))
            kit.aggregate(ifc, panels, wall)

    # ── Core: walls, doors, stairs ────────────────────────────────────────────
    x0, y0, x1, y1 = CORE
    for level in OCCUPIED:
        z = LEVEL_Z[level]
        index = [n for n, _, _ in LEVELS].index(level)
        top = LEVEL_Z[LEVELS[index + 1][0]] - SLAB_T
        height = top - z
        for side, origin, rotation, length in ring(x0, y0, x1, y1, CORE_WALL_T):
            name = f"Core Wall {side} - {level}"
            wall = m.box("IfcWall", wall_type, name, f"Blockwork core wall, {level}", level,
                         (origin[0], origin[1], z), (length, CORE_WALL_T, height), rotation,
                         pset=("Pset_WallCommon", {"IsExternal": False, "LoadBearing": False,
                                                   "FireRating": "EI 60",
                                                   "Reference": "WAL-200-Block"}),
                         qto=("Qto_WallBaseQuantities", {
                             "Length": round(length, 4), "Height": round(height, 4),
                             "Width": CORE_WALL_T,
                             "NetSideArea": round(length * height, 4),
                             "NetVolume": round(length * height * CORE_WALL_T, 4)}),
                         code="wall")
            if side != "South":
                continue
            # One door per level, in the south core wall.
            centre = (x0 + x1) / 2
            door_name = f"Core Door - {level}"
            opening_matrix = kit.placement_matrix(
                (centre - DOOR_W / 2, y0 - CORE_WALL_T - 0.01, z))
            kit.add_opening(ifc, m.body, wall, f"Opening for {door_name}", opening_matrix,
                            rect(DOOR_W, CORE_WALL_T + 0.02), DOOR_H)
            opening = ifc.by_type("IfcOpeningElement")[-1]
            door = m.box("IfcDoor", door_type, door_name, "Oak-faced fire door to the core", level,
                         (centre - DOOR_W / 2, y0 - CORE_WALL_T / 2 - 0.025, z),
                         (DOOR_W, 0.05, DOOR_H),
                         pset=("Pset_DoorCommon", {"IsExternal": False, "FireExit": True,
                                                   "FireRating": "EI 30",
                                                   "Reference": "DOO-1200x2400-Oak"}),
                         qto=("Qto_DoorBaseQuantities", {
                             "Width": DOOR_W, "Height": DOOR_H,
                             "Area": round(DOOR_W * DOOR_H, 4)}),
                         code="door")
            kit.edit(ifc, door, OverallWidth=DOOR_W, OverallHeight=DOOR_H)
            kit.fill_opening(ifc, opening, door)

        # A straight flight up to the next level, inside the core.
        rise = LEVEL_Z[LEVELS[index + 1][0]] - z
        steps = 24
        tread, riser = 0.28, rise / steps
        stair_name = f"Core Stair - {level}"
        stair_matrix = kit.placement_matrix((x0 + 0.4, y0 + 0.4, z))
        stair_obj = kit.placed_object(stair_name, stair_matrix)
        stair = kit.add_occurrence(ifc, stair_obj, stair_matrix, "IfcStair", stair_type,
                                   stair_name, f"Straight flight from {level} to the level above",
                                   m.storeys[level])
        kit.add_pset(ifc, stair, "Pset_StairCommon", {
            "IsExternal": False, "FireExit": True, "NumberOfRiser": steps,
            "NumberOfTreads": steps, "RiserHeight": round(riser, 4), "TreadLength": tread})
        kit.add_qto(ifc, stair, "Qto_StairBaseQuantities",
                    {"Length": round(steps * tread, 4), "GrossVolume": round(
                        1.4 * tread * riser * (steps * (steps + 1) / 2), 4)})
        m.by_class.setdefault(("IfcStair", "stair"), []).append(stair)

        profile = [(0.0, 0.0), (steps * tread, 0.0)]
        for step in range(steps, 0, -1):
            profile.append((step * tread, step * riser))
            profile.append(((step - 1) * tread, step * riser))
        flight_name = f"Core Stair Flight - {level}"
        flight_matrix = kit.placement_matrix((x0 + 0.4, y0 + 0.4, z),
                                             x_axis=(0, 1, 0), y_axis=(0, 0, 1))
        flight_obj = kit.placed_object(flight_name, flight_matrix)
        flight = kit.add_occurrence(ifc, flight_obj, flight_matrix, "IfcStairFlight", flight_type,
                                    flight_name, "In-situ concrete straight flight", storey=None)
        kit.attach(ifc, flight_obj, flight, kit.extruded(ifc, m.body, profile, 1.4))
        kit.add_pset(ifc, flight, "Pset_StairFlightCommon", {
            "NumberOfRiser": steps, "NumberOfTreads": steps,
            "RiserHeight": round(riser, 4), "TreadLength": tread})
        kit.add_qto(ifc, flight, "Qto_StairFlightBaseQuantities",
                    {"Length": round(steps * tread, 4), "GrossVolume": round(
                        1.4 * tread * riser * (steps * (steps + 1) / 2), 4)})
        kit.aggregate(ifc, [flight], stair)
        m.by_class.setdefault(("IfcStairFlight", "flight"), []).append(flight)

        # The occupiable floor plate, as a space.
        space_name = f"Open Plan Office - {level}" if level != "Ground" else "Entrance Hall"
        space_matrix = kit.placement_matrix((0.0, 0.0, z))
        space_obj = kit.placed_object(space_name, space_matrix)
        space = kit.add_occurrence(ifc, space_obj, space_matrix, "IfcSpace", space_type,
                                   space_name, f"Occupiable floor plate at {level}", storey=None)
        kit.edit(ifc, space, LongName=space_name, CompositionType="ELEMENT")
        kit.attach(ifc, space_obj, space, kit.extruded(ifc, m.body, rect(WIDTH, DEPTH), height))
        kit.aggregate(ifc, [space], m.storeys[level])
        kit.add_pset(ifc, space, "Pset_SpaceCommon",
                     {"IsExternal": False, "PubliclyAccessible": level == "Ground",
                      "HandicapAccessible": True, "Reference": "SPA-Office"})
        kit.add_qto(ifc, space, "Qto_SpaceBaseQuantities", {
            "Height": round(height, 4), "GrossPerimeter": round(2 * (WIDTH + DEPTH), 4),
            "NetFloorArea": round(WIDTH * DEPTH, 4),
            "NetVolume": round(WIDTH * DEPTH * height, 4)})

    # ── Roof, parapets, railing ──────────────────────────────────────────────
    roof_z = LEVEL_Z["Roof"]
    m.box("IfcRoof", roof_type, "Roof Covering", "Warm-deck membrane roof over the slab", "Roof",
          (0.0, 0.0, roof_z), (WIDTH, DEPTH, ROOF_T),
          pset=("Pset_RoofCommon", {"IsExternal": True, "LoadBearing": False,
                                    "Reference": "ROF-120-Warm Deck"}),
          qto=("Qto_RoofBaseQuantities", {"GrossArea": round(WIDTH * DEPTH, 4),
                                          "NetArea": round(WIDTH * DEPTH, 4)}),
          code="roof")

    for side, origin, rotation, length in ring(0.0, 0.0, WIDTH, DEPTH, PARAPET_T):
        m.box("IfcWall", parapet_type, f"Parapet {side}", "Upstand around the roof edge", "Roof",
              (origin[0], origin[1], roof_z), (length, PARAPET_T, PARAPET_H), rotation,
              pset=("Pset_WallCommon", {"IsExternal": True, "LoadBearing": False,
                                        "Reference": "WAL-200-Parapet"}),
              qto=("Qto_WallBaseQuantities", {
                  "Length": round(length, 4), "Height": PARAPET_H, "Width": PARAPET_T,
                  "NetSideArea": round(length * PARAPET_H, 4),
                  "NetVolume": round(length * PARAPET_H * PARAPET_T, 4)}),
              code="wall")
        m.box("IfcRailing", railing_type, f"Roof Railing {side}",
              "Guardrail on the parapet", "Roof",
              (origin[0], origin[1], roof_z + PARAPET_H), (length, RAIL_T, RAIL_H), rotation,
              pset=("Pset_RailingCommon", {"IsExternal": True, "Reference": "RAI-300-Aluminium"}),
              qto=("Qto_RailingBaseQuantities", {"Length": round(length, 4)}),
              code="railing")

    m.classify_all(CODES_ARC)
    return m


# ── Mechanical services ───────────────────────────────────────────────────────

CODES_MEP = {
    "duct": ("REF-DCT", "Ductwork"),
    "fitting": ("REF-DFT", "Duct fittings"),
    "terminal": ("REF-ATU", "Air terminals"),
    "plant": ("REF-AHU", "Air handling plant"),
}


def build_services(out_dir):
    """Supply air: a spine per floor, two branches, six terminals, one system.

    Small on purpose — the point is not a services model, it is that an element
    in a services model belongs to an IfcSystem and its segments are CONNECTED
    through IfcDistributionPorts. Those two relationships are what the app's MEP
    rules look for, and what a duct drawn as a box will never have.
    """
    m = Model("MEP")
    ifc = m.ifc
    steel = ifcopenshell.api.run("material.add_material", ifc, name="Galvanised Steel",
                                 category="metal")

    duct_type = kit.add_profiled_type(
        ifc, "IfcDuctSegmentType", "DCT-600x350-Galv", "RIGIDSEGMENT", steel,
        ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="600x350",
                          XDim=DUCT_W, YDim=DUCT_H),
    )
    fitting_type = kit.add_simple_type(ifc, "IfcDuctFittingType", "DFT-600x350-Bend", "BEND", steel)
    terminal_type = kit.add_simple_type(ifc, "IfcAirTerminalType", "ATU-600-Swirl", "DIFFUSER",
                                        steel)
    ahu_type = kit.add_simple_type(ifc, "IfcUnitaryEquipmentType", "AHU-01-Rooftop", "AIRHANDLER",
                                   steel)

    system = ifcopenshell.api.run("system.add_system", ifc, ifc_class="IfcDistributionSystem")
    kit.edit(ifc, system, Name="AHU-01 Supply Air", LongName="Supply air distribution",
             Description="Constant volume supply air to the office floors",
             PredefinedType="AIRCONDITIONING")

    served = []
    duct_profile = rect(DUCT_W, DUCT_H)
    # 300 mm below the beam soffit, in the ceiling void.
    for level in OCCUPIED:
        index = [n for n, _, _ in LEVELS].index(level)
        ceiling = LEVEL_Z[LEVELS[index + 1][0]] - SLAB_T - BEAM_H - 0.30 - DUCT_H

        spine = m.swept(
            "IfcDuctSegment", duct_type, f"Supply Duct Spine - {level}",
            "600 x 350 galvanised supply duct", level,
            (GRID_X[1], GRID_Y[2] - DUCT_W / 2, ceiling),
            {"x_axis": (0, 1, 0), "y_axis": (0, 0, 1)}, duct_profile,
            GRID_X[4] - GRID_X[1],
            pset=("Pset_DuctSegmentTypeCommon", {"Reference": "DCT-600x350-Galv",
                                                 "Shape": "RECTANGULAR"}),
            qto=("Qto_DuctSegmentBaseQuantities", {
                "Length": round(GRID_X[4] - GRID_X[1], 4),
                "CrossSectionArea": round(DUCT_W * DUCT_H, 4)}),
            code="duct")
        served.append(spine)

        previous = spine
        for bi, x in enumerate([GRID_X[1], GRID_X[4]]):
            bend = m.box(
                "IfcDuctFitting", fitting_type, f"Duct Bend {bi + 1} - {level}",
                "90 degree radiused bend", level,
                (x - DUCT_W / 2, GRID_Y[2] - DUCT_W / 2, ceiling),
                (DUCT_W, DUCT_W, DUCT_H),
                pset=("Pset_DuctFittingTypeCommon", {"Reference": "DFT-600x350-Bend",
                                                     "Shape": "RECTANGULAR"}),
                qto=("Qto_DuctFittingBaseQuantities", {"Length": DUCT_W}),
                code="fitting")
            served.append(bend)
            # Ports, and the connection between them. This is the relationship
            # RULE_CONNECTED_MEP checks, and the reason a duct in a real model
            # is a network rather than a pile of boxes.
            out_port = ifcopenshell.api.run("system.add_port", ifc, element=previous)
            in_port = ifcopenshell.api.run("system.add_port", ifc, element=bend)
            kit.edit(ifc, out_port, Name=f"Outlet {bi + 1}", PredefinedType="DUCT",
                     FlowDirection="SOURCE")
            kit.edit(ifc, in_port, Name=f"Inlet {bi + 1}", PredefinedType="DUCT",
                     FlowDirection="SINK")
            ifcopenshell.api.run("system.connect_port", ifc, port1=out_port, port2=in_port)
            previous = bend

        for ti, (x, y) in enumerate([(gx, gy) for gy in (GRID_Y[1], GRID_Y[2])
                                     for gx in (GRID_X[1], GRID_X[2], GRID_X[4])]):
            served.append(m.box(
                "IfcAirTerminal", terminal_type, f"Swirl Diffuser {ti + 1:02d} - {level}",
                "600 mm swirl diffuser in the ceiling", level,
                (x - TERMINAL / 2, y - TERMINAL / 2, ceiling - 0.12),
                (TERMINAL, TERMINAL, 0.12),
                pset=("Pset_AirTerminalTypeCommon", {"Reference": "ATU-600-Swirl",
                                                     "AirFlowType": "SUPPLY",
                                                     "Shape": "SQUARE"}),
                qto=("Qto_AirTerminalBaseQuantities", {"Length": TERMINAL, "Width": TERMINAL}),
                code="terminal"))

    # The plant it all comes from, on the roof.
    served.append(m.box(
        "IfcUnitaryEquipment", ahu_type, "AHU-01 Supply Unit",
        "Roof-mounted air handling unit serving the supply system", "Roof",
        (GRID_X[2], GRID_Y[1], LEVEL_Z["Roof"] + ROOF_T + PARAPET_H * 0 + 0.12),
        (3.0, 2.0, 1.6),
        pset=("Pset_UnitaryEquipmentTypeAirHandler", {"Reference": "AHU-01-Rooftop"}),
        qto=("Qto_UnitaryEquipmentBaseQuantities", {"GrossWeight": 1250.0}),
        code="plant"))

    ifcopenshell.api.run("system.assign_system", ifc, products=served, system=system)
    m.classify_all(CODES_MEP)
    return m


# ── Entry point ───────────────────────────────────────────────────────────────


def expected_origins():
    """One element per discipline whose placement the build could get wrong."""
    return {
        "Pad Footing A1": (-FOOTING / 2, -FOOTING / 2, LEVEL_Z["Foundation"]),
        "Floor Slab - Level 01": (0.0, 0.0, LEVEL_Z["Level 01"] - SLAB_T),
        "Column A1 - Level 02": (-COLUMN / 2, -COLUMN / 2, LEVEL_Z["Level 02"]),
        # A panel, not the curtain wall that hosts it: a decomposed element has
        # no body of its own, so there would be nothing to check.
        "Glazed Panel North 01 - Ground": (-GLAZING_T, DEPTH, 0.0),
        "Roof Covering": (0.0, 0.0, LEVEL_Z["Roof"]),
        "Supply Duct Spine - Ground": (
            GRID_X[1], GRID_Y[2] - DUCT_W / 2,
            LEVEL_Z["Level 01"] - SLAB_T - BEAM_H - 0.30 - DUCT_H),
    }


BUILDERS = {"STR": build_structure, "ARC": build_architecture, "MEP": build_services}


def main():
    """One discipline per invocation — see package.json's `district` script.

    Building all three in one Blender session looked tidy and did not work:
    Bonsai keeps a map from IFC entities to Blender objects, and starting a
    second project in the same session leaves the first one's objects behind in
    a state where the collection handling walks into a None. Three processes is
    the honest fix, and it also means a failure in one discipline cannot leave
    another half-written.
    """
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = os.path.abspath(args[0] if args else "public/models/poblenou")
    discipline = (args[1] if len(args) > 1 else "STR").upper()
    if discipline not in BUILDERS:
        raise SystemExit(f"unknown discipline {discipline!r}; expected one of {sorted(BUILDERS)}")

    os.makedirs(out_dir, exist_ok=True)
    path = BUILDERS[discipline](out_dir).write(out_dir)
    kit.report(kit.verify(path, expected_origins(), require_all=False), path)


if __name__ == "__main__":
    main()
