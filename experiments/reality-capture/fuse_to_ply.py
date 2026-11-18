#!/usr/bin/env python
"""
Depth + pose  ->  a colour point cloud the IFC viewer already knows how to read.

This is the half of the pipeline we own. The upstream half (frames -> depth +
pose) is an off-the-shelf network; everything from here down is product code, and
it is what this script exists to validate.

Input   a directory of view_XXXX.npz written by blender_capture.py, each holding
        rgb / depth / K / c2w (OpenCV camera-to-world, metres).
Output  a binary little-endian PLY with, per vertex:
            x y z         float32   metres, world frame (Z-up)
            red green blue uchar
            confidence     float32   0..1

That property set is not arbitrary: src/lib/pointcloud/ply-reader.ts matches
'confidence' by name and, because the property is float, multiplies it by 255 to
fill the uint8 channel the renderer samples. Writing float32 in 0..1 is exactly
what makes the viewer's existing confidence-threshold slider live on this data
with no viewer changes at all.

Run:
    python fuse_to_ply.py --views ./out/room --out ./out/room/fused.ply
"""

import argparse
import glob
import os
import sys

import numpy as np


# -- Unprojection -------------------------------------------------------------

def unproject(depth, K, c2w):
    """Pixels + metric depth -> world-space XYZ. Returns (N,3) and the (N,) pixel
    index so colour and confidence can be gathered against the same mask."""
    h, w = depth.shape
    fx, fy = float(K[0, 0]), float(K[1, 1])
    cx, cy = float(K[0, 2]), float(K[1, 2])

    vs, us = np.mgrid[0:h, 0:w]
    valid = depth > 1e-6
    d = depth[valid]
    x = (us[valid] - cx) / fx * d
    y = (vs[valid] - cy) / fy * d          # OpenCV: +Y is DOWN in image space
    cam = np.stack([x, y, d], axis=1)

    world = cam @ c2w[:3, :3].T + c2w[:3, 3]
    return world.astype(np.float64), valid


# -- Confidence ---------------------------------------------------------------

def confidence_map(depth, K):
    """A per-pixel 0..1 trust score.

    Three things make a depth sample untrustworthy, and all three are computable
    from the depth map alone -- no network logits required, which is what keeps
    this working whichever model we plug in upstream:

      edges     a large depth gradient means the pixel straddles a silhouette,
                and unprojecting it produces the classic "flying pixel" smear
                between foreground and background. This is the dominant error.
      grazing   a surface seen almost edge-on projects a huge depth change onto
                one pixel, so its position is poorly conditioned.
      range     error in every monocular estimator grows with distance.
    """
    d = np.where(depth > 1e-6, depth, np.nan)

    gy, gx = np.gradient(d)
    grad = np.hypot(np.nan_to_num(gx), np.nan_to_num(gy))
    # Normalise the gradient by depth: a 5 cm step at 20 m is a smooth surface,
    # the same 5 cm step at 50 cm is a genuine discontinuity.
    rel_grad = grad / np.maximum(np.nan_to_num(d, nan=1.0), 1e-3)
    edge = np.exp(-rel_grad / 0.02)

    fx = float(K[0, 0])
    # Angle proxy: how many metres of depth change per pixel, versus how many
    # metres one pixel subtends at that range.
    pixel_span = np.nan_to_num(d, nan=1.0) / fx
    slope = grad / np.maximum(pixel_span, 1e-6)
    grazing = 1.0 / (1.0 + (slope / 8.0) ** 2)

    rng = np.exp(-np.nan_to_num(d, nan=0.0) / 25.0)

    conf = edge * grazing * rng
    return np.nan_to_num(conf, nan=0.0).astype(np.float32)


# -- Multi-view agreement -----------------------------------------------------

def multiview_filter(points, views, min_agree=2, tol_rel=0.02):
    """Keep a point only if at least `min_agree` OTHER views also see a surface
    at that depth.

    This is the single most valuable step in the whole script. A per-frame depth
    map fused blindly gives a cloud that looks plausible from the trajectory and
    falls apart from anywhere else, because every frame contributes its own
    silhouette smear. Cross-checking removes precisely the samples no other
    camera can corroborate.

    Returns an integer agreement count per point.
    """
    agree = np.zeros(len(points), dtype=np.int16)
    homog = np.concatenate([points, np.ones((len(points), 1))], axis=1)

    for depth, K, c2w in views:
        h, w = depth.shape
        w2c = np.linalg.inv(c2w.astype(np.float64))
        cam = homog @ w2c.T
        z = cam[:, 2]
        in_front = z > 1e-6
        if not in_front.any():
            continue

        u = np.full(len(points), -1.0)
        v = np.full(len(points), -1.0)
        u[in_front] = K[0, 0] * cam[in_front, 0] / z[in_front] + K[0, 2]
        v[in_front] = K[1, 1] * cam[in_front, 1] / z[in_front] + K[1, 2]

        ui = np.round(u).astype(np.int64)
        vi = np.round(v).astype(np.int64)
        inside = in_front & (ui >= 0) & (ui < w) & (vi >= 0) & (vi < h)
        if not inside.any():
            continue

        observed = depth[vi[inside], ui[inside]]
        expected = z[inside]
        # Agreement, not occlusion: |observed - expected| small means this camera
        # sees the same surface. observed < expected means something occludes it,
        # which is not evidence against the point.
        ok = (observed > 1e-6) & (np.abs(observed - expected) <= tol_rel * expected)

        idx = np.nonzero(inside)[0][ok]
        agree[idx] += 1

    return agree


# -- Voxel downsample ---------------------------------------------------------

def voxel_downsample(points, colours, conf, voxel):
    """Average points falling in the same voxel, weighted by confidence.

    Beyond the obvious size win this is a denoiser: N independent depth samples
    of one surface patch average down towards the true surface. It is also what
    makes the output density uniform, which matters because raw fusion massively
    over-samples whatever the camera lingered on."""
    if voxel <= 0:
        return points, colours, conf

    keys = np.floor(points / voxel).astype(np.int64)
    _, inverse = np.unique(keys, axis=0, return_inverse=True)
    n = inverse.max() + 1

    w = np.maximum(conf.astype(np.float64), 1e-4)
    wsum = np.bincount(inverse, weights=w, minlength=n)

    out_pts = np.stack([
        np.bincount(inverse, weights=points[:, k] * w, minlength=n) / wsum
        for k in range(3)
    ], axis=1)
    out_col = np.stack([
        np.bincount(inverse, weights=colours[:, k].astype(np.float64) * w, minlength=n) / wsum
        for k in range(3)
    ], axis=1)
    # Confidence of a merged voxel is the mean, not the max: one lucky sample
    # should not launder a cluster of bad ones into looking trustworthy.
    out_conf = np.bincount(inverse, weights=conf.astype(np.float64), minlength=n) / np.bincount(inverse, minlength=n)

    return out_pts, np.clip(out_col, 0, 255).astype(np.uint8), out_conf.astype(np.float32)


# -- PLY writer ---------------------------------------------------------------

PLY_DTYPE = np.dtype([
    ("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
    ("red", "u1"), ("green", "u1"), ("blue", "u1"),
    ("confidence", "<f4"),
])


def write_ply(path, points, colours, conf, comments=()):
    rec = np.empty(len(points), dtype=PLY_DTYPE)
    rec["x"], rec["y"], rec["z"] = points[:, 0], points[:, 1], points[:, 2]
    rec["red"], rec["green"], rec["blue"] = colours[:, 0], colours[:, 1], colours[:, 2]
    rec["confidence"] = conf

    header = ["ply", "format binary_little_endian 1.0"]
    header += ["comment " + c for c in comments]
    header += [
        "element vertex %d" % len(points),
        "property float x", "property float y", "property float z",
        "property uchar red", "property uchar green", "property uchar blue",
        "property float confidence",
        "end_header",
    ]
    with open(path, "wb") as fh:
        fh.write(("\n".join(header) + "\n").encode("ascii"))
        fh.write(rec.tobytes())
    return len(points)


# -- Driver -------------------------------------------------------------------

def load_views(view_dir):
    views = []
    for path in sorted(glob.glob(os.path.join(view_dir, "view_*.npz"))):
        z = np.load(path)
        views.append({
            "rgb": z["rgb"], "depth": z["depth"].astype(np.float64),
            "K": z["K"].astype(np.float64), "c2w": z["c2w"].astype(np.float64),
        })
    return views


def degrade(depth, rng, noise_rel, scale_err, outlier_frac):
    """Turn exact depth into something shaped like a monocular network's output.

    Without this the experiment only proves the fusion maths, which we already
    trust. With it we get to see which failure mode actually destroys the result
    -- and it is not the noise, it is the scale error, which is why metric depth
    is the axis worth paying for."""
    d = depth.copy()
    mask = d > 1e-6
    if noise_rel > 0:
        d[mask] *= 1.0 + rng.normal(0.0, noise_rel, mask.sum())
    if outlier_frac > 0:
        n = int(mask.sum() * outlier_frac)
        if n:
            idx = rng.choice(np.nonzero(mask.ravel())[0], size=n, replace=False)
            flat = d.ravel()
            flat[idx] *= rng.uniform(0.5, 2.0, n)
    if scale_err != 0:
        d *= 1.0 + scale_err
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--views", required=True, help="directory of view_*.npz")
    ap.add_argument("--out", required=True, help="output .ply")
    ap.add_argument("--voxel", type=float, default=0.02, help="voxel size, metres")
    ap.add_argument("--min-conf", type=float, default=0.05)
    ap.add_argument("--min-agree", type=int, default=2,
                    help="views that must corroborate a point; 0 disables")
    ap.add_argument("--stride", type=int, default=1, help="use every Nth view")
    ap.add_argument("--noise-rel", type=float, default=0.0)
    ap.add_argument("--scale-err", type=float, default=0.0)
    ap.add_argument("--outlier-frac", type=float, default=0.0)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    views = load_views(args.views)[:: max(1, args.stride)]
    if not views:
        sys.exit("no view_*.npz found in " + args.views)

    rng = np.random.default_rng(args.seed)
    degraded = []
    for v in views:
        d = degrade(v["depth"], rng, args.noise_rel, args.scale_err, args.outlier_frac)
        degraded.append((d, v["K"], v["c2w"]))

    all_pts, all_col, all_conf = [], [], []
    for (d, K, c2w), v in zip(degraded, views):
        pts, mask = unproject(d, K, c2w)
        if not len(pts):
            continue
        all_pts.append(pts)
        all_col.append(v["rgb"][mask])
        all_conf.append(confidence_map(d, K)[mask])

    points = np.concatenate(all_pts)
    colours = np.concatenate(all_col)
    conf = np.concatenate(all_conf)
    raw_count = len(points)

    if args.min_agree > 0 and len(views) > 1:
        agree = multiview_filter(points, degraded, min_agree=args.min_agree)
        # A view always agrees with itself, so the point's own frame is one of
        # the counts: require min_agree + 1 for min_agree INDEPENDENT witnesses.
        keep = agree >= (args.min_agree + 1)
        # Corroboration is also evidence, so let it lift confidence.
        conf = np.clip(conf * (0.5 + 0.5 * np.minimum(agree, 6) / 6.0), 0, 1)
        points, colours, conf = points[keep], colours[keep], conf[keep]
    after_mv = len(points)

    keep = conf >= args.min_conf
    points, colours, conf = points[keep], colours[keep], conf[keep]
    after_conf = len(points)

    points, colours, conf = voxel_downsample(points, colours, conf, args.voxel)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    n = write_ply(args.out, points, colours, conf, comments=[
        "generated by fuse_to_ply.py",
        "source views %d" % len(views),
        "voxel %.4f m" % args.voxel,
        "up axis Z (world frame from blender_capture.py)",
    ])

    print("views          %d" % len(views))
    print("raw samples    %d" % raw_count)
    print("after multiview%d (%.1f%% kept)" % (after_mv, 100.0 * after_mv / max(raw_count, 1)))
    print("after conf     %d" % after_conf)
    print("after voxel    %d" % n)
    print("mean conf      %.3f" % float(conf.mean()) if n else "mean conf      n/a")
    print("wrote          %s (%.2f MB)" % (args.out, os.path.getsize(args.out) / 1e6))


if __name__ == "__main__":
    main()
