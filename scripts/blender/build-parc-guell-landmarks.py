# ─── build-parc-guell-landmarks.py ────────────────────────────────────────────
# Authors seven Parc Güell landmarks as GLB, for the 3D city context.
#
#   C:\tools\blender-4.5.12-windows-x64\blender.exe -b -P scripts/blender/build-parc-guell-landmarks.py
#
#   env LANDMARKS_ONLY=sala-hipostila,escalinata-drac   build a subset
#   env LANDMARKS_PREVIEW=<dir>                         also render a 2x2 preview sheet per model
#
# THE FRAME IS THE CONTRACT (see build-ciutadella-landmarks.py). Every model is
# authored in the frame of its entry in parc_guell_landmarks_site.json: origin
# at the entry's `centroid`, +X EAST, +Y NORTH, Z up. The app places each GLB at
# that centroid with no rotation and no scale, and sets z = 0 to the terrain it
# samples THERE, at the origin only.
#
# PARC GÜELL IS A HILLSIDE, and that changes two things against the Ciutadella:
#   • Every ground-touching solid runs down to z = -6 m (a hidden foundation
#     skirt), because the terrain under a model is not flat at its origin height.
#   • The ensemble has real level changes — the dragon stair climbs 45 risers
#     from the gate to the Sala Hipòstila, and the Plaça de la Natura is a
#     terrace 8.5 m above the Sala's floor. Those levels are fixed ONCE, as
#     absolute heights (Levels, below), and converted into each frame through
#     the terrain height the app samples at that frame's origin (GROUND, the
#     same terrarium z15 tiles the app reads). So the stair's last step meets
#     the Sala's floor although the two GLBs are placed independently.
#
# HOW GEOMETRY IS MADE: as in the Ciutadella script — explicit polygons with an
# outward hint each, accumulated in one `Geo` per model; sub-assemblies (a
# column, the salamander, a cross) are built at the origin and placed by a
# matrix applied to their vertex data. No textures: trencadís is per-face vertex
# colour drawn from a deterministic `Rand`, so a build is reproducible.

import bpy  # noqa: F401 — run inside Blender, like the Ciutadella script
import json
import math
import os
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmark_kit import *  # noqa: E402,F401,F403 — Geo, solids, export, run

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
SITE = json.load(open(os.path.join(HERE, 'parc_guell_landmarks_site.json'), encoding='utf-8'))
OUT_DIR = os.path.join(REPO, 'public', 'models', 'landmarks')

# Triangle budget per landmark. A build over budget fails.
BUDGET = {
    'sala-hipostila': 30000,
    'escalinata-drac': 20000,
    'casa-del-guarda': 15000,
    'pavello-consergeria': 15000,
    'casa-museu-gaudi': 12000,
    'turo-tres-creus': 8000,
    'portic-bugadera': 12000,
}

EARTH_R = 6378137.0     # the site file's equirectangular radius
SKIRT = -6.0            # hidden foundation depth on the hillside


# ── Levels ───────────────────────────────────────────────────────────────────
#
# GROUND: the terrain height (m) the app samples at each model's origin
# (terrarium z15, bilinear). The consergeria's value is at ITS footprint's
# centroid, not at the site entry's (see section 4).
GROUND = {
    'sala-hipostila': 154.4,
    'escalinata-drac': 151.3,
    'casa-del-guarda': 148.4,
    'pavello-consergeria': 149.0,
    'casa-museu-gaudi': 158.6,
    'turo-tres-creus': 167.3,
    'portic-bugadera': 157.5,
}
# The stair: 4 flights a side, mapped as highway=steps with step_count 11, 11,
# 11, 12 — 45 risers. 0.14 m risers (the stair is famously gentle) put the Sala
# floor 6.3 m over the forecourt, which the terrain samples (gate 148.6, stair
# top 152.1, plaza's far edge 162.4) bracket well.
RISER = 0.14
Z_GATE = 148.5                    # forecourt between the two pavilions
Z_SALA = Z_GATE + 45 * RISER      # Sala Hipòstila floor, 154.8
SALA_H = 8.5                      # floor to the plaza's surface (6 m columns + vault)


def local_z(asset, z_abs):
    return z_abs - GROUND[asset]


# ── Palette (linear RGB) ─────────────────────────────────────────────────────

STONE = (0.40, 0.26, 0.13)        # the park's ochre-brown rubble (Montjuïc-like)
STONE_D = (0.29, 0.18, 0.09)
STONE_L = (0.52, 0.36, 0.19)
PAVING = (0.46, 0.38, 0.27)
SAND = (0.60, 0.50, 0.34)         # the plaza's fine gravel
ROCK = (0.28, 0.21, 0.13)
COLUMN = (0.60, 0.56, 0.48)       # mortar-and-rubble "marble"
COLUMN_D = (0.50, 0.46, 0.39)
CEIL = (0.78, 0.76, 0.70)
WATER = (0.06, 0.20, 0.22)
FALL = (0.50, 0.66, 0.70)
SHADOW = (0.05, 0.04, 0.03)
PLANTED = (0.10, 0.20, 0.06)
EARTH = (0.36, 0.27, 0.16)

T_WHITE = (0.84, 0.83, 0.79)      # trencadís
T_CREAM = (0.76, 0.68, 0.50)
T_BLUE = (0.07, 0.20, 0.55)
T_LBLUE = (0.32, 0.52, 0.72)
T_GREEN = (0.10, 0.36, 0.10)
T_LGREEN = (0.30, 0.52, 0.15)
T_OCHRE = (0.68, 0.42, 0.08)
T_YELLOW = (0.85, 0.64, 0.10)
T_ORANGE = (0.80, 0.30, 0.04)
T_RED = (0.55, 0.06, 0.04)
T_BROWN = (0.30, 0.14, 0.06)

PINK = (0.74, 0.36, 0.31)         # Casa Museu's stucco
PINK_D = (0.58, 0.25, 0.21)
TRIM = (0.78, 0.72, 0.62)
TILE_RED = (0.36, 0.11, 0.06)
WINDOW = (0.03, 0.035, 0.04)
IRON = (0.05, 0.06, 0.05)

MIX_BENCH = [(T_WHITE, 5), (T_CREAM, 2), (T_BLUE, 1.2), (T_LBLUE, 1.0), (T_GREEN, 1.2),
             (T_OCHRE, 1.0), (T_RED, 0.6), (T_YELLOW, 0.6)]
MIX_SEAT = [(T_WHITE, 6), (T_CREAM, 3), (T_LBLUE, 0.6), (T_OCHRE, 0.4)]
MIX_DRAC = [(T_GREEN, 3), (T_LGREEN, 2), (T_BLUE, 2), (T_LBLUE, 1.5), (T_YELLOW, 1.5),
            (T_ORANGE, 1.2), (T_WHITE, 0.6)]
MIX_ROOF_ACCENT = [(T_BROWN, 5), (T_OCHRE, 3), (T_RED, 0.6), (T_GREEN, 0.4), (T_BLUE, 0.4)]


def jit(c, rnd, a=0.08):
    f = 1.0 + rnd(-a, a)
    return (c[0] * f, c[1] * f, c[2] * f)


def pick(rnd, table):
    x = rnd(0.0, sum(w for _, w in table))
    for c, w in table:
        x -= w
        if x <= 0:
            return jit(c, rnd, 0.06)
    return table[-1][0]


def rubble(rnd, base=STONE):
    """Rubble stone: each face its own stone, a few darker and lighter ones."""
    r = rnd()
    if r < 0.18:
        base = STONE_D
    elif r > 0.85:
        base = STONE_L
    return jit(base, rnd, 0.12)


# ── 2D helpers ───────────────────────────────────────────────────────────────

def join_paths(paths):
    out = []
    for p in paths:
        for q in p:
            q = (q[0], q[1])
            if not out or math.dist(out[-1], q) > 1e-6:
                out.append(q)
    return out


def nearest(pts, q):
    return min(range(len(pts)), key=lambda i: math.dist(pts[i], q))


def clip_half(poly, a, b, c):
    """Sutherland–Hodgman: keep the part of `poly` where a*x + b*y <= c."""
    out = []
    n = len(poly)
    for i in range(n):
        P, Q = poly[i], poly[(i + 1) % n]
        fp = a * P[0] + b * P[1] - c
        fq = a * Q[0] + b * Q[1] - c
        if fp <= 0:
            out.append(P)
        if fp * fq < 0:
            t = fp / (fp - fq)
            out.append((P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t))
    return out


def clip_line(poly, p, q, keep):
    """Keep the side of the line p->q that the point `keep` is on."""
    a, b = q[1] - p[1], -(q[0] - p[0])
    c = a * p[0] + b * p[1]
    if a * keep[0] + b * keep[1] - c > 0:
        a, b, c = -a, -b, -c
    return clip_half(poly, a, b, c)


def centroid(r):
    r = open_ring(r)
    return (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))


def principal_axis(r):
    cx, cy = centroid(r)
    sxx = sum((p[0] - cx) ** 2 for p in r)
    syy = sum((p[1] - cy) ** 2 for p in r)
    sxy = sum((p[0] - cx) * (p[1] - cy) for p in r)
    a = 0.5 * math.atan2(2 * sxy, sxx - syy)
    return (math.cos(a), math.sin(a))


def resample(ring, step, closed=True):
    r = open_ring(ring) if closed else list(ring)
    n = len(r)
    out = []
    for i in range(n if closed else n - 1):
        a, b = r[i], r[(i + 1) % n]
        L = math.dist(a, b)
        k = max(1, int(round(L / step)))
        for j in range(k):
            t = j / k
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    if not closed:
        out.append(tuple(r[-1]))
    return out


def chaikin(path, it=2):
    P = [tuple(p) for p in path]
    for _ in range(it):
        Q = [P[0]]
        for a, b in zip(P, P[1:]):
            Q.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            Q.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        Q.append(P[-1])
        P = Q
    return P


def frame_offset(latlon0, latlon1):
    """Metres (east, north) of latlon1 in the frame centred on latlon0 —
    the same equirectangular the site file uses."""
    la0, lo0 = latlon0
    la1, lo1 = latlon1
    return ((lo1 - lo0) * math.pi / 180 * EARTH_R * math.cos(math.radians(la0)),
            (la1 - la0) * math.pi / 180 * EARTH_R)


def add2(p, q, k=1.0):
    return (p[0] + q[0] * k, p[1] + q[1] * k)


# ── Solids and sweeps ────────────────────────────────────────────────────────

def prism_z(G, ring, zb, zt, col, top=None):
    """Extrude a ring from zb to zt; either may be a number or f(x, y). `col`
    is a colour or f(edge index); the top cap is planar only when zt is."""
    r = ccw(ring)
    n = len(r)
    fb = zb if callable(zb) else (lambda x, y: zb)
    ft = zt if callable(zt) else (lambda x, y: zt)
    for i in range(n):
        a, b = r[i], r[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        if math.hypot(dx, dy) < 1e-6:
            continue
        c = col(i) if callable(col) else col
        G.poly([V(a[0], a[1], fb(*a)), V(b[0], b[1], fb(*b)), V(b[0], b[1], ft(*b)),
                V(a[0], a[1], ft(*a))], c, (dy, -dx, 0))
    if top is not None:
        G.poly([V(x, y, ft(x, y)) for x, y in r], top, (0, 0, 1))


def path_frames(path, closed=False):
    """Per vertex: point, unit right-hand normal (mitered), miter length factor."""
    n = len(path)

    def nrm(p, q):
        dx, dy = q[0] - p[0], q[1] - p[1]
        L = math.hypot(dx, dy) or 1.0
        return (dy / L, -dx / L)
    out = []
    for i in range(n):
        if closed:
            a, b, c = path[i - 1], path[i], path[(i + 1) % n]
        else:
            a, b, c = path[max(i - 1, 0)], path[i], path[min(i + 1, n - 1)]
        n1 = nrm(a, b) if math.dist(a, b) > 1e-9 else nrm(b, c)
        n2 = nrm(b, c) if math.dist(b, c) > 1e-9 else n1
        mx, my = n1[0] + n2[0], n1[1] + n2[1]
        L = math.hypot(mx, my)
        if L < 1e-6:
            mx, my, L = n1[0], n1[1], 1.0
        mx, my = mx / L, my / L
        k = 1.0 / max(mx * n1[0] + my * n1[1], 0.5)
        out.append((b, (mx, my), k))
    return out


def sweep(G, path, prof, colfn, closed=False, z=0.0, caps=True, skip=()):
    """Sweep a closed CCW profile [(o, h)] — o along the path's right-hand
    normal, h up — along a 2D path. `prof` may be one list or one per vertex;
    `z` a number or one base height per vertex. colfn(seg, edge) -> colour."""
    F = path_frames(path, closed)
    n = len(path)
    zs = z if isinstance(z, (list, tuple)) else [z] * n
    profs = prof if isinstance(prof[0], (list, tuple)) and isinstance(prof[0][0], (list, tuple)) \
        else [prof] * n
    rings = []
    for (p, (nx, ny), k), zz, pr in zip(F, zs, profs):
        rings.append([V(p[0] + nx * o * k, p[1] + ny * o * k, zz + h) for o, h in pr])
    m = len(profs[0])
    segs = n if closed else n - 1
    for i in range(segs):
        i2 = (i + 1) % n
        A, B = rings[i], rings[i2]
        nx = F[i][1][0] + F[i2][1][0]
        ny = F[i][1][1] + F[i2][1][1]
        L = math.hypot(nx, ny) or 1.0
        nx, ny = nx / L, ny / L
        pr = profs[i]
        for j in range(m):
            if j in skip:
                continue
            j2 = (j + 1) % m
            do = pr[j2][0] - pr[j][0]
            dh = pr[j2][1] - pr[j][1]
            G.poly([A[j], B[j], B[j2], A[j2]], colfn(i, j), V(nx * dh, ny * dh, -do))
    if caps and not closed:
        t0 = Vector((path[1][0] - path[0][0], path[1][1] - path[0][1], 0))
        t1 = Vector((path[-1][0] - path[-2][0], path[-1][1] - path[-2][1], 0))
        G.poly(rings[0], colfn(-1, -1), -t0)
        G.poly(rings[-1], colfn(-1, -1), t1)


def lathe_c(G, c, prof, colfn, segs=12, phase=0.0, sx=1.0, sy=1.0, smooth=False, caps=True):
    """The kit's lathe with a colour per face: colfn(band, seg)."""
    c = Vector(c)
    g = G.group() if smooth else None
    ring = [(math.cos(phase + 2 * math.pi * k / segs), math.sin(phase + 2 * math.pi * k / segs))
            for k in range(segs)]

    def pt(d, r, z):
        return V(c.x + d[0] * r * sx, c.y + d[1] * r * sy, c.z + z)
    for i in range(len(prof) - 1):
        (r0, z0), (r1, z1) = prof[i], prof[i + 1]
        for k in range(segs):
            a, b = ring[k], ring[(k + 1) % segs]
            m = Vector((a[0] + b[0], a[1] + b[1], 0)).normalized()
            hint = Vector((m.x * (z1 - z0), m.y * (z1 - z0), -(r1 - r0)))
            if r0 < 1e-6:
                pts = [pt(a, 0, z0), pt(a, r1, z1), pt(b, r1, z1)]
            elif r1 < 1e-6:
                pts = [pt(a, r0, z0), pt(b, r0, z0), pt(a, 0, z1)]
            else:
                pts = [pt(a, r0, z0), pt(b, r0, z0), pt(b, r1, z1), pt(a, r1, z1)]
            G.poly(pts, colfn(i, k), hint, g)
    if caps:
        if prof[0][0] > 1e-6:
            G.poly([pt(d, prof[0][0], prof[0][1]) for d in ring], colfn(-1, 0), (0, 0, -1))
        if prof[-1][0] > 1e-6:
            G.poly([pt(d, prof[-1][0], prof[-1][1]) for d in ring], colfn(-1, 1), (0, 0, 1))


def disc(G, c, r, cols, n=12, down=False, rays=0):
    """A flat rosette: concentric rings (cols[0] outermost) and optional rays."""
    k = len(cols)
    hint = (0, 0, -1) if down else (0, 0, 1)
    for j, col in enumerate(cols):
        r0 = r * (1 - j / k)
        r1 = r * (1 - (j + 1) / k)
        for i in range(n):
            a0 = 2 * math.pi * i / n
            a1 = 2 * math.pi * (i + 1) / n
            cc = col if not (rays and j == 0 and i % 2) else cols[-1]
            G.poly([V(c[0] + r0 * math.cos(a0), c[1] + r0 * math.sin(a0), c[2]),
                    V(c[0] + r0 * math.cos(a1), c[1] + r0 * math.sin(a1), c[2]),
                    V(c[0] + r1 * math.cos(a1), c[1] + r1 * math.sin(a1), c[2]),
                    V(c[0] + r1 * math.cos(a0), c[1] + r1 * math.sin(a0), c[2])], cc, hint)


def cross4(G, c, h, w, col, arms='up'):
    """Gaudí's four-armed (3D) cross: a shaft of height h on c and two bars
    through its head, one E-W and one N-S. arms='flat' lays the whole cross
    down so its four arms point to the cardinal points."""
    x, y, z = c
    if arms == 'up':
        box(G, (x, y, z + h / 2), (w, w, h), col)
        zc = z + h * 0.68
        box(G, (x, y, zc), (h * 0.55, w, w), col)
        box(G, (x, y, zc), (w, h * 0.55, w), col)
    else:
        box(G, (x, y, z), (h, w, w), col)
        box(G, (x, y, z), (w, h, w), col)
        box(G, (x, y, z), (w, w, h * 0.45), col)


# ═════════════════════════════════════════════════════════════════════════════
# THE DRAGON STAIR'S LAYOUT — shared by the Sala (its floor's notch) and the
# Escalinata (everything else), both in the ESCALINATA's frame.
# ═════════════════════════════════════════════════════════════════════════════
#
# WHICH WAY IT CLIMBS. The eight mapped flights (highway=steps, drawn in their
# `incline=up` direction) come in mirror pairs: 11+11 at the bottom, 11+11,
# 11+11 either side of El Drac, and 12+12 at the top. The centres of the four
# pairs lie on one line, bearing ~318° (NW), through El Drac's own outline, and
# the same line passes between the two gate pavilions and through the right-
# angled corner of the serpentine bench. That line is the stair's axis. The two
# top flights split at 45° (one due W, one due N) and run along the Sala's S and
# E faces up to its floor — so the stair meets the Sala at its corner.

FLIGHT_PAIRS = [('w451140325', 'w451140333'), ('w451140330', 'w451140323'),
                ('w451140328', 'w451140331'), ('w451140324', 'w451140329')]
FLIGHT_HW = 1.25       # half-width of a flight, m


def stair_layout():
    ctx = SITE['escalinata-drac']['context']
    mids = []
    for a, b in FLIGHT_PAIRS:
        pa, pb = ctx[a]['ringEN_m'], ctx[b]['ringEN_m']
        mids.append(((pa[0][0] + pa[-1][0] + pb[0][0] + pb[-1][0]) / 4,
                     (pa[0][1] + pa[-1][1] + pb[0][1] + pb[-1][1]) / 4))
    ax = principal_axis(mids)
    if (mids[-1][0] - mids[0][0]) * ax[0] + (mids[-1][1] - mids[0][1]) * ax[1] < 0:
        ax = (-ax[0], -ax[1])
    d = ax
    lft = (-d[1], d[0])
    cx = sum(m[0] for m in mids) / 4
    cy = sum(m[1] for m in mids) / 4
    z = local_z('escalinata-drac', Z_GATE)
    flights = []
    levels = [z]
    for k, pair in enumerate(FLIGHT_PAIRS):
        n = int(ctx[pair[0]]['tags']['step_count'])
        for w in pair:
            A = tuple(ctx[w]['ringEN_m'][0])
            B = tuple(ctx[w]['ringEN_m'][-1])
            L = math.dist(A, B)
            e = ((B[0] - A[0]) / L, (B[1] - A[1]) / L)
            p = (e[1], -e[0])
            m = ((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)
            # inner = toward the axis (for the diverging top pair: toward the Sala)
            s = (m[0] - cx) * d[0] + (m[1] - cy) * d[1]
            foot = (cx + d[0] * s, cy + d[1] * s)
            if (foot[0] - m[0]) * p[0] + (foot[1] - m[1]) * p[1] < 0:
                p = (-p[0], -p[1])
            side = 1 if (m[0] - foot[0]) * lft[0] + (m[1] - foot[1]) * lft[1] > 0 else -1
            flights.append(dict(id=w, A=A, B=B, e=e, inner=p, n=n, z0=z, level=k, side=side,
                                bin=add2(A, p, FLIGHT_HW), bout=add2(A, p, -FLIGHT_HW),
                                tin=add2(B, p, FLIGHT_HW), tout=add2(B, p, -FLIGHT_HW)))
        z += n * RISER
        levels.append(z)
    F = {}
    for f in flights:
        F[(f['level'], 'L' if f['side'] > 0 else 'R')] = f
    # the corner of the Sala's plinth: where the top flights' inner edges meet
    fl, fr = F[(3, 'L')], F[(3, 'R')]
    p1, e1 = fl['bin'], fl['e']
    p2, e2 = fr['bin'], fr['e']
    den = e1[0] * e2[1] - e1[1] * e2[0]
    t = ((p2[0] - p1[0]) * e2[1] - (p2[1] - p1[1]) * e2[0]) / den
    corner = (p1[0] + e1[0] * t, p1[1] + e1[1] * t)
    return dict(d=d, l=lft, F=F, levels=levels, corner=corner, centre=(cx, cy))


def drac_in_sala():
    return frame_offset(SITE['sala-hipostila']['centroid'], SITE['escalinata-drac']['centroid'])


# ═════════════════════════════════════════════════════════════════════════════
# 1. SALA HIPÒSTILA + PLAÇA DE LA NATURA — relation 14718227
# ═════════════════════════════════════════════════════════════════════════════
#
# WHAT THE MAPPED RELATION IS. r14718227 (building=yes, historic=yes) is a thin
# band: its outer ring runs ~0.5–1 m outside the serpentine bench, then comes
# back along the bench ways themselves (w1105836969, w1105836965 — the 271-point,
# 150 m serpentine — and w1105836970). So its outer side is the edge of the
# terrace and the bench line is the bench, both followed exactly here. OSM maps
# the Sala itself (r14718228, indoor, level 0) as the area inside the long bench
# ring, and the rest of the square (w1105836977, the pedestrian area) runs on NW
# into the hillside: the terrace polygon is the relation's outer side closed
# round the far end of that pedestrian area.
#
# THE HALL. The bench's two long straight runs — y ≈ -17 (S) and x ≈ +17 (E),
# ~30 m each and square to each other — are the Sala's cornice. The hall is a
# 10 × 9 grid of Doric columns (6 m, Ø1.2 m) minus the four where the large
# ceiling "suns" are: 86. The perimeter columns on the two open faces (S and E,
# toward the stair) lean outward; the W and N sides are the terrace's fill.
# The floor is Z_SALA; the plaza 8.5 m above it; the bench on top.

SALA_XS = [14.6 - 2.9 * i for i in range(10)]
SALA_YS = [-14.6 + 3.05 * j for j in range(9)]
SALA_XW = SALA_XS[-1] - 1.5          # hall's W wall (fill face)
SALA_YN = SALA_YS[-1] + 1.5          # hall's N wall
SALA_MISSING = {(3, 3), (6, 3), (3, 5), (6, 5)}
SALA_LEAN = math.radians(7.5)


def sala_geometry():
    s = SITE['sala-hipostila']
    ens = s['ensemble']
    # members 0..2 are the relation's outer side (N end -> E -> S -> SW end)
    outer = join_paths([m['pathEN_m'] for m in s['members'][:3]])
    bench = join_paths([ens[k]['ringEN_m'] for k in ('w1105836969', 'w1105836965', 'w1105836970')])
    ped = open_ring(ens['w1105836977']['ringEN_m'])
    i0, i1 = nearest(ped, bench[0]), nearest(ped, bench[-1])
    T = outer + [tuple(ped[i]) for i in range(i0, i1 - 1, -1)]
    return outer, bench, T, len(outer)


def sala_column():
    C = Geo()
    # the trencadís skirt to 1.8 m: one white, smooth — a per-face mosaic here
    # would split every vertex of 86 columns for a detail too small to read
    lathe(C, (0, 0, 0), [(0.62, 0.0), (0.60, 1.8)], T_WHITE, segs=10, smooth=True, caps=False)
    lathe_c(C, (0, 0, 0), [(0.60, 1.8), (0.55, 4.9), (0.52, 5.05), (0.58, 5.15), (0.80, 5.5),
                           (0.84, 5.62)], lambda i, k: COLUMN if i < 2 else COLUMN_D,
            segs=10, smooth=True, caps=False)
    octo = [(0.95 * math.cos(math.pi / 8 + k * math.pi / 4), 0.95 * math.sin(math.pi / 8 + k * math.pi / 4))
            for k in range(8)]
    solid(C, octo, 5.62, 5.95, COLUMN_D, caps=(True, False))
    return C


def build_sala():
    outer, bench, T, n_outer = sala_geometry()
    G = Geo()
    rnd = Rand(1907)
    ZF = local_z('sala-hipostila', Z_SALA)
    ZC = ZF + 6.6
    ZP = ZF + SALA_H
    XW, YN = SALA_XW, SALA_YN

    # ── the floor slab: the hall plus the level paths along its two open faces,
    # notched where the stair's top landing and top flights come up
    st = stair_layout()
    ox, oy = drac_in_sala()
    fl, fr = st['F'][(3, 'L')], st['F'][(3, 'R')]
    cx_, cy_ = st['corner'][0] + ox, st['corner'][1] + oy
    y_path = min(fl['bout'][1], fl['tout'][1]) + oy - 0.55    # S path's outer edge (beyond the wall)
    x_top = fl['B'][0] + ox - 0.2                             # where the W-bound flight arrives
    x_path = max(fr['bout'][0], fr['tout'][0]) + ox + 0.55
    y_top = fr['B'][1] + oy - 0.2
    # the corner itself is hollowed into the Odeon bench's niche (section 2)
    niche = [(x + ox, y + oy) for x, y in odeon_arc(st['corner'], ODEON_R)]
    notch = ([(XW, y_path), (x_top, y_path), (x_top, cy_)] + niche
             + [(cx_, y_top), (x_path, y_top), (x_path, YN), (XW, YN)])
    prism_z(G, notch, SKIRT, ZF, lambda i: rubble(rnd), top=PAVING)

    # ── the fill behind the hall (W and N of it) and the roof slab over it
    fill_w = clip_half(T, 1, 0, XW)
    fill_n = clip_half(clip_half(T, -1, 0, -XW), 0, -1, -YN)
    roof = clip_half(clip_half(T, -1, 0, -XW), 0, 1, YN)
    for P in (fill_w, fill_n):
        masonry(G, P, ZP - 0.55, rnd, z0=ZF, course=1.6)
    prism_z(G, roof, ZC, ZP - 0.55, lambda i: rubble(rnd, STONE_L))
    G.poly([V(x, y, ZC) for x, y in ccw(roof)], CEIL, (0, 0, -1))
    # cornice band under the bench: white trencadís along the relation's outer
    # side, plain stone round the far (hillside) end
    Tr = ccw(T)
    on_outer = set(outer)

    def cornice(i):
        if Tr[i] in on_outer and Tr[(i + 1) % len(Tr)] in on_outer:
            return pick(rnd, [(T_WHITE, 6), (T_CREAM, 2), (T_OCHRE, 1)])
        return rubble(rnd)
    prism_z(G, Tr, ZP - 0.55, ZP, cornice)
    # the plaza's surface
    G.poly([V(x, y, ZP) for x, y in ccw(T)], SAND, (0, 0, 1))

    # ── the 86 columns; the S and E perimeter rows lean outward
    col = sala_column()
    tops = {}
    for i, x in enumerate(SALA_XS):
        for j, y in enumerate(SALA_YS):
            lx = SALA_LEAN if i == 0 else 0.0          # E row: top toward +x
            ly = SALA_LEAN if j == 0 else 0.0          # S row: top toward -y
            M = (Matrix.Translation((x, y, ZF)) @ Matrix.Rotation(ly, 4, 'X')
                 @ Matrix.Rotation(lx, 4, 'Y'))
            tops[(i, j)] = M @ Vector((0, 0, 5.95))
            if (i, j) not in SALA_MISSING:
                G.add(col, M)
    # architraves along both grid directions, springing from the (leaning) tops
    zb = ZF + 5.95 + 0.325
    for j in range(len(SALA_YS)):
        a, b = tops[(len(SALA_XS) - 1, j)], tops[(0, j)]
        strut(G, (a.x - 0.5, a.y, zb), (b.x + 0.5, b.y, zb), 0.7, COLUMN_D, d=0.65)
    for i in range(len(SALA_XS)):
        a, b = tops[(i, 0)], tops[(i, len(SALA_YS) - 1)]
        strut(G, (a.x, a.y - 0.5, zb), (b.x, b.y + 0.5, zb), 0.7, COLUMN_D, d=0.65)
    # the four large suns where columns were left out, fourteen small ones between
    for (i, j) in sorted(SALA_MISSING):
        disc(G, (SALA_XS[i], SALA_YS[j], ZF + 5.93), 1.55,
             [T_YELLOW, T_ORANGE, T_WHITE, T_BLUE], n=12, down=True, rays=1)
    small = [(1, 1), (1, 4), (1, 7), (2, 2), (4, 1), (4, 6), (5, 3), (5, 7), (7, 1), (7, 4),
             (7, 6), (8, 2), (8, 5), (2, 6)]
    for i, j in small:
        x = (SALA_XS[i] + SALA_XS[i + 1]) / 2
        y = (SALA_YS[j] + SALA_YS[j + 1]) / 2 if j + 1 < len(SALA_YS) else SALA_YS[j]
        disc(G, (x, y, ZC - 0.02), 0.6, [pick(rnd, MIX_BENCH), T_WHITE], n=8, down=True)

    # ── the serpentine bench, on the mapped bench line (w1105836969 +
    # w1105836965 + w1105836970). The line runs round the plaza with the square
    # on its left, so the path's right-hand normal is outward: the backrest is
    # the parapet on the outside, the seat faces the square.
    prof = [(-0.55, -0.05), (0.50, -0.05), (0.50, 0.80), (0.38, 1.02), (0.16, 1.05),
            (0.02, 0.50), (-0.50, 0.44), (-0.55, 0.36)]
    panel = {}

    def bench_col(i, j):
        if j in (5, 6):                   # seat and its lip: mostly white
            return pick(rnd, MIX_SEAT)
        key = (i // 2, j)
        if key not in panel:
            panel[key] = pick(rnd, MIX_BENCH)
        return jit(panel[key], rnd, 0.05)
    sweep(G, bench, prof, bench_col, z=ZP, skip=(0,))
    return G


def preview_sala():
    s = SITE['sala-hipostila']
    outer, bench, T, _ = sala_geometry()
    ens = s['ensemble']
    ring = join_paths([m['pathEN_m'] for m in s['members']])
    e = {'bench': {'ringEN_m': bench + bench[::-1][1:-1]},
         'ped': {'ringEN_m': ens['w1105836977']['ringEN_m']}}
    return {'ringEN_m': ring, 'ensemble': e}


# ═════════════════════════════════════════════════════════════════════════════
# 2. ESCALINATA DEL DRAC — way 295826465 (El Drac) + 1206198499 (its basin wall)
# ═════════════════════════════════════════════════════════════════════════════
#
# Everything is placed on the mapped flights (see stair_layout): each flight is
# built along its own way, 2.5 m wide, with the way's step_count and 0.14 m
# risers; the landings fill between one pair's top edges and the next pair's
# bottom edges, and the central spine between each pair carries, bottom to
# top: the rock grotto with its cascade, the medallion with the Catalan shield
# and the serpent's head, and El Drac on its rock inside the mapped basin wall.
# The top landing reaches into a niche in the corner of the Sala's plinth — the
# Odeon bench. Parapet walls follow the outer edges with trencadís merlons.
#
# El Drac's own outline is only a 2 × 2 m blob, so it fixes the position, not
# the pose: it is built head DOWN the stair, toward the gate, as it is.

ODEON_R = 2.0          # radius of the niche cut into the Sala plinth's corner


def odeon_arc(corner, r, n=8):
    """The niche round the plinth's corner, from its S face to its E face."""
    return [(corner[0] + r * math.cos(math.pi - (math.pi / 2) * k / n),
             corner[1] + r * math.sin(math.pi - (math.pi / 2) * k / n)) for k in range(n + 1)]


def loft_x(G, stations, colfn, segs=12, cap0=None, cap1=None):
    """Elliptical sections along +X: stations = [(x, y, zc, half-width, half-height)]."""
    rings = []
    for x, y, zc, hw, hh in stations:
        rings.append([V(x, y + hw * math.cos(2 * math.pi * k / segs), zc + hh * math.sin(2 * math.pi * k / segs))
                      for k in range(segs)])
    for i in range(len(rings) - 1):
        ca = sum(rings[i], Vector()) / segs
        cb = sum(rings[i + 1], Vector()) / segs
        for k in range(segs):
            q = [rings[i][k], rings[i + 1][k], rings[i + 1][(k + 1) % segs], rings[i][(k + 1) % segs]]
            G.poly(q, colfn(i, k), sum(q, Vector()) / 4 - (ca + cb) / 2)
    if cap0:
        G.poly(rings[0], cap0, (-1, 0, 0))
    if cap1:
        G.poly(rings[-1], cap1, (1, 0, 0))


def salamander():
    """El Drac, ~2.7 m, built head toward +X, belly on z = 0."""
    G = Geo()
    rnd = Rand(1903)
    # (x, y, z of the axis, half-width, half-height): the tail lifts and curls
    body = [(-1.45, 0.10, 0.62, 0.05, 0.05), (-1.30, 0.02, 0.48, 0.09, 0.09),
            (-1.08, -0.04, 0.36, 0.15, 0.13), (-0.78, -0.02, 0.31, 0.25, 0.19),
            (-0.42, 0.0, 0.32, 0.36, 0.24), (-0.05, 0.0, 0.34, 0.42, 0.27),
            (0.32, 0.0, 0.33, 0.40, 0.26), (0.62, 0.0, 0.31, 0.30, 0.22),
            (0.82, 0.0, 0.31, 0.23, 0.19), (0.98, 0.0, 0.32, 0.26, 0.19),
            (1.14, 0.0, 0.30, 0.21, 0.15), (1.27, 0.0, 0.27, 0.12, 0.09)]
    loft_x(G, body, lambda i, k: pick(rnd, MIX_DRAC), segs=12, cap0=T_GREEN, cap1=SHADOW)
    # the crest of knobs down the back
    for x, _, zc, hw, hh in body[2:10]:
        ellipsoid(G, (x, 0, zc + hh * 0.95), (0.07, 0.06, 0.07), T_ORANGE, segs=5, rings=3, smooth=False)
    # splayed legs, knees up
    for xs in (0.5, -0.55):
        for sg in (-1, 1):
            hip = V(xs, sg * 0.30, 0.30)
            knee = V(xs + 0.08, sg * 0.62, 0.32)
            foot = V(xs + 0.22, sg * 0.78, 0.04)
            strut(G, hip, knee, 0.13, pick(rnd, MIX_DRAC))
            strut(G, knee, foot, 0.11, pick(rnd, MIX_DRAC))
            ellipsoid(G, foot, (0.14, 0.10, 0.04), T_BLUE, segs=6, rings=3, smooth=False)
    for sg in (-1, 1):                                   # eyes
        ellipsoid(G, (1.02, sg * 0.15, 0.48), (0.06, 0.05, 0.05), T_ORANGE, segs=6, rings=3, smooth=False)
    return G


def flight_steps(G, f, rnd):
    A, B, e, p = f['A'], f['B'], f['e'], f['inner']
    L = math.dist(A, B)
    n = f['n']
    for k in range(n):
        a0, a1 = L * k / n, L * (k + 1) / n
        ring = [add2(add2(A, e, a0), p, -FLIGHT_HW), add2(add2(A, e, a1), p, -FLIGHT_HW),
                add2(add2(A, e, a1), p, FLIGHT_HW), add2(add2(A, e, a0), p, FLIGHT_HW)]
        prism_z(G, ring, SKIRT, f['z0'] + (k + 1) * RISER, lambda i: rubble(rnd, STONE_L),
                top=jit(PAVING, rnd, 0.05))


def build_drac():
    st = stair_layout()
    G = Geo()
    rnd = Rand(1900)
    d, lv = st['d'], st['levels']
    Fl = st['F']
    zb, L1, L2, L3, zS = lv

    def W(u, v):
        return (u * d[0] - v * d[1], u * d[1] + v * d[0])

    def su(p):
        return p[0] * d[0] + p[1] * d[1]

    def mid(a, b):
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    for f in Fl.values():
        flight_steps(G, f, rnd)
    f1l, f1r, f2l, f2r = Fl[(0, 'L')], Fl[(0, 'R')], Fl[(1, 'L')], Fl[(1, 'R')]
    f3l, f3r, f4l, f4r = Fl[(2, 'L')], Fl[(2, 'R')], Fl[(3, 'L')], Fl[(3, 'R')]

    # ── forecourt at the foot, the three landings (the top one into the niche)
    uf = min(su(f1l['A']), su(f1r['A'])) - 2.5
    fore = [W(uf, 7.4), W(uf, -7.4), f1r['bout'], f1r['bin'], f1l['bin'], f1l['bout']]
    prism_z(G, fore, SKIRT, zb, lambda i: rubble(rnd), top=PAVING)
    for ring, z in (([f1l['tout'], f1l['tin'], f1r['tin'], f1r['tout'], f2r['bout'], f2r['bin'],
                      f2l['bin'], f2l['bout']], L1),
                    ([f2l['tout'], f2l['tin'], f2r['tin'], f2r['tout'], f3r['bout'], f3r['bin'],
                      f3l['bin'], f3l['bout']], L2),
                    ([f3l['tout'], f3l['tin'], f3r['tin'], f3r['tout'], f4r['bout'], f4r['bin']]
                     + odeon_arc(st['corner'], ODEON_R)[::-1] + [f4l['bin'], f4l['bout']], L3)):
        prism_z(G, ring, SKIRT, z, lambda i: rubble(rnd), top=PAVING)

    # ── spine 1: the grotto between the bottom flights, a cascade down its face
    grotto = [f1l['bin'], f1l['tin'], f1r['tin'], f1r['bin']]
    prism_z(G, grotto, SKIRT, L1 + 0.45, lambda i: rubble(rnd, ROCK), top=PLANTED)
    fa, fb = f1r['bin'], f1l['bin']
    fm = mid(fa, fb)
    half = math.dist(fa, fb) / 2
    for i in range(16):
        t = rnd(-0.85, 0.85)
        z = zb + rnd(0.0, 1.0) * (L1 + 0.3 - zb)
        c = add2(add2(fm, (d[1], -d[0]), t * half), d, -rnd(0.1, 0.45))
        ellipsoid(G, (c[0], c[1], z), (rnd(0.35, 0.6), rnd(0.35, 0.6), rnd(0.25, 0.4)), jit(ROCK, rnd, 0.2),
                  segs=6, rings=4, smooth=False)
    # the sheet of water over the rocks, into the oval basin at the foot
    for t0, t1 in ((-0.25, 0.25),):
        a = add2(fm, (d[1], -d[0]), t0 * half)
        b = add2(fm, (d[1], -d[0]), t1 * half)
        a2, b2 = add2(a, d, -0.9), add2(b, d, -0.9)
        G.poly([V(a[0], a[1], L1 + 0.4), V(b[0], b[1], L1 + 0.4), V(b2[0], b2[1], zb + 0.35),
                V(a2[0], a2[1], zb + 0.35)], FALL, (-d[0], -d[1], 0.4))
    B_ = Geo()
    ry = max(half - 0.3, 0.8)
    lathe(B_, (0, 0, 0), [(1.0, 0.0), (1.0, 0.45), (0.86, 0.45), (0.86, 0.33)], STONE_L, segs=14,
          smooth=False, sx=1.0, sy=ry, caps=False)
    lathe(B_, (0, 0, 0), [(0.0, 0.33), (0.86, 0.33)], WATER, segs=14, smooth=False, sx=1.0, sy=ry, caps=False)
    bc = add2(fm, d, -1.05)
    G.add(B_, place(bc[0], bc[1], zb, yaw=math.atan2(d[1], d[0])))

    # ── spine 2: the planter with the Catalan shield and the serpent's head
    prism_z(G, [f2l['bin'], f2l['tin'], f2r['tin'], f2r['bin']], SKIRT, L2 + 0.5,
            lambda i: rubble(rnd), top=PLANTED)
    m2 = mid(f2l['bin'], f2r['bin'])
    Md = Geo()                 # built facing +X (out of the spine's face), Z up
    S_ = Geo()
    disc(S_, (0, 0, 0), 0.95, [STONE_L], n=14)
    Md.add(S_, Matrix.Translation((0.02, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    Sh = Geo()
    r = 0.72
    for k in range(9):          # four red pallets on gold
        y0 = -r + 2 * r * k / 9
        y1 = -r + 2 * r * (k + 1) / 9
        h0 = math.sqrt(max(r * r - y0 * y0, 0.0))
        h1 = math.sqrt(max(r * r - y1 * y1, 0.0))
        Sh.poly([V(-h0, y0, 0), V(-h1, y1, 0), V(h1, y1, 0), V(h0, y0, 0)],
                T_RED if k % 2 else T_YELLOW, (0, 0, 1))
    Md.add(Sh, Matrix.Translation((0.06, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    tube(Md, [(0.05, 0, -0.35), (0.35, 0, -0.5), (0.62, 0, -0.45)], [0.14, 0.13, 0.1], T_GREEN, segs=8)
    ellipsoid(Md, (0.7, 0, -0.44), (0.18, 0.12, 0.1), T_LGREEN, segs=8, rings=4, smooth=False)
    Md.poly([V(0.85, -0.06, -0.47), V(0.85, 0.06, -0.47), V(0.95, 0.07, -1.2), V(0.95, -0.07, -1.2)],
            FALL, (1, 0, 0))
    G.add(Md, place(m2[0], m2[1], L1 + 1.25, yaw=math.atan2(-d[1], -d[0])))
    Bs = Geo()
    lathe(Bs, (0, 0, 0), [(0.6, 0.0), (0.6, 0.4), (0.5, 0.4), (0.5, 0.3)], STONE_L, segs=10, smooth=False,
          caps=False)
    lathe(Bs, (0, 0, 0), [(0.0, 0.3), (0.5, 0.3)], WATER, segs=10, smooth=False, caps=False)
    b2 = add2(m2, d, -0.75)
    G.add(Bs, place(b2[0], b2[1], L1, yaw=math.atan2(d[1], d[0])))

    # ── spine 3: El Drac's rock, sloping with the flights, inside its basin wall
    s0 = su(mid(f3l['A'], f3r['A']))
    s1 = su(mid(f3l['B'], f3r['B']))

    def zsp(x, y):
        t = min(max((su((x, y)) - s0) / (s1 - s0), 0.0), 1.0)
        return L2 + 0.35 + (L3 - L2) * t
    prism_z(G, [f3l['bin'], f3l['tin'], f3r['tin'], f3r['bin']], SKIRT, zsp, lambda i: rubble(rnd, ROCK),
            top=ROCK)
    wall = open_ring(SITE['escalinata-drac']['ensemble']['w1206198499']['ringEN_m'])
    wall = resample(wall, 0.4)
    sweep(G, wall, [(-0.15, -0.6), (0.15, -0.6), (0.15, 0.28), (-0.15, 0.28)],
          lambda i, j: pick(rnd, MIX_SEAT) if j == 2 else rubble(rnd, STONE_L),
          closed=True, z=[zsp(*p) for p in wall])
    pitch = math.atan2(L3 - L2, s1 - s0)
    # it lies on a low mound of rock, proud of the basin wall, as it does
    ellipsoid(G, (0, 0, zsp(0, 0)), (1.3, 0.8, 0.3), ROCK, segs=8, rings=4, smooth=False)
    G.add(salamander(), Matrix.Translation((0, 0, zsp(0, 0) + 0.22)) @
          Matrix.Rotation(math.atan2(-d[1], -d[0]), 4, 'Z') @ Matrix.Rotation(pitch, 4, 'Y')
          @ Matrix.Diagonal((1.12, 1.12, 1.12, 1.0)))
    # the jet from its mouth into the basin
    hm = W(-1.3, 0)
    G.poly([V(hm[0] - 0.05, hm[1], zsp(0, 0) + 0.2), V(hm[0] + 0.05, hm[1], zsp(0, 0) + 0.2),
            V(hm[0] + 0.08, hm[1], L2 + 0.05), V(hm[0] - 0.08, hm[1], L2 + 0.05)], FALL, (-d[0], -d[1], 0))

    # ── the Odeon bench, round the niche in the Sala plinth's corner. The arc
    # runs clockwise round its centre, so the right-hand normal faces the landing.
    arc = odeon_arc(st['corner'], ODEON_R - 0.02, n=10)
    sweep(G, arc, [(0.0, 0.0), (0.62, 0.0), (0.62, 0.40), (0.18, 0.45), (0.16, 1.0), (0.0, 1.05)],
          lambda i, j: pick(rnd, MIX_BENCH if j in (3, 4) else MIX_SEAT), z=L3)

    # ── parapet walls along the outer edges, trencadís merlons on top
    for side in ('L', 'R'):
        pts, tops = [], []
        for k in range(4):
            f = Fl[(k, side)]
            pts += [f['bout'], f['tout']]
            tops += [f['z0'] + 1.0, f['z0'] + f['n'] * RISER + 1.0]
        # the walls start at a pier on the forecourt
        pts.insert(0, add2(pts[0], d, -1.2))
        tops.insert(0, zb + 1.2)
        o0, o1 = (-0.55, 0.0) if side == 'L' else (0.0, 0.55)
        profs = [[(o0, SKIRT), (o1, SKIRT), (o1, t), (o0, t)] for t in tops]
        sweep(G, pts, profs, lambda i, j: pick(rnd, MIX_SEAT) if j == 2 else rubble(rnd))
        oc = (o0 + o1) / 2
        F_ = path_frames(pts)
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            na = F_[i][1]
            L = math.dist(a, b)
            k = max(1, int(L / 0.95))
            for j in range(k):
                t = (j + 0.5) / k
                x = a[0] + (b[0] - a[0]) * t + na[0] * oc
                y = a[1] + (b[1] - a[1]) * t + na[1] * oc
                z = tops[i] + (tops[i + 1] - tops[i]) * t
                box(G, (x, y, z + 0.17), (0.5, 0.62, 0.34), pick(rnd, MIX_BENCH),
                    yaw=math.atan2(b[1] - a[1], b[0] - a[0]))
    return G


def preview_drac():
    s = SITE['escalinata-drac']
    e = {'basin': {'ringEN_m': s['ensemble']['w1206198499']['ringEN_m']}}
    for a, b in FLIGHT_PAIRS:
        for w in (a, b):
            r = s['context'][w]['ringEN_m']
            e[w] = {'ringEN_m': r + r[::-1]}
    return {'ringEN_m': s['ringEN_m'], 'ensemble': e}


# ═════════════════════════════════════════════════════════════════════════════
# PAVILION KIT — rubble walls, window decals and the undulating trencadís roofs
# ═════════════════════════════════════════════════════════════════════════════

def roof_organic(G, ring, z0, h, colfn, ridge=None, K=8, over=0.35, amp=0.4, nw=5, phase=0.0,
                 step=0.5, soffit=STONE_D):
    """A Gaudí pavilion roof: rings drawn in from the eave (overhung `over`) to a
    point or a ridge segment, rising as a dome, with `nw` bulges round the
    perimeter that die out at the eave and at the top. colfn(k, i) colours a
    face: row k up from the eave, column i round it. Returns the top point."""
    r = resample(ccw(ring), step)
    n = len(r)
    Fr = path_frames(r, closed=True)          # CCW: right-hand normal = outward
    c = centroid(r)
    cum = [0.0]
    for i in range(1, n):
        cum.append(cum[-1] + math.dist(r[i - 1], r[i]))
    P = cum[-1] + math.dist(r[-1], r[0])

    def target(p):
        if ridge is None:
            return c
        (ax, ay), (bx, by) = ridge
        ex, ey = bx - ax, by - ay
        t = min(max(((p[0] - ax) * ex + (p[1] - ay) * ey) / (ex * ex + ey * ey), 0.0), 1.0)
        return (ax + ex * t, ay + ey * t)
    rows = []
    for k in range(K + 1):
        f = k / K
        row = []
        for i, (p, (nx, ny), km) in enumerate(Fr):
            b = (p[0] + nx * over * km * (1 - f), p[1] + ny * over * km * (1 - f))
            q = target(p)
            x = b[0] + (q[0] - b[0]) * f
            y = b[1] + (q[1] - b[1]) * f
            z = z0 + h * math.sin(f * math.pi / 2) + amp * math.sin(2 * math.pi * nw * cum[i] / P + phase) \
                * math.sin(math.pi * f)
            row.append(V(x, y, z))
        rows.append(row)
    for k in range(K):
        for i in range(n):
            i2 = (i + 1) % n
            q = [rows[k][i], rows[k][i2], rows[k + 1][i2], rows[k + 1][i]]
            mid = sum(q, Vector()) / 4
            t = target((mid.x, mid.y))
            G.poly(q, colfn(k, i), mid - V(t[0], t[1], z0 - 3.0))
    if over > 0:
        for i in range(n):
            i2 = (i + 1) % n
            G.poly([V(r[i][0], r[i][1], z0), V(r[i2][0], r[i2][1], z0), rows[0][i2], rows[0][i]], soffit,
                   (0, 0, -1))
    t = target(c)
    return (t[0], t[1], z0 + h)


def windows(G, ring, bands, rnd, spacing=2.6, w=0.8, frame=None, skip=None):
    """Dark window openings round a (resampled) wall ring, one every `spacing`
    metres along the perimeter, on each (z0, z1) band. `skip(p)` drops some."""
    r = ccw(ring)
    n = len(r)
    s_next = spacing * 0.5 + rnd(0, spacing * 0.3)
    s = 0.0
    for i in range(n):
        a, b = r[i], r[(i + 1) % n]
        L = math.dist(a, b)
        if L < 1e-6:
            continue
        while s_next <= s + L:
            t = (s_next - s)
            p = (a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L)
            if not (skip and skip(p)):
                wl = Wall(a, b)
                for z0, z1 in bands:
                    if frame:
                        wl.decal(G, [(t - w / 2 - 0.15, z0 - 0.15), (t + w / 2 + 0.15, z0 - 0.15),
                                     (t + w / 2 + 0.15, z1 + 0.15), (t - w / 2 - 0.15, z1 + 0.15)], frame,
                                 off=0.02)
                    wl.decal(G, [(t - w / 2, z0), (t + w / 2, z0), (t + w / 2, z1), (t - w / 2, z1)], WINDOW,
                             off=0.04)
            s_next += spacing
        s += L


def offset_ring(ring, d):
    """The ring pushed `d` metres outward (mitered)."""
    r = ccw(ring)
    return [(p[0] + nx * d * k, p[1] + ny * d * k) for p, (nx, ny), k in path_frames(r, closed=True)]


def masonry(G, ring, z1, rnd, z0=0.0, course=0.8, base=STONE):
    """Rubble walls in horizontal courses (a colour per stone, staggered),
    over a plain hidden skirt from SKIRT to z0."""
    r = ccw(ring)
    prism_z(G, r, SKIRT, z0, STONE_D)
    nb = max(1, int(round((z1 - z0) / course)))
    for b in range(nb):
        za = z0 + (z1 - z0) * b / nb
        zb = z0 + (z1 - z0) * (b + 1) / nb
        prism_z(G, r, za, zb, lambda i: rubble(rnd, base))


def band(G, ring, z0, z1, colfn, off=0.06):
    """A string course standing `off` proud of the wall, with its top ledge."""
    o = offset_ring(ring, off)
    prism_z(G, o, z0, z1, colfn)
    n = len(o)
    r = ccw(ring)
    for i in range(n):
        i2 = (i + 1) % n
        G.poly([V(r[i][0], r[i][1], z1), V(r[i2][0], r[i2][1], z1), V(o[i2][0], o[i2][1], z1),
                V(o[i][0], o[i][1], z1)], colfn(i), (0, 0, 1))


def shared_chord(part, ring):
    """The two vertices of a building:part that lie on its building's outline
    and are furthest apart: where the part is cut off the main body."""
    on = [p for p in open_ring(part) if min(math.dist(p, q) for q in ring) < 1e-3]
    best = max(((a, b) for a in on for b in on), key=lambda ab: math.dist(*ab))
    return best


def checker(rnd, white, accents, stride=2):
    cache = {}

    def f(k, i):
        if (k + i // stride) % 2 == 0:
            return jit(white, rnd, 0.05)
        key = (k, i // stride)
        if key not in cache:
            cache[key] = pick(rnd, accents)
        return cache[key]
    return f


# ═════════════════════════════════════════════════════════════════════════════
# 3. CASA DEL GUARDA — way 672895475 (+ building:parts 672896035, 672895572)
# ═════════════════════════════════════════════════════════════════════════════
#
# WHICH PAVILION IS WHICH. Seen from Carrer d'Olot the gate has a pavilion either
# side; the city's heritage mosaic inventory names the RIGHT one (the NE one,
# this way) the Casa del Guarda — the porter's house, two floors and an attic,
# its roof a white-and-colour checker ending in a red, mushroom-like top — and
# the LEFT one (SW, way 672895651) the consergeria, with the tall tower in a
# blue-and-white checker and the four-armed cross. The two mapped 2-level parts
# are the lower rounded bays at either end of the oval; the main body between
# them carries the roof and the mushroom. Heights are from knowledge: bays 5.4 m
# to the eave, main body 7.2 m, roof crown ~11 m, the mushroom's cap ~14 m.

def build_guarda():
    s = SITE['casa-del-guarda']
    F = open_ring(s['ringEN_m'])
    ens = s['ensemble']
    parts = [open_ring(ens[k]['ringEN_m']) for k in ('w672896035', 'w672895572')]
    G = Geo()
    rnd = Rand(1901)
    cF = centroid(F)
    main = F
    for pt in parts:
        a, b = shared_chord(pt, F)
        main = clip_line(main, a, b, cF)
    ZB, ZE = 5.4, 7.2
    Fs = resample(F, 0.6)
    masonry(G, Fs, ZB, rnd)
    G.poly([V(x, y, ZB) for x, y in ccw(Fs)], STONE_D, (0, 0, 1))
    Ms = resample(main, 0.6)
    masonry(G, Ms, ZE, rnd, z0=ZB)
    # a ceramic string course under each eave
    for ring, z in ((Fs, ZB), (Ms, ZE)):
        band(G, ring, z - 0.3, z, lambda i: pick(rnd, [(T_WHITE, 4), (T_OCHRE, 1), (T_BLUE, 0.6)]))
    windows(G, Fs, [(1.1, 2.3), (3.6, 4.7)], rnd, spacing=2.9, w=0.7, frame=STONE_L)
    # the bays' low domes, then the main roof along the oval's long axis
    roof_col = checker(rnd, T_CREAM, MIX_ROOF_ACCENT)
    for pt in parts:
        roof_organic(G, pt, ZB, 2.0, roof_col, K=5, over=0.3, amp=0.15, nw=3)
    ax = principal_axis(main)
    cm = centroid(main)
    half = 0.22 * max(abs((p[0] - cm[0]) * ax[0] + (p[1] - cm[1]) * ax[1]) for p in main)
    ridge = (add2(cm, ax, -half), add2(cm, ax, half))
    roof_organic(G, main, ZE, 3.8, roof_col, ridge=ridge, K=9, over=0.4, amp=0.45, nw=6)
    # the lookout: a checkered drum through the crown, crenellated, and the red
    # mushroom cap spotted white
    zt = ZE + 3.8
    lathe_c(G, (cm[0], cm[1], zt - 1.2), [(1.0, 0.0), (1.0, 1.9), (0.92, 2.5)],
            checker(rnd, T_WHITE, [(T_BROWN, 2), (T_OCHRE, 1)], stride=1), segs=12, caps=False)
    for k in range(8):
        a = 2 * math.pi * k / 8
        box(G, (cm[0] + 0.98 * math.cos(a), cm[1] + 0.98 * math.sin(a), zt + 0.2), (0.34, 0.34, 0.5),
            pick(rnd, MIX_SEAT), yaw=a)
    lathe_c(G, (cm[0], cm[1], zt + 1.3), [(0.55, 0.0), (1.55, 0.25), (1.6, 0.5), (1.35, 0.95), (0.8, 1.35),
                                          (0.0, 1.5)],
            lambda i, k: T_WHITE if (i + k) % 5 == 0 and i > 0 else jit(T_RED, rnd, 0.06), segs=14,
            caps=True)
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 4. PAVELLÓ DE CONSERGERIA — way 672895651, NOT the site entry's 672895744
# ═════════════════════════════════════════════════════════════════════════════
#
# The site entry's footprint, w672895744, is a long 1-level building west of
# the entrance in the school's grounds, 30 m from the gate — not a pavilion.
# The consergeria is the smaller oval flanking the gate on its SW (left) side,
# way 672895651 (2 levels, 78 m² against the Casa del Guarda's 104 m²). This
# model is authored about THAT way's centroid (vertex mean of its ring,
# [41.4134236, 2.1529730]); the ring is re-expressed from the entry's frame.
# Heights from knowledge: walls 4.8 m, dome to ~8.3 m with its small cupola,
# and the helical tower on the gate side (the E lobe), checkered blue and
# white, to ~14 m with the four-armed cross above — ~16 m overall.

CONSERGERIA_WAY = 'w672895651'
CONSERGERIA_CENTROID = (41.4134236, 2.1529730)


def consergeria_ring():
    e = SITE['pavello-consergeria']
    r = open_ring(e['ensemble'][CONSERGERIA_WAY]['ringEN_m'])
    ox, oy = frame_offset(e['centroid'], CONSERGERIA_CENTROID)
    return [(x - ox, y - oy) for x, y in r]


def build_consergeria():
    F = consergeria_ring()
    G = Geo()
    rnd = Rand(1902)
    ZE = 4.8
    Fs = resample(F, 0.6)
    tc = (5.0, 2.3)                       # the tower, in the E lobe beside the gate
    masonry(G, Fs, ZE, rnd)
    band(G, Fs, ZE - 0.3, ZE, lambda i: pick(rnd, [(T_WHITE, 4), (T_OCHRE, 1), (T_BLUE, 0.6)]))
    windows(G, Fs, [(1.1, 2.3), (3.2, 4.1)], rnd, spacing=3.0, w=0.7, frame=STONE_L,
            skip=lambda p: math.dist(p, tc) < 2.2)
    roof_col = checker(rnd, T_CREAM, MIX_ROOF_ACCENT)
    top = roof_organic(G, F, ZE, 3.5, roof_col, K=9, over=0.4, amp=0.4, nw=5, phase=1.0)
    # the small cupola on the crown
    lathe_c(G, (top[0], top[1], top[2] - 0.2), [(0.55, 0.0), (0.5, 0.7), (0.62, 0.8), (0.3, 1.2), (0.0, 1.35)],
            checker(rnd, T_WHITE, [(T_BLUE, 1), (T_GREEN, 1)], stride=1), segs=10, caps=False)
    # the tower: an oval section turning as it rises (helical), tapering
    H = 13.6
    segs = 12
    rings_ = []
    zs = [SKIRT, 0.0] + [ZE + (H - ZE) * k / 10 for k in range(11)]
    for z in zs:
        f = max(z, 0.0) / H
        rx, ry = 1.35 * (1 - 0.35 * f), 1.1 * (1 - 0.35 * f)
        th = 1.4 * f
        rings_.append([V(tc[0] + rx * math.cos(2 * math.pi * k / segs) * math.cos(th)
                         - ry * math.sin(2 * math.pi * k / segs) * math.sin(th),
                         tc[1] + rx * math.cos(2 * math.pi * k / segs) * math.sin(th)
                         + ry * math.sin(2 * math.pi * k / segs) * math.cos(th), z) for k in range(segs)])
    for j in range(len(rings_) - 1):
        for k in range(segs):
            q = [rings_[j][k], rings_[j][(k + 1) % segs], rings_[j + 1][(k + 1) % segs], rings_[j + 1][k]]
            mid = sum(q, Vector()) / 4
            zc = mid.z
            if zc < ZE:
                c = rubble(rnd)
            else:
                c = jit(T_WHITE, rnd, 0.04) if (j + k) % 2 else jit(T_BLUE, rnd, 0.1)
            G.poly(q, c, mid - V(tc[0], tc[1], zc))
    lathe_c(G, (tc[0], tc[1], H), [(0.9, 0.0), (0.75, 0.35), (0.3, 0.6), (0.0, 0.65)],
            lambda i, k: jit(T_WHITE, rnd, 0.04), segs=segs, caps=False)
    cross4(G, (tc[0], tc[1], H + 0.55), 2.1, 0.28, T_WHITE)
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 5. CASA MUSEU GAUDÍ — way 126856515 (+ building:parts 672895612, 672895642,
#    672895916, 672895827)
# ═════════════════════════════════════════════════════════════════════════════
#
# Francesc Berenguer's "Torre Rosa" (1903–05): pink stucco, stone-coloured
# trim, a tiled roof and the tower with a pointed trencadís spire, a cross and
# a wind rose. The way is tagged 4 levels and its parts are lower: the 3-level
# band across the middle (w672895612), the 2-level SW wing (w672895916) and E
# wing (w672895827). What the parts leave — the NE block — is the 4-level main
# house. The small 7-sided part on the N edge (w672895642) is taken for the
# tower (its footprint is the only tower-like one; its 2-level tag is doubtful).
# 3.1 m a level; the spire rises ~6 m over the tower's 15 m shaft.

def build_museu():
    s = SITE['casa-museu-gaudi']
    F = open_ring(s['ringEN_m'])
    ens = s['ensemble']
    band_ = open_ring(ens['w672895612']['ringEN_m'])
    tower = open_ring(ens['w672895642']['ringEN_m'])
    wing_sw = open_ring(ens['w672895916']['ringEN_m'])
    wing_e = open_ring(ens['w672895827']['ringEN_m'])
    # the main block: the outline's N side (vertices 1..8) closed along the
    # band's and the E wing's shared edges
    main = F[1:9] + [band_[5], band_[4], band_[3]]
    G = Geo()
    rnd = Rand(1906)
    LV = 3.1
    tcen = centroid(tower)

    def stucco(i):
        return jit(PINK, rnd, 0.03)
    for ring, nl in ((wing_sw, 2), (wing_e, 2), (band_, 3), (main, 4)):
        ze = nl * LV
        prism_z(G, ring, SKIRT, ze, stucco)
        band(G, ring, ze - 0.35, ze, lambda i: jit(TRIM, rnd, 0.03), off=0.08)
        windows(G, ring, [(k * LV + 0.9, k * LV + 2.3) for k in range(nl)], rnd, spacing=2.2, w=0.9,
                frame=TRIM, skip=lambda p: math.dist(p, tcen) < 2.0)
        if nl < 4:                     # flat roofs behind a pink parapet
            G.poly([V(x, y, ze) for x, y in ccw(ring)], PAVING, (0, 0, 1))
            sweep(G, ccw(ring), [(-0.25, 0.0), (0.0, 0.0), (0.0, 0.8), (-0.25, 0.8)],
                  lambda i, j: TRIM if j == 2 else jit(PINK_D, rnd, 0.03), closed=True, z=ze)
    ze = 4 * LV
    ax = principal_axis(main)
    cm = centroid(main)
    half = 0.3 * max(abs((p[0] - cm[0]) * ax[0] + (p[1] - cm[1]) * ax[1]) for p in main)
    roof_organic(G, main, ze, 2.4, lambda k, i: jit(TILE_RED, rnd, 0.06),
                 ridge=(add2(cm, ax, -half), add2(cm, ax, half)), K=3, over=0.45, amp=0.0, step=1.0,
                 soffit=TRIM)
    # two trencadís chimneys on the roof
    for t in (-0.55, 0.55):
        c = add2(cm, ax, t * half * 2.2)
        box(G, (c[0], c[1], ze + 1.9), (0.8, 0.8, 3.0), jit(PINK, rnd, 0.03))
        lathe_c(G, (c[0], c[1], ze + 3.4), [(0.55, 0.0), (0.45, 0.35), (0.0, 0.9)],
                checker(rnd, T_WHITE, [(T_GREEN, 2), (T_BLUE, 1), (T_OCHRE, 1)], stride=1), segs=8, caps=True)
    # the tower on its 7-sided part, the spire in green-and-white trencadís
    ZT = 15.0
    prism_z(G, tower, SKIRT, ZT, stucco)
    windows(G, tower, [(ze + 0.6, ze + 1.8)], rnd, spacing=1.6, w=0.55, frame=TRIM)
    band(G, tower, ZT - 0.4, ZT, lambda i: jit(TRIM, rnd, 0.03), off=0.12)
    rt = sum(math.dist(tcen, p) for p in tower) / len(tower)
    lathe_c(G, (tcen[0], tcen[1], ZT), [(rt + 0.25, 0.0), (rt * 0.9, 1.3), (rt * 0.55, 3.4), (0.14, 5.6),
                                        (0.0, 6.0)],
            checker(rnd, T_WHITE, [(T_GREEN, 3), (T_LGREEN, 1)], stride=1), segs=8, caps=True)
    cross4(G, (tcen[0], tcen[1], ZT + 5.9), 1.5, 0.12, IRON)
    for a in range(4):                                  # the wind rose
        yaw = a * math.pi / 2
        box(G, (tcen[0] + 0.3 * math.cos(yaw), tcen[1] + 0.3 * math.sin(yaw), ZT + 6.6), (0.6, 0.06, 0.06),
            IRON, yaw=yaw)
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 6. TURÓ DE LES TRES CREUS — node 6286148116 (peak, ele 185), the Calvary
# ═════════════════════════════════════════════════════════════════════════════
#
# ANCHOR ONLY: the site entry's featureId is the park itself; nothing is
# replaced. The Calvary is a rubble-stone mound on the hilltop with a stair
# winding up it and three crosses on top: one pointing to the sky, two with
# horizontal arms pointing to the cardinal points. The mound is centred on the
# mapped footway that rings it (w61942870, ~7 m radius, fitted here), the stair
# starts where the approach path (w1023789795) arrives from the W, and the
# tall cross stands on the mapped cross (n11994479654). None of these ways are
# in the site file's context, so their nodes are copied here (this frame).
# The terrain the app samples here is ~18 m under the mapped peak, so the
# model keeps its own low rock knoll and does not try to rebuild the hill.

CREUS_LOOP = [(-2.2, -7.9), (0.2, -8.2), (2.0, -8.0), (3.7, -7.4), (5.2, -6.5), (6.5, -5.3), (7.5, -3.8),
              (7.8, -1.9), (7.6, 0.3), (6.7, 2.6), (5.2, 4.4), (3.1, 5.8), (0.8, 6.4), (-1.8, 6.2),
              (-4.2, 5.2), (-6.2, 3.4), (-9.8, -0.3), (-9.1, -1.9), (-8.1, -3.4), (-6.3, -5.3),
              (-4.4, -6.9)]
CREUS_APPROACH = (-9.8, -0.3)
CREUS_CROSS = (0.0, -2.5)


def build_creus():
    G = Geo()
    rnd = Rand(1922)
    cx, cy, R = fit_circle(CREUS_LOOP)
    # the rock knoll, inside the ring path
    knoll = []
    for k in range(18):
        a = 2 * math.pi * k / 18
        rr = (R - 1.4) * (1 + rnd(-0.07, 0.07))
        knoll.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    ZK = 0.9
    prism_z(G, knoll, SKIRT, ZK, lambda i: jit(ROCK, rnd, 0.15), top=jit(ROCK, rnd, 0.1))
    for k in range(14):
        a = 2 * math.pi * (k + rnd(-0.3, 0.3)) / 14
        rr = R - 1.5
        ellipsoid(G, (cx + rr * math.cos(a), cy + rr * math.sin(a), ZK * 0.5),
                  (rnd(0.6, 1.1), rnd(0.5, 0.9), rnd(0.4, 0.7)), jit(ROCK, rnd, 0.2), segs=6, rings=4,
                  smooth=False)
    # the built mound: a battered drum of rubble
    prof = [(4.9, ZK), (4.5, 2.2), (3.9, 3.6), (3.3, 4.9), (3.0, 5.8)]
    lathe_c(G, (cx, cy, 0), prof, lambda i, k: rubble(rnd), segs=16, caps=False)
    ZT = prof[-1][1]
    lathe_c(G, (cx, cy, 0), [(0.0, ZT), (3.0, ZT)], lambda i, k: PAVING, segs=16, caps=False)

    def r_at(z):
        for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
            if z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return prof[-1][0]
    # the stair: from the W approach, anticlockwise round the mound to the top
    a0 = math.atan2(CREUS_APPROACH[1] - cy, CREUS_APPROACH[0] - cx)
    n = 34
    sweep_a = math.radians(300)
    rise = (ZT - ZK) / n
    for k in range(n):
        z = ZK + (k + 1) * rise
        rin, rout = r_at(z) - 0.4, r_at(z) + 1.05
        aa, ab = a0 + sweep_a * k / n, a0 + sweep_a * (k + 1) / n
        am = (aa + ab) / 2
        ring = [(cx + rin * math.cos(aa), cy + rin * math.sin(aa)),
                (cx + rout * math.cos(aa), cy + rout * math.sin(aa)),
                (cx + rout * math.cos(am), cy + rout * math.sin(am)),
                (cx + rout * math.cos(ab), cy + rout * math.sin(ab)),
                (cx + rin * math.cos(ab), cy + rin * math.sin(ab))]
        prism_z(G, ring, ZK - 0.3, z, lambda i: rubble(rnd, STONE_L), top=jit(PAVING, rnd, 0.05))
    # the three crosses: the tall one on the mapped cross, pointing to the sky
    dx, dy = CREUS_CROSS[0] - cx, CREUS_CROSS[1] - cy
    L = math.hypot(dx, dy)
    k = min(1.0, 1.6 / L) if L > 1e-6 else 0.0
    c0 = (cx + dx * k, cy + dy * k)
    box(G, (c0[0], c0[1], ZT + 0.3), (0.9, 0.9, 0.6), STONE_L)
    cross4(G, (c0[0], c0[1], ZT + 0.6), 4.2, 0.32, T_WHITE)
    lathe(G, (c0[0], c0[1], ZT + 4.8), [(0.3, 0.0), (0.0, 0.7)], T_WHITE, segs=4, smooth=False)
    base_a = math.atan2(dy, dx)
    for ang, h in ((2.3, 3.2), (-2.4, 3.6)):
        p = (cx + 1.7 * math.cos(base_a + ang), cy + 1.7 * math.sin(base_a + ang))
        box(G, (p[0], p[1], ZT + h / 2), (0.34, 0.34, h), STONE_L)
        cross4(G, (p[0], p[1], ZT + h + 0.1), 1.6, 0.3, T_WHITE, arms='flat')
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 7. PÒRTIC DE LA BUGADERA — node 4790341321, the leaning-column portico
# ═════════════════════════════════════════════════════════════════════════════
#
# ANCHOR ONLY (the featureId is the park). The portico is the gallery under a
# path, retained against the hill, whose outer columns lean in as a wave; the
# column at its NE end is the washerwoman with her basket. Its line is the
# mapped footway that runs from the node south-westward (w160465820, unhewn
# cobblestone) with the retaining wall w460419313 3 m to its NW — so the hill
# and the inner wall are on the NW, the leaning colonnade on the SE. Neither
# way is in the site file's context, so the stretch used (45 m of it) is copied
# here, in this frame. Section from knowledge: gallery ~5 m wide, columns
# 4.3 m leaning ~13° toward the hill, the upper path on top at ~5.3 m.

BUGADERA_PATH = [(-6.4, 0.6), (-14.2, -6.3), (-22.9, -14.2), (-30.5, -21.6), (-34.2, -25.9),
                 (-37.6, -32.0)]


def bugadera_column(rnd):
    C = Geo()
    lathe_c(C, (0, 0, 0), [(0.36, 0.0), (0.31, 0.5), (0.34, 1.5), (0.29, 2.6), (0.32, 3.5), (0.42, 4.05),
                           (0.52, 4.3)], lambda i, k: rubble(rnd), segs=8, caps=False)
    return C


def build_bugadera():
    G = Geo()
    rnd = Rand(1905)
    path = resample(chaikin(BUGADERA_PATH, 2), 1.2, closed=False)
    # floor of the gallery (o > 0 is the right-hand side walking SW: the hill)
    sweep(G, path, [(-3.4, SKIRT), (3.0, SKIRT), (3.0, 0.0), (-3.4, 0.0)],
          lambda i, j: jit(PAVING, rnd, 0.05) if j == 2 else rubble(rnd))
    # the retaining wall and the hill behind it, up to the path on top
    sweep(G, path, [(2.8, SKIRT), (8.0, SKIRT), (8.0, 2.6), (5.2, 5.35), (2.4, 5.35), (2.4, 4.3),
                    (2.8, 0.0)], lambda i, j: (PLANTED if j == 2 else EARTH if j == 3 else rubble(rnd)),
          skip=(0,))
    # the vaulted deck over the gallery, a parapet on its outer edge
    sweep(G, path, [(-2.2, 4.3), (-1.0, 4.62), (0.6, 4.75), (1.8, 4.55), (2.45, 4.3), (2.45, 5.35),
                    (-2.2, 5.35)], lambda i, j: EARTH if j == 5 else rubble(rnd, STONE_L))
    sweep(G, path, [(-2.25, 5.3), (-1.85, 5.3), (-1.85, 6.2), (-2.25, 6.2)],
          lambda i, j: rubble(rnd, STONE_L), skip=(0,))
    # the leaning colonnade, one column every ~2.3 m
    col = bugadera_column(rnd)
    cum = [0.0]
    for a, b in zip(path, path[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    lean = math.atan2(1.0, 4.3)
    s_ = 0.0
    first = True
    while s_ <= cum[-1] - 0.5:
        i = min(max(j for j in range(len(cum)) if cum[j] <= s_), len(path) - 2)
        t = (s_ - cum[i]) / (cum[i + 1] - cum[i])
        a, b = path[i], path[i + 1]
        p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        L = math.dist(a, b)
        tx, ty = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        nx, ny = ty, -tx                                  # right-hand: toward the hill
        base = (p[0] - nx * 2.2, p[1] - ny * 2.2)
        if first:
            # the washerwoman, facing out of the gallery, her basket under the deck
            yaw = math.atan2(-nx, ny)                     # the figure faces -Y
            G.add(figure(3.1, jit(STONE_L, rnd, 0.05)), place(base[0], base[1], 0.0, yaw=yaw))
            ellipsoid(G, (base[0], base[1], 3.35), (0.5, 0.5, 0.25), STONE_L, segs=8, rings=4, smooth=False)
            lathe(G, (base[0], base[1], 3.5), [(0.35, 0.0), (0.3, 0.6), (0.5, 0.85)], STONE_L, segs=8,
                  smooth=False, caps=False)
            first = False
        else:
            M = Matrix.Translation((base[0], base[1], 0.0)) @ Matrix.Rotation(lean, 4, Vector((tx, ty, 0)))
            G.add(col, M)
        s_ += 2.3
    return G


def build_junction():
    """Review only (env LANDMARKS_DEBUG): the Sala and the stair in the Sala's
    frame, each at its own terrain sample, to see that the two GLBs meet."""
    G = build_sala()
    ox, oy = drac_in_sala()
    dz = GROUND['escalinata-drac'] - GROUND['sala-hipostila']
    G.add(build_drac(), Matrix.Translation((ox, oy, dz)))
    return G


BUILDERS = {
    'sala-hipostila': (build_sala, 'sala-hipostila', -45),
    'escalinata-drac': (build_drac, 'escalinata-drac', -48),
    'casa-del-guarda': (build_guarda, 'casa-del-guarda', -45),
    'pavello-consergeria': (build_consergeria, 'pavello-consergeria', -45),
    'casa-museu-gaudi': (build_museu, 'casa-museu-gaudi', -60),
    'turo-tres-creus': (build_creus, 'turo-tres-creus', 180),
    'portic-bugadera': (build_bugadera, 'portic-bugadera', -45),
}
PREVIEW_SITE = {
    'sala-hipostila': preview_sala(),
    'escalinata-drac': preview_drac(),
    'casa-del-guarda': {'ringEN_m': SITE['casa-del-guarda']['ringEN_m'],
                        'ensemble': SITE['casa-del-guarda']['ensemble']},
    'pavello-consergeria': {'ringEN_m': consergeria_ring(), 'ensemble': {}},
    'casa-museu-gaudi': {'ringEN_m': SITE['casa-museu-gaudi']['ringEN_m'],
                         'ensemble': SITE['casa-museu-gaudi']['ensemble']},
    'turo-tres-creus': {'ringEN_m': CREUS_LOOP, 'ensemble': {}},
    'portic-bugadera': {'ringEN_m': BUGADERA_PATH + BUGADERA_PATH[::-1], 'ensemble': {}},
}
if os.environ.get('LANDMARKS_DEBUG'):
    BUILDERS = {'debug-junction': (build_junction, 'sala-hipostila', -45)}
    BUDGET['debug-junction'] = 60000

# The kit's preview puts its ground plane at z = 0. On the hillside part of a
# model is legitimately below its origin (the stair's foot is 2.8 m under El
# Drac), so the preview lifts the mesh to show it. run() exports before it
# previews, so this never reaches a GLB.
PREVIEW_LIFT = {'escalinata-drac': 2.8, 'debug-junction': 2.5}
import landmark_kit  # noqa: E402
_kit_preview = landmark_kit.preview


def _lifted_preview(ob, name, rings, front_az, out_png):
    dz = PREVIEW_LIFT.get(name, 0.0)
    for v in ob.data.vertices:
        v.co.z += dz
    _kit_preview(ob, name, rings, front_az, out_png)


landmark_kit.preview = _lifted_preview

run(BUILDERS, PREVIEW_SITE, BUDGET, OUT_DIR)
