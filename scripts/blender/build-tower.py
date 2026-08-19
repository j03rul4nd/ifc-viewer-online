# ─── build-tower.py ───────────────────────────────────────────────────────────
# Authors the fourth reference project — Torre Poblenou — as ONE multi-
# disciplinary IFC4 file, georeferenced onto the block next door to the
# Poblenou Pavilion.
#
#   npm run tower        (see package.json — wraps blender --background)
#
# WHY A FOURTH ONE, when the pavilion already proves federation and map mode.
# The pavilion is a three-storey box: correct, and completely unremarkable to
# look at. This file exists to be LOOKED AT — it is the model we point a camera
# at when showing the 3D map, the clip editor and the site context to someone
# who has thirty seconds and no interest in IFC internals. That is a real
# requirement and it drives real decisions:
#
#   • HEIGHT AND SILHOUETTE. 82 m to the mast, and the massing steps back a bay
#     off EACH end of the long axis, so both long elevations read as a ziggurat
#     rather than a slab. The first version stepped one face only and it was
#     invisible — see the note on PODIUM/TOWER_A/TOWER_B below.
#   • AN EXPRESSED FLOOR LINE. Every storey's glazing is a proud opaque spandrel
#     plus vision glass above it. Without it, sixteen storeys of curtain wall
#     read as one undifferentiated sheet and a 68 m elevation looks like a 20 m
#     one — the single biggest thing wrong with the first build.
#   • VERTICAL FINS. Full-height brise-soleil on every tower façade, standing
#     clear of the spandrel line. They are what makes the thing look designed
#     instead of extruded — they catch the sun angle as the camera moves.
#   • A GROUND PLANE. Paving, planters and an entrance canopy, so the model
#     meets the basemap instead of hovering over it. On the map the join between
#     our geometry and OpenStreetMap's is the thing people notice first.
#   • ONE FILE. The pavilion is deliberately three, to demonstrate federation.
#     This one is deliberately one, because "drag this in and press record" has
#     to be a single step.
#
# It is also the biggest thing we author — an order of magnitude past the
# pavilion's 349 elements, which is the point: a reference model that is
# obviously a real building rather than a diagram of one.
#
# THE PLOT is one block north-east of the pavilion, same CRS, same Cerdà
# rotation. Note what that does NOT buy: the app places every model at its own
# local origin and anchors the basemap to one of them, so loading this and the
# pavilion together stacks them rather than standing them side by side. This file
# is meant to be loaded ALONE on the map. Real side-by-side would mean authoring
# both buildings against one shared site origin, not two map conversions.
#
#      z            ╷ mast                             82.00
#      ↑         ┌───────┐                             72.90  Plant
#                ├───────┤                             68.40  Roof
#                │tower B│  21.6 x 14.4, L10-Roof
#            ┌───┴───────┴───┐                          43.20  Level 10 (setback)
#            │    tower A    │  36.0 x 14.4, L02-L10
#      ┌─────┴───────────────┴─────┐                     9.60  Level 02 (podium roof)
#      │          podium           │  50.4 x 28.8, Ground + L01
#      └───────────────────────────┘                     0.00  Ground
#         ▬▬▬   ▬▬▬   ▬▬▬   ▬▬▬                         -1.60  Foundation
#
# CLASH DISCIPLINE — the same rules the other three reference models keep, for
# the same reason: a reference model that reports itself is not a reference
# model.
#   • Beams butt at the column faces instead of crossing them.
#   • Columns stop at the beam soffit; beams stop at the slab soffit; every
#     slab tops out exactly at its level datum.
#   • Curtain walling hangs OUTSIDE the slab edge; the spandrel band stands proud
#     of the glass, and the fins stand clear of the spandrel.
#   • At the setback the terrace railing stops a full façade build-up short of the
#     tower above — the structural edge is 300 mm inboard of the spandrel face,
#     and stopping at the structural edge puts the railing inside the cladding.
#   • The plaza paving lies outside the podium footprint and touches it on a
#     plane. Touching is fine; overlapping is a clash.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ifcopenshell.api  # noqa: E402
import ifcopenshell.util.element  # noqa: E402

import bonsai_kit as kit  # noqa: E402

# ── The grid, in project metres. Origin: the SW corner of the podium ──────────

BAY = 7.2

# Where the tower sits in the SHARED site origin it now uses with the pavilion,
# in project metres along +X (the Cerda street direction). See "Where on earth".
# The pavilion occupies x 0..36; 57.6 is eight bays, which leaves 21.6 m between
# the two buildings' faces — a street, not a gap. Every footprint below is
# expressed relative to it, so moving the building is one number.
SITE_OFFSET_X = 57.6

# Three stacked footprints, each a whole number of bays of the one below, so
# every tower column lands on a podium column instead of on a slab.
#
# The step is SYMMETRICAL on the long axis — a bay off each end — and that is a
# correction, not a preference. The first version stepped back on one face only,
# which turned out to be invisible: on the elevation facing that face the step is
# a change of DEPTH and reads as nothing at all, and from an angle it is a small
# ledge. Taking a bay off both ends gives a ziggurat profile on both long
# elevations, which are the faces a camera actually spends its time on.
PODIUM = (SITE_OFFSET_X + 0.0, 0.0, SITE_OFFSET_X + 50.4, 28.8)     # 7 x 4 bays
TOWER_A = (SITE_OFFSET_X + 7.2, 7.2, SITE_OFFSET_X + 43.2, 21.6)    # 5 x 2 bays
TOWER_B = (SITE_OFFSET_X + 14.4, 7.2, SITE_OFFSET_X + 36.0, 21.6)   # 3 x 2 bays

# The service core. It sits INSIDE one bay rather than on the grid lines: a core
# drawn corner-to-corner on the grid puts its walls straight through the columns
# at those corners. In the pavilion that never showed up, because the walls and
# the columns live in different discipline files and nothing ever compared them.
# This model is one file, so it has to be right here.
CORE_INSET = 0.60
CORE = (SITE_OFFSET_X + 21.6 + CORE_INSET, 7.2 + CORE_INSET,
        SITE_OFFSET_X + 28.8 - CORE_INSET, 14.4 - CORE_INSET)


def member_span(coords, i, width):
    """(low, high) of a member centred on grid line `i`, flush at the perimeter.

    Interior members straddle their grid line. Perimeter ones sit wholly INSIDE
    it, so their outer face is the slab edge. Straddling them looks harmless and
    is not: the edge column then pokes half its width past the slab, straight
    through the curtain walling hung off that edge and the shading fins outside
    it. The pavilion has the same geometry and never showed it, because there
    the frame and the façade are different files and nothing compared them.
    """
    c = coords[i]
    if i == 0:
        return (c, c + width)
    if i == len(coords) - 1:
        return (c - width, c)
    return (c - width / 2, c + width / 2)


def grid_lines(footprint):
    """Column grid line positions for a footprint, on the 7.2 m module."""
    x0, y0, x1, y1 = footprint
    xs = [round(x0 + i * BAY, 4) for i in range(int(round((x1 - x0) / BAY)) + 1)]
    ys = [round(y0 + i * BAY, 4) for i in range(int(round((y1 - y0) / BAY)) + 1)]
    return xs, ys


GRID = {"P": grid_lines(PODIUM), "A": grid_lines(TOWER_A), "B": grid_lines(TOWER_B)}
FOOTPRINT = {"P": PODIUM, "A": TOWER_A, "B": TOWER_B}

X_LABELS = "ABCDEFGH"


def gridref(x, y):
    """Grid reference from a POSITION, e.g. (14.4, 7.2) -> "C2".

    Deliberately not from the index within a tier's own grid: tier A's first
    column is not tier P's first column, and naming them both "A1" makes two
    different columns share a reference. A camera never sees that; a coordinator
    reading the tree does.

    Measured from the BUILDING's own south-west corner, not from the shared site
    origin — the grid belongs to the building, and "column H1" should not become
    "column P1" because the masterplan moved it down the street.
    """
    return f"{X_LABELS[int(round((x - SITE_OFFSET_X) / BAY))]}{int(round(y / BAY)) + 1}"

# ── Levels ────────────────────────────────────────────────────────────────────
# (name, long name, elevation, which footprint the floor plate covers)
# The lobby is double height, which is why Ground -> Level 01 is 5.4 and every
# other storey is 4.2.

# The foundation datum is chosen so the top of a pad footing lands exactly on
# the soffit of the ground slab — the two touch on one plane instead of leaving
# a gap the frame appears to float over.
FOUNDATION_Z = -1.60

LEVELS = [
    ("Foundation", "Foundation level - pad footings", FOUNDATION_Z, "P"),
    ("Ground", "Ground floor - lobby and public space", 0.00, "P"),
    ("Level 01", "First floor - mezzanine and meeting rooms", 5.40, "P"),
    ("Level 02", "Second floor - offices, podium roof terrace", 9.60, "P"),
    ("Level 03", "Third floor - offices", 13.80, "A"),
    ("Level 04", "Fourth floor - offices", 18.00, "A"),
    ("Level 05", "Fifth floor - offices", 22.20, "A"),
    ("Level 06", "Sixth floor - offices", 26.40, "A"),
    ("Level 07", "Seventh floor - offices", 30.60, "A"),
    ("Level 08", "Eighth floor - offices", 34.80, "A"),
    ("Level 09", "Ninth floor - offices", 39.00, "A"),
    ("Level 10", "Tenth floor - offices, setback terrace", 43.20, "A"),
    ("Level 11", "Eleventh floor - offices", 47.40, "B"),
    ("Level 12", "Twelfth floor - offices", 51.60, "B"),
    ("Level 13", "Thirteenth floor - offices", 55.80, "B"),
    ("Level 14", "Fourteenth floor - offices", 60.00, "B"),
    ("Level 15", "Fifteenth floor - executive suite", 64.20, "B"),
    ("Roof", "Roof level - plant and terrace", 68.40, "B"),
]

LEVEL_NAMES = [name for name, _, _, _ in LEVELS]
LEVEL_Z = {name: z for name, _, z, _ in LEVELS}
LEVEL_PLATE = {name: plate for name, _, _, plate in LEVELS}

# Storeys with an occupied floor plate and a façade.
OCCUPIED = LEVEL_NAMES[1:-1]

# Which column grid carries the storey ABOVE each level datum.
def frame_above(level):
    """Footprint key of the frame standing on `level`, or None at the top."""
    index = LEVEL_NAMES.index(level)
    if index + 1 >= len(LEVELS):
        return None
    return LEVEL_PLATE[LEVEL_NAMES[index + 1]]


def next_level(level):
    index = LEVEL_NAMES.index(level)
    return LEVEL_NAMES[index + 1] if index + 1 < len(LEVELS) else None


# ── Member sizes ──────────────────────────────────────────────────────────────

SLAB_T = 0.32           # structural slab, top face AT the level datum
BEAM_W, BEAM_H = 0.35, 0.70
COLUMN = 0.50           # square
FOOTING, FOOTING_T = 2.60, 1.28   # 1.28 = |FOUNDATION_Z| - SLAB_T, see above
GLAZING_T = 0.18        # curtain wall build-up, hung outside the slab edge
CORE_WALL_T = 0.25
PARAPET_T, PARAPET_H = 0.25, 1.10
RAIL_T, RAIL_H = 0.08, 1.10
FIN_W, FIN_D = 0.28, 0.65   # brise-soleil: width along the façade, depth out

# Every storey's glazing is split into an opaque spandrel band at the floor line
# and vision glass above it, and the spandrel stands PROUD of the glass. This is
# the single change that stopped the tower reading as one uninterrupted glass
# wall sixteen storeys tall: with no floor line expressed you cannot tell how
# tall the building is, and a 68 m elevation looked exactly like a 20 m one.
SPANDREL_H = 1.20
SPANDREL_PROUD = 0.12

# The fins therefore start beyond the spandrel's outer face, not the glass line —
# otherwise the two occupy the same 120 mm and the sweep reports every one.
FIN_STANDOFF = SPANDREL_PROUD

# Total build-up of the façade, glass line to spandrel face. Anything that has to
# stop AT the building — the terrace railing stubs — stops at this, not at the
# structural edge, or it ends up inside the spandrel band.
FACADE_T = GLAZING_T + SPANDREL_PROUD
DOOR_W, DOOR_H = 1.40, 2.60
PAVING_T = 0.15
PLAZA_BAND = 9.0        # how far the paving reaches beyond the podium
CANOPY_T, CANOPY_REACH = 0.35, 6.0
PLANT_H = 4.50
MAST_R, MAST_TOP = 0.30, 82.0

# Target panel width; the real width is the run divided by a whole count, so no
# façade ever ends on a sliver.
PANEL_TARGET = 3.6

# ── Where on earth ────────────────────────────────────────────────────────────
# Poblenou, Barcelona. ETRS89 / UTM zone 31N.
#
# SHARED SITE ORIGIN, and this is the whole point of the numbers below being
# byte-identical to build-district.py's. The tower and the pavilion are two
# buildings on one site, so they get ONE project coordinate system: the same
# IfcMapConversion, the same site latitude and longitude, the same 45-degree
# Cerda rotation. The tower is then positioned WITHIN that system by
# SITE_OFFSET_X — a masterplan, which is exactly how two buildings on one plot
# are delivered.
#
# The first version gave the tower its own eastings and northings one block
# along, on the assumption that the viewer would place each model by its own map
# conversion. It does not: every IFC model is placed at its own local origin and
# the BASEMAP is anchored to one of them (both model pivots sit at (0,0,0), which
# is checkable from the scene graph). Two buildings with two map conversions
# therefore land on top of each other. Sharing the origin is what actually makes
# them stand side by side, and tower-ifc.test.ts now asserts it across the two
# files so the claim cannot rot again.

EPSG = "EPSG:25831"
DATUM = "ETRS89"
EASTINGS, NORTHINGS = 432340.0, 4583945.0
ORTHOGONAL_HEIGHT = 12.50
GRID_ROTATION_DEG = 45.0

SITE_LATITUDE = (41, 24, 15, 636000)
SITE_LONGITUDE = (2, 11, 26, 400000)
SITE_ELEVATION = 12.50

# SITE_OFFSET_X — where the tower sits in that shared system — is defined up with
# the grid, because the footprints are expressed in terms of it.

AUTHOR = "IFC Viewer Online"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-08-11T00:00:00+00:00"

PROJECT_NAME = "Torre Poblenou"
PROJECT_LONG_NAME = "Torre Poblenou - reference tower model, Barcelona 22@"

# ISO 19650: Project-Originator-Volume-Level-Type-Role-Number. Role Z is the
# multi-disciplinary one, which is what this file honestly is.
OUTPUT_FILE = "BCN-IVO-ZZ-XX-M3-Z-0002.ifc"


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


def offset_local(origin, rotation, along, outward):
    """Move a placement in its OWN axes: +X along the run, +Y outward."""
    c, s = kit.cos_deg(rotation), kit.sin_deg(rotation)
    return (
        kit.snap(origin[0] + along * c - outward * s),
        kit.snap(origin[1] + along * s + outward * c),
        origin[2],
    )


class Model:
    """The single output file, and everything the build adds to it."""

    def __init__(self):
        kit.deterministic_guids("torre-poblenou")
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
            Name=PROJECT_NAME,
            LongName=PROJECT_LONG_NAME,
            Description="Multi-disciplinary reference model - frame, envelope, core and site",
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
            # Word for word the pavilion's site. It IS the pavilion's site: two
            # buildings sharing one plot should not describe it two ways.
            Name="Poblenou Plot", LongName="Barcelona 22@ - Poblenou plot",
            Description="Georeferenced to ETRS89 / UTM 31N, aligned to the Cerda grid",
            CompositionType="ELEMENT",
            RefLatitude=SITE_LATITUDE, RefLongitude=SITE_LONGITUDE, RefElevation=SITE_ELEVATION,
        )
        building = kit.edit(
            ifc, ifc.by_type("IfcBuilding")[0],
            Name=PROJECT_NAME,
            LongName="Sixteen-storey office tower, 82.0 m to mast",
            CompositionType="ELEMENT",
        )

        storeys = {}
        first = ifc.by_type("IfcBuildingStorey")[0]
        for i, (name, long_name, elevation, _) in enumerate(LEVELS):
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
        kit.attach(self.ifc, obj, element,
                   kit.extruded(self.ifc, self.body, rect(width, depth), height))
        self._finish(element, ifc_class, pset, qto, code)
        return element

    def cylinder(self, ifc_class, element_type, name, description, storey, origin, radius, height,
                 pset=None, qto=None, code=None):
        matrix = kit.placement_matrix(origin)
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(
            self.ifc, obj, matrix, ifc_class, element_type, name, description,
            self.storeys[storey] if storey else None,
        )
        kit.attach(self.ifc, obj, element, kit.circular(self.ifc, self.body, radius, height))
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
                upright = element.is_a("IfcWall") or element.is_a("IfcPlate")
                usage.LayerSetDirection = "AXIS2" if upright else "AXIS3"

    def write(self, out_dir):
        self.carry_type_materials()
        self.set_layer_directions()
        path = os.path.join(out_dir, OUTPUT_FILE)
        kit.set_header(self.ifc, os.path.basename(path), AUTHOR, ORGANISATION, TIMESTAMP)
        kit.write(self.ifc, path)
        return path


CODES = {
    "footing": ("REF-FTG", "Foundations"),
    "column": ("REF-COL", "Columns"),
    "beam": ("REF-BEA", "Beams"),
    "slab": ("REF-SLB", "Slabs"),
    "curtainwall": ("REF-CWL", "Curtain walling"),
    "plate": ("REF-PLT", "Glazed panels"),
    "fin": ("REF-FIN", "Solar shading"),
    "wall": ("REF-WAL", "Walls"),
    "door": ("REF-DOR", "Doors"),
    "stair": ("REF-STR", "Stairs"),
    "railing": ("REF-RAI", "Railings"),
    "covering": ("REF-COV", "Coverings"),
    "site": ("REF-SIT", "Site works"),
    "plant": ("REF-PLT-EQ", "Plant"),
}


# ── Structure ─────────────────────────────────────────────────────────────────


def build_frame(m, types):
    """Footings, columns, beams and slabs, tier by tier."""
    ifc = m.ifc
    half = COLUMN / 2

    # Pad footings, one per podium grid intersection.
    xs, ys = GRID["P"]
    for xi, x in enumerate(xs):
        for yi, y in enumerate(ys):
            m.box("IfcFooting", types["footing"], f"Pad Footing {gridref(x, y)}",
                  "Reinforced concrete pad under a column", "Foundation",
                  (x - FOOTING / 2, y - FOOTING / 2, LEVEL_Z["Foundation"]),
                  (FOOTING, FOOTING, FOOTING_T),
                  pset=("Pset_FootingCommon", {"LoadBearing": True, "IsExternal": False,
                                               "Reference": "FTG-2600x2600-C40/50"}),
                  qto=("Qto_FootingBaseQuantities", {
                      "Length": FOOTING, "Width": FOOTING, "Height": FOOTING_T,
                      "GrossVolume": round(FOOTING * FOOTING * FOOTING_T, 4)}),
                  code="footing")

    # Floor plates: one per level, top face at the level datum, spanning the
    # footprint that level covers. The setback levels therefore get the LOWER
    # tier's plate, which is what makes the terrace a terrace.
    for name, _, z, plate in LEVELS:
        if name == "Foundation":
            continue
        x0, y0, x1, y1 = FOOTPRINT[plate]
        width, depth = x1 - x0, y1 - y0
        label = "Roof Slab" if name == "Roof" else f"Floor Slab - {name}"
        m.box("IfcSlab", types["slab"], label,
              f"320 mm reinforced concrete slab at {name}", name,
              (x0, y0, z - SLAB_T), (width, depth, SLAB_T),
              pset=("Pset_SlabCommon", {"LoadBearing": True, "IsExternal": name == "Roof",
                                        "Reference": "SLB-320-C40/50"}),
              qto=("Qto_SlabBaseQuantities", {
                  "Width": round(width, 4), "Length": round(depth, 4), "Depth": SLAB_T,
                  "NetArea": round(width * depth, 4),
                  "NetVolume": round(width * depth * SLAB_T, 4)}),
              code="slab")

    # Columns: from the slab they stand on to the soffit of the beams above.
    # Nothing stands ON the foundation datum — that band is the footings.
    for name, _, z, _ in LEVELS:
        upper = next_level(name)
        if upper is None or name == "Foundation":
            continue
        frame = frame_above(name)
        top = LEVEL_Z[upper] - SLAB_T - BEAM_H
        xs, ys = GRID[frame]
        for xi, x in enumerate(xs):
            for yi, y in enumerate(ys):
                cx = member_span(xs, xi, COLUMN)[0]
                cy = member_span(ys, yi, COLUMN)[0]
                m.box("IfcColumn", types["column"],
                      f"Column {gridref(x, y)} - {name}",
                      f"500 x 500 concrete column at {name}", name,
                      (cx, cy, z), (COLUMN, COLUMN, top - z),
                      pset=("Pset_ColumnCommon", {"LoadBearing": True, "IsExternal": False,
                                                  "Reference": "COL-500x500-C40/50"}),
                      qto=("Qto_ColumnBaseQuantities", {
                          "Length": round(top - z, 4),
                          "CrossSectionArea": round(COLUMN ** 2, 4),
                          "GrossVolume": round(COLUMN ** 2 * (top - z), 4)}),
                      code="column")

    # Beams: on every grid line of the frame BELOW the level, between adjacent
    # columns, butting at the column faces rather than running through them.
    beam_profile = rect(BEAM_W, BEAM_H)
    for name, _, z, _ in LEVELS:
        # Ground is cast on the footings, so the first framed level is the one
        # above it — a beam grid at the foundation datum would sit in the pads.
        if name in ("Foundation", "Ground"):
            continue
        below = LEVEL_NAMES[LEVEL_NAMES.index(name) - 1]
        frame = frame_above(below)
        soffit = z - SLAB_T - BEAM_H
        xs, ys = GRID[frame]
        # Beams run flush at the perimeter for the same reason columns do, and
        # they stop at the actual COLUMN FACES rather than at "grid line plus
        # half a column" — once the perimeter columns moved inward those two
        # stopped being the same number, and a beam that still butts against
        # where the column used to be is a beam inside a column.
        for yi, y in enumerate(ys):
            y0 = member_span(ys, yi, BEAM_W)[0]
            for xi in range(len(xs) - 1):
                start = member_span(xs, xi, COLUMN)[1]
                end = member_span(xs, xi + 1, COLUMN)[0]
                m.swept_beam(types["beam"], f"Beam {gridref(xs[xi], y)}-{gridref(xs[xi + 1], y)} - {name}",
                             name, (start, y0, soffit), end - start, 0.0, beam_profile)
        # Runs in Y are placed rotated, so the origin is the beam's MAXIMUM x.
        for xi, x in enumerate(xs):
            x0 = member_span(xs, xi, BEAM_W)[1]
            for yi in range(len(ys) - 1):
                start = member_span(ys, yi, COLUMN)[1]
                end = member_span(ys, yi + 1, COLUMN)[0]
                m.swept_beam(types["beam"], f"Beam {gridref(x, ys[yi])}-{gridref(x, ys[yi + 1])} - {name}",
                             name, (x0, start, soffit), end - start, 90.0, beam_profile)
    return ifc


def _swept_beam(self, beam_type, name, storey, origin, length, rotation, profile):
    """A beam laid along its own axis: local +X is the span, +Z is up."""
    matrix = kit.placement_matrix(origin, rotation)
    obj = kit.placed_object(name, matrix)
    element = kit.add_occurrence(self.ifc, obj, matrix, "IfcBeam", beam_type, name,
                                 "350 x 700 concrete beam", self.storeys[storey])
    # Extrude the section along local X by sweeping a Y-Z rectangle: the kit's
    # `extruded` always extrudes along local Z, so the placement does the
    # turning and the profile stays a plain rectangle.
    kit.attach(self.ifc, obj, element,
               kit.extruded(self.ifc, self.body, rect(length, BEAM_W), BEAM_H))
    self._finish(element, "IfcBeam", ("Pset_BeamCommon", {
        "LoadBearing": True, "IsExternal": False, "Reference": "BEA-350x700-C40/50"}),
        ("Qto_BeamBaseQuantities", {
            "Length": round(length, 4), "CrossSectionArea": round(BEAM_W * BEAM_H, 4),
            "GrossVolume": round(BEAM_W * BEAM_H * length, 4)}), "beam")
    return element


Model.swept_beam = _swept_beam


# ── Envelope ──────────────────────────────────────────────────────────────────


def build_envelope(m, types):
    """Curtain walling per storey per façade, plus the full-height fins."""
    ifc = m.ifc

    for level in OCCUPIED:
        z = LEVEL_Z[level]
        upper = next_level(level)
        height = LEVEL_Z[upper] - z
        # The façade follows the tier that is ENCLOSED at this level, which is
        # the frame standing on it — not the plate below, which may be a terrace.
        x0, y0, x1, y1 = FOOTPRINT[frame_above(level)]
        for side, origin_xy, rotation, run in ring(x0, y0, x1, y1, GLAZING_T):
            origin = (origin_xy[0], origin_xy[1], z)
            name = f"Curtain Wall {side} - {level}"
            matrix = kit.placement_matrix(origin, rotation)
            obj = kit.placed_object(name, matrix)
            # No body of its own: a decomposed element's geometry lives in its
            # parts. Giving the curtain wall a box AND the panels a box each
            # would draw the façade twice and let the two disagree.
            wall = kit.add_occurrence(ifc, obj, matrix, "IfcCurtainWall", types["curtainwall"],
                                      name, f"Unitised glazed facade, {side.lower()} elevation",
                                      m.storeys[level])
            kit.add_pset(ifc, wall, "Pset_CurtainWallCommon",
                         {"IsExternal": True, "Reference": "CWL-180-Unitised"})
            kit.add_qto(ifc, wall, "Qto_CurtainWallBaseQuantities",
                        {"Length": round(run, 4), "Height": round(height, 4),
                         "Width": GLAZING_T, "GrossSideArea": round(run * height, 4)})
            m.by_class.setdefault(("IfcCurtainWall", "curtainwall"), []).append(wall)

            count = max(1, round(run / PANEL_TARGET))
            panel_width = run / count
            # A spandrel band at the floor line, vision glass above it. They
            # stack in z within the same band, so they touch on one plane and
            # never overlap — and the spandrel is deeper, so it throws the
            # shadow line that makes the storey readable from the street.
            spandrel_h = min(SPANDREL_H, height * 0.45)
            vision_h = height - spandrel_h
            panels = []
            for i in range(count):
                at = kit.offset_along(origin, rotation, i * panel_width)
                panels.append(m.box(
                    "IfcPlate", types["spandrel"], f"Spandrel Panel {side} {i + 1:02d} - {level}",
                    "Opaque spandrel panel at the floor line", None,
                    at, (panel_width, GLAZING_T + SPANDREL_PROUD, spandrel_h), rotation,
                    pset=("Pset_PlateCommon", {"IsExternal": True,
                                               "Reference": "PLT-300-Spandrel"}),
                    qto=("Qto_PlateBaseQuantities", {
                        "Width": round(panel_width, 4), "Length": round(spandrel_h, 4),
                        "Thickness": round(GLAZING_T + SPANDREL_PROUD, 4),
                        "GrossArea": round(panel_width * spandrel_h, 4)}),
                    code="plate"))
                panels.append(m.box(
                    "IfcPlate", types["plate"], f"Glazed Panel {side} {i + 1:02d} - {level}",
                    "Unitised vision glass panel", None,
                    (at[0], at[1], at[2] + spandrel_h),
                    (panel_width, GLAZING_T, vision_h), rotation,
                    pset=("Pset_PlateCommon", {"IsExternal": True,
                                               "Reference": "PLT-180-Glazed Unit"}),
                    qto=("Qto_PlateBaseQuantities", {
                        "Width": round(panel_width, 4), "Length": round(vision_h, 4),
                        "Thickness": GLAZING_T,
                        "GrossArea": round(panel_width * vision_h, 4)}),
                    code="plate"))
            kit.aggregate(ifc, panels, wall)

    # Brise-soleil. One continuous fin per tier at each interior panel joint,
    # standing clear of the glass line — the element that makes the tower read
    # as designed rather than extruded, and the reason a fly-around has
    # something to catch the light on.
    tiers = [
        ("A", "Level 02", "Level 10"),
        ("B", "Level 10", "Roof"),
    ]
    for key, base_level, top_level in tiers:
        base_z = LEVEL_Z[base_level]
        height = LEVEL_Z[top_level] - base_z
        x0, y0, x1, y1 = FOOTPRINT[key]
        for side, origin_xy, rotation, run in ring(x0, y0, x1, y1, GLAZING_T):
            count = max(1, round(run / PANEL_TARGET))
            panel_width = run / count
            origin = (origin_xy[0], origin_xy[1], base_z)
            # Interior joints only: a fin on the corner would meet the fin from
            # the adjoining façade inside the same volume.
            for i in range(1, count):
                m.box("IfcMember", types["fin"],
                      f"Shading Fin {side} {i:02d} - Tier {key}",
                      "Extruded aluminium solar shading fin", base_level,
                      offset_local(origin, rotation, i * panel_width - FIN_W / 2,
                                   GLAZING_T + FIN_STANDOFF),
                      (FIN_W, FIN_D, height), rotation,
                      pset=("Pset_MemberCommon", {"IsExternal": True, "LoadBearing": False,
                                                  "Reference": "FIN-280x650-Aluminium"}),
                      qto=("Qto_MemberBaseQuantities", {
                          "Length": round(height, 4),
                          "CrossSectionArea": round(FIN_W * FIN_D, 4)}),
                      code="fin")


# ── Core, stairs, spaces ──────────────────────────────────────────────────────


def build_core(m, types):
    ifc = m.ifc
    x0, y0, x1, y1 = CORE

    for level in OCCUPIED:
        z = LEVEL_Z[level]
        top = LEVEL_Z[next_level(level)] - SLAB_T
        height = top - z
        for side, origin, rotation, length in ring(x0, y0, x1, y1, CORE_WALL_T):
            wall = m.box("IfcWall", types["wall"], f"Core Wall {side} - {level}",
                         f"Blockwork core wall, {level}", level,
                         (origin[0], origin[1], z), (length, CORE_WALL_T, height), rotation,
                         pset=("Pset_WallCommon", {"IsExternal": False, "LoadBearing": False,
                                                   "FireRating": "EI 120",
                                                   "Reference": "WAL-250-Block"}),
                         qto=("Qto_WallBaseQuantities", {
                             "Length": round(length, 4), "Height": round(height, 4),
                             "Width": CORE_WALL_T,
                             "NetSideArea": round(length * height, 4),
                             "NetVolume": round(length * height * CORE_WALL_T, 4)}),
                         code="wall")
            # One door per storey, in the south wall, cut as a real opening so
            # the void is in the wall rather than a door-shaped box in front.
            if side == "South":
                door_x = (length - DOOR_W) / 2
                opening = kit.add_opening(
                    ifc, m.body, wall, f"Core Door Opening - {level}",
                    kit.placement_matrix(offset_local((origin[0], origin[1], z), rotation,
                                                      door_x, -0.05), rotation),
                    rect(DOOR_W, CORE_WALL_T + 0.10), DOOR_H)
                door = m.box("IfcDoor", types["door"], f"Core Door - {level}",
                             "Fire-rated core access door", level,
                             offset_local((origin[0], origin[1], z), rotation, door_x, 0.0),
                             (DOOR_W, CORE_WALL_T, DOOR_H), rotation,
                             pset=("Pset_DoorCommon", {"IsExternal": False, "FireRating": "EI 60",
                                                       "Reference": "DOO-1400x2600-Steel"}),
                             qto=("Qto_DoorBaseQuantities", {
                                 "Width": DOOR_W, "Height": DOOR_H, "Area": round(DOOR_W * DOOR_H, 4)}),
                             code="door")
                kit.fill_opening(ifc, opening, door)

    # One stair per storey inside the core, as an aggregate with a flight.
    for level in OCCUPIED:
        z = LEVEL_Z[level]
        rise = LEVEL_Z[next_level(level)] - z
        name = f"Core Stair - {level}"
        matrix = kit.placement_matrix((x0 + 0.4, y0 + 0.4, z))
        obj = kit.placed_object(name, matrix)
        stair = kit.add_occurrence(ifc, obj, matrix, "IfcStair", types["stair"], name,
                                   "Precast escape stair", m.storeys[level])
        kit.add_pset(ifc, stair, "Pset_StairCommon",
                     {"FireExit": True, "Reference": "STA-Core",
                      "NumberOfRiser": int(round(rise / 0.175)), "RiserHeight": 0.175})
        m.by_class.setdefault(("IfcStair", "stair"), []).append(stair)
        flight = m.box("IfcStairFlight", types["flight"], f"Stair Flight - {level}",
                       "Straight precast flight", None,
                       (x0 + 0.4, y0 + 0.4, z), (1.40, 4.60, rise),
                       pset=("Pset_StairFlightCommon", {"Reference": "STF-Core"}),
                       code="stair")
        kit.aggregate(ifc, [flight], stair)

    # Occupied space per storey. A space is a spatial element, not a product in
    # the storey: it AGGREGATES into the storey rather than being contained by
    # it, and `m.box` would do the wrong one.
    for level in OCCUPIED:
        z = LEVEL_Z[level]
        height = LEVEL_Z[next_level(level)] - z - SLAB_T
        x0f, y0f, x1f, y1f = FOOTPRINT[frame_above(level)]
        width, depth = x1f - x0f, y1f - y0f
        name = "Entrance Hall" if level == "Ground" else f"Open Plan Office - {level}"
        matrix = kit.placement_matrix((x0f, y0f, z))
        obj = kit.placed_object(name, matrix)
        space = kit.add_occurrence(ifc, obj, matrix, "IfcSpace", types["space"], name,
                                   f"Occupiable floor plate at {level}", storey=None)
        kit.edit(ifc, space, LongName=name, CompositionType="ELEMENT")
        kit.attach(ifc, obj, space, kit.extruded(ifc, m.body, rect(width, depth), height))
        kit.aggregate(ifc, [space], m.storeys[level])
        kit.add_pset(ifc, space, "Pset_SpaceCommon",
                     {"IsExternal": False, "PubliclyAccessible": level == "Ground",
                      "HandicapAccessible": True, "Reference": "SPA-Office"})
        kit.add_qto(ifc, space, "Qto_SpaceBaseQuantities", {
            "Height": round(height, 4), "GrossPerimeter": round(2 * (width + depth), 4),
            "NetFloorArea": round(width * depth, 4),
            "NetVolume": round(width * depth * height, 4)})


# ── Terraces, roof and site ───────────────────────────────────────────────────


def build_terraces_and_roof(m, types):
    # Podium roof terrace: the full podium perimeter is exposed at Level 02,
    # because tower A is inset a whole bay on every side.
    x0, y0, x1, y1 = PODIUM
    for side, origin, rotation, length in ring(x0, y0, x1, y1, RAIL_T):
        m.box("IfcRailing", types["railing"], f"Terrace Railing {side} - Level 02",
              "Glazed balustrade to the podium roof terrace", "Level 02",
              (origin[0], origin[1], LEVEL_Z["Level 02"]), (length, RAIL_T, RAIL_H), rotation,
              pset=("Pset_RailingCommon", {"IsExternal": True, "Height": RAIL_H,
                                           "Reference": "RAI-1100-Glazed"}),
              qto=("Qto_RailingBaseQuantities", {"Length": round(length, 4)}),
              code="railing")

    # Setback terrace at Level 10. Tower B steps back a bay off EACH end, so the
    # terrace is two side strips, not a ring — and the balustrade has to be six
    # runs, because the north and south edges are interrupted where tower B
    # lands on them. Running them full length would put a railing through the
    # tower, which is exactly the sort of thing the clash sweep exists to catch.
    ax0, ay0, ax1, ay1 = TOWER_A
    bx0, _, bx1, _ = TOWER_B
    # The four stubs stop a façade build-up short of tower B, not at its
    # structural edge: the spandrel band projects 300 mm past that edge, and a
    # railing that ran to the edge would end up inside it.
    strip = [
        ("West", (ax0, ay0), 90.0, ay1 - ay0),
        ("East", (ax1, ay1), -90.0, ay1 - ay0),
        ("South West", (bx0 - FACADE_T, ay0), 180.0, bx0 - FACADE_T - ax0),
        ("South East", (ax1 + RAIL_T, ay0), 180.0, ax1 + RAIL_T - bx1 - FACADE_T),
        ("North West", (ax0 - RAIL_T, ay1), 0.0, bx0 - FACADE_T - ax0 + RAIL_T),
        ("North East", (bx1 + FACADE_T, ay1), 0.0, ax1 - bx1 - FACADE_T),
    ]
    for side, origin, rotation, length in strip:
        m.box("IfcRailing", types["railing"], f"Setback Railing {side} - Level 10",
              "Glazed balustrade to the setback terrace", "Level 10",
              (origin[0], origin[1], LEVEL_Z["Level 10"]), (length, RAIL_T, RAIL_H), rotation,
              pset=("Pset_RailingCommon", {"IsExternal": True, "Height": RAIL_H,
                                           "Reference": "RAI-1100-Glazed"}),
              qto=("Qto_RailingBaseQuantities", {"Length": round(length, 4)}),
              code="railing")

    # Roof: membrane covering, parapet, plant enclosure and the mast.
    rz = LEVEL_Z["Roof"]
    bx0, by0, bx1, by1 = TOWER_B
    m.box("IfcCovering", types["covering"], "Roof Covering",
          "Warm deck roof build-up over the structural slab", "Roof",
          (bx0, by0, rz), (bx1 - bx0, by1 - by0, 0.14),
          pset=("Pset_CoveringCommon", {"IsExternal": True, "Reference": "COV-140-Warm Deck"}),
          qto=("Qto_CoveringBaseQuantities", {"GrossArea": round((bx1 - bx0) * (by1 - by0), 4)}),
          code="covering")

    for side, origin, rotation, length in ring(bx0, by0, bx1, by1, PARAPET_T):
        m.box("IfcWall", types["parapet"], f"Parapet {side} - Roof",
              "Roof parapet upstand", "Roof",
              (origin[0], origin[1], rz), (length, PARAPET_T, PARAPET_H), rotation,
              pset=("Pset_WallCommon", {"IsExternal": True, "LoadBearing": False,
                                        "Reference": "WAL-250-Parapet"}),
              qto=("Qto_WallBaseQuantities", {
                  "Length": round(length, 4), "Height": PARAPET_H, "Width": PARAPET_T,
                  "NetSideArea": round(length * PARAPET_H, 4)}),
              code="wall")

    # Plant enclosure, set well inside the parapet so the two never touch.
    plant = (bx0 + 3.6, by0 + 3.6, bx1 - 3.6, by1 - 3.6)
    m.box("IfcBuildingElementProxy", types["plant"], "Roof Plant Enclosure",
          "Louvred enclosure to the rooftop plant", "Roof",
          (plant[0], plant[1], rz + 0.14), (plant[2] - plant[0], plant[3] - plant[1], PLANT_H),
          pset=("Pset_BuildingElementProxyCommon", {"IsExternal": True,
                                                    "Reference": "PLT-Roof Plant"}),
          qto=("Qto_BodyGeometryValidation", {
              "GrossVolume": round((plant[2] - plant[0]) * (plant[3] - plant[1]) * PLANT_H, 4)}),
          code="plant")

    mast_base = rz + 0.14 + PLANT_H
    m.cylinder("IfcBuildingElementProxy", types["plant"], "Communications Mast",
               "Rooftop communications mast", "Roof",
               ((bx0 + bx1) / 2, (by0 + by1) / 2, mast_base), MAST_R, MAST_TOP - mast_base,
               pset=("Pset_BuildingElementProxyCommon", {"IsExternal": True,
                                                         "Reference": "MST-Comms"}),
               code="plant")


def build_site(m, types):
    """Paving, planters and the entrance canopy — where the model meets the map."""
    x0, y0, x1, y1 = PODIUM
    b = PLAZA_BAND
    # Four strips around the podium, mitred so they tile without overlapping:
    # the long ones take the corners, exactly like `ring`.
    strips = [
        ("South", (x0 - b, y0 - b), (x1 - x0 + 2 * b, b)),
        ("North", (x0 - b, y1), (x1 - x0 + 2 * b, b)),
        ("West", (x0 - b, y0), (b, y1 - y0)),
        ("East", (x1, y0), (b, y1 - y0)),
    ]
    for side, origin, size in strips:
        m.box("IfcSlab", types["paving"], f"Plaza Paving {side}",
              "Granite paving to the public plaza", "Ground",
              (origin[0], origin[1], -PAVING_T), (size[0], size[1], PAVING_T),
              pset=("Pset_SlabCommon", {"LoadBearing": False, "IsExternal": True,
                                        "Reference": "SLB-150-Granite"}),
              qto=("Qto_SlabBaseQuantities", {
                  "Width": round(size[0], 4), "Length": round(size[1], 4), "Depth": PAVING_T,
                  "NetArea": round(size[0] * size[1], 4)}),
              code="site")

    # Planters along the south approach, on top of the paving. One per bay, so
    # they read as a rhythm rather than as scattered boxes.
    for i in range(int(round((x1 - x0) / BAY))):
        m.box("IfcBuildingElementProxy", types["planter"], f"Planter {i + 1:02d}",
              "Precast concrete planter", "Ground",
              (x0 + 1.8 + i * BAY, y0 - 5.4, 0.0), (4.8, 1.8, 0.9),
              pset=("Pset_BuildingElementProxyCommon", {"IsExternal": True,
                                                        "Reference": "PLA-Precast"}),
              code="site")

    # Entrance canopy: cantilevers off the south façade at the mezzanine datum,
    # stopping exactly on the glass line rather than through it.
    m.box("IfcCovering", types["canopy"], "Entrance Canopy",
          "Cantilevered entrance canopy over the south approach", "Level 01",
          (x0 + 7.2, y0 - CANOPY_REACH, LEVEL_Z["Level 01"] - CANOPY_T),
          (21.6, CANOPY_REACH - GLAZING_T, CANOPY_T),
          pset=("Pset_CoveringCommon", {"IsExternal": True, "Reference": "COV-350-Canopy"}),
          qto=("Qto_CoveringBaseQuantities", {"GrossArea": round(21.6 * (CANOPY_REACH - GLAZING_T), 4)}),
          code="site")


# ── Assembly ──────────────────────────────────────────────────────────────────


def build(out_dir):
    m = Model()
    ifc = m.ifc

    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C40/50",
                                    category="concrete")
    glass = ifcopenshell.api.run("material.add_material", ifc, name="Glazing", category="glass")
    aluminium = ifcopenshell.api.run("material.add_material", ifc, name="Aluminium",
                                     category="metal")
    block = ifcopenshell.api.run("material.add_material", ifc, name="Concrete Block",
                                 category="masonry")
    steel = ifcopenshell.api.run("material.add_material", ifc, name="Steel S355",
                                 category="steel")
    membrane = ifcopenshell.api.run("material.add_material", ifc, name="Roof Membrane",
                                    category="bitumen")
    granite = ifcopenshell.api.run("material.add_material", ifc, name="Granite",
                                   category="stone")
    # Its own material, not just aluminium again: the spandrel is what reads as
    # the floor line, so anything colouring by material should be able to tell it
    # apart from the vision glass beside it.
    spandrel_panel = ifcopenshell.api.run("material.add_material", ifc,
                                          name="Anodised Spandrel Panel", category="metal")

    types = {
        "footing": kit.add_simple_type(ifc, "IfcFootingType", "FTG-2600x2600-C40/50",
                                       "PAD_FOOTING", concrete),
        "slab": kit.add_layered_type(ifc, "IfcSlabType", "SLB-320-C40/50", "FLOOR",
                                     concrete, SLAB_T),
        "column": kit.add_profiled_type(
            ifc, "IfcColumnType", "COL-500x500-C40/50", "COLUMN", concrete,
            ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="500x500",
                              XDim=COLUMN, YDim=COLUMN)),
        "beam": kit.add_profiled_type(
            ifc, "IfcBeamType", "BEA-350x700-C40/50", "BEAM", concrete,
            ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="350x700",
                              XDim=BEAM_W, YDim=BEAM_H)),
        "curtainwall": kit.add_simple_type(ifc, "IfcCurtainWallType", "CWL-180-Unitised",
                                           "NOTDEFINED", aluminium),
        "plate": kit.add_layered_type(ifc, "IfcPlateType", "PLT-180-Glazed Unit", "SHEET",
                                      glass, GLAZING_T),
        "spandrel": kit.add_layered_type(ifc, "IfcPlateType", "PLT-300-Spandrel", "SHEET",
                                         spandrel_panel, GLAZING_T + SPANDREL_PROUD),
        "fin": kit.add_profiled_type(
            ifc, "IfcMemberType", "FIN-280x650-Aluminium", "MEMBER", aluminium,
            ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="280x650",
                              XDim=FIN_W, YDim=FIN_D)),
        "wall": kit.add_layered_type(ifc, "IfcWallType", "WAL-250-Block", "SOLIDWALL",
                                     block, CORE_WALL_T),
        "parapet": kit.add_layered_type(ifc, "IfcWallType", "WAL-250-Parapet", "PARAPET",
                                        block, PARAPET_T),
        "door": kit.add_simple_type(ifc, "IfcDoorType", "DOO-1400x2600-Steel", "DOOR", steel),
        "stair": kit.add_simple_type(ifc, "IfcStairType", "STA-Core", "STRAIGHT_RUN", concrete),
        "flight": kit.add_simple_type(ifc, "IfcStairFlightType", "STF-Core", "STRAIGHT", concrete),
        "railing": kit.add_simple_type(ifc, "IfcRailingType", "RAI-1100-Glazed", "GUARDRAIL",
                                       glass),
        "covering": kit.add_layered_type(ifc, "IfcCoveringType", "COV-140-Warm Deck", "ROOFING",
                                         membrane, 0.14),
        "canopy": kit.add_layered_type(ifc, "IfcCoveringType", "COV-350-Canopy", "ROOFING",
                                       steel, CANOPY_T),
        "paving": kit.add_layered_type(ifc, "IfcSlabType", "SLB-150-Granite", "BASESLAB",
                                       granite, PAVING_T),
        "planter": kit.add_simple_type(ifc, "IfcBuildingElementProxyType", "PLA-Precast",
                                       "NOTDEFINED", concrete),
        "plant": kit.add_simple_type(ifc, "IfcBuildingElementProxyType", "PLT-Roof Plant",
                                     "NOTDEFINED", steel),
        "space": kit.add_simple_type(ifc, "IfcSpaceType", "SPA-Office", "SPACE"),
    }

    build_frame(m, types)
    build_envelope(m, types)
    build_core(m, types)
    build_terraces_and_roof(m, types)
    build_site(m, types)
    m.classify_all(CODES)
    return m


# ── Entry point ───────────────────────────────────────────────────────────────


def expected_origins():
    """Elements whose placement the build could plausibly get wrong."""
    return {
        # Every x here carries SITE_OFFSET_X: the building's own grid starts at
        # its south-west corner, which in the shared site system is 57.6 m along.
        # A check written against 0.0 would pass a build that quietly lost the
        # masterplan offset — which is the failure this whole change is about.
        "Pad Footing A1": (PODIUM[0] - FOOTING / 2, -FOOTING / 2, LEVEL_Z["Foundation"]),
        "Floor Slab - Level 02": (PODIUM[0], PODIUM[1], LEVEL_Z["Level 02"] - SLAB_T),
        # The setback plate must follow tower A, not the podium.
        "Floor Slab - Level 11": (TOWER_B[0], TOWER_B[1], LEVEL_Z["Level 11"] - SLAB_T),
        # A1 is a corner column, so it is flush on BOTH axes — its origin is the
        # grid intersection itself, not the intersection minus half a column.
        "Column A1 - Ground": (PODIUM[0], 0.0, 0.0),
        # A panel, not the curtain wall that hosts it: a decomposed element has
        # no body of its own, so there would be nothing to check. The vision
        # glass starts a spandrel's height up, which is the whole point of it.
        "Spandrel Panel North 01 - Ground": (PODIUM[0] - GLAZING_T, PODIUM[3], 0.0),
        "Glazed Panel North 01 - Ground": (PODIUM[0] - GLAZING_T, PODIUM[3], SPANDREL_H),
        "Roof Covering": (TOWER_B[0], TOWER_B[1], LEVEL_Z["Roof"]),
        "Entrance Canopy": (PODIUM[0] + 7.2, PODIUM[1] - CANOPY_REACH,
                            LEVEL_Z["Level 01"] - CANOPY_T),
    }


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = os.path.abspath(args[0] if args else "public/models/torre-poblenou")
    os.makedirs(out_dir, exist_ok=True)
    path = build(out_dir).write(out_dir)
    kit.report(kit.verify(path, expected_origins()), path)


if __name__ == "__main__":
    main()
