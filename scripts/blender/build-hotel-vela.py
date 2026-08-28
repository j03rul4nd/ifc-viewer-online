# ─── build-hotel-vela.py ──────────────────────────────────────────────────────
# Authors the sail on the Barceloneta as a FEDERATED IFC4 project — architecture,
# structure and services as three files sharing one origin, one grid and one set
# of storeys, the way a real project is delivered.
#
#   npm run hotel-vela            (all three)
#   npm run hotel-vela:arc        (one discipline)
#
# ── WHY THIS ONE IS AUTHORED AND NOT GENERATED ────────────────────────────────
#
# Every other building in the map comes out of the procedural extruder, and it
# should: a city is thousands of blocks and nobody is going to model them. But
# the extruder is a STRICT SINGLE-RING VERTICAL PRISM — one outline, two z
# values, the same plan at the top as at the bottom — and this building's whole
# identity is that its plan changes with height. Handed its real footprint and
# `height=98.8`, the generator produces a 98.8 m prism: correct volume, correct
# position, and completely unrecognisable.
#
# The dividing line, worth stating because it will come up again:
#
#   LANDMARK geometry may be specific. This file is allowed to know that this
#   particular building is a curved sail, because a landmark's silhouette is not
#   derivable from its tags.
#
#   The INFRASTRUCTURE ENGINE may not. Nothing in src/lib/geo knows this
#   building, this site, or this city — see docs/VERTICAL_INFRASTRUCTURE.md.
#
# ── IT STANDS ON ITS OWN FOOTPRINT ────────────────────────────────────────────
#
# The plan is not invented. `hotel_vela_site.py` carries the real OpenStreetMap
# geometry — the plot (way 908035012) and the sail itself (way 908035013, a
# `building:part` of 27 levels) — reduced to profile-sized outlines. So the two
# things a landmark has to get right, WHERE it is and WHAT SHAPE it is, both
# come from survey rather than from taste:
#
#   plot   8 466 m²   127.3 × 100.6 m    the podium, and the ground it occupies
#   sail   2 332 m²    81.5 ×  44.4 m    the tower plate at its base
#
# And the tags settle the rest: 27 storeys above ground, 2 below, 98.80 m to the
# roof, Ricardo Bofill, 2009.
#
#      z                                                the sail, from the beach
#   98.80  ╷──────╮                     Roof
#          │       ╲                    the seaward edge sweeps in as it rises;
#          │        ╲                   the landward edge stays vertical, which
#          │         ╲                  is what makes it a sail and not a cone
#    6.00  ├──────────╲───────┐         Level 01 — podium roof
#          │  podium          │         the full 127 × 100 m plot
#    0.00  └──────────────────┘         Ground
#   -8.40  └──────────────────┘         B02 — two basement levels
#
# ── HOW THE DISCIPLINES DIVIDE ────────────────────────────────────────────────
#
# The split is the one that makes federation mean something: each file is
# complete on its own and none of them repeats another's geometry.
#
#   ARC  the envelope — curtain wall, spandrel bands, podium facade, roof
#   STR  what holds it up — raft, core walls, perimeter columns, floor plates
#   MEP  what services it — risers, rooftop plant, tanks
#
# CLASH DISCIPLINE, as in every reference model here, and for the same reason —
# a reference model that reports itself is not a reference model:
#   • slabs top out exactly at their level datum, so STR and ARC meet on a plane
#   • the curtain wall stands off the slab edge instead of sharing its face
#   • columns stop at the slab soffit; risers sit inside the core, not in it

import math
import os
import sys

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.util.element

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bonsai_kit as kit  # noqa: E402
from hotel_vela_site import PLOT, TOWER, SITE_LAT, SITE_LON  # noqa: E402

PROJECT_NAME = "Hotel Vela"
PROJECT_LONG_NAME = "Sail-form hotel at the entrance to Port Vell, Barcelona"
AUTHOR = "Reference Models"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-08-28T00:00:00"

# ── Site ──────────────────────────────────────────────────────────────────────

EPSG = "EPSG:25831"
DATUM = "ETRS89"
# UTM 31N of the plot centroid, which IS the model origin.
EASTINGS, NORTHINGS = 432282.17, 4580004.72
SITE_LATITUDE = (41, 22, 7, 348800)
SITE_LONGITUDE = (2, 11, 25, 18800)
# Reclaimed harbour land: a couple of metres of freeboard over mean sea level.
ORTHOGONAL_HEIGHT = 2.50
SITE_ELEVATION = ORTHOGONAL_HEIGHT

# ZERO, and that is the point. The outlines arrive as metres east/north, so the
# model grid already IS the map grid — there is no rotation to guess at, which
# is exactly the kind of thing a landmark gets wrong when its plan is invented.
GRID_ROTATION_DEG = 0.0

# ── The building, from its own tags ───────────────────────────────────────────

TOTAL_H = 98.80          # height=98.8
STOREYS_ABOVE = 27       # building:levels=27  (Ground + Level 01..26)
STOREYS_BELOW = 2        # building:levels:underground=2
GROUND_H = 6.00          # a double-height lobby, which a hotel of this class has
TYPICAL_H = round((TOTAL_H - GROUND_H) / (STOREYS_ABOVE - 1), 4)
BASEMENT_H = 4.20

# The podium occupies the plot for the first two levels; above that only the
# sail continues.
PODIUM_LEVELS = 2

# Sail taper: the seaward edge sweeps in, the landward edge stays put.
TOWER_TOP_SCALE = 0.62
TOWER_CURVE = 1.45

SLAB_T = 0.34
GLASS_T = 0.18
SPANDREL_T = 0.32
SPANDREL_H = 1.10
# How far the glass is held back from the spandrel band, so the floor line has a
# shadow gap. A REVEAL, not a rib.
#
# This number has been wrong in both directions. At 0.12 m the facade looked
# flat — but that was judged on an untextured diagnostic render, where the only
# thing that can distinguish glass from aluminium is a silhouette, and it is the
# wrong signal to tune against. Raising it to 0.35 m fixed that render and made
# the building wrong: twenty-seven bands standing a third of a metre proud read
# as a stack of fins, and the real thing is a smooth specular skin.
#
# So it is back to a reveal you would actually detail, and the floor line reads
# by MATERIAL — solar-control glass against anodised aluminium — which is how it
# reads on the building.
FACADE_SETOUT = 0.10

RAFT_T = 1.40
CORE_WALL_T = 0.35
COLUMN = 0.65
COLUMN_SPACING_M = 9.0
RISER_D = 0.55


def levels():
    """(name, long name, elevation) from the ground up, basements first."""
    out = []
    for i in range(STOREYS_BELOW, 0, -1):
        out.append((f"B{i:02d}", f"Basement {i} - parking and plant",
                    round(-i * BASEMENT_H, 2)))
    out.append(("Ground", "Ground floor - lobby, arrival and beach frontage", 0.0))
    for i in range(1, STOREYS_ABOVE):
        z = round(GROUND_H + (i - 1) * TYPICAL_H, 2)
        long = ("Level 01 - podium roof, restaurant and pool terrace" if i == 1
                else f"Level {i:02d} - guest rooms")
        out.append((f"Level {i:02d}", long, z))
    out.append(("Roof", "Roof - plant, tanks and terrace", TOTAL_H))
    return out


LEVELS = levels()
LEVEL_Z = {name: z for name, _, z in LEVELS}
LEVEL_NAMES = [name for name, _, _ in LEVELS]
# Storeys the sail rises through: everything above the podium roof.
TOWER_LEVELS = [n for n in LEVEL_NAMES if LEVEL_Z[n] >= LEVEL_Z["Level 01"]]
OCCUPIED = [n for n in LEVEL_NAMES if n != "Roof"]


# ── Plan geometry ─────────────────────────────────────────────────────────────

# The corner the taper keeps still: the landward edge of the plate, at its
# eastern end.
#
# BOTH axes matter and it took a render to see why. Scaling about the centroid
# gives a cone. Scaling about the back edge alone gives a shape that is still
# symmetric in WIDTH, so from the sea it reads as a plain trapezoid — which is
# what the first version did. A sail has one raked edge and one that stands
# nearly upright, and that only happens if the plate shrinks towards a CORNER.
PIVOT_X = max(p[0] for p in TOWER)
PIVOT_Y = max(p[1] for p in TOWER)


def tower_plate(t):
    """The sail's outline at height fraction `t`, 0 at the podium roof."""
    s = 1.0 - (1.0 - TOWER_TOP_SCALE) * (t ** TOWER_CURVE)
    return [(round(PIVOT_X - (PIVOT_X - x) * s, 3),
             round(PIVOT_Y - (PIVOT_Y - y) * s, 3)) for x, y in TOWER]


def tower_t(level):
    """Height fraction of a storey within the sail."""
    lo = LEVEL_Z["Level 01"]
    hi = TOTAL_H
    return 0.0 if hi <= lo else (LEVEL_Z[level] - lo) / (hi - lo)


def offset_ring(ring, d):
    """Shrink a closed ring by `d` metres, about its own centroid.

    A true straight-skeleton offset is the correct tool and is far more than
    this needs: these rings are convex-ish plates and the error at that scale is
    under the thickness of the glass.
    """
    cx = sum(p[0] for p in ring) / len(ring)
    cy = sum(p[1] for p in ring) / len(ring)
    out = []
    for x, y in ring:
        vx, vy = x - cx, y - cy
        L = math.hypot(vx, vy)
        if L <= 1e-9:
            out.append((x, y))
            continue
        k = max(0.05, (L - d) / L)
        out.append((round(cx + vx * k, 3), round(cy + vy * k, 3)))
    return out


def band(ring, thickness):
    """A closed band following `ring` inwards — a curtain wall in plan."""
    inner = offset_ring(ring, thickness)
    return list(ring) + [inner[0]] + list(reversed(inner)) + [ring[0]]


def ring_span(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return max(xs) - min(xs), max(ys) - min(ys)


# ── Disciplines ───────────────────────────────────────────────────────────────

DISCIPLINES = {
    "ARC": {
        "file": "BCN-IVO-ZZ-XX-M3-A-0002.ifc",
        "name": "Architecture",
        "description": "Architectural model - sail envelope, podium and roof",
        "role": "A",
    },
    "STR": {
        "file": "BCN-IVO-ZZ-XX-M3-S-0002.ifc",
        "name": "Structure",
        "description": "Structural model - raft, core, columns and floor plates",
        "role": "S",
    },
    "MEP": {
        "file": "BCN-IVO-ZZ-XX-M3-M-0002.ifc",
        "name": "Mechanical services",
        "description": "Mechanical model - risers, rooftop plant and tanks",
        "role": "M",
    },
}

CODES = {
    "slab": ("REF-SLB", "Floor slabs"),
    "curtain": ("REF-CWL", "Curtain walling"),
    "wall": ("REF-WAL", "Walls"),
    "column": ("REF-COL", "Columns"),
    "footing": ("REF-FTG", "Foundations"),
    "roof": ("REF-ROF", "Roof"),
    "duct": ("REF-DUC", "Risers and plant"),
}


class Model:
    """One discipline's file, and everything the build adds to it."""

    def __init__(self, discipline):
        self.meta = DISCIPLINES[discipline]
        kit.deterministic_guids(f"hotel-vela-{discipline.lower()}")
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
            Name=PROJECT_NAME,
            LongName=f"{PROJECT_LONG_NAME} - {self.meta['name']}",
            Description=self.meta["description"],
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
            Description="Georeferenced to ETRS89 / UTM 31N on the building's own footprint",
            CompositionType="ELEMENT",
            RefLatitude=SITE_LATITUDE, RefLongitude=SITE_LONGITUDE, RefElevation=SITE_ELEVATION,
        )
        building = kit.edit(
            ifc, ifc.by_type("IfcBuilding")[0],
            Name=PROJECT_NAME,
            LongName=f"Sail-form hotel, {STOREYS_ABOVE} storeys above ground, {TOTAL_H:.2f} m",
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
        every storey, which is precisely the degree of freedom the procedural
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
        path = os.path.join(out_dir, self.meta["file"])
        kit.set_header(self.ifc, os.path.basename(path), AUTHOR, ORGANISATION, TIMESTAMP)
        kit.write(self.ifc, path)
        return path


# ── Architecture ──────────────────────────────────────────────────────────────

def build_arc(out_dir):
    m = Model("ARC")
    ifc = m.ifc
    glass = ifcopenshell.api.run("material.add_material", ifc, name="Solar Control Glazing",
                                 category="glass")
    aluminium = ifcopenshell.api.run("material.add_material", ifc, name="Anodised Aluminium",
                                     category="metal")
    render = ifcopenshell.api.run("material.add_material", ifc, name="White Render",
                                  category="masonry")
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C35/45",
                                    category="concrete")

    glass_type = kit.add_layered_type(ifc, "IfcPlateType", "PLT-180-Glazed Unit", "SHEET",
                                      glass, GLASS_T)
    spandrel_type = kit.add_layered_type(ifc, "IfcPlateType", "PLT-320-Spandrel", "SHEET",
                                         aluminium, SPANDREL_T)
    podium_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-400-Rendered", "SOLIDWALL",
                                       render, 0.40)
    roof_type = kit.add_layered_type(ifc, "IfcRoofType", "ROF-340-Terrace", "FLAT_ROOF",
                                     concrete, SLAB_T)

    # The podium envelope, on the real plot outline.
    for name in LEVEL_NAMES[:LEVEL_NAMES.index("Ground") + PODIUM_LEVELS]:
        if LEVEL_Z[name] < 0:
            continue
        h = GROUND_H if name == "Ground" else TYPICAL_H
        m.plate("IfcWall", podium_type, f"{name} Podium Facade",
                "Rendered podium facade to the esplanade",
                name, (0.0, 0.0, LEVEL_Z[name]), band(PLOT, 0.40), h,
                code="wall", pset=("Pset_WallCommon", {"IsExternal": True}))

    # The sail: glass, and the floor line that makes it read as 27 storeys.
    for name in TOWER_LEVELS:
        if name == "Roof":
            continue
        t = tower_t(name)
        ring = tower_plate(t)
        z = LEVEL_Z[name]
        glass_ring = offset_ring(ring, FACADE_SETOUT)
        m.plate("IfcPlate", glass_type, f"{name} Curtain Wall",
                "Unitised solar-control glazing to the sail",
                name, (0.0, 0.0, z), band(glass_ring, GLASS_T), TYPICAL_H,
                code="curtain", pset=("Pset_PlateCommon", {"IsExternal": True}))
        m.plate("IfcPlate", spandrel_type, f"{name} Spandrel",
                "Opaque spandrel band expressing the floor line",
                name, (0.0, 0.0, z), band(ring, SPANDREL_T), SPANDREL_H,
                code="curtain", pset=("Pset_PlateCommon", {"IsExternal": True}))

    m.plate("IfcRoof", roof_type, "Roof Slab", "Roof terrace and plant deck",
            "Roof", (0.0, 0.0, TOTAL_H - SLAB_T), tower_plate(1.0), SLAB_T, code="roof")

    _finish(m, ifc)
    return m


# ── Structure ─────────────────────────────────────────────────────────────────

def build_str(out_dir):
    m = Model("STR")
    ifc = m.ifc
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C35/45",
                                    category="concrete")
    raft_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-1400-Raft", "BASESLAB",
                                     concrete, RAFT_T)
    slab_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-340-C35/45", "FLOOR",
                                     concrete, SLAB_T)
    core_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-350-Core", "SHEAR",
                                     concrete, CORE_WALL_T)
    column_type = kit.add_profiled_type(
        ifc, "IfcColumnType", f"COL-{int(COLUMN * 1000)}SQ-C35/45", "COLUMN", concrete,
        ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA",
                          ProfileName=f"{int(COLUMN * 1000)}x{int(COLUMN * 1000)}",
                          XDim=COLUMN, YDim=COLUMN),
    )

    base = LEVEL_Z[LEVEL_NAMES[0]]
    m.plate("IfcSlab", raft_type, "Raft Foundation",
            "Raft under the whole plot, on reclaimed harbour ground",
            LEVEL_NAMES[0], (0.0, 0.0, base - RAFT_T), PLOT, RAFT_T, code="footing",
            pset=("Pset_SlabCommon", {"IsExternal": False, "LoadBearing": True}))

    # Floor plates: the plot below the podium roof, the sail above it.
    for name, _, z in LEVELS:
        if name == LEVEL_NAMES[0]:
            continue
        ring = PLOT if z <= LEVEL_Z["Level 01"] else tower_plate(tower_t(name))
        w, d = ring_span(ring)
        m.plate("IfcSlab", slab_type, f"{name} Slab",
                f"Floor plate, {w:.1f} x {d:.1f} m",
                name, (0.0, 0.0, z - SLAB_T), ring, SLAB_T, code="slab",
                qto=("Qto_SlabBaseQuantities", {"Width": round(w, 2), "Depth": round(d, 2)}))

    # The core: full height, held against the landward edge where the plan stays
    # deepest, so it is still inside the envelope where the sail is narrowest.
    top = tower_plate(1.0)
    cx = sum(p[0] for p in top) / len(top)
    cy = sum(p[1] for p in top) / len(top)
    core = [(cx - 11.0, cy - 6.0), (cx + 11.0, cy - 6.0), (cx + 11.0, cy + 6.0),
            (cx - 11.0, cy + 6.0)]
    m.plate("IfcWall", core_type, "Service Core",
            "Lift and stair core, foundation to roof",
            LEVEL_NAMES[0], (0.0, 0.0, base), band(core, CORE_WALL_T), TOTAL_H - base,
            code="wall", pset=("Pset_WallCommon", {"IsExternal": False, "LoadBearing": True}))

    # Perimeter columns, spaced around each plate and stopping at the soffit
    # above — never crossing the slab they carry.
    for name, _, z in LEVELS:
        nxt = _next_level(name)
        if nxt is None:
            continue
        ring = PLOT if z < LEVEL_Z["Level 01"] else tower_plate(tower_t(name))
        clear = LEVEL_Z[nxt] - z - SLAB_T
        if clear <= 0.5:
            continue
        for k, (px, py) in enumerate(_perimeter_points(ring, COLUMN_SPACING_M)):
            m.plate("IfcColumn", column_type, f"Column {name} {k + 1:02d}",
                    "Perimeter column", name,
                    (px - COLUMN / 2, py - COLUMN / 2, z),
                    [(0.0, 0.0), (COLUMN, 0.0), (COLUMN, COLUMN), (0.0, COLUMN)],
                    clear, code="column")

    _finish(m, ifc)
    return m


# ── Services ──────────────────────────────────────────────────────────────────

def build_mep(out_dir):
    m = Model("MEP")
    ifc = m.ifc
    steel = ifcopenshell.api.run("material.add_material", ifc, name="Galvanised Steel",
                                 category="metal")
    duct_type = kit.add_simple_type(ifc, "IfcDuctSegmentType", "DUC-550-Riser",
                                    "RIGIDSEGMENT", steel)
    plant_type = kit.add_simple_type(ifc, "IfcAirTerminalBoxType", "AHU-Rooftop",
                                     "CONSTANTFLOW", steel)
    tank_type = kit.add_simple_type(ifc, "IfcTankType", "TNK-Water Storage",
                                    "STORAGE", steel)

    top = tower_plate(1.0)
    cx = sum(p[0] for p in top) / len(top)
    cy = sum(p[1] for p in top) / len(top)

    # Risers inside the core, running the occupied height.
    base = LEVEL_Z["Ground"]
    for k, (dx, dy) in enumerate([(-7.0, -3.0), (-7.0, 3.0), (7.0, -3.0), (7.0, 3.0)]):
        m.plate("IfcDuctSegment", duct_type, f"Supply Riser {k + 1}",
                "Vertical supply riser inside the core",
                "Ground", (cx + dx - RISER_D / 2, cy + dy - RISER_D / 2, base),
                [(0.0, 0.0), (RISER_D, 0.0), (RISER_D, RISER_D), (0.0, RISER_D)],
                TOTAL_H - base - SLAB_T, code="duct")

    # Rooftop plant and tanks, standing on the roof rather than through it.
    for k, (dx, dy) in enumerate([(-12.0, 0.0), (0.0, 0.0), (12.0, 0.0)]):
        m.plate("IfcAirTerminalBox", plant_type, f"Rooftop Air Handling Unit {k + 1}",
                "Packaged rooftop air handling unit",
                "Roof", (cx + dx - 3.0, cy + dy - 2.0, TOTAL_H),
                [(0.0, 0.0), (6.0, 0.0), (6.0, 4.0), (0.0, 4.0)], 2.60, code="duct")
    for k, dx in enumerate((-6.0, 6.0)):
        m.plate("IfcTank", tank_type, f"Water Storage Tank {k + 1}",
                "Domestic water storage",
                "Roof", (cx + dx - 2.0, cy + 7.0, TOTAL_H),
                [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)], 3.20, code="duct")

    _finish(m, ifc)
    return m


# ── Shared ────────────────────────────────────────────────────────────────────

def _next_level(name):
    i = LEVEL_NAMES.index(name)
    return LEVEL_NAMES[i + 1] if i + 1 < len(LEVEL_NAMES) else None


def _perimeter_points(ring, spacing):
    """Points every `spacing` metres around a ring, inset to sit inside it."""
    inset = offset_ring(ring, 1.2)
    out = []
    carry = 0.0
    for i in range(len(inset)):
        a = inset[i]
        b = inset[(i + 1) % len(inset)]
        seg = math.hypot(b[0] - a[0], b[1] - a[1])
        d = carry
        while d < seg:
            t = d / seg if seg > 0 else 0.0
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            d += spacing
        carry = d - seg
    return out


def _finish(m, ifc):
    kit.add_pset(ifc, ifc.by_type("IfcBuilding")[0], "Pset_BuildingCommon", {
        "NumberOfStoreys": STOREYS_ABOVE,
        "Reference": "Sail-form hotel, authored massing on the surveyed footprint",
    })
    m.classify_all()
    kit.sort_unordered_aggregates(ifc)


BUILDERS = {"ARC": build_arc, "STR": build_str, "MEP": build_mep}


def expected_origins(discipline):
    """Elements whose placement the build could plausibly get wrong."""
    if discipline == "STR":
        return {
            "Raft Foundation": (0.0, 0.0, LEVEL_Z[LEVEL_NAMES[0]] - RAFT_T),
            "Ground Slab": (0.0, 0.0, -SLAB_T),
            "Roof Slab": (0.0, 0.0, TOTAL_H - SLAB_T),
        }
    if discipline == "ARC":
        return {
            "Roof Slab": (0.0, 0.0, TOTAL_H - SLAB_T),
            "Level 01 Curtain Wall": (0.0, 0.0, LEVEL_Z["Level 01"]),
        }
    return {"Supply Riser 1": None}


def main():
    """One discipline per invocation — see package.json's `hotel-vela` script.

    Building all three in one Blender session looked tidy and does not work:
    Bonsai keeps a map from IFC entities to Blender objects, and starting a
    second project in the same session leaves the first one's objects behind.
    Three processes is the honest fix, and a failure in one discipline cannot
    then leave another half-written.
    """
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = os.path.abspath(args[0] if args else "public/models/hotel-vela")
    discipline = (args[1] if len(args) > 1 else "ARC").upper()
    if discipline not in BUILDERS:
        raise SystemExit(f"unknown discipline {discipline!r}; expected one of {sorted(BUILDERS)}")

    os.makedirs(out_dir, exist_ok=True)
    path = BUILDERS[discipline](out_dir).write(out_dir)
    spots = {k: v for k, v in expected_origins(discipline).items() if v is not None}
    if spots:
        kit.report(kit.verify(path, spots, require_all=False), path)
    else:
        kit.report(ifcopenshell.open(path), path)


if __name__ == "__main__":
    main()
