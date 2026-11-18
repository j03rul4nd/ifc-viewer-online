#!/usr/bin/env python
"""
How much of a model can one capture actually judge?

Answers the first phase-2 kill criterion (docs/AS_BUILT_SCORE_PLAN.md §6) against
real rendered depth maps instead of an argument: sample every object's surface,
reproject each sample into every captured view, and classify the object the same
way src/lib/asbuilt/observability.ts does.

This mirrors that TypeScript module deliberately. It is the measurement rig, not
the product code -- if the two disagree, the TS one is authoritative and this
file is what caught the drift.

Run inside Blender, against a scene blender_capture.py already rendered:
    blender.exe -b out/structure/groundtruth.blend --python coverage_probe.py -- \
        --views out/structure
"""

import argparse
import glob
import os
import sys

import bpy           # type: ignore
import numpy as np

# Kept in step with DEFAULTS in src/lib/asbuilt/observability.ts.
MIN_WITNESSES = 2
TOLERANCE_REL = 0.02
TOLERANCE_MIN_M = 0.01
MIN_VISIBLE_FRACTION = 0.3
# MIN_COVERAGE_FRACTION in src/lib/asbuilt/as-built-score.ts.
MIN_COVERAGE = 0.25


def sample_surface(obj, deps, n, rng):
    """n points spread over the object's surface, area-weighted, with normals.

    The normals are not optional. Sampling both faces of a wall and then scoring
    the outward one as "blocked" is what turned a capture that saw every wall of
    this room into 0% coverage -- see observability.ts, ElementSamples.normals."""
    mesh = obj.to_mesh(preserve_all_data_layers=False, depsgraph=deps)
    mesh.calc_loop_triangles()
    mw = obj.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    tris, areas, normals = [], [], []
    for tri in mesh.loop_triangles:
        a, b, c = (mw @ mesh.vertices[i].co for i in tri.vertices)
        tris.append((np.array(a), np.array(b), np.array(c)))
        areas.append(tri.area)
        normals.append(np.array((nm @ tri.normal).normalized()))
    obj.to_mesh_clear()

    areas = np.array(areas, dtype=np.float64)
    if not len(areas) or areas.sum() <= 0:
        return np.zeros((0, 3)), np.zeros((0, 3))

    pick = rng.choice(len(tris), n, p=areas / areas.sum())
    u, v = rng.random(n), rng.random(n)
    flip = u + v > 1.0
    u[flip], v[flip] = 1.0 - u[flip], 1.0 - v[flip]

    out = np.empty((n, 3))
    out_n = np.empty((n, 3))
    for i, t in enumerate(pick):
        a, b, c = tris[t]
        out[i] = a + u[i] * (b - a) + v[i] * (c - a)
        out_n[i] = normals[t]
    return out, out_n


def classify(points, normals, views):
    """Per-sample verdict counts, then the element state."""
    n = len(points)
    if n == 0:
        return "unobserved", 0, 0, 0, 0, 0

    homog = np.concatenate([points, np.ones((n, 1))], axis=1)
    witnesses = np.zeros(n, dtype=np.int32)
    occluders = np.zeros(n, dtype=np.int32)
    past = np.zeros(n, dtype=np.int32)
    seen_by_any = np.zeros(n, dtype=bool)
    faceable = np.zeros(n, dtype=bool)

    for depth, K, c2w in views:
        h, w = depth.shape
        cam = homog @ np.linalg.inv(c2w).T
        z = cam[:, 2]
        ok = z > 1e-6
        if not ok.any():
            continue

        # Back-face cull against this camera, in camera space.
        n_cam = normals @ np.linalg.inv(c2w)[:3, :3].T
        ok &= np.einsum("ij,ij->i", n_cam, cam[:, :3]) < 0
        if not ok.any():
            continue
        faceable |= ok

        u = np.full(n, -1.0)
        v = np.full(n, -1.0)
        u[ok] = K[0, 0] * cam[ok, 0] / z[ok] + K[0, 2]
        v[ok] = K[1, 1] * cam[ok, 1] / z[ok] + K[1, 2]
        ui, vi = np.round(u).astype(np.int64), np.round(v).astype(np.int64)
        inside = ok & (ui >= 0) & (ui < w) & (vi >= 0) & (vi < h)
        if not inside.any():
            continue

        idx = np.nonzero(inside)[0]
        observed = depth[vi[idx], ui[idx]]
        expected = z[idx]
        # A hole in the depth map is not a sighting -- same rule as the TS module.
        has_data = observed > 1e-6
        idx, observed, expected = idx[has_data], observed[has_data], expected[has_data]
        if not len(idx):
            continue

        seen_by_any[idx] = True
        tol = np.maximum(TOLERANCE_MIN_M, TOLERANCE_REL * expected)
        diff = observed - expected
        witnesses[idx[np.abs(diff) <= tol]] += 1
        occluders[idx[diff < -tol]] += 1
        past[idx[diff > tol]] += 1

    testable = int(faceable.sum())
    in_frustum = int(seen_by_any.sum())
    visible = int(((witnesses >= MIN_WITNESSES) & seen_by_any).sum())
    seen_past = int(((witnesses < MIN_WITNESSES) & (past >= MIN_WITNESSES) & seen_by_any).sum())
    occluded = int(((witnesses < MIN_WITNESSES) & (past < MIN_WITNESSES)
                    & (occluders > 0) & seen_by_any).sum())

    if in_frustum == 0 or testable == 0:
        state = "unobserved"
    elif (visible + seen_past) / testable >= MIN_VISIBLE_FRACTION:
        state = "observed"
    else:
        state = "occluded"
    return state, testable, in_frustum, visible, occluded, seen_past


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--views", required=True)
    ap.add_argument("--samples", type=int, default=200)
    ap.add_argument("--stride", type=int, default=1, help="use every Nth view")
    args = ap.parse_args(argv)

    views = []
    for path in sorted(glob.glob(os.path.join(args.views, "view_*.npz")))[:: args.stride]:
        z = np.load(path)
        views.append((z["depth"].astype(np.float64), z["K"].astype(np.float64),
                      z["c2w"].astype(np.float64)))
    if not views:
        sys.exit("no view_*.npz in " + args.views)

    deps = bpy.context.evaluated_depsgraph_get()
    rng = np.random.default_rng(17)
    objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    print("views %d   elements %d   samples/element %d\n" % (len(views), len(objects), args.samples))
    print("%-14s %-11s %8s %7s %7s %7s %7s"
          % ("element", "state", "testable", "frustum", "visible", "occl", "past"))

    counts = {"observed": 0, "occluded": 0, "unobserved": 0}
    for obj in objects:
        pts, nrm = sample_surface(obj.evaluated_get(deps), deps, args.samples, rng)
        state, testable, in_frustum, visible, occluded, past = classify(pts, nrm, views)
        counts[state] += 1
        print("%-14s %-11s %8d %7d %7d %7d %7d"
              % (obj.name[:14], state, testable, in_frustum, visible, occluded, past))

    total = len(objects)
    fraction = counts["observed"] / total if total else 0.0
    print("\nobserved %d / %d = %.1f%%   (occluded %d, unobserved %d)"
          % (counts["observed"], total, 100 * fraction, counts["occluded"], counts["unobserved"]))
    print("kill criterion: coverage must clear %.0f%%  ->  %s"
          % (100 * MIN_COVERAGE, "PASS" if fraction >= MIN_COVERAGE else "FAIL"))


if __name__ == "__main__":
    main()
