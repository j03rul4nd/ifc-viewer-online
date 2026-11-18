#!/usr/bin/env python
"""
Score a reconstructed cloud against the geometry it was reconstructed from.

"It looks right" is not a result. This measures the two numbers that decide
whether a reality capture is usable next to an IFC model:

  accuracy      for each reconstructed point, distance to the nearest true
                surface. Answers "is what I drew actually there?"
  completeness  for each sample of the true surface, distance to the nearest
                reconstructed point. Answers "did I miss anything?"

They trade off, which is why both are always reported: a filter aggressive
enough to make accuracy look excellent does so by deleting the scene.

Run inside Blender so the ground-truth .blend and its exact meshes are available:
    blender.exe -b out/room/groundtruth.blend --python evaluate.py -- \
        --ply out/room/fused.ply
"""

import argparse
import struct
import sys

import bpy           # type: ignore
import numpy as np
from mathutils import Vector          # type: ignore
from mathutils.kdtree import KDTree   # type: ignore


# -- Minimal PLY reader (only the layout fuse_to_ply.py writes) ---------------

def read_ply(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    end = raw.find(b"end_header\n")
    if end < 0:
        sys.exit("not a PLY with a terminated header: " + path)
    header = raw[:end].decode("ascii", "replace").splitlines()
    body = raw[end + len(b"end_header\n"):]

    if not any(line.startswith("format binary_little_endian") for line in header):
        sys.exit("this reader only handles binary_little_endian PLY")

    count = 0
    props = []
    in_vertex = False
    for line in header:
        if line.startswith("element "):
            parts = line.split()
            in_vertex = parts[1] == "vertex"
            if in_vertex:
                count = int(parts[2])
        elif line.startswith("property ") and in_vertex:
            _, ptype, name = line.split()
            props.append((name, ptype))

    fmt = {"float": "<f4", "float32": "<f4", "uchar": "u1", "uint8": "u1",
           "int": "<i4", "double": "<f8"}
    dtype = np.dtype([(n, fmt[t]) for n, t in props])
    rec = np.frombuffer(body, dtype=dtype, count=count)

    xyz = np.stack([rec["x"], rec["y"], rec["z"]], axis=1).astype(np.float64)
    conf = rec["confidence"].astype(np.float64) if "confidence" in dtype.names else np.ones(count)
    return xyz, conf


# -- Ground truth -------------------------------------------------------------

def gt_meshes():
    deps = bpy.context.evaluated_depsgraph_get()
    out = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        out.append(obj.evaluated_get(deps))
    if not out:
        sys.exit("ground-truth .blend contains no meshes")
    return out


def accuracy(points, meshes, sample=60000, seed=3):
    """Distance from each reconstructed point to the nearest true surface."""
    rng = np.random.default_rng(seed)
    if len(points) > sample:
        points = points[rng.choice(len(points), sample, replace=False)]

    dists = np.empty(len(points))
    for i, p in enumerate(points):
        v = Vector(p)
        best = float("inf")
        for obj in meshes:
            local = obj.matrix_world.inverted() @ v
            ok, loc, _, _ = obj.closest_point_on_mesh(local)
            if ok:
                d = ((obj.matrix_world @ loc) - v).length
                if d < best:
                    best = d
        dists[i] = best
    return dists


def completeness(points, meshes, samples=20000, seed=5):
    """Distance from uniformly sampled true surface to the nearest reconstructed
    point. Sampling is area-weighted, otherwise a wall made of one big triangle
    counts the same as a column made of ninety small ones."""
    rng = np.random.default_rng(seed)

    tris, areas = [], []
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in meshes:
        mesh = obj.to_mesh(preserve_all_data_layers=False, depsgraph=deps)
        mesh.calc_loop_triangles()
        mw = obj.matrix_world
        for tri in mesh.loop_triangles:
            a, b, c = (mw @ mesh.vertices[i].co for i in tri.vertices)
            tris.append((np.array(a), np.array(b), np.array(c)))
            areas.append(tri.area)
        obj.to_mesh_clear()

    areas = np.array(areas, dtype=np.float64)
    if areas.sum() <= 0:
        sys.exit("ground truth has zero surface area")
    pick = rng.choice(len(tris), samples, p=areas / areas.sum())

    u = rng.random(samples)
    v = rng.random(samples)
    flip = u + v > 1.0
    u[flip], v[flip] = 1.0 - u[flip], 1.0 - v[flip]

    surface = np.empty((samples, 3))
    for i, t in enumerate(pick):
        a, b, c = tris[t]
        surface[i] = a + u[i] * (b - a) + v[i] * (c - a)

    kd = KDTree(len(points))
    for i, p in enumerate(points):
        kd.insert(Vector(p), i)
    kd.balance()

    return np.array([kd.find(Vector(s))[2] for s in surface])


def report(name, d):
    print("%-14s mean %6.1f mm   median %6.1f mm   p90 %6.1f mm   p99 %7.1f mm"
          % (name, d.mean() * 1000, np.median(d) * 1000,
             np.percentile(d, 90) * 1000, np.percentile(d, 99) * 1000))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--ply", required=True)
    ap.add_argument("--min-conf", type=float, default=0.0,
                    help="score only points at or above this confidence")
    args = ap.parse_args(argv)

    points, conf = read_ply(args.ply)
    if args.min_conf > 0:
        points = points[conf >= args.min_conf]
    if not len(points):
        sys.exit("no points left to score")

    meshes = gt_meshes()
    print("points scored  %d   (min-conf %.2f)" % (len(points), args.min_conf))

    acc = accuracy(points, meshes)
    comp = completeness(points, meshes)
    report("accuracy", acc)
    report("completeness", comp)
    # The headline number for a BIM audience: BIM tolerances are talked about in
    # centimetres, so this is the fraction of the cloud that is trustworthy at
    # the scale the user cares about.
    print("within 10 mm   %.1f%%" % (100.0 * (acc < 0.010).mean()))
    print("within 50 mm   %.1f%%" % (100.0 * (acc < 0.050).mean()))


if __name__ == "__main__":
    main()
