# ─── build-hotel-vela.py ──────────────────────────────────────────────────────
# Authors the sixth reference model — the sail on the Barceloneta — as ONE
# georeferenced IFC4 file standing at the tip of the spit that closes Port Vell.
#
#   npm run hotel-vela      (see package.json — wraps blender --background)
#
# ── WHY THIS ONE IS AUTHORED AND NOT GENERATED ────────────────────────────────
#
# Every other building in the map comes out of the procedural extruder, and it
# should: a city is thousands of blocks and nobody is going to model them. But
# the extruder is a STRICT SINGLE-RING VERTICAL PRISM — one outline, two z
# values, the same plan at the top as at the bottom — and this building's whole
# identity is that its plan changes with height. Handed its real OpenStreetMap
# footprint and `height=99`, the generator produces a 99 m prism: correct
# volume, correct position, and completely unrecognisable.
#
# That is the honest dividing line, and it is worth stating because it will come
# up again:
#
#   LANDMARK geometry may be specific. This file is allowed to know that this
#   particular building is a curved sail, because a landmark's silhouette is not
#   derivable from its tags.
#
#   The INFRASTRUCTURE ENGINE may not. Nothing in src/lib/geo knows this
#   building, this site, or this city — see docs/VERTICAL_INFRASTRUCTURE.md.
#
# ── WHAT IS MODELLED, AND TO WHAT DEPTH ───────────────────────────────────────
#
# The brief is silhouette, curve, mass, height, orientation, facade and position
# relative to the water — NOT a detailed BIM. So this is a massing model with an
# expressed floor line, and it stops there. It is around a hundred elements, not
# the tower's several thousand.
#
#      z                                                     the sail, seen from
#   98.80  ╷────╮                        Roof                the north-east
#          │     ╲
#          │      ╲                      the swept edge
#          │       ╲                     curves in as it
#          │        ╲                    rises; the spine
#          │         ╲                   edge stays vertical
#    0.00  └──────────╲                  Ground
#          0          96  → x (the chord)
#
# IN PLAN each storey is a LENS: a straight chord — the flat facade — and a
# circular arc bulging away from it. Both the chord's length and the arc's
# sagitta shrink with height, and the chord shrinks from ONE END ONLY, which is
# what produces a sail rather than a cone.
#
# ── ORIENTATION, honestly ─────────────────────────────────────────────────────
#
# The curved glass faces the beach and the city to the north-east; the flat back
# faces the harbour mouth to the south-west. That is taken from the building's
# known relationship to Platja de Sant Sebastià and the port entrance, and is
# good to a few degrees, not to a survey. Position is the real one.
#
# CLASH DISCIPLINE, as in every reference model here: slabs top out exactly at
# their level datum, the curtain wall stands clear of the slab edge, and the
# spandrel band sits on the floor line rather than crossing it.

import math
import os
import sys

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.util.element

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bonsai_kit as kit  # noqa: E402

PROJECT_NAME = "Hotel Vela"
PROJECT_LONG_NAME = "Sail-form hotel at the entrance to Port Vell, Barcelona"
FILE_NAME = "HotelVela.ifc"
AUTHOR = "Reference Models"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-08-28T00:00:00"

# ── Site ──────────────────────────────────────────────────────────────────────

EPSG = "EPSG:25831"
DATUM = "ETRS89"
# Placa de la Rosa dels Vents, at the seaward tip of the Barceloneta spit.
EASTINGS, NORTHINGS = 432274.81, 4579959.49
SITE_LATITUDE = (41, 22, 5, 880000)
SITE_LONGITUDE = (2, 11, 24, 720000)
# Reclaimed harbour land: a couple of metres of freeboard over mean sea level.
ORTHOGONAL_HEIGHT = 2.50
SITE_ELEVATION = ORTHOGONAL_HEIGHT

# Model +X runs along the chord to the south-east; +Y is the direction the
# curved glass bulges, to the north-east — towards the beach.
GRID_ROTATION_DEG = -45.0

# ── The sail ──────────────────────────────────────────────────────────────────

STOREY_H = 3.80
STOREYS = 26
TOTAL_H = STOREY_H * STOREYS          # 98.80 m

# Chord length: the building's width along its flat facade.
CHORD_BASE = 96.0
CHORD_TOP = 44.0
# > 1 keeps the sail full for most of its height and gathers the taper towards
# the top. Linear reads as a wedge; this reads as a sail.
CHORD_CURVE = 1.55

# Sagitta: how far the glass bulges from the chord — the building's depth.
DEPTH_BASE = 26.0
DEPTH_TOP = 15.0
DEPTH_CURVE = 1.20

# How finely the arc is faceted. Enough that the curve reads as a curve at
# street level, few enough that the file stays a file a person can open.
ARC_FACETS = 26

SLAB_T = 0.34
GLASS_T = 0.18
SPANDREL_T = 0.32
SPANDREL_H = 1.10
BACK_WALL_T = 0.40
# The glass is held BACK from the slab edge, and the spandrel band is not — so
# the band stands proud of the glass by this much and catches the sun.
#
# It was 0.12 and that was a mistake worth recording: at six centimetres on a
# 99 m elevation the floor line is invisible, and twenty-six storeys of curtain
# wall render as one flat grey sheet. It is the same lesson the tower's header
# states, and it bites harder here because this facade has nothing else on it.
FACADE_SETOUT = 0.35

# The plinth the sail stands on, and the podium that meets the esplanade.
PLINTH_H = 1.20
PLINTH_GROW = 6.0

# Service core: lifts and stairs, held against the flat facade where the plan is
# deepest, so it never pokes through the glass as the sail narrows.
CORE_W, CORE_D = 16.0, 9.0
CORE_INSET = 3.0


def chord_at(t):
    """Chord length at height fraction `t`."""
    return CHORD_BASE - (CHORD_BASE - CHORD_TOP) * (t ** CHORD_CURVE)


def depth_at(t):
    """Arc sagitta at height fraction `t`."""
    return DEPTH_BASE - (DEPTH_BASE - DEPTH_TOP) * (t ** DEPTH_CURVE)


def arc_points(width, depth, facets=ARC_FACETS):
    """The bulging edge, from (width, 0) back to (0, 0), sagitta `depth`.

    A circular arc through (0,0), (width/2, depth) and (width,0). Returned
    without its endpoints repeated, so callers can join it to a chord.
    """
    if depth <= 1e-6 or width <= 1e-6:
        return []
    radius = (width * width / 4.0 + depth * depth) / (2.0 * depth)
    cx = width / 2.0
    cy = depth - radius
    start = math.atan2(0.0 - cy, width - cx)
    end = math.atan2(0.0 - cy, 0.0 - cx)
    # Sweep the short way round, through the crown at (width/2, depth).
    if end < start:
        end += 2 * math.pi
    out = []
    for i in range(1, facets):
        a = start + (end - start) * (i / facets)
        out.append((kit.snap(cx + radius * math.cos(a)), kit.snap(cy + radius * math.sin(a))))
    return out


def lens(width, depth):
    """One storey's plan: the chord, then the arc back to the start."""
    return [(0.0, 0.0), (kit.snap(width), 0.0)] + arc_points(width, depth)


def crescent(width, depth, thickness):
    """A band following the ARC only — the curtain wall in plan.

    Outer arc out, inner arc back. The chord is not glazed: that face is the
    flat back of the building and gets a wall instead.
    """
    inner_depth = depth - thickness
    if inner_depth <= 0.5:
        return None
    # The inner arc has to span a slightly shorter chord or the band pinches to
    # nothing at the two ends and triangulates into slivers.
    inset = thickness * 1.6
    outer = [(kit.snap(width), 0.0)] + arc_points(width, depth) + [(0.0, 0.0)]
    inner = [(kit.snap(inset), kit.snap(thickness))] + \
        [(x * (width - 2 * inset) / width + inset, y * inner_depth / depth + thickness)
         for (x, y) in arc_points(width, depth)] + \
        [(kit.snap(width - inset), kit.snap(thickness))]
    return outer + [(kit.snap(x), kit.snap(y)) for (x, y) in reversed(inner)]


LEVELS = [("Ground", "Ground floor - lobby, arrival and beach frontage", 0.0)] + [
    (f"Level {i:02d}",
     "Roof - plant and terrace" if i == STOREYS else f"Level {i} - guest rooms",
     round(i * STOREY_H, 2))
    for i in range(1, STOREYS + 1)
]
LEVEL_NAMES = [name for name, _, _ in LEVELS]

CODES = {
    "slab": ("REF-SLB", "Floor slabs"),
    "curtain": ("REF-CWL", "Curtain walling"),
    "wall": ("REF-WAL", "Walls"),
    "core": ("REF-COR", "Service core"),
    "roof": ("REF-ROF", "Roof"),
}


class Model:
    """The file, and everything the build needs to add to it."""

    def __init__(self):
        kit.deterministic_guids("hotel-vela")
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

    def _spatial_structure(self):
        ifc = self.ifc
        kit.edit(
            ifc, ifc.by_type("IfcProject")[0],
            Name=PROJECT_NAME, LongName=PROJECT_LONG_NAME,
            Description="Reference model - landmark massing at the mouth of Port Vell",
            ObjectType="Reference model", Phase="REFERENCE",
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
            Name="Placa de la Rosa dels Vents",
            LongName="Seaward tip of the Barceloneta spit, at the entrance to Port Vell",
            Description="Georeferenced to ETRS89 / UTM 31N; curved facade faces north-east",
            CompositionType="ELEMENT",
            RefLatitude=SITE_LATITUDE, RefLongitude=SITE_LONGITUDE, RefElevation=SITE_ELEVATION,
        )
        building = kit.edit(
            ifc, ifc.by_type("IfcBuilding")[0],
            Name=PROJECT_NAME,
            LongName=f"Sail-form hotel, {STOREYS} storeys, {TOTAL_H:.2f} m",
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

    def plate(self, ifc_class, element_type, name, description, storey, origin, profile,
              height, pset=None, qto=None, code=None):
        """An element extruded upward from an arbitrary closed plan profile.

        This is the whole reason the building is authored: `profile` differs at
        every storey, which is exactly the degree of freedom the procedural
        extruder does not have.
        """
        matrix = kit.placement_matrix(origin)
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(
            self.ifc, obj, matrix, ifc_class, element_type, name, description,
            self.storeys[storey] if storey else None,
        )
        kit.attach(self.ifc, obj, element,
                   kit.extruded(self.ifc, self.body, profile, height))
        if pset:
            kit.add_pset(self.ifc, element, pset[0], pset[1])
        if qto:
            kit.add_qto(self.ifc, element, qto[0], qto[1])
        self.by_class.setdefault((ifc_class, code), []).append(element)
        return element

    def classify_all(self):
        for (ifc_class, code), elements in self.by_class.items():
            label = CODES.get(code or ifc_class)
            if label:
                kit.classify(self.ifc, self.classification, elements, label[0], label[1])

    def carry_type_materials(self):
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


def build(out_dir):
    m = Model()
    ifc = m.ifc

    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C35/45",
                                    category="concrete")
    glass = ifcopenshell.api.run("material.add_material", ifc, name="Solar Control Glazing",
                                 category="glass")
    aluminium = ifcopenshell.api.run("material.add_material", ifc, name="Anodised Aluminium",
                                     category="metal")
    render = ifcopenshell.api.run("material.add_material", ifc, name="White Render",
                                  category="masonry")

    slab_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-340-C35/45", "FLOOR",
                                     concrete, SLAB_T)
    plinth_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-1200-Plinth", "BASESLAB",
                                       concrete, PLINTH_H)
    roof_type = kit.add_layered_type(ifc, "IfcRoofType", "ROF-340-Terrace", "FLAT_ROOF",
                                     concrete, SLAB_T)
    cw_type = kit.add_simple_type(ifc, "IfcCurtainWallType", "CWL-180-Unitised", "NOTDEFINED",
                                  aluminium)
    glass_type = kit.add_layered_type(ifc, "IfcPlateType", "PLT-180-Glazed Unit", "SHEET",
                                      glass, GLASS_T)
    spandrel_type = kit.add_layered_type(ifc, "IfcPlateType", "PLT-320-Spandrel", "SHEET",
                                         aluminium, SPANDREL_T)
    wall_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-400-Rendered", "SOLIDWALL",
                                     render, BACK_WALL_T)
    core_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-300-Core", "SHEAR",
                                     concrete, 0.30)

    # ── The plinth ────────────────────────────────────────────────────────────
    # Grown a few metres past the sail so the building meets the esplanade
    # instead of hovering over it — on the map, the join between our geometry
    # and OpenStreetMap's is the first thing anybody notices.
    base = lens(chord_at(0.0) + PLINTH_GROW * 2, depth_at(0.0) + PLINTH_GROW)
    m.plate("IfcSlab", plinth_type, "Plinth", "Plinth meeting the esplanade",
            "Ground", (-PLINTH_GROW, -PLINTH_GROW * 0.5, -PLINTH_H),
            base, PLINTH_H, code="slab",
            pset=("Pset_SlabCommon", {"IsExternal": True, "LoadBearing": True}))

    # ── The sail ──────────────────────────────────────────────────────────────
    for i, (name, _, elevation) in enumerate(LEVELS):
        t = i / STOREYS
        width = chord_at(t)
        depth = depth_at(t)
        top = i == STOREYS

        # Floor plate. Tops out exactly at its own level datum.
        m.plate(
            "IfcRoof" if top else "IfcSlab",
            roof_type if top else slab_type,
            "Roof Slab" if top else f"{name} Slab",
            f"Floor plate, chord {width:.1f} m, depth {depth:.1f} m",
            name, (0.0, 0.0, elevation - SLAB_T), lens(width, depth), SLAB_T,
            code="roof" if top else "slab",
            qto=("Qto_SlabBaseQuantities", {"Width": round(width, 2), "Depth": round(depth, 2)}),
        )
        if top:
            break

        # The glass. A crescent following the arc, standing off the slab edge.
        band = crescent(width - FACADE_SETOUT * 2, depth - FACADE_SETOUT, GLASS_T)
        if band:
            m.plate("IfcPlate", glass_type, f"{name} Curtain Wall",
                    "Unitised solar-control glazing to the curved facade",
                    name, (FACADE_SETOUT, 0.0, elevation), band, STOREY_H,
                    code="curtain",
                    pset=("Pset_PlateCommon", {"IsExternal": True}))

        # THE FLOOR LINE. Without an expressed spandrel, twenty-six storeys of
        # curtain wall read as one undifferentiated sheet and a 99 m elevation
        # looks like a 30 m one — the single most important lesson from the
        # tower, and it applies far more strongly to a facade this smooth.
        spandrel = crescent(width, depth, SPANDREL_T)
        if spandrel:
            m.plate("IfcPlate", spandrel_type, f"{name} Spandrel",
                    "Opaque spandrel band expressing the floor line",
                    name, (0.0, 0.0, elevation), spandrel, SPANDREL_H,
                    code="curtain", pset=("Pset_PlateCommon", {"IsExternal": True}))

        # The flat back, along the chord.
        m.plate("IfcWall", wall_type, f"{name} Back Facade",
                "Rendered facade to the harbour side",
                name, (0.0, -BACK_WALL_T, elevation),
                [(0.0, 0.0), (width, 0.0), (width, BACK_WALL_T), (0.0, BACK_WALL_T)],
                STOREY_H, code="wall",
                pset=("Pset_WallCommon", {"IsExternal": True, "LoadBearing": False}))

    # ── Service core ──────────────────────────────────────────────────────────
    # Held against the flat facade, where the plan stays deepest, so it is still
    # inside the envelope at the top where the sail is narrowest.
    m.plate("IfcWall", core_type, "Service Core",
            "Lift and stair core, full height",
            "Ground", (CORE_INSET, CORE_INSET, 0.0),
            [(0.0, 0.0), (CORE_W, 0.0), (CORE_W, CORE_D), (0.0, CORE_D)],
            TOTAL_H - STOREY_H, code="core",
            pset=("Pset_WallCommon", {"IsExternal": False, "LoadBearing": True}))

    kit.add_pset(ifc, ifc.by_type("IfcBuilding")[0], "Pset_BuildingCommon", {
        "IsLandmarked": True,
        "NumberOfStoreys": STOREYS,
        "Reference": "Sail-form hotel, authored massing",
    })

    m.classify_all()
    kit.sort_unordered_aggregates(ifc)
    return m


def expected_origins():
    """Elements whose placement the build could plausibly get wrong.

    The two that matter most are the ROOF — if the sail does not top out at
    98.80 m the whole silhouette is wrong — and the CORE, which has to stay
    inside an envelope that narrows all the way up.
    """
    return {
        "Plinth": (-PLINTH_GROW, -PLINTH_GROW * 0.5, -PLINTH_H),
        "Ground Slab": (0.0, 0.0, -SLAB_T),
        "Level 13 Slab": (0.0, 0.0, round(13 * STOREY_H, 2) - SLAB_T),
        "Roof Slab": (0.0, 0.0, round(TOTAL_H, 2) - SLAB_T),
        "Service Core": (CORE_INSET, CORE_INSET, 0.0),
        "Level 01 Curtain Wall": (FACADE_SETOUT, 0.0, STOREY_H),
    }


def main():
    out_dir = kit.output_path_from_argv(sys.argv, "public/models/hotel-vela")
    os.makedirs(out_dir, exist_ok=True)
    path = build(out_dir).write(out_dir)
    kit.report(kit.verify(path, expected_origins()), path)


if __name__ == "__main__":
    main()
