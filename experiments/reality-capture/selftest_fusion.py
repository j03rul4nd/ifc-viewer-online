#!/usr/bin/env python
"""
End-to-end self-test of the fusion half, with no Blender and no GPU.

The scene is a room-shaped box with a table-shaped box inside it, both described
analytically. Depth maps come from closed-form ray/box intersection, so ground
truth is not sampled or approximated -- it is the same equation, which makes any
error the fusion code's.

That matters because the interesting failures live here, not in the renderer:
silhouette "flying pixels" where the table occludes the wall, and the way a
scale error in depth turns a correct-looking cloud into an unusable one.

Run:
    python selftest_fusion.py
"""

import math
import os
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fuse_to_ply import (confidence_map, multiview_filter, unproject,   # noqa: E402
                         voxel_downsample, write_ply, degrade)


# -- Analytic scene -----------------------------------------------------------

ROOM = (np.array([-3.0, -2.0, 0.0]), np.array([3.0, 2.0, 2.8]))
TABLE = (np.array([-1.9, 0.2, 0.0]), np.array([-0.5, 1.0, 0.75]))


def _ray_box_exit(origin, dirs, box):
    """t at which a ray starting INSIDE the box leaves it."""
    lo, hi = box
    with np.errstate(divide="ignore", invalid="ignore"):
        t1 = (lo - origin) / dirs
        t2 = (hi - origin) / dirs
        tmax = np.minimum(np.maximum(t1, t2), np.inf)
    return np.min(np.where(np.isnan(tmax), np.inf, tmax), axis=1)


def _ray_box_enter(origin, dirs, box):
    """t at which a ray starting OUTSIDE hits the box, or inf if it misses."""
    lo, hi = box
    with np.errstate(divide="ignore", invalid="ignore"):
        t1 = (lo - origin) / dirs
        t2 = (hi - origin) / dirs
        tnear = np.max(np.where(np.isnan(np.minimum(t1, t2)), -np.inf, np.minimum(t1, t2)), axis=1)
        tfar = np.min(np.where(np.isnan(np.maximum(t1, t2)), np.inf, np.maximum(t1, t2)), axis=1)
    hit = (tfar >= np.maximum(tnear, 0.0)) & (tnear > 1e-6)
    return np.where(hit, tnear, np.inf)


def render_depth(c2w, K, w, h):
    """Exact metric depth along the optical axis, OpenCV camera convention."""
    fx, fy, cx, cy = K[0, 0], K[1, 1], K[0, 2], K[1, 2]
    vs, us = np.mgrid[0:h, 0:w]
    d_cam = np.stack([(us.ravel() - cx) / fx, (vs.ravel() - cy) / fy,
                      np.ones(w * h)], axis=1)
    d_world = d_cam @ c2w[:3, :3].T
    origin = np.broadcast_to(c2w[:3, 3], d_world.shape)

    # Because d_cam has z == 1, the ray parameter t IS the optical-axis depth.
    t = np.minimum(_ray_box_exit(origin, d_world, ROOM),
                   _ray_box_enter(origin, d_world, TABLE))
    return np.where(np.isfinite(t), t, 0.0).reshape(h, w)


def surface_distance(points):
    """Distance to the nearest true surface: the room's inner shell or the table's
    outer shell, whichever is closer."""
    def to_box_surface(p, box, inside):
        lo, hi = box
        if inside:
            # Distance to the shell from within: the nearest face.
            return np.min(np.minimum(p - lo, hi - p), axis=1)
        d = np.maximum(np.maximum(lo - p, p - hi), 0.0)
        outside = np.linalg.norm(d, axis=1)
        inner = np.min(np.minimum(p - lo, hi - p), axis=1)
        return np.where(outside > 0, outside, np.abs(inner))

    return np.minimum(np.abs(to_box_surface(points, ROOM, True)),
                      to_box_surface(points, TABLE, False))


def trajectory(n=24, height=1.5, radius=0.9):
    """Inside-out handheld sweep: small translation, large rotation."""
    poses = []
    for i in range(n):
        a = 2 * math.pi * i / n
        eye = np.array([radius * math.cos(a), radius * math.sin(a) * 0.6,
                        height + 0.05 * math.sin(4 * a)])
        target = np.array([4.0 * math.cos(a), 4.0 * math.sin(a), height - 0.3])
        fwd = target - eye
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, np.array([0.0, 0.0, 1.0]))
        right /= np.linalg.norm(right)
        down = np.cross(fwd, right)               # OpenCV: +Y points down
        c2w = np.eye(4)
        c2w[:3, 0], c2w[:3, 1], c2w[:3, 2] = right, down, fwd
        c2w[:3, 3] = eye
        poses.append(c2w)
    return poses


# -- The experiment -----------------------------------------------------------

def blur_depth(d, k=3):
    """Box-blur the depth map.

    This is not cosmetic: every learned depth estimator produces a SMOOTH field,
    so at an occlusion boundary it interpolates between foreground and background
    instead of stepping. Unprojected, those interpolated pixels land in mid-air
    on the line between the two surfaces -- the "flying pixels" that dominate the
    error budget of any real capture. Without modelling this, the rig has no
    silhouette artefacts at all and the filtering stages appear to be worth
    nothing, which would be a flattering lie.
    """
    pad = k // 2
    m = (d > 1e-6).astype(np.float64)
    dp = np.pad(d * m, pad, mode="edge")
    mp = np.pad(m, pad, mode="edge")
    acc = np.zeros_like(d)
    wacc = np.zeros_like(d)
    for i in range(k):
        for j in range(k):
            acc += dp[i:i + d.shape[0], j:j + d.shape[1]]
            wacc += mp[i:i + d.shape[0], j:j + d.shape[1]]
    return np.where(wacc > 0, acc / np.maximum(wacc, 1e-9), 0.0) * m


def run(label, w=96, h=72, noise_rel=0.0, scale_err=0.0, outlier_frac=0.0,
        min_agree=2, min_conf=0.05, voxel=0.03, use_conf=True, blur=0):
    f = 0.5 * w / math.tan(math.radians(74.0) / 2)
    K = np.array([[f, 0, w / 2.0], [0, f, h / 2.0], [0, 0, 1.0]])
    rng = np.random.default_rng(11)

    views = []
    for c2w in trajectory():
        d = render_depth(c2w, K, w, h)
        if blur:
            d = blur_depth(d, blur)
        views.append((degrade(d, rng, noise_rel, scale_err, outlier_frac), K, c2w))

    pts, cols, confs = [], [], []
    for d, Ki, c2w in views:
        p, mask = unproject(d, Ki, c2w)
        pts.append(p)
        cols.append(np.full((len(p), 3), 200, dtype=np.uint8))
        confs.append(confidence_map(d, Ki)[mask] if use_conf
                     else np.ones(len(p), dtype=np.float32))

    points = np.concatenate(pts)
    colours = np.concatenate(cols)
    conf = np.concatenate(confs)
    raw = len(points)

    if min_agree > 0:
        agree = multiview_filter(points, views, min_agree=min_agree)
        keep = agree >= (min_agree + 1)
        conf = np.clip(conf * (0.5 + 0.5 * np.minimum(agree, 6) / 6.0), 0, 1)
        points, colours, conf = points[keep], colours[keep], conf[keep]

    keep = conf >= min_conf
    points, colours, conf = points[keep], colours[keep], conf[keep]
    points, colours, conf = voxel_downsample(points, colours, conf, voxel)

    d = surface_distance(points)
    print("%-34s raw %7d -> %6d pts | acc mean %7.1f  median %6.1f  "
          "p99 %8.1f  max %8.1f mm | <10mm %5.1f%%"
          % (label, raw, len(points), d.mean() * 1000, np.median(d) * 1000,
             np.percentile(d, 99) * 1000, d.max() * 1000,
             100 * (d < 0.010).mean()))
    return points, colours, conf, d


def main():
    print("Analytic room self-test -- accuracy = distance to the true surface\n")

    print("- exact depth: the fusion maths itself -")
    run("raw fusion, no filtering", min_agree=0, min_conf=0.0, use_conf=False, voxel=0)

    print("\n- smoothed depth (as any learned model emits): what each filter is worth -")
    run("raw fusion, no filtering", min_agree=0, min_conf=0.0, use_conf=False, voxel=0, blur=3)
    run("+ voxel downsample", min_agree=0, min_conf=0.0, use_conf=False, blur=3)
    run("+ confidence gate", min_agree=0, min_conf=0.05, blur=3)
    pts, cols, conf, _ = run("+ multi-view agreement (full)", min_agree=2, blur=3)

    print("\n- how it degrades with a realistic monocular estimator -")
    run("2% depth noise", noise_rel=0.02, blur=3)
    run("2% noise + 3% outliers", noise_rel=0.02, outlier_frac=0.03, blur=3)
    run("+ 5% SCALE error", noise_rel=0.02, outlier_frac=0.03, scale_err=0.05, blur=3)
    run("+ 20% SCALE error", noise_rel=0.02, outlier_frac=0.03, scale_err=0.20, blur=3)

    out = os.path.join(tempfile.gettempdir(), "selftest_room.ply")
    n = write_ply(out, pts, cols, conf, comments=["selftest_fusion.py"])
    size = os.path.getsize(out)
    print("\nwrote %d points -> %s (%.2f MB, %.1f bytes/pt)"
          % (n, out, size / 1e6, size / max(n, 1)))
    print("confidence range %.3f..%.3f (float32, 0..1 -- what ply-reader.ts expects)"
          % (conf.min(), conf.max()))


if __name__ == "__main__":
    main()
