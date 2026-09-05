# Hotel Vela federated IFC4 reference, reconstructed from user-supplied plans.
# See docs/HOTEL_VELA_DRAWING_RECONSTRUCTION.md for evidence and limitations.
# OSM establishes site context, not survey accuracy or an upper-storey outline.
# ARC, STR and MEP share the same section-derived plate and local datum.

import math
import os
import sys

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.util.element
import ifcopenshell.util.shape_builder

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bonsai_kit as kit  # noqa: E402
from hotel_vela_site import PLOT as SITE_PLOT, SITE_LAT, SITE_LON  # noqa: E402
from hotel_vela_geometry import (plate_at, facade_grid, ANNEX, ANNEX_HEIGHT,
                                ROOF_LEVEL, to_site, from_site, stair_edge, half_depth, retreat,
                                C, S, TX, TY, link_profiles)  # noqa: E402

PLOT = [from_site(p) for p in SITE_PLOT]

PROJECT_NAME = "Hotel Vela"
PROJECT_LONG_NAME = "Sail-form hotel at the entrance to Port Vell, Barcelona"
AUTHOR = "Reference Models"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-09-05T00:00:00"

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
TYPICAL_H = 3.25        # (90.25 - 51.25) / (24 - 12), sheets A.2.27 / A.2.15
BASEMENT_H = 4.20

# The podium occupies the plot for the first two levels; above that only the
# sail continues.
PODIUM_LEVELS = 2

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
# The drawings and close photograph resolve the curtain-wall grid but not an
# exact fabrication schedule.  A conservative 2.4 m primary module is authored
# as one intentional array occurrence per storey: the repeated solids remain
# visible without turning a web reference into thousands of tree nodes.
FACADE_MODULE = 2.40
MULLION = 0.10
SAIL_EDGE_FRAME = 0.72
ROOF_FINISH_T = 0.12

# The service/lift cluster is visible at the narrow end of the supplied plans,
# but room-by-room dimensions are not legible.  Keep one conservative gross
# core inside even the smallest plate and mark it as an approximation in IFC.
CORE = (5.0, -33.0, 13.0, -23.0)
RISER_OFFSETS = ((-2.5, -3.0), (-2.5, 3.0), (2.5, -3.0), (2.5, 3.0))
ENTRANCE_EDGE = 9
ENTRANCE_W = 8.0
ENTRANCE_H = 3.0

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
    out.append(("Roof", "Roof - enclosed technical deck below curved crown", ROOF_LEVEL))
    return out


LEVELS = levels()
LEVEL_Z = {name: z for name, _, z in LEVELS}
LEVEL_NAMES = [name for name, _, _ in LEVELS]
# Storeys the sail rises through: everything above the podium roof.
TOWER_LEVELS = [n for n in LEVEL_NAMES if LEVEL_Z[n] >= LEVEL_Z["Level 01"]]
OCCUPIED = [n for n in LEVEL_NAMES if n != "Roof"]


# ── Plan geometry ─────────────────────────────────────────────────────────────

PIVOT_X = 18.0


def tower_plate(t):
    """The sail's outline at height fraction `t`, 0 at the podium roof."""
    z = GROUND_H + max(0., min(1., t)) * (ROOF_LEVEL - GROUND_H)
    return [(round(x, 3), round(y, 3)) for x, y in plate_at(z)]


def tower_t(level):
    """Height fraction of a storey within the sail."""
    lo = LEVEL_Z["Level 01"]
    hi = ROOF_LEVEL
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


def rect(width, depth, centred=False):
    """A local rectangular profile."""
    if centred:
        return [(-width / 2, -depth / 2), (width / 2, -depth / 2),
                (width / 2, depth / 2), (-width / 2, depth / 2)]
    return [(0.0, 0.0), (width, 0.0), (width, depth), (0.0, depth)]


def edge_runs(ring):
    """(index, start, rotation, length) for every straight run of a ring."""
    for i, start in enumerate(ring):
        end = ring[(i + 1) % len(ring)]
        dx, dy = end[0] - start[0], end[1] - start[1]
        yield i, start, math.degrees(math.atan2(dy, dx)), math.hypot(dx, dy)


def offset_local(origin, rotation, along, normal, z=None):
    """Move in a facade run's local axes (+X along, +Y to its left)."""
    c, s = math.cos(math.radians(rotation)), math.sin(math.radians(rotation))
    return (round(origin[0] + along * c - normal * s, 6),
            round(origin[1] + along * s + normal * c, 6),
            origin[2] if z is None else z)


def polygon_area(ring):
    return abs(sum(ring[i][0] * ring[(i + 1) % len(ring)][1]
                   - ring[(i + 1) % len(ring)][0] * ring[i][1]
                   for i in range(len(ring))) / 2.0)


def lerp_ring(lower, upper, fraction):
    if len(lower) != len(upper):
        raise ValueError("loft rings must have the same vertex count")
    return [(lower[i][0] + (upper[i][0] - lower[i][0]) * fraction,
             lower[i][1] + (upper[i][1] - lower[i][1]) * fraction)
            for i in range(len(lower))]


def ring_perimeter(ring):
    return sum(math.hypot(ring[(i + 1) % len(ring)][0] - ring[i][0],
                          ring[(i + 1) % len(ring)][1] - ring[i][1])
               for i in range(len(ring)))


def perimeter_samples(ring, count):
    """Equal arc-length samples with stable count for lofted mullions."""
    lengths = [math.hypot(ring[(i + 1) % len(ring)][0] - ring[i][0],
                          ring[(i + 1) % len(ring)][1] - ring[i][1])
               for i in range(len(ring))]
    perimeter = sum(lengths)
    out = []
    edge = 0
    edge_start = 0.0
    for k in range(count):
        target = perimeter * k / count
        while edge < len(ring) - 1 and target > edge_start + lengths[edge]:
            edge_start += lengths[edge]
            edge += 1
        a, b = ring[edge], ring[(edge + 1) % len(ring)]
        t = 0.0 if lengths[edge] <= 1e-12 else (target - edge_start) / lengths[edge]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def loft_band_mesh(lower, upper, z0, z1, thickness):
    """Watertight sloping perimeter band between two plan rings."""
    lower_inner = offset_ring(lower, thickness)
    upper_inner = offset_ring(upper, thickness)
    n = len(lower)
    points = ([(x, y, z0) for x, y in lower]
              + [(x, y, z1) for x, y in upper]
              + [(x, y, z0) for x, y in lower_inner]
              + [(x, y, z1) for x, y in upper_inner])
    faces = []
    for i in range(n):
        j = (i + 1) % n
        ob_i, ob_j = i, j
        ot_i, ot_j = n + i, n + j
        ib_i, ib_j = 2 * n + i, 2 * n + j
        it_i, it_j = 3 * n + i, 3 * n + j
        faces.extend([
            (ob_i, ob_j, ot_j, ot_i),
            (ib_j, ib_i, it_i, it_j),
            (ob_j, ob_i, ib_i, ib_j),
            (ot_i, ot_j, it_j, it_i),
        ])
    return points, faces


def point_in_ring(point, ring):
    """Even/odd test used only to establish a stable structural grid."""
    x, y = point
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def distance_to_ring(point, ring):
    x, y = point
    best = float("inf")
    for i, (ax, ay) in enumerate(ring):
        bx, by = ring[(i + 1) % len(ring)]
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        t = 0.0 if length2 <= 1e-12 else max(
            0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / length2))
        best = min(best, math.hypot(x - (ax + t * dx), y - (ay + t * dy)))
    return best


def structural_grid(ring, spacing=9.0, margin=1.5, exclude_core=False):
    """Fixed XY points, reused at every level so columns form real stacks."""
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    x = math.ceil((min(xs) + margin) / spacing) * spacing
    out = []
    while x <= max(xs) - margin:
        y = math.ceil((min(ys) + margin) / spacing) * spacing
        while y <= max(ys) - margin:
            in_core = (CORE[0] - margin < x < CORE[2] + margin
                       and CORE[1] - margin < y < CORE[3] + margin)
            if (point_in_ring((x, y), ring)
                    and distance_to_ring((x, y), ring) >= margin
                    and not (exclude_core and in_core)):
                out.append((round(x, 3), round(y, 3)))
            y += spacing
        x += spacing
    return out


def core_centre():
    return ((CORE[0] + CORE[2]) / 2.0, (CORE[1] + CORE[3]) / 2.0)


def core_runs(thickness):
    """Four non-overlapping wall runs around the gross core rectangle."""
    x0, y0, x1, y1 = CORE
    return [
        ("South", (x0, y0, 0.0), 0.0, x1 - x0),
        ("North", (x1, y1 - thickness, 0.0), 180.0, x1 - x0),
        ("West", (x0 + thickness, y1, 0.0), -90.0, y1 - y0 - 2 * thickness),
        ("East", (x1 - thickness, y0, 0.0), 90.0, y1 - y0 - 2 * thickness),
    ]


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
    "mullion": ("REF-MUL", "Curtain wall mullions and edge framing"),
    "wall": ("REF-WAL", "Walls"),
    "column": ("REF-COL", "Columns"),
    "door": ("REF-DOO", "Doors"),
    "stair": ("REF-STA", "External escape stairs and landings"),
    "railing": ("REF-RAI", "Balustrades and guardrails"),
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
        if pset:
            kit.add_pset(self.ifc, element, pset[0], pset[1])
        if qto:
            kit.add_qto(self.ifc, element, qto[0], qto[1])
        self.by_class.setdefault((ifc_class, code), []).append(element)
        return element

    def loft_band(self, ifc_class, element_type, name, description, storey,
                  lower, upper, z0, z1, thickness, pset=None, code=None):
        """A closed facade band that follows the changing plate, without steps."""
        matrix = kit.placement_matrix((0.0, 0.0, 0.0))
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(
            self.ifc, obj, matrix, ifc_class, element_type, name, description,
            self.storeys[storey],
        )
        builder = ifcopenshell.util.shape_builder.ShapeBuilder(self.ifc)
        points, faces = loft_band_mesh(lower, upper, z0, z1, thickness)
        representation = builder.get_representation(self.body, [builder.mesh(points, faces)])
        kit.attach(self.ifc, obj, element, representation)
        if pset:
            kit.add_pset(self.ifc, element, pset[0], pset[1])
        self.by_class.setdefault((ifc_class, code), []).append(element)
        return element

    def member_between(self, element_type, name, description, storey, start, end, width,
                       pset=None, code="mullion"):
        """A square profiled member following a genuine 3D vector."""
        vx, vy, vz = (end[i] - start[i] for i in range(3))
        length = math.sqrt(vx * vx + vy * vy + vz * vz)
        if length <= 1e-6:
            raise ValueError(f"zero-length member: {name}")
        z_axis = (vx / length, vy / length, vz / length)
        ref = (0.0, 1.0, 0.0) if abs(z_axis[1]) < 0.9 else (1.0, 0.0, 0.0)
        x_axis = (ref[1] * z_axis[2] - ref[2] * z_axis[1],
                  ref[2] * z_axis[0] - ref[0] * z_axis[2],
                  ref[0] * z_axis[1] - ref[1] * z_axis[0])
        xl = math.sqrt(sum(v * v for v in x_axis))
        x_axis = tuple(v / xl for v in x_axis)
        y_axis = (z_axis[1] * x_axis[2] - z_axis[2] * x_axis[1],
                  z_axis[2] * x_axis[0] - z_axis[0] * x_axis[2],
                  z_axis[0] * x_axis[1] - z_axis[1] * x_axis[0])
        matrix = kit.placement_matrix(start, x_axis=x_axis, y_axis=y_axis)
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(
            self.ifc, obj, matrix, "IfcMember", element_type, name, description,
            self.storeys[storey],
        )
        kit.attach(self.ifc, obj, element,
                   kit.extruded(self.ifc, self.body, rect(width, width, centred=True), length))
        if pset:
            kit.add_pset(self.ifc, element, pset[0], pset[1])
        kit.add_qto(self.ifc, element, "Qto_MemberBaseQuantities", {
            "Length": round(length, 4),
            "CrossSectionArea": round(width * width, 4),
        })
        self.by_class.setdefault(("IfcMember", code), []).append(element)
        return element

    def swept_between(self, ifc_class, element_type, name, description, storey,
                      start, end, width, depth, pset=None, code=None):
        """Extrude a rectangular construction profile along a 3D vector."""
        vx, vy, vz = (end[i] - start[i] for i in range(3))
        length = math.sqrt(vx * vx + vy * vy + vz * vz)
        if length <= 1e-6:
            raise ValueError(f"zero-length swept element: {name}")
        z_axis = (vx / length, vy / length, vz / length)
        ref = (0.0, 1.0, 0.0) if abs(z_axis[1]) < 0.9 else (1.0, 0.0, 0.0)
        x_axis = (ref[1] * z_axis[2] - ref[2] * z_axis[1],
                  ref[2] * z_axis[0] - ref[0] * z_axis[2],
                  ref[0] * z_axis[1] - ref[1] * z_axis[0])
        xl = math.sqrt(sum(v * v for v in x_axis))
        x_axis = tuple(v / xl for v in x_axis)
        y_axis = (z_axis[1] * x_axis[2] - z_axis[2] * x_axis[1],
                  z_axis[2] * x_axis[0] - z_axis[0] * x_axis[2],
                  z_axis[0] * x_axis[1] - z_axis[1] * x_axis[0])
        matrix = kit.placement_matrix(start, x_axis=x_axis, y_axis=y_axis)
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(
            self.ifc, obj, matrix, ifc_class, element_type, name, description,
            self.storeys[storey] if storey else None,
        )
        kit.attach(self.ifc, obj, element,
                   kit.extruded(self.ifc, self.body, rect(width, depth, centred=True), length))
        if pset:
            kit.add_pset(self.ifc, element, pset[0], pset[1])
        self.by_class.setdefault((ifc_class, code), []).append(element)
        return element

    def member_array(self, element_type, name, description, storey, points, z, height, width,
                     pset=None, code="mullion"):
        """One documented facade-grid array with one solid per primary mullion.

        IFC permits a product representation to contain multiple solids.  That
        keeps the mullion rhythm selectable by storey while avoiding thousands
        of repetitive tree nodes in a browser-based reference model.
        """
        matrix = kit.placement_matrix((0.0, 0.0, z))
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(
            self.ifc, obj, matrix, "IfcMember", element_type, name, description,
            self.storeys[storey],
        )
        builder = ifcopenshell.util.shape_builder.ShapeBuilder(self.ifc)
        items = []
        half = width / 2.0
        for px, py in points:
            profile = builder.profile(builder.polyline([
                (px - half, py - half), (px + half, py - half),
                (px + half, py + half), (px - half, py + half),
            ], closed=True))
            items.append(builder.extrude(profile, magnitude=height))
        kit.attach(self.ifc, obj, element, builder.get_representation(self.body, items))
        if pset:
            kit.add_pset(self.ifc, element, pset[0], pset[1])
        kit.add_pset(self.ifc, element, "Pset_MullionArray", {
            "Count": len(points), "PrimaryModule": FACADE_MODULE,
            "Representation": "One solid per mullion; one occurrence per storey"})
        kit.add_qto(self.ifc, element, "Qto_MemberBaseQuantities", {
            "Length": round(height * len(points), 4),
            "CrossSectionArea": round(width * width, 4),
        })
        self.by_class.setdefault(("IfcMember", code), []).append(element)
        return element

    def member_array_between(self, element_type, name, description, storey,
                             lower, upper, z0, z1, width, pset=None, code="mullion"):
        """One storey array of solid mullions following the sloping skin."""
        if len(lower) != len(upper):
            raise ValueError("mullion arrays must have matching point counts")
        points = []
        faces = []
        half = width / 2.0
        total_length = 0.0
        for lower2, upper2 in zip(lower, upper):
            start = (lower2[0], lower2[1], z0)
            end = (upper2[0], upper2[1], z1)
            vx, vy, vz = (end[i] - start[i] for i in range(3))
            length = math.sqrt(vx * vx + vy * vy + vz * vz)
            total_length += length
            axis = (vx / length, vy / length, vz / length)
            ref = (0.0, 1.0, 0.0) if abs(axis[1]) < 0.9 else (1.0, 0.0, 0.0)
            x_axis = (ref[1] * axis[2] - ref[2] * axis[1],
                      ref[2] * axis[0] - ref[0] * axis[2],
                      ref[0] * axis[1] - ref[1] * axis[0])
            xl = math.sqrt(sum(v * v for v in x_axis))
            x_axis = tuple(v / xl for v in x_axis)
            y_axis = (axis[1] * x_axis[2] - axis[2] * x_axis[1],
                      axis[2] * x_axis[0] - axis[0] * x_axis[2],
                      axis[0] * x_axis[1] - axis[1] * x_axis[0])
            base = len(points)
            for centre in (start, end):
                points.extend([
                    tuple(centre[a] - half * x_axis[a] - half * y_axis[a] for a in range(3)),
                    tuple(centre[a] + half * x_axis[a] - half * y_axis[a] for a in range(3)),
                    tuple(centre[a] + half * x_axis[a] + half * y_axis[a] for a in range(3)),
                    tuple(centre[a] - half * x_axis[a] + half * y_axis[a] for a in range(3)),
                ])
            faces.extend([
                (base, base + 1, base + 2, base + 3),
                (base + 4, base + 7, base + 6, base + 5),
                (base, base + 4, base + 5, base + 1),
                (base + 1, base + 5, base + 6, base + 2),
                (base + 2, base + 6, base + 7, base + 3),
                (base + 3, base + 7, base + 4, base),
            ])

        matrix = kit.placement_matrix((0.0, 0.0, 0.0))
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(
            self.ifc, obj, matrix, "IfcMember", element_type, name, description,
            self.storeys[storey],
        )
        builder = ifcopenshell.util.shape_builder.ShapeBuilder(self.ifc)
        kit.attach(self.ifc, obj, element,
                   builder.get_representation(self.body, [builder.mesh(points, faces)]))
        if pset:
            kit.add_pset(self.ifc, element, pset[0], pset[1])
        kit.add_pset(self.ifc, element, "Pset_MullionArray", {
            "Count": len(lower), "PrimaryModule": FACADE_MODULE,
            "Representation": "One sloping solid per mullion; one occurrence per storey"})
        kit.add_qto(self.ifc, element, "Qto_MemberBaseQuantities", {
            "Length": round(total_length, 4), "CrossSectionArea": round(width * width, 4)})
        self.by_class.setdefault(("IfcMember", code), []).append(element)
        return element

    def classify_all(self):
        for (ifc_class, code), elements in self.by_class.items():
            label = CODES.get(code or ifc_class)
            if label:
                kit.classify(self.ifc, self.classification, elements, label[0], label[1])

    def boxes(self, ifc_class, element_type, name, description, storey, boxes, code=None):
        """One IFC product with independent, measurable horizontal solids."""
        matrix = kit.placement_matrix((0., 0., 0.))
        obj = kit.placed_object(name, matrix)
        element = kit.add_occurrence(self.ifc, obj, matrix, ifc_class, element_type,
                                     name, description, self.storeys[storey] if storey else None)
        builder = ifcopenshell.util.shape_builder.ShapeBuilder(self.ifc)
        solids = []
        for (x,y,z), (w,d,h) in boxes:
            profile = builder.profile(builder.polyline(rect(w,d), closed=True))
            solids.append(builder.extrude(profile, magnitude=h, position=(x,y,z)))
        kit.attach(self.ifc, obj, element, builder.get_representation(self.body, solids))
        self.by_class.setdefault((ifc_class, code), []).append(element)
        return element

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
                upright = (element.is_a("IfcWall") or element.is_a("IfcPlate")
                           or element.is_a("IfcCurtainWall"))
                usage.LayerSetDirection = "AXIS2" if upright else "AXIS3"

    def write(self, out_dir):
        self.carry_type_materials()
        self.set_layer_directions()
        # A single building placement registers the drawing frame onto the site.
        # PLOT was inversely transformed, so the surveyed-context footprint and
        # IfcMapConversion remain unchanged across the federation.
        placement = self.ifc.by_type("IfcBuilding")[0].ObjectPlacement.RelativePlacement
        placement.Location.Coordinates = (TX, TY, 0.)
        placement.RefDirection = self.ifc.create_entity("IfcDirection", DirectionRatios=(C,S,0.))
        # IFC-native appearance survives export into the web viewer. These
        # colours are illustrative, not measured optical glass properties.
        palette = {
            "Solar Control Glazing": ((.40, .58, .67), .18),
            "Anodised Aluminium": ((.64, .68, .71), 0.),
            "Concrete C35/45": ((.64, .63, .60), 0.),
            "Galvanised Steel": ((.42, .46, .49), 0.),
            "Indicative interior timber": ((.48, .31, .19), 0.),
            "Indicative sanitary ceramic": ((.92, .93, .94), 0.),
        }
        for material in self.ifc.by_type("IfcMaterial"):
            if material.Name not in palette:
                continue
            colour, transparency = palette[material.Name]
            style = ifcopenshell.api.run("style.add_style", self.ifc, name=material.Name)
            ifcopenshell.api.run("style.add_surface_style", self.ifc, style=style,
                                ifc_class="IfcSurfaceStyleRendering", attributes={
                                    "SurfaceColour": dict(zip(("Red", "Green", "Blue"), colour)),
                                    "Transparency": transparency, "ReflectanceMethod": "NOTDEFINED"})
            ifcopenshell.api.run("style.assign_material_style", self.ifc,
                                material=material, style=style, context=self.body)
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
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C35/45",
                                    category="concrete")

    glass_type = kit.add_layered_type(
        ifc, "IfcCurtainWallType", "CWL-180-Unitised Glazing", "NOTDEFINED", glass, GLASS_T)
    spandrel_type = kit.add_layered_type(ifc, "IfcPlateType", "PLT-320-Spandrel", "SHEET",
                                         aluminium, SPANDREL_T)
    mullion_type = kit.add_profiled_type(
        ifc, "IfcMemberType", "MUL-100SQ-Anodised-Aluminium", "MULLION", aluminium,
        ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="100x100",
                          XDim=MULLION, YDim=MULLION),
    )
    edge_type = kit.add_profiled_type(
        ifc, "IfcMemberType", "FRM-720SQ-Sail-Edge", "MULLION", aluminium,
        ifc.create_entity("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="720x720",
                          XDim=SAIL_EDGE_FRAME, YDim=SAIL_EDGE_FRAME),
    )
    door_type = kit.add_simple_type(ifc, "IfcDoorType", "DOO-2000-Glazed-Entrance", "DOOR",
                                    aluminium)
    escape_door_type = kit.add_simple_type(ifc, "IfcDoorType", "DOO-3000-Escape-Exit", "DOOR",
                                           aluminium)
    louvre_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-180-Louvred-Plant-Screen",
                                       "SOLIDWALL", aluminium, 0.18)
    landing_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-180-Escape-Landing", "LANDING",
                                        concrete, 0.18)
    stair_type = kit.add_simple_type(ifc, "IfcStairType", "STA-External-Straight-Run",
                                     "HALF_TURN_STAIR", aluminium)
    flight_type = kit.add_simple_type(ifc, "IfcStairFlightType", "STF-External-Straight",
                                      "STRAIGHT", aluminium)
    railing_type = kit.add_simple_type(ifc, "IfcRailingType", "RAI-1050-Glazed-Guardrail",
                                       "GUARDRAIL", glass)
    roof_type = kit.add_layered_type(ifc, "IfcRoofType", "ROF-120-Terrace-Finish", "FLAT_ROOF",
                                     concrete, ROOF_FINISH_T)
    crown_type = kit.add_layered_type(ifc, "IfcRoofType", "ROF-120-Curved-Glazed-Crown",
                                      "FREEFORM", glass, ROOF_FINISH_T)
    space_type = kit.add_simple_type(ifc, "IfcSpaceType", "SPA-Gross-Hotel-Zone", "SPACE")
    partition_type = kit.add_layered_type(
        ifc, "IfcWallType", "WAL-150-Plan-Partition", "PARTITIONING", concrete, 0.15)

    # The podium in the supplied elevation and photograph reads as a low glazed
    # base, not the two-storey opaque wall of the previous model.  Straight IFC
    # runs follow the surveyed plot and leave a real eight-metre entrance break
    # in its long beach-facing edge.
    for name in ("Ground",):
        z = LEVEL_Z[name]
        storey_h = GROUND_H if name == "Ground" else TYPICAL_H
        clear_h = storey_h - SLAB_T
        for edge_i, start2, rotation, length in edge_runs(PLOT):
            start = (start2[0], start2[1], z)
            gap0 = (length - ENTRANCE_W) / 2.0
            runs = [(0.0, length)]
            if name == "Ground" and edge_i == ENTRANCE_EDGE:
                runs = [(0.0, gap0), (gap0 + ENTRANCE_W, length - gap0 - ENTRANCE_W)]
            for run_i, (along, run_length) in enumerate(runs):
                if run_length <= 0.05:
                    continue
                origin = offset_local(start, rotation, along, 0.0, z)
                m.box("IfcCurtainWall", glass_type,
                      f"{name} Podium Curtain Wall E{edge_i + 1:02d}-{run_i + 1}",
                      "Unitised glazing to the low podium, surveyed footprint",
                      name, origin, (run_length, GLASS_T, clear_h), rotation,
                      code="curtain", pset=("Pset_CurtainWallCommon", {"IsExternal": True}))

            for module_i in range(1, int(length / FACADE_MODULE) + 1):
                along = module_i * FACADE_MODULE
                if along >= length - MULLION:
                    break
                if (name == "Ground" and edge_i == ENTRANCE_EDGE
                        and gap0 - MULLION < along < gap0 + ENTRANCE_W + MULLION):
                    continue
                origin = offset_local(start, rotation, along - MULLION / 2,
                                      (GLASS_T - MULLION) / 2, z)
                m.box("IfcMember", mullion_type,
                      f"{name} Podium Mullion E{edge_i + 1:02d}-{module_i:02d}",
                      "Anodised aluminium podium facade mullion", name, origin,
                      (MULLION, MULLION, clear_h), rotation, code="mullion",
                      pset=("Pset_MemberCommon", {"IsExternal": True, "LoadBearing": False}))

            if name == "Ground" and edge_i == ENTRANCE_EDGE:
                transom_origin = offset_local(start, rotation, gap0, 0.0, z + ENTRANCE_H)
                m.box("IfcCurtainWall", glass_type, "Main Entrance Transom",
                      "Glazed transom over the principal beach-facing entrance", name,
                      transom_origin, (ENTRANCE_W, GLASS_T, clear_h - ENTRANCE_H), rotation,
                      code="curtain", pset=("Pset_CurtainWallCommon", {"IsExternal": True}))
                leaf_w = ENTRANCE_W / 4.0
                for leaf in range(4):
                    door_origin = offset_local(start, rotation, gap0 + leaf * leaf_w,
                                               (GLASS_T - 0.12) / 2, z)
                    door = m.box("IfcDoor", door_type, f"Main Entrance Door {leaf + 1}",
                                 "Glazed entrance leaf within the facade break", name,
                                 door_origin, (leaf_w, 0.12, ENTRANCE_H), rotation, code="door",
                                 pset=("Pset_DoorCommon", {
                                     "IsExternal": True, "HandicapAccessible": True,
                                     "Reference": "DOO-2000-Glazed-Entrance"}))
                    kit.edit(ifc, door, OverallWidth=leaf_w, OverallHeight=ENTRANCE_H)

    # Service/escape base visible in the detailed facade photograph: a central
    # double exit flanked by louvred metal screens below the open stair slot.
    end_depth = half_depth(retreat(0.))
    for side, y in (("South", -28.0-end_depth), ("North", -26.3)):
        m.box("IfcWall", louvre_type, f"Escape Stair Base Louvre {side}",
              "Louvred plant and stair-base screen confirmed by close photograph", "Ground",
              (stair_edge(0.), y, 0.0), (end_depth-1.7, 0.18, 3.20), 90.0, code="wall",
              pset=("Pset_WallCommon", {"IsExternal": True, "LoadBearing": False}))
        m.boxes("IfcMember",mullion_type,f"Escape Base Louvre Blades {side}",
                "Horizontal blades visible in user close photograph; pitch estimated","Ground",
                [((stair_edge(0.)-.23,y,j*.055),(.06,end_depth-1.7,.025))
                 for j in range(58)],code="mullion")
    escape_door = m.box(
        "IfcDoor", escape_door_type, "Escape Stair Ground Exit",
        "Metal double exit door at the base of the external stair", "Ground",
        (stair_edge(0.), -29.5, 0.0), (3.0, 0.18, 2.80), 90.0, code="door",
        pset=("Pset_DoorCommon", {
            "IsExternal": True, "FireExit": True, "Reference": "DOO-3000-Escape-Exit"}))
    kit.edit(ifc, escape_door, OverallWidth=3.0, OverallHeight=2.8)

    # The sail: non-overlapping spandrel and glass zones, plus real mullions.
    for name in TOWER_LEVELS:
        if name == "Roof":
            continue
        t = tower_t(name)
        ring = tower_plate(t)
        z = LEVEL_Z[name]
        nxt = _next_level(name)
        next_z = LEVEL_Z[nxt]
        next_ring = tower_plate(tower_t(nxt))
        storey_h = next_z - z
        roof_allowance = ROOF_FINISH_T if nxt == "Roof" else 0.0
        glass_top = storey_h - SLAB_T - roof_allowance
        spandrel_top_ring = lerp_ring(ring, next_ring, SPANDREL_H / storey_h)
        glass_top_ring = lerp_ring(ring, next_ring, glass_top / storey_h)
        lower_glass_ring = offset_ring(spandrel_top_ring, FACADE_SETOUT)
        upper_glass_ring = offset_ring(glass_top_ring, FACADE_SETOUT)

        m.loft_band(
            "IfcCurtainWall", glass_type, f"{name} Curtain Wall",
            "Sloping unitised solar-control glazing continuously joining adjacent plates",
            name, lower_glass_ring, upper_glass_ring,
            z + SPANDREL_H, z + glass_top, GLASS_T,
            code="curtain", pset=("Pset_CurtainWallCommon", {"IsExternal": True}))
        m.loft_band(
            "IfcPlate", spandrel_type, f"{name} Spandrel",
            "Sloping opaque spandrel band continuously joining adjacent plates",
            name, ring, spandrel_top_ring, z, z + SPANDREL_H, SPANDREL_T,
            code="curtain", pset=("Pset_PlateCommon", {"IsExternal": True}))

        lower_mullions, upper_mullions = facade_grid(z + SPANDREL_H, z + glass_top, FACADE_MODULE)
        m.member_array_between(
            mullion_type, f"{name} Primary Mullion Array",
            "Primary anodised aluminium grid following the sloping skin; secondary joints omitted",
            name, lower_mullions, upper_mullions,
            z + SPANDREL_H, z + glass_top, MULLION,
            pset=("Pset_MemberCommon", {"IsExternal": True, "LoadBearing": False}))

    # The wide white frame in the close photograph is the feature that makes
    # the collected edge read as a sail.  Model it as connected raking members,
    # not a stack of vertical boxes that would float apart as the plate moves.
    sail_names = [n for n in TOWER_LEVELS if n != "Roof"]
    for name in sail_names:
        nxt = _next_level(name)
        lower = min(tower_plate(tower_t(name)), key=lambda p: p[0])
        upper = min(tower_plate(tower_t(nxt)), key=lambda p: p[0])
        m.member_between(
            edge_type, f"Raking Sail Edge Frame - {name}",
            "Continuous anodised aluminium edge frame inferred from the close facade photograph",
            name, (lower[0], lower[1], LEVEL_Z[name]),
            (upper[0], upper[1], LEVEL_Z[nxt]), SAIL_EDGE_FRAME,
            pset=("Pset_MemberCommon", {"IsExternal": True, "LoadBearing": False}),
        )

    from hotel_vela_details import photo_stairs
    photo_stairs(m, kit, [(n, LEVEL_Z[n]) for n in LEVEL_NAMES
                         if LEVEL_Z[n] >= 0],
                 (stair_type, flight_type, landing_type, railing_type, mullion_type, spandrel_type))

    m.plate("IfcRoof", roof_type, "Roof Finish", "Technical deck below the curved crown",
            "Roof", (0.0, 0.0, ROOF_LEVEL - ROOF_FINISH_T), tower_plate(1.0),
            ROOF_FINISH_T, code="roof")

    # The crown is an envelope above the last deck, not a tiny occupied floor.
    for i in range(12):
        z0 = ROOF_LEVEL + (TOTAL_H-ROOF_LEVEL) * i / 12
        z1 = ROOF_LEVEL + (TOTAL_H-ROOF_LEVEL) * (i+1) / 12
        m.loft_band("IfcRoof", crown_type, f"Curved Crown Skin {i+1:02d}",
                    "Section-traced crown; tessellated reference envelope", "Roof",
                    plate_at(z0), plate_at(z1), z0, z1, 0.12, code="roof")
    m.plate("IfcRoof", crown_type, "Crown Cap", "Closure of section-traced crown",
            "Roof", (0., 0., TOTAL_H-0.02), plate_at(TOTAL_H), 0.02, code="roof")

    # Separate low-rise volume visible in both longitudinal sections.
    for name in [n for n in TOWER_LEVELS if LEVEL_Z[n] < ANNEX_HEIGHT]:
        z = LEVEL_Z[name]
        height = min(LEVEL_Z[_next_level(name)], ANNEX_HEIGHT) - z
        m.loft_band("IfcCurtainWall", glass_type, f"Annex Glazing - {name}",
                    "Low-rise annex isolated from sail; plan outline from OSM",
                    name, ANNEX, ANNEX, z+0.85, z+height, GLASS_T, code="curtain")
        m.loft_band("IfcPlate", spandrel_type, f"Annex Spandrel - {name}",
                    "Horizontal low-rise floor band inferred from elevations",
                    name, ANNEX, ANNEX, z, z+0.85, SPANDREL_T, code="curtain")
        m.member_array(mullion_type, f"Annex Mullions - {name}",
                       "Primary low-rise facade module, approximate", name,
                       perimeter_samples(ANNEX, 48), z+0.85, height-0.85, MULLION)
    m.plate("IfcRoof", roof_type, "Annex Roof Finish", "Low-rise annex roof",
            "Level 07", (0., 0., ANNEX_HEIGHT-ROOF_FINISH_T), ANNEX,
            ROOF_FINISH_T, code="roof")
    for i, profile in enumerate(link_profiles()):
        m.plate("IfcRoof",roof_type,f"Annex Link Roof {i+1}",
                "Roof over tower-to-wing connection from Level 4 plan","Level 07",
                (0.,0.,ANNEX_HEIGHT-ROOF_FINISH_T),profile,ROOF_FINISH_T,code="roof")
        for name in [n for n in TOWER_LEVELS if LEVEL_Z[n]<ANNEX_HEIGHT]:
            z=LEVEL_Z[name]
            height=min(LEVEL_Z[_next_level(name)],ANNEX_HEIGHT)-z
            for x in (8.,16.):
                ys=[y for px,y in profile if px==x]
                m.box("IfcCurtainWall",glass_type,f"Annex Link Glazing {i+1} {x} - {name}",
                      "Side glazing only: connection ends remain open",name,
                      (x-.08,min(ys),z),(.16,max(ys)-min(ys),height-SLAB_T),code="curtain")

    from hotel_vela_rooms import build_rooms
    build_rooms(m, kit, LEVEL_Z, plate_at, stair_edge, partition_type, space_type)

    from hotel_vela_details import low_floor_details
    low_floor_details(m, kit, partition_type, space_type, railing_type)

    # Gross spaces carry useful storey semantics without inventing hotel rooms.
    # They are explicitly tagged as approximate zones based on the supplied
    # plans, not as an as-built interior layout.
    for name in OCCUPIED:
        if name in ("Level 02", "Level 04", "Level 12", "Level 24"):
            continue  # Detailed spaces replace overlapping gross tower zones.
        nxt = _next_level(name)
        if nxt is None:
            continue
        z = LEVEL_Z[name]
        profile = PLOT if z < LEVEL_Z["Level 01"] else tower_plate(tower_t(name))
        inner = offset_ring(profile, 1.0)
        roof_allowance = ROOF_FINISH_T if nxt == "Roof" else 0.0
        clear_h = LEVEL_Z[nxt] - z - SLAB_T - roof_allowance
        label = (f"Gross Basement Zone - {name}" if name.startswith("B")
                 else "Ground Lobby and Public Zone" if name == "Ground"
                 else f"Gross Hotel Zone - {name}")
        matrix = kit.placement_matrix((0.0, 0.0, z))
        obj = kit.placed_object(label, matrix)
        space = kit.add_occurrence(ifc, obj, matrix, "IfcSpace", space_type, label,
                                   "Approximate gross occupiable zone; subdivisions not modelled",
                                   storey=None)
        kit.edit(ifc, space, LongName=label, CompositionType="ELEMENT")
        kit.attach(ifc, obj, space, kit.extruded(ifc, m.body, inner, clear_h))
        kit.aggregate(ifc, [space], m.storeys[name])
        kit.add_pset(ifc, space, "Pset_SpaceCommon", {
            "IsExternal": False, "PubliclyAccessible": name == "Ground",
            "Reference": "Approximate gross zone from supplied plans"})
        kit.add_pset(ifc, space, "Pset_ModelConfidence", {
            "Confidence": "APPROXIMATE",
            "Basis": "Gross plate only; no unverified room subdivision"})
        kit.add_qto(ifc, space, "Qto_SpaceBaseQuantities", {
            "Height": round(clear_h, 4), "GrossFloorArea": round(polygon_area(inner), 2),
            "GrossVolume": round(polygon_area(inner) * clear_h, 2)})

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

    # Floor plates: the plot below the podium roof, the sail above it.  The
    # structural roof stops below the architectural weathering build-up, so the
    # federated files meet on a plane instead of duplicating one solid.
    slabs = {}
    for name, _, z in LEVELS:
        if name == LEVEL_NAMES[0]:
            continue
        ring = PLOT if z <= LEVEL_Z["Level 01"] else tower_plate(tower_t(name))
        w, d = ring_span(ring)
        top_z = z - (ROOF_FINISH_T if name == "Roof" else 0.0)
        slab = m.plate("IfcSlab", slab_type, f"{name} Slab",
                       f"Floor plate, {w:.1f} x {d:.1f} m",
                       name, (0.0, 0.0, top_z - SLAB_T), ring, SLAB_T, code="slab",
                       qto=("Qto_SlabBaseQuantities", {
                           "Width": round(w, 2), "Depth": round(d, 2),
                           "GrossArea": round(polygon_area(ring), 2)}))
        slabs[name] = slab

        # Four coordinated service penetrations.  The MEP file uses the same
        # centre/offset table, and each opening genuinely voids its host slab.
        if name.startswith("Level"):
            cx, cy = core_centre()
            opening_w = RISER_D + 0.25
            for k, (dx, dy) in enumerate(RISER_OFFSETS):
                kit.add_opening(
                    ifc, m.body, slab, f"Riser Opening {k + 1} - {name}",
                    kit.placement_matrix((cx + dx - opening_w / 2,
                                          cy + dy - opening_w / 2,
                                          z - SLAB_T - 0.05)),
                    rect(opening_w, opening_w), SLAB_T + 0.10)

    for name in [n for n in TOWER_LEVELS if GROUND_H < LEVEL_Z[n] < ANNEX_HEIGHT]:
        m.plate("IfcSlab", slab_type, f"Annex Floor - {name}",
                "Independent low-rise slab; inferred from section floor lines", name,
                (0., 0., LEVEL_Z[name]-SLAB_T), ANNEX, SLAB_T, code="slab")
    m.plate("IfcSlab", slab_type, "Annex Roof Deck", "Low-rise roof support",
            "Level 07", (0., 0., ANNEX_HEIGHT-ROOF_FINISH_T-SLAB_T),
            ANNEX, SLAB_T, code="slab")
    for i, profile in enumerate(link_profiles()):
        for name in [n for n in TOWER_LEVELS if GROUND_H<LEVEL_Z[n]<ANNEX_HEIGHT]:
            m.plate("IfcSlab",slab_type,f"Annex Link Floor {i+1} - {name}",
                    "Connection between tower and low-rise wing; drawing-derived",name,
                    (0.,0.,LEVEL_Z[name]-SLAB_T),profile,SLAB_T,code="slab")
        m.plate("IfcSlab",slab_type,f"Annex Link Deck {i+1}",
                "Roof support over tower-to-wing connection","Level 07",
                (0.,0.,ANNEX_HEIGHT-ROOF_FINISH_T-SLAB_T),profile,SLAB_T,code="slab")

    # The core is split and assigned storey by storey.  The former single
    # 107-metre wall belonged to B02 in the tree and was impossible to maintain.
    for name in OCCUPIED:
        nxt = _next_level(name)
        z = LEVEL_Z[name]
        roof_allowance = ROOF_FINISH_T if nxt == "Roof" else 0.0
        clear = LEVEL_Z[nxt] - z - SLAB_T - roof_allowance
        for side, origin0, rotation, length in core_runs(CORE_WALL_T):
            m.box("IfcWall", core_type, f"Core Wall {side} - {name}",
                  "Storey-height reinforced concrete lift and stair core", name,
                  (origin0[0], origin0[1], z), (length, CORE_WALL_T, clear), rotation,
                  code="wall", pset=("Pset_WallCommon", {
                      "IsExternal": False, "LoadBearing": True, "FireRating": "REI 120"}),
                  qto=("Qto_WallBaseQuantities", {
                      "Length": round(length, 3), "Height": round(clear, 3),
                      "Width": CORE_WALL_T, "NetVolume": round(length * CORE_WALL_T * clear, 3)}))

    # Reuse one global grid at every floor.  Tower points are selected from the
    # smallest plate and are a subset of the podium grid, so every upper column
    # has a continuous load path to the raft instead of drifting with the facade.
    podium_grid = structural_grid(PLOT, COLUMN_SPACING_M, exclude_core=True)
    tower_grid = structural_grid(tower_plate(0.0), COLUMN_SPACING_M, exclude_core=True)
    annex_grid = structural_grid(ANNEX, COLUMN_SPACING_M, exclude_core=True)
    for name in OCCUPIED:
        z = LEVEL_Z[name]
        nxt = _next_level(name)
        roof_allowance = ROOF_FINISH_T if nxt == "Roof" else 0.0
        clear = LEVEL_Z[nxt] - z - SLAB_T - roof_allowance
        if clear <= 0.5:
            continue
        if z < LEVEL_Z["Level 01"]:
            grid = podium_grid
        else:
            # Columns remain on the same global grid and simply terminate when
            # the crown plate recedes beyond them.  Requiring clearance inside
            # the plate above prevents a column from ending under empty air.
            support_ring = tower_plate(tower_t(nxt))
            grid = [p for p in tower_grid
                    if point_in_ring(p, support_ring)
                    and distance_to_ring(p, support_ring) >= 1.5]
            if z < ANNEX_HEIGHT:
                grid += annex_grid
        for k, (px, py) in enumerate(grid):
            column_h = (min(clear, ANNEX_HEIGHT-ROOF_FINISH_T-SLAB_T-z)
                        if z >= GROUND_H and (px, py) in annex_grid else clear)
            m.plate("IfcColumn", column_type, f"Column {name} {k + 1:02d}",
                    "Vertically aligned structural grid column", name,
                    (px - COLUMN / 2, py - COLUMN / 2, z),
                    rect(COLUMN, COLUMN), column_h, code="column",
                    pset=("Pset_ColumnCommon", {"LoadBearing": True}),
                    qto=("Qto_ColumnBaseQuantities", {
                        "Length": round(column_h, 4),
                        "CrossSectionArea": round(COLUMN * COLUMN, 4)}))

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

    cx, cy = core_centre()
    air_system = ifcopenshell.api.run(
        "system.add_system", ifc, ifc_class="IfcDistributionSystem")
    kit.edit(ifc, air_system, Name="Hotel Supply Air Risers",
             LongName="Vertical supply air distribution",
             Description="Four coordinated risers inside the lift and stair core",
             PredefinedType="AIRCONDITIONING")

    # Storey-height segments use the same coordinates as the structural voids.
    # They remain continuous through those voids but belong to the storey they
    # serve, rather than one 98-metre object assigned entirely to Ground.
    served = []
    service_levels = OCCUPIED[OCCUPIED.index("Ground"):]
    for k, (dx, dy) in enumerate(RISER_OFFSETS):
        previous = None
        for name in service_levels:
            nxt = _next_level(name)
            z = LEVEL_Z[name]
            height = LEVEL_Z[nxt] - z
            if nxt == "Roof":
                height -= SLAB_T + ROOF_FINISH_T
            segment = m.plate(
                "IfcDuctSegment", duct_type, f"Supply Riser {k + 1} - {name}",
                "Storey-height vertical supply riser coordinated with slab openings",
                name, (cx + dx - RISER_D / 2, cy + dy - RISER_D / 2, z),
                rect(RISER_D, RISER_D), height, code="duct",
                pset=("Pset_DuctSegmentTypeCommon", {
                    "Reference": "DUC-550-Riser", "Shape": "RECTANGULAR"}),
                qto=("Qto_DuctSegmentBaseQuantities", {
                    "Length": round(height, 4),
                    "CrossSectionArea": round(RISER_D * RISER_D, 4)}))
            served.append(segment)
            if previous is not None:
                out_port = ifcopenshell.api.run("system.add_port", ifc, element=previous)
                in_port = ifcopenshell.api.run("system.add_port", ifc, element=segment)
                kit.edit(ifc, out_port, Name=f"Riser {k + 1} Outlet - {name}",
                         PredefinedType="DUCT", FlowDirection="SOURCE")
                kit.edit(ifc, in_port, Name=f"Riser {k + 1} Inlet - {name}",
                         PredefinedType="DUCT", FlowDirection="SINK")
                ifcopenshell.api.run("system.connect_port", ifc,
                                     port1=out_port, port2=in_port)
            previous = segment

    # Rooftop plant and tanks, standing on the roof rather than through it.
    plant = []
    for k, (unit_x, unit_y) in enumerate([(0.0, -28.0), (5.0, -28.0), (10.0, -28.0)]):
        unit = m.plate("IfcAirTerminalBox", plant_type, f"Rooftop Air Handling Unit {k + 1}",
                       "Packaged rooftop air handling unit",
                       "Roof", (unit_x, unit_y, ROOF_LEVEL),
                       rect(4.0, 3.0), 2.40, code="duct")
        plant.append(unit)
        served.append(unit)

    water_system = ifcopenshell.api.run(
        "system.add_system", ifc, ifc_class="IfcDistributionSystem")
    kit.edit(ifc, water_system, Name="Domestic Water Storage",
             LongName="Roof water storage system",
             Description="Representative roof storage; distribution pipework not modelled",
             PredefinedType="DOMESTICCOLDWATER")
    tanks = []
    for k, (tank_x, tank_y) in enumerate(((5.0, -24.0), (10.0, -33.0))):
        tank = m.plate("IfcTank", tank_type, f"Water Storage Tank {k + 1}",
                       "Domestic water storage",
                       "Roof", (tank_x, tank_y, ROOF_LEVEL),
                       rect(3.0, 3.0), 2.80, code="duct")
        tanks.append(tank)

    ifcopenshell.api.run("system.assign_system", ifc, products=served, system=air_system)
    ifcopenshell.api.run("system.assign_system", ifc, products=tanks, system=water_system)

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
    building = ifc.by_type("IfcBuilding")[0]
    kit.add_pset(ifc, building, "Pset_BuildingCommon", {
        "NumberOfStoreys": STOREYS_ABOVE,
        "Reference": "Hotel Vela drawing-derived reference on OSM site footprint",
    })
    kit.add_pset(ifc, building, "Pset_ReferenceModelProvenance", {
        "ModelStatus": "REFERENCE - NOT AS-BUILT",
        "ConfirmedGeometry": "Site placement retained from OSM; drawings are not an as-built survey",
        "PlanEvidence": "User sheets A.2.15 Level 12 +51.25; A.2.27 Level 24 +90.25; A.3.2-7 elevations/sections",
        "StoreyPitchEvidence": "39.00 m / 12 storeys = 3.25 m; drawing-to-local datum offset assumed 9.50 m",
        "MassingRevision": "Lenticular tower separated from low-rise annex; section-traced belly and crown",
        "SupplementaryEvidence": "User Level 4 U-wing/courtyard plan, restaurant/terraces, +2.30 public plan, four stair photos",
        "Registration": "Drawing frame rotated 172.5 deg at building placement; estimated registration, OSM podium preserved",
        "StairEvidence": "Curved-end recess, discrete open treads, front glazed landings, folded metal cheeks; concealed returns inferred",
        "DimensionEstimates": "63 x 25.2 m plate; annex roof 25.5 m; technical deck 94 m; crown 98.8 m",
        "PhotographicEvidence": "External stair slot, floor landings, glazed guards, louvred base and raking edge",
        "PhotographicInference": "Curtain-wall primary module, entrance set-out and material character",
        "ApproximationScope": "Plan scale, section trace, datum, annex height, core, stairs, modules, structure and all MEP are approximate",
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
            "Roof Slab": (0.0, 0.0, ROOF_LEVEL - ROOF_FINISH_T - SLAB_T),
        }
    if discipline == "ARC":
        return {
            "Roof Finish": (0.0, 0.0, ROOF_LEVEL - ROOF_FINISH_T),
            # Loft vertices carry their own world Z; the occurrence placement
            # stays at the shared origin instead of faking a vertical extrusion.
            "Level 01 Curtain Wall": (0.0, 0.0, 0.0),
        }
    cx, cy = core_centre()
    dx, dy = RISER_OFFSETS[0]
    return {"Supply Riser 1 - Ground": (
        cx + dx - RISER_D / 2, cy + dy - RISER_D / 2, LEVEL_Z["Ground"])}


def main():
    """One discipline per invocation — see package.json's `hotel-vela` script.

    Building all three in one Blender session looked tidy and does not work:
    Bonsai keeps a map from IFC entities to Blender objects, and starting a
    second project in the same session leaves the first one's objects behind.
    Three processes is the honest fix, and a failure in one discipline cannot
    then leave another half-written.
    """
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--fast" in args:
        # IFC authoring does not require rebuilding every intermediate Blender
        # mesh. Still create the Bonsai project/storeys and reload every final
        # product through Bonsai's normal geometry importer in kit.verify.
        def occurrence(ifc,obj,matrix,ifc_class,element_type,name,description,
                       storey=None,predefined_type=None):
            element=ifcopenshell.api.run("root.create_entity",ifc,ifc_class=ifc_class,
                                         name=name,predefined_type=predefined_type)
            if element_type:
                ifcopenshell.api.run("type.assign_type",ifc,related_objects=[element],relating_type=element_type)
            kit.edit(ifc,element,Description=description)
            if storey:
                ifcopenshell.api.run("spatial.assign_container",ifc,products=[element],relating_structure=storey)
            ifcopenshell.api.run("geometry.edit_object_placement",ifc,product=element,matrix=matrix)
            return element
        kit.add_occurrence=occurrence
        kit.attach=lambda ifc,obj,element,representation: ifcopenshell.api.run(
            "geometry.assign_representation",ifc,product=element,representation=representation)
    out_dir = os.path.abspath(args[0] if args else "public/models/hotel-vela")
    discipline = (args[1] if len(args) > 1 else "ARC").upper()
    if discipline not in BUILDERS:
        raise SystemExit(f"unknown discipline {discipline!r}; expected one of {sorted(BUILDERS)}")

    os.makedirs(out_dir, exist_ok=True)
    path = BUILDERS[discipline](out_dir).write(out_dir)
    kit.report(kit.verify(path, {n: to_site(p) for n, p in expected_origins(discipline).items()}, require_all=False), path)


if __name__ == "__main__":
    main()
