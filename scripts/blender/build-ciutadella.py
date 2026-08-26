# ─── build-ciutadella.py ──────────────────────────────────────────────────────
# Authors the fifth reference model — the Ciutadella Pavilion — as ONE
# georeferenced IFC4 file standing on the Passeig de Lluís Companys, 80 m from
# the Arc de Triomf in Barcelona.
#
#   npm run ciutadella      (see package.json — wraps blender --background)
#
# WHAT THIS ONE IS FOR. The other four are about the FILE: Hello World proves
# the viewer reads a minimal one, the temple a realistic one, Poblenou a
# federated set, the tower a big one. This one is about the MAP. It exists to be
# the model we open when someone wants to see what map mode is, and everything
# about it is chosen for that:
#
#   • IT IS SOMEWHERE WORTH LOOKING. The Arc de Triomf is 80 m up the promenade
#     and the Parc de la Ciutadella starts 200 m down it — a monument, an
#     avenue of plane trees, a lake and a zoo, all inside the 1.4 km box the
#     surroundings are fetched in. A demo on an anonymous plot proves the same
#     code and shows nothing.
#   • IT IS TURNED THE WAY THE STREET IS. The promenade runs at -45.5° to the
#     map grid, and the pavilion is authored on that axis through a real
#     IfcMapConversion. A model placed by latitude alone lands square to north,
#     which on this street is visibly, unmistakably wrong — that difference is
#     the whole argument for georeferencing, and this file is where it shows.
#   • IT IS SMALL ENOUGH TO READ AND BIG ENOUGH TO SEE. One volume, 24 x 12 m,
#     a mezzanine, a gabled roof and a glazed long facade: legible from the air
#     at map scale, and still a file a person can open and follow end to end.
#
# WHERE THE PLOT CAME FROM, because "next to the Arc" is not a coordinate. The
# real OpenStreetMap reply for the site (7267 elements) was searched for the
# position on the promenade axis where a 24 x 12 m footprint has the most room:
# every candidate was measured against every mapped building and every
# carriageway edge. The chosen spot is 80 m from the Arc, dead centre of the
# esplanade, 50 m clear of the nearest building and 18 m clear of the nearest
# carriageway. The pavilion sits on the promenade, not in the traffic.
#
# THE BUILDING is an exhibition pavilion — which is what a promenade like this
# one actually gets — on a 4.0 x 6.0 m grid:
#
#      z
#   9.20  ╱╲                                    ridge
#   7.20 ╱  ╲ ─────────────────────────────┐    eaves
#        │▓▓▓│  mezzanine gallery          │
#   3.60 ├───┤ ─────────────────────────── │    mezzanine
#        │   │   exhibition hall (double   │
#        │   │   height beyond the gallery)│
#   0.00 └───┴─────────────────────────────┘    ground
#        0   8                            24  → x
#
# CLASH DISCIPLINE, the same as every reference model here and for the same
# reason — a reference model that reports itself is not a reference model:
#   • Beams butt at the column faces instead of crossing them.
#   • A column that carries the mezzanine stops at the beam soffit and starts
#     again at the slab top; the columns in the double-height half, which carry
#     nothing at that level, run through in one piece.
#   • The stair climbs OUT of the double-height hall towards the gallery edge.
#     Running it the other way puts its head through the mezzanine slab, which
#     is the one stair mistake nobody catches from a plan.
#   • The apron is a ring around the building, not a slab under it.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ifcopenshell.api  # noqa: E402
import ifcopenshell.util.element  # noqa: E402

import bonsai_kit as kit  # noqa: E402

# ── The grid, in project metres. Origin: the SW corner at ground level ────────

GRID_X = [0.0, 4.0, 8.0, 12.0, 16.0, 20.0, 24.0]
GRID_Y = [0.0, 6.0, 12.0]
X_LABELS = "ABCDEFG"
WIDTH, DEPTH = GRID_X[-1], GRID_Y[-1]

# The mezzanine covers the first two bays; the rest of the hall is double height.
MEZZ_X = GRID_X[2]

# (name, long name, elevation)
LEVELS = [
    ("Foundation", "Foundation level - pad footings", -0.90),
    ("Ground", "Ground floor - exhibition hall and foyer", 0.00),
    ("Mezzanine", "Mezzanine - gallery over the foyer", 3.60),
    ("Roof", "Roof level - eaves datum of the gable", 7.20),
]
LEVEL_Z = {name: z for name, _, z in LEVELS}

# ── Member sizes ──────────────────────────────────────────────────────────────

FOOTING, FOOTING_T = 1.60, 0.60      # pad, top at -0.30 = the ground slab soffit
SLAB_T = 0.30                        # ground slab, top face AT the level datum
MEZZ_T = 0.25                        # mezzanine slab, ditto
COLUMN = 0.30                        # square hollow section
BEAM_W, BEAM_H = 0.20, 0.40
GLAZING_T = 0.15                     # curtain wall build-up, outside the slab edge
PANEL = 3.00                         # 24.0 / 3.0 = 8 panels a side, no leftover sliver
WALL_T = 0.15                        # insulated sandwich panel, the two gable ends
ROOF_T = 0.20                        # measured vertically
EAVE = 0.60                          # roof overhang beyond the walls, all round
RIDGE_RISE = 2.00                    # eaves to ridge
APRON_W, APRON_T = 3.00, 0.15        # paved ring around the building
CANOPY_D, CANOPY_W, CANOPY_T = 3.00, 6.00, 0.20
CANOPY_COL = 0.20
DOOR_W, DOOR_H = 2.40, 2.60
RAIL_T, RAIL_H = 0.06, 1.10
STEPS, TREAD = 18, 0.28
STAIR_W = 1.40

RISER = (LEVEL_Z["Mezzanine"] - LEVEL_Z["Ground"]) / STEPS
STAIR_RUN = STEPS * TREAD

# ── Where on earth ────────────────────────────────────────────────────────────
# Passeig de Lluís Companys, Barcelona. ETRS89 / UTM zone 31N, the CRS every
# Catalan survey is delivered in and the one the app resolves without asking.
#
# The eastings/northings are the PROJECT ORIGIN — the pavilion's SW corner —
# derived from the Arc de Triomf's own position (E 431499.8 N 4582492.3) 80 m
# along the promenade axis, then back half the building's width and depth.
#
# The axis is the one that matters. -45.5° is the direction you walk from the
# Arc towards the park, and it was not guessed: it is the Arc's own passage
# axis, taken from the minimum-area rectangle of its mapped outline (28.1 x
# 12.6 m), cross-checked against the 87 segments of the promenade longer than
# 20 m, which run between -45.2° and -46.1°. Get this wrong and the pavilion is
# in the right place facing the wrong way, which is the failure that looks like
# success.

EPSG = "EPSG:25831"
DATUM = "ETRS89"
EASTINGS, NORTHINGS = 431543.18, 4582439.59
GRID_ROTATION_DEG = -45.5

# Sampled from the SAME Terrarium DEM the app draws its terrain from, at the
# zoom the app samples at. A height that disagrees with the terrain under it
# would float or bury the model the moment 3D terrain is switched on.
ORTHOGONAL_HEIGHT = 18.50

# The same point as a latitude and longitude, for IfcSite. Derived from the
# eastings/northings above, not typed in separately — two georeferencing
# statements that disagree are worse than one. The golden test re-projects them
# and fails if they drift more than half a metre apart.
SITE_LATITUDE = (41, 23, 26, 72725)
SITE_LONGITUDE = (2, 10, 52, 221232)
SITE_ELEVATION = ORTHOGONAL_HEIGHT

AUTHOR = "IFC Viewer Online"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-08-26T00:00:00+00:00"

PROJECT_NAME = "Ciutadella Pavilion"
PROJECT_LONG_NAME = "Ciutadella Pavilion - reference model, Passeig de Lluis Companys, Barcelona"

# ISO 19650 file naming: Project-Originator-Volume-Level-Type-Role-Number.
# Role Z (multidisciplinary) and one file on purpose: this is the model somebody
# drags onto the viewer at a stand, and one drag has to be the whole demo.
FILE_NAME = "BCN-IVO-ZZ-XX-M3-Z-0003.ifc"


# ── Small helpers ─────────────────────────────────────────────────────────────


def rect(width, depth):
    return [(0.0, 0.0), (width, 0.0), (width, depth), (0.0, depth)]


CODES = {
    "footing": ("REF-FTG", "Foundations"),
    "column": ("REF-COL", "Columns"),
    "beam": ("REF-BEA", "Beams"),
    "slab": ("REF-SLB", "Slabs"),
    "apron": ("REF-APR", "External paving"),
    "curtainwall": ("REF-CWL", "Curtain walling"),
    "plate": ("REF-PLT", "Glazed panels"),
    "wall": ("REF-WAL", "Walls and cladding"),
    "door": ("REF-DOO", "Doors"),
    "roof": ("REF-ROF", "Roofs"),
    "stair": ("REF-STA", "Stairs"),
    "flight": ("REF-STF", "Stair flights"),
    "railing": ("REF-RAI", "Railings"),
}


class Model:
    """The file, and everything the build needs to add to it."""

    def __init__(self):
        kit.deterministic_guids("ciutadella-pavilion")
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
            Description="Reference model - exhibition pavilion on a georeferenced city plot",
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
            Name="Passeig de Lluis Companys",
            LongName="Esplanade between the Arc de Triomf and the Parc de la Ciutadella",
            Description="Georeferenced to ETRS89 / UTM 31N, aligned to the promenade axis",
            CompositionType="ELEMENT",
            RefLatitude=SITE_LATITUDE, RefLongitude=SITE_LONGITUDE, RefElevation=SITE_ELEVATION,
        )
        building = kit.edit(
            ifc, ifc.by_type("IfcBuilding")[0],
            Name=PROJECT_NAME, LongName="Exhibition pavilion, 24.0 x 12.0 m, gabled",
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
        kit.attach(self.ifc, obj, element,
                   kit.extruded(self.ifc, self.body, rect(width, depth), height))
        self._finish(element, ifc_class, pset, qto, code)
        return element

    def swept(self, ifc_class, element_type, name, description, storey, origin, axes, profile,
              length, pset=None, qto=None, code=None):
        """An element swept along its own axis — beams, the roof, the flight."""
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

    def classify_all(self):
        for (ifc_class, code), elements in self.by_class.items():
            label = CODES.get(code or ifc_class)
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
        path = os.path.join(out_dir, FILE_NAME)
        kit.set_header(self.ifc, os.path.basename(path), AUTHOR, ORGANISATION, TIMESTAMP)
        kit.write(self.ifc, path)
        return path


# ── The build ─────────────────────────────────────────────────────────────────


def carries_mezzanine(x):
    """Grid lines under the mezzanine slab, whose columns stop for its beams."""
    return x <= MEZZ_X + 1e-9


def member_span(value, lines, size):
    """Where a member of `size` sits on a grid line — (low, high).

    PERIMETER MEMBERS GO ENTIRELY INSIDE THEIR LINE. Centring them there is the
    mistake the tower model was built with and it is invisible in plan: half the
    section hangs over the slab edge, straight through the facade that is hung
    from that edge. On this pavilion it was 54 clashes between the frame and the
    glazing, and every one of them was the same half-section of overhang.
    """
    if abs(value - lines[0]) < 1e-9:
        return (value, value + size)
    if abs(value - lines[-1]) < 1e-9:
        return (value - size, value)
    return (value - size / 2, value + size / 2)


def build(out_dir):
    m = Model()
    ifc = m.ifc

    # ── Materials and types ──────────────────────────────────────────────────
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C30/37",
                                    category="concrete")
    steel = ifcopenshell.api.run("material.add_material", ifc, name="Structural Steel S355",
                                 category="steel")
    glass = ifcopenshell.api.run("material.add_material", ifc, name="Glazing", category="glass")
    aluminium = ifcopenshell.api.run("material.add_material", ifc, name="Aluminium",
                                     category="metal")
    sandwich = ifcopenshell.api.run("material.add_material", ifc, name="Insulated Sandwich Panel",
                                    category="composite")
    seam = ifcopenshell.api.run("material.add_material", ifc, name="Standing Seam Aluminium",
                                category="metal")
    granite = ifcopenshell.api.run("material.add_material", ifc, name="Granite Paving",
                                   category="stone")
    oak = ifcopenshell.api.run("material.add_material", ifc, name="Oak", category="wood")

    footing_type = kit.add_simple_type(ifc, "IfcFootingType", "FTG-1600x1600-C30/37",
                                       "PAD_FOOTING", concrete)
    slab_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-300-C30/37", "FLOOR",
                                     concrete, SLAB_T)
    mezz_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-250-Composite", "FLOOR",
                                     concrete, MEZZ_T)
    apron_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-150-Granite Paving", "FLOOR",
                                      granite, APRON_T)
    column_type = kit.add_profiled_type(
        ifc, "IfcColumnType", "COL-SHS-300x300-S355", "COLUMN", steel,
        ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="SHS 300x300",
                          XDim=COLUMN, YDim=COLUMN),
    )
    post_type = kit.add_profiled_type(
        ifc, "IfcColumnType", "COL-SHS-200x200-S355", "COLUMN", steel,
        ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="SHS 200x200",
                          XDim=CANOPY_COL, YDim=CANOPY_COL),
    )
    beam_type = kit.add_profiled_type(
        ifc, "IfcBeamType", "BEA-200x400-S355", "BEAM", steel,
        ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="200x400",
                          XDim=BEAM_W, YDim=BEAM_H),
    )
    cw_type = kit.add_simple_type(ifc, "IfcCurtainWallType", "CWL-150-Unitised", "NOTDEFINED",
                                  aluminium)
    plate_type = kit.add_layered_type(ifc, "IfcPlateType", "PLT-150-Glazed Unit", "SHEET",
                                      glass, GLAZING_T)
    wall_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-150-Sandwich Panel", "SOLIDWALL",
                                     sandwich, WALL_T)
    roof_type = kit.add_layered_type(ifc, "IfcRoofType", "ROF-200-Standing Seam", "GABLE_ROOF",
                                     seam, ROOF_T)
    canopy_type = kit.add_layered_type(ifc, "IfcRoofType", "ROF-200-Entrance Canopy", "FLAT_ROOF",
                                       seam, CANOPY_T)
    door_type = kit.add_simple_type(ifc, "IfcDoorType", "DOO-2400x2600-Oak", "DOOR", oak)
    stair_type = kit.add_simple_type(ifc, "IfcStairType", "STA-Gallery", "STRAIGHT_RUN", steel)
    flight_type = kit.add_simple_type(ifc, "IfcStairFlightType", "STF-Gallery", "STRAIGHT", steel)
    railing_type = kit.add_simple_type(ifc, "IfcRailingType", "RAI-1100-Aluminium", "GUARDRAIL",
                                       aluminium)
    space_type = kit.add_simple_type(ifc, "IfcSpaceType", "SPA-Exhibition", "SPACE")

    eaves_z = LEVEL_Z["Roof"]
    eaves_soffit = eaves_z - BEAM_H
    mezz_z = LEVEL_Z["Mezzanine"]
    mezz_soffit = mezz_z - MEZZ_T - BEAM_H

    # ── Foundations ──────────────────────────────────────────────────────────
    for xi, x in enumerate(GRID_X):
        for yi, y in enumerate(GRID_Y):
            m.box("IfcFooting", footing_type, f"Pad Footing {X_LABELS[xi]}{yi + 1}",
                  "Reinforced concrete pad under a steel column", "Foundation",
                  (x - FOOTING / 2, y - FOOTING / 2, LEVEL_Z["Foundation"]),
                  (FOOTING, FOOTING, FOOTING_T),
                  pset=("Pset_FootingCommon", {"LoadBearing": True, "IsExternal": False,
                                               "Reference": "FTG-1600x1600-C30/37"}),
                  qto=("Qto_FootingBaseQuantities", {
                      "Length": FOOTING, "Width": FOOTING, "Height": FOOTING_T,
                      "GrossVolume": round(FOOTING * FOOTING * FOOTING_T, 4)}),
                  code="footing")

    # ── Slabs: ground, mezzanine, and the paved ring outside ─────────────────
    m.box("IfcSlab", slab_type, "Ground Floor Slab",
          "300 mm reinforced concrete slab on grade", "Ground",
          (0.0, 0.0, -SLAB_T), (WIDTH, DEPTH, SLAB_T),
          pset=("Pset_SlabCommon", {"LoadBearing": True, "IsExternal": False,
                                    "Reference": "SLB-300-C30/37"}),
          qto=("Qto_SlabBaseQuantities", {
              "Width": WIDTH, "Length": DEPTH, "Depth": SLAB_T,
              "NetArea": round(WIDTH * DEPTH, 4),
              "NetVolume": round(WIDTH * DEPTH * SLAB_T, 4)}),
          code="slab")

    m.box("IfcSlab", mezz_type, "Mezzanine Slab",
          "250 mm composite slab spanning the gallery bays", "Mezzanine",
          (0.0, 0.0, mezz_z - MEZZ_T), (MEZZ_X, DEPTH, MEZZ_T),
          pset=("Pset_SlabCommon", {"LoadBearing": True, "IsExternal": False,
                                    "Reference": "SLB-250-Composite"}),
          qto=("Qto_SlabBaseQuantities", {
              "Width": MEZZ_X, "Length": DEPTH, "Depth": MEZZ_T,
              "NetArea": round(MEZZ_X * DEPTH, 4),
              "NetVolume": round(MEZZ_X * DEPTH * MEZZ_T, 4)}),
          code="slab")

    # A ring, not a slab under the building: paving that ran under the pavilion
    # would sit inside its own foundations, and the take-off would count a floor
    # nobody can walk on.
    outer_x0, outer_y0 = -GLAZING_T, -GLAZING_T
    outer_x1, outer_y1 = WIDTH + GLAZING_T, DEPTH + GLAZING_T
    apron_runs = [
        ("South", (outer_x0 - APRON_W, outer_y0 - APRON_W),
         (outer_x1 - outer_x0 + 2 * APRON_W, APRON_W)),
        ("North", (outer_x0 - APRON_W, outer_y1),
         (outer_x1 - outer_x0 + 2 * APRON_W, APRON_W)),
        ("West", (outer_x0 - APRON_W, outer_y0), (APRON_W, outer_y1 - outer_y0)),
        ("East", (outer_x1, outer_y0), (APRON_W, outer_y1 - outer_y0)),
    ]
    for side, (ax, ay), (aw, ad) in apron_runs:
        m.box("IfcSlab", apron_type, f"Entrance Terrace {side}",
              "Granite paving around the pavilion", "Ground",
              (ax, ay, -APRON_T), (aw, ad, APRON_T),
              pset=("Pset_SlabCommon", {"LoadBearing": False, "IsExternal": True,
                                        "Reference": "SLB-150-Granite Paving"}),
              qto=("Qto_SlabBaseQuantities", {
                  "Width": round(aw, 4), "Length": round(ad, 4), "Depth": APRON_T,
                  "NetArea": round(aw * ad, 4),
                  "NetVolume": round(aw * ad * APRON_T, 4)}),
              code="apron")

    # ── Columns ──────────────────────────────────────────────────────────────
    # Under the mezzanine the column is interrupted by the floor it carries;
    # in the double-height half there is nothing to interrupt it, so it runs.
    for xi, x in enumerate(GRID_X):
        for yi, y in enumerate(GRID_Y):
            tag = f"{X_LABELS[xi]}{yi + 1}"
            cx = member_span(x, GRID_X, COLUMN)[0]
            cy = member_span(y, GRID_Y, COLUMN)[0]
            if carries_mezzanine(x):
                runs = [("Ground", LEVEL_Z["Ground"], mezz_soffit),
                        ("Mezzanine", mezz_z, eaves_soffit)]
            else:
                runs = [("Ground", LEVEL_Z["Ground"], eaves_soffit)]
            for storey, base, top in runs:
                suffix = f" - {storey}" if len(runs) > 1 else ""
                m.box("IfcColumn", column_type, f"Column {tag}{suffix}",
                      f"300 x 300 SHS steel column on line {tag}", storey,
                      (cx, cy, base), (COLUMN, COLUMN, top - base),
                      pset=("Pset_ColumnCommon", {"LoadBearing": True, "IsExternal": False,
                                                  "Reference": "COL-SHS-300x300-S355"}),
                      qto=("Qto_ColumnBaseQuantities", {
                          "Length": round(top - base, 4),
                          "CrossSectionArea": round(COLUMN ** 2, 4),
                          "GrossVolume": round(COLUMN ** 2 * (top - base), 4)}),
                      code="column")

    # ── Beams ────────────────────────────────────────────────────────────────
    beam_profile_x = rect(BEAM_W, BEAM_H)
    beam_profile_y = rect(BEAM_H, BEAM_W)

    def add_beams(level, soffit, x_lines, y_lines):
        """Beams on every span between adjacent columns, butting at the faces.

        The span is measured against the REAL faces of the two columns it runs
        between, not against "line plus half a column": on a perimeter line the
        column is not centred, so the two are different numbers and the second
        one drives the beam into the column.
        """
        for yi, y in enumerate(y_lines):
            for xi in range(len(x_lines) - 1):
                start = member_span(x_lines[xi], GRID_X, COLUMN)[1]
                span = member_span(x_lines[xi + 1], GRID_X, COLUMN)[0] - start
                a, b = X_LABELS[GRID_X.index(x_lines[xi])], X_LABELS[GRID_X.index(x_lines[xi + 1])]
                row = GRID_Y.index(y) + 1
                m.swept("IfcBeam", beam_type, f"Beam {a}{row}-{b}{row} - {level}",
                        f"200 x 400 steel beam on line {row}", level,
                        (start, member_span(y, GRID_Y, BEAM_W)[0], soffit),
                        {"x_axis": (0, 1, 0), "y_axis": (0, 0, 1)}, beam_profile_x, span,
                        pset=("Pset_BeamCommon", {"LoadBearing": True, "IsExternal": False,
                                                  "Reference": "BEA-200x400-S355"}),
                        qto=("Qto_BeamBaseQuantities", {
                            "Length": round(span, 4),
                            "CrossSectionArea": round(BEAM_W * BEAM_H, 4),
                            "GrossVolume": round(span * BEAM_W * BEAM_H, 4)}),
                        code="beam")
        for x in x_lines:
            label = X_LABELS[GRID_X.index(x)]
            for yi in range(len(y_lines) - 1):
                start = member_span(y_lines[yi], GRID_Y, COLUMN)[1]
                span = member_span(y_lines[yi + 1], GRID_Y, COLUMN)[0] - start
                m.swept("IfcBeam", beam_type, f"Beam {label}{yi + 1}-{label}{yi + 2} - {level}",
                        f"200 x 400 steel beam on line {label}", level,
                        (member_span(x, GRID_X, BEAM_W)[0], start, soffit),
                        {"x_axis": (0, 0, 1), "y_axis": (1, 0, 0)}, beam_profile_y, span,
                        pset=("Pset_BeamCommon", {"LoadBearing": True, "IsExternal": False,
                                                  "Reference": "BEA-200x400-S355"}),
                        qto=("Qto_BeamBaseQuantities", {
                            "Length": round(span, 4),
                            "CrossSectionArea": round(BEAM_W * BEAM_H, 4),
                            "GrossVolume": round(span * BEAM_W * BEAM_H, 4)}),
                        code="beam")

    add_beams("Mezzanine", mezz_soffit, [x for x in GRID_X if carries_mezzanine(x)], GRID_Y)
    add_beams("Roof", eaves_soffit, GRID_X, GRID_Y)

    # ── Envelope: glazed long facades, sandwich-panel gable ends ─────────────
    facade_h = eaves_z
    for side, y_origin, rotation in [("South", 0.0, 0.0), ("North", DEPTH + GLAZING_T, 180.0)]:
        name = f"Curtain Wall {side}"
        origin = (0.0 if side == "South" else WIDTH, y_origin - (GLAZING_T if side == "South" else 0.0), 0.0)
        matrix = kit.placement_matrix(origin, rotation)
        obj = kit.placed_object(name, matrix)
        # No body of its own: a decomposed element's geometry lives in its
        # parts. Giving the curtain wall a box AND the panels a box each would
        # draw the facade twice and let the two disagree.
        wall = kit.add_occurrence(ifc, obj, matrix, "IfcCurtainWall", cw_type, name,
                                  f"Unitised glazed facade, {side.lower()} elevation",
                                  m.storeys["Ground"])
        kit.add_pset(ifc, wall, "Pset_CurtainWallCommon",
                     {"IsExternal": True, "Reference": "CWL-150-Unitised"})
        kit.add_qto(ifc, wall, "Qto_CurtainWallBaseQuantities",
                    {"Length": WIDTH, "Height": facade_h, "Width": GLAZING_T,
                     "GrossSideArea": round(WIDTH * facade_h, 4)})
        m.by_class.setdefault(("IfcCurtainWall", "curtainwall"), []).append(wall)

        panels = []
        for i in range(int(round(WIDTH / PANEL))):
            panels.append(m.box(
                "IfcPlate", plate_type, f"Glazed Panel {side} {i + 1:02d}",
                "Unitised glazed panel, floor to eaves", None,
                kit.offset_along(origin, rotation, i * PANEL),
                (PANEL, GLAZING_T, facade_h), rotation,
                pset=("Pset_PlateCommon", {"IsExternal": True,
                                           "Reference": "PLT-150-Glazed Unit"}),
                qto=("Qto_PlateBaseQuantities", {
                    "Width": PANEL, "Length": facade_h, "Thickness": GLAZING_T,
                    "GrossArea": round(PANEL * facade_h, 4)}),
                code="plate"))
        kit.aggregate(ifc, panels, wall)

    # The gable ends take the corners: they run the full depth INCLUDING the
    # glazing build-up, so the two facades stop dead against them. They are
    # swept as the real gable outline rather than a box, because a rectangular
    # end wall leaves the triangle under the roof OPEN — a hole in the building
    # that reads, correctly, as something nobody finished.
    #
    # And the roof stops flush with them instead of overhanging the ends, which
    # is the one arrangement that closes the gable AND survives the app's own
    # clash rule: that rule compares AABBs, so anything reaching above the eaves
    # anywhere inside the roof's plan is reported as inside the roof. A gable
    # wall on the same line as the roof's end shares no plan with it at all.
    end_depth = DEPTH + 2 * GLAZING_T
    roof_slope = RIDGE_RISE / ((DEPTH + 2 * EAVE) / 2)
    # Where the roof's underside crosses the wall's own edge, so the two meet on
    # a line rather than leaving a wedge of daylight.
    gable_eave_z = facade_h + roof_slope * (EAVE - GLAZING_T)
    gable_profile = [
        (0.0, 0.0), (end_depth, 0.0), (end_depth, gable_eave_z),
        (end_depth / 2, facade_h + RIDGE_RISE), (0.0, gable_eave_z),
    ]
    gable_area = end_depth * gable_eave_z + end_depth * (facade_h + RIDGE_RISE - gable_eave_z) / 2
    for side, x_face in [("West", -WALL_T), ("East", WIDTH)]:
        wall = m.swept("IfcWall", wall_type, f"Gable End Wall {side}",
                       f"Insulated sandwich panel cladding, {side.lower()} gable", "Ground",
                       (x_face, -GLAZING_T, 0.0),
                       {"x_axis": (0, 1, 0), "y_axis": (0, 0, 1)}, gable_profile, WALL_T,
                       pset=("Pset_WallCommon", {"IsExternal": True, "LoadBearing": False,
                                                 "ThermalTransmittance": 0.22,
                                                 "Reference": "WAL-150-Sandwich Panel"}),
                       qto=("Qto_WallBaseQuantities", {
                           "Length": round(end_depth, 4),
                           "Height": round(facade_h + RIDGE_RISE, 4), "Width": WALL_T,
                           "NetSideArea": round(gable_area, 4),
                           "NetVolume": round(gable_area * WALL_T, 4)}),
                       code="wall")
        if side != "West":
            continue
        # The entrance, facing the Arc de Triomf up the promenade.
        y0 = DEPTH / 2 - DOOR_W / 2
        opening_matrix = kit.placement_matrix((x_face - 0.01, y0, 0.0))
        kit.add_opening(ifc, m.body, wall, "Opening for Entrance Door", opening_matrix,
                        rect(WALL_T + 0.02, DOOR_W), DOOR_H)
        opening = ifc.by_type("IfcOpeningElement")[-1]
        door = m.box("IfcDoor", door_type, "Entrance Door",
                     "Oak-faced double door onto the promenade", "Ground",
                     (x_face + WALL_T / 2 - 0.025, y0, 0.0), (0.05, DOOR_W, DOOR_H),
                     pset=("Pset_DoorCommon", {"IsExternal": True, "FireExit": True,
                                               "Reference": "DOO-2400x2600-Oak"}),
                     qto=("Qto_DoorBaseQuantities", {
                         "Width": DOOR_W, "Height": DOOR_H,
                         "Area": round(DOOR_W * DOOR_H, 4)}),
                     code="door")
        kit.edit(ifc, door, OverallWidth=DOOR_W, OverallHeight=DOOR_H)
        kit.fill_opening(ifc, opening, door)

    # ── Roof: one gable section swept along the ridge ────────────────────────
    # A constant-thickness pitched band, not a solid wedge: the soffit follows
    # the pitch, which is what you see from inside the hall.
    span = DEPTH + 2 * EAVE
    roof_profile = [
        (0.0, 0.0), (span / 2, RIDGE_RISE), (span, 0.0),
        (span, ROOF_T), (span / 2, RIDGE_RISE + ROOF_T), (0.0, ROOF_T),
    ]
    # Flush with the gable walls, overhanging only the long sides — see the
    # note on the gable ends for why the ends cannot overhang.
    roof_length = WIDTH
    m.swept("IfcRoof", roof_type, "Gable Roof",
            "Standing seam roof, 2.0 m rise over a 13.2 m span", "Roof",
            (0.0, -EAVE, eaves_z), {"x_axis": (0, 1, 0), "y_axis": (0, 0, 1)},
            roof_profile, roof_length,
            pset=("Pset_RoofCommon", {"IsExternal": True, "LoadBearing": False,
                                      "Reference": "ROF-200-Standing Seam"}),
            qto=("Qto_RoofBaseQuantities", {
                "GrossArea": round(roof_length * span, 4),
                "NetArea": round(roof_length * span, 4)}),
            code="roof")

    # ── Entrance canopy, on two posts ───────────────────────────────────────
    canopy_x0 = -WALL_T - CANOPY_D
    canopy_y0 = DEPTH / 2 - CANOPY_W / 2
    m.box("IfcRoof", canopy_type, "Entrance Canopy",
          "Cantilevered canopy over the entrance", "Mezzanine",
          (canopy_x0, canopy_y0, mezz_z), (CANOPY_D, CANOPY_W, CANOPY_T),
          pset=("Pset_RoofCommon", {"IsExternal": True, "LoadBearing": False,
                                    "Reference": "ROF-200-Entrance Canopy"}),
          qto=("Qto_RoofBaseQuantities", {"GrossArea": round(CANOPY_D * CANOPY_W, 4),
                                          "NetArea": round(CANOPY_D * CANOPY_W, 4)}),
          code="roof")

    for i, cy in enumerate([canopy_y0 + 0.6, canopy_y0 + CANOPY_W - 0.6 - CANOPY_COL]):
        cx = canopy_x0 + 0.6
        m.box("IfcColumn", post_type, f"Canopy Post {i + 1:02d}",
              "200 x 200 SHS post under the entrance canopy", "Ground",
              (cx, cy, 0.0), (CANOPY_COL, CANOPY_COL, mezz_z),
              pset=("Pset_ColumnCommon", {"LoadBearing": True, "IsExternal": True,
                                          "Reference": "COL-SHS-200x200-S355"}),
              qto=("Qto_ColumnBaseQuantities", {
                  "Length": mezz_z, "CrossSectionArea": round(CANOPY_COL ** 2, 4),
                  "GrossVolume": round(CANOPY_COL ** 2 * mezz_z, 4)}),
              code="column")
        m.box("IfcFooting", footing_type, f"Canopy Pad {i + 1:02d}",
              "Reinforced concrete pad under a canopy post", "Foundation",
              (cx + CANOPY_COL / 2 - 0.45, cy + CANOPY_COL / 2 - 0.45, LEVEL_Z["Foundation"]),
              (0.90, 0.90, FOOTING_T),
              pset=("Pset_FootingCommon", {"LoadBearing": True, "IsExternal": True,
                                           "Reference": "FTG-1600x1600-C30/37"}),
              qto=("Qto_FootingBaseQuantities", {
                  "Length": 0.90, "Width": 0.90, "Height": FOOTING_T,
                  "GrossVolume": round(0.90 * 0.90 * FOOTING_T, 4)}),
              code="footing")

    # ── Stair to the gallery, and the railing along its edge ────────────────
    # It climbs OUT of the double-height hall towards the mezzanine edge. The
    # other way round the head of the flight goes through the slab it lands on.
    stair_foot_x = MEZZ_X + STAIR_RUN
    stair_y = 1.20
    stair_name = "Gallery Stair"
    stair_matrix = kit.placement_matrix((stair_foot_x, stair_y, 0.0))
    stair_obj = kit.placed_object(stair_name, stair_matrix)
    stair = kit.add_occurrence(ifc, stair_obj, stair_matrix, "IfcStair", stair_type, stair_name,
                               "Straight flight from the hall up to the gallery",
                               m.storeys["Ground"])
    kit.add_pset(ifc, stair, "Pset_StairCommon", {
        "IsExternal": False, "FireExit": False, "NumberOfRiser": STEPS,
        "NumberOfTreads": STEPS, "RiserHeight": round(RISER, 4), "TreadLength": TREAD})
    kit.add_qto(ifc, stair, "Qto_StairBaseQuantities", {
        "Length": round(STAIR_RUN, 4),
        "GrossVolume": round(STAIR_W * TREAD * RISER * (STEPS * (STEPS + 1) / 2), 4)})
    m.by_class.setdefault(("IfcStair", "stair"), []).append(stair)

    profile = [(0.0, 0.0), (STAIR_RUN, 0.0)]
    for step in range(STEPS, 0, -1):
        profile.append((step * TREAD, step * RISER))
        profile.append(((step - 1) * TREAD, step * RISER))
    flight_name = "Gallery Stair Flight"
    flight_matrix = kit.placement_matrix((stair_foot_x, stair_y, 0.0),
                                         x_axis=(-1, 0, 0), y_axis=(0, 0, 1))
    flight_obj = kit.placed_object(flight_name, flight_matrix)
    flight = kit.add_occurrence(ifc, flight_obj, flight_matrix, "IfcStairFlight", flight_type,
                                flight_name, "Steel straight flight with folded plate treads",
                                storey=None)
    kit.attach(ifc, flight_obj, flight, kit.extruded(ifc, m.body, profile, STAIR_W))
    kit.add_pset(ifc, flight, "Pset_StairFlightCommon", {
        "NumberOfRiser": STEPS, "NumberOfTreads": STEPS,
        "RiserHeight": round(RISER, 4), "TreadLength": TREAD})
    kit.add_qto(ifc, flight, "Qto_StairFlightBaseQuantities", {
        "Length": round(STAIR_RUN, 4),
        "GrossVolume": round(STAIR_W * TREAD * RISER * (STEPS * (STEPS + 1) / 2), 4)})
    kit.aggregate(ifc, [flight], stair)
    m.by_class.setdefault(("IfcStairFlight", "flight"), []).append(flight)

    # Guarding, with the gap the stair arrives through left open.
    for i, (y0, y1) in enumerate([(0.0, stair_y), (stair_y + STAIR_W, DEPTH)]):
        m.box("IfcRailing", railing_type, f"Gallery Railing {i + 1:02d}",
              "Aluminium guarding along the gallery edge", "Mezzanine",
              (MEZZ_X - RAIL_T, y0, mezz_z), (RAIL_T, y1 - y0, RAIL_H),
              pset=("Pset_RailingCommon", {"IsExternal": False, "Height": RAIL_H,
                                           "Reference": "RAI-1100-Aluminium"}),
              qto=("Qto_RailingBaseQuantities", {"Length": round(y1 - y0, 4),
                                                 "Height": RAIL_H}),
              code="railing")

    # ── Spaces: three volumes that do not overlap each other ────────────────
    spaces = [
        ("Exhibition Hall", "The double-height hall", MEZZ_X, 0.0, WIDTH - MEZZ_X, DEPTH,
         LEVEL_Z["Ground"], eaves_z, True),
        ("Foyer", "Entrance and reception, under the gallery", 0.0, 0.0, MEZZ_X, DEPTH,
         LEVEL_Z["Ground"], mezz_z - MEZZ_T, True),
        ("Mezzanine Gallery", "Gallery over the foyer", 0.0, 0.0, MEZZ_X, DEPTH,
         mezz_z, eaves_z, False),
    ]
    for name, description, sx, sy, sw, sd, z0, z1, public in spaces:
        storey = "Ground" if z0 == LEVEL_Z["Ground"] else "Mezzanine"
        space_matrix = kit.placement_matrix((sx, sy, z0))
        space_obj = kit.placed_object(name, space_matrix)
        space = kit.add_occurrence(ifc, space_obj, space_matrix, "IfcSpace", space_type,
                                   name, description, storey=None)
        kit.edit(ifc, space, LongName=name, CompositionType="ELEMENT")
        kit.attach(ifc, space_obj, space, kit.extruded(ifc, m.body, rect(sw, sd), z1 - z0))
        kit.aggregate(ifc, [space], m.storeys[storey])
        kit.add_pset(ifc, space, "Pset_SpaceCommon",
                     {"IsExternal": False, "PubliclyAccessible": public,
                      "HandicapAccessible": True, "Reference": "SPA-Exhibition"})
        kit.add_qto(ifc, space, "Qto_SpaceBaseQuantities", {
            "Height": round(z1 - z0, 4), "GrossPerimeter": round(2 * (sw + sd), 4),
            "NetFloorArea": round(sw * sd, 4),
            "NetVolume": round(sw * sd * (z1 - z0), 4)})

    m.classify_all()
    return m


def expected_origins():
    """Elements whose placement the build could plausibly get wrong."""
    return {
        "Pad Footing A1": (-FOOTING / 2, -FOOTING / 2, LEVEL_Z["Foundation"]),
        "Mezzanine Slab": (0.0, 0.0, LEVEL_Z["Mezzanine"] - MEZZ_T),
        # Perimeter members sit INSIDE their grid line — see member_span.
        "Column A1 - Mezzanine": (0.0, 0.0, LEVEL_Z["Mezzanine"]),
        # A panel, not the curtain wall that hosts it: a decomposed element has
        # no body of its own, so there would be nothing to check.
        "Glazed Panel South 01": (0.0, -GLAZING_T, 0.0),
        "Gable Roof": (0.0, -EAVE, LEVEL_Z["Roof"]),
        "Entrance Canopy": (-WALL_T - CANOPY_D, DEPTH / 2 - CANOPY_W / 2, LEVEL_Z["Mezzanine"]),
        "Gallery Stair Flight": (MEZZ_X + STAIR_RUN, 1.20, 0.0),
    }


def main():
    out_dir = kit.output_path_from_argv(sys.argv, "public/models/ciutadella")
    os.makedirs(out_dir, exist_ok=True)
    path = build(out_dir).write(out_dir)
    kit.report(kit.verify(path, expected_origins()), path)


if __name__ == "__main__":
    main()
