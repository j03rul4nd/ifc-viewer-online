"""
Builds the 3D models this service publishes for CDE scenes, procedurally, so they are reproducible and
small. Run with Blender 5.x:

    blender --background --factory-startup --python tools/blender/build_models.py -- models

Conventions — the same as MW-TS-API-Shinjuku's models and the CDE viewer's existing train.glb, so one
piece of drawing code orients all of them:
  * metres, real-world size;
  * forward is +X — for a station, along the track; up is +Z in Blender, +Y in the exported glTF;
  * origin at the centre of the footprint, on the ground;
  * PBR materials only, no textures, so a model is tens of kilobytes.

A feature is rotated by its `heading` (degrees clockwise from north) about the vertical, so a station
lies along its track: the service computes that heading from the line geometry at each platform.

These are stylised representations drawn from the common shape of Singapore's stations — a curved roof
over an island or side platforms on a viaduct, a canopy over stairs for an underground one — not LTA's
or any operator's official models, and they carry no logo or artwork.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "models"
os.makedirs(OUT, exist_ok=True)


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


CONCRETE = lambda: material("concrete", "#C9C6BE", roughness=0.85)  # noqa: E731
CONCRETE_DARK = lambda: material("concrete_dark", "#8E8B84", roughness=0.9)  # noqa: E731
ROOF = lambda: material("roof_metal", "#E4E7EA", metallic=0.3, roughness=0.35)  # noqa: E731
STEEL = lambda: material("steel", "#5D6770", metallic=0.3, roughness=0.4)  # noqa: E731
GLASS = lambda: material("glass", "#9FC7D6", metallic=0.1, roughness=0.05, alpha=0.45)  # noqa: E731
PLATFORM = lambda: material("platform", "#B7B2A8", roughness=0.8)  # noqa: E731
SCREEN_DOOR = lambda: material("screen_doors", "#2B3A44", metallic=0.3, roughness=0.2, alpha=0.7)  # noqa: E731
TRACKBED = lambda: material("trackbed", "#4A4744", roughness=0.95)  # noqa: E731
SIGN = lambda: material("sign_panel", "#FFFFFF", emission="#FFFFFF", strength=2.5)  # noqa: E731
BAND = lambda: material("band", "#3F5566", roughness=0.4)  # noqa: E731


# Geometry -----------------------------------------------------------------------------------------------


class Model:
    """One mesh, many materials: exported as a single glTF mesh with one primitive per material."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.materials = []

    def paint(self, faces, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        index = self.materials.index(mat)
        for face in faces:
            if face.is_valid:
                face.material_index = index

    def box(self, mat, size, centre):
        result = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = result["verts"]
        for v in verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        bmesh.ops.translate(self.bm, verts=verts, vec=Vector(centre))
        self.paint(list({f for v in verts for f in v.link_faces}), mat)

    def cylinder(self, mat, radius, depth, centre, segments=12):
        result = bmesh.ops.create_cone(
            self.bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=depth
        )
        bmesh.ops.translate(self.bm, verts=result["verts"], vec=Vector(centre))
        self.paint(list({f for v in result["verts"] for f in v.link_faces}), mat)

    def vault(self, mat, length, width, rise, base_z, thickness=0.3, segments=10, centre_x=0.0):
        """A barrel roof along X: an arc across Y from -width/2 to +width/2, rising `rise` above base_z."""
        def arc(offset):
            points = []
            for k in range(segments + 1):
                t = k / segments
                y = -width / 2 + t * width
                z = base_z + offset + rise * math.sin(math.pi * t)
                points.append((y, z))
            return points

        outer, inner = arc(thickness), arc(0.0)
        faces = []
        for x0, x1 in [(centre_x - length / 2, centre_x + length / 2)]:
            o0 = [self.bm.verts.new((x0, y, z)) for y, z in outer]
            o1 = [self.bm.verts.new((x1, y, z)) for y, z in outer]
            i0 = [self.bm.verts.new((x0, y, z)) for y, z in inner]
            i1 = [self.bm.verts.new((x1, y, z)) for y, z in inner]
            for k in range(segments):
                faces.append(self.bm.faces.new((o0[k], o1[k], o1[k + 1], o0[k + 1])))
                faces.append(self.bm.faces.new((i0[k + 1], i1[k + 1], i1[k], i0[k])))
                faces.append(self.bm.faces.new((o0[k], o0[k + 1], i0[k + 1], i0[k])))
                faces.append(self.bm.faces.new((o1[k + 1], o1[k], i1[k], i1[k + 1])))
            faces.append(self.bm.faces.new((o0[0], i0[0], i1[0], o1[0])))
            faces.append(self.bm.faces.new((o0[-1], o1[-1], i1[-1], i0[-1])))
        self.paint(faces, mat)

    def export(self):
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.materials:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        if hasattr(mesh, "shade_smooth_by_angle"):
            mesh.shade_smooth_by_angle(angle=math.radians(35))
        for other in bpy.context.scene.objects:
            other.select_set(False)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        path = os.path.join(OUT, f"{self.name}.glb")
        bpy.ops.export_scene.gltf(
            filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True
        )
        tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
        print(f"{self.name}: {os.path.getsize(path)} bytes, {tris} triangles")
        obj.hide_render = False
        return obj


# Stations -----------------------------------------------------------------------------------------------


def station_on_deck(m, *, length, width, deck_z, roof_rise, platform="island", piers=True):
    """
    The part every above-ground station shares: a deck at `deck_z` carrying two tracks and platforms, a
    concourse box under it, platform screen doors, and a barrel roof over the whole length.
    """
    half_w = width / 2
    # Deck slab and the two trackbeds, set into it.
    m.box(CONCRETE(), (length, width, 0.8), (0, 0, deck_z - 0.4))
    track_y = [-half_w + 2.2, half_w - 2.2] if platform == "island" else [-2.0, 2.0]
    for y in track_y:
        m.box(TRACKBED(), (length + 20, 3.4, 0.35), (0, y, deck_z + 0.1))
    # Platforms: one island between the tracks, or one on each side.
    if platform == "island":
        m.box(PLATFORM(), (length - 6, width - 8.8, 1.1), (0, 0, deck_z + 0.55))
        edges = [-(width - 8.8) / 2, (width - 8.8) / 2]
    else:
        side = (half_w - 3.8)
        for sign in (-1, 1):
            m.box(PLATFORM(), (length - 6, side, 1.1), (0, sign * (3.8 + side / 2), deck_z + 0.55))
        edges = [-3.8, 3.8]
    for y in edges:
        m.box(SCREEN_DOOR(), (length - 10, 0.12, 2.2), (0, y, deck_z + 2.2))
    # Roof on slim columns, the barrel vault over everything.
    column_z = deck_z + 1.1
    column_h = 6.0
    for x in [(-length / 2 + 8) + i * ((length - 16) / 5) for i in range(6)]:
        for y in (-half_w + 0.4, half_w - 0.4):
            m.box(STEEL(), (0.5, 0.5, column_h), (x, y, column_z + column_h / 2))
    m.vault(ROOF(), length, width + 1.2, roof_rise, column_z + column_h)
    # A coloured fascia under the eaves, the one accent: grey-blue, not a line colour.
    for y in (-half_w - 0.6, half_w + 0.6):
        m.box(BAND(), (length, 0.25, 0.8), (0, y, column_z + column_h + 0.2))
    if piers:
        # Concourse under the deck, glazed, and paired piers carrying the viaduct beyond it.
        concourse_h = deck_z - 1.6
        m.box(CONCRETE_DARK(), (length * 0.45, width * 0.8, concourse_h), (0, 0, concourse_h / 2))
        m.box(GLASS(), (length * 0.45 + 0.2, width * 0.8 + 0.2, concourse_h * 0.6), (0, 0, concourse_h * 0.5))
        for x in [(-length / 2 + 6) + i * ((length - 12) / 4) for i in range(5)]:
            m.box(CONCRETE(), (2.0, 3.0, deck_z - 0.8), (x, 0, (deck_z - 0.8) / 2))
        # Entrance canopies at both ends of the concourse, where passengers come in.
        for sign in (-1, 1):
            m.box(ROOF(), (8, 6, 0.3), (0, sign * (width * 0.4 + 3), 3.6))
            for x in (-3.5, 3.5):
                m.box(STEEL(), (0.2, 0.2, 3.5), (x, sign * (width * 0.4 + 5.5), 1.75))


def mrt_elevated(name):
    """An MRT station on a viaduct: ~140 m of island platform nine metres up, under a barrel roof."""
    m = Model(name)
    station_on_deck(m, length=140, width=22, deck_z=9.0, roof_rise=3.5, platform="island", piers=True)
    return m.export()


def mrt_at_grade(name):
    """An MRT station at street level: the same deck and roof, on the ground, with a side concourse."""
    m = Model(name)
    station_on_deck(m, length=140, width=22, deck_z=1.0, roof_rise=3.5, platform="island", piers=False)
    m.box(CONCRETE_DARK(), (40, 10, 5), (0, -17, 2.5))
    m.box(GLASS(), (40.2, 10.2, 3.2), (0, -17, 2.4))
    return m.export()


def lrt_elevated(name):
    """An LRT station: a short viaduct box, side platforms either side of the guideway, lighter roof."""
    m = Model(name)
    station_on_deck(m, length=50, width=14, deck_z=8.0, roof_rise=2.2, platform="side", piers=True)
    return m.export()


def mrt_entrance(name):
    """
    The surface sign of an underground station: a canopy over an escalator and stairs going down towards
    -X, glazed sides, and a tall illuminated pylon at +X that is what one looks for across the street.
    """
    m = Model(name)
    length, width, height = 12.0, 7.0, 4.2
    for x in (-length / 2 + 0.3, 0, length / 2 - 0.3):
        for y in (-width / 2 + 0.3, width / 2 - 0.3):
            m.box(STEEL(), (0.25, 0.25, height), (x, y, height / 2))
    m.vault(ROOF(), length + 1.5, width + 1.0, 0.9, height)
    for y in (-width / 2, width / 2):
        m.box(GLASS(), (length - 0.6, 0.06, 2.6), (0, y, 1.5))
        m.box(CONCRETE(), (length, 0.3, 0.9), (0, y, 0.45))
    # Escalator and stairs side by side, stepping down towards -X.
    steps = 12
    for i in range(steps):
        z = -0.25 * i
        m.box(PLATFORM(), (length / steps, width / 2 - 0.6, 0.12), (length / 2 - (i + 0.5) * length / steps, -width / 4, z))
    m.box(STEEL(), (length, width / 2 - 0.8, 0.25), (0, width / 4, -1.4))
    # The pylon: a slender tower with a lit panel near the top.
    m.box(BAND(), (1.0, 1.0, 7.5), (length / 2 + 1.5, 0, 3.75))
    for y in (-0.52, 0.52):
        m.box(SIGN(), (0.8, 0.04, 1.6), (length / 2 + 1.5, y, 6.3))
    return m.export()


def weather_station(name):
    """
    An NEA-style automatic station in its fenced plot: a 10 m mast with anemometer, vane and solar panel,
    a louvred screen on its stand and a rain gauge. The fence is what makes it read at city scale.
    """
    m = Model(name)
    white = material("screen_white", "#F2F2EE", roughness=0.6)
    grass = material("plot_grass", "#6E8B5A", roughness=0.95)
    panel = material("solar_panel", "#1E2A44", metallic=0.4, roughness=0.2)
    side = 6.0
    m.box(grass, (side, side, 0.05), (0, 0, 0.025))
    # Fence: posts every metre and a half, two rails.
    posts = int(side / 1.5)
    for i in range(posts + 1):
        t = -side / 2 + i * side / posts
        for x, y in ((t, -side / 2), (t, side / 2), (-side / 2, t), (side / 2, t)):
            m.box(STEEL(), (0.06, 0.06, 1.5), (x, y, 0.75))
    for z in (0.5, 1.4):
        for sign in (-1, 1):
            m.box(STEEL(), (side, 0.04, 0.04), (0, sign * side / 2, z))
            m.box(STEEL(), (0.04, side, 0.04), (sign * side / 2, 0, z))
    # Mast with a cross-arm: cup anemometer on one end, vane on the other; a solar panel half-way up.
    m.box(CONCRETE(), (0.8, 0.8, 0.3), (-1.5, -1.5, 0.15))
    m.cylinder(STEEL(), 0.07, 10.0, (-1.5, -1.5, 5.0))
    m.box(STEEL(), (1.6, 0.06, 0.06), (-1.5, -1.5, 10.0))
    m.cylinder(white, 0.25, 0.1, (-2.3, -1.5, 10.15), segments=10)
    m.box(white, (0.5, 0.04, 0.3), (-0.6, -1.5, 10.15))
    m.box(panel, (1.0, 0.05, 0.7), (-1.5, -1.9, 5.5))
    # Screen on its stand, and the rain gauge.
    m.box(white, (0.8, 0.6, 0.8), (1.2, 1.0, 1.6))
    for x in (0.9, 1.5):
        for y in (0.8, 1.2):
            m.box(white, (0.06, 0.06, 1.2), (x, y, 0.6))
    m.cylinder(STEEL(), 0.2, 0.7, (1.2, -1.2, 0.35), segments=16)
    return m.export()


for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj)

BUILDERS = {
    "sg-mrt-elevated": mrt_elevated,
    "sg-mrt-at-grade": mrt_at_grade,
    "sg-lrt-elevated": lrt_elevated,
    "sg-mrt-entrance": mrt_entrance,
    "sg-weather-station": weather_station,
}
for key, build in BUILDERS.items():
    build(key)
