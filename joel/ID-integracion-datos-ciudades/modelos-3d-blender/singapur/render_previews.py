"""
Renders one preview PNG per model, so a change to a model can be reviewed without a viewer:

    blender --background --factory-startup --python tools/blender/render_previews.py -- models docs/img

Cycles on the CPU at low samples: slower than EEVEE but it runs headless on any machine.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else ["models", "docs/img"]
SRC, OUT = args[0], args[1]
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 960, 540
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.78, 0.84, 0.9, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.world = world
    return scene


for filename in sorted(f for f in os.listdir(SRC) if f.endswith(".glb")):
    scene = reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, filename))
    objects = [o for o in scene.objects if o.type == "MESH"]
    corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    centre, size = (low + high) / 2, (high - low).length

    bpy.ops.mesh.primitive_plane_add(size=size * 4, location=(centre.x, centre.y, 0))
    ground = bpy.context.object
    mat = bpy.data.materials.new("ground")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.42, 0.33, 1)
    ground.data.materials.append(mat)

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    scene.collection.objects.link(sun)

    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    camera.data.lens = 35
    scene.collection.objects.link(camera)
    # Three-quarter view from the front-left (+X is forward), a little above.
    direction = Vector((1.0, -1.1, 0.7)).normalized()
    # Tall, narrow models (a mast) need more distance than their diagonal suggests to fit the frame.
    extent = high - low
    tall = extent.z > max(extent.x, extent.y)
    camera.location = centre + direction * size * (1.9 if tall else 1.15)
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    scene.render.filepath = os.path.join(OUT, filename.replace(".glb", ".png"))
    bpy.ops.render.render(write_still=True)
    print(f"rendered {scene.render.filepath}")
