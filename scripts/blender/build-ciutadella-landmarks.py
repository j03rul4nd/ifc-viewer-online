# ─── build-ciutadella-landmarks.py ────────────────────────────────────────────
# Authors six Parc de la Ciutadella landmarks as GLB, for the 3D city context.
#
#   C:\tools\blender-4.5.12-windows-x64\blender.exe -b -P scripts/blender/build-ciutadella-landmarks.py
#
#   env LANDMARKS_ONLY=cascada,glorieta   build a subset
#   env LANDMARKS_PREVIEW=<dir>           also render a 2x2 preview sheet per model
#
# THE FRAME IS THE CONTRACT. Every footprint-based model is authored in the
# frame its OpenStreetMap footprint is given in (ciutadella_landmarks_site.json):
# origin at the way's `centroid`, +X EAST, +Y NORTH, Z up, ground at z = 0. The
# app places each GLB at that centroid with no rotation and no scale, so the
# model has to stand on its real footprint as authored. Nothing goes below
# z = 0 except a 0.3 m foundation skirt, which hides terrain seams.
# The mammoth is a point (an OSM node), so it is authored centred on its own
# origin with the trunk toward +X; its heading is chosen at placement.
#
# HOW GEOMETRY IS MADE HERE, and why it is not build-props.py's way. These are
# buildings extruded along real footprints and vaults sampled along arcs, so the
# natural unit is a polygon, not a Blender primitive. Everything goes into one
# accumulator (`Geo`) as explicit polygons with a colour each, and becomes ONE
# mesh at the end. Two consequences worth stating:
#   • No object transforms ever exist, so the trap in docs/GIS_MAP_MODE.md
#     ("rotating a part that is already positioned swings it around the world
#     origin") cannot happen: sub-assemblies (a statue, a horse, a pavilion) are
#     built at the origin in their own frame and then placed by an explicit
#     matrix applied to their vertex data (`Geo.add`). The two greenhouses are
#     built square to their own axes about their own centre and turned onto the
#     ~45° park grid the same way, once, at the end.
#   • Every polygon is oriented by an explicit outward hint (`poly(..., out)`),
#     so shading never depends on the order points happened to be listed in.
#
# NO TEXTURES. Colour is per-face vertex colour (linear RGB), as in
# build-props.py; the exporter writes it as COLOR_0.

import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmark_kit import *  # noqa: E402,F401,F403 — Geo, solids, export, run

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
SITE = json.load(open(os.path.join(HERE, 'ciutadella_landmarks_site.json'), encoding='utf-8'))
OUT_DIR = os.path.join(REPO, 'public', 'models', 'landmarks')

# Triangle budget per landmark. A build over budget fails.
BUDGET = {
    'cascada-ciutadella': 25000,
    'castell-tres-dragons': 25000,
    'hivernacle': 15000,
    'umbracle': 15000,
    'glorieta': 12000,
    'mamut': 12000,
}


# ── Palette (linear RGB) ─────────────────────────────────────────────────────

SANDSTONE = (0.55, 0.35, 0.15)
SANDSTONE_D = (0.38, 0.23, 0.10)
SANDSTONE_L = (0.68, 0.50, 0.26)
PAVING = (0.55, 0.45, 0.30)
ROCK = (0.30, 0.25, 0.18)
MARBLE = (0.82, 0.80, 0.75)
GOLD = (0.80, 0.52, 0.10)
WATER = (0.06, 0.22, 0.22)
FALL = (0.52, 0.68, 0.70)
SHADOW = (0.07, 0.05, 0.035)
PLANTED = (0.12, 0.22, 0.07)

BRICK = (0.40, 0.11, 0.05)
BRICK_D = (0.27, 0.07, 0.035)
BRICK_H = (0.45, 0.20, 0.10)     # the Hivernacle's paler brick
BRICK_U = (0.46, 0.14, 0.06)     # the Umbracle's red brick
STONE_TRIM = (0.66, 0.58, 0.46)
WINDOW = (0.03, 0.04, 0.05)
WHITE_TILE = (0.86, 0.86, 0.84)
ROOF_DARK = (0.18, 0.16, 0.15)

GLASS = (0.20, 0.27, 0.33)
GLASS_D = (0.13, 0.18, 0.22)
IRON = (0.06, 0.09, 0.075)
WOOD = (0.62, 0.42, 0.22)
WOOD_D = (0.40, 0.25, 0.12)
INTERIOR = (0.04, 0.07, 0.03)
FOLIAGE = (0.10, 0.25, 0.06)
FOLIAGE_L = (0.16, 0.33, 0.08)

KIOSK_STONE = (0.60, 0.55, 0.46)
KIOSK_IRON = (0.07, 0.12, 0.09)
KIOSK_ROOF = (0.12, 0.17, 0.15)
KIOSK_TRIM = (0.55, 0.45, 0.22)
KIOSK_CEIL = (0.55, 0.45, 0.30)

MAMMOTH = (0.30, 0.26, 0.21)
MAMMOTH_D = (0.21, 0.18, 0.14)
MAMMOTH_TUSK = (0.46, 0.42, 0.34)
MAMMOTH_ROCK = (0.26, 0.24, 0.21)


# ═════════════════════════════════════════════════════════════════════════════
# 1. CASCADA MONUMENTAL — way 135115868 (+ 135115884 wings, 135115823 pond)
# ═════════════════════════════════════════════════════════════════════════════
#
# WHICH WAY IT FACES. The mapped central body is an axis-aligned keyhole: a
# 17 m-wide block at the north (y 9.3..23.4), a 12 m-wide body in front of it,
# and a 4.7 m nub centred on the axis at its south tip (y -13.7). Two other
# mapped ways settle it: the Gaudí-attributed pond (natural=water, way
# 135115823) starts exactly at that nub, y = -13.7, and runs 67 m south; and
# the "building built for the 1888 Exposició" (way 135115884) is a U whose arms
# wrap that pond. So the front — niche, cascade, stairs — faces -Y (south),
# toward the pond and the park interior, and the ensemble is read from the
# real outlines, not guessed: wings and stairs on the U arms, the pond on the
# water polygon. Heights are from knowledge of the monument (no OSM heights):
# upper terrace 8 m, arch body to the cornice ~16 m, attic ~19.7 m, quadriga
# to ~28 m.

def build_cascada():
    s = SITE['135115868']
    ens = s['ensemble']
    U = open_ring(ens['135115884']['ringEN_m'])
    W = open_ring(ens['135115823']['ringEN_m'])
    G = Geo()
    rnd = Rand(1888)

    # ── pond: water surface on the real polygon, a stone kerb around it
    ZW = 0.25
    G.poly([(x, y, ZW) for x, y in W], WATER, (0, 0, 1))
    Wc = ccw(W)
    for i in range(len(Wc)):
        a, b = Wc[i], Wc[(i + 1) % len(Wc)]
        du, dv = b[0] - a[0], b[1] - a[1]
        L = math.hypot(du, dv)
        if L < 0.2:
            continue
        nx, ny = dv / L, -du / L
        dx, dy = du / L, dv / L
        o = V((a[0] + b[0]) / 2 + nx * 0.25, (a[1] + b[1]) / 2 + ny * 0.25, 0.3 - 0.15)
        fbox(G, o, (dx, dy, 0), (nx, ny, 0), (0, 0, 1), L + 0.5, 0.5, 0.9, SANDSTONE_L)

    # ── the U: a 1.2 m stone platform on the real outline of way 135115884
    ZP = 1.2
    solid(G, U, -0.3, ZP, SANDSTONE, top=PAVING)

    # ── upper terraces (z 8) either side of the arch body, from the U outline
    ZT = 8.0
    TL = [(-26.25, -19.5), (-11.31, -19.5), (-10.1, -17.7), (-7.4, -13.7), (-6.35, -11.4),
          (-6.35, -2.8), (-10.1, -2.8), (-13.1, -4.0), (-26.2, -17.7)]
    TR = [(5.85, -2.7), (10.6, -2.7), (14.6, -4.1), (27.8, -17.1), (27.85, -19.5),
          (12.54, -19.5), (7.2, -13.7), (5.85, -11.4)]
    for T in (TL, TR):
        solid(G, T, ZP, ZT, SANDSTONE, top=PAVING, caps=(False, True))
        # string course and cornice round the terrace mass
        solid(G, [(x, y) for x, y in T], ZT - 0.35, ZT, SANDSTONE_L, caps=(False, False))

    # ── the two arms: a stair on the pond side, a planted ramp outboard
    # side = (stair inner x, stair outer x, arm outer x, sign)
    for inner, outer, edge, sg in ((-13.55, -19.8, -26.5, -1), (14.25, 20.4, 28.05, 1)):
        y0, y1 = -41.5, -19.5
        n = 38
        rise = (ZT - ZP) / n
        tread = (y1 - y0) / n
        prof = [(y0, ZP)]
        for i in range(n):
            prof.append((y0 + i * tread, ZP + (i + 1) * rise))
            prof.append((y0 + (i + 1) * tread, ZP + (i + 1) * rise))
        prof.append((y1, ZP))
        xa, xb = min(inner, outer), max(inner, outer)
        solid(G, prof, xa, xb, SANDSTONE_L, P=lambda u, v, w: V(w, u, v))
        # outboard planted ramp, retained by a rusticated wall; 0.9 m above the stair
        xa, xb = min(outer, edge), max(outer, edge)
        ramp = [(y0, ZP), (y1 + 1.8, ZP), (y1 + 1.8, ZT + 0.9), (y0, ZP + 0.9)]
        solid(G, ramp, xa, xb, SANDSTONE, P=lambda u, v, w: V(w, u, v))
        slope = [(y0, ZP + 0.9), (y1 + 1.8, ZT + 0.9)]
        # green top of the ramp, a hair proud of the stone
        G.poly([V(xa + 0.3, slope[0][0], slope[0][1] + 0.02), V(xb - 0.3, slope[0][0], slope[0][1] + 0.02),
                V(xb - 0.3, slope[1][0], slope[1][1] + 0.02), V(xa + 0.3, slope[1][0], slope[1][1] + 0.02)],
               PLANTED, (0, 0, 1))
        # grotto arches under the stair, on the face toward the pond
        face_x = inner
        for k in range(5):
            yc = -38.6 + k * 3.7
            ztop = ZP + (yc - 1.2 - y0) / (y1 - y0) * (ZT - ZP) - 0.8
            if ztop - ZP < 1.4:
                continue
            w = 2.4
            zs = ztop - w / 2
            pts = arch_outline(yc - w / 2, yc + w / 2, ZP, max(zs, ZP + 0.4), 6)
            G.poly([V(face_x - sg * 0.03, s_, z) for s_, z in pts], SHADOW, (-sg, 0, 0))
            # a rock lip dribbling into the pond from each grotto
            ellipsoid(G, (face_x - sg * 0.4, yc, ZP - 0.2), (0.7, 1.0, 0.45), ROCK, segs=6, rings=4,
                      smooth=False)
        # balustrade along the stair's pond side, and along the ramp's outer edge
        balustrade(G, (inner + sg * 0.2, y0, ZP), (inner + sg * 0.2, y1, ZT), SANDSTONE_L)
        balustrade(G, (edge - sg * 0.2, y0, ZP + 0.9), (edge - sg * 0.2, y1 + 1.8, ZT + 0.9),
                   SANDSTONE_L)

    # filler wedges between the stair top and the diagonal pond edge
    solid(G, [(-13.55, -19.5), (-11.31, -19.5), (-13.4, -22.6), (-13.55, -22.6)], ZP, ZT - 0.9,
          SANDSTONE)
    solid(G, [(12.54, -19.5), (14.25, -19.5), (14.25, -21.3), (14.2, -21.3)], ZP, ZT - 0.9,
          SANDSTONE)

    # terrace balustrades (z 8): pond edges, outer diagonals, north edges
    for path in ([(-11.31, -19.5), (-10.1, -17.7), (-7.4, -13.7), (-6.35, -11.4)],
                 [(12.54, -19.5), (7.2, -13.7), (5.85, -11.4)],
                 [(-26.2, -17.7), (-13.1, -4.0), (-10.1, -2.8), (-6.35, -2.8)],
                 [(27.8, -17.1), (14.6, -4.1), (10.6, -2.7), (5.85, -2.7)]):
        for a, b in zip(path, path[1:]):
            balustrade(G, (a[0], a[1], ZT), (b[0], b[1], ZT), SANDSTONE_L)
    # urns on the terrace corners
    for x, y in ((-26.0, -17.9), (-13.1, -4.0), (27.6, -17.3), (14.6, -4.1), (-7.4, -13.7), (7.2, -13.7)):
        lathe(G, (x, y, ZT), [(0.35, 0), (0.35, 1.2), (0.45, 1.25), (0.2, 1.4), (0.45, 1.75),
                              (0.3, 2.1), (0.0, 2.3)], MARBLE, segs=8, smooth=False)

    # rusticated blind arcade on the outer diagonal faces of the terraces
    for a, b, sg in (((-26.2, -17.7), (-13.1, -4.0), -1), ((27.8, -17.1), (14.6, -4.1), 1)):
        wall = Wall(a, b)
        # outward = away from the axis
        if wall.n.x * sg < 0:
            wall = Wall(a, b, (-wall.n.x, -wall.n.y))
        for k in range(4):
            s0 = 1.6 + k * 4.4
            wall.decal(G, arch_outline(s0, s0 + 2.4, ZP + 0.6, ZP + 3.6, 6), SHADOW)
            wall.block(G, s0 - 1.2, s0 - 0.5, ZP, ZT - 0.35, 0.25, SANDSTONE_L)

    # pavilions (templets) on the terraces, with a statue on each dome
    for cx in (-15.0, 15.8):
        cy = -11.5
        P = Geo()
        boxz(P, -2.2, -2.2, 2.2, 2.2, 0, 0.45, SANDSTONE_L)
        for dx in (-1.7, 1.7):
            for dy in (-1.7, 1.7):
                lathe(P, (dx, dy, 0.45), [(0.32, 0), (0.28, 0.25), (0.26, 3.6), (0.36, 3.9)],
                      SANDSTONE_L, segs=8, smooth=True)
        boxz(P, -2.3, -2.3, 2.3, 2.3, 4.35, 5.2, SANDSTONE, top=SANDSTONE_L)
        lathe(P, (0, 0, 5.2), [(1.9, 0), (1.8, 0.5), (1.4, 1.1), (0.8, 1.5), (0.0, 1.7)],
              SANDSTONE_L, segs=12, smooth=True)
        P.add(figure(2.0, MARBLE, pose='up'), place(0, 0, 6.8))
        G.add(P, place(cx, cy, ZT))

    # ── the arch body (mapped front block): x -6.35..5.85, y -11.4..9.3
    x0, x1, y0, y1 = -6.35, 5.85, -11.4, 9.3
    xc = (x0 + x1) / 2
    nw, nd = 3.2, 3.2          # niche half-width, depth
    zs = 10.5                  # springing of the niche arch
    ZC = 16.0                  # top of the arch body
    boxz(G, x0, y0 + nd, x1, y1, -0.3, ZC, SANDSTONE, top=PAVING)
    boxz(G, x0, y0, xc - nw, y0 + nd, -0.3, ZC, SANDSTONE, caps=(False, True))
    boxz(G, xc + nw, y0, x1, y0 + nd, -0.3, ZC, SANDSTONE, caps=(False, True))
    arch = [(xc - nw, ZC), (xc - nw, zs)]
    for i in range(1, 12):
        t = math.pi - math.pi * i / 12
        arch.append((xc + nw * math.cos(t), zs + nw * math.sin(t)))
    arch += [(xc + nw, zs), (xc + nw, ZC)]
    solid(G, arch, y0, y0 + nd, SANDSTONE, P=lambda u, v, w: V(u, w, v))
    # archivolt: a lighter band round the niche on the facade
    band = []
    for i in range(13):
        t = math.pi * i / 12
        band.append((xc + (nw + 0.7) * math.cos(t), zs + (nw + 0.7) * math.sin(t)))
    for i in range(12, -1, -1):
        t = math.pi * i / 12
        band.append((xc + nw * math.cos(t), zs + nw * math.sin(t)))
    solid(G, band, y0 - 0.25, y0, SANDSTONE_L, P=lambda u, v, w: V(u, w, v))
    # niche back wall in shadow, rock rising inside it
    G.poly([V(xc - nw, y0 + nd - 0.02, 0), V(xc + nw, y0 + nd - 0.02, 0),
            V(xc + nw, y0 + nd - 0.02, zs), V(xc - nw, y0 + nd - 0.02, zs)], SHADOW, (0, -1, 0))
    for i in range(34):
        t = i / 34.0
        z = 9.6 * t * t ** 0.2
        spread = (1.0 - 0.55 * t) * (nw - 0.3)
        x = xc + rnd(-spread, spread)
        y = y0 + nd - 0.9 - rnd(0.0, 1.4) - (1.0 - t) * 2.6
        r = 0.9 + (1.0 - t) * 0.9
        # the pile stands on the platform: no boulder may reach below the 0.3 m skirt
        ellipsoid(G, (x, max(y, -13.6 + r * 0.5), max(z + 0.3, r * 0.7 - 0.25)),
                  (r * rnd(0.8, 1.3), r * 0.8, r * 0.7), ROCK, segs=6, rings=4, smooth=False)
    # the water: a sheet from the niche's upper lip over the rocks into the basin
    sheet = [(y0 + nd - 0.6, 10.2), (y0 + nd - 1.3, 8.6), (y0 + 0.4, 6.4), (y0 - 0.5, 4.2),
             (y0 - 1.2, 2.6), (y0 - 1.8, ZP + 0.5)]
    for (ya, za), (yb, zb), wa, wb in zip(sheet, sheet[1:], (1.3, 1.5, 1.8, 2.1, 2.4),
                                        (1.5, 1.8, 2.1, 2.4, 2.6)):
        G.poly([V(xc - wa, ya, za), V(xc + wa, ya, za), V(xc + wb, yb, zb), V(xc - wb, yb, zb)],
               FALL, (0, -1, 0.3))
    for dx in (-2.2, 2.2):                       # two thinner side falls
        G.poly([V(xc + dx - 0.35, y0 + 1.0, 7.0), V(xc + dx + 0.35, y0 + 1.0, 7.0),
                V(xc + dx + 0.5, y0 - 1.0, ZP + 0.1), V(xc + dx - 0.5, y0 - 1.0, ZP + 0.1)], FALL, (0, -1, 0.3))
    # the nub: basin lip and the Birth of Venus on its rock
    nub = [(3.17, -11.44), (1.97, -13.73), (-2.73, -13.7), (-4.09, -11.43)]
    solid(G, nub, -0.3, ZP + 0.45, SANDSTONE_L, top=WATER)
    ellipsoid(G, (-0.4, -12.5, ZP + 0.6), (1.4, 0.9, 1.0), ROCK, segs=7, rings=4, smooth=False)
    G.add(figure(2.2, MARBLE, pose='up'), place(-0.4, -12.6, ZP + 1.2))

    # paired columns on pedestals either side of the niche
    for dx in (-5.35, -3.95, 3.95, 5.35):
        cx = xc + dx
        cy = y0 - 0.55
        boxz(G, cx - 0.55, cy - 0.55, cx + 0.55, cy + 0.55, -0.3, 3.0, SANDSTONE_L)
        lathe(G, (cx, cy, 3.0), [(0.5, 0), (0.46, 0.3), (0.40, 0.4), (0.42, 4.0), (0.36, 10.0),
                                 (0.46, 10.2), (0.55, 10.6)], SANDSTONE_L, segs=10, smooth=True)
    # entablature and cornice over the columns
    boxz(G, x0 - 0.6, y0 - 1.25, x1 + 0.6, y0 + 2.0, 13.6, 15.2, SANDSTONE_L)
    boxz(G, x0 - 0.9, y0 - 1.55, x1 + 0.9, y0 + 2.3, 15.2, 15.8, SANDSTONE)
    # attic with its inscription panel, then the quadriga's plinth
    boxz(G, x0 + 0.2, y0 - 0.3, x1 - 0.2, y0 + 5.0, 15.8, 19.2, SANDSTONE)
    G.poly([V(xc - 3.2, y0 - 0.33, 16.4), V(xc + 3.2, y0 - 0.33, 16.4),
            V(xc + 3.2, y0 - 0.33, 18.6), V(xc - 3.2, y0 - 0.33, 18.6)], SANDSTONE_L, (0, -1, 0))
    boxz(G, x0, y0 - 0.55, x1, y0 + 5.25, 19.2, 19.7, SANDSTONE_L)
    boxz(G, xc - 3.6, y0 + 0.2, xc + 3.6, y0 + 5.0, 19.7, 20.5, SANDSTONE_L)
    G.add(quadriga(GOLD), place(xc, y0 + 3.0, 20.5, yaw=-math.pi / 2, scale=1.05))
    # statues over each pair of columns, and griffin-ish gilded acroteria at the attic ends
    for dx in (-4.65, 4.65):
        G.add(figure(2.4, MARBLE, pose='forward'), place(xc + dx, y0 - 0.8, 15.8))
        lathe(G, (xc + dx * 1.1, y0 + 0.6, 19.7), [(0.5, 0), (0.4, 0.6), (0.1, 1.6), (0.0, 1.9)],
              GOLD, segs=6, smooth=False)
    # side faces: pilasters and a string course at the terrace level
    for xf, sg in ((x0, -1), (x1, 1)):
        wall = Wall((xf, y1), (xf, y0)) if sg < 0 else Wall((xf, y0), (xf, y1))
        for k in range(5):
            s0 = 2.0 + k * 4.2
            wall.block(G, s0, s0 + 0.9, -0.3, ZC - 0.4, 0.3, SANDSTONE_L)
        wall.block(G, 0, wall.L, ZT - 0.4, ZT, 0.25, SANDSTONE_L)
        for k in range(4):
            s0 = 3.2 + k * 4.2
            wall.decal(G, arch_outline(s0, s0 + 2.0, ZT + 1.2, ZT + 4.4, 6), SHADOW)
    balustrade(G, (x0 + 0.2, y0 + 5.2, ZC), (x0 + 0.2, y1 - 0.2, ZC), SANDSTONE_L)
    balustrade(G, (x1 - 0.2, y0 + 5.2, ZC), (x1 - 0.2, y1 - 0.2, ZC), SANDSTONE_L)

    # ── the rear block (mapped, 17 m wide): the reservoir behind the arch
    rx0, rx1, ry0, ry1 = -8.34, 8.60, 9.32, 23.45
    ZR = 12.5
    boxz(G, rx0, ry0, rx1, ry1, -0.3, ZR, SANDSTONE, top=WATER)
    solid(G, rect(rx0 - 0.3, ry0 - 0.3, rx1 + 0.3, ry1 + 0.3), ZR - 0.6, ZR, SANDSTONE_L,
          caps=(True, False))
    for a, b in (((rx0, ry0), (rx0, ry1)), ((rx0, ry1), (rx1, ry1)), ((rx1, ry1), (rx1, ry0))):
        balustrade(G, (a[0], a[1], ZR), (b[0], b[1], ZR), SANDSTONE_L)
    back = Wall((rx1, ry1), (rx0, ry1))
    for k in range(3):
        s0 = 1.6 + k * 5.2
        back.decal(G, arch_outline(s0, s0 + 3.2, 0.0, 5.4, 8), SHADOW)
        back.block(G, s0 - 1.2, s0 - 0.4, -0.3, ZR - 0.6, 0.3, SANDSTONE_L)
    back.block(G, 0, back.L, 7.6, 8.0, 0.2, SANDSTONE_L)
    for xf, a, b in ((rx0, (rx0, ry1), (rx0, ry0)), (rx1, (rx1, ry0), (rx1, ry1))):
        wall = Wall(a, b)
        for k in range(3):
            s0 = 1.4 + k * 4.4
            wall.decal(G, arch_outline(s0, s0 + 2.2, 1.0, 5.2, 6), SHADOW)

    # ── low stairs from the ground up onto the platform at the U's two south ends
    for xa, xb in ((-38.6, -33.4), (34.8, 41.3)):
        for i in range(6):
            z = ZP - (i + 1) * (ZP / 7)
            boxz(G, xa, -61.4 - (i + 1) * 0.36, xb, -61.3, -0.3, z, SANDSTONE_L, caps=(False, True))
    # balustrades round the lower terraces (pond edges and outer edges)
    for path in ([(-13.8, -48.7), (-33.1, -48.4), (-33.2, -59.1), (-33.0, -61.5)],
                 [(14.3, -49.5), (34.3, -49.4), (34.4, -59.8), (34.4, -61.1)],
                 [(-38.9, -61.1), (-38.7, -41.7), (-26.8, -41.4)],
                 [(41.5, -60.8), (41.3, -41.3), (28.3, -41.2)],
                 [(-13.8, -41.6), (-13.8, -48.5)], [(14.3, -41.6), (14.3, -49.3)]):
        for a, b in zip(path, path[1:]):
            balustrade(G, (a[0], a[1], ZP), (b[0], b[1], ZP), SANDSTONE_L)
    # statues on pedestals at the pond corners
    for x, y in ((-33.1, -48.4), (34.3, -49.4), (-13.8, -48.7), (14.3, -49.5)):
        boxz(G, x - 0.6, y - 0.6, x + 0.6, y + 0.6, ZP, ZP + 1.6, SANDSTONE_L)
        G.add(figure(2.0, MARBLE), place(x, y, ZP + 1.6, yaw=0.0))
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 2. HIVERNACLE — way 33570471 (Josep Amargós, 1888)
# ═════════════════════════════════════════════════════════════════════════════
#
# The footprint is a 29.2 x 32.9 m rectangle on the park grid (~45° off
# north). The naves are taken to run NE-SW, perpendicular to the Passeig de
# Picasso (the SW side), so the street front shows three glass gables — the
# tall central one between two lower ones — framed by brick piers. Built square
# in its own frame (X across the naves, +Y toward the park, NE) about the
# rectangle's centre, then turned onto the grid once.

def drop_collinear(r, tol_deg=4.0):
    out = []
    n = len(r)
    for i in range(n):
        a, b, c = r[i - 1], r[i], r[(i + 1) % n]
        u = (b[0] - a[0], b[1] - a[1])
        v = (c[0] - b[0], c[1] - b[1])
        ang = abs(math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]))
        if math.degrees(ang) > tol_deg:
            out.append(b)
    return out


def greenhouse_frame(ring):
    r = drop_collinear(open_ring(ring))
    assert len(r) == 4, r
    # order the four corners so r[0]->r[1] is one long-ish side; derive the axes
    c = Vector((sum(p[0] for p in r) / 4, sum(p[1] for p in r) / 4, 0))
    e = [Vector((r[(i + 1) % 4][0] - r[i][0], r[(i + 1) % 4][1] - r[i][1], 0)) for i in range(4)]
    return c, r, e


def build_hivernacle():
    s = SITE['33570471']
    c, r, e = greenhouse_frame(s['ringEN_m'])
    # e[0]: N->E (SE, across the naves), e[1]: E->S (SW), e[2]: S->W (NW), e[3]: W->N (NE)
    bx = (e[0] - e[2]).normalized()               # SE: local +X
    W_ = (e[0].length + e[2].length) / 2           # 29.2 m across
    L_ = (e[1].length + e[3].length) / 2           # 32.9 m along
    hx, hy = W_ / 2, L_ / 2
    G = Geo()

    naves = [(-hx, -5.5, 5.5, 3.0), (-5.5, 5.5, 9.0, 4.2), (5.5, hx, 5.5, 3.0)]  # x0, x1, eave, rise
    NA = 10
    bays = 12
    ys = [-hy + L_ * k / bays for k in range(bays + 1)]

    # brick plinth under the glazing
    solid(G, rect(-hx, -hy, hx, hy), -0.3, 1.0, BRICK_H, top=STONE_TRIM, caps=(False, True))
    for x0, x1, eave, rise in naves:
        cx = (x0 + x1) / 2
        arc = [(cx + ax, eave + az) for ax, az in seg_arc(x1 - x0, rise, NA)]
        g = G.group()
        for (xa, za), (xb, zb) in zip(arc, arc[1:]):
            mid = Vector(((xa + xb) / 2 - cx, 0, (za + zb) / 2 - (eave + az_centre(x1 - x0, rise))))
            G.poly([V(xa, -hy, za), V(xb, -hy, zb), V(xb, hy, zb), V(xa, hy, za)], GLASS, mid, g)
        # glass gables at both ends
        for yf, sg in ((-hy, -1), (hy, 1)):
            G.poly([V(x, yf, z) for x, z in [(x0, 1.0)] + arc + [(x1, 1.0)]], GLASS_D, (0, sg, 0))
            # iron mullions on the gable
            for k in range(1, 6):
                x = x0 + (x1 - x0) * k / 6
                ztop = eave + arc_height(x - cx, x1 - x0, rise)
                strut(G, (x, yf + sg * 0.06, 1.0), (x, yf + sg * 0.06, ztop), 0.12, IRON)
            strut(G, (x0, yf + sg * 0.06, eave), (x1, yf + sg * 0.06, eave), 0.14, IRON)
            # brick archivolt framing the gable glass
            outer = [(cx + ax * 1.0, eave + az) for ax, az in seg_arc(x1 - x0, rise, NA)]
            inner = [(cx + ax * 0.9, eave + az * 0.86 - 0.35) for ax, az in seg_arc(x1 - x0, rise, NA)]
            band = outer + inner[::-1]
            solid(G, band, yf, yf + sg * 0.45, BRICK_H, P=lambda u, v, w: V(u, w, v))
        # iron ribs over the vault at each bay line, purlins along it
        for y in ys:
            for (xa, za), (xb, zb) in zip(arc, arc[1:]):
                strut(G, (xa, y, za + 0.07), (xb, y, zb + 0.07), 0.14, IRON)
        for k in (2, 5, 8):
            xa, za = arc[k]
            strut(G, (xa, -hy, za + 0.05), (xa, hy, za + 0.05), 0.1, IRON)
        # crest (ridge) rail
        xa, za = arc[NA // 2]
        strut(G, (xa, -hy, za + 0.15), (xa, hy, za + 0.15), 0.18, IRON)

    # long glass walls (x = +-hx) and the central nave's clerestories (x = +-5.5)
    for xf, sg, zb, zt in ((-hx, -1, 1.0, 5.5), (hx, 1, 1.0, 5.5), (-5.5, -1, 5.5, 9.0), (5.5, 1, 5.5, 9.0)):
        G.poly([V(xf, -hy, zb), V(xf, hy, zb), V(xf, hy, zt), V(xf, -hy, zt)], GLASS_D, (sg, 0, 0))
        for y in ys:
            strut(G, (xf + sg * 0.06, y, zb), (xf + sg * 0.06, y, zt), 0.16, IRON)
        strut(G, (xf + sg * 0.06, -hy, zt), (xf + sg * 0.06, hy, zt), 0.2, IRON)
        strut(G, (xf + sg * 0.06, -hy, (zb + zt) / 2), (xf + sg * 0.06, hy, (zb + zt) / 2), 0.1, IRON)

    # brick piers framing each end, and the entrance fronts
    for yf, sg in ((-hy, -1), (hy, 1)):
        for x, zt in ((-hx, 6.6), (-5.5, 10.2), (5.5, 10.2), (hx, 6.6)):
            y0, y1 = (yf - 0.6, yf + 0.4) if sg < 0 else (yf - 0.4, yf + 0.6)
            boxz(G, x - 0.55, y0, x + 0.55, y1, -0.3, zt, BRICK_H, top=STONE_TRIM)
            lathe(G, (x, (y0 + y1) / 2, zt), [(0.35, 0), (0.2, 0.5), (0.0, 0.9)], STONE_TRIM, segs=6,
                  smooth=False)
        # brick base across the end, with the doorway in the central nave
        y0, y1 = (yf - 0.35, yf) if sg < 0 else (yf, yf + 0.35)
        boxz(G, -hx, y0, hx, y1, -0.3, 2.4, BRICK_H, top=STONE_TRIM)
        yd = y0 - 0.02 if sg < 0 else y1 + 0.02
        G.poly([V(x, yd, z) for x, z in arch_outline(-1.6, 1.6, 0.0, 2.2, 8)], WINDOW, (0, sg, 0))
        for x in (-10.0, 10.0):
            G.poly([V(x - 1.2 + xx, yd, z) for xx, z in [(0, 0.9), (2.4, 0.9), (2.4, 2.0), (0, 2.0)]],
                   GLASS_D, (0, sg, 0))
    # a lantern of palms inside is not visible through opaque glass; the roof is the building.
    G.transform(Matrix.Translation((c.x, c.y, 0)) @ Matrix.Rotation(math.atan2(bx.y, bx.x), 4, 'Z'))
    return G


def az_centre(span, rise):
    """z of the arc's centre relative to the springing (for outward hints)."""
    h = span / 2
    R = (h * h + rise * rise) / (2 * rise)
    return rise - R


def arc_height(x, span, rise):
    h = span / 2
    R = (h * h + rise * rise) / (2 * rise)
    zc = rise - R
    return zc + math.sqrt(max(0.0, R * R - x * x))


# ═════════════════════════════════════════════════════════════════════════════
# 3. UMBRACLE — way 33570470 (Josep Fontserè, 1883-84)
# ═════════════════════════════════════════════════════════════════════════════
#
# A 38.5 x 34 m rectangle on the park grid. Taken here with its three naves
# running parallel to the Passeig de Picasso, so the street front (SW) is the
# long brick wall of pilasters and round-arched openings with the slatted
# barrel rising behind it. The vaults are real slats with real gaps: from
# above, the planted floor shows through, as it does in the building.

def build_umbracle():
    s = SITE['33570470']
    c, r, e = greenhouse_frame(s['ringEN_m'])
    # r: W, N, E, S. e[1]: N->E (SE, along the street) -> local +X
    bx = (e[1] - e[3]).normalized()
    W_ = (e[1].length + e[3].length) / 2          # 38.5 along the street
    L_ = (e[0].length + e[2].length) / 2          # 34.0 deep
    hx, hy = W_ / 2, L_ / 2
    G = Geo()
    rnd = Rand(1884)
    ZW = 6.5                                      # wall head / springing
    bays = 10
    bay = W_ / bays
    naves = [(-hy, -7.5, 1.8), (-7.5, 7.5, 3.8), (7.5, hy, 1.8)]   # y0, y1, rise

    # planted floor, and plants inside
    G.poly([V(-hx, -hy, 0.04), V(hx, -hy, 0.04), V(hx, hy, 0.04), V(-hx, hy, 0.04)], INTERIOR, (0, 0, 1))
    for i in range(26):
        x = rnd(-hx + 2.0, hx - 2.0)
        y = rnd(-hy + 2.5, hy - 2.5)
        if abs(abs(y) - 7.5) < 1.0:
            continue
        rr = rnd(0.8, 1.8)
        ellipsoid(G, (x, y, rr * 0.7), (rr, rr, rr * 0.8), FOLIAGE if i % 2 else FOLIAGE_L, segs=7,
                  rings=4, smooth=False)
    for x, y in ((-12.0, 0.0), (0.0, 1.5), (12.0, -1.0), (-6.0, -12.0), (7.0, 12.0)):
        lathe(G, (x, y, 0), [(0.22, 0), (0.16, 5.2)], WOOD_D, segs=6, smooth=False)
        for k in range(6):
            a = 2 * math.pi * k / 6
            strut(G, (x, y, 5.2), (x + 1.9 * math.cos(a), y + 1.9 * math.sin(a), 4.4), 0.45, FOLIAGE_L,
                  d=0.08)

    # long walls, front (-Y) and back (+Y): real openings between pilasters
    for yf, sg in ((-hy, -1), (hy, 1)):
        y0, y1 = (yf, yf + 0.5) if sg < 0 else (yf - 0.5, yf)
        for k in range(bays + 1):
            x = -hx + k * bay
            boxz(G, x - 0.45, y0 - (0.25 if sg < 0 else 0), x + 0.45, y1 + (0.25 if sg > 0 else 0),
                 -0.3, ZW + 0.9, BRICK_U, top=STONE_TRIM)
        for k in range(bays):
            xa, xb = -hx + k * bay + 0.45, -hx + (k + 1) * bay - 0.45
            boxz(G, xa, y0, xb, y1, -0.3, 0.9, BRICK_U, top=STONE_TRIM)
            spring = 4.2
            rad = (xb - xa) / 2
            cx = (xa + xb) / 2
            spand = [(xa, ZW), (xa, spring)]
            for i in range(1, 10):
                t = math.pi - math.pi * i / 10
                spand.append((cx + rad * math.cos(t), spring + rad * math.sin(t)))
            spand += [(xb, spring), (xb, ZW)]
            solid(G, spand, y0, y1, BRICK_U, P=lambda u, v, w: V(u, w, v))
        # frieze and cornice along the wall head
        boxz(G, -hx - 0.3, y0 - 0.1, hx + 0.3, y1 + 0.1, ZW, ZW + 0.5, BRICK_D)
        boxz(G, -hx - 0.4, y0 - 0.25, hx + 0.4, y1 + 0.25, ZW + 0.5, ZW + 0.7, STONE_TRIM)

    # end walls (x = +-hx): brick gables following the three vaults
    prof = [(-hy, -0.3), (hy, -0.3)]
    for y0, y1, rise in reversed(naves):
        cy = (y0 + y1) / 2
        for ay, az in reversed(seg_arc(y1 - y0, rise, 10)):
            prof.append((cy + ay, ZW + az + 0.35))
    for xf, sg in ((-hx, -1), (hx, 1)):
        xa, xb = (xf - 0.1, xf + 0.5) if sg < 0 else (xf - 0.5, xf + 0.1)
        solid(G, prof, xa, xb, BRICK_U, P=lambda u, v, w: V(w, u, v))
        xd = xa - 0.02 if sg < 0 else xb + 0.02
        for y0, y1, rise in naves:
            cy = (y0 + y1) / 2
            w = 5.0 if y1 - y0 > 10 else 3.0
            G.poly([V(xd, cy + a_, z) for a_, z in arch_outline(-w / 2, w / 2, 0.0, 2.8 + w / 2 * 0.3, 8)],
                   INTERIOR, (sg, 0, 0))
        for y in (-hy, -7.5, 7.5, hy):
            boxz(G, xd - 0.25 if sg < 0 else xd - 0.05, y - 0.45, xd + 0.05 if sg < 0 else xd + 0.25,
                 y + 0.45, -0.3, ZW + 0.9, BRICK_D)

    # inner cast-iron columns and the beams they carry
    for yc in (-7.5, 7.5):
        for k in range(1, bays):
            x = -hx + k * bay
            lathe(G, (x, yc, 0), [(0.22, 0), (0.14, 0.4), (0.12, ZW - 0.3), (0.3, ZW)], IRON, segs=6,
                  smooth=False)
        strut(G, (-hx, yc, ZW + 0.15), (hx, yc, ZW + 0.15), 0.3, WOOD_D, d=0.4)

    # the vaults: transverse arched ribs at each pier, slats with gaps along X
    for y0, y1, rise in naves:
        cy = (y0 + y1) / 2
        arc = [(cy + ay, ZW + az) for ay, az in seg_arc(y1 - y0, rise, 12)]
        for k in range(bays + 1):
            x = -hx + k * bay
            for (ya, za), (yb, zb) in zip(arc, arc[1:]):
                strut(G, (x, ya, za), (x, yb, zb), 0.22, WOOD_D, d=0.35)
        # arc-length resample for the slats, pitch 0.6 m, slat 0.3 m
        pts = seg_arc(y1 - y0, rise, 200)
        cum = [0.0]
        for (ya, za), (yb, zb) in zip(pts, pts[1:]):
            cum.append(cum[-1] + math.hypot(yb - ya, zb - za))
        total = cum[-1]
        nsl = int(total / 0.6)
        j = 0
        for i in range(nsl):
            target = (i + 0.5) * total / nsl
            while cum[j + 1] < target:
                j += 1
            t = (target - cum[j]) / (cum[j + 1] - cum[j])
            ya = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t
            za = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t
            ty = pts[j + 1][0] - pts[j][0]
            tz = pts[j + 1][1] - pts[j][1]
            tl = math.hypot(ty, tz)
            tan = Vector((0, ty / tl, tz / tl))
            nrm = Vector((0, -tz / tl, ty / tl))
            if nrm.z < 0:
                nrm = -nrm
            o = V(0, cy + ya, ZW + za) + nrm * 0.2
            fbox(G, o, (1, 0, 0), tan, nrm, W_ + 0.2, 0.3, 0.06, WOOD)

    G.transform(Matrix.Translation((c.x, c.y, 0)) @ Matrix.Rotation(math.atan2(bx.y, bx.x), 4, 'Z'))
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 4. CASTELL DELS TRES DRAGONS — way 33570474 (Domènech i Montaner, 1888)
# ═════════════════════════════════════════════════════════════════════════════
#
# The 41-vertex footprint is used as it is. Read in the park grid it is an L:
# a 43 x 21 m main block running NE into the park, a 7 m-wide wing along the
# Passeig de Picasso to the NW, three round turrets (north and south corners
# of the main block, west end of the wing) and one square tower projecting at
# the east corner — the square one is taken as the tall keep. The whole ring is
# extruded to the wing's height, the main block's sub-ring to the main height,
# then the turrets and the keep rise on circles/squares fitted to the ring.

def build_castell():
    s = SITE['33570474']
    R = open_ring(s['ringEN_m'])
    G = Geo()
    Z_WING, Z_MAIN, Z_TURRET, Z_KEEP = 12.5, 16.5, 20.5, 26.5

    main = R[0:30]                       # A .. I (ring indices 0..29)
    keep = [(27.98, 7.0), (33.25, 1.89), (28.13, -3.79), (22.86, 1.32)]
    turrets = [fit_circle(R[2:14]), fit_circle(R[19:29]), fit_circle(R[31:38])]
    turret_top = [Z_TURRET, Z_TURRET, Z_MAIN]

    solid(G, R, -0.3, Z_WING, BRICK, top=ROOF_DARK)
    solid(G, main, Z_WING, Z_MAIN, BRICK, top=ROOF_DARK, caps=(False, True))
    solid(G, keep, Z_MAIN, Z_KEEP, BRICK, top=ROOF_DARK, caps=(False, True))
    for (tx, ty, tr), zt in zip(turrets, turret_top):
        lathe(G, (tx, ty, -0.3), [(tr, 0), (tr, zt + 0.3)], BRICK, segs=16, smooth=True)

    def in_turret(p, margin=0.4):
        return any(math.hypot(p[0] - tx, p[1] - ty) < tr + margin for tx, ty, tr in turrets)

    def features(ring, z_top, windows=True, skip=()):
        r = ccw(ring)
        for i in range(len(r)):
            a, b = r[i], r[(i + 1) % len(r)]
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 2.4 or (in_turret(a) and in_turret(b)):
                continue
            if sum(any(math.hypot(p[0] - q[0], p[1] - q[1]) < 0.1 for q in skip) for p in (a, b)) == 2:
                continue
            w = Wall(a, b)
            # stone plinth, brick string course, corbel band
            w.block(G, 0, L, -0.3, 1.1, 0.12, STONE_TRIM)
            w.block(G, 0, L, 5.2, 5.55, 0.14, BRICK_D)
            w.block(G, 0, L, z_top - 1.25, z_top - 0.7, 0.35, BRICK_D)
            w.block(G, 0, L, z_top - 0.7, z_top, 0.2, BRICK)
            # merlons along the parapet
            n_m = max(1, int(L / 1.8))
            for k in range(n_m):
                sm = (k + 0.5) * L / n_m
                w.block(G, sm - 0.45, sm + 0.45, z_top, z_top + 1.15, 0.5, BRICK, off=-0.3)
            # white ceramic shields in the frieze
            n_s = max(1, int(L / 2.2))
            for k in range(n_s):
                sm = (k + 0.5) * L / n_s
                zs = z_top - 2.0
                w.decal(G, [(sm - 0.33, zs + 0.45), (sm + 0.33, zs + 0.45), (sm + 0.33, zs - 0.1),
                            (sm, zs - 0.45), (sm - 0.33, zs - 0.1)], WHITE_TILE)
            if not windows:
                continue
            # tall arched windows upstairs, smaller below, with brick hoods
            n_w = int((L - 1.2) / 3.6)
            for k in range(n_w):
                sm = (k + 0.5) * L / n_w
                zt = min(11.0, z_top - 3.0)
                w.decal(G, arch_outline(sm - 1.05, sm + 1.05, 6.2, zt - 1.05, 8), WINDOW)
                w.block(G, sm - 1.3, sm + 1.3, zt - 0.05, zt + 0.35, 0.16, BRICK_D)
                w.decal(G, [(sm - 0.08, 6.2), (sm + 0.08, 6.2), (sm + 0.08, zt - 1.1), (sm - 0.08, zt - 1.1)],
                        STONE_TRIM, off=0.05)
                w.decal(G, arch_outline(sm - 0.65, sm + 0.65, 1.8, 3.9, 6), WINDOW)
                w.block(G, sm - 0.85, sm + 0.85, 4.55, 4.8, 0.12, STONE_TRIM)

    # the wing (whole ring minus the main block) and the main block
    features(R[29:] + [R[0]], Z_WING, skip=[R[29], R[0]])
    features(main, Z_MAIN, skip=[R[29], R[0]])
    # keep: plinth-to-top features on its free faces, windows high up
    kc = ccw(keep)
    for i in range(len(kc)):
        a, b = kc[i], kc[(i + 1) % 4]
        w = Wall(a, b)
        cxk = sum(p[0] for p in keep) / 4
        cyk = sum(p[1] for p in keep) / 4
        L = w.L
        w.block(G, 0, L, Z_KEEP - 1.3, Z_KEEP - 0.7, 0.4, BRICK_D)
        for k in range(4):
            sm = (k + 0.5) * L / 4
            w.block(G, sm - 0.5, sm + 0.5, Z_KEEP, Z_KEEP + 1.3, 0.55, BRICK, off=-0.35)
        for k in range(3):
            sm = (k + 0.5) * L / 3
            w.decal(G, [(sm - 0.33, Z_KEEP - 1.6), (sm + 0.33, Z_KEEP - 1.6), (sm + 0.33, Z_KEEP - 2.1),
                        (sm, Z_KEEP - 2.5), (sm - 0.33, Z_KEEP - 2.1)], WHITE_TILE)
        for zz in (Z_MAIN + 1.5, Z_MAIN + 5.2):
            w.decal(G, arch_outline(L / 2 - 0.9, L / 2 + 0.9, zz, zz + 2.0, 8), WINDOW)
        w.block(G, 0, L, Z_MAIN + 0.4, Z_MAIN + 0.8, 0.14, STONE_TRIM)
    # keep corner pinnacles and a crowning spire
    for x, y in keep:
        cxk = sum(p[0] for p in keep) / 4
        cyk = sum(p[1] for p in keep) / 4
        px, py = x + (cxk - x) * 0.08, y + (cyk - y) * 0.08
        lathe(G, (px, py, Z_KEEP), [(0.45, 0), (0.45, 1.3), (0.3, 1.5), (0.0, 3.4)], BRICK_D, segs=6,
              smooth=False)
    lathe(G, (cxk, cyk, Z_KEEP), [(1.6, 0), (1.6, 1.6), (1.1, 1.8), (0.0, 4.6)], ROOF_DARK, segs=8,
          smooth=False)
    # turrets: corbel ring, merlons, slit windows, and a pinnacle
    for (tx, ty, tr), zt in zip(turrets, turret_top):
        lathe(G, (tx, ty, zt - 1.3), [(tr, 0), (tr + 0.35, 0.3), (tr + 0.35, 1.3), (tr - 0.3, 1.3)],
              BRICK_D, segs=16, smooth=False, caps=False)
        n_m = 8
        for k in range(n_m):
            a0 = 2 * math.pi * (k + 0.25) / n_m
            box(G, (tx + (tr + 0.05) * math.cos(a0), ty + (tr + 0.05) * math.sin(a0), zt + 0.55),
                (0.5, 0.9, 1.1), BRICK, yaw=a0)
        for k in range(6):
            a0 = 2 * math.pi * k / 6
            for zz in (3.0, 8.0, 12.5 if zt > 14 else None):
                if zz is None or zz > zt - 3.5:
                    continue
                nx, ny = math.cos(a0), math.sin(a0)
                w = Wall((tx + tr * nx - ny * 0.5, ty + tr * ny + nx * 0.5),
                         (tx + tr * nx + ny * 0.5, ty + tr * ny - nx * 0.5), (nx, ny))
                w.decal(G, arch_outline(0.2, 0.8, zz, zz + 1.4, 4), WINDOW, off=0.05)
        for k in range(8):
            a0 = 2 * math.pi * (k + 0.5) / 8
            nx, ny = math.cos(a0), math.sin(a0)
            w = Wall((tx + tr * nx - ny * 0.35, ty + tr * ny + nx * 0.35),
                     (tx + tr * nx + ny * 0.35, ty + tr * ny - nx * 0.35), (nx, ny))
            zs = zt - 2.1
            w.decal(G, [(0.05, zs + 0.45), (0.65, zs + 0.45), (0.65, zs - 0.1), (0.35, zs - 0.45),
                        (0.05, zs - 0.1)], WHITE_TILE, off=0.05)
        lathe(G, (tx, ty, zt), [(0.35, 0), (0.25, 1.2), (0.0, 3.0)], BRICK_D, segs=6, smooth=False)
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 5. GLORIETA / QUIOSC DE MÚSICA — way 574334618 (Antoni Maria Gallissà)
# ═════════════════════════════════════════════════════════════════════════════
#
# The mapped octagon has its flat sides to N/S/E/W and is ~10.7 m across
# the flats. A raised stone podium, eight slender iron columns, a lambrequin
# band and an ogee (bell) roof with an onion finial, ~8.8 m overall. The stair
# is put on the NE face, toward the Cascada pond and the main walk — that side
# is a judgement, not a measurement.

def build_glorieta():
    s = SITE['574334618']
    r = open_ring(s['ringEN_m'])
    xmn, ymn, xmx, ymx = ring_bbox(r)
    cx, cy = (xmn + xmx) / 2, (ymn + ymx) / 2
    apo = ((xmx - xmn) + (ymx - ymn)) / 4
    Rc = apo / math.cos(math.pi / 8)            # circumradius
    G = Geo()
    ph = math.pi / 8                             # flat faces N/S/E/W
    ZB = 1.2

    def octo(rad):
        return [(cx + rad * math.cos(ph + k * math.pi / 4), cy + rad * math.sin(ph + k * math.pi / 4))
                for k in range(8)]
    solid(G, octo(Rc), -0.3, ZB - 0.15, KIOSK_STONE, top=STONE_TRIM)
    solid(G, octo(Rc + 0.12), ZB - 0.15, ZB, STONE_TRIM)
    # stair on the NE face: 6 steps out from the podium
    ang = math.pi / 4
    dx, dy = math.cos(ang), math.sin(ang)
    for i in range(6):
        z = ZB - (i + 1) * ZB / 7
        d0 = apo + i * 0.32
        St = Geo()
        boxz(St, -0.02, -1.3, 0.32, 1.3, -0.3, z, KIOSK_STONE, top=STONE_TRIM)
        G.add(St, place(cx + dx * d0, cy + dy * d0, 0, yaw=ang))
    # columns at the vertices, brackets to the frieze
    ZC, ZF = 4.9, 5.5
    cols = octo(Rc - 0.45)
    for x, y in cols:
        lathe(G, (x, y, ZB), [(0.2, 0), (0.12, 0.3), (0.085, 0.5), (0.075, ZC - ZB - 0.3), (0.16, ZC - ZB)],
              KIOSK_IRON, segs=8, smooth=True)
        ox, oy = (x - cx), (y - cy)
        n = math.hypot(ox, oy)
        for sgn in (-1, 1):
            tx, ty = -oy / n * sgn, ox / n * sgn
            strut(G, (x, y, ZC - 0.9), (x + tx * 0.8, y + ty * 0.8, ZC), 0.06, KIOSK_IRON)
    # railing between the columns except over the stair (NE face = face index 0 here)
    for k in range(8):
        a, b = cols[k], cols[(k + 1) % 8]
        mid_ang = ph + (k + 0.5) * math.pi / 4
        if abs(math.atan2(math.sin(mid_ang - ang), math.cos(mid_ang - ang))) < 0.2:
            continue
        balustrade(G, (a[0], a[1], ZB), (b[0], b[1], ZB), KIOSK_IRON, h=0.95, pitch=0.2, bw=0.04, rw=0.07)
    # frieze band with a scalloped lambrequin, then the roof
    solid(G, octo(Rc - 0.25), ZC, ZF, KIOSK_TRIM, top=KIOSK_CEIL, caps=(True, False))
    oc = octo(Rc - 0.2)
    for k in range(8):
        a, b = oc[k], oc[(k + 1) % 8]
        w = Wall(a, b, ((a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy))
        n = 6
        for j in range(n):
            s0 = w.L * j / n
            s1 = w.L * (j + 1) / n
            w.decal(G, [(s0, ZC), (s1, ZC), ((s0 + s1) / 2, ZC - 0.35)], KIOSK_IRON, off=0.02)
        w.block(G, 0, w.L, ZF - 0.2, ZF, 0.1, KIOSK_IRON)
    # ogee: a short flared lip, a convex bell, then a concave neck up to the finial
    roof = [(Rc + 0.55, ZF), (Rc + 0.25, ZF + 0.12), (Rc - 0.4, ZF + 0.45), (Rc - 1.3, ZF + 0.92),
            (Rc - 2.3, ZF + 1.3), (Rc - 3.3, ZF + 1.55), (Rc - 4.1, ZF + 1.8), (Rc - 4.6, ZF + 2.1),
            (0.45, ZF + 2.45)]
    lathe(G, (cx, cy, 0), roof, KIOSK_ROOF, segs=8, smooth=False, phase=ph, caps=False)
    lathe(G, (cx, cy, 0), [(0.0, ZF - 0.02), (Rc + 0.55, ZF - 0.02)], KIOSK_CEIL, segs=8, smooth=False,
          phase=ph, caps=False)
    # ribs on the roof's hips
    for k in range(8):
        a0 = ph + k * math.pi / 4
        pts = [(cx + rr * math.cos(a0), cy + rr * math.sin(a0), zz + 0.06) for rr, zz in roof]
        for p, q in zip(pts, pts[1:]):
            strut(G, p, q, 0.1, KIOSK_TRIM)
    zt = ZF + 2.45
    lathe(G, (cx, cy, zt), [(0.45, 0), (0.3, 0.1), (0.38, 0.25), (0.3, 0.42), (0.1, 0.58), (0.04, 0.72),
                            (0.0, 0.88)], KIOSK_TRIM, segs=8, smooth=True)
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 6. MAMUT — node 1497569358 (Enric Bassas, 1907, concrete)
# ═════════════════════════════════════════════════════════════════════════════
#
# A life-size woolly mammoth on a low rock: ~4 m at the shoulder with a high
# domed head, a sloping back, a shaggy skirt of hair, the trunk hanging and
# curling, and long tusks that sweep down, out and back up. Centred on its own
# origin, trunk toward +X.

def loft(G, stations, col, segs=14):
    """A smooth body lofted through elliptical sections across Y-Z.
    stations = [(x, z_top, z_bottom, half_width), ...] rear to front."""
    rings = []
    for x, zt, zb, hw in stations:
        zc, rz = (zt + zb) / 2, (zt - zb) / 2
        rings.append([V(x, hw * math.cos(2 * math.pi * k / segs), zc + rz * math.sin(2 * math.pi * k / segs))
                      for k in range(segs)])
    g = G.group()
    for i in range(len(rings) - 1):
        ca = sum(rings[i], Vector()) / segs
        cb = sum(rings[i + 1], Vector()) / segs
        for k in range(segs):
            q = [rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]]
            G.poly(q, col, sum(q, Vector()) / 4 - (ca + cb) / 2, g)
    G.poly(rings[0], col, (-1, 0, 0))
    G.poly(rings[-1], col, (1, 0, 0))


def build_mamut():
    G = Geo()
    rnd = Rand(1907)
    z0 = 0.55
    # rock base: an irregular low slab with flat boulders round its edge
    base = []
    for k in range(16):
        a = 2 * math.pi * k / 16
        rr = 1.0 + rnd(-0.07, 0.07)
        base.append((0.3 + 4.0 * rr * math.cos(a), 2.25 * rr * math.sin(a)))
    solid(G, base, -0.3, z0, MAMMOTH_ROCK)
    for i in range(12):
        a = 2 * math.pi * (i + rnd(-0.2, 0.2)) / 12
        ellipsoid(G, (0.3 + 3.75 * math.cos(a), 2.05 * math.sin(a), z0 * 0.7),
                  (rnd(0.7, 1.1), rnd(0.5, 0.8), rnd(0.25, 0.4)), MAMMOTH_ROCK, segs=7, rings=4, smooth=False)
    # legs: thick pillars, flared feet
    for x, y, top in ((1.3, 0.72, 2.3), (1.3, -0.72, 2.3), (-1.6, 0.68, 2.1), (-1.6, -0.68, 2.1)):
        lathe(G, (x, y, z0), [(0.56, 0), (0.5, 0.22), (0.43, 0.6), (0.47, top - 0.5), (0.6, top)], MAMMOTH,
              segs=10, smooth=True)
    # one lofted body: low rump, sloping back, high shoulder hump, short neck
    body = [(-2.85, 2.9, 2.2, 0.35), (-2.55, 3.2, 1.85, 0.95), (-1.9, 3.3, 1.65, 1.18),
            (-0.9, 3.35, 1.6, 1.28), (0.1, 3.55, 1.6, 1.3), (0.9, 3.75, 1.7, 1.26),
            (1.6, 3.7, 1.85, 1.12), (2.15, 3.55, 2.1, 0.9), (2.6, 3.35, 2.25, 0.72)]
    loft(G, [(x, zt + z0, zb + z0, hw) for x, zt, zb, hw in body], MAMMOTH, segs=16)
    # the shaggy skirt: a flared band of hair hanging from the flanks, ragged hem
    n = 36
    top_r, bot_r = [], []
    for k in range(n):
        a = 2 * math.pi * k / n
        top_r.append(V(-0.2 + 2.25 * math.cos(a), 1.2 * math.sin(a), z0 + 2.3))
        hem = 1.2 + (0.28 if k % 2 else 0.0) + rnd(-0.08, 0.08)
        bot_r.append(V(-0.2 + 2.42 * math.cos(a), 1.4 * math.sin(a), z0 + hem))
    for k in range(n):
        q = [top_r[k], top_r[(k + 1) % n], bot_r[(k + 1) % n], bot_r[k]]
        mid = sum(q, Vector()) / 4
        G.poly(q, MAMMOTH_D, V(mid.x + 0.2, mid.y, 0))
    # head: a high dome over the brow, small ears
    ellipsoid(G, (2.75, 0, z0 + 3.1), (0.8, 0.72, 0.9), MAMMOTH, segs=12, rings=8)
    ellipsoid(G, (2.5, 0, z0 + 3.6), (0.55, 0.5, 0.42), MAMMOTH, segs=10, rings=6)
    for sg in (-1, 1):
        ellipsoid(G, (2.3, sg * 0.7, z0 + 3.15), (0.3, 0.1, 0.4), MAMMOTH_D, segs=8, rings=5)
    # trunk: hangs down and curls forward at the tip
    tube(G, [(3.35, 0, z0 + 2.85), (3.6, 0, z0 + 2.25), (3.72, 0, z0 + 1.65), (3.68, 0, z0 + 1.1),
             (3.56, 0, z0 + 0.7), (3.68, 0, z0 + 0.42), (3.93, 0, z0 + 0.45), (4.0, 0, z0 + 0.66)],
         [0.4, 0.32, 0.26, 0.21, 0.17, 0.14, 0.12, 0.09], MAMMOTH, segs=10)
    # tusks: out of the jaw, down, forward, out, up and back in
    for sg in (-1, 1):
        tube(G, [(3.15, sg * 0.38, z0 + 2.45), (3.6, sg * 0.55, z0 + 1.9), (4.2, sg * 0.85, z0 + 1.6),
                 (4.85, sg * 0.98, z0 + 1.8), (5.2, sg * 0.85, z0 + 2.35), (5.25, sg * 0.55, z0 + 2.95),
                 (5.05, sg * 0.3, z0 + 3.3)],
             [0.17, 0.16, 0.14, 0.12, 0.1, 0.075, 0.05], MAMMOTH_TUSK, segs=8)
    tube(G, [(-2.75, 0, z0 + 2.75), (-2.95, 0, z0 + 2.3), (-2.98, 0, z0 + 1.85)], [0.11, 0.08, 0.06],
         MAMMOTH_D, segs=6)
    return G


BUILDERS = {
    'cascada-ciutadella': (build_cascada, '135115868', -90),
    'hivernacle': (build_hivernacle, '33570471', -135),
    'umbracle': (build_umbracle, '33570470', -135),
    'castell-tres-dragons': (build_castell, '33570474', -135),
    'glorieta': (build_glorieta, '574334618', 45),
    'mamut': (build_mamut, None, 0),
}


run(BUILDERS, SITE, BUDGET, OUT_DIR)
