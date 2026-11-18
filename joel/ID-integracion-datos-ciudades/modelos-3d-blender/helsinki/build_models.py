"""
Builds the 3D models this service names in `presentation.model` for CDE scenes, procedurally, so they are
reproducible and small. Run with Blender 5.x:

    blender --background --factory-startup --python tools/blender/build_models.py -- assets/models

The geometry helpers are the ones MW-TS-API-Shinjuku uses, copied so each connector builds on its own.
Conventions every model follows (the CDE viewer relies on them):
  * metres, real-world size;
  * forward (the cab, the bow) is +X; up is +Z in Blender, +Y in the exported glTF;
  * origin at the centre of the footprint, on the ground (rail head, road surface, waterline);
  * PBR materials only, no textures, so a model is tens of kilobytes.

HSL vehicles are published one per vehicle (no consist), so a rail model is a whole unit. These are
stylised representations in HSL's published mode colours, not the operator's official models or artwork.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "assets/models"
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


GLASS = lambda: material("glass", "#0B1117", metallic=0.0, roughness=0.18)  # noqa: E731
DARK = lambda: material("underframe", "#26292C", metallic=0.3, roughness=0.75)  # noqa: E731
EQUIP = lambda: material("equipment", "#3A3F44", metallic=0.4, roughness=0.6)  # noqa: E731
RUBBER = lambda: material("rubber", "#111111", roughness=0.9)  # noqa: E731
STEEL = lambda: material("wheel_steel", "#71777D", metallic=0.9, roughness=0.3)  # noqa: E731
HEAD = lambda: material("headlight", "#FFFFFF", emission="#FFF4D6", strength=8.0)  # noqa: E731
TAIL = lambda: material("taillight", "#A00000", emission="#FF2020", strength=5.0)  # noqa: E731
DISPLAY = lambda: material("destination_display", "#151515", emission="#FFB23F", strength=2.5)  # noqa: E731
GANGWAY = lambda: material("gangway", "#1B1D1F", roughness=0.95)  # noqa: E731


# Geometry -----------------------------------------------------------------------------------------------


class Model:
    """One mesh, many materials: exported as a single glTF mesh with one primitive per material."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.materials = []

    def slot(self, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        return self.materials.index(mat)

    def paint(self, faces, mat):
        index = self.slot(mat)
        for face in faces:
            if face.is_valid:
                face.material_index = index

    def box(self, mat, size, centre, bevel=0.0, segments=2, rotation=(0.0, 0.0, 0.0)):
        result = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = result["verts"]
        for v in verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if any(rotation):
            bmesh.ops.rotate(self.bm, verts=verts, cent=Vector((0, 0, 0)), matrix=Euler(rotation, "XYZ").to_matrix())
        bmesh.ops.translate(self.bm, verts=verts, vec=Vector(centre))
        faces = list({f for v in verts for f in v.link_faces})
        if bevel > 0:
            edges = list({e for v in verts for e in v.link_edges})
            out = bmesh.ops.bevel(self.bm, geom=edges + verts, offset=bevel, segments=segments, affect="EDGES", profile=0.5)
            faces = [f for f in set(faces + out["faces"]) if f.is_valid]
        self.paint(faces, mat)

    def cylinder(self, mat, radius, depth, centre, axis="Y", segments=16):
        result = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=depth)
        rotate = {"X": Euler((0, math.pi / 2, 0)), "Y": Euler((math.pi / 2, 0, 0)), "Z": Euler((0, 0, 0))}[axis].to_matrix()
        bmesh.ops.rotate(self.bm, verts=result["verts"], cent=Vector((0, 0, 0)), matrix=rotate)
        bmesh.ops.translate(self.bm, verts=result["verts"], vec=Vector(centre))
        self.paint(list({f for v in result["verts"] for f in v.link_faces}), mat)

    def loft(self, mat, sections, cap_start=True, cap_end=True):
        """
        A surface through cross-sections: each is (x, [(y, z), …]) with the same number of points, in
        order around the section. Consecutive sections are bridged with quads, ends optionally capped.
        """
        rings = []
        for x, profile in sections:
            rings.append([self.bm.verts.new((x, y, z)) for (y, z) in profile])
        faces = []
        count = len(rings[0])
        for a, b in zip(rings, rings[1:]):
            for i in range(count):
                j = (i + 1) % count
                faces.append(self.bm.faces.new((a[i], a[j], b[j], b[i])))
        if cap_start:
            faces.append(self.bm.faces.new(list(reversed(rings[0]))))
        if cap_end:
            faces.append(self.bm.faces.new(rings[-1]))
        self.paint(faces, mat)
        return faces

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
        # Crisp panel edges, smooth curved roofs: shade by angle.
        mesh.shade_smooth_by_angle(angle=math.radians(35)) if hasattr(mesh, "shade_smooth_by_angle") else None
        for other in bpy.context.scene.objects:
            other.select_set(False)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        path = os.path.join(OUT, f"{self.name}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True)
        tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
        print(f"{self.name}: {os.path.getsize(path)} bytes, {tris} triangles")
        bpy.data.objects.remove(obj)
        return path


def car_profile(width, floor, height, roof_radius, tumblehome=0.06, points_roof=6):
    """
    A rail car cross-section, as (y, z) going round from the bottom right: vertical lower sides, a slight
    tumblehome above the waist, and a roof arc. Symmetric about y = 0.
    """
    half = width / 2
    waist = floor + (height - floor) * 0.45
    eave = height - roof_radius * 0.55
    right = [(half * 0.96, floor), (half, floor + 0.15), (half, waist), (half - tumblehome, eave)]
    arc = []
    for k in range(1, points_roof + 1):
        t = k / (points_roof + 1)
        angle = t * math.pi / 2
        arc.append(((half - tumblehome) * math.cos(angle), eave + (height - eave) * math.sin(angle)))
    top = [(0.0, height)]
    left = [(-y, z) for (y, z) in reversed(right + arc)]
    return right + arc + top + left


def scale_profile(profile, sy, sz_from, sz):
    """Shrink a profile towards the centreline and the roof, for the rounded cab nose."""
    return [(y * sy, sz_from + (z - sz_from) * sz) for (y, z) in profile]


# Rail cars ----------------------------------------------------------------------------------------------


def rail_car(name, *, length, width, height, body, band, roof, cab, pantograph, doors, rake=0.5, nose=0.9, tram=False):
    """A rail car: lofted body with a shaped cab nose, windows with pillars, doors, roof, bogies."""
    m = Model(name)
    floor = 0.95 if not tram else 0.45
    profile = car_profile(width, floor, height, roof_radius=0.9 if not tram else 0.6)
    half = length / 2

    # Body: straight sections, then on a cab car a nose that narrows and drops towards +X — a rounded,
    # raked cab front rather than a box end.
    sections = [(-half, profile), (half - (nose if cab else 0.0), profile)]
    if cab:
        steps = 4
        for k in range(1, steps + 1):
            t = k / steps
            sections.append((half - nose + nose * t, scale_profile(profile, 1 - 0.12 * t**2, floor, 1 - 0.1 * t**1.5)))
    m.loft(body, sections)
    if cab:
        # The front face is the last nose section: 88 % of the width, 90 % of the height. Everything on
        # it is sized to that face, so nothing overhangs the rounded nose.
        face_w = width * 0.88
        face_top = floor + (height - floor) * 0.9
        face_h = face_top - floor
        # The black mask around the windscreen that makes a Toei cab read at a distance.
        m.box(GLASS(), (0.05, face_w * 0.9, face_h * 0.46), (half + 0.005, 0, floor + face_h * 0.7))
        m.box(DISPLAY(), (0.03, face_w * 0.42, face_h * 0.1), (half + 0.03, 0, floor + face_h * 0.86))
        m.box(band, (0.04, face_w * 0.94, face_h * 0.07), (half + 0.01, 0, floor + face_h * 0.42))
        for side in (-1, 1):
            m.box(HEAD(), (0.05, face_w * 0.12, face_h * 0.06), (half + 0.02, side * face_w * 0.32, floor + face_h * 0.3))
        # Skirt and coupler under the cab.
        m.box(DARK(), (0.25, face_w * 0.95, 0.42), (half - 0.12, 0, floor - 0.12))
        m.box(DARK(), (0.5, 0.26, 0.2), (half + 0.2, 0, floor - 0.05))
    else:
        # Gangway bellows at the front end.
        m.box(GANGWAY(), (0.35, 1.1, (height - floor) * 0.78), (half + 0.15, 0, floor + (height - floor) * 0.42))
    # Rear end: tail lights on a cab car (it runs as the last car turned round), a gangway on both.
    m.box(GANGWAY(), (0.35, 1.1, (height - floor) * 0.78), (-half - 0.15, 0, floor + (height - floor) * 0.42))
    if cab:
        for side in (-1, 1):
            m.box(TAIL(), (0.06, 0.2, 0.12), (-half - 0.01, side * width * 0.36, floor + (height - floor) * 0.24))

    # Sides: livery band, windows between pillars, doors with their own windows.
    body_h = height - floor
    win_bottom = floor + body_h * 0.48
    win_top = floor + body_h * 0.8
    usable = length - (nose + 1.2 if cab else 1.0) * 2
    door_xs = [-usable / 2 + usable * (i + 0.5) / doors for i in range(doors)]
    door_w = 1.3
    for side in (-1, 1):
        y = side * (width / 2 + 0.012)
        m.box(band, (length - (nose * 1.2 if cab else 0.4), 0.02, body_h * 0.075), (-(nose * 0.3 if cab else 0.0), y, floor + body_h * 0.4))
        # Window runs between doors, split by pillars every ~1.6 m.
        edges = [-half + 0.9] + [x for d in door_xs for x in (d - door_w / 2 - 0.25, d + door_w / 2 + 0.25)] + [half - (nose + 0.6 if cab else 0.9)]
        for a, b in zip(edges[0::2], edges[1::2]):
            span = b - a
            panes = max(1, round(span / 1.6))
            pane = span / panes
            for k in range(panes):
                cx = a + pane * (k + 0.5)
                m.box(GLASS(), (pane - 0.16, 0.025, win_top - win_bottom), (cx, y, (win_top + win_bottom) / 2))
        for dx in door_xs:
            m.box(roof, (door_w, 0.03, body_h * 0.82), (dx, y * 1.002, floor + body_h * 0.43))
            for half_door in (-1, 1):
                m.box(GLASS(), (door_w / 2 - 0.2, 0.035, (win_top - win_bottom) * 1.05), (dx + half_door * door_w / 4, y * 1.004, (win_top + win_bottom) / 2 + 0.05))

    # Roof: air-conditioning units with grilles, a pantograph where the car carries one.
    for x in ((-length * 0.27, length * 0.27) if length > 15 else (-length * 0.2, length * 0.18)):
        m.box(roof, (2.6, width * 0.6, 0.34), (x, 0, height + 0.12), bevel=0.06, segments=1)
        m.box(EQUIP(), (2.0, width * 0.46, 0.03), (x, 0, height + 0.3))
    if pantograph:
        px = length * 0.12
        m.box(DARK(), (1.3, 0.9, 0.1), (px, 0, height + 0.08))
        m.box(DARK(), (1.35, 0.08, 0.08), (px - 0.35, 0, height + 0.45), rotation=(0, math.radians(-38), 0))
        m.box(DARK(), (1.45, 0.07, 0.07), (px + 0.12, 0, height + 1.1), rotation=(0, math.radians(32), 0))
        m.box(STEEL(), (0.18, 1.6, 0.06), (px - 0.45, 0, height + 1.5))

    # Underframe: equipment boxes, bogies with frames and wheels.
    m.box(DARK(), (length * 0.9, width * 0.84, 0.22), (0, 0, floor - 0.05))
    for k, ex in enumerate((-length * 0.12, 0.0, length * 0.12)):
        m.box(EQUIP(), (1.6 + 0.4 * (k % 2), width * 0.6, 0.45), (ex, 0, floor - 0.35))
    bogie_x = length * (0.33 if not tram else 0.3)
    for bx in (-bogie_x, bogie_x):
        m.box(DARK(), (2.6, width * 0.74, 0.28), (bx, 0, 0.62))
        for side in (-1, 1):
            m.box(EQUIP(), (2.2, 0.08, 0.32), (bx, side * width * 0.36, 0.5))
        for wx in (bx - 0.95, bx + 0.95):
            for side in (-1, 1):
                m.cylinder(STEEL(), 0.4 if not tram else 0.33, 0.12, (wx, side * 0.72, 0.4 if not tram else 0.33), axis="Y", segments=10)
    return m.export()


def bus(name, *, body_colour="#F3F4F1", band_colour="#00A26B", length=10.5):
    """A low-floor city bus: body, livery band, split windows, arches, mirrors."""
    m = Model(name)
    width, height = 2.55, 3.1
    white = material(f"{name}_body", body_colour, metallic=0.1, roughness=0.35)
    green = material(f"{name}_band", band_colour, roughness=0.4)
    profile = car_profile(width, 0.3, height, roof_radius=0.4, tumblehome=0.03, points_roof=4)
    m.loft(white, [(-length / 2, profile), (length / 2 - 0.3, profile), (length / 2, scale_profile(profile, 0.97, 0.3, 0.99))])
    for side in (-1, 1):
        y = side * (width / 2 + 0.01)
        m.box(green, (length * 0.97, 0.02, 0.26), (0, y, 0.95))
        m.box(green, (length * 0.9, 0.02, 0.09), (0, y, 2.62))
        # Windows between pillars, behind the front door.
        for k in range(5):
            cx = length / 2 - 2.9 - k * 1.45
            m.box(GLASS(), (1.3, 0.025, 1.0), (cx, y, 1.95))
        for x in (length / 2 - 1.35, -0.2):
            m.box(GLASS(), (1.05, 0.03, 2.05), (x, y, 1.35))
        for wx in (length / 2 - 2.3, -length / 2 + 2.6):
            m.box(DARK(), (1.25, 0.03, 0.72), (wx, y * 1.002, 0.55))
            m.cylinder(RUBBER(), 0.47, 0.3, (wx, side * (width / 2 - 0.1), 0.47), axis="Y", segments=14)
            m.cylinder(STEEL(), 0.26, 0.32, (wx, side * (width / 2 - 0.1), 0.47), axis="Y", segments=8)
        # Mirror on a stalk at the front corner.
        m.box(DARK(), (0.06, 0.35, 0.06), (length / 2 - 0.05, side * (width / 2 + 0.17), 2.35))
        m.box(DARK(), (0.08, 0.1, 0.32), (length / 2 - 0.05, side * (width / 2 + 0.34), 2.2), bevel=0.02)
    front = length / 2
    # A rougher glass for the windscreen: facing the sky, the side-window glass reads as grey.
    windscreen = material("windscreen", "#0A0F14", metallic=0.0, roughness=0.45)
    m.box(windscreen, (0.04, width * 0.88, 1.55), (front + 0.005, 0, 1.72))
    m.box(DISPLAY(), (0.04, width * 0.7, 0.28), (front + 0.01, 0, 2.72))
    m.box(DISPLAY(), (0.04, width * 0.5, 0.24), (-front - 0.01, 0, 2.7))
    for side in (-1, 1):
        m.box(HEAD(), (0.06, 0.32, 0.14), (front + 0.01, side * width * 0.36, 0.62), bevel=0.02)
        m.box(TAIL(), (0.06, 0.18, 0.32), (-front - 0.01, side * width * 0.4, 0.95))
    m.box(DARK(), (0.1, width * 0.96, 0.3), (front + 0.02, 0, 0.36), bevel=0.03)
    m.box(DARK(), (0.1, width * 0.96, 0.3), (-front - 0.02, 0, 0.36), bevel=0.03)
    m.box(white, (2.6, width * 0.7, 0.3), (-length * 0.25, 0, height + 0.12), bevel=0.08)
    return m.export()


def station_entrance(name):
    """A subway entrance: glazed canopy on posts over stairs going down towards -X, a lit sign at +X."""
    m = Model(name)
    frame = material("entrance_frame", "#5D6770", metallic=0.7, roughness=0.3)
    canopy = material("entrance_glass", "#9FC7D6", metallic=0.1, roughness=0.05, alpha=0.45)
    stone = material("entrance_stone", "#B9B4AA", roughness=0.8)
    sign = material("entrance_sign", "#FFFFFF", emission="#FFFFFF", strength=3.0)
    stripe = material("entrance_stripe", "#00A26B", roughness=0.4)
    length, width, height = 5.0, 2.8, 3.1
    for x in (-length / 2 + 0.1, length / 2 - 0.1):
        for y in (-width / 2 + 0.1, width / 2 - 0.1):
            m.box(frame, (0.12, 0.12, height), (x, y, height / 2))
    m.box(canopy, (length + 0.3, width + 0.3, 0.08), (0, 0, height + 0.04))
    m.box(frame, (length + 0.4, width + 0.4, 0.12), (0, 0, height + 0.14), bevel=0.03)
    for side in (-1, 1):
        m.box(canopy, (length - 0.2, 0.04, height * 0.7), (0, side * width / 2, height * 0.35 + 0.9))
        m.box(stone, (length, 0.2, 0.9), (0, side * width / 2, 0.45))
        # Handrail along each wall.
        m.box(frame, (length, 0.05, 0.05), (0, side * (width / 2 - 0.2), 0.95))
    m.box(canopy, (0.04, width - 0.2, height * 0.7), (-length / 2, 0, height * 0.35 + 0.9))
    steps = 10
    for i in range(steps):
        m.box(stone, (length / steps, width - 0.4, 0.08), (length / 2 - (i + 0.5) * length / steps, 0, -0.17 * i))
    m.box(frame, (0.1, 1.5, 0.7), (length / 2, 0, height - 0.35))
    m.box(sign, (0.08, 1.4, 0.58), (length / 2 + 0.05, 0, height - 0.35))
    m.box(stripe, (0.09, 1.4, 0.12), (length / 2 + 0.055, 0, height - 0.1))
    return m.export()


def tram_stop(name):
    """A tram stop: a raised platform with a shelter, a railing and a sign post."""
    m = Model(name)
    concrete = material("stop_concrete", "#C9C5BC", roughness=0.85)
    edge = material("stop_edge", "#F2C500", roughness=0.5)
    frame = material("stop_frame", "#5D6770", metallic=0.7, roughness=0.3)
    canopy = material("stop_glass", "#9FC7D6", metallic=0.1, roughness=0.05, alpha=0.45)
    sign = material("stop_sign", "#FFFFFF", emission="#FFFFFF", strength=2.0)
    length, width = 16.0, 2.2
    m.box(concrete, (length, width, 0.3), (0, 0, 0.15), bevel=0.03)
    m.box(edge, (length, 0.2, 0.02), (0, -width / 2 + 0.12, 0.31))
    for x in (-3.0, 3.0):
        m.box(frame, (0.1, 0.1, 2.5), (x, width / 2 - 0.25, 1.55))
    m.box(canopy, (6.6, 1.3, 0.06), (0, width / 2 - 0.6, 2.8))
    m.box(frame, (6.8, 1.4, 0.08), (0, width / 2 - 0.6, 2.86))
    m.box(canopy, (6.2, 0.04, 1.9), (0, width / 2 - 0.2, 1.4))
    m.box(frame, (length - 0.4, 0.05, 0.05), (0, width / 2 - 0.05, 1.3))
    for k in range(9):
        m.box(frame, (0.05, 0.05, 1.0), (-length / 2 + 0.2 + k * (length - 0.4) / 8, width / 2 - 0.05, 0.8))
    m.box(frame, (0.08, 0.08, 2.6), (length / 2 - 0.6, 0, 1.6))
    m.box(sign, (0.05, 0.6, 0.6), (length / 2 - 0.6, 0, 2.8))
    return m.export()


def weather_station(name):
    """An AMeDAS-style station: mast with anemometer and vane, a white louvred screen, a solar panel."""
    m = Model(name)
    white = material("screen_white", "#F2F2EE", roughness=0.6)
    mast = material("mast_steel", "#9AA0A6", metallic=0.8, roughness=0.3)
    panel = material("solar_panel", "#1E2A44", metallic=0.4, roughness=0.2)
    m.box(DARK(), (1.2, 1.2, 0.2), (0, 0, 0.1))
    m.cylinder(mast, 0.06, 6.5, (0, 0, 3.35), axis="Z", segments=12)
    m.box(mast, (1.2, 0.05, 0.05), (0, 0, 6.5))
    for x in (-0.6, 0.6):
        m.cylinder(mast, 0.02, 0.35, (x, 0, 6.7), axis="Z", segments=8)
    for angle in (0, 2 * math.pi / 3, 4 * math.pi / 3):
        m.cylinder(DARK(), 0.06, 0.05, (-0.6 + 0.15 * math.cos(angle), 0.15 * math.sin(angle), 6.9), axis="Z", segments=10)
    m.box(DARK(), (0.5, 0.03, 0.18), (0.75, 0, 6.9))
    m.box(mast, (0.06, 0.06, 1.2), (1.6, 0, 0.6))
    for i in range(5):
        m.box(white, (0.75, 0.65, 0.08), (1.6, 0, 1.25 + i * 0.12))
    m.box(white, (0.85, 0.75, 0.06), (1.6, 0, 1.9), bevel=0.02)
    m.box(panel, (0.9, 0.6, 0.04), (-1.3, 0, 1.4), rotation=(0, math.radians(-30), 0))
    m.box(mast, (0.05, 0.05, 1.4), (-1.3, 0, 0.7))
    return m.export()


for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj)


def ferry(name):
    """A small harbour ferry: a white hull with a blue boot top, a two-deck cabin, a wheelhouse, a mast."""
    m = Model(name)
    length, beam = 24.0, 6.4
    hull = material(f"{name}_hull", "#F4F6F7", roughness=0.4)
    boot = material(f"{name}_boot", "#00B9E4", roughness=0.35)
    deck = material(f"{name}_deck", "#8A6A4A", roughness=0.8)
    half = length / 2

    def section(width, depth):
        w = width / 2
        return [(-w, 0.9), (-w * 0.92, 0.2), (-w * 0.55, -depth), (w * 0.55, -depth), (w * 0.92, 0.2), (w, 0.9)]

    sections = [(-half, section(beam * 0.86, 0.9)), (-half * 0.4, section(beam, 1.2)), (half * 0.45, section(beam, 1.2))]
    for k in range(1, 5):
        t = k / 4
        sections.append((half * 0.45 + half * 0.55 * t, section(beam * (1 - 0.92 * t**1.6), 1.2 * (1 - 0.5 * t))))
    m.loft(hull, sections)
    for side in (-1, 1):
        m.box(boot, (length * 0.72, 0.03, 0.22), (-half * 0.1, side * (beam / 2 + 0.01), 0.45))
    m.box(deck, (length * 0.8, beam * 0.9, 0.08), (-half * 0.1, 0, 0.92))
    m.box(hull, (length * 0.5, beam * 0.8, 2.1), (-half * 0.2, 0, 2.0), bevel=0.15)
    for side in (-1, 1):
        for k in range(6):
            m.box(GLASS(), (1.2, 0.03, 0.9), (-half * 0.2 - length * 0.21 + k * 1.9, side * (beam * 0.4 + 0.01), 2.2))
    m.box(hull, (length * 0.28, beam * 0.62, 1.4), (-half * 0.25, 0, 3.7), bevel=0.12)
    m.box(GLASS(), (0.05, beam * 0.56, 0.7), (-half * 0.25 + length * 0.14 + 0.01, 0, 3.85))
    m.box(DARK(), (0.12, 0.12, 2.4), (-half * 0.25, 0, 5.4))
    m.box(boot, (0.9, beam * 0.66, 0.1), (-half * 0.25, 0, 4.45))
    for side in (-1, 1):
        m.box(HEAD(), (0.1, 0.12, 0.12), (half * 0.35, side * beam * 0.35, 1.3))
    return m.export()


# Tram: HSL Artic (Škoda-Transtech), 27.6 m, 2.4 m wide, low floor, HSL tram green with a white band.
rail_car(
    "hsl-tram",
    length=27.6, width=2.4, height=3.6,
    body=material("hsl_tram_body", "#00985F", roughness=0.4),
    band=material("hsl_tram_band", "#F4F6F7", roughness=0.4),
    roof=material("hsl_tram_roof", "#B9C2BE", roughness=0.6),
    cab=True, pantograph=True, doors=4, nose=0.7, tram=True,
)
# Metro: an M300-style unit, 2 × 22 m drawn as one, aluminium with the metro orange.
rail_car(
    "hsl-metro",
    length=44.0, width=3.2, height=3.7,
    # Not the real aluminium's 0.85: Luciad lights a model with no environment map, so a body that metallic
    # renders almost black (the Oedo 12-000 bug, 2026-09-30). 0.25 still reads as metal.
    body=material("hsl_metro_body", "#D5D9DC", metallic=0.25, roughness=0.35),
    band=material("hsl_metro_band", "#FF6319", roughness=0.35),
    roof=material("hsl_metro_roof", "#9AA1A7", metallic=0.3, roughness=0.5),
    cab=True, pantograph=False, doors=6, nose=1.2,
)
# Commuter train: a Sm5-style unit, white with the HSL commuter-rail purple.
rail_car(
    "hsl-train",
    length=75.0, width=3.2, height=4.1,
    body=material("hsl_train_body", "#F2F3F5", roughness=0.35),
    band=material("hsl_train_band", "#8C4799", roughness=0.35),
    roof=material("hsl_train_roof", "#8F969C", roughness=0.6),
    cab=True, pantograph=True, doors=8, nose=1.6,
)
bus("hsl-bus", body_colour="#007AC9", band_colour="#F4F6F7", length=12.0)
ferry("hsl-ferry")
