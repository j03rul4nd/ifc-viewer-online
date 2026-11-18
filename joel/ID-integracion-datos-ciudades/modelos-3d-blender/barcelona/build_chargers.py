"""
Builds the Endolla charging-point models this service names in `presentation.model` for CDE scenes. Run with
Blender 5.x:

    blender --background --factory-startup --python tools/blender/build_chargers.py -- assets/models

then copy the GLBs to `CDE-Frontend/public/models/scene/` and list them in its `manifest.json`
(`tools/blender/charger_manifest.json`, written next to the models, holds their entries).

What they are drawn from: photographs of the Endolla Barcelona points on Wikimedia Commons (Càrrega de cotxe
elèctric 3/4, Càrrega de moto elèctrica 1/2, 2022, CC BY-SA 4.0): the white fast-charge cabinet with its black
cap, green vertical «ENDOLLA BARCELONA» lettering, wave-line pattern and two heavy cables hanging from its
sides; the slim white street post with its black A/B socket panel, green Endolla plate and city shield; the
painted bay with the car-and-plug pictogram. Stylised, not the manufacturers' drawings; the 160 kW unit and
the car-park totem are typical, not photographed.

Conventions (the CDE viewer relies on them):
  * metres, real-world size; PBR materials only, no textures;
  * +X points from the sidewalk to the carriageway (a place's heading is the direction it faces); up is +Z in
    Blender, +Y in the exported glTF;
  * the origin is on the ground at the charging units (the device's point), not at the footprint's centre:
    the bays painted on the carriageway reach +X from it.

A location's model is named by its units, kerb to kerb: `endolla-<letters>` with one letter per charging
station, `f` a 50 kW triple-standard unit, `h` a 160 kW unit, `p` a street post; `endolla-parking` stands at
the entrance of a car park whose points are underground.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "assets/models"
os.makedirs(OUT, exist_ok=True)

# Every combination the Endolla file holds (2026-10-01), plus the single units.
COMBOS = ["f", "ff", "fff", "ffff", "h", "hh", "hf", "p", "pp", "ppp"]


# Materials ----------------------------------------------------------------------------------------------


def hex_rgba(value, alpha=1.0):
    value = value.lstrip("#")
    srgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*linear, alpha)


_materials = {}


def material(name, colour, metallic=0.0, roughness=0.5, emission=None, strength=0.0, alpha=1.0):
    if name in _materials:
        return _materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_rgba(colour, alpha)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "BLENDED"
    if emission:
        bsdf.inputs["Emission Color"].default_value = hex_rgba(emission)
        bsdf.inputs["Emission Strength"].default_value = strength
    _materials[name] = mat
    return mat


WHITE = lambda: material("cabinet_white", "#F2F3F1", roughness=0.35)  # noqa: E731
PEARL = lambda: material("post_white", "#ECEEEC", roughness=0.4)  # noqa: E731
CAP = lambda: material("cap_black", "#16181A", metallic=0.2, roughness=0.45)  # noqa: E731
PANEL = lambda: material("panel_black", "#0E0F10", metallic=0.1, roughness=0.3)  # noqa: E731
GRAPHITE = lambda: material("graphite", "#3B4045", metallic=0.5, roughness=0.5)  # noqa: E731
WAVE = lambda: material("wave_grey", "#A9B0B4", roughness=0.5)  # noqa: E731
GREEN = lambda: material("endolla_green", "#13A05A", roughness=0.45)  # noqa: E731
LED = lambda: material("status_led", "#39D98A", emission="#39D98A", strength=4.0)  # noqa: E731
SCREEN = lambda: material("screen", "#0A1A2A", emission="#1E6FB8", strength=1.2)  # noqa: E731
RED = lambda: material("city_red", "#C8102E", roughness=0.4)  # noqa: E731
RUBBER = lambda: material("cable", "#121314", roughness=0.75)  # noqa: E731
HANDLE = lambda: material("handle", "#25292C", metallic=0.2, roughness=0.5)  # noqa: E731
CONCRETE = lambda: material("plinth", "#9C9A94", roughness=0.9)  # noqa: E731
PAVER = lambda: material("sidewalk", "#B7B2A8", roughness=0.95)  # noqa: E731
KERB = lambda: material("kerb", "#8E8C87", roughness=0.85)  # noqa: E731
PAINT = lambda: material("road_paint", "#F4F4F0", roughness=0.7)  # noqa: E731
STEEL = lambda: material("steel", "#8C9399", metallic=0.9, roughness=0.35)  # noqa: E731
BSM_BLUE = lambda: material("bsm_blue", "#1F3D7A", roughness=0.45)  # noqa: E731


# Geometry -----------------------------------------------------------------------------------------------


class Model:
    """Collects mesh parts (bmesh primitives, text, tubes) and exports them joined as one glTF mesh."""

    def __init__(self, name):
        self.name = name
        self.parts = []

    def _bm_part(self, bm, mat):
        mesh = bpy.data.meshes.new(f"{self.name}_part")
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(mat)
        self.parts.append(mesh)

    def box(self, mat, size, centre, bevel=0.0, segments=2):
        bm = bmesh.new()
        verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
        for v in verts:
            v.co = Vector((v.co.x * size[0] + centre[0], v.co.y * size[1] + centre[1], v.co.z * size[2] + centre[2]))
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel, segments=segments, affect="EDGES", profile=0.5)
        self._bm_part(bm, mat)

    def cylinder(self, mat, radius, depth, centre, axis="Z", segments=20, radius2=None):
        bm = bmesh.new()
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth)
        rot = {"X": Matrix.Rotation(math.pi / 2, 3, "Y"), "Y": Matrix.Rotation(math.pi / 2, 3, "X"), "Z": Matrix.Identity(3)}[axis]
        bmesh.ops.rotate(bm, verts=r["verts"], cent=Vector((0, 0, 0)), matrix=rot)
        bmesh.ops.translate(bm, verts=r["verts"], vec=Vector(centre))
        self._bm_part(bm, mat)

    def prism(self, mat, outline, z0, z1):
        """A vertical prism over a plan polygon [(x, y)]."""
        bm = bmesh.new()
        bot = [bm.verts.new((x, y, z0)) for x, y in outline]
        top = [bm.verts.new((x, y, z1)) for x, y in outline]
        bm.faces.new(list(reversed(bot)))
        bm.faces.new(top)
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
        self._bm_part(bm, mat)

    def flat(self, mat, outline, z, thick=0.006):
        self.prism(mat, outline, z, z + thick)

    def tube(self, mat, points, radius, resolution=6, round_=1):
        """A round tube through 3D points (a cable, a handrail), smooth through them."""
        curve = bpy.data.curves.new("tube", type="CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = radius
        curve.bevel_resolution = round_
        curve.resolution_u = resolution
        curve.use_fill_caps = True
        spline = curve.splines.new("BEZIER")
        spline.bezier_points.add(len(points) - 1)
        for bp, p in zip(spline.bezier_points, points):
            bp.co = Vector(p)
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        self._from_object(bpy.data.objects.new("tube", curve), mat)

    def text(self, mat, body, size, origin, axes, extrude=0.002, align="CENTER", bold=False):
        """Lettering as geometry. `axes` = (reading direction, letters' up), both unit vectors in model axes;
        the face it is read from is their cross product."""
        curve = bpy.data.curves.new("text", type="FONT")
        curve.body = body
        curve.size = size
        curve.extrude = extrude
        curve.align_x = align
        curve.align_y = "CENTER"
        curve.resolution_u = 2
        if bold:
            try:
                curve.offset = 0.03 * size
            except AttributeError:
                pass
        obj = bpy.data.objects.new("text", curve)
        xa, ya = Vector(axes[0]), Vector(axes[1])
        za = xa.cross(ya)
        rot = Matrix((xa, ya, za)).transposed().to_4x4()
        obj.matrix_world = Matrix.Translation(Vector(origin)) @ rot
        self._from_object(obj, mat)

    def _from_object(self, obj, mat):
        bpy.context.scene.collection.objects.link(obj)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
        mesh.transform(obj.matrix_world)
        mesh.materials.clear()
        mesh.materials.append(mat)
        bpy.data.objects.remove(obj)
        self.parts.append(mesh)

    def export(self):
        objs = []
        for mesh in self.parts:
            obj = bpy.data.objects.new(self.name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            objs.append(obj)
        for other in bpy.context.scene.objects:
            other.select_set(False)
        for obj in objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = self.name
        mesh = joined.data
        if hasattr(mesh, "shade_smooth_by_angle"):
            mesh.shade_smooth_by_angle(angle=math.radians(35))
        corners = [joined.matrix_world @ Vector(v.co) for v in mesh.vertices]
        lo = [min(c[i] for c in corners) for i in range(3)]
        hi = [max(c[i] for c in corners) for i in range(3)]
        path = os.path.join(OUT, f"{self.name}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True)
        tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
        print(f"{self.name}: {os.path.getsize(path)} bytes, {tris} triangles")
        bpy.data.objects.remove(joined)
        return {"lengthM": round(hi[0] - lo[0], 2), "widthM": round(hi[1] - lo[1], 2), "heightM": round(hi[2], 2)}


# Street ---------------------------------------------------------------------------------------------------

SIDEWALK_TOP = 0.14            # a 14 cm kerb: the units stand on the sidewalk, the bays are on the carriageway
KERB_X = 0.62                  # the kerb's road face, from the units
BAY_DEPTH = 2.20               # a parallel-parking bay, kerb outwards
BAY_LENGTH = 5.00              # and along the kerb, one per fast unit


def sidewalk(m, y0, y1):
    """The strip of sidewalk the units stand on, its granite kerb and the gutter line."""
    m.box(PAVER(), (KERB_X + 0.9, y1 - y0, SIDEWALK_TOP + 0.10), ((KERB_X - 0.9) / 2, (y0 + y1) / 2, (SIDEWALK_TOP - 0.10) / 2))
    m.box(KERB(), (0.16, y1 - y0, SIDEWALK_TOP + 0.12), (KERB_X - 0.08, (y0 + y1) / 2, (SIDEWALK_TOP - 0.12) / 2 + 0.005), bevel=0.02)
    for k in range(int((y1 - y0) / 0.6)):          # paver joints, so the strip reads as paving
        y = y0 + 0.3 + 0.6 * k
        m.box(KERB(), (KERB_X + 0.72, 0.012, 0.004), ((KERB_X - 0.9 - 0.16) / 2 + 0.0, y, SIDEWALK_TOP + 0.002))


def ev_pictogram(m, cx, cy, z, r=0.62):
    """The white car-and-plug pictogram in a ring, as painted in Barcelona's EV bays (seen from the kerb, the
    car's nose along +Y)."""
    ring = []
    for k in range(32):
        a = 2 * math.pi * k / 32
        ring.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    inner = [(cx + (r - 0.07) * math.cos(2 * math.pi * k / 32), cy + (r - 0.07) * math.sin(2 * math.pi * k / 32)) for k in range(32)]
    for k in range(32):                             # the ring as 32 quads
        j = (k + 1) % 32
        m.flat(PAINT(), [ring[k], ring[j], inner[j], inner[k]], z)
    # car, side view laid flat: body, cabin, wheels (the bay is read from above, the car runs along y)
    body = [(-0.10, -0.40), (0.06, -0.40), (0.10, -0.30), (0.10, 0.36), (0.04, 0.42), (-0.10, 0.42)]
    cabin = [(0.10, -0.18), (0.24, -0.10), (0.24, 0.16), (0.10, 0.26)]
    for shape in (body, cabin):
        m.flat(PAINT(), [(cx + x - 0.08, cy + y) for x, y in shape], z)
    for wy in (-0.24, 0.24):
        m.cylinder(PAINT(), 0.08, 0.006, (cx - 0.20, cy + wy, z + 0.003), segments=12)
    # plug and cable, beside the car
    m.flat(PAINT(), [(cx + 0.30, cy - 0.10), (cx + 0.42, cy - 0.10), (cx + 0.42, cy + 0.06), (cx + 0.30, cy + 0.06)], z)
    for py in (-0.06, 0.02):
        m.flat(PAINT(), [(cx + 0.42, cy + py), (cx + 0.49, cy + py), (cx + 0.49, cy + py + 0.025), (cx + 0.42, cy + py + 0.025)], z)
    m.flat(PAINT(), [(cx + 0.33, cy + 0.06), (cx + 0.37, cy + 0.06), (cx + 0.37, cy + 0.32), (cx + 0.33, cy + 0.32)], z)


def bay(m, y0, y1, z=0.012):
    """A painted parallel-parking bay on the carriageway, kerb to outer line, with the EV pictogram."""
    x0, x1 = KERB_X + 0.02, KERB_X + BAY_DEPTH
    w = 0.10
    m.flat(PAINT(), [(x1 - w, y0), (x1, y0), (x1, y1), (x1 - w, y1)], z)               # outer line
    for y in (y0, y1 - w):                                                            # end lines
        m.flat(PAINT(), [(x0, y), (x1, y), (x1, y + w), (x0, y + w)], z)
    ev_pictogram(m, (x0 + x1) / 2, (y0 + y1) / 2, z + 0.001)


# Units ----------------------------------------------------------------------------------------------------


def wave_lines(m, x_face, y0, y1, z0, z1, sign=1, count=9):
    """The Endolla cabinet's wave-line pattern: thin raised lines fanning across a face (at x = x_face)."""
    for k in range(count):
        t = k / (count - 1)
        pts = []
        for i in range(7):
            u = i / 6
            y = y0 + (y1 - y0) * u
            z = z0 + (z1 - z0) * (0.15 + 0.7 * t) + 0.10 * math.sin(math.pi * (u * 1.4 + t * 0.9)) * (0.4 + 0.6 * t)
            pts.append((x_face + sign * 0.002, y, z))
        m.tube(WAVE(), pts, 0.003, resolution=3, round_=0)


def holster_and_cable(m, x, y_side, z_holster, sign, length_to_ground=1.0, curl=0.55):
    """A connector holster on a cabinet's side and its heavy cable hanging in a loop to the pavement."""
    m.box(HANDLE(), (0.14, 0.06, 0.20), (x, y_side + sign * 0.03, z_holster), bevel=0.012)
    m.box(GRAPHITE(), (0.07, 0.10, 0.12), (x, y_side + sign * 0.09, z_holster + 0.02), bevel=0.01)         # connector head
    top = (x, y_side + sign * 0.10, z_holster - 0.06)
    pts = [top, (x + 0.05, y_side + sign * 0.16, z_holster - 0.35), (x + 0.10, y_side + sign * 0.22, SIDEWALK_TOP + 0.25),
           (x + 0.22, y_side + sign * (0.22 + curl * 0.5), SIDEWALK_TOP + 0.03), (x + 0.02, y_side + sign * (0.22 + curl), SIDEWALK_TOP + 0.03),
           (x - 0.12, y_side + sign * (0.20 + curl * 0.6), SIDEWALK_TOP + 0.05), (x - 0.06, y_side + sign * 0.10, 0.25 + SIDEWALK_TOP)]
    m.tube(RUBBER(), pts, 0.022, resolution=6)


def fast_unit(m, y):
    """The Endolla 50 kW cabinet (CCS + CHAdeMO + 22 kW AC), 0.80 m wide along the kerb, 1.95 m tall."""
    w, d, h = 0.80, 0.46, 1.78
    z0 = SIDEWALK_TOP + 0.10
    m.box(CONCRETE(), (0.62, 0.96, 0.10), (0.0, y, SIDEWALK_TOP + 0.05), bevel=0.01)
    m.box(WHITE(), (d, w, h), (0.0, y, z0 + h / 2), bevel=0.025, segments=3)
    m.box(CAP(), (d + 0.03, w + 0.03, 0.10), (0.0, y, z0 + h + 0.04), bevel=0.02)
    m.box(LED(), (d + 0.035, w + 0.035, 0.012), (0.0, y, z0 + h - 0.012))
    m.box(GRAPHITE(), (d - 0.04, w - 0.04, 0.05), (0.0, y, z0 + 0.025))                                          # base vent band
    for k in range(6):
        m.box(PANEL(), (d - 0.02, 0.012, 0.025), (0.0, y - 0.25 + 0.1 * k, z0 + 0.025))
    for face in (1, -1):                                      # both wide faces: branding, waves, the city shield
        xf = face * d / 2
        rot = read_on(face)
        wave_lines(m, xf, y - w / 2 + 0.06, y + w / 2 - 0.06, z0 + 0.10, z0 + h * 0.62, sign=face)
        m.text(GREEN(), "ENDOLLA BARCELONA", 0.085, (xf + face * 0.003, y + face * 0.27, z0 + h * 0.52), read_up_on(face), bold=True)
        m.box(RED(), (0.006, 0.07, 0.07), (xf + face * 0.003, y + face * 0.22, z0 + 0.20))
    # the user interface on the carriageway face: screen, card reader, emergency stop
    xf = d / 2
    m.box(PANEL(), (0.012, 0.42, 0.30), (xf + 0.004, y, z0 + h * 0.80), bevel=0.01)
    m.box(SCREEN(), (0.006, 0.30, 0.18), (xf + 0.012, y + 0.02, z0 + h * 0.82))
    m.box(GRAPHITE(), (0.01, 0.10, 0.08), (xf + 0.012, y - 0.15, z0 + h * 0.70))
    m.cylinder(RED(), 0.025, 0.03, (xf + 0.02, y + 0.16, z0 + h * 0.70), axis="X", segments=14)
    m.text(PAINT(), "50 kW", 0.035, (xf + 0.012, y + 0.02, z0 + h * 0.92), read_on(1), extrude=0.001)
    # two holsters, CCS and CHAdeMO, one on each narrow side, and the AC socket under the screen
    for sign in (1, -1):
        holster_and_cable(m, 0.05, y + sign * w / 2, z0 + h * 0.66, sign)
    m.box(PANEL(), (0.02, 0.12, 0.12), (xf + 0.01, y, z0 + h * 0.52), bevel=0.01)
    return w


def hpc_unit(m, y):
    """A 160 kW high-power unit: taller and slimmer, dark front, cables hung from an arm over the bay."""
    w, d, h = 0.70, 0.55, 2.10
    z0 = SIDEWALK_TOP + 0.10
    m.box(CONCRETE(), (0.72, 0.86, 0.10), (0.0, y, SIDEWALK_TOP + 0.05), bevel=0.01)
    m.box(WHITE(), (d, w, h), (0.0, y, z0 + h / 2), bevel=0.03, segments=3)
    m.box(GRAPHITE(), (0.02, w - 0.10, h - 0.30), (d / 2 + 0.005, y, z0 + h / 2 + 0.05), bevel=0.01)
    m.box(LED(), (0.012, 0.02, h - 0.50), (d / 2 + 0.016, y - w / 2 + 0.08, z0 + h / 2 + 0.05))
    m.box(LED(), (0.012, 0.02, h - 0.50), (d / 2 + 0.016, y + w / 2 - 0.08, z0 + h / 2 + 0.05))
    m.box(SCREEN(), (0.008, 0.34, 0.24), (d / 2 + 0.018, y, z0 + h * 0.78))
    m.text(PAINT(), "160 kW", 0.05, (d / 2 + 0.019, y, z0 + h * 0.62), read_on(1), extrude=0.001)
    for face in (1, -1):
        m.text(GREEN(), "ENDOLLA BARCELONA", 0.085, (face * 0.003, y + face * (w / 2 + 0.003), z0 + h * 0.50),
               ((0, 0, 1), (face, 0, 0)), bold=True)
    m.box(CAP(), (d + 0.03, w + 0.03, 0.08), (0.0, y, z0 + h + 0.03), bevel=0.02)
    # cable arm and two liquid-cooled cables
    arm_top = z0 + h + 0.35
    m.cylinder(STEEL(), 0.035, 0.40, (-0.10, y, z0 + h + 0.20), segments=12)
    m.box(GRAPHITE(), (0.70, 0.08, 0.08), (0.22, y, arm_top), bevel=0.02)
    for sign in (1, -1):
        m.tube(RUBBER(), [(0.52, y + sign * 0.03, arm_top - 0.04), (0.58, y + sign * 0.18, 1.6), (0.48, y + sign * 0.30, 1.05),
                          (d / 2 + 0.03, y + sign * 0.26, z0 + h * 0.55)], 0.026, resolution=6)
        m.box(HANDLE(), (0.06, 0.12, 0.20), (d / 2 + 0.03, y + sign * 0.24, z0 + h * 0.52), bevel=0.012)
    return w


def street_post(m, y):
    """The Endolla street post (two sockets a side): slim, white, round-topped, black socket panel."""
    w, d, h = 0.30, 0.24, 1.40
    z0 = SIDEWALK_TOP
    m.box(PEARL(), (d, w, h - w / 2), (0.0, y, z0 + (h - w / 2) / 2), bevel=0.03, segments=3)
    m.cylinder(PEARL(), w / 2, d, (0.0, y, z0 + h - w / 2), axis="X", segments=24)
    m.box(LED(), (d + 0.004, 0.012, 0.16), (0.0, y + w / 2 - 0.012, z0 + h - 0.24))
    for face in (1, -1):
        xf = face * d / 2
        rot = read_on(face)
        m.box(PANEL(), (0.012, w - 0.08, 0.40), (xf + face * 0.004, y, z0 + h - 0.42), bevel=0.012)
        for k, letter in enumerate("AB"):
            sy = y + (k - 0.5) * 0.11 * face
            m.cylinder(GRAPHITE(), 0.035, 0.02, (xf + face * 0.012, sy, z0 + h - 0.50), axis="X", segments=16)
            m.text(PAINT(), letter, 0.06, (xf + face * 0.011, sy, z0 + h - 0.30), rot, extrude=0.001, bold=True)
        m.box(SCREEN(), (0.006, 0.12, 0.05), (xf + face * 0.012, y, z0 + h - 0.58))
        m.box(GREEN(), (0.006, w - 0.08, 0.13), (xf + face * 0.004, y, z0 + 0.42))
        m.text(PAINT(), "ENDOLLA", 0.032, (xf + face * 0.008, y, z0 + 0.44), rot, extrude=0.001, bold=True)
        m.box(RED(), (0.006, 0.05, 0.05), (xf + face * 0.004, y, z0 + 0.22))
    m.box(GRAPHITE(), (d + 0.02, w + 0.02, 0.04), (0.0, y, z0 + 0.02))
    return w


def read_on(face):
    """Axes for horizontal lettering read from a face whose outward normal is +X (1) or -X (-1)."""
    return ((0, face, 0), (0, 0, 1))


def read_up_on(face):
    """Axes for lettering running bottom to top on a face whose outward normal is +X (1) or -X (-1)."""
    return ((0, 0, 1), (0, -face, 0))


UNITS = {"f": (fast_unit, BAY_LENGTH), "h": (hpc_unit, BAY_LENGTH), "p": (street_post, 2.2)}


def charging_point(combo):
    """The units of one location along the kerb, with the sidewalk strip and, for car chargers, their bays."""
    m = Model(f"endolla-{combo}")
    spans = [UNITS[c][1] for c in combo]
    total = sum(spans)
    y = -total / 2
    centres = []
    for c, span in zip(combo, spans):
        centres.append((c, y + span / 2, y, y + span))
        y += span
    sidewalk(m, -total / 2 - 0.4, total / 2 + 0.4)
    for c, cy, y0, y1 in centres:
        UNITS[c][0](m, cy)
        if c in "fh":
            bay(m, y0 + 0.1, y1 - 0.1)
    return m


def parking_totem():
    """The totem at a municipal car park whose charging points are underground: B:SM blue, P, Endolla plate."""
    m = Model("endolla-parking")
    h = 2.60
    m.box(CONCRETE(), (0.50, 0.90, 0.10), (0.0, 0.0, 0.05), bevel=0.01)
    m.box(BSM_BLUE(), (0.24, 0.70, h), (0.0, 0.0, 0.10 + h / 2), bevel=0.03, segments=3)
    for face in (1, -1):
        xf = face * 0.12
        rot = read_on(face)
        m.box(PAINT(), (0.006, 0.50, 0.50), (xf + face * 0.003, 0.0, 0.10 + h - 0.40), bevel=0.02)
        m.text(BSM_BLUE(), "P", 0.40, (xf + face * 0.008, 0.0, 0.10 + h - 0.42), rot, extrude=0.003, bold=True)
        m.box(GREEN(), (0.006, 0.50, 0.42), (xf + face * 0.003, 0.0, 0.10 + h - 1.00), bevel=0.02)
        m.text(PAINT(), "ENDOLLA", 0.075, (xf + face * 0.008, 0.0, 0.10 + h - 0.92), rot, extrude=0.002, bold=True)
        m.text(PAINT(), "recàrrega", 0.05, (xf + face * 0.008, 0.0, 0.10 + h - 1.05), rot, extrude=0.002)
        # the plug pictogram: a socket face with two pins
        m.cylinder(PAINT(), 0.06, 0.006, (xf + face * 0.008, 0.0, 0.10 + h - 1.32), axis="X", segments=16)
        m.text(PAINT(), "Aparcament municipal", 0.04, (xf + face * 0.008, 0.0, 0.10 + h - 1.62), rot, extrude=0.002)
        m.box(LED(), (0.004, 0.60, 0.012), (xf + face * 0.003, 0.0, 0.10 + h - 0.07))
    return m


# Build ------------------------------------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
manifest = {}
for combo in COMBOS:
    manifest[f"endolla-{combo}"] = charging_point(combo).export()
manifest["endolla-parking"] = parking_totem().export()
entries = {k: {"file": f"{k}.glb", "kind": "place", **v} for k, v in manifest.items()}
with open(os.path.join(OUT, "charger_manifest.json"), "w") as fh:
    json.dump(entries, fh, indent=2)
print(json.dumps(entries, indent=1))
