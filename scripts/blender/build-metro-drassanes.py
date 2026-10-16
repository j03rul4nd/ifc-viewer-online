# ─── build-metro-drassanes.py ─────────────────────────────────────────────────
# Authors the underground demo model: a metro station box at Drassanes (L3,
# Barcelona), with Blender + Bonsai.
#
#   npm run metro-drassanes      (wraps blender --background)
#
# WHY THIS MODEL EXISTS: map mode places an IFC at its TRUE DEPTH, and the
# subsurface view (src/lib/geo/subsurface.ts) is what lets anyone see it. There
# was no buried model in the gallery to show that with, or to QA it against —
# every demo is a building that stands on the ground.
#
# WHAT IS REAL AND WHAT IS NOT. The plan is real: both platforms are the
# OpenStreetMap ways of the station (drassanes_site.py), so the box runs exactly
# where the platforms run, at their surveyed bearing under La Rambla, and the
# access stairs start at the mapped entrances. EVERYTHING VERTICAL IS ASSUMED.
# OSM maps no depth, and the levels below are typical of a cut-and-cover L3
# station, not survey. The model says so on every element (Pset
# IFCVO_Provenance) and in the project description, so nobody takes a
# clearance off it.
#
# Levels, metres from the street (= the model origin, IfcMapConversion height):
#
#        0.0  ─────── street (La Rambla) ───────────────────────────────
#       -1.5  roof slab top (cover under the street)
#       -5.5  vestibule floor (mezzanine over the middle of the box)
#       -9.0  platform top
#      -10.0  top of rail
#      -10.4  base slab top
#      -11.4  base slab underside / toe of the diaphragm walls
#
# The station box is aligned to the platforms: local u runs along them, v across.

import math
import os
import sys

import ifcopenshell
import ifcopenshell.api

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bonsai_kit as kit  # noqa: E402
from drassanes_site import EASTINGS, ENTRANCES, NORTHINGS, SITE_LAT, SITE_LON, VIA_1, VIA_2  # noqa: E402

AUTHOR = "Reference Models"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-10-17T00:00:00"
FILE = "BCN-IVO-DRS-XX-M3-A-0001.ifc"

EPSG = "EPSG:25831"
DATUM = "ETRS89"
# La Rambla at the foot of the Columbus monument: a few metres above sea level.
STREET_ELEVATION = 4.0

# ── Assumed levels (see header) ───────────────────────────────────────────────
ROOF_TOP = -1.5
ROOF_T = 0.8
VESTIBULE = -5.5
VESTIBULE_T = 0.4
PLATFORM_TOP = -9.0
RAIL_TOP = -10.0
BASE_TOP = -10.4
BASE_T = 1.0
WALL_T = 0.8
END_CLEARANCE = 6.0          # box beyond the platform ends, for the cross-overs
TRACK_OFFSET = 1.75          # track centre either side of the box centreline
RISER, TREAD, STAIR_W = 0.18, 0.28, 3.0

PROVENANCE = {
    "PlanSource": "OpenStreetMap ways 1215124988, 1215124989 (railway=platform) and "
                  "railway=subway_entrance nodes, (c) OpenStreetMap contributors, ODbL",
    "DepthsAssumed": True,
    "Note": "Demonstration model. Plan from OSM; levels and structure are typical "
            "assumptions, not survey. Do not measure from it.",
}


# ── Plan frame ────────────────────────────────────────────────────────────────

def centroid(ring):
    return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))


def longest_edge_dir(ring):
    best = None
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if best is None or d > best[0]:
            best = (d, ((b[0] - a[0]) / d, (b[1] - a[1]) / d))
    return best[1]


C1, C2 = centroid(VIA_1), centroid(VIA_2)
CENTRE = ((C1[0] + C2[0]) / 2, (C1[1] + C2[1]) / 2)
U = longest_edge_dir(VIA_1)
if U[1] < 0:                      # point u roughly north, so "NE end" means something
    U = (-U[0], -U[1])
V = (-U[1], U[0])
BEARING_DEG = math.degrees(math.atan2(U[1], U[0]))


def to_uv(p):
    dx, dy = p[0] - CENTRE[0], p[1] - CENTRE[1]
    return (dx * U[0] + dy * U[1], dx * V[0] + dy * V[1])


def to_en(u, v):
    return (CENTRE[0] + u * U[0] + v * V[0], CENTRE[1] + u * U[1] + v * V[1])


UV = [to_uv(p) for p in VIA_1 + VIA_2]
U_MIN = min(p[0] for p in UV) - END_CLEARANCE
U_MAX = max(p[0] for p in UV) + END_CLEARANCE
V_MIN = min(p[1] for p in UV) - 0.3
V_MAX = max(p[1] for p in UV) + 0.3
LENGTH = U_MAX - U_MIN
WIDTH = V_MAX - V_MIN


def rect_uv(u0, u1, v0, v1):
    """A plan rectangle in station (u, v), returned in model east/north."""
    return [to_en(u0, v0), to_en(u1, v0), to_en(u1, v1), to_en(u0, v1)]


# ── Model ─────────────────────────────────────────────────────────────────────

class Station:
    def __init__(self):
        kit.deterministic_guids("metro-drassanes")
        self.ifc = kit.new_project()
        self.body, _ = kit.contexts(self.ifc)
        self.storeys = self._spatial()
        concrete = ifcopenshell.api.run("material.add_material", self.ifc, name="Concrete C30/37", category="concrete")
        granite = ifcopenshell.api.run("material.add_material", self.ifc, name="Granite paving", category="stone")
        steel = ifcopenshell.api.run("material.add_material", self.ifc, name="Rail steel", category="steel")
        self.materials = {"concrete": concrete, "granite": granite, "steel": steel}
        T = kit.add_simple_type
        self.types = {
            "wall": T(self.ifc, "IfcWallType", "Diaphragm wall 800", "SOLIDWALL", concrete),
            "roof": T(self.ifc, "IfcSlabType", "Roof slab 800", "ROOF", concrete),
            "floor": T(self.ifc, "IfcSlabType", "Floor slab", "FLOOR", concrete),
            "base": T(self.ifc, "IfcSlabType", "Base slab 1000", "BASESLAB", concrete),
            "platform": T(self.ifc, "IfcSlabType", "Platform", "FLOOR", granite),
            "stair": T(self.ifc, "IfcStairType", "Access stair", "STRAIGHT_RUN_STAIR", concrete),
            "rail": T(self.ifc, "IfcBuildingElementProxyType", "Rail UIC 54", "USERDEFINED", steel),
            "trackbed": T(self.ifc, "IfcBuildingElementProxyType", "Slab track", "USERDEFINED", concrete),
        }
        # USERDEFINED must say what it is (IfcBuildingElementProxyType WHERE rule).
        kit.edit(self.ifc, self.types["rail"], ElementType="Rail")
        kit.edit(self.ifc, self.types["trackbed"], ElementType="Slab track")

    def _spatial(self):
        ifc = self.ifc
        kit.edit(ifc, ifc.by_type("IfcProject")[0],
                 Name="Drassanes L3 (demo)",
                 LongName="Underground metro station - demonstration model",
                 Description=PROVENANCE["Note"], ObjectType="Demonstration model", Phase="REFERENCE")
        kit.georeference(
            ifc, crs_name=EPSG, datum=DATUM,
            crs_description="ETRS89 / UTM zone 31N", vertical_datum="EVRF2000",
            eastings=EASTINGS, northings=NORTHINGS, height=STREET_ELEVATION,
            x_abscissa=1.0, x_ordinate=0.0,
        )

        def dms(deg):
            d = int(deg); m = int((deg - d) * 60); s = int(((deg - d) * 60 - m) * 60)
            us = int(round(((((deg - d) * 60 - m) * 60) - s) * 1e6))
            return (d, m, s, us)

        kit.edit(ifc, ifc.by_type("IfcSite")[0],
                 Name="La Rambla - Drassanes",
                 LongName="Under La Rambla, at the Columbus monument end",
                 Description="Plan from OpenStreetMap; levels assumed", CompositionType="ELEMENT",
                 RefLatitude=dms(SITE_LAT), RefLongitude=dms(SITE_LON), RefElevation=STREET_ELEVATION)
        building = kit.edit(ifc, ifc.by_type("IfcBuilding")[0],
                            Name="Estacio Drassanes L3",
                            LongName=f"Cut-and-cover box {LENGTH:.0f} x {WIDTH + 2 * WALL_T:.0f} m, "
                                     f"platforms at {PLATFORM_TOP} m (assumed)",
                            CompositionType="ELEMENT")
        levels = [
            ("Street", "Street level - La Rambla", 0.0),
            ("Vestibule -1", "Ticket hall mezzanine (assumed level)", VESTIBULE),
            ("Platforms -2", "Platform level (assumed level)", PLATFORM_TOP),
        ]
        storeys = {}
        first = ifc.by_type("IfcBuildingStorey")[0]
        for i, (name, long_name, z) in enumerate(levels):
            if i == 0:
                storeys[name] = kit.edit(ifc, first, Name=name, LongName=long_name, CompositionType="ELEMENT", Elevation=z)
            else:
                storeys[name] = kit.add_storey(ifc, building, name, long_name, z)
        return storeys

    def plate(self, ifc_class, kind, name, storey, z, profile, height, description=None):
        """Extruded upward from `z` over a plan profile in model east/north."""
        matrix = kit.placement_matrix((0.0, 0.0, z))
        obj = kit.placed_object(name, matrix)
        el = kit.add_occurrence(self.ifc, obj, matrix, ifc_class, self.types[kind], name, description,
                                self.storeys[storey])
        kit.attach(self.ifc, obj, el, kit.extruded(self.ifc, self.body, profile, height))
        kit.add_pset(self.ifc, el, "IFCVO_Provenance", PROVENANCE)
        return el

    def stair(self, name, top_en, toward_en, storey):
        """A straight flight from the street at `top_en` down to the vestibule,
        descending toward `toward_en`. Profile drawn in the vertical plane."""
        dx, dy = toward_en[0] - top_en[0], toward_en[1] - top_en[1]
        d = math.hypot(dx, dy)
        run_dir = (dx / d, dy / d)
        risers = int(round(-VESTIBULE / RISER))
        run = risers * TREAD
        # Local x = along the run (down), local y = up, local z = across (width).
        side = (-run_dir[1], run_dir[0])
        # x = run, y = up, so the extrusion (x × y) runs along -side: start
        # the profile on the +side edge and it sweeps back across the width.
        origin = (top_en[0] + side[0] * STAIR_W / 2, top_en[1] + side[1] * STAIR_W / 2, 0.0)
        matrix = kit.placement_matrix(origin, x_axis=(run_dir[0], run_dir[1], 0.0), y_axis=(0.0, 0.0, 1.0))
        pts = [(0.0, 0.0)]
        for i in range(risers):
            pts += [(i * TREAD, -(i + 1) * RISER), ((i + 1) * TREAD, -(i + 1) * RISER)]
        pts += [(run, -risers * RISER - 0.3), (0.0, -0.3)]
        obj = kit.placed_object(name, matrix)
        el = kit.add_occurrence(self.ifc, obj, matrix, "IfcStair", self.types["stair"], name,
                                "Access stair from a mapped entrance", self.storeys[storey])
        kit.attach(self.ifc, obj, el, kit.extruded(self.ifc, self.body, pts, STAIR_W))
        kit.add_pset(self.ifc, el, "IFCVO_Provenance", PROVENANCE)
        foot = (top_en[0] + run_dir[0] * run, top_en[1] + run_dir[1] * run)
        # Where the flight passes the roof slab, a real void in it — not a stair
        # drawn through concrete.
        hw = STAIR_W / 2 + 0.2
        quad = [
            (top_en[0] - side[0] * hw, top_en[1] - side[1] * hw),
            (foot[0] - side[0] * hw, foot[1] - side[1] * hw),
            (foot[0] + side[0] * hw, foot[1] + side[1] * hw),
            (top_en[0] + side[0] * hw, top_en[1] + side[1] * hw),
        ]
        z = ROOF_TOP - ROOF_T - 0.1
        kit.add_opening(self.ifc, self.body, self.roof, f"Stair opening - {name}",
                        kit.placement_matrix((0.0, 0.0, z)), quad, ROOF_T + 0.2)
        return el, foot, run_dir

    def build(self):
        w = WALL_T
        # Diaphragm walls, base and roof.
        self.plate("IfcWall", "wall", "Diaphragm wall - west", "Platforms -2", BASE_TOP - BASE_T,
                   rect_uv(U_MIN - w, U_MAX + w, V_MIN - w, V_MIN), ROOF_TOP - (BASE_TOP - BASE_T))
        self.plate("IfcWall", "wall", "Diaphragm wall - east", "Platforms -2", BASE_TOP - BASE_T,
                   rect_uv(U_MIN - w, U_MAX + w, V_MAX, V_MAX + w), ROOF_TOP - (BASE_TOP - BASE_T))
        self.plate("IfcWall", "wall", "End wall - south", "Platforms -2", BASE_TOP - BASE_T,
                   rect_uv(U_MIN - w, U_MIN, V_MIN, V_MAX), ROOF_TOP - (BASE_TOP - BASE_T))
        self.plate("IfcWall", "wall", "End wall - north", "Platforms -2", BASE_TOP - BASE_T,
                   rect_uv(U_MAX, U_MAX + w, V_MIN, V_MAX), ROOF_TOP - (BASE_TOP - BASE_T))
        self.plate("IfcSlab", "base", "Base slab", "Platforms -2", BASE_TOP - BASE_T,
                   rect_uv(U_MIN, U_MAX, V_MIN, V_MAX), BASE_T)
        self.roof = self.plate("IfcSlab", "roof", "Roof slab", "Vestibule -1", ROOF_TOP - ROOF_T,
                   rect_uv(U_MIN - w, U_MAX + w, V_MIN - w, V_MAX + w), ROOF_T)

        # Platforms: the OSM rings, exactly.
        for name, ring in (("Platform - Via 1", VIA_1), ("Platform - Via 2", VIA_2)):
            self.plate("IfcSlab", "platform", name, "Platforms -2", BASE_TOP, list(ring), PLATFORM_TOP - BASE_TOP,
                       "Plan from OpenStreetMap; height above rail assumed")

        # Track: slab track and two rails per road, between the platforms.
        for k, off in (("1", -TRACK_OFFSET), ("2", TRACK_OFFSET)):
            self.plate("IfcBuildingElementProxy", "trackbed", f"Slab track {k}", "Platforms -2", BASE_TOP,
                       rect_uv(U_MIN, U_MAX, off - 1.3, off + 1.3), RAIL_TOP - 0.17 - BASE_TOP)
            for r, g in (("L", -0.7175), ("R", 0.7175)):
                self.plate("IfcBuildingElementProxy", "rail", f"Rail {k}{r}", "Platforms -2", RAIL_TOP - 0.17,
                           rect_uv(U_MIN, U_MAX, off + g - 0.035, off + g + 0.035), 0.17)

        # Entrances: only those that land along the box, each with a stair down
        # to a vestibule mezzanine over the middle of the box.
        used = []
        for node_id, name, p in ENTRANCES:
            u, v = to_uv(p)
            if U_MIN - 5 <= u <= U_MAX + 5 and abs(v) < 30:
                used.append((node_id, name, p, u, v))
        if used:
            mu = sum(e[3] for e in used) / len(used)
            v0 = max(U_MIN + 2, mu - 18); v1 = min(U_MAX - 2, mu + 18)
        else:
            v0, v1 = U_MIN + LENGTH / 3, U_MAX - LENGTH / 3
        self.plate("IfcSlab", "floor", "Vestibule slab", "Vestibule -1", VESTIBULE - VESTIBULE_T,
                   rect_uv(v0, v1, V_MIN, V_MAX), VESTIBULE_T, "Ticket hall mezzanine")
        self.vestibule_span = (v0, v1)
        for i, (node_id, name, p, u, v) in enumerate(used):
            target = to_en(min(max(u, v0 + 2), v1 - 2), 0.0)
            stair, foot, run_dir = self.stair(f"Access stair - {name} ({node_id})", p, target, "Vestibule -1")
            # A passage at vestibule level from the stair foot to the box wall.
            fu, fv = to_uv(foot)
            edge_v = V_MAX + WALL_T if fv > 0 else V_MIN - WALL_T
            if abs(fv) > abs(edge_v):
                a = to_uv(foot)
                self.plate("IfcSlab", "floor", f"Access passage {i + 1}", "Vestibule -1",
                           VESTIBULE - VESTIBULE_T,
                           rect_uv(a[0] - STAIR_W / 2, a[0] + STAIR_W / 2, min(a[1], edge_v), max(a[1], edge_v)),
                           VESTIBULE_T)
        return self

    def write(self, out_dir):
        palette = {
            "Concrete C30/37": ((.66, .65, .62), 0.),
            "Granite paving": ((.78, .76, .72), 0.),
            "Rail steel": ((.40, .40, .42), 0.),
        }
        for material in self.ifc.by_type("IfcMaterial"):
            colour, transparency = palette[material.Name]
            style = ifcopenshell.api.run("style.add_style", self.ifc, name=material.Name)
            ifcopenshell.api.run("style.add_surface_style", self.ifc, style=style,
                                 ifc_class="IfcSurfaceStyleRendering", attributes={
                                     "SurfaceColour": dict(zip(("Red", "Green", "Blue"), colour)),
                                     "Transparency": transparency, "ReflectanceMethod": "NOTDEFINED"})
            ifcopenshell.api.run("style.assign_material_style", self.ifc,
                                 material=material, style=style, context=self.body)
        path = os.path.join(out_dir, FILE)
        kit.set_header(self.ifc, FILE, AUTHOR, ORGANISATION, TIMESTAMP)
        kit.write(self.ifc, path)
        return path


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = os.path.abspath(args[0] if args else "public/models/metro-drassanes")
    os.makedirs(out_dir, exist_ok=True)
    print(f"  box {LENGTH:.1f} x {WIDTH:.1f} m, bearing {BEARING_DEG:.1f} deg, centre {CENTRE}")
    path = Station().build().write(out_dir)
    expected = {"Base slab": (0.0, 0.0, BASE_TOP - BASE_T), "Roof slab": (0.0, 0.0, ROOF_TOP - ROOF_T)}
    kit.report(kit.verify(path, expected), path)


if __name__ == "__main__":
    main()
