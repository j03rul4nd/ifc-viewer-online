# ─── build-hello-world.py ─────────────────────────────────────────────────────
# Authors the reference IFC — "IFC Hello World" — with Blender + Bonsai.
#
#   npm run hello-world        (see package.json — wraps blender --background)
#
# WHY A HAND-AUTHORED MODEL, when the gallery already has eleven public ones:
# every model in the gallery came out of somebody else's exporter. That is the
# point of them — they are what real files look like. It is also why none of
# them can answer "is the viewer wrong, or is the file wrong?". Duplex is IFC2x3
# with Revit's idea of a placement tree; the bSI bridge is IFC4.3 with
# alignments. When storey navigation breaks there is no file in the set small
# enough to read end to end AND known-correct by construction.
#
# So this one is ours. Four elements, one storey, every relationship written on
# purpose, and a test (hello-world-ifc.test.ts) that asserts the exact entities
# it contains. If the viewer misreads THIS file, the viewer is wrong.
#
# WHY BLENDER + BONSAI, rather than emitting the SPF text directly: a
# hand-written .ifc is a file that happens to parse. It is not evidence that the
# structure is what a real OpenBIM tool produces, which is the only thing that
# makes a reference model worth anything. See bonsai_kit.py for what the shared
# calls are and why none of them reach past the API.
#
# THE ROOM, in metres, with the storey at z = 0:
#
#            y
#            ↑        Wall 01 (north, 4.4 long)
#        3.2 ┌────────────────────────────────┐
#            │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
#        3.0 ├──┬──────────────────────────┬──┤
#            │▓▓│                          │▓▓│
#     W  →   │▓▓│    interior 4.0 x 3.0    │▓▓│   ←  Wall 03 (east)
#     a      │▓▓│                          │▓▓│
#     l      │▓▓│                          │▓▓│
#     l      │▓▓│                          │▓▓│
#     02     └──┴──────────────────────────┴──┘ -0.2 → x
#           -0.2  0                      4.0  4.2
#
#           The slab spans the full -0.2…4.2 x -0.2…3.2 footprint, 0.2 thick,
#           top face at z = 0, so the walls stand ON it and not IN it.
#
# The south side is deliberately open: three walls read as a room, four read as
# a closed box, and a closed box hides which wall you just clicked.
#
# CONVENTIONS EVERY ELEMENT FOLLOWS, because they are what make the placements
# legible rather than merely valid:
#
#   • Local +X runs along the length, local +Y across the thickness, local +Z
#     up. That is the IFC wall convention, so the placement axes in the SPF mean
#     something when you read them.
#   • Local y = 0 is the INTERIOR face of every wall. Someone looking for the
#     inside surface of the room reads y = 0 on all three, with no special case.
#   • Nothing overlaps. Walls butt, they do not intersect, so the clash rule has
#     nothing to report and the reference model scores what it should.
#   • Everything sits within 5 m of the origin. Far-from-origin coordinates are
#     a real problem worth having a demo for; a reference model is not it.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ifcopenshell.api  # noqa: E402
import bonsai.tool as tool  # noqa: E402

import bonsai_kit as kit  # noqa: E402

# ── The model, as data ────────────────────────────────────────────────────────
# Dimensions in metres, in one table, so the numbers the geometry is built from
# and the numbers the test asserts cannot drift apart.

THICKNESS = 0.2
HEIGHT = 2.7
SLAB_DEPTH = 0.2
INTERIOR_X = 4.0
INTERIOR_Y = 3.0

FOOTPRINT_X = INTERIOR_X + 2 * THICKNESS  # 4.4
FOOTPRINT_Y = INTERIOR_Y + 2 * THICKNESS  # 3.4

# (name, description, length, origin, rotation about Z in degrees)
# The origin is the start of the wall's baseline, on its interior face; the
# rotation maps local +X onto the direction the wall runs.
WALLS = [
    (
        "Hello World Wall 01",
        "North wall - spans the full width of the room",
        FOOTPRINT_X,
        (-THICKNESS, INTERIOR_Y, 0.0),
        0.0,
    ),
    (
        "Hello World Wall 02",
        "West wall - butts into the north wall, does not intersect it",
        INTERIOR_Y + THICKNESS,
        (0.0, -THICKNESS, 0.0),
        90.0,
    ),
    (
        "Hello World Wall 03",
        "East wall - mirror of the west wall",
        INTERIOR_Y + THICKNESS,
        (INTERIOR_X, INTERIOR_Y, 0.0),
        -90.0,
    ),
]

SLAB_NAME = "Hello World Slab"
SLAB_DESCRIPTION = "Floor slab - its top face is the storey datum at z = 0"
SLAB_ORIGIN = (-THICKNESS, -THICKNESS, -SLAB_DEPTH)
SLAB_POLYLINE = [(0.0, 0.0), (FOOTPRINT_X, 0.0), (FOOTPRINT_X, FOOTPRINT_Y), (0.0, FOOTPRINT_Y)]

PROJECT_ATTRIBUTES = {
    "Name": "IFC Hello World",
    # ISO 19650 asks for all three of these and the app's own validator checks
    # for them by name. A reference model that trips its own validator would be
    # a poor reference.
    "LongName": "IFC Hello World - minimal reference model",
    "Description": "Reference delivery - smallest well-formed IFC4 model",
    "ObjectType": "Reference model",
    "Phase": "REFERENCE",
}

AUTHOR = "IFC Viewer Online"
ORGANISATION = "IFC Viewer Online"
# Frozen so the header does not change on every rebuild. It is the date the
# model was first authored, which is the only thing a timestamp here could
# honestly mean.
TIMESTAMP = "2026-08-09T00:00:00+00:00"


def name_the_spatial_structure(ifc):
    """Bonsai seeds 'My Project' / 'My Site' / …; say what this actually is."""
    project = ifc.by_type("IfcProject")[0]
    ifcopenshell.api.run("attribute.edit_attributes", ifc, product=project, attributes=PROJECT_ATTRIBUTES)

    kit.edit(
        ifc, ifc.by_type("IfcSite")[0],
        Name="Hello World Site",
        Description="Flat, unreferenced site - the model origin is the site origin",
        CompositionType="ELEMENT", RefElevation=0.0,
    )
    kit.edit(
        ifc, ifc.by_type("IfcBuilding")[0],
        Name="Hello World Building", LongName="Single-storey reference building",
        CompositionType="ELEMENT",
    )
    storey = kit.edit(
        ifc, ifc.by_type("IfcBuildingStorey")[0],
        Name="Ground Floor", LongName="Ground floor", CompositionType="ELEMENT",
        # Not optional in practice: a storey with no elevation cannot be
        # ordered, and floor-plan navigation has nothing to sort on.
        Elevation=0.0,
    )
    return storey


def build(output_path):
    ifc = kit.new_project()
    storey = name_the_spatial_structure(ifc)
    body, axis = kit.contexts(ifc)

    masonry = ifcopenshell.api.run("material.add_material", ifc, name="Masonry", category="masonry")
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete", category="concrete")
    wall_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-200-Masonry", "SOLIDWALL", masonry, THICKNESS)
    slab_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-200-Concrete", "FLOOR", concrete, SLAB_DEPTH)

    walls = []
    for name, description, length, origin, rotation_z in WALLS:
        matrix = kit.placement_matrix(origin, rotation_z)
        obj = kit.placed_object(name, matrix)
        wall = kit.add_occurrence(ifc, obj, matrix, "IfcWall", wall_type, name, description, storey)

        # The Axis representation is the wall's baseline. Plan views, wall
        # joins and quantity take-off all read it; without one a wall is just a
        # box that happens to be wall-shaped.
        kit.attach(ifc, obj, wall, ifcopenshell.api.run(
            "geometry.add_axis_representation", ifc, context=axis, axis=[(0.0, 0.0), (length, 0.0)]
        ))
        kit.attach(ifc, obj, wall, ifcopenshell.api.run(
            "geometry.add_wall_representation", ifc, context=body,
            length=length, height=HEIGHT, thickness=THICKNESS,
            direction_sense="POSITIVE", offset=0.0,
        ))
        walls.append(wall)

    slab_matrix = kit.placement_matrix(SLAB_ORIGIN)
    slab_obj = kit.placed_object(SLAB_NAME, slab_matrix)
    slab = kit.add_occurrence(
        ifc, slab_obj, slab_matrix, "IfcSlab", slab_type, SLAB_NAME, SLAB_DESCRIPTION, storey
    )
    kit.attach(ifc, slab_obj, slab, ifcopenshell.api.run(
        "geometry.add_slab_representation", ifc, context=body, depth=SLAB_DEPTH, polyline=SLAB_POLYLINE,
    ))

    # A wall's layers stack across its thickness (AXIS2); a slab's stack through
    # its depth (AXIS3). Getting this wrong is invisible in a viewer and wrong
    # everywhere else — take-off, thermal analysis, anything that reads layers.
    for element, direction in [(w, "AXIS2") for w in walls] + [(slab, "AXIS3")]:
        ifcopenshell.util.element.get_material(element).LayerSetDirection = direction

    # Property sets: the standard ones for these classes, holding the properties
    # a reader actually goes looking for. Not a survey of Pset_WallCommon — a
    # wall that answers "am I outside?" and "am I holding anything up?".
    for wall in walls:
        kit.add_pset(ifc, wall, "Pset_WallCommon", {
            "IsExternal": True, "LoadBearing": True, "Reference": "WAL-200-Masonry",
        })
    kit.add_pset(ifc, slab, "Pset_SlabCommon", {
        "IsExternal": True, "LoadBearing": True, "Reference": "SLB-200-Concrete",
    })

    kit.set_header(ifc, os.path.basename(output_path), AUTHOR, ORGANISATION, TIMESTAMP)
    kit.write(ifc, output_path)


def main():
    output_path = kit.output_path_from_argv(sys.argv, "public/HelloWorld.ifc")

    kit.deterministic_guids("hello-world")
    build(output_path)

    expected = {name: origin for name, _, _, origin, _ in WALLS}
    expected[SLAB_NAME] = SLAB_ORIGIN
    kit.report(kit.verify(output_path, expected), output_path)


if __name__ == "__main__":
    main()
