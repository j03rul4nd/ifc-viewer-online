# ─── build-anella-olimpica-landmarks.py ───────────────────────────────────────
# Authors three landmarks of the Anella Olímpica on Montjuïc as GLB, for the 3D
# city context: the Estadi Olímpic Lluís Companys, the Palau Sant Jordi and the
# Torre de Comunicacions (Torre Calatrava).
#
#   C:\tools\blender-4.5.12-windows-x64\blender.exe -b -P scripts/blender/build-anella-olimpica-landmarks.py
#
#   env LANDMARKS_ONLY=estadi-olimpic,torre-calatrava   build a subset
#   env LANDMARKS_PREVIEW=<dir>                         also render a 2x2 preview sheet per model
#
# THE FRAME IS THE CONTRACT (see build-ciutadella-landmarks.py). Every model is
# authored in the frame its OpenStreetMap feature is given in
# (montjuic_landmarks_site.json): origin at the entry's `centroid`, +X EAST,
# +Y NORTH, Z up, z = 0 = the ground at the centroid. The app places each GLB
# there with no rotation and no scale, so each model stands on its real outline
# as authored.
#
# MONTJUÏC IS A HILLSIDE, and the app samples the terrain at the origin only.
# Every solid that meets the ground therefore runs down to z = -8 as a hidden
# foundation skirt, so a terrain that falls away from the origin never shows a
# gap under a wall. Two places need more thought than that, and are argued at
# their builders: the stadium, whose origin falls on its sunken pitch, and the
# Palau's south wing, which stands on the lower ground below the plaza.
#
# Geometry is made the kit's way (landmark_kit.py): explicit polygons with an
# outward hint each, sub-assemblies built at the origin and placed by matrices,
# ONE mesh per model, per-face vertex colour in linear RGB, no textures.
#
# Two constructions recur here that the Ciutadella script has no need for, so
# they live in this file rather than the kit:
#   • RAY LOFTS. The stadium's stands run between two unrelated mapped rings
#     (the arena edge and the outer wall) and the Palau's roof between two
#     others (the dome's rim and its crown). Rings with different vertex
#     counts cannot be stitched vertex to vertex, so both are sampled along the
#     same rays from a common centre and the surface is lofted between the two
#     hits on each ray. Both pairs are star-shaped about their centre, which is
#     all the construction needs.
#   • A MITRED INSET of the stadium's outline, vertex for vertex, gives the wall
#     a real thickness: the coping is a strip between the outline and its inset,
#     so no 700 m wall is ever a paper-thin sheet seen from above.

import bpy
import json
import math
import os
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmark_kit import *  # noqa: E402,F401,F403 — Geo, solids, export, run

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
SITE = json.load(open(os.path.join(HERE, 'montjuic_landmarks_site.json'), encoding='utf-8'))
OUT_DIR = os.path.join(REPO, 'public', 'models', 'landmarks')

# Triangle budget per landmark. A build over budget fails.
BUDGET = {
    'estadi-olimpic': 30000,
    'palau-sant-jordi': 15000,
    'torre-calatrava': 8000,
}

SKIRT = -8.0


# ── Palette (linear RGB) ─────────────────────────────────────────────────────

# the stadium's 1929 stone: a pale warm limestone render
STONE = (0.60, 0.50, 0.35)
STONE_L = (0.70, 0.61, 0.45)
STONE_D = (0.43, 0.35, 0.24)
SHADOW = (0.045, 0.04, 0.035)
WINDOW = (0.05, 0.06, 0.07)
RELIEF = (0.66, 0.57, 0.41)
CLOCK = (0.85, 0.84, 0.80)
BRONZE = (0.10, 0.085, 0.05)
CONCRETE = (0.42, 0.41, 0.38)
CONCRETE_L = (0.52, 0.51, 0.48)
SEAT = (0.27, 0.29, 0.32)
SEAT_U = (0.31, 0.33, 0.36)
STAIR = (0.55, 0.53, 0.49)
TRACK = (0.44, 0.10, 0.055)
LINE = (0.82, 0.82, 0.80)
GRASS = (0.065, 0.19, 0.035)
GRASS_L = (0.085, 0.24, 0.045)
ROOF_TOP = (0.50, 0.51, 0.52)
ROOF_UNDER = (0.16, 0.16, 0.17)
STEEL = (0.74, 0.75, 0.76)
LAMP = (0.80, 0.80, 0.70)
FLAGPOLE = (0.70, 0.70, 0.70)

# the Palau: dark zinc roof, pale concrete, dark glass
ZINC = (0.105, 0.11, 0.12)
ZINC_D = (0.075, 0.08, 0.09)
CROWN = (0.40, 0.41, 0.42)
SKYLIGHT = (0.55, 0.58, 0.60)
GLASS = (0.06, 0.08, 0.10)
PALE = (0.66, 0.65, 0.62)
PALE_D = (0.48, 0.47, 0.45)
WHITE = (0.80, 0.80, 0.78)
PAVING = (0.42, 0.20, 0.13)

# the tower: white steel and trencadís of broken white tile
TOWER_WHITE = (0.80, 0.80, 0.79)
TOWER_SHADE = (0.70, 0.70, 0.69)
TRENCADIS = [(0.86, 0.86, 0.84), (0.80, 0.81, 0.80), (0.74, 0.76, 0.78), (0.90, 0.90, 0.88),
             (0.70, 0.73, 0.76), (0.82, 0.80, 0.76)]
DRUM_DARK = (0.06, 0.07, 0.08)
DRUM_STONE = (0.55, 0.52, 0.47)
WATER = (0.06, 0.20, 0.24)


# ── Helpers shared by the three builders ─────────────────────────────────────

def ray_hits(ring, c, th):
    """Distances from c, along the ray at angle th, to every crossing of the
    (closed) ring, nearest first."""
    dx, dy = math.cos(th), math.sin(th)
    out = []
    n = len(ring)
    for i in range(n):
        ax, ay = ring[i]
        bx, by = ring[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        den = dx * ey - dy * ex
        if abs(den) < 1e-12:
            continue
        wx, wy = ax - c[0], ay - c[1]
        t = (wx * ey - wy * ex) / den
        s = (wx * dy - wy * dx) / den
        if t > 1e-6 and -1e-9 <= s <= 1 + 1e-9:
            out.append(t)
    return sorted(out)


def inset(ring, d):
    """The ring moved d metres inward, vertex for vertex (mitred), CCW. Used on
    outlines whose corners are all near-right or obtuse, where a mitred offset
    cannot fold over."""
    r = ccw(ring)
    n = len(r)
    out = []
    for i in range(n):
        p0, p1, p2 = r[i - 1], r[i], r[(i + 1) % n]
        e1 = Vector((p1[0] - p0[0], p1[1] - p0[1]))
        e2 = Vector((p2[0] - p1[0], p2[1] - p1[1]))
        n1 = Vector((-e1.y, e1.x)).normalized()      # left of a CCW edge = inside
        n2 = Vector((-e2.y, e2.x)).normalized()
        k = max(0.35, 1.0 + n1.dot(n2))
        m = (n1 + n2) * (d / k)
        out.append((p1[0] + m.x, p1[1] + m.y))
    return out


def band(G, ring, z0, z1, col, inward=False):
    """The side walls of a ring from z0 to z1, facing out of it (or into it)."""
    r = ccw(ring)
    n = len(r)
    for i in range(n):
        a, b = r[i], r[(i + 1) % n]
        du, dv = b[0] - a[0], b[1] - a[1]
        L = math.hypot(du, dv)
        if L < 1e-6:
            continue
        o = (dv / L, -du / L, 0) if not inward else (-dv / L, du / L, 0)
        G.poly([V(a[0], a[1], z0), V(b[0], b[1], z0), V(b[0], b[1], z1), V(a[0], a[1], z1)], col, o)


def strip(G, pts, w, z, col, closed=False):
    """A flat ribbon of width w along a 2D polyline at height z (painted lines)."""
    P = [Vector((p[0], p[1])) for p in pts]
    n = len(P)
    g = G.group()                    # all faces +Z: share the vertices along the ribbon
    segs = range(n if closed else n - 1)
    for i in segs:
        a, b = P[i], P[(i + 1) % n]
        d = b - a
        if d.length < 1e-6:
            continue
        nrm = Vector((-d.y, d.x)).normalized() * (w / 2)
        G.poly([V(a.x - nrm.x, a.y - nrm.y, z), V(b.x - nrm.x, b.y - nrm.y, z),
                V(b.x + nrm.x, b.y + nrm.y, z), V(a.x + nrm.x, a.y + nrm.y, z)], col, (0, 0, 1), g)


def proud(G, w, s0, s1, z0, z1, depth, col, off=0.0):
    """Wall.block without the faces nobody sees: the back (against the wall) and,
    for anything standing on the plinth or the skirt, the bottom. A cornice or a
    string course keeps its underside, which is seen from the street."""
    a0, a1 = w.p(s0, z0, off), w.p(s1, z0, off)
    b0, b1 = w.p(s0, z0, off + depth), w.p(s1, z0, off + depth)
    up = V(0, 0, z1 - z0)
    G.poly([b0, b1, b1 + up, b0 + up], col, w.n)                       # front
    G.poly([a0 + up, b0 + up, b1 + up, a1 + up], col, (0, 0, 1))       # top
    G.poly([a0, b0, b0 + up, a0 + up], col, -w.d)                      # ends
    G.poly([b1, a1, a1 + up, b1 + up], col, w.d)
    if z0 > ZO + 1.5 and depth > 0.3:
        G.poly([a0, a1, b1, b0], col, (0, 0, -1))


def rider(col, h=1.0):
    """A rearing horse with its rider, hind hooves at the origin, facing +X.
    The kit's horse is rearing by 0.38 rad about its hooves; the rider is set on
    its back in the same tilt, arm raised (the Olympic salute)."""
    G = Geo()
    G.add(horse(col), Matrix.Identity(4))
    body = Geo()
    body.add(figure(1.45, col, pose='up'), place(-0.15, 0, 1.25, yaw=math.pi / 2))
    G.add(body, Matrix.Rotation(-0.38, 4, 'Y'))
    H = Geo()
    H.add(G, Matrix.Diagonal((h, h, h, 1.0)))
    return H


# ═════════════════════════════════════════════════════════════════════════════
# 1. ESTADI OLÍMPIC LLUÍS COMPANYS — way 35764760 (Pere Domènech i Roura, 1929;
#    rebuilt inside the kept facades by Gregotti, Correa, Milà et al., 1989)
# ═════════════════════════════════════════════════════════════════════════════
#
# WHAT THE MAP SAYS. The way's outline is also the outer ring of the grandstand
# multipolygon r155422; its inner ring is the edge of the stands at the arena.
# The mapped soccer pitch (w35743735, 68 x 106 m) sits inside that edge, 0.6°
# off north, and a standard 400 m track (84.39 m straights, 36.5 m inner radius,
# eight 1.22 m lanes) fits round it with a few metres to spare — so the track
# is drawn from the pitch, not guessed. The roof over the main stand is mapped
# (w126784791, building=roof): it covers the WEST stand, from the stand's front
# row back to the facade. Two floodlight masts are mapped on the east side.
#
# WHICH FACADE IS WHICH, from the city's public-art catalogue and photographs:
#   • WEST: the palace front, on the Plaça de Nemesi Ponsati — a long two-storey
#     arcaded body, a domed central pavilion crowned by Gargallo's Aurigues
#     (catalogue position = the middle of this facade, y ≈ 0) and the tall
#     lateral tower at its NORTH end, where the outline steps in (y ≈ 54).
#   • NORTH: the Porta de Marató. The outline's 30 m bump on the stadium's axis
#     is the central block: a great arch, a relief frieze, an attic loggia and a
#     small dome outside; inside, the clock gable over the stands. Gargallo's two
#     bronze Genets stand on pedestals in the north stand either side of the
#     axial stair (catalogue position (-12, 82)), and the 1992 cauldron stands
#     just outside the block (mapped node, 4 m beyond the wall).
#   • EAST: a plainer front whose four mapped 14 m bumps are pavilions.
#   • SOUTH: a second axial gate block on the outline's south bump.
#
# HEIGHTS AND THE SUNKEN PITCH. In 1989 the arena was lowered some 11 m so the
# new lower tier could be dug below the street. The origin (the outline's
# vertex mean) falls ON the pitch, so the terrain sample the app takes is the
# arena's own level, whatever the DEM does with the bowl: z = 0 is the pitch.
# The street outside is taken at ZO = +5 m — between what a fine DEM would give
# (~ +11) and what a smoothed one would — and every outer wall runs down to the
# skirt, so the facade reads right in either case: 18 m of cornice over the
# street, the tower ~42 m, the Marathon block and its dome higher than the rest.

ZO = 5.0          # street level outside the facade (see above)
ZF = 23.0         # top of the facade parapet
ZT = 21.0         # top row of the upper tier, where it meets the wall
ZL = 10.0         # the concourse between the tiers (the old field level)
WALL_T = 3.5      # thickness of the facade wall (coping width)


def stand_profile(rI, rO):
    """(r, z, kind) points of one radial section of the stands, front to back.
    kind names the segment that ends at the point: 'w' wall, 'r' riser, 't' tread,
    'c' concourse. The count is the same for every ray so the loft can stitch."""
    D = rO - rI
    pts = [(rI, 0.0, None), (rI, 1.4, 'w'), (rI + 1.5, 1.4, 'c')]
    u0, u1, u2 = rI + 1.5, rI + 0.46 * D, rI + 0.53 * D
    n1 = 7
    for i in range(n1):
        r0 = u0 + (u1 - u0) * i / n1
        r1 = u0 + (u1 - u0) * (i + 1) / n1
        z = 1.4 + (ZL - 1.4) * (i + 1) / n1
        pts.append((r0, z, 'r'))
        pts.append((r1, z, 't'))
    pts.append((u2, ZL, 'c'))
    pts.append((u2, ZL + 1.6, 'w'))
    n2 = 7
    for i in range(n2):
        r0 = u2 + (rO - u2) * i / n2
        r1 = u2 + (rO - u2) * (i + 1) / n2
        z = ZL + 1.6 + (ZT - ZL - 1.6) * (i + 1) / n2
        pts.append((r0, z, 'R'))
        pts.append((r1, z, 'T'))
    pts.append((rO + 1.5, ZT, 'T'))      # runs on into the wall: no seam at its foot
    return pts


def facade_edge(G, a, b, palace=False):
    """Plinth, storeys, pilasters and cornice on one straight run of the outer wall."""
    w = Wall(a, b)
    L = w.L
    proud(G, w, 0, L, SKIRT, ZO + 1.0, 0.35, STONE_D)
    proud(G, w, 0, L, ZF - 2.2, ZF - 1.5, 0.55, STONE_L)
    proud(G, w, 0, L, ZF - 0.35, ZF, 0.2, STONE_L)
    if L < 2.6:
        return
    proud(G, w, 0, L, ZO + 6.3, ZO + 6.8, 0.25, STONE_L)
    bay = 6.4 if palace else 5.2
    n = max(1, int(round(L / bay)))
    for k in range(n + 1):
        s = k * L / n
        if 0.4 < s < L - 0.4:
            proud(G, w, s - 0.45, s + 0.45, ZO + 1.0, ZF - 2.2, 0.3, STONE_L)
    for k in range(n):
        s = (k + 0.5) * L / n
        hw = min(0.8, L / n * 0.3)
        w.decal(G, [(s - hw, ZO + 2.2), (s + hw, ZO + 2.2), (s + hw, ZO + 5.4), (s - hw, ZO + 5.4)],
                WINDOW)
        if palace:
            aw = min(1.8, L / n * 0.34)
            w.decal(G, arch_outline(s - aw, s + aw, ZO + 7.6, ZO + 12.2, 8), SHADOW)
        else:
            aw = min(0.95, L / n * 0.3)
            w.decal(G, arch_outline(s - aw, s + aw, ZO + 8.2, ZO + 11.6, 6), WINDOW)


def gate_block(G, x0, x1, y0, y1, outer_y, ztop, dome=True, inner_clock=False):
    """An axial gate block (Porta de Marató north, its twin south). Outer face at
    y = outer_y (y1 for the north block, y0 for the south one)."""
    north = outer_y > 0
    boxz(G, x0, y0, x1, y1, SKIRT, ztop, STONE, top=STONE_L)
    xc = (x0 + x1) / 2
    wall = Wall((x1, outer_y), (x0, outer_y)) if north else Wall((x0, outer_y), (x1, outer_y))
    L = wall.L
    sc = L / 2
    # the great arch, deep in shadow, with its archivolt
    wall.decal(G, arch_outline(sc - 4.4, sc + 4.4, SKIRT, ZO + 8.6, 12), SHADOW, off=0.05)
    band_pts = arch_outline(sc - 5.4, sc + 5.4, SKIRT, ZO + 8.6, 12)[2:]
    inner = arch_outline(sc - 4.4, sc + 4.4, SKIRT, ZO + 8.6, 12)[2:][::-1]
    wall.decal(G, band_pts + inner, STONE_L, off=0.08)
    # relief frieze over the arch, windows either side, pilasters, cornice
    proud(G, wall, sc - 6.5, sc + 6.5, ZO + 14.4, ZO + 17.0, 0.25, RELIEF)
    for sgn in (-1, 1):
        for k in range(2):
            s = sc + sgn * (7.6 + k * 3.4)
            for z0, z1 in ((ZO + 2.4, ZO + 6.0), (ZO + 8.4, ZO + 11.8), (ZO + 14.4, ZO + 16.6)):
                wall.decal(G, [(s - 0.8, z0), (s + 0.8, z0), (s + 0.8, z1), (s - 0.8, z1)], WINDOW)
        for s in (sc + sgn * 6.0, sc + sgn * 12.8):
            proud(G, wall, s - 0.5, s + 0.5, ZO + 1.0, ztop - 1.6, 0.4, STONE_L)
    proud(G, wall, 0, L, SKIRT, ZO + 1.0, 0.4, STONE_D)
    proud(G, wall, 0, L, ztop - 1.6, ztop - 0.9, 0.6, STONE_L)
    # attic loggia: a set-back storey of paired columns in shadow
    ya, yb = (y1 - 5.0, y1 - 1.2) if north else (y0 + 1.2, y0 + 5.0)
    boxz(G, xc - 9.5, ya, xc + 9.5, yb, ztop, ztop + 3.4, STONE, top=STONE_L)
    lw = Wall((xc + 9.5, yb), (xc - 9.5, yb)) if north else Wall((xc - 9.5, ya), (xc + 9.5, ya))
    for k in range(7):
        s = 1.6 + k * 2.6
        lw.decal(G, [(s, ztop + 0.5), (s + 1.4, ztop + 0.5), (s + 1.4, ztop + 2.6), (s, ztop + 2.6)],
                 SHADOW)
    boxz(G, xc - 10.0, ya - 0.3, xc + 10.0, yb + 0.3, ztop + 3.4, ztop + 3.9, STONE_L)
    if dome:
        yd = (y0 + y1) / 2 + (1.0 if north else -1.0)
        lathe(G, (xc, yd, ztop), [(5.2, 0), (5.2, 1.4), (4.9, 2.2), (4.0, 3.6), (2.4, 4.8), (0.9, 5.3),
                                  (0.9, 6.2), (0.3, 6.6), (0.0, 7.4)], STONE_L, segs=16, smooth=True)
    if inner_clock:
        # the clock gable on the inner face, over the stands (Genets photographs)
        yi = y0
        cw = Wall((x0, yi), (x1, yi))                     # faces -Y, into the bowl
        sm = cw.L / 2
        gable = [(sm - 5.0, ztop), (sm + 5.0, ztop), (sm + 4.2, ztop + 2.6), (sm + 2.6, ztop + 4.6),
                 (sm, ztop + 5.4), (sm - 2.6, ztop + 4.6), (sm - 4.2, ztop + 2.6)]
        solid(G, gable, yi + 0.4, yi + 2.2, STONE_L, P=lambda u, v, w: V(x0 + u, w, v))
        disc = [(sm + 2.1 * math.cos(2 * math.pi * k / 16), ztop + 2.3 + 2.1 * math.sin(2 * math.pi * k / 16))
                for k in range(16)]
        G.poly([V(x0 + s, yi + 0.36, z) for s, z in disc], CLOCK, (0, -1, 0))
        for ang, ln in ((math.pi / 2, 1.7), (math.pi / 2 + 0.05, 1.2)):
            G.poly([V(x0 + sm - 0.09, yi + 0.33, ztop + 2.3), V(x0 + sm + 0.09, yi + 0.33, ztop + 2.3),
                    V(x0 + sm + 0.09 + ln * math.cos(ang), yi + 0.33, ztop + 2.3 + ln * math.sin(ang)),
                    V(x0 + sm - 0.09 + ln * math.cos(ang), yi + 0.33, ztop + 2.3 + ln * math.sin(ang))],
                   SHADOW, (0, -1, 0))
        # windows of the inner face, two storeys
        for k in range(6):
            s = 2.4 + k * (cw.L - 4.8) / 5
            if abs(s - sm) < 3.0:
                continue
            for z0, z1 in ((ZT + 0.6, ZT + 2.8), (ztop - 3.8, ztop - 1.8)):
                cw.decal(G, [(s - 0.7, z0), (s + 0.7, z0), (s + 0.7, z1), (s - 0.7, z1)], WINDOW)


def build_estadi():
    s = SITE['estadi-olimpic']
    ens = s['ensemble']
    O = ccw(s['ringEN_m'])
    mem = {m['role']: open_ring(m['pathEN_m']) for m in ens['r155422']['members']}
    I_raw = mem['inner']
    # the arena edge without the south players' tunnel (a 4.5 m x 17 m slot):
    # rays would otherwise shoot down it; the tunnel is drawn as an opening.
    I = [p for p in I_raw if not (-19 < p[0] < -12 and p[1] < -106)]
    pitch = open_ring(s['context']['w35743735']['ringEN_m'])
    roof = open_ring(ens['w126784791']['ringEN_m'])
    G = Geo()

    # arena centre and axis from the mapped pitch
    cx = sum(p[0] for p in pitch) / 4
    cy = sum(p[1] for p in pitch) / 4
    ax = Vector(((pitch[0][0] + pitch[3][0]) / 2 - (pitch[1][0] + pitch[2][0]) / 2,
                 (pitch[0][1] + pitch[3][1]) / 2 - (pitch[1][1] + pitch[2][1]) / 2)).normalized()
    ay = Vector((ax.y, -ax.x))                           # across the pitch (east)
    c = (cx, cy)

    def A(u, v):
        """A point in the arena frame: u along the pitch axis (north), v across (east)."""
        return (cx + ax.x * u + ay.x * v, cy + ax.y * u + ay.y * v)

    # ── the stands: a ray loft between the arena edge and the wall's inner face
    Oin = inset(O, WALL_T)
    K = 120
    rays = []
    for k in range(K):
        th = 2 * math.pi * k / K
        rI = ray_hits(I, c, th)[0]
        rO = ray_hits(Oin, c, th)[0]
        rays.append((th, stand_profile(rI, rO)))
    M = len(rays[0][1])

    def P3(k, j):
        th, prof = rays[k % K]
        r, z, _ = prof[j]
        return V(cx + r * math.cos(th), cy + r * math.sin(th), z)

    # Horizontal faces (treads, concourse) share their vertices round each row:
    # all face +Z, so a shared, smooth-shaded vertex is still a flat tread, and
    # the file loses a vertex pair per tread (the stands are most of the mesh).
    g_flat = G.group()
    for k in range(K):
        th0, prof0 = rays[k]
        thm = th0 + math.pi / K
        rad = Vector((math.cos(thm), math.sin(thm), 0))
        mid = P3(k, 5)
        # the axial stair down the north stand toward the Marathon Gate
        on_stair = abs(((mid.x + P3(k + 1, 5).x) / 2) - (-12.0)) < 3.4 and mid.y > 0
        for j in range(M - 1):
            kind = prof0[j + 1][2]
            q = [P3(k, j), P3(k + 1, j), P3(k + 1, j + 1), P3(k, j + 1)]
            dr = prof0[j + 1][0] - prof0[j][0]
            dz = prof0[j + 1][1] - prof0[j][1]
            hint = rad * (-dz) + Vector((0, 0, dr))
            col = {'w': CONCRETE_L, 'c': CONCRETE, 'r': CONCRETE, 't': SEAT,
                   'R': CONCRETE_L, 'T': SEAT_U}[kind]
            if on_stair and kind in 'rtRT':
                col = STAIR
            G.poly(q, col, hint, g_flat if abs(dz) < 1e-9 else None)
        # vomitories: dark mouths in the concourse's back wall, every seventh bay
        if k % 7 == 3:
            jc = [j for j in range(M - 1) if rays[k][1][j + 1][2] == 'w'][1]
            a, b = P3(k, jc), P3(k + 1, jc)
            inw = -rad * 0.05
            G.poly([a + (b - a) * 0.2 + inw, a + (b - a) * 0.8 + inw,
                    a + (b - a) * 0.8 + inw + V(0, 0, 1.35), a + (b - a) * 0.2 + inw + V(0, 0, 1.35)],
                   SHADOW, -rad)

    # ── arena floor (the track's red all round), infield grass, pitch, lines
    G.poly([P3(k, 0) for k in range(K)], TRACK, (0, 0, 1))

    def stadium_loop(rr, n=20):
        pts = []
        for i in range(n + 1):                        # north bend, east to west
            t = math.pi * i / n
            pts.append(A(42.195 + rr * math.sin(t), rr * math.cos(t)))
        for i in range(n + 1):                        # south bend, west to east
            t = math.pi * i / n
            pts.append(A(-42.195 - rr * math.sin(t), -rr * math.cos(t)))
        return pts
    G.poly([(p[0], p[1], 0.05) for p in stadium_loop(36.5)], GRASS, (0, 0, 1))
    for i in (0, 2, 4, 6, 8):                         # every other lane line, and the outer edge
        strip(G, stadium_loop(36.5 + 1.22 * i, 16), 0.22, 0.09, LINE, closed=True)
    # the pitch, in mowing bands, then its markings
    p00, p01, p11, p10 = pitch[1], pitch[0], pitch[3], pitch[2]   # SW, NW, NE, SE

    def PP(fu, fv):                                   # fu along (S->N), fv across (W->E)
        w0 = (p00[0] + (p01[0] - p00[0]) * fu, p00[1] + (p01[1] - p00[1]) * fu)
        w1 = (p10[0] + (p11[0] - p10[0]) * fu, p10[1] + (p11[1] - p10[1]) * fu)
        return (w0[0] + (w1[0] - w0[0]) * fv, w0[1] + (w1[1] - w0[1]) * fv)
    nb = 10
    for i in range(nb):
        f0, f1 = i / nb, (i + 1) / nb
        G.poly([(*PP(f0, 0), 0.1), (*PP(f0, 1), 0.1), (*PP(f1, 1), 0.1), (*PP(f1, 0), 0.1)],
               GRASS_L if i % 2 else GRASS, (0, 0, 1))
    Lp = (Vector(p01) - Vector(p00)).length
    Wp = (Vector(p10) - Vector(p00)).length
    inset_f = 0.3 / Lp, 0.3 / Wp
    strip(G, [PP(inset_f[0], inset_f[1]), PP(inset_f[0], 1 - inset_f[1]), PP(1 - inset_f[0], 1 - inset_f[1]),
              PP(1 - inset_f[0], inset_f[1])], 0.18, 0.14, LINE, closed=True)
    strip(G, [PP(0.5, inset_f[1]), PP(0.5, 1 - inset_f[1])], 0.18, 0.14, LINE)
    strip(G, [PP(0.5 + 9.15 / Lp * math.cos(2 * math.pi * k / 20), 0.5 + 9.15 / Wp * math.sin(2 * math.pi * k / 20))
              for k in range(20)], 0.18, 0.14, LINE, closed=True)
    for f, sg in ((0.0, 1), (1.0, -1)):              # penalty areas
        fu = f + sg * 16.5 / Lp
        strip(G, [PP(f + sg * inset_f[0], 0.5 - 20.16 / Wp), PP(fu, 0.5 - 20.16 / Wp),
                  PP(fu, 0.5 + 20.16 / Wp), PP(f + sg * inset_f[0], 0.5 + 20.16 / Wp)], 0.18, 0.14, LINE)
        # goals: two posts and a bar, white, on the goal line
        for fv in (0.5 - 3.66 / Wp, 0.5 + 3.66 / Wp):
            q = PP(f + sg * inset_f[0], fv)
            box(G, (q[0], q[1], 1.22), (0.14, 0.14, 2.44), LINE)
        a, b = PP(f + sg * inset_f[0], 0.5 - 3.66 / Wp), PP(f + sg * inset_f[0], 0.5 + 3.66 / Wp)
        strut(G, (a[0], a[1], 2.4), (b[0], b[1], 2.4), 0.14, LINE)

    # the tunnels: dark openings in the front wall on the axis, south and north
    for u in (-1, 1):
        th = math.atan2(ax.y * u, ax.x * u)
        rI = ray_hits(I, c, th)[0]
        base = Vector(A(u * (rI - 0.05), 0))
        G.poly([V(base.x - 3.0 * ay.x, base.y - 3.0 * ay.y, 0.02), V(base.x + 3.0 * ay.x, base.y + 3.0 * ay.y, 0.02),
                V(base.x + 3.0 * ay.x, base.y + 3.0 * ay.y, 1.3), V(base.x - 3.0 * ay.x, base.y - 3.0 * ay.y, 1.3)],
               SHADOW, (-ax.x * u, -ax.y * u, 0))

    # ── the outer wall: thick, with its coping, features on every straight run
    band(G, O, SKIRT, ZF, STONE)
    band(G, Oin, ZT - 0.8, ZF, STONE, inward=True)
    n = len(O)
    for i in range(n):
        a, b = O[i], O[(i + 1) % n]
        ai, bi = Oin[i], Oin[(i + 1) % n]
        G.poly([V(a[0], a[1], ZF), V(b[0], b[1], ZF), V(bi[0], bi[1], ZF), V(ai[0], ai[1], ZF)], STONE_L, (0, 0, 1))
        palace = a[0] < -90 and b[0] < -90 and -80 < a[1] < 56 and -80 < b[1] < 56
        # runs swallowed by the two gate blocks get no features of their own:
        # the blocks' faces stand a few cm proud of them, and a cornice would not
        if all(-27.0 < p[0] < 4.5 and p[1] > 121.0 for p in (a, b)) or                 all(-27.5 < p[0] < -5.5 and p[1] < -147.0 for p in (a, b)):
            continue
        facade_edge(G, a, b, palace=palace)

    # ── WEST: the palace front — central domed pavilion with the Aurigues,
    #    end pavilions, and the lateral tower at the north end
    def west_x(y):
        return -ray_hits(O, (0.0, y), math.pi)[0]
    xw = west_x(0.0)
    boxz(G, xw - 1.8, -9.5, xw + 6.0, 9.5, SKIRT, ZF + 3.5, STONE, top=STONE_L)
    pw = Wall((xw - 1.8, 9.5), (xw - 1.8, -9.5))
    for k in range(3):
        s0 = 2.6 + k * 5.0
        pw.decal(G, arch_outline(s0, s0 + 3.6, ZO + 1.2, ZO + 5.6, 8), SHADOW)
        pw.decal(G, arch_outline(s0 + 0.4, s0 + 3.2, ZO + 9.0, ZO + 14.4, 8), SHADOW)
    for s0 in (1.2, 6.6, 11.6, 17.4):
        proud(G, pw, s0 - 0.5, s0 + 0.5, ZO + 1.0, ZF + 1.6, 0.4, STONE_L)
    proud(G, pw, 0, pw.L, ZF + 1.6, ZF + 2.4, 0.6, STONE_L)
    proud(G, pw, 0, pw.L, SKIRT, ZO + 1.0, 0.4, STONE_D)
    lathe(G, (xw + 3.4, 0.0, ZF + 3.5), [(4.8, 0), (4.8, 1.8), (4.4, 2.8), (3.4, 4.2), (1.8, 5.2), (0.8, 5.5),
                                        (0.8, 6.6), (0.25, 7.0), (0.0, 8.2)], STONE_L, segs=16, smooth=True)
    for y in (-6.8, 6.8):                             # the Aurigues, facing the plaza
        boxz(G, xw - 1.2, y - 1.6, xw + 1.6, y + 1.6, ZF + 3.5, ZF + 4.3, STONE_L)
        G.add(rider(BRONZE, 1.8), place(xw + 1.2, y, ZF + 4.3, yaw=math.pi))
    for y0, y1 in ((-77.0, -66.0), (36.0, 47.0)):     # end pavilions, a storey proud of the arcades
        xa = min(west_x(y0 + 0.5), west_x(y1 - 0.5))
        boxz(G, xa - 0.9, y0, xa + 7.0, y1, SKIRT, ZF + 1.8, STONE, top=STONE_L)
        ew = Wall((xa - 0.9, y1), (xa - 0.9, y0))
        proud(G, ew, 0, ew.L, ZF + 0.9, ZF + 1.8, 0.4, STONE_L)
        for s0 in (2.2, 6.4):
            ew.decal(G, [(s0, ZO + 2.4), (s0 + 2.2, ZO + 2.4), (s0 + 2.2, ZO + 5.6), (s0, ZO + 5.6)], WINDOW)
            ew.decal(G, arch_outline(s0, s0 + 2.2, ZO + 8.2, ZO + 12.4, 6), WINDOW)
    # the lateral tower (the Torre de Marató): square shaft, belfry, lantern
    tx, ty, th_ = west_x(50.0) + 3.6, 50.0, 4.4
    boxz(G, tx - th_, ty - th_, tx + th_, ty + th_, SKIRT, 36.0, STONE, top=STONE_L)
    for sx_, sy_, nx, ny in ((0, -1, 0, -1), (0, 1, 0, 1), (-1, 0, -1, 0), (1, 0, 1, 0)):
        if nx:
            wt = Wall((tx + nx * th_, ty - nx * th_), (tx + nx * th_, ty + nx * th_), (nx, 0))
        else:
            wt = Wall((tx + ny * th_, ty + ny * th_), (tx - ny * th_, ty + ny * th_), (0, ny))
        for z0 in (ZF + 1.0, ZF + 5.5):
            wt.decal(G, arch_outline(3.6, 5.2, z0, z0 + 2.6, 6), WINDOW)
        wt.decal(G, arch_outline(2.6, 6.2, 37.2, 40.2, 8), SHADOW, off=-0.57)
        proud(G, wt, 0, wt.L, 35.4, 36.0, 0.5, STONE_L)
        proud(G, wt, 0, wt.L, ZF - 2.2, ZF - 1.5, 0.55, STONE_L)
    boxz(G, tx - th_ + 0.6, ty - th_ + 0.6, tx + th_ - 0.6, ty + th_ - 0.6, 36.0, 41.6, STONE, top=STONE_L)
    boxz(G, tx - th_ - 0.2, ty - th_ - 0.2, tx + th_ + 0.2, ty + th_ + 0.2, 41.6, 42.3, STONE_L)
    lathe(G, (tx, ty, 42.3), [(2.4, 0), (2.4, 0.5), (2.0, 0.6), (2.0, 3.4), (2.5, 3.6), (2.3, 4.0),
                              (1.2, 4.9), (0.3, 5.3), (0.0, 6.6)], STONE_L, segs=12, smooth=False)

    # ── NORTH: the Porta de Marató block, the Genets, the cauldron
    gate_block(G, -26.3, 3.9, 110.0, 126.75, 126.75, ZF + 4.5, dome=True, inner_clock=True)
    for xg in (-19.6, -4.4):
        yg = 90.0
        boxz(G, xg - 1.5, yg - 2.6, xg + 1.5, yg + 2.6, 0.0, 9.6, STONE, top=STONE_L)
        boxz(G, xg - 1.7, yg - 2.8, xg + 1.7, yg + 2.8, 9.6, 10.0, STONE_L)
        G.add(rider(BRONZE, 1.55), place(xg, yg + 1.5, 10.0, yaw=-math.pi / 2))
    ccx, ccy = s['context']['n11971795971']['pointEN_m']
    lathe(G, (ccx, ccy, SKIRT), [(2.3, 0), (2.1, 10), (1.7, 24), (1.1, 38), (0.7, 45)], STONE_L, segs=10,
          smooth=True, sy=0.55)
    lathe(G, (ccx, ccy, SKIRT + 45), [(0.35, 0), (0.35, 1.6), (3.6, 2.4), (4.2, 3.0), (4.0, 3.2), (0.0, 2.5)],
          SHADOW, segs=14, smooth=False)
    # flagpoles along the north curve, as the photographs show them
    for k in range(9):
        th = math.pi / 2 + (k - 4) * 0.13
        r = ray_hits(O, c, th)[0] - 1.6
        px, py = cx + r * math.cos(th), cy + r * math.sin(th)
        if -28 < px < 6:
            continue
        box(G, (px, py, ZF + 6.0), (0.16, 0.16, 12.0), FLAGPOLE)

    # ── SOUTH: the second axial gate on the outline's south bump
    gate_block(G, -26.8, -6.0, -150.85, -138.0, -150.85, ZF + 3.0, dome=False)

    # ── EAST: the four mapped bumps are pavilions with low hipped roofs
    for y0, y1 in ((-5.18, 8.5), (-38.46, -24.74), (-71.98, -58.14), (28.19, 41.92)):
        xe = max(p[0] for p in O if y0 - 0.5 < p[1] < y1 + 0.5)
        boxz(G, xe - 7.5, y0, xe + 0.15, y1, SKIRT, ZF + 2.0, STONE, top=STONE_L)
        roofp = Geo()
        hx, hy = 4.2, (y1 - y0) / 2 + 0.4
        pts = [V(-hx, -hy, 0), V(hx, -hy, 0), V(hx, hy, 0), V(-hx, hy, 0)]
        ridge = [V(0, -hy + 3.0, 2.4), V(0, hy - 3.0, 2.4)]
        roofp.poly([pts[0], pts[1], ridge[0]], STONE_D, (0, -1, 1))
        roofp.poly([pts[2], pts[3], ridge[1]], STONE_D, (0, 1, 1))
        roofp.poly([pts[1], pts[2], ridge[1], ridge[0]], STONE_D, (1, 0, 1))
        roofp.poly([pts[3], pts[0], ridge[0], ridge[1]], STONE_D, (-1, 0, 1))
        G.add(roofp, place(xe - 3.7, (y0 + y1) / 2, ZF + 2.0))
        ew = Wall((xe + 0.15, y0), (xe + 0.15, y1))
        proud(G, ew, 0, ew.L, ZF + 0.9, ZF + 2.0, 0.4, STONE_L)
        for s0 in (2.0, ew.L - 4.4):
            ew.decal(G, arch_outline(s0, s0 + 2.4, ZO + 1.2, ZO + 5.4, 6), SHADOW)
        ew.decal(G, arch_outline(ew.L / 2 - 1.6, ew.L / 2 + 1.6, ZO + 8.0, ZO + 13.2, 8), SHADOW)

    # ── the main-stand roof (w126784791): slab, transverse trusses, fascia
    ZR = 30.0
    solid(G, roof, ZR, ZR + 1.0, ROOF_UNDER, top=ROOF_TOP, bottom=ROOF_UNDER)
    rr = ccw(roof)
    ys = [-70.0 + 13.3 * i for i in range(10)]
    tops = []
    for y in ys:
        xs = sorted(ray_hits(rr, (-200.0, y), 0.0))
        xb, xf = -200.0 + xs[0] + 1.0, -200.0 + xs[-1] - 0.4
        top_b, top_f = ZR + 8.5, ZR + 2.2
        n_p = 5
        prev = None
        for i in range(n_p + 1):
            t = i / n_p
            x = xb + (xf - xb) * t
            zt = top_b + (top_f - top_b) * t
            if i < n_p:
                strut(G, (x, y, ZR + 1.0), (x, y, zt), 0.35, STEEL, caps=(False, False))
            if prev is not None:
                strut(G, prev, (x, y, zt), 0.55, STEEL)
                strut(G, (prev[0], y, ZR + 1.0), (x, y, zt), 0.3, STEEL, caps=(False, False))
            prev = (x, y, zt)
        tops.append((xb, y, top_b))
        # a column dropping the truss's back onto the wall head
        strut(G, (xb + 0.6, y, ZF), (xb + 0.6, y, ZR), 0.9, STEEL, caps=(False, False))
    for a, b in zip(tops, tops[1:]):
        strut(G, a, b, 0.6, STEEL)
    # the front fascia along the roof's edge over the pitch
    front = [p for p in rr if p[0] > -75]
    front.sort(key=lambda p: p[1])
    for a, b in zip(front, front[1:]):
        strut(G, (a[0], a[1], ZR + 0.5), (b[0], b[1], ZR + 0.5), 0.5, STEEL, d=1.6)

    # ── floodlight masts (mapped nodes on the east stands)
    for key in ('n8690846047', 'n8690846048'):
        mx, my = s['context'][key]['pointEN_m']
        lathe(G, (mx, my, 0), [(0.9, 0), (0.6, 30), (0.45, 52)], STEEL, segs=8, smooth=True)
        ang = math.atan2(cy - my, cx - mx)
        box(G, (mx + 0.8 * math.cos(ang), my + 0.8 * math.sin(ang), 53.5), (1.0, 7.0, 4.0), LAMP, yaw=ang)
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 2. PALAU SANT JORDI — way 35793637 (Arata Isozaki, Mamoru Kawaguchi, 1990)
# ═════════════════════════════════════════════════════════════════════════════
#
# The mapped way is the whole building: a 118 x 145 m base (x -55..63, y
# -68..77) with two entrance pavilions at its north corners and, between them,
# the recess of the entrance portico on the Esplanada; plus a 100 x 58 m wing
# to the south (y -68..-127). Two mapped building:parts give the roof: the
# dome's rim (w146825150, 110 x 132 m — the published 106 x 128 m) and its
# raised skylit crown (w146825159, 50 x 74 m). The roof is lofted between those
# two real outlines on rays from the crown's centre, so its plan is the map's.
#
# SECTION. The published 45 m is the crown over the ARENA floor, which is sunk
# below the Esplanada; from the plaza (the origin's ground) the shell springs
# at ~13 m over a glazed base and a white undulating canopy, and the crown
# stands ~34 m up (photographs from the plaza and from the south). The shell is
# the Pantadome "turtle": steep at the rim, flattening to the crown; the hinge
# lines of its erection are the glass bands — the ring under the rim and the
# strips on the long axis, which run from the rim up to the crown.
#
# THE SOUTH WING stands on the ground below the plaza (the park falls away to
# the south: from the Mirador de Migdia the wing shows a full two storeys under
# the base). Its walls run down to -14 m rather than the usual -8: where the
# real ground is there, a -8 skirt would leave the wing hovering.

def build_palau():
    s = SITE['palau-sant-jordi']
    R = open_ring(s['ringEN_m'])
    Dm = open_ring(s['context']['w146825150']['ringEN_m'])
    Cr = open_ring(s['context']['w146825159']['ringEN_m'])
    G = Geo()
    c = (sum(p[0] for p in Cr) / len(Cr), sum(p[1] for p in Cr) / len(Cr))
    ZS, ZC, ZK = 13.0, 31.0, 34.5         # springing, crown rim, crown top
    ZP = 0.6                               # plaza plinth

    # ── the podium (whole outline), the south wing, the corner pavilions
    solid(G, R, SKIRT, ZP, PALE_D, top=PAVING)
    wing = [(-47.83, -67.8), (-48.98, -125.45), (52.13, -127.26), (53.29, -69.51)]
    solid(G, wing, -14.0, 4.0, PALE, top=PALE_D)
    for a, b in zip(ccw(wing), ccw(wing)[1:] + ccw(wing)[:1]):
        w = Wall(a, b)
        if w.L < 20:
            continue
        for z0 in (-10.0, -5.0, 0.4):
            proud(G, w, 0, w.L, z0 + 2.9, z0 + 3.3, 0.25, WHITE)
            w.decal(G, [(1.0, z0), (w.L - 1.0, z0), (w.L - 1.0, z0 + 2.4), (1.0, z0 + 2.4)], GLASS)
    for x0, x1 in ((-52.78, -30.6), (40.65, 63.18)):
        boxz(G, x0, 68.8, x1, 77.2, SKIRT, 7.2, PALE, top=PALE_D)
        pw = Wall((x1, 77.2), (x0, 77.2))
        pw.decal(G, [(2.0, 1.2), (pw.L - 2.0, 1.2), (pw.L - 2.0, 5.4), (2.0, 5.4)], GLASS)

    # ── rays from the crown's centre to the rim and the crown
    K = 112
    ray = []
    for k in range(K):
        th = 2 * math.pi * k / K
        ray.append((th, ray_hits(Dm, c, th)[0], ray_hits(Cr, c, th)[0]))

    def pt(k, r, z):
        th = ray[k % K][0]
        return V(c[0] + r * math.cos(th), c[1] + r * math.sin(th), z)

    def axis_strip(k):
        """Rays on the long (N-S) axis carry the glass hinge strips."""
        th = ray[k % K][0] + math.pi / K
        return abs(math.cos(th)) < 0.045

    # the glazed base under the canopy, with its mullion fins
    RB = 2.5
    for k in range(K):
        a, b = pt(k, ray[k][1] + RB, 0), pt(k + 1, ray[(k + 1) % K][1] + RB, 0)
        mid = (a + b) / 2
        out = V(mid.x - c[0], mid.y - c[1], 0)
        G.poly([V(a.x, a.y, ZP), V(b.x, b.y, ZP), V(b.x, b.y, 8.2), V(a.x, a.y, 8.2)],
               WHITE if axis_strip(k) else GLASS, out)
        if k % 3 == 0:
            o = out.normalized()
            box(G, (a.x + o.x * 0.25, a.y + o.y * 0.25, (ZP + 8.2) / 2), (0.5, 0.35, 8.2 - ZP), PALE,
                yaw=math.atan2(o.y, o.x))
    # the undulating white canopy: a thin ring, its lip riding a slow wave
    for k in range(K):
        th0, th1 = ray[k][0], ray[(k + 1) % K][0]
        r0, r1 = ray[k][1] + RB - 0.6, ray[(k + 1) % K][1] + RB - 0.6
        s0 = k / K * 2 * math.pi * 7
        s1 = (k + 1) / K * 2 * math.pi * 7
        z0 = 8.4 + 0.75 * math.sin(s0)
        z1 = 8.4 + 0.75 * math.sin(s1)
        a_in, b_in = pt(k, r0, z0), pt(k + 1, r1, z1)
        a_out, b_out = pt(k, r0 + 4.2, z0 - 0.25), pt(k + 1, r1 + 4.2, z1 - 0.25)
        dz = V(0, 0, 0.55)
        out = V(math.cos((th0 + th1) / 2 if k < K - 1 else th0), math.sin((th0 + th1) / 2 if k < K - 1 else th0), 0)
        G.poly([a_in + dz, a_out + dz, b_out + dz, b_in + dz], WHITE, (0, 0, 1))
        G.poly([a_in, b_in, b_out, a_out], PALE_D, (0, 0, -1))
        G.poly([a_out, b_out, b_out + dz, a_out + dz], WHITE, out)
    # the drum between canopy and shell: dark glazed ring, pale cornice band
    for k in range(K):
        r0, r1 = ray[k][1], ray[(k + 1) % K][1]
        a, b = pt(k, r0, 0), pt(k + 1, r1, 0)
        mid = (a + b) / 2
        out = V(mid.x - c[0], mid.y - c[1], 0)
        st = axis_strip(k)
        G.poly([V(a.x, a.y, 8.0), V(b.x, b.y, 8.0), V(b.x, b.y, 11.2), V(a.x, a.y, 11.2)],
               WHITE if st else ZINC_D, out)
        G.poly([V(a.x, a.y, 11.2), V(b.x, b.y, 11.2), V(b.x, b.y, 12.2), V(a.x, a.y, 12.2)],
               WHITE if st else GLASS, out)
        G.poly([V(a.x, a.y, 12.2), V(b.x, b.y, 12.2), V(b.x, b.y, ZS), V(a.x, a.y, ZS)], PALE, out)
    # a lip under the rim of the shell
    for k in range(K):
        r0, r1 = ray[k][1], ray[(k + 1) % K][1]
        G.poly([pt(k, r0, ZS), pt(k + 1, r1, ZS), pt(k + 1, r1 + 0.9, ZS - 0.1), pt(k, r0 + 0.9, ZS - 0.1)],
               PALE, (0, 0, -1))
        G.poly([pt(k, r0, ZS + 0.02), pt(k + 1, r1, ZS + 0.02), pt(k + 1, r1 + 0.9, ZS - 0.08),
                pt(k, r0 + 0.9, ZS - 0.08)], PALE, (0, 0, 1))

    # ── the shell: rim -> crown rim, steep then flattening (the turtle)
    # the first ring is only the thin hinge band of glass; the rest share the slope
    TS = [0.0, 0.025] + [0.025 + 0.975 * i / 10 for i in range(1, 11)]
    J = len(TS) - 1

    def shell_z(t):
        return ZS + (ZC - ZS) * (1 - (1 - t) ** 1.9)

    def shell(k, j):
        th, rD, rC = ray[k % K]
        t = TS[j]
        return pt(k, rD + (rC - rD) * t, shell_z(t)) if j < J else pt(k, rC, ZC)
    gs = G.group()
    for k in range(K):
        st = axis_strip(k)
        for j in range(J):
            q = [shell(k, j), shell(k + 1, j), shell(k + 1, j + 1), shell(k, j + 1)]
            mid = sum(q, Vector()) / 4
            hint = V(mid.x - c[0], mid.y - c[1], 0).normalized() * 0.6 + V(0, 0, 1)
            col = SKYLIGHT if st else (ZINC if k % 2 else ZINC_D)
            if j == 0 and not st:
                col = SKYLIGHT                              # the rim's hinge band of glass
            G.poly(q, col, hint, None if st or j == 0 else gs)
    # the crown: a gentle cap, lighter lattice, with its grid of skylights
    NC = 4

    def crown(k, i):
        th, rD, rC = ray[k % K]
        f = 1 - i / NC
        return pt(k, rC * f, ZC + (ZK - ZC) * (1 - f * f))
    gc = G.group()
    for k in range(K):
        for i in range(NC - 1):
            G.poly([crown(k, i), crown(k + 1, i), crown(k + 1, i + 1), crown(k, i + 1)], CROWN, (0, 0, 1), gc)
        G.poly([crown(k, NC - 1), crown(k + 1, NC - 1), V(c[0], c[1], ZK)], CROWN, (0, 0, 1), gc)

    def crown_z(x, y):
        th = math.atan2(y - c[1], x - c[0])
        rC = ray_hits(Cr, c, th)[0]
        f = math.hypot(x - c[0], y - c[1]) / rC
        return ZC + (ZK - ZC) * (1 - f * f), f
    for i in range(-4, 5):
        for j in range(-7, 8):
            x, y = c[0] + i * 5.2, c[1] + j * 4.9
            z, f = crown_z(x, y)
            if f > 0.86:
                continue
            h = 1.1
            G.poly([V(x + dx, y + dy, crown_z(x + dx, y + dy)[0] + 0.08)
                    for dx, dy in ((-h, -h), (h, -h), (h, h), (-h, h))], SKYLIGHT, (0, 0, 1))
    # the crown's rim ring, a pale hinge line
    for k in range(K):
        a, b = crown(k, 0), crown(k + 1, 0)
        G.poly([a, b, b + V(0, 0, 0.5), a + V(0, 0, 0.5)], PALE, V(a.x - c[0], a.y - c[1], 0))

    # ── the entrance portico in the north recess (x -30.6..40.6, y 68.6..77)
    for i in range(12):
        x = -27.4 + i * 5.9
        box(G, (x, 75.4, (ZP + 8.0) / 2), (0.9, 0.9, 8.0 - ZP), WHITE)
    boxz(G, -29.4, 72.4, 39.2, 76.2, 8.0, 9.4, WHITE)
    G.poly([V(-12.0, 76.23, 8.25), V(22.0, 76.23, 8.25), V(22.0, 76.23, 9.15), V(-12.0, 76.23, 9.15)],
           PALE_D, (0, 1, 0))
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 3. TORRE DE COMUNICACIONS DE MONTJUÏC — way 163393541 (Santiago Calatrava,
#    1989-92; tagged height 136)
# ═════════════════════════════════════════════════════════════════════════════
#
# The mapped way is a 34 m circle: the drum the tower stands on (the brick drum
# the competition required, shelled in white concrete and trencadís).
#
# WHICH WAY IT LEANS. The shaft is inclined 17° from the vertical, "the angle
# of the summer solstice": at Barcelona's latitude the noon sun on 21 June
# stands 72° high, 18° from the zenith, due SOUTH — a shaft pointing at it
# leans south, and photographs agree: looking west along the Esplanada the
# shaft leans left, and seen from the west-north-west with the stadium and the
# Palau behind, it leans right, toward the Palau.
#
# THE TOP, from the same photographs. The shaft (a tapering triangular body,
# spread into a wide heel on the drum) ends in a fork whose two arms carry an
# open ring — a crescent about 28 m across, in the plane square to the shaft,
# its gap facing the fork. The ring therefore reaches back NORTH over the drum,
# and the needle (the gnomon of the sundial) hangs vertically through its
# centre: its foot dangles below the ring and its tip is the tower's 136 m.
# A cross-beam through the needle carries the dishes.

def build_torre():
    s = SITE['torre-calatrava']
    ring = open_ring(s['ringEN_m'])
    cx, cy, R0 = fit_circle(ring)
    G = Geo()
    rnd = Rand(1992)
    lean = math.radians(17.0)
    d = Vector((0, -math.sin(lean), math.cos(lean)))     # shaft axis, leaning south
    u = Vector((1, 0, 0))                                # across the lean (east)
    v = Vector((0, -math.cos(lean), -math.sin(lean)))    # in the lean plane, square to d (south, down)

    # ── the drum, bottom up: the skirt, a dark glazed band under a trencadís
    #    coping, a second dark band, and the fountain's water ring on top, out of
    #    which the shell rises. Each band is a stepped lathe profile, so every
    #    ledge has its top or its underside and nothing is open to the sky.
    lathe(G, (cx, cy, 0), [(R0 + 0.2, SKIRT), (R0 + 0.2, 0.2), (R0 - 0.5, 0.2)], DRUM_STONE, segs=40,
          smooth=False, caps=False)
    lathe(G, (cx, cy, 0), [(R0 - 0.5, 0.2), (R0 - 0.5, 1.2), (R0 + 0.3, 1.2)], DRUM_DARK, segs=40,
          smooth=False, caps=False)
    NT = 48
    for k in range(NT):
        a0, a1 = 2 * math.pi * k / NT, 2 * math.pi * (k + 1) / NT
        rr = R0 + 0.3
        p = [V(cx + rr * math.cos(a0), cy + rr * math.sin(a0), 1.2), V(cx + rr * math.cos(a1), cy + rr * math.sin(a1), 1.2),
             V(cx + rr * math.cos(a1), cy + rr * math.sin(a1), 1.9), V(cx + rr * math.cos(a0), cy + rr * math.sin(a0), 1.9)]
        G.poly(p, TRENCADIS[int(rnd(0, len(TRENCADIS) - 0.001))], (math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0))
    lathe(G, (cx, cy, 0), [(R0 + 0.3, 1.9), (R0 - 1.0, 1.9)], TRENCADIS[0], segs=NT, smooth=False, caps=False)
    lathe(G, (cx, cy, 0), [(R0 - 1.0, 1.9), (R0 - 1.0, 3.0), (R0 - 0.4, 3.0)], DRUM_DARK, segs=40,
          smooth=False, caps=False)
    lathe(G, (cx, cy, 0), [(R0 - 0.4, 3.0), (R0 - 0.4, 3.35), (R0 - 1.1, 3.35), (R0 - 1.1, 3.2)], TRENCADIS[3],
          segs=40, smooth=False, caps=False)
    lathe(G, (cx, cy, 0), [(R0 - 1.1, 3.2), (R0 - 3.4, 3.2)], WATER, segs=40, smooth=False, caps=False)

    # ── the shaft: a rounded triangle, spine to the NORTH, flat belly to the south
    # B: the heel on the drum; T: the fork, ~76 m up, where the shaft splits in two
    B = V(cx, cy + 5.0, 6.0)
    L = (76.0 - B.z) / d.z
    T = B + d * L
    stations = [(0.00, 8.8), (0.025, 7.5), (0.05, 6.5), (0.08, 5.6), (0.12, 4.8), (0.17, 4.1), (0.22, 3.6),
                (0.29, 3.1), (0.36, 2.8), (0.45, 2.5), (0.55, 2.3), (0.65, 2.15), (0.75, 2.05), (0.85, 2.0),
                (0.93, 2.05), (1.00, 2.3)]

    def section(f, rad):
        o = B + d * (L * f)
        pts = []
        for vert in range(3):
            ang = math.pi + vert * 2 * math.pi / 3           # vertex 0 points -v (north, the spine)
            for side in (-1, 1):
                a = ang + side * 0.22
                pts.append(o + (v * math.cos(a) + u * math.sin(a)) * rad * (0.98 if side else 1.0))
        return o, pts
    secs = [section(f, rad) for f, rad in stations]
    for (o0, p0), (o1, p1) in zip(secs, secs[1:]):
        for i in range(6):
            q = [p0[i], p0[(i + 1) % 6], p1[(i + 1) % 6], p1[i]]
            mid = sum(q, Vector()) / 4
            col = TOWER_WHITE if i % 2 else TOWER_SHADE
            G.poly(q, col, mid - (o0 + o1) / 2)
    G.poly(secs[-1][1], TOWER_WHITE, d)

    # ── the shell: trencadís faceting from the drum's rim up to the heel
    o0, foot = secs[0]
    NS = 48
    heel = []
    for k in range(NS):
        # resample the heel's hexagon by angle about its centre
        ang = 2 * math.pi * k / NS
        dirn = Vector((math.cos(ang), math.sin(ang), 0))
        best = None
        for i in range(6):
            a, b = foot[i], foot[(i + 1) % 6]
            # intersect the planar ray from o0 with segment a-b (in XY)
            ex, ey = b.x - a.x, b.y - a.y
            den = dirn.x * ey - dirn.y * ex
            if abs(den) < 1e-9:
                continue
            wx, wy = a.x - o0.x, a.y - o0.y
            t = (wx * ey - wy * ex) / den
            sgm = (wx * dirn.y - wy * dirn.x) / den
            if t > 0 and -1e-6 <= sgm <= 1 + 1e-6:
                best = a + (b - a) * sgm
        heel.append(best)
    rim = [V(cx + (R0 - 3.1) * math.cos(2 * math.pi * k / NS), cy + (R0 - 3.1) * math.sin(2 * math.pi * k / NS), 3.0)
           for k in range(NS)]
    # a middle ring gives the shell its convex, faceted belly
    midr = []
    for k in range(NS):
        m = rim[k] + (heel[k] - rim[k]) * 0.45
        midr.append(V(m.x, m.y, m.z + 1.4))
    for rows in ((rim, midr), (midr, heel)):
        lo, hi = rows
        for k in range(NS):
            q = [lo[k], lo[(k + 1) % NS], hi[(k + 1) % NS], hi[k]]
            mid = sum(q, Vector()) / 4
            G.poly(q, TRENCADIS[int(rnd(0, len(TRENCADIS) - 0.001))], V(mid.x - cx, mid.y - cy, 3.0))

    # ── the ring: a crescent square to the shaft, gap toward the fork
    # The tips sit ~12 m up the axis from the fork and ~9 m either side of it,
    # so the arms make the long V of the photographs; the centre follows.
    Rr = 12.5
    gap = math.radians(46)
    Cc = T + d * 13.0 - v * (Rr * math.cos(gap))
    NR = 52
    rings = []
    for i in range(NR + 1):
        phi = gap + (2 * math.pi - 2 * gap) * i / NR
        fat = max(0.0, math.sin(0.5 * (phi - gap) * math.pi / (math.pi - gap))) ** 0.8  # 0 at tips, 1 opposite
        hw = 0.55 + 1.9 * fat
        ht = 0.55 + 0.75 * fat
        radial = v * math.cos(phi) + u * math.sin(phi)
        ctr = Cc + radial * Rr
        pts = [ctr + radial * hw, ctr + radial * (hw * 0.55) + d * ht, ctr - radial * (hw * 0.45) + d * ht * 1.15,
               ctr - radial * hw, ctr - radial * (hw * 0.4) - d * ht * 0.6, ctr + radial * (hw * 0.5) - d * ht * 0.8]
        rings.append((ctr, pts))
    for (c0, a), (c1, b) in zip(rings, rings[1:]):
        for i in range(6):
            q = [a[i], b[i], b[(i + 1) % 6], a[(i + 1) % 6]]
            mid = sum(q, Vector()) / 4
            G.poly(q, TOWER_WHITE if i in (1, 2) else TOWER_SHADE, mid - (c0 + c1) / 2)
    G.poly(rings[0][1], TOWER_WHITE, rings[0][0] - rings[1][0])
    G.poly(rings[-1][1], TOWER_WHITE, rings[-1][0] - rings[-2][0])
    # the fork: two arms from the shaft's head to the crescent's tips, bowed
    # slightly outward and tapering, as the photographs show them
    for tip in (rings[0][0], rings[-1][0]):
        side = (tip - T).dot(u)
        mid = T + (tip - T) * 0.5 + u * (0.12 * side)
        tube(G, [T - d * 1.5, T + (mid - T) * 0.5, mid, tip], [1.9, 1.5, 1.2, 0.9], TOWER_WHITE, segs=7)
    # the needle, vertical through the ring's centre, and its cross-beam of dishes
    ncx, ncy = Cc.x, Cc.y
    zc = Cc.z
    lathe(G, (ncx, ncy, 0), [(0.0, zc - 17.0), (0.55, zc - 12.0), (1.15, zc - 2.0), (1.2, zc + 1.0),
                             (0.95, zc + 12.0), (0.55, zc + 28.0), (0.22, 128.0), (0.06, 136.0)],
          TOWER_WHITE, segs=12, smooth=True, caps=False)
    for sg in (-1, 1):
        p_ring = Cc + u * (sg * Rr)
        strut(G, V(ncx, ncy, zc), p_ring, 0.7, TOWER_WHITE, d=0.9)
        for f in (0.45, 0.75):
            q = V(ncx, ncy, zc) + (p_ring - V(ncx, ncy, zc)) * f
            dish = Geo()
            lathe(dish, (0, 0, 0), [(0.0, 0.0), (0.9, 0.25), (1.3, 0.6)], TOWER_SHADE, segs=10, smooth=False,
                  caps=True)
            G.add(dish, Matrix.Translation(q + V(0, 0, -1.0)) @ Matrix.Rotation(sg * math.pi / 2, 4, 'Y'))
    # a slender tie from the needle's foot back to the shaft (the photographs' thin stay)
    strut(G, V(ncx, ncy, zc - 14.0), T - d * 4.0, 0.35, TOWER_SHADE)
    return G


# ── Preview rings: the kit reads `ringEN_m` from the entry and its ensemble. ──
# The grandstand multipolygon carries `members` instead, so the preview gets a
# flattened copy: its inner ring (the arena edge) and, for the stadium and the
# Palau, the context outlines the models are fitted to (pitch; roof parts).

def preview_site():
    import copy
    P = copy.deepcopy(SITE)
    e = P['estadi-olimpic']
    ens = {}
    for k, v in e['ensemble'].items():
        if 'ringEN_m' in v:
            ens[k] = v
        else:
            for i, m in enumerate(v['members']):
                if m['role'] == 'inner':
                    ens[f'{k}-{i}'] = {'ringEN_m': m['pathEN_m']}
    ens['w35743735'] = e['context']['w35743735']
    e['ensemble'] = ens
    p = P['palau-sant-jordi']
    p['ensemble'] = {k: p['context'][k] for k in ('w146825150', 'w146825159')}
    return P


BUILDERS = {
    'estadi-olimpic': (build_estadi, 'estadi-olimpic', 180),
    'palau-sant-jordi': (build_palau, 'palau-sant-jordi', 90),
    'torre-calatrava': (build_torre, 'torre-calatrava', 0),
}


run(BUILDERS, preview_site(), BUDGET, OUT_DIR)
