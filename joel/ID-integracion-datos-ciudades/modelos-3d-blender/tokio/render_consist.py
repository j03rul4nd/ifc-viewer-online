"""
Renders a train the way a scene draws it: one model per car, laid on a curve, plus a close-up of the cab.

    blender --background --factory-startup --python tools/blender/render_consist.py -- assets/models <cab> <middle> <cars> <car-length> <out.png> [pantograph-car-indices]
"""

import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
SRC, CAB, MIDDLE, CARS, CAR_LEN, OUT = args[0], args[1], args[2], int(args[3]), float(args[4]), args[5]
PANTOGRAPHS = {int(i) for i in args[6].split(",")} if len(args) > 6 and args[6] else set()

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.view_settings.view_transform = "AgX"
world = bpy.data.worlds.new("preview")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.62, 0.7, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
scene.world = world
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj)


def load(key):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f"{key}.glb"))
    return [o for o in bpy.data.objects if o not in before]


# A curve of radius 160 m, like the tight Oedo curves; cars are placed by arc length, heading along it.
R = 160.0
total = CARS * CAR_LEN
for i in range(CARS):
    s = total / 2 - (i + 0.5) * CAR_LEN
    angle = s / R
    x, y = R * math.sin(angle), R - R * math.cos(angle)
    heading = angle
    last = i == CARS - 1
    key = CAB if i == 0 or last else (f"{MIDDLE}-pantograph" if i in PANTOGRAPHS else MIDDLE)
    for obj in load(key):
        if obj.parent is None:
            obj.location = (x, y, 0)
            obj.rotation_mode = "XYZ"
            obj.rotation_euler = (0, 0, heading + (math.pi if last else 0))

# Track: two rails and sleepers along the same curve.
steel = bpy.data.materials.new("rail")
steel.use_nodes = True
steel.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.33, 0.3, 1)
ballast = bpy.data.materials.new("ballast")
ballast.use_nodes = True
ballast.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.28, 0.28, 0.27, 1)
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, -0.01))
bpy.context.active_object.data.materials.append(ballast)
for k in range(-160, 161, 2):
    a = k / R
    bpy.ops.mesh.primitive_cube_add(size=1, location=(R * math.sin(a), R - R * math.cos(a), 0.05))
    sleeper = bpy.context.active_object
    sleeper.scale = (0.12, 1.3, 0.05)
    sleeper.rotation_euler = (0, 0, a)
    sleeper.data.materials.append(steel)

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(45), math.radians(15), math.radians(40))
scene.collection.objects.link(sun)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.lens = 35

def on_curve(s):
    a = s / R
    return Vector((R * math.sin(a), R - R * math.cos(a), 0)), a


front, front_angle = on_curve(total / 2)
ahead = Vector((math.cos(front_angle), math.sin(front_angle), 0))
right = Vector((math.sin(front_angle), -math.cos(front_angle), 0))
middle, _ = on_curve(0)
shots = [
    ("", middle + Vector((0, 0, 1.5)), Vector((total * 0.1, -total * 0.8, total * 0.45))),
    # Three-quarter view of the leading cab, from ahead and to the right.
    ("-cab", front + Vector((0, 0, 1.8)) - ahead * 4, ahead * 14 + right * 9 + Vector((0, 0, 3.5))),
]
for suffix, target, offset in shots:
    cam.location = target + offset
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = OUT.replace(".png", f"{suffix}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)
