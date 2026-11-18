"""
Renders a three-quarter preview of every model in a folder, to look at before a model ships.

    blender --background --factory-startup --python tools/blender/render_previews.py -- assets/models <out-dir>
"""

import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT = args[0], args[1]
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 960, 540
scene.render.film_transparent = False
world = bpy.data.worlds.new("preview")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.82, 0.86, 0.9, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
scene.world = world
scene.view_settings.view_transform = "AgX"

for name in sorted(f for f in os.listdir(SRC) if f.endswith(".glb")):
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, name))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    centre, size = (lo + hi) / 2, max((hi - lo).length, 1.0)

    bpy.ops.mesh.primitive_plane_add(size=size * 4, location=(centre.x, centre.y, lo.z))
    ground = bpy.context.active_object
    mat = bpy.data.materials.new("ground")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.36, 0.37, 1)
    ground.data.materials.append(mat)

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    scene.collection.objects.link(sun)

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    # Front-right three-quarter view: the +X cab and its headlights face the camera. Distance from the
    # bounding sphere and the field of view, so every model is framed whole whatever its proportions.
    cam.data.lens = 50
    radius = (hi - lo).length / 2
    # At 16:9 the vertical field of view is the narrow one, so it decides the distance.
    distance = radius / math.sin(min(cam.data.angle_x, cam.data.angle_y) / 2) * 1.05
    direction = Vector((0.78, -0.55, 0.3)).normalized()
    cam.location = centre + direction * distance
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT, name.replace(".glb", ".png"))
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)
