#!/usr/bin/env python
"""
Synthetic reality-capture rig.

Renders a camera trajectory over a known scene and dumps, per frame, exactly the
tensors a monocular reconstruction model (Depth Anything 3 / VGGT / MapAnything)
would hand us:

    rgb        (H, W, 3) uint8
    depth      (H, W)    float32, metres along the camera optical axis
    K          (3, 3)    float32, pinhole intrinsics in pixels
    c2w        (4, 4)    float32, camera-to-world, OpenCV convention (+X right,
                         +Y down, +Z forward)

The point of the rig is that the depth and the poses here are EXACT. Any error
measured downstream is the fusion code's fault, not the network's -- which is the
only way to tell the two apart before a GPU is in the picture.

Run:
    blender.exe -b --python blender_capture.py -- --scene room --out ./out

Scenes: object | room | structure   (see SCENES at the bottom)
"""

import argparse
import json
import math
import os
import sys

import bpy           # type: ignore
import numpy as np
from mathutils import Matrix, Vector   # type: ignore


# -- Scene construction -------------------------------------------------------

def _reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _material(name, rgb):
    """Flat, matte colour. Texture detail is irrelevant here: we never run a
    feature matcher on these renders, we consume the exact depth pass."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    return mat


def _box(name, size, location, colour):
    # primitive_cube_add(size=1) spans -0.5..0.5, so scale == full extent.
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = Vector(size)
    obj.data.materials.append(_material("mat_" + name, colour))
    return obj


def _cylinder(name, radius, depth, location, colour):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(_material("mat_" + name, colour))
    return obj


def build_object_scene():
    """Example 1 -- a few primitives on a ground plane. Orbit trajectory."""
    _box("ground", (6, 6, 0.05), (0, 0, -0.025), (0.55, 0.55, 0.58))
    _box("cube", (1.0, 1.0, 1.0), (0, 0, 0.5), (0.80, 0.30, 0.25))
    _cylinder("column", 0.25, 1.6, (1.4, 0.6, 0.8), (0.25, 0.45, 0.80))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.4, location=(-1.2, -0.8, 0.4))
    obj = bpy.context.active_object
    obj.name = "sphere"
    obj.data.materials.append(_material("mat_sphere", (0.30, 0.70, 0.35)))
    return orbit_trajectory(radius=4.2, height=2.4, target=(0, 0, 0.6))


def build_room_scene():
    """Example 2 -- an enclosed room with a window reveal, a column and a table.
    Inside-out trajectory, which is the hard case: little parallax on far walls."""
    W, D, H, T = 6.0, 4.0, 2.8, 0.15
    _box("floor",   (W, D, T), (0, 0, -T / 2),      (0.60, 0.55, 0.50))
    _box("ceiling", (W, D, T), (0, 0, H + T / 2),   (0.85, 0.85, 0.85))
    _box("wall_n",  (W, T, H), (0,  D / 2, H / 2),  (0.88, 0.86, 0.82))
    _box("wall_e",  (T, D, H), ( W / 2, 0, H / 2),  (0.88, 0.86, 0.82))
    _box("wall_w",  (T, D, H), (-W / 2, 0, H / 2),  (0.88, 0.86, 0.82))
    # South wall as two piers plus a lintel and a sill, leaving a window opening.
    _box("wall_s_l", (2.0, T, H),   (-2.0, -D / 2, H / 2), (0.88, 0.86, 0.82))
    _box("wall_s_r", (2.0, T, H),   ( 2.0, -D / 2, H / 2), (0.88, 0.86, 0.82))
    _box("lintel",   (2.0, T, 0.8), ( 0.0, -D / 2, 2.4),   (0.88, 0.86, 0.82))
    _box("sill",     (2.0, T, 0.9), ( 0.0, -D / 2, 0.45),  (0.88, 0.86, 0.82))
    _cylinder("column", 0.2, H, (1.0, 0.5, H / 2), (0.70, 0.70, 0.74))
    _box("table", (1.4, 0.8, 0.75), (-1.2, 0.6, 0.375), (0.45, 0.30, 0.20))
    return handheld_trajectory(centre=(0, 0, 1.5), radius=1.3, height=1.55)


def build_structure_scene():
    """Example 3 -- a BIM-shaped structure: slab, a 3x2 column grid, beams and a
    partial wall. This is the one that matters for IFC alignment, because every
    element here has an obvious IFC counterpart to register against."""
    _box("slab", (8.0, 6.0, 0.25), (0, 0, -0.125), (0.62, 0.62, 0.64))
    for i, x in enumerate((-3.0, 0.0, 3.0)):
        for j, y in enumerate((-2.0, 2.0)):
            _cylinder("col_%d%d" % (i, j), 0.22, 3.0, (x, y, 1.5), (0.72, 0.72, 0.76))
    for y in (-2.0, 2.0):
        _box("beam_%+.0f" % y, (7.0, 0.3, 0.45), (0, y, 3.2), (0.66, 0.66, 0.70))
    _box("slab_top", (8.0, 6.0, 0.25), (0, 0, 3.55), (0.62, 0.62, 0.64))
    _box("wall", (0.2, 4.0, 3.0), (-3.9, 0, 1.5), (0.85, 0.82, 0.78))
    return orbit_trajectory(radius=9.0, height=4.0, target=(0, 0, 1.6))


# -- Camera trajectories ------------------------------------------------------

def _look_at(eye, target, up=(0, 0, 1)):
    """Blender camera basis: it looks down its local -Z with +Y up."""
    eye, target, up = Vector(eye), Vector(target), Vector(up)
    fwd = (target - eye).normalized()
    right = fwd.cross(up).normalized()
    true_up = right.cross(fwd)
    rot = Matrix((right, true_up, -fwd)).transposed().to_4x4()
    rot.translation = eye
    return rot


def orbit_trajectory(radius, height, target, frames=36, turns=1.0):
    """A clean orbit -- roughly what a user filming a facade or an isolated
    element produces."""
    poses = []
    for i in range(frames):
        a = 2 * math.pi * turns * i / frames
        # Gentle height bob: a perfectly planar orbit is a degenerate baseline
        # for anything that has to solve for pose, so never generate one.
        h = height + 0.25 * math.sin(3 * a)
        poses.append(_look_at((radius * math.cos(a), radius * math.sin(a), h), target))
    return poses


def handheld_trajectory(centre, radius, height, frames=36):
    """Inside-out sweep with hand-held wobble: the camera stays near the middle of
    the room and turns outward, so translation is small relative to depth."""
    poses = []
    cx, cy = centre[0], centre[1]
    for i in range(frames):
        a = 2 * math.pi * i / frames
        eye = (cx + radius * math.cos(a) * 0.6,
               cy + radius * math.sin(a) * 0.6,
               height + 0.06 * math.sin(5 * a))
        target = (cx + 4.0 * math.cos(a), cy + 4.0 * math.sin(a), height - 0.25)
        poses.append(_look_at(eye, target))
    return poses


# -- Rendering ----------------------------------------------------------------

def _configure(scene, width, height, samples):
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = samples
        except AttributeError:
            pass
    # The Z pass is the whole reason this script exists: exact metric depth
    # straight out of the rasteriser, with no per-pixel ray_cast loop in Python.
    scene.view_layers[0].use_pass_z = True
    scene.use_nodes = True


def _depth_output_node(scene, directory):
    """Wire Render Layers.Depth into a File Output node writing single-layer EXR."""
    tree = scene.node_tree
    tree.nodes.clear()
    rl = tree.nodes.new("CompositorNodeRLayers")
    out = tree.nodes.new("CompositorNodeOutputFile")
    out.base_path = directory
    out.format.file_format = "OPEN_EXR"
    out.format.color_depth = "32"
    out.format.color_mode = "RGB"
    out.file_slots[0].path = "depth_"
    tree.links.new(rl.outputs["Depth"], out.inputs[0])
    return out


def _intrinsics(scene, cam_data):
    """Pinhole K in pixels. Blender fits the sensor to the LONGER image axis when
    sensor_fit is AUTO, which is the classic off-by-an-aspect-ratio trap here."""
    w = scene.render.resolution_x
    h = scene.render.resolution_y
    fit = cam_data.sensor_fit
    if fit == "VERTICAL":
        f_px = cam_data.lens / cam_data.sensor_height * h
    elif fit == "AUTO" and h > w:
        f_px = cam_data.lens / cam_data.sensor_width * h
    else:
        f_px = cam_data.lens / cam_data.sensor_width * w
    return np.array([[f_px, 0.0, w / 2.0],
                     [0.0, f_px, h / 2.0],
                     [0.0, 0.0, 1.0]], dtype=np.float32)


# Blender camera (+X right, +Y up, -Z forward) -> OpenCV (+X right, +Y down, +Z fwd).
BLENDER_TO_CV = np.diag([1.0, -1.0, -1.0, 1.0]).astype(np.float32)


def _read_exr_depth(path, width, height):
    img = bpy.data.images.load(path, check_existing=False)
    buf = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(buf)
    depth = buf.reshape(height, width, 4)[:, :, 0]
    bpy.data.images.remove(img)
    # Blender writes a huge sentinel where the ray hit nothing. Anything past a
    # sane capture range is background, not geometry.
    depth = np.where(np.isfinite(depth) & (depth < 1e4), depth, 0.0)
    return np.flipud(depth).copy()          # Blender buffers are bottom-up


def _read_png_rgb(path, width, height):
    img = bpy.data.images.load(path, check_existing=False)
    buf = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgb = buf.reshape(height, width, 4)[:, :, :3]
    bpy.data.images.remove(img)
    rgb = np.flipud(rgb)
    rgb = np.clip(rgb, 0.0, 1.0) ** (1.0 / 2.2)
    return (rgb * 255.0 + 0.5).astype(np.uint8)


def capture(scene_name, out_dir, width, height, samples):
    _reset()
    scene = bpy.context.scene
    _configure(scene, width, height, samples)

    poses = SCENES[scene_name]()

    for loc, energy in (((6, -6, 8), 2000), ((-7, 5, 6), 1200), ((0, 0, 9), 800)):
        bpy.ops.object.light_add(type="POINT", location=loc)
        bpy.context.active_object.data.energy = energy

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 24.0                 # ~74 deg horizontal on 36 mm: a phone
    cam_data.sensor_width = 36.0
    cam_data.sensor_fit = "HORIZONTAL"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    frames_dir = os.path.join(out_dir, "frames")
    depth_dir = os.path.join(out_dir, "depth_exr")
    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(depth_dir, exist_ok=True)
    _depth_output_node(scene, depth_dir)

    K = _intrinsics(scene, cam_data)
    records = []

    for i, pose in enumerate(poses):
        cam.matrix_world = pose
        scene.frame_set(i + 1)           # drives the File Output node suffix
        rgb_path = os.path.join(frames_dir, "frame_%04d.png" % i)
        scene.render.filepath = rgb_path
        bpy.ops.render.render(write_still=True)

        exr_path = os.path.join(depth_dir, "depth_%04d.exr" % (i + 1))
        if not os.path.exists(exr_path):
            raise RuntimeError("depth pass missing: " + exr_path)

        c2w = np.array(pose, dtype=np.float32) @ BLENDER_TO_CV

        np.savez_compressed(
            os.path.join(out_dir, "view_%04d.npz" % i),
            rgb=_read_png_rgb(rgb_path, width, height),
            depth=_read_exr_depth(exr_path, width, height),
            K=K,
            c2w=c2w.astype(np.float32),
        )
        records.append({"index": i, "frame": rgb_path, "c2w": c2w.tolist()})
        print("[capture] %s frame %d/%d" % (scene_name, i + 1, len(poses)))

    with open(os.path.join(out_dir, "cameras.json"), "w", encoding="utf-8") as fh:
        json.dump({
            "scene": scene_name,
            "width": width, "height": height,
            "K": K.tolist(),
            "convention": "opencv_c2w_metres",
            "views": records,
        }, fh, indent=2)

    # The ground truth the reconstruction gets scored against.
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "groundtruth.blend"))
    print("[capture] wrote %d views to %s" % (len(poses), out_dir))


SCENES = {
    "object": build_object_scene,
    "room": build_room_scene,
    "structure": build_structure_scene,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", choices=sorted(SCENES), default="object")
    ap.add_argument("--out", default="./out")
    ap.add_argument("--width", type=int, default=320)
    ap.add_argument("--height", type=int, default=240)
    ap.add_argument("--samples", type=int, default=16)
    args = ap.parse_args(argv)

    out = os.path.join(os.path.abspath(args.out), args.scene)
    os.makedirs(out, exist_ok=True)
    capture(args.scene, out, args.width, args.height, args.samples)


if __name__ == "__main__":
    main()
