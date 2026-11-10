# ─── build-jin-mao-landmark.py ───────────────────────────────────────────────
# Authors the Jin Mao Tower (SOM, Adrian Smith, 1999; 420.5 m) as a GLB, for the
# 3D city context: the stepped pagoda of the Lujiazui skyline, which OSM can
# only draw as three stacked prisms.
#
#   C:\tools\blender-4.5.12-windows-x64\blender.exe -b -P scripts/blender/build-jin-mao-landmark.py
#
#   env LANDMARKS_PREVIEW=<dir>   also render a preview sheet
#
# THE FRAME IS THE CONTRACT (see build-ciutadella-landmarks.py): origin at the
# `centroid` of jin_mao_landmark_site.json (vertex mean of the OSM outline
# w376075961), +X east, +Y north, Z up, ground at z = 0. Placed by the app with
# no rotation and no scale.
#
# WHAT IS MEASURED AND WHAT IS NOT. The plan is OSM's tower part (w188377486):
# a square with a projection centred on each face. Heights are OSM's: the shaft
# to 348 m, the crown to 382 m, the spire to 420.5 m. The tiering is the
# building's own published rule — the lowest segment sixteen storeys, each one
# above it an eighth shorter — and the taper and the cornices are read off
# photographs. An approximate reconstruction, not a survey.

import bpy
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmark_kit import *  # noqa: E402,F401,F403 — Geo, solids, export, preview

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
SITE = json.load(open(os.path.join(HERE, 'jin_mao_landmark_site.json'), encoding='utf-8'))
OUT_DIR = os.path.join(REPO, 'public', 'models', 'landmarks')

BUDGET = {'jin-mao': 40000}

# ── Palette (linear RGB) ─────────────────────────────────────────────────────
# Silver-grey aluminium over dark, slightly blue glass: from the Bund the tower
# reads as a cool grey with bright horizontal lines at every step.
GLASS = (0.075, 0.095, 0.12)
METAL = (0.42, 0.44, 0.46)
METAL_L = (0.62, 0.64, 0.66)      # the cornices, which catch the light
CROWN = (0.50, 0.52, 0.54)
CANOPY = (0.30, 0.31, 0.32)

E = SITE['jin-mao']
PLAN = [tuple(p) for p in E['members']['w188377486']['ringEN_m']]
ANNEXES = ['w167061956', 'w167061957', 'w167061961', 'w524263611']

SHAFT_TOP = 348.0
CROWN_TOP = 382.0
SPIRE_TOP = 420.5
# Storeys per segment: sixteen at the base, an eighth fewer each step up.
STOREYS = [16, 14, 12, 10, 8, 6, 4, 3, 2, 2, 2, 1, 1, 1, 1, 1]
TOP_SCALE = 0.56                 # the last segment's plan against the base's


def scaled(ring, s):
    cx = sum(p[0] for p in ring) / len(ring)
    cy = sum(p[1] for p in ring) / len(ring)
    return [(cx + (x - cx) * s, cy + (y - cy) * s) for x, y in ring]


def mullions(G, ring, z0, z1, pitch=3.0, depth=0.45, width=0.35):
    """Aluminium fins standing proud of the glass along every face."""
    r = ccw(ring)
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy)
        if L < 1.0:
            continue
        nx, ny = dy / L, -dx / L       # outward for a CCW ring
        n = max(1, int(L / pitch))
        for k in range(n + 1):
            t = k / n
            x, y = a[0] + dx * t, a[1] + dy * t
            ring_f = [(x - dx / L * width / 2, y - dy / L * width / 2),
                      (x + dx / L * width / 2, y + dy / L * width / 2),
                      (x + dx / L * width / 2 + nx * depth, y + dy / L * width / 2 + ny * depth),
                      (x - dx / L * width / 2 + nx * depth, y - dy / L * width / 2 + ny * depth)]
            solid(G, ring_f, z0, z1, METAL, caps=(False, False))


def build_jin_mao():
    G = Geo()
    total = sum(STOREYS)
    z = 0.0
    for i, n in enumerate(STOREYS):
        h = SHAFT_TOP * n / total
        s = 1.0 - (1.0 - TOP_SCALE) * (i / (len(STOREYS) - 1))
        ring = scaled(PLAN, s)
        # The glass body of the segment, the fins on it, and the flared
        # cornice at its head that makes the pagoda read from a kilometre.
        solid(G, ring, z, z + h - 1.2, GLASS, caps=(i == 0, False))
        mullions(G, ring, z, z + h - 1.2, pitch=3.0 if i < 6 else 2.2)
        solid(G, scaled(PLAN, s * 1.045), z + h - 1.2, z + h, METAL_L)
        z += h

    # Crown: four stepped octagonal drums under a pyramid, then the spire.
    # Centred on the tower's own plan, which sits a metre off the outline's
    # centroid (the outline takes in the entrance canopies).
    pcx = sum(p[0] for p in PLAN) / len(PLAN)
    pcy = sum(p[1] for p in PLAN) / len(PLAN)
    oct_r = 0.5 * (max(p[0] for p in PLAN) - min(p[0] for p in PLAN)) * TOP_SCALE
    oct_ring = lambda r: [(pcx + r * math.cos(math.pi / 8 + k * math.pi / 4), pcy + r * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]
    steps = [(0.95, 8.0), (0.80, 7.0), (0.64, 6.0), (0.48, 5.0)]
    zc = SHAFT_TOP
    for f, h in steps:
        solid(G, oct_ring(oct_r * f), zc, zc + h - 0.8, GLASS, caps=(False, False))
        mullions(G, oct_ring(oct_r * f), zc, zc + h - 0.8, pitch=1.8, depth=0.3, width=0.25)
        solid(G, oct_ring(oct_r * f * 1.06), zc + h - 0.8, zc + h, METAL_L)
        zc += h
    # Pyramidal roof of the crown to CROWN_TOP.
    apex = V(pcx, pcy, CROWN_TOP)
    base = oct_ring(oct_r * 0.40)
    for k in range(8):
        a, b = base[k], base[(k + 1) % 8]
        G.poly([V(a[0], a[1], zc), V(b[0], b[1], zc), apex], CROWN, V((a[0] + b[0]) / 2 - pcx, (a[1] + b[1]) / 2 - pcy, 2))
    # The spire: a tapering mast with three collars.
    lathe(G, (pcx, pcy, 0), [(1.6, CROWN_TOP - 6), (1.2, CROWN_TOP + 8), (0.7, CROWN_TOP + 22), (0.15, SPIRE_TOP)], METAL_L, segs=10)
    for zz, r in [(CROWN_TOP + 4, 2.2), (CROWN_TOP + 14, 1.6), (CROWN_TOP + 26, 1.0)]:
        lathe(G, (pcx, pcy, 0), [(r, zz), (r, zz + 1.0)], METAL_L, segs=10)

    # The four low entrance canopies OSM maps against the tower's faces, 8–10 m.
    for key in ANNEXES:
        ring = [tuple(p) for p in E['members'][key]['ringEN_m']]
        solid(G, ring, 8.0, 10.0, CANOPY)
        for x, y in ring:
            cx = sum(p[0] for p in ring) / len(ring)
            cy = sum(p[1] for p in ring) / len(ring)
            px, py = x + (cx - x) * 0.12, y + (cy - y) * 0.12
            box(G, (px, py, 4.0), (0.5, 0.5, 8.0), METAL, caps=(False, False))
    return G


BUILDERS = {'jin-mao': (build_jin_mao, None, 200)}

if __name__ == '__main__':
    run(BUILDERS, SITE, BUDGET, OUT_DIR)
