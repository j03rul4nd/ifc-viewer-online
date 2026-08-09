# ─── build-temple.py ──────────────────────────────────────────────────────────
# Authors the second reference IFC — a Japanese temple main hall (hondō) —
# with Blender + Bonsai.
#
#   npm run temple        (see package.json — wraps blender --background)
#
# WHY A SECOND REFERENCE MODEL. IFC Hello World answers "is the viewer wrong or
# is the file wrong?" for four elements and one storey. It cannot answer it for
# anything a real delivery contains: three storeys stacked at different
# elevations, a column grid, openings that void their host and are filled by
# doors, an occupiable space with quantities on it, an element that decomposes
# into parts, a sloped roof. Every one of those is a distinct thing to get
# wrong, and none of them appear in a four-element file.
#
# So this is the same promise at the next size up: ~85 elements, every one
# placed on purpose, and the whole model still scores 100/100 on our own
# validator with zero issues. That is the point of it — not that it is pretty,
# but that "realistic" and "perfect" are demonstrated to be compatible.
#
# WHY A TEMPLE, specifically: a Buddhist main hall is a post-and-beam frame on a
# stone podium. Its structure is legible — you can see the grid, the columns,
# the head ties, the bracket sets and the roof as separate things — where a
# modern office is a box with the interesting parts hidden. It also uses
# elements a house would not (IfcMember bracket sets, a raised veranda, a
# separate podium storey), which is exactly the coverage this file is for.
#
# THE HALL, in metres. 5 bays x 4 bays on a 2.4 m grid, facing south (-Y):
#
#     PLAN                                    SECTION (looking along +X)
#     y                                       z
#     ↑  ┌─────────────────────────┐          ↑         ridge 9.6
#  10.8  │ engawa veranda          │        10 │           /\
#   9.6  ├──●──●──●──●──●──●───────┤           │         /    \
#        │  │              │       │         5 │  eave /        \  eave 5.1
#   7.2  │  ●              ●       │           │  ─────────────────
#        │      ○      ○           │  naijin   │  ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮   columns
#   4.8  │  ●              ●       │           │  ═════════════════ deck 1.02
#        │      ○      ○           │         0 │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ podium
#   2.4  │  ●              ●       │
#        │  │              │       │          ● perimeter column   ○ naijin
#     0  ├──●──●──●──●──●──●───────┤
#        │   ▲ doors     ▲         │
#  -1.2  └───────┬───┬───────────--┘
#            kizahashi steps
#       -1.2  0        12.0  13.2
#
# WHAT MAKES IT SCORE 100, which is the whole exercise:
#
#   • Nothing intersects. Walls sit BETWEEN columns, not through them; head ties
#     butt at the corners instead of crossing; brackets sit on the ties and the
#     roof sits on the brackets, each touching the one below at exactly one
#     plane. Real timber frames interpenetrate — modelling them as butting
#     segments is both honest at this level of detail and the only way an
#     AABB clash check has nothing to say.
#   • Every element is named, typed, classified, has a property set, has base
#     quantities, and knows what it is made of.
#   • Every storey has an elevation, and they ascend.
#   • Openings are real IfcOpeningElements that void their wall and are filled
#     by the door or window — not holes drawn into a wall profile.
#
# THE ONE PLACE REALISM WAS TRADED FOR HONESTY: the classification is our own
# ("Reference Element Classification"), not Uniclass. Inventing plausible-looking
# Uniclass codes in a model held up as an example of a correct file would be
# worse than having none — somebody would copy them.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ifcopenshell.api  # noqa: E402
import ifcopenshell.util.element  # noqa: E402

import bonsai_kit as kit  # noqa: E402

# ── The grid ──────────────────────────────────────────────────────────────────

BAY = 2.4
X_LINES = [0.0, 2.4, 4.8, 7.2, 9.6, 12.0]           # A … F
Y_LINES = [0.0, 2.4, 4.8, 7.2, 9.6]                 # 1 … 5
X_LABELS = "ABCDEF"
HALL_X, HALL_Y = X_LINES[-1], Y_LINES[-1]           # 12.0 x 9.6

# ── Levels, in metres above the site datum ────────────────────────────────────

PODIUM_TOP = 0.9      # top of the stone kidan
DECK_TOP = 1.02       # walking level: 120 mm of cedar deck on the podium
COLUMN_TOP = 4.32     # heads of the pillars
TIE_TOP = 4.62        # top of the head ties (kashiranuki)
BRACKET_TOP = 5.10    # top of the bracket sets (tokyō) — the roof bears here
RIDGE_SOFFIT = 9.60

# ── Member sizes ──────────────────────────────────────────────────────────────

PODIUM_MARGIN = 2.0       # stone podium beyond the hall footprint
VERANDA = 1.2             # engawa depth beyond the hall
DECK_DEPTH = 0.12
COLUMN_RADIUS = 0.18
WALL_T = 0.16
TIE_W, TIE_H = 0.24, 0.30
BRACKET, BRACKET_H = 0.60, BRACKET_TOP - TIE_TOP
EAVE = 2.8                # roof overhang beyond the hall footprint
ROOF_T = 0.40             # measured vertically
RAIL_T, RAIL_H = 0.08, 0.50
STEP_RISE, STEP_TREAD, STEPS = 0.30, 0.45, 3

COLUMN_H = COLUMN_TOP - DECK_TOP
WALL_H = COLUMN_TOP - DECK_TOP
SEGMENT = BAY - 2 * COLUMN_RADIUS   # clear span of wall between two columns

# ── Openings ──────────────────────────────────────────────────────────────────

DOOR_W, DOOR_H = 1.60, 2.20
WINDOW_W, WINDOW_H, WINDOW_SILL = 1.20, 1.00, 2.40
REVEAL = 0.01              # how far an opening runs proud of its wall face

# Which bays get what. Bay i spans X_LINES[i] … X_LINES[i+1].
DOOR_BAYS = [1, 2, 3]      # the three central bays of the south front
WINDOW_BAYS = [1, 2]       # bays on each side wall, spanning Y_LINES[i] … [i+1]

# ── Naming ────────────────────────────────────────────────────────────────────

PROJECT_ATTRIBUTES = {
    "Name": "Japanese Temple - Main Hall",
    "LongName": "Reference model - Buddhist temple main hall (hondo)",
    "Description": "Reference delivery - realistic timber-frame hall, IFC4",
    "ObjectType": "Reference model",
    "Phase": "REFERENCE",
}

AUTHOR = "IFC Viewer Online"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-08-09T00:00:00+00:00"

# Kyoto, near the eastern hills. Level 20/40 georeferencing (IfcSite lat/long),
# which is what the overwhelming majority of real files carry and what the
# app's georeference ladder reads when there is no IfcMapConversion. Project
# north is true north, so TrueNorth stays null — the hall faces south, as one
# does, which here means the entrance front is at -Y.
SITE_LATITUDE = (34, 59, 41, 640000)
SITE_LONGITUDE = (135, 47, 6, 0)
SITE_ELEVATION = 45.0


# ── Helpers ───────────────────────────────────────────────────────────────────


def rect(width, depth):
    """A closed rectangular outline from the local origin — the common profile."""
    return [(0.0, 0.0), (width, 0.0), (width, depth), (0.0, depth)]


def box(ifc, body, storey, ifc_class, element_type, name, description, origin, size, pset, qto):
    """A rectangular element: origin is its minimum corner, size is (x, y, z)."""
    width, depth, height = size
    matrix = kit.placement_matrix(origin)
    obj = kit.placed_object(name, matrix)
    element = kit.add_occurrence(ifc, obj, matrix, ifc_class, element_type, name, description, storey)
    kit.attach(ifc, obj, element, kit.extruded(ifc, body, rect(width, depth), height))
    if pset:
        kit.add_pset(ifc, element, pset[0], pset[1])
    if qto:
        kit.add_qto(ifc, element, qto[0], qto[1])
    return element


def slab(ifc, body, storey, element_type, name, description, origin, size, is_external):
    width, depth, thickness = size
    return box(
        ifc, body, storey, "IfcSlab", element_type, name, description, origin, size,
        ("Pset_SlabCommon", {"IsExternal": is_external, "LoadBearing": True}),
        ("Qto_SlabBaseQuantities", {
            "Width": width, "Length": depth, "Depth": thickness,
            "NetArea": round(width * depth, 4), "NetVolume": round(width * depth * thickness, 4),
        }),
    )


# ── Spatial structure ─────────────────────────────────────────────────────────


def spatial_structure(ifc):
    kit.edit(
        ifc, ifc.by_type("IfcProject")[0], **PROJECT_ATTRIBUTES,
    )
    kit.edit(
        ifc, ifc.by_type("IfcSite")[0],
        Name="Temple Precinct", LongName="Temple precinct, Kyoto",
        Description="Level 40 georeferencing - IfcSite latitude and longitude only",
        CompositionType="ELEMENT",
        RefLatitude=SITE_LATITUDE, RefLongitude=SITE_LONGITUDE, RefElevation=SITE_ELEVATION,
    )
    building = kit.edit(
        ifc, ifc.by_type("IfcBuilding")[0],
        Name="Main Hall", LongName="Hondo - main worship hall", CompositionType="ELEMENT",
    )
    # Bonsai seeds one storey; it becomes the podium, and the other two are
    # added beside it. Three levels rather than one because a stone base, a
    # raised timber floor and a roof structure are three different things to a
    # quantity surveyor, and because a single-storey model never exercises
    # storey-relative placement.
    podium = kit.edit(
        ifc, ifc.by_type("IfcBuildingStorey")[0],
        Name="Stone Podium", LongName="Kidan - stone podium and approach steps",
        CompositionType="ELEMENT", Elevation=0.0,
    )
    hall = kit.add_storey(ifc, building, "Main Hall", "Hondo - raised timber floor", PODIUM_TOP)
    roof = kit.add_storey(ifc, building, "Roof Structure", "Kashiranuki, tokyo and roof", COLUMN_TOP)
    return podium, hall, roof


# ── Build ─────────────────────────────────────────────────────────────────────


def circle_profile(ifc):
    return ifc.create_entity("IfcCircleProfileDef", ProfileType="AREA", ProfileName="D360",
                             Radius=COLUMN_RADIUS)


def tie_profile(ifc):
    return ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="240x300",
                             XDim=TIE_W, YDim=TIE_H)


def bracket_profile(ifc):
    return ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="600x600",
                             XDim=BRACKET, YDim=BRACKET)


def materials(ifc):
    return {
        name: ifcopenshell.api.run("material.add_material", ifc, name=name, category=category)
        for name, category in [
            ("Granite", "stone"),
            ("Japanese Cedar", "wood"),
            ("Hinoki Cypress", "wood"),
            ("Earthen Plaster", "plaster"),
            ("Clay Roof Tile", "ceramic"),
        ]
    }


def types(ifc, mat):
    """One construction type per element kind. Layer sets where layers are real."""
    return {
        "podium": kit.add_layered_type(ifc, "IfcSlabType", "SLB-900-Granite Podium", "BASESLAB",
                                       mat["Granite"], PODIUM_TOP),
        "deck": kit.add_layered_type(ifc, "IfcSlabType", "SLB-120-Cedar Deck", "FLOOR",
                                     mat["Japanese Cedar"], DECK_DEPTH),
        "wall": kit.add_layered_type(ifc, "IfcWallType", "WAL-160-Earthen Plaster", "SOLIDWALL",
                                     mat["Earthen Plaster"], WALL_T),
        "roof": kit.add_layered_type(ifc, "IfcRoofType", "ROF-400-Clay Tile", "GABLE_ROOF",
                                     mat["Clay Roof Tile"], ROOF_T),
        # Linear members get profile sets, not layer sets: a round pillar has no
        # layers to stack across a thickness, it has a cross-section swept along
        # its length. The profiles below are the same ones the geometry uses.
        "column": kit.add_profiled_type(ifc, "IfcColumnType", "COL-D360-Hinoki", "COLUMN",
                                        mat["Hinoki Cypress"], circle_profile(ifc)),
        "tie": kit.add_profiled_type(ifc, "IfcBeamType", "BEA-240x300-Kashiranuki", "BEAM",
                                     mat["Hinoki Cypress"], tie_profile(ifc)),
        "bracket": kit.add_profiled_type(ifc, "IfcMemberType", "MEM-600-Tokyo Bracket Set", "POST",
                                         mat["Hinoki Cypress"], bracket_profile(ifc)),
        "door": kit.add_simple_type(ifc, "IfcDoorType", "DOO-1600x2200-Sankarado", "DOOR",
                                    mat["Hinoki Cypress"]),
        "window": kit.add_simple_type(ifc, "IfcWindowType", "WIN-1200x1000-Renjimado", "WINDOW",
                                      mat["Hinoki Cypress"]),
        "railing": kit.add_simple_type(ifc, "IfcRailingType", "RAI-500-Kouran", "BALUSTRADE",
                                       mat["Japanese Cedar"]),
        "stair": kit.add_simple_type(ifc, "IfcStairType", "STA-Kizahashi", "STRAIGHT_RUN",
                                     mat["Granite"]),
        "flight": kit.add_simple_type(ifc, "IfcStairFlightType", "STF-Kizahashi", "STRAIGHT",
                                      mat["Granite"]),
        # No material: IfcRelAssociatesMaterial's AllowedElements rule rejects
        # IfcSpaceType, and rightly so — a room is the absence of material.
        "space": kit.add_simple_type(ifc, "IfcSpaceType", "SPA-Naijin", "SPACE"),
    }


def build_podium(ifc, body, storey, ty):
    """The kidan and the approach steps."""
    origin = (-PODIUM_MARGIN, -PODIUM_MARGIN, 0.0)
    size = (HALL_X + 2 * PODIUM_MARGIN, HALL_Y + 2 * PODIUM_MARGIN, PODIUM_TOP)
    podium = slab(ifc, body, storey, ty["podium"], "Kidan Stone Podium",
                  "Dressed granite base the whole hall stands on", origin, size, True)

    # An IfcStair that decomposes into its flight — the standard way to model a
    # stair, and the reason RULE_ORPHAN_ELEMENT has to understand aggregation:
    # only the stair is contained in the storey, the flight hangs off it.
    stair_run = STEPS * STEP_TREAD
    stair_origin = (X_LINES[2], -PODIUM_MARGIN - stair_run, 0.0)
    stair_matrix = kit.placement_matrix(stair_origin)
    stair_obj = kit.placed_object("Kizahashi Steps", stair_matrix)
    stair = kit.add_occurrence(ifc, stair_obj, stair_matrix, "IfcStair", ty["stair"],
                               "Kizahashi Steps", "Stone approach steps on the south front", storey)
    kit.add_pset(ifc, stair, "Pset_StairCommon", {
        "IsExternal": True, "NumberOfRiser": STEPS, "NumberOfTreads": STEPS,
        "RiserHeight": STEP_RISE, "TreadLength": STEP_TREAD,
    })
    kit.add_qto(ifc, stair, "Qto_StairBaseQuantities", {
        "Length": round(stair_run, 4),
        "GrossVolume": round(BAY * STEP_TREAD * STEP_RISE * (STEPS * (STEPS + 1) / 2), 4),
    })

    # Side elevation of the steps, extruded along the width: local +X runs along
    # world +Y (out from the podium) and local +Y is up, so the profile is drawn
    # exactly as a section drawing would show it.
    profile = [(0.0, 0.0), (stair_run, 0.0)]
    for step in range(STEPS, 0, -1):
        profile.append((step * STEP_TREAD, step * STEP_RISE))
        profile.append(((step - 1) * STEP_TREAD, step * STEP_RISE))
    flight_matrix = kit.placement_matrix(stair_origin, x_axis=(0, 1, 0), y_axis=(0, 0, 1))
    flight_obj = kit.placed_object("Kizahashi Stair Flight", flight_matrix)
    flight = kit.add_occurrence(ifc, flight_obj, flight_matrix, "IfcStairFlight", ty["flight"],
                                "Kizahashi Stair Flight", "Three granite treads", storey=None)
    kit.attach(ifc, flight_obj, flight, kit.extruded(ifc, body, profile, BAY))
    ifcopenshell.api.run("aggregate.assign_object", ifc, products=[flight], relating_object=stair)
    kit.add_pset(ifc, flight, "Pset_StairFlightCommon", {
        "NumberOfRiser": STEPS, "NumberOfTreads": STEPS,
        "RiserHeight": STEP_RISE, "TreadLength": STEP_TREAD,
    })
    kit.add_qto(ifc, flight, "Qto_StairFlightBaseQuantities", {
        "Length": round(stair_run, 4),
        "GrossVolume": round(BAY * STEP_TREAD * STEP_RISE * (STEPS * (STEPS + 1) / 2), 4),
    })
    return podium, stair, flight


def build_floor(ifc, body, storey, ty):
    """The hall floor and the four engawa decks that ring it."""
    decks = [slab(
        ifc, body, storey, ty["deck"], "Hall Floor", "Cedar boarding over the podium",
        (0.0, 0.0, PODIUM_TOP), (HALL_X, HALL_Y, DECK_DEPTH), False,
    )]
    # Four separate decks rather than one ring, because a ring is not a shape a
    # single extrusion can be and a slab with a hole in it would be a lie about
    # how a veranda is built.
    for name, origin, size in [
        ("Engawa Deck (South)", (-VERANDA, -VERANDA, PODIUM_TOP), (HALL_X + 2 * VERANDA, VERANDA, DECK_DEPTH)),
        ("Engawa Deck (North)", (-VERANDA, HALL_Y, PODIUM_TOP), (HALL_X + 2 * VERANDA, VERANDA, DECK_DEPTH)),
        ("Engawa Deck (West)", (-VERANDA, 0.0, PODIUM_TOP), (VERANDA, HALL_Y, DECK_DEPTH)),
        ("Engawa Deck (East)", (HALL_X, 0.0, PODIUM_TOP), (VERANDA, HALL_Y, DECK_DEPTH)),
    ]:
        decks.append(slab(ifc, body, storey, ty["deck"], name,
                          "Open veranda decking outside the wall line", origin, size, True))
    return decks


def build_columns(ifc, body, storey, ty):
    """The pillar grid: perimeter posts plus the four naijin pillars."""
    columns = []
    for xi, x in enumerate(X_LINES):
        for yi, y in enumerate(Y_LINES):
            perimeter = xi in (0, len(X_LINES) - 1) or yi in (0, len(Y_LINES) - 1)
            naijin = xi in (2, 3) and yi in (1, 3)
            if not perimeter and not naijin:
                continue
            name = f"Hashira Column {X_LABELS[xi]}{yi + 1}"
            description = "Perimeter pillar" if perimeter else "Naijin pillar - inner sanctuary"
            matrix = kit.placement_matrix((x, y, DECK_TOP))
            obj = kit.placed_object(name, matrix)
            column = kit.add_occurrence(ifc, obj, matrix, "IfcColumn", ty["column"], name, description, storey)
            kit.attach(ifc, obj, column, kit.circular(ifc, body, COLUMN_RADIUS, COLUMN_H, "D360"))
            kit.add_pset(ifc, column, "Pset_ColumnCommon", {
                "IsExternal": perimeter, "LoadBearing": True, "Reference": "COL-D360-Hinoki",
            })
            area = round(3.141592653589793 * COLUMN_RADIUS ** 2, 4)
            kit.add_qto(ifc, column, "Qto_ColumnBaseQuantities", {
                "Length": COLUMN_H, "CrossSectionArea": area,
                "OuterSurfaceArea": round(2 * 3.141592653589793 * COLUMN_RADIUS * COLUMN_H, 4),
                "GrossVolume": round(area * COLUMN_H, 4),
            })
            columns.append((column, perimeter, x, y))
    return columns


def wall_segments():
    """Every wall panel, as (name, side, origin, rotation, length).

    Panels span between two pillars and stop at their faces, so no wall ever
    intersects a column. Each is centred on its grid line: the origin sits half
    a thickness off the line, on the side the local +Y axis grows away from.
    """
    half = WALL_T / 2
    out = []
    for i in range(len(X_LINES) - 1):
        start = X_LINES[i] + COLUMN_RADIUS
        out.append((f"South Wall Panel {i + 1}", "south", (start, -half, DECK_TOP), 0.0, SEGMENT))
        out.append((f"North Wall Panel {i + 1}", "north", (start, HALL_Y - half, DECK_TOP), 0.0, SEGMENT))
    for i in range(len(Y_LINES) - 1):
        start = Y_LINES[i] + COLUMN_RADIUS
        # Rotated a quarter turn so local +X still runs along the wall.
        out.append((f"West Wall Panel {i + 1}", "west", (half, start, DECK_TOP), 90.0, SEGMENT))
        out.append((f"East Wall Panel {i + 1}", "east",
                    (HALL_X - half, Y_LINES[i + 1] - COLUMN_RADIUS, DECK_TOP), -90.0, SEGMENT))
    return out


def build_walls(ifc, body, storey, ty):
    walls = {}
    for name, side, origin, rotation, length in wall_segments():
        matrix = kit.placement_matrix(origin, rotation)
        obj = kit.placed_object(name, matrix)
        wall = kit.add_occurrence(ifc, obj, matrix, "IfcWall", ty["wall"], name,
                                  f"Earthen plaster panel between pillars ({side} elevation)", storey)
        kit.attach(ifc, obj, wall, ifcopenshell.api.run(
            "geometry.add_wall_representation", ifc, context=body,
            length=length, height=WALL_H, thickness=WALL_T,
            direction_sense="POSITIVE", offset=0.0,
        ))
        kit.add_pset(ifc, wall, "Pset_WallCommon", {
            "IsExternal": True, "LoadBearing": False, "Reference": "WAL-160-Earthen Plaster",
        })
        kit.add_qto(ifc, wall, "Qto_WallBaseQuantities", {
            "Length": length, "Height": WALL_H, "Width": WALL_T,
            "NetSideArea": round(length * WALL_H, 4),
            "NetVolume": round(length * WALL_H * WALL_T, 4),
        })
        walls[name] = wall
    return walls


def build_openings(ifc, body, storey, ty, walls):
    """Doors on the south front, latticed windows on the side walls.

    Each is a real IfcOpeningElement voiding its wall and filled by the panel.
    The opening runs 10 mm proud of both wall faces, which is what an authoring
    tool does so the boolean cannot leave a coplanar sliver behind.
    """
    fillings = []
    half = WALL_T / 2

    for bay in DOOR_BAYS:
        centre = (X_LINES[bay] + X_LINES[bay + 1]) / 2
        wall = walls[f"South Wall Panel {bay + 1}"]
        name = f"Sankarado Door (Bay {bay + 1})"
        kit.add_opening(
            ifc, body, wall, f"Opening for {name}",
            kit.placement_matrix((centre - DOOR_W / 2, -half - REVEAL, DECK_TOP)),
            rect(DOOR_W, WALL_T + 2 * REVEAL), DOOR_H,
        )
        opening = ifc.by_type("IfcOpeningElement")[-1]
        door = box(
            ifc, body, storey, "IfcDoor", ty["door"], name,
            "Panelled timber door onto the south veranda",
            (centre - DOOR_W / 2, -0.03, DECK_TOP), (DOOR_W, 0.06, DOOR_H),
            ("Pset_DoorCommon", {"IsExternal": True, "FireExit": False, "Reference": "DOO-1600x2200-Sankarado"}),
            ("Qto_DoorBaseQuantities", {"Width": DOOR_W, "Height": DOOR_H,
                                        "Area": round(DOOR_W * DOOR_H, 4)}),
        )
        ifcopenshell.api.run("attribute.edit_attributes", ifc, product=door,
                             attributes={"OverallWidth": DOOR_W, "OverallHeight": DOOR_H})
        kit.fill_opening(ifc, opening, door)
        fillings.append(door)

    for side, x in [("West", 0.0), ("East", HALL_X)]:
        for bay in WINDOW_BAYS:
            centre = (Y_LINES[bay] + Y_LINES[bay + 1]) / 2
            wall = walls[f"{side} Wall Panel {bay + 1}"]
            name = f"Renjimado Window ({side} Bay {bay + 1})"
            kit.add_opening(
                ifc, body, wall, f"Opening for {name}",
                kit.placement_matrix((x - half - REVEAL, centre - WINDOW_W / 2, WINDOW_SILL)),
                rect(WALL_T + 2 * REVEAL, WINDOW_W), WINDOW_H,
            )
            opening = ifc.by_type("IfcOpeningElement")[-1]
            window = box(
                ifc, body, storey, "IfcWindow", ty["window"], name,
                "Vertical-slat lattice window",
                (x - 0.03, centre - WINDOW_W / 2, WINDOW_SILL), (0.06, WINDOW_W, WINDOW_H),
                ("Pset_WindowCommon", {"IsExternal": True, "Reference": "WIN-1200x1000-Renjimado"}),
                ("Qto_WindowBaseQuantities", {"Width": WINDOW_W, "Height": WINDOW_H,
                                              "Area": round(WINDOW_W * WINDOW_H, 4)}),
            )
            ifcopenshell.api.run("attribute.edit_attributes", ifc, product=window,
                                 attributes={"OverallWidth": WINDOW_W, "OverallHeight": WINDOW_H})
            kit.fill_opening(ifc, opening, window)
            fillings.append(window)

    return fillings


def build_frame(ifc, body, storey, ty):
    """Head ties on the pillar heads, and the bracket sets that sit on them.

    The ties BUTT at the corners rather than crossing: the two running along X
    take the full width, and the two running along Y are shortened by half a tie
    at each end. A real frame interpenetrates here; two members occupying the
    same 120 mm is also exactly what a clash check exists to find, so the model
    says what it means instead.
    """
    ties, brackets = [], []
    half = TIE_W / 2
    runs = [
        ("Kashiranuki Head Tie (South)", "x", (0.0, -half, COLUMN_TOP), HALL_X),
        ("Kashiranuki Head Tie (North)", "x", (0.0, HALL_Y - half, COLUMN_TOP), HALL_X),
        ("Kashiranuki Head Tie (West)", "y", (-half, half, COLUMN_TOP), HALL_Y - TIE_W),
        ("Kashiranuki Head Tie (East)", "y", (HALL_X - half, half, COLUMN_TOP), HALL_Y - TIE_W),
    ]
    for yi in (1, 3):
        runs.append((
            f"Naijin Tie Beam (Line {yi + 1})", "x", (X_LINES[2], Y_LINES[yi] - half, COLUMN_TOP), BAY,
        ))

    for name, direction, origin, length in runs:
        # A beam is its cross-section swept along its own axis — the same thing
        # its IfcMaterialProfileSetUsage says it is. Extruding a plan rectangle
        # upwards would render identically and describe a very short column.
        if direction == "x":
            axes = {"x_axis": (0, 1, 0), "y_axis": (0, 0, 1)}   # sweep along +X
            profile = rect(TIE_W, TIE_H)
        else:
            axes = {"x_axis": (0, 0, 1), "y_axis": (1, 0, 0)}   # sweep along +Y
            profile = rect(TIE_H, TIE_W)
        matrix = kit.placement_matrix(origin, **axes)
        obj = kit.placed_object(name, matrix)
        tie = kit.add_occurrence(ifc, obj, matrix, "IfcBeam", ty["tie"], name,
                                 "Timber head tie locking the pillar heads together", storey)
        kit.attach(ifc, obj, tie, kit.extruded(ifc, body, profile, length, name="240x300"))
        kit.add_pset(ifc, tie, "Pset_BeamCommon", {
            "IsExternal": True, "LoadBearing": True, "Reference": "BEA-240x300-Kashiranuki",
        })
        kit.add_qto(ifc, tie, "Qto_BeamBaseQuantities", {
            "Length": round(length, 4), "CrossSectionArea": round(TIE_W * TIE_H, 4),
            "GrossVolume": round(length * TIE_W * TIE_H, 4),
        })
        ties.append(tie)

    for xi, x in enumerate(X_LINES):
        for yi, y in enumerate(Y_LINES):
            if not (xi in (0, len(X_LINES) - 1) or yi in (0, len(Y_LINES) - 1)):
                continue
            name = f"Tokyo Bracket Set {X_LABELS[xi]}{yi + 1}"
            bracket = box(
                ifc, body, storey, "IfcMember", ty["bracket"], name,
                "Bracket set carrying the eaves over the pillar head",
                (x - BRACKET / 2, y - BRACKET / 2, TIE_TOP), (BRACKET, BRACKET, BRACKET_H),
                ("Pset_MemberCommon", {"IsExternal": True, "LoadBearing": True,
                                       "Reference": "MEM-600-Tokyo Bracket Set"}),
                ("Qto_MemberBaseQuantities", {
                    "Length": BRACKET_H, "CrossSectionArea": round(BRACKET ** 2, 4),
                    "GrossVolume": round(BRACKET ** 2 * BRACKET_H, 4),
                }),
            )
            brackets.append(bracket)
    return ties, brackets


def build_roof(ifc, body, storey, ty):
    """One gable roof, as a single swept solid.

    A hipped roof would be more photogenic and would have to be four sloped
    slabs, whose bounding boxes overlap enormously — the clash rule would report
    the reference model against itself. A kirizuma gable is both authentic for a
    hall like this and expressible as ONE section swept along the ridge, which
    is exact, measurable, and has nothing to collide with.

    The section is drawn in elevation: local +X runs along world +Y (across the
    building) and local +Y is up, so the outline below reads like a drawing —
    up the soffit to the ridge, down to the far eave, up through the thickness,
    and back along the top surface.
    """
    span = HALL_Y + 2 * EAVE
    length = HALL_X + 2 * EAVE
    section = [
        (0.0, BRACKET_TOP),
        (span / 2, RIDGE_SOFFIT),
        (span, BRACKET_TOP),
        (span, BRACKET_TOP + ROOF_T),
        (span / 2, RIDGE_SOFFIT + ROOF_T),
        (0.0, BRACKET_TOP + ROOF_T),
    ]
    origin = (-EAVE, -EAVE, 0.0)
    matrix = kit.placement_matrix(origin, x_axis=(0, 1, 0), y_axis=(0, 0, 1))
    obj = kit.placed_object("Kirizuma Roof", matrix)
    roof = kit.add_occurrence(ifc, obj, matrix, "IfcRoof", ty["roof"], "Kirizuma Roof",
                              "Tiled gable roof with deep eaves on all four sides", storey)
    kit.attach(ifc, obj, roof, kit.extruded(ifc, body, section, length))

    slope_run = span / 2
    slope_rise = RIDGE_SOFFIT - BRACKET_TOP
    slope_length = (slope_run ** 2 + slope_rise ** 2) ** 0.5
    kit.add_pset(ifc, roof, "Pset_RoofCommon", {
        "IsExternal": True, "LoadBearing": False, "Reference": "ROF-400-Clay Tile",
    })
    kit.add_qto(ifc, roof, "Qto_RoofBaseQuantities", {
        "GrossArea": round(2 * slope_length * length, 4),
        "NetArea": round(2 * slope_length * length, 4),
    })
    return roof


def build_railings(ifc, body, storey, ty):
    """The kouran, broken either side of the steps."""
    outer = VERANDA
    x0, x1 = -outer, HALL_X + outer
    y0, y1 = -outer, HALL_Y + outer
    gap0, gap1 = X_LINES[2], X_LINES[3]
    runs = [
        ("Kouran Railing (North)", (x0, y1 - RAIL_T, DECK_TOP), (x1 - x0, RAIL_T, RAIL_H)),
        ("Kouran Railing (West)", (x0, y0, DECK_TOP), (RAIL_T, y1 - RAIL_T - y0, RAIL_H)),
        ("Kouran Railing (East)", (x1 - RAIL_T, y0, DECK_TOP), (RAIL_T, y1 - RAIL_T - y0, RAIL_H)),
        ("Kouran Railing (South-West)", (x0 + RAIL_T, y0, DECK_TOP), (gap0 - x0 - RAIL_T, RAIL_T, RAIL_H)),
        ("Kouran Railing (South-East)", (gap1, y0, DECK_TOP), (x1 - RAIL_T - gap1, RAIL_T, RAIL_H)),
    ]
    railings = []
    for name, origin, size in runs:
        length = max(size[0], size[1])
        railings.append(box(
            ifc, body, storey, "IfcRailing", ty["railing"], name,
            "Timber handrail along the veranda edge", origin, size,
            ("Pset_RailingCommon", {"IsExternal": True, "Reference": "RAI-500-Kouran"}),
            ("Qto_RailingBaseQuantities", {"Length": round(length, 4)}),
        ))
    return railings


def build_space(ifc, body, storey, ty):
    """The occupiable interior, as an IfcSpace aggregated into the storey.

    A space is not an element: it is decomposed from the storey by
    IfcRelAggregates, not contained by IfcRelContainedInSpatialStructure. It is
    also the one object in the model with a floor area worth asking for, which
    is why it carries Qto_SpaceBaseQuantities.
    """
    half = WALL_T / 2
    width, depth = HALL_X - WALL_T, HALL_Y - WALL_T
    height = COLUMN_TOP - DECK_TOP
    matrix = kit.placement_matrix((half, half, DECK_TOP))
    obj = kit.placed_object("Naijin Hall Interior", matrix)
    space = kit.add_occurrence(ifc, obj, matrix, "IfcSpace", ty["space"],
                               "Naijin Hall Interior", "Enclosed worship hall", storey=None)
    kit.edit(ifc, space, LongName="Naijin - inner worship hall", CompositionType="ELEMENT")
    kit.attach(ifc, obj, space, kit.extruded(ifc, body, rect(width, depth), height))
    ifcopenshell.api.run("aggregate.assign_object", ifc, products=[space], relating_object=storey)
    kit.add_pset(ifc, space, "Pset_SpaceCommon", {
        "IsExternal": False, "PubliclyAccessible": True, "HandicapAccessible": False,
        "Reference": "SPA-Naijin",
    })
    kit.add_qto(ifc, space, "Qto_SpaceBaseQuantities", {
        "Height": height,
        "GrossPerimeter": round(2 * (width + depth), 4),
        "NetFloorArea": round(width * depth, 4),
        "NetVolume": round(width * depth * height, 4),
    })
    return space


def classify_everything(ifc):
    """One classification reference per element kind.

    Deliberately NOT Uniclass: plausible-looking codes from a system I have not
    checked would be copied out of a model presented as correct. This one says
    what it is on the tin.
    """
    classification = ifcopenshell.api.run(
        "classification.add_classification", ifc, classification="Reference Element Classification"
    )
    kit.edit(ifc, classification, Source=ORGANISATION, Edition="2026",
             Description="In-house element codes for the reference models")

    codes = [
        ("IfcSlab", "REF-SLB", "Slabs, decks and podia"),
        ("IfcWall", "REF-WAL", "Walls and infill panels"),
        ("IfcColumn", "REF-COL", "Columns and pillars"),
        ("IfcBeam", "REF-BEA", "Beams and ties"),
        ("IfcMember", "REF-MEM", "Secondary structural members"),
        ("IfcRoof", "REF-ROF", "Roofs"),
        ("IfcDoor", "REF-DOO", "Doors"),
        ("IfcWindow", "REF-WIN", "Windows"),
        ("IfcRailing", "REF-RAI", "Railings and balustrades"),
        ("IfcStair", "REF-STA", "Stairs"),
        ("IfcStairFlight", "REF-STF", "Stair flights"),
    ]
    for ifc_class, identification, name in codes:
        products = [e for e in ifc.by_type(ifc_class) if not e.is_a("IfcOpeningElement")]
        if products:
            kit.classify(ifc, classification, products, identification, name)


def build(output_path):
    ifc = kit.new_project()
    podium_storey, hall_storey, roof_storey = spatial_structure(ifc)
    body, _axis = kit.contexts(ifc)

    mat = materials(ifc)
    ty = types(ifc, mat)

    build_podium(ifc, body, podium_storey, ty)
    build_floor(ifc, body, hall_storey, ty)
    build_columns(ifc, body, hall_storey, ty)
    walls = build_walls(ifc, body, hall_storey, ty)
    build_openings(ifc, body, hall_storey, ty, walls)
    build_railings(ifc, body, hall_storey, ty)
    build_space(ifc, body, hall_storey, ty)
    build_frame(ifc, body, roof_storey, ty)
    build_roof(ifc, body, roof_storey, ty)

    # Layers stack across a wall's thickness and through a slab's or a roof's
    # depth. Invisible in a viewer, wrong everywhere else.
    for element in ifc.by_type("IfcElement"):
        usage = ifcopenshell.util.element.get_material(element)
        if usage and usage.is_a("IfcMaterialLayerSetUsage"):
            usage.LayerSetDirection = "AXIS2" if element.is_a("IfcWall") else "AXIS3"

    # Layer sets and profile sets both give the OCCURRENCE a usage, so those
    # elements already say what they are made of. A bare IfcMaterial on a type
    # does not propagate, which leaves a door knowing its material only through
    # its type — true in the schema, invisible to every take-off tool and to our
    # own material rule. So associate it on the occurrence as well.
    for element in ifc.by_type("IfcElement"):
        if element.is_a("IfcOpeningElement"):
            continue
        # should_inherit=False on purpose: the default answers "what is this
        # made of, counting its type", which is exactly the question that hides
        # the gap being closed here.
        if ifcopenshell.util.element.get_material(element, should_inherit=False):
            continue
        element_type = ifcopenshell.util.element.get_type(element)
        material = ifcopenshell.util.element.get_material(element_type) if element_type else None
        if material and material.is_a("IfcMaterial"):
            ifcopenshell.api.run("material.assign_material", ifc, products=[element], material=material)

    classify_everything(ifc)

    kit.set_header(ifc, os.path.basename(output_path), AUTHOR, ORGANISATION, TIMESTAMP)
    kit.write(ifc, output_path)


def expected_origins():
    """A spot-check for the verify pass: one element per kind, where it belongs.

    Not every element — the golden test does that through the app's own parser.
    These are the ones whose placement depends on something the build could get
    wrong silently: a storey-relative offset, a quarter turn, a tilted frame.
    """
    half = WALL_T / 2
    return {
        "Kidan Stone Podium": (-PODIUM_MARGIN, -PODIUM_MARGIN, 0.0),
        "Hall Floor": (0.0, 0.0, PODIUM_TOP),
        "Engawa Deck (East)": (HALL_X, 0.0, PODIUM_TOP),
        "Hashira Column A1": (0.0, 0.0, DECK_TOP),
        "Hashira Column F5": (HALL_X, HALL_Y, DECK_TOP),
        "West Wall Panel 1": (half, COLUMN_RADIUS, DECK_TOP),
        "East Wall Panel 1": (HALL_X - half, Y_LINES[1] - COLUMN_RADIUS, DECK_TOP),
        "Kashiranuki Head Tie (West)": (-TIE_W / 2, TIE_W / 2, COLUMN_TOP),
        "Tokyo Bracket Set A1": (-BRACKET / 2, -BRACKET / 2, TIE_TOP),
        "Kirizuma Roof": (-EAVE, -EAVE, 0.0),
        "Kizahashi Stair Flight": (X_LINES[2], -PODIUM_MARGIN - STEPS * STEP_TREAD, 0.0),
        "Naijin Hall Interior": (half, half, DECK_TOP),
    }


def main():
    output_path = kit.output_path_from_argv(sys.argv, "public/JapaneseTemple.ifc")

    kit.deterministic_guids("japanese-temple")
    build(output_path)
    kit.report(kit.verify(output_path, expected_origins()), output_path)


if __name__ == "__main__":
    main()
