# ─── build-castell-montjuic-landmark.py ──────────────────────────────────────
# Authors the Castell de Montjuïc (Juan Martín Cermeño, 1751-1779) as a GLB, for
# the 3D city context.
#
#   C:\tools\blender-4.5.12-windows-x64\blender.exe -b -P scripts/blender/build-castell-montjuic-landmark.py
#
#   env LANDMARKS_PREVIEW=<dir>   also render preview sheets (whole fortress + keep)
#
# THE FRAME IS THE CONTRACT (see build-ciutadella-landmarks.py). The model is
# authored in the frame of castell_montjuic_landmark_site.json: origin at the
# entry's `centroid` (the vertex mean of the keep's outer ring, which falls in
# the Pati d'Armes), +X EAST, +Y NORTH, Z up. The app places the GLB there with
# no rotation and no scale, and samples the terrain AT THE ORIGIN ONLY.
#
# WHAT z = 0 IS. The origin is in the Pati d'Armes, so z = 0 is the courtyard
# and, with it, the parade ground (the esplanade round the keep) and the
# terrepleins of the bastions: the summit was levelled into one platform, and
# the whole enceinte is modelled as that platform with its walls. Everything
# else hangs off it: the keep rises 13 m to its roof terrace, the parapets 2.3 m,
# and the scarps drop to a moat floor 8 m down (z = -8), which is the height the
# mapped retaining walls of the outworks carry (height = 9).
#
# A HILLTOP ON A ONE-POINT GROUND. The terrain is sampled at the origin only,
# and 150 m out the real hill is already lower. So every wall that meets the
# ground goes on down as the same masonry to z = -12, not just to the -10 m
# skirt: where the terrain is at the platform it is buried, where the hill falls
# away it reads as more scarp — a revetment wall, which is what is there — and
# never as a part floating over a slope. Nothing is left standing on air.
#
# HOW THE ENCEINTE IS MADE, and why this way. The bastioned wall (relation
# 5739196) is mapped as a BAND: an outer ring (the magistral line, 53 vertices)
# and an inner ring (157) whose zig-zags are the gun embrasures cut through the
# parapet, splaying outward. A band with a hole cannot be one polygon, so:
#   • the parapet's lower course (to the embrasure sills) is the band filled
#     with its hole (tessellate_polygon handles holes), with the embrasure
#     notches smoothed out of the inner ring so the sills are solid;
#   • above the sills the parapet is split AT the embrasures into merlon-like
#     pieces, each a plain extruded polygon whose outer face is pulled onto the
#     magistral line — so the embrasures really go through, as mapped;
#   • the scarp under it is battered (1 in 10) from the cordon to the moat, by
#     offsetting the magistral line outward. The small rounded jogs at the
#     salients (the garites, sentry boxes, mapped as 1 m edges) are collapsed
#     out of the line first — an offset of 1.2 m would fold them inside out —
#     and put back as garites of their own.
#
# THE MOAT. Only its NW reach is mapped as an area (the Fossat, way 996701694,
# landuse=grass: the archery ground). The rest is bounded by mapped lines: the
# counterscarp (way 466476916) round the north bastion and down the NE front to
# the E salient (way 391984231), and way 1307905428 on the W bastion's south
# face. Those floors are built between the magistral line and those lines, in
# darker stone; the Fossat in grass.
#
# THE GATE. The main front is the NE curtain (between the bastions of Sant
# Carles and Santa Amàlia). The counterscarp line comes in to the curtain there
# along two parallel lines 5.4 m apart — the parapets of the access bridge — and
# ends round a small building:part (way 666192268) against a jog of the
# magistral line: the drawbridge bay in front of the gate. The bridge is four
# semicircular arches of Montjuïc stone and a timber drawbridge span, as the
# castle describes it; the portal is a neoclassical frontispiece (two columns,
# entablature, pediment).
#
# Same method as build-ciutadella-landmarks.py: explicit polygons with outward
# hints into one accumulator, sub-assemblies built at the origin and placed by
# matrices, per-face vertex colour (linear RGB), no textures.

import bpy
import json
import math
import os
import sys
from mathutils import Vector, Matrix
from mathutils.geometry import tessellate_polygon

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmark_kit import *  # noqa: E402,F401,F403 — Geo, solids, export, preview

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
SITE = json.load(open(os.path.join(HERE, 'castell_montjuic_landmark_site.json'), encoding='utf-8'))
OUT_DIR = os.path.join(REPO, 'public', 'models', 'landmarks')

BUDGET = {'castell-montjuic': 30000}


# ── Palette (linear RGB) ─────────────────────────────────────────────────────
# Montjuïc sandstone is a warm honey ochre; the terrace and the esplanade are a
# duller, dustier version of it; the moat floor is darker, the Fossat grassed.

STONE = (0.52, 0.34, 0.15)
STONE_L = (0.64, 0.45, 0.22)       # dressed trim: cordons, cornices, copings
STONE_D = (0.38, 0.24, 0.10)       # the battered scarps, weathered darker
STONE_W = (0.45, 0.29, 0.12)       # the keep's walls
PAVING = (0.47, 0.37, 0.23)        # roof terrace
ESPLANADE = (0.42, 0.34, 0.22)     # parade ground and terrepleins
SETT = (0.33, 0.28, 0.21)          # the Pati d'Armes (mapped surface=sett)
MOAT = (0.20, 0.16, 0.11)          # moat floor
GRASS = (0.11, 0.19, 0.05)         # the Fossat (landuse=grass)
SHADOW = (0.045, 0.035, 0.025)     # arches, doors, embrasure throats
WINDOW = (0.05, 0.05, 0.05)
WOOD = (0.22, 0.13, 0.06)
IRON = (0.05, 0.05, 0.05)


# ── Levels (m, z = 0 at the Pati d'Armes) ────────────────────────────────────

Z_SKIRT = -12.0     # every ground-touching wall goes on down to here (see header)
Z_MOAT = -8.0       # moat floor
Z_GLACIS = -1.5     # counterscarp coping: the covered way sits below the platform
Z_SILL = 1.0        # embrasure sills
Z_PAR = 2.3         # parapet coping
Z_BANQ = 1.2        # the NW banquette (7 mapped steps up from the esplanade)
Z_ROOF = 13.0       # keep roof terrace
Z_KPAR = 14.1       # keep parapet coping
BATTER = 1.2        # scarp batter over its full 12 m (1 in 10)


# ── 2D helpers ───────────────────────────────────────────────────────────────

def dist(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def seg_closest(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    q = (a[0] + dx * t, a[1] + dy * t)
    return dist(p, q), t, q


class Loop:
    """A closed ring with an arc-length parameter, for projecting points onto it."""

    def __init__(self, ring):
        self.r = open_ring(ring)
        self.n = len(self.r)
        self.s = [0.0]
        for i in range(self.n):
            self.s.append(self.s[-1] + dist(self.r[i], self.r[(i + 1) % self.n]))
        self.P = self.s[-1]

    def project(self, p):
        best = None
        for i in range(self.n):
            d, t, q = seg_closest(p, self.r[i], self.r[(i + 1) % self.n])
            if best is None or d < best[0]:
                best = (d, self.s[i] + t * (self.s[i + 1] - self.s[i]), q, i)
        return best          # (distance, arc-length, closest point, edge)

    def between(self, s0, s1):
        """Ring vertices strictly after arc-length s0 and before s1, going forward."""
        span = (s1 - s0) % self.P
        out = []
        for i in range(self.n):
            ds = (self.s[i] - s0) % self.P
            if 1e-6 < ds < span - 1e-6:
                out.append((ds, self.r[i]))
        return [p for _, p in sorted(out)]


def simplify(ring, min_len):
    """Collapse edges shorter than min_len, shortest first, each into whichever
    end lies farther from the ring's centre: a salient keeps its tip, so the
    simplified line never cuts inside the mapped one (the inner ring must stay
    inside it). Returns the ring and, per surviving vertex, the source points
    it absorbed."""
    r = [tuple(p) for p in open_ring(ring)]
    src = [[p] for p in r]
    cx = sum(p[0] for p in r) / len(r)
    cy = sum(p[1] for p in r) / len(r)
    while len(r) > 4:
        n = len(r)
        L, i = min((dist(r[k], r[(k + 1) % n]), k) for k in range(n))
        if L >= min_len:
            break
        j = (i + 1) % n
        if math.hypot(r[j][0] - cx, r[j][1] - cy) > math.hypot(r[i][0] - cx, r[i][1] - cy):
            r[i] = r[j]
        src[i] = src[i] + src[j]
        del r[j]
        del src[j]
    # drop near-collinear vertices
    k = 0
    while k < len(r) and len(r) > 4:
        n = len(r)
        a, b, c = r[k - 1], r[k], r[(k + 1) % n]
        u = (b[0] - a[0], b[1] - a[1])
        v = (c[0] - b[0], c[1] - b[1])
        ang = abs(math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]))
        if math.degrees(ang) < 2.0:
            src[k - 1] = src[k - 1] + src[k]
            del r[k]
            del src[k]
        else:
            k += 1
    return r, src


def edge_normal(a, b):
    """Outward normal of edge a->b of a CCW ring."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    return (dy / L, -dx / L)


def offset(ring, d):
    """Mitred offset of a ring, outward by d (inward if d < 0), any winding in,
    same winding and vertex order out."""
    r = open_ring(ring)
    sgn = 1.0 if ring_area(r) > 0 else -1.0      # make the normals outward
    n = len(r)
    out = []
    for i in range(n):
        a, b, c = r[i - 1], r[i], r[(i + 1) % n]
        n1 = edge_normal(a, b)
        n2 = edge_normal(b, c)
        n1 = (n1[0] * sgn, n1[1] * sgn)
        n2 = (n2[0] * sgn, n2[1] * sgn)
        m = (n1[0] + n2[0], n1[1] + n2[1])
        ml = math.hypot(*m)
        if ml < 1e-6:
            m = n1
            ml = 1.0
        m = (m[0] / ml, m[1] / ml)
        cosh = max(0.35, m[0] * n1[0] + m[1] * n1[1])
        out.append((b[0] + m[0] * d / cosh, b[1] + m[1] * d / cosh))
    return out


def point_in(p, ring):
    r = open_ring(ring)
    inside = False
    for i in range(len(r)):
        a, b = r[i - 1], r[i]
        if (a[1] > p[1]) != (b[1] > p[1]):
            x = a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if x > p[0]:
                inside = not inside
    return inside


# ── 3D helpers ───────────────────────────────────────────────────────────────

def cap(G, rings, z, col, up=True):
    """Fill an outer ring with holes at height z (tessellate_polygon: nested
    loops are holes). One shared-vertex group: it is flat, so smooth == flat."""
    loops = [[Vector((p[0], p[1], 0.0)) for p in open_ring(r)] for r in rings]
    flat = [p for L in loops for p in L]
    g = G.group()
    holes = [open_ring(r) for r in rings[1:]]
    for t in tessellate_polygon(loops):
        # scanfill decides holes by nesting; a triangle that still lands in a
        # hole (a thin concave hole can fool it) is dropped here
        c = ((flat[t[0]].x + flat[t[1]].x + flat[t[2]].x) / 3, (flat[t[0]].y + flat[t[1]].y + flat[t[2]].y) / 3)
        if any(point_in(c, h) for h in holes):
            continue
        G.poly([V(flat[i].x, flat[i].y, z) for i in t], col, (0, 0, 1 if up else -1), g)


def walls(G, ring, z0, z1, col, inward=False):
    """Vertical faces along a ring, facing out of it (or into it: a courtyard)."""
    r = ccw(ring)
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        if dist(a, b) < 1e-4:
            continue
        nx, ny = edge_normal(a, b)
        if inward:
            nx, ny = -nx, -ny
        G.poly([V(a[0], a[1], z0), V(b[0], b[1], z0), V(b[0], b[1], z1), V(a[0], a[1], z1)], col, (nx, ny, 0))


def batter(G, top, bot, z_top, z_bot, col):
    """The sloped face between a ring at z_top and its outward offset at z_bot
    (same vertex order, as `offset` returns it)."""
    t = open_ring(top)
    sgn = 1.0 if ring_area(t) > 0 else -1.0
    n = len(t)
    for i in range(n):
        j = (i + 1) % n
        nx, ny = edge_normal(t[i], t[j])
        G.poly([V(t[i][0], t[i][1], z_top), V(t[j][0], t[j][1], z_top),
                V(bot[j][0], bot[j][1], z_bot), V(bot[i][0], bot[i][1], z_bot)],
               col, (nx * sgn, ny * sgn, 0.1))


def ribbon(G, ring, d, z0, z1, col, top=None):
    """A moulding band round a ring, projecting d outward: top, bottom and front."""
    a = open_ring(ring)
    b = offset(a, d)
    sgn = 1.0 if ring_area(a) > 0 else -1.0
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        nx, ny = edge_normal(a[i], a[j])
        nx, ny = nx * sgn, ny * sgn
        G.poly([V(b[i][0], b[i][1], z0), V(b[j][0], b[j][1], z0),
                V(b[j][0], b[j][1], z1), V(b[i][0], b[i][1], z1)], col, (nx, ny, 0))
        G.poly([V(a[i][0], a[i][1], z1), V(a[j][0], a[j][1], z1),
                V(b[j][0], b[j][1], z1), V(b[i][0], b[i][1], z1)], top or col, (0, 0, 1))
        G.poly([V(a[i][0], a[i][1], z0), V(a[j][0], a[j][1], z0),
                V(b[j][0], b[j][1], z0), V(b[i][0], b[i][1], z0)], col, (0, 0, -1))


def parapet(G, ring, d, z0, z1, col, top, into):
    """A parapet standing on the edge of a roof: the band from `ring` to its
    offset by d (`into` = -1 toward the inside of the ring, +1 outward). Only
    the coping and the face toward the roof: the other face is the wall below,
    carried up to z1."""
    a = open_ring(ring)
    b = offset(a, into * d)
    sgn = 1.0 if ring_area(a) > 0 else -1.0
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        nx, ny = edge_normal(a[i], a[j])
        nx, ny = nx * sgn * into, ny * sgn * into
        G.poly([V(b[i][0], b[i][1], z0), V(b[j][0], b[j][1], z0),
                V(b[j][0], b[j][1], z1), V(b[i][0], b[i][1], z1)], col, (nx, ny, 0))
        G.poly([V(a[i][0], a[i][1], z1), V(a[j][0], a[j][1], z1),
                V(b[j][0], b[j][1], z1), V(b[i][0], b[i][1], z1)], top, (0, 0, 1))
    return b


def wall_path(G, pts, z0, z1, t, col, top=None):
    """A wall of thickness t along a polyline; segments overlap at the joints."""
    for a, b in zip(pts, pts[1:]):
        L = dist(a, b)
        if L < 0.05:
            continue
        d = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
        c = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        box(G, (c[0], c[1], (z0 + z1) / 2), (L + t, t, z1 - z0), col, math.atan2(d[1], d[0]),
            top=top, caps=(False, True))


def stair(G, a, b, z0, z1, w, col, steps=9):
    """A flight from a (at z0) to b (at z1), w wide, as a stepped solid."""
    L = dist(a, b)
    d = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
    prof = [(0.0, z0 - 0.5)]
    for i in range(steps):
        prof.append((L * i / steps, z0 + (z1 - z0) * (i + 1) / steps))
        prof.append((L * (i + 1) / steps, z0 + (z1 - z0) * (i + 1) / steps))
    prof.append((L, z0 - 0.5))
    nx, ny = -d[1], d[0]

    def P(u, v, s):
        return V(a[0] + d[0] * u + nx * s, a[1] + d[1] * u + ny * s, v)
    solid(G, prof, -w / 2, w / 2, col, P=P)


# ═════════════════════════════════════════════════════════════════════════════
# The site
# ═════════════════════════════════════════════════════════════════════════════

E = SITE['castell-montjuic']
ENS = E['ensemble']
KEEP = open_ring(E['members'][0]['pathEN_m'])            # building=castle, outer
COURT = open_ring(E['members'][1]['pathEN_m'])           # = the Pati d'Armes, w111986236
WELL = open_ring(E['members'][2]['pathEN_m'])            # the stair well (w646482525)
TOWER = open_ring(ENS['w646482521']['ringEN_m'])         # Torre de guaita (= members[3])
GATE_PART = open_ring(ENS['w666192268']['ringEN_m'])     # the drawbridge bay
FOSSAT = open_ring(ENS['w996701694']['ringEN_m'])
W_OUT = open_ring(ENS['r5739196']['members'][0]['pathEN_m'])
W_IN = open_ring(ENS['r5739196']['members'][1]['pathEN_m'])
CSCARP = ENS['w466476916']['ringEN_m']                   # counterscarp N and NE
CSCARP_E = ENS['w391984231']['ringEN_m']                 # counterscarp round the E salient
CSCARP_W = ENS['w1307905428']['ringEN_m']                # counterscarp, W bastion's S face
BANQ_W = ENS['w385708590']['ringEN_m']                   # the NW banquette's retaining walls
BANQ_E = ENS['w385708588']['ringEN_m']
CTX = E['context']

# The magistral line with the salient jogs collapsed (see header). 2.5 m keeps
# the gate's 2.4 m jog only as a blunted corner; the gatehouse covers it.
MAG, MAG_SRC = simplify(W_OUT, 2.5)
MAG_LOOP = Loop(MAG)


def garite_spots():
    """Garites stand where the mapped line had a cluster of short edges: the
    salients and shoulders. Each is put at the cluster's mean, which is on the
    rounded jog the mapper drew round it."""
    spots = []
    for src in MAG_SRC:
        if len(src) >= 3:
            xs = [p[0] for p in src]
            ys = [p[1] for p in src]
            if max(xs) - min(xs) < 7 and max(ys) - min(ys) < 7:
                spots.append((sum(xs) / len(xs), sum(ys) / len(ys)))
    # the south salient is a single mapped vertex (the garite is on the inner
    # ring there); it gets one too, on the tip
    spots.append((-81.1, -126.2))
    return spots


# ═════════════════════════════════════════════════════════════════════════════
# 1. THE ENCEINTE: platform, scarp, parapet with embrasures, garites
# ═════════════════════════════════════════════════════════════════════════════

def embrasures(inner, loop, near=1.6):
    """Runs of inner-ring vertices that reach the magistral line: the throats
    of the embrasures. Returns [(first, last)] index runs, in ring order."""
    n = len(inner)
    proj = [loop.project(p) for p in inner]
    isnear = [pr[0] < near for pr in proj]
    runs = []
    start = next(i for i in range(n) if not isnear[i])       # begin on a far vertex
    i = 0
    while i < n:
        k = (start + i) % n
        if isnear[k]:
            j = i
            while j + 1 < n and isnear[(start + j + 1) % n]:
                j += 1
            runs.append(((start + i) % n, (start + j) % n))
            i = j + 1
        else:
            i += 1
    return runs, proj, isnear


def build_enceinte(G):
    inner = W_IN
    # make the inner ring run the same way as the magistral line
    if (ring_area(inner) > 0) != (ring_area(MAG) > 0):
        inner = inner[::-1]
    # where the mapper drew a garite on both rings the band is a few cm thick,
    # and the simplified line may pass inside it: those few inner vertices are
    # pulled back 0.4 m inside the line (the garite stands over them anyway)
    sgn = 1.0 if ring_area(MAG) > 0 else -1.0
    fixed = []
    for p in inner:
        d, s_, q, i = MAG_LOOP.project(p)
        if not point_in(p, MAG) or d < 0.3:
            nx, ny = edge_normal(MAG[i], MAG[(i + 1) % len(MAG)])
            p = (q[0] - nx * sgn * 0.4, q[1] - ny * sgn * 0.4)
        fixed.append(p)
    moved = sum(1 for a, b in zip(inner, fixed) if dist(a, b) > 1e-6)
    inner = fixed
    print(f'[landmarks] castell-montjuic: {moved} inner-ring vertices kept 0.4 m inside the simplified line')
    runs, proj, isnear = embrasures(inner, MAG_LOOP)
    print(f'[landmarks] castell-montjuic: {len(runs)} embrasures from the mapped inner ring')
    smooth = [p for p, nr in zip(inner, isnear) if not nr]

    # the platform: parade ground and terrepleins, one level, battered all round
    foot = offset(MAG, BATTER)
    G.poly([V(x, y, 0.0) for x, y in MAG], ESPLANADE, (0, 0, 1))
    batter(G, MAG, foot, 0.0, Z_SKIRT, STONE_D)
    # the magistral cordon: a rounded stone string round the whole trace
    ribbon(G, MAG, 0.4, -0.6, -0.15, STONE_L)

    # parapet, lower course: the band with its embrasures filled to the sills
    cap(G, [MAG, smooth], Z_SILL, STONE_L)
    walls(G, MAG, 0.0, Z_SILL, STONE)
    walls(G, smooth, 0.0, Z_SILL, STONE, inward=True)

    # parapet, upper course: split at each embrasure, outer faces on the line
    n = len(inner)
    for k in range(len(runs)):
        a_end = runs[k][1]                     # last throat vertex of embrasure k
        b_start = runs[(k + 1) % len(runs)][0]  # first throat vertex of the next
        poly = [proj[a_end][2]]
        j = (a_end + 1) % n
        while j != b_start:
            poly.append(inner[j])
            j = (j + 1) % n
        poly.append(proj[b_start][2])
        back = MAG_LOOP.between(proj[a_end][1], proj[b_start][1])
        poly += back[::-1]
        solid(G, poly, Z_SILL, Z_PAR, STONE, top=STONE_L, caps=(False, True))

    # a gun in each embrasure: carriage on the terreplein behind the mouth,
    # barrel laid out through the throat (the NW ones stand on the banquette)
    strips = banquette_strips()
    for a, b in runs:
        fa, fb = inner[(a - 1) % n], inner[(b + 1) % n]
        m = ((fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2)
        t = ((proj[a][2][0] + proj[b][2][0]) / 2, (proj[a][2][1] + proj[b][2][1]) / 2)
        L = dist(m, t)
        if L < 1.0:
            continue
        ux, uy = (t[0] - m[0]) / L, (t[1] - m[1]) / L
        at = (m[0] - ux * 0.9, m[1] - uy * 0.9)
        z = Z_BANQ if any(point_in(at, st) for st in strips) else 0.0
        G.add(cannon(), place(at[0], at[1], z, yaw=math.atan2(uy, ux)))

    # garites: sentry boxes corbelled out at the salients
    for (x, y) in garite_spots():
        d, s, q, i = MAG_LOOP.project((x, y))
        # push out of the wall along the bisector of the salient
        c = (sum(p[0] for p in MAG) / len(MAG), sum(p[1] for p in MAG) / len(MAG))
        v = (q[0] - c[0], q[1] - c[1])
        vl = math.hypot(*v)
        gx, gy = q[0] + v[0] / vl * 0.5, q[1] + v[1] / vl * 0.5
        lathe(G, (gx, gy, 0), [(0.2, -2.2), (0.8, -1.2), (1.05, -0.3), (1.05, Z_PAR + 1.6),
                               (1.25, Z_PAR + 1.7), (1.25, Z_PAR + 1.95), (0.95, Z_PAR + 2.05),
                               (0.55, Z_PAR + 2.6), (0.0, Z_PAR + 2.9)], STONE_L, segs=10, smooth=True)
        ang = math.atan2(v[1], v[0])
        for da in (-0.9, 0.0, 0.9):
            a0 = ang + da
            nx, ny = math.cos(a0), math.sin(a0)
            w = Wall((gx + 1.06 * nx - ny * 0.12, gy + 1.06 * ny + nx * 0.12),
                     (gx + 1.06 * nx + ny * 0.12, gy + 1.06 * ny - nx * 0.12), (nx, ny))
            w.decal(G, [(0.0, Z_PAR + 0.2), (0.24, Z_PAR + 0.2), (0.24, Z_PAR + 1.2), (0.0, Z_PAR + 1.2)],
                    SHADOW, off=0.02)

    # the NW banquette: a raised walk behind the curtain, on its mapped walls
    for strip, path in zip(banquette_strips(), (BANQ_W, BANQ_E)):
        solid(G, strip, -0.3, Z_BANQ, STONE, top=ESPLANADE, caps=(False, True))
        # the returns of the mapped walls, as low walls down to the esplanade
        wall_path(G, path, -0.3, Z_BANQ + 0.1, 0.5, STONE, top=STONE_L)


def banquette_strips():
    """The walk between each mapped banquette wall (ways 385708590, 385708588)
    and the parapet: from the wall's long run out to 1 m short of the magistral
    line, i.e. tucked under the parapet."""
    out = []
    for path in (BANQ_W, BANQ_E):
        la, lb = (path[1], path[2]) if len(path) >= 3 else (path[0], path[1])
        mid = ((la[0] + lb[0]) / 2, (la[1] + lb[1]) / 2)
        d, s_, q, i = MAG_LOOP.project(mid)
        nx, ny = (q[0] - mid[0]) / d, (q[1] - mid[1]) / d     # toward the parapet
        w = d - 1.0
        out.append([la, lb, (lb[0] + nx * w, lb[1] + ny * w), (la[0] + nx * w, la[1] + ny * w)])
    return out


def cannon():
    """An 18th-century gun on its carriage, ~3 m, built facing +X at the origin."""
    C = Geo()
    boxz(C, -1.3, -0.45, 0.2, 0.45, 0.25, 0.85, WOOD)
    # the wheels: one short drum per axle, running through the cheeks
    for x in (-1.0, -0.05):
        cyl = Geo()
        lathe(cyl, (0, 0, -0.62), [(0.36, 0), (0.36, 1.24)], WOOD, segs=6, smooth=False)
        C.add(cyl, Matrix.Translation((x, 0, 0.36)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    B = Geo()
    lathe(B, (0, 0, 0), [(0.2, 0.0), (0.26, 0.15), (0.16, 2.6), (0.2, 2.8)], IRON, segs=6, smooth=True)
    C.add(B, Matrix.Translation((-1.1, 0, 1.05)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    return C


# ═════════════════════════════════════════════════════════════════════════════
# 2. THE MOAT: floors, counterscarps
# ═════════════════════════════════════════════════════════════════════════════

def nearest_vertex(ring, p):
    return min(range(len(ring)), key=lambda i: dist(ring[i], p))


def build_moat(G):
    # the Fossat: its edges along the scarp are drawn ~1.4 m off the magistral
    # line; snapped onto it, the floor runs in under the batter with no slot
    fos = []
    for p in FOSSAT:
        d, s, q, i = MAG_LOOP.project(p)
        fos.append(q if d < 3.0 else p)
    solid(G, fos, Z_SKIRT, Z_MOAT, MOAT, top=GRASS, caps=(False, True))

    # the north and NE reach: magistral line from the N bastion's west orillon
    # to the E salient, back along the counterscarps (the bridge throat, ways
    # 466476916 nodes 14..17, is passed straight over: the floor goes under it)
    i0 = nearest_vertex(MAG, (-46.0, 76.0))
    i1 = nearest_vertex(MAG, (113.7, -23.4))
    ring = []
    i = i0
    while True:
        ring.append(MAG[i])
        if i == i1:
            break
        i = (i + 1) % len(MAG)
    ring += CSCARP_E
    rev = CSCARP[19::-1]              # 115.39,-2.04 back to the west end
    rev = [p for k, p in zip(range(19, -1, -1), rev) if not 14 <= k <= 17 and k >= 3]
    ring += rev
    ring += [(-62.03, 92.29), (-57.84, 94.53), (-47.4, 76.51)]     # the Fossat's east edge
    solid(G, ring, Z_SKIRT, Z_MOAT, MOAT, caps=(False, True))

    # the W bastion's south face: magistral line from the W salient to its
    # shoulder, back along way 1307905428 to the Fossat's corner
    j0 = nearest_vertex(MAG, (-122.37, -26.71))
    j1 = nearest_vertex(MAG, (-157.0, 4.5))
    ringw = []
    i = j0
    while True:
        ringw.append(MAG[i])
        if i == j1:
            break
        i = (i + 1) % len(MAG)
    ringw += [(-158.12, 6.4)] + CSCARP_W[::-1]
    solid(G, ringw, Z_SKIRT, Z_MOAT, MOAT, caps=(False, True))

    # counterscarps: revetted, coped at the covered way
    fos_out = [(-158.12, 6.4), (-177.07, 0.41), (-193.12, 29.98), (-193.56, 54.19), (-159.55, 56.56),
               (-125.68, 58.9), (-62.03, 92.29), (-57.84, 94.53)]
    wall_path(G, fos_out, Z_SKIRT, Z_GLACIS, 1.2, STONE_D, top=STONE_L)
    wall_path(G, CSCARP[3:14], Z_SKIRT, Z_GLACIS, 1.2, STONE_D, top=STONE_L)
    wall_path(G, CSCARP[18:20] + CSCARP_E[::-1][1:], Z_SKIRT, Z_GLACIS, 1.2, STONE_D, top=STONE_L)
    wall_path(G, CSCARP_W, Z_SKIRT, Z_GLACIS, 1.2, STONE_D, top=STONE_L)
    # the covered way's parapet along the Fossat's outer edge (way 466476916, west part)
    wall_path(G, CSCARP[0:4], Z_SKIRT, Z_GLACIS + 1.0, 0.8, STONE, top=STONE_L)


# ═════════════════════════════════════════════════════════════════════════════
# 3. THE GATE AND THE BRIDGE — NE front
# ═════════════════════════════════════════════════════════════════════════════
#
# Built in the bridge's own frame: +X along the axis from the gate face (x = 0)
# out to the counterscarp, +Y across, then placed once. The axis is the mean of
# the two mapped parapet lines; x = 0 is the mapped jog of the magistral line.

GATE_FACE = ((45.48, 38.1), (49.57, 31.34))
BR_A = ((69.69 + 71.86) / 2, (50.65 + 45.62) / 2)          # counterscarp end
BR_B = ((48.62 + 51.28) / 2, (38.24 + 33.47) / 2)          # inner end of the stone span


def build_gate(G):
    ux, uy = BR_A[0] - BR_B[0], BR_A[1] - BR_B[1]
    L = math.hypot(ux, uy)
    ux, uy = ux / L, uy / L
    g0 = ((GATE_FACE[0][0] + GATE_FACE[1][0]) / 2, (GATE_FACE[0][1] + GATE_FACE[1][1]) / 2)
    s_b = (BR_B[0] - g0[0]) * ux + (BR_B[1] - g0[1]) * uy      # drawbridge bay depth
    s_a = (BR_A[0] - g0[0]) * ux + (BR_A[1] - g0[1]) * uy
    W = 5.4
    B = Geo()

    # the stone span: four semicircular arches between an abutment in the
    # moat and one in the counterscarp
    span, pier = 4.2, 1.6
    s_end = s_a + 1.5
    a0 = s_b + (s_a - s_b - (4 * span + 3 * pier)) / 2
    zs, r = -5.3, span / 2
    prof = [(s_b, 0.0), (s_end, 0.0), (s_end, Z_SKIRT)]
    for k in range(3, -1, -1):
        a = a0 + k * (span + pier)
        b = a + span
        prof.append((b, Z_SKIRT))
        prof.append((b, zs))
        for i in range(1, 8):
            t = math.pi * i / 8
            prof.append((a + r + r * math.cos(t), zs + r * math.sin(t)))
        prof.append((a, zs))
        prof.append((a, Z_SKIRT))
    prof.append((s_b, Z_SKIRT))
    solid(B, prof, -W / 2 + 0.3, W / 2 - 0.3, STONE, P=lambda u, v, w: V(u, w, v), top=STONE)
    # deck paving and the two parapets, coped
    boxz(B, s_b, -W / 2 + 0.3, s_end, W / 2 - 0.3, -0.05, 0.02, PAVING)
    for sg in (-1, 1):
        y0, y1 = (-W / 2, -W / 2 + 0.5) if sg < 0 else (W / 2 - 0.5, W / 2)
        boxz(B, s_b, y0, s_end, y1, -0.9, 0.95, STONE, top=STONE_L)
        # archivolts: a lighter ring round each arch on both faces
        for k in range(4):
            a = a0 + k * (span + pier)
            ring = []
            for i in range(9):
                t = math.pi * i / 8
                ring.append((a + r + (r + 0.5) * math.cos(t), zs + (r + 0.5) * math.sin(t)))
            for i in range(8, -1, -1):
                t = math.pi * i / 8
                ring.append((a + r + r * math.cos(t), zs + r * math.sin(t)))
            yf = sg * (W / 2 - 0.3)
            solid(B, ring, yf, yf + sg * 0.12, STONE_L, P=lambda u, v, w: V(u, w, v))
        # a string course under the parapet
        boxz(B, s_b, y0 - (0.12 if sg < 0 else 0) , s_end, y1 + (0.12 if sg > 0 else 0), -1.2, -0.9, STONE_L)

    # the drawbridge: a timber span over the bay (way 666192268), with its chains
    boxz(B, 0.05, -1.7, s_b, 1.7, -0.35, 0.0, WOOD)
    for sg in (-1, 1):
        strut(B, (0.3, sg * 1.55, 5.0), (s_b - 0.1, sg * 1.55, 0.05), 0.07, IRON)
    # the bay's side walls, from the moat up to the deck
    for sg in (-1, 1):
        boxz(B, 0.0, sg * 1.8 - 0.35, s_b, sg * 1.8 + 0.35, Z_SKIRT, -0.4, STONE_D)

    # the gatehouse: through the curtain's thickness, higher than the parapet
    gd = 7.5
    boxz(B, -gd, -5.8, 0.0, 5.8, Z_SKIRT, 5.4, STONE, top=PAVING)
    boxz(B, -gd - 0.2, -6.0, 0.25, 6.0, 5.4, 5.8, STONE_L)
    for x0_, x1_ in ((-gd, -gd + 0.5), (-0.5, 0.25)):
        boxz(B, x0_, -6.0, x1_, 6.0, 5.8, 6.6, STONE)
    # the portal (outer face, x = 0): arch, two columns, entablature, pediment
    B.poly([V(0.26, y, z) for y, z in arch_outline(-1.6, 1.6, 0.0, 2.8, 8)], SHADOW, (1, 0, 0))
    for yy in (-2.5, 2.5):
        boxz(B, 0.0, yy - 0.5, 0.75, yy + 0.5, -0.4, 0.8, STONE_L)
        lathe(B, (0.45, yy, 0.8), [(0.36, 0), (0.33, 0.2), (0.3, 3.1), (0.42, 3.3), (0.42, 3.5)],
              STONE_L, segs=10, smooth=True)
    boxz(B, 0.0, -3.3, 0.85, 3.3, 4.3, 5.1, STONE_L)
    ped = [(-3.5, 5.1), (3.5, 5.1), (0.0, 6.7)]
    solid(B, ped, 0.0, 0.9, STONE_L, P=lambda u, v, w: V(w, u, v))
    # the passage's inner mouth, toward the parade ground
    B.poly([V(-gd - 0.02, y, z) for y, z in arch_outline(-1.8, 1.8, 0.0, 2.9, 8)], SHADOW, (-1, 0, 0))

    G.add(B, place(g0[0], g0[1], 0.0, yaw=math.atan2(uy, ux)))


# ═════════════════════════════════════════════════════════════════════════════
# 4. THE KEEP — relation 1574427: casemates round the Pati d'Armes
# ═════════════════════════════════════════════════════════════════════════════
#
# Two storeys of barrel-vaulted rooms in a ring round the courtyard, a flat
# roof terrace with a plain parapet (it is walked, for the views), and the
# watchtower on the NE face (mapped as a hole in the keep: it is its own
# building). The SW hole is the stair well (way 646482525): three mapped flights
# meet at a landing — from the courtyard side up, then on up both ways.

def keep_windows(G, a, b, n_out, skip):
    w = Wall(a, b, n_out)
    L = w.L
    k = int((L - 4.0) / 5.6)
    for i in range(k):
        s = (i + 0.5) * L / k
        p = w.p(s, 0)
        if skip(p):
            continue
        for z0, z1 in ((2.6, 4.2), (8.2, 10.0)):
            w.decal(G, [(s - 0.55, z0), (s + 0.55, z0), (s + 0.55, z1), (s - 0.55, z1)], WINDOW)
            w.block(G, s - 0.8, s + 0.8, z0 - 0.25, z0, 0.12, STONE_L)


def build_keep(G):
    # tower footprint grown 3% about its centre: proud of the keep face it is
    # flush with, instead of fighting it
    tc = (sum(p[0] for p in TOWER) / len(TOWER), sum(p[1] for p in TOWER) / len(TOWER))

    def near_tower(p):
        return math.hypot(p[0] - tc[0], p[1] - tc[1]) < 7.5

    K = ccw(KEEP)
    walls(G, K, Z_SKIRT, Z_KPAR, STONE_W)
    # courtyard and stair well walls, facing in
    walls(G, COURT, -0.3, Z_KPAR, STONE_W, inward=True)
    walls(G, WELL, -0.3, Z_KPAR, STONE_W, inward=True)
    # the roof terrace, its parapets, and the cornice under them
    ko = parapet(G, K, 0.6, Z_ROOF, Z_KPAR, STONE_W, STONE_L, -1)
    co = parapet(G, COURT, 0.6, Z_ROOF, Z_KPAR, STONE_W, STONE_L, +1)
    wo = parapet(G, WELL, 0.5, Z_ROOF, Z_KPAR, STONE_W, STONE_L, +1)
    cap(G, [ko, co, wo], Z_ROOF, PAVING)
    ribbon(G, K, 0.35, Z_ROOF - 0.9, Z_ROOF - 0.35, STONE_L)
    ribbon(G, K, 0.2, 6.3, 6.6, STONE_L)
    ribbon(G, K, 0.3, -0.3, 0.9, STONE, top=STONE_L)          # plinth
    # courtyard floor (sett) and the stair well
    G.poly([V(x, y, 0.02) for x, y in COURT], SETT, (0, 0, 1))
    G.poly([V(x, y, 0.02) for x, y in WELL], SETT, (0, 0, 1))
    hub = (-34.32, -21.75)
    stair(G, (-28.8, -18.7), hub, 0.0, 3.0, 2.2, STONE_L)
    boxz(G, hub[0] - 1.3, hub[1] - 1.3, hub[0] + 1.3, hub[1] + 1.3, -0.3, 3.0, STONE_L)
    stair(G, hub, (-30.8, -28.13), 3.0, 6.0, 2.0, STONE_L)
    stair(G, hub, (-37.6, -15.82), 3.0, 6.0, 2.0, STONE_L)

    # outer faces: two rows of casemate windows; the gate toward the NE
    for i in range(len(K)):
        a, b = K[i], K[(i + 1) % len(K)]
        n_out = edge_normal(a, b)
        keep_windows(G, a, b, n_out, near_tower)
    # the keep's door: on the stretch of its NE face that looks across the
    # parade ground at the main gate (the tower takes the rest of that face)
    a, b = KEEP[1], KEEP[2]          # (10.27, 49.95) -> (26.96, 22.53)
    wk = Wall(a, b)
    if wk.n.x * 0.87 + wk.n.y * 0.5 < 0:          # face it NE, out of the keep
        wk = Wall(a, b, (-wk.n.x, -wk.n.y))
    sd = wk.L - 9.0
    wk.block(G, sd - 3.2, sd + 3.2, -0.3, 6.0, 0.5, STONE_L)
    wk.decal(G, arch_outline(sd - 1.7, sd + 1.7, 0.0, 3.0, 8), SHADOW, off=0.53)

    # the Pati d'Armes: two storeys of round-arched galleries between piers
    C = ccw(COURT)
    for i in range(len(C)):
        a, b = C[i], C[(i + 1) % len(C)]
        nx, ny = edge_normal(a, b)
        w = Wall(a, b, (-nx, -ny))
        L = w.L
        k = max(1, round((L - 1.0) / 4.6))
        bay = (L - 1.0) / k
        for j in range(k):
            s0 = 0.5 + j * bay
            c = s0 + bay / 2
            w.decal(G, arch_outline(c - 1.5, c + 1.5, 0.0, 3.2, 6), SHADOW)
            w.decal(G, arch_outline(c - 1.25, c + 1.25, 7.0, 8.8, 6), SHADOW)
            w.block(G, c - 0.7, c + 0.7, 6.95, 7.05 + 0.05, 0.35, STONE_L)    # gallery sill
        for j in range(k + 1):
            s = 0.5 + j * bay
            w.block(G, s - 0.4, s + 0.4, -0.3, Z_ROOF - 0.4, 0.28, STONE)
        w.block(G, 0.0, L, 6.1, 6.45, 0.34, STONE_L)
        w.block(G, 0.0, L, Z_ROOF - 0.9, Z_ROOF - 0.4, 0.4, STONE_L)


# ═════════════════════════════════════════════════════════════════════════════
# 5. TORRE DE GUAITA — way 646482521
# ═════════════════════════════════════════════════════════════════════════════
#
# The watchtower on the keep's NE face: a square shaft of two storeys above the
# terrace, a cornice and parapet, a small arcaded lantern and the flagpole.

def build_tower(G):
    r = TOWER
    tc = (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))
    T = [(tc[0] + (x - tc[0]) * 1.03, tc[1] + (y - tc[1]) * 1.03) for x, y in r]
    ZT = 20.0
    solid(G, T, Z_SKIRT, ZT, STONE_W, top=PAVING, caps=(False, True))
    ribbon(G, T, 0.35, ZT - 0.9, ZT - 0.35, STONE_L)
    ribbon(G, T, 0.2, Z_KPAR + 0.3, Z_KPAR + 0.6, STONE_L)
    parapet(G, T, 0.45, ZT, ZT + 1.1, STONE_W, STONE_L, -1)
    walls(G, T, ZT - 0.01, ZT + 1.1, STONE_W)
    # windows on the two storeys above the terrace, all four faces
    Tc = ccw(T)
    for i in range(len(Tc)):
        a, b = Tc[i], Tc[(i + 1) % len(Tc)]
        if dist(a, b) < 3.0:
            continue
        w = Wall(a, b)
        s = w.L / 2
        for z0, z1 in ((15.2, 16.9), (17.6, 19.0)):
            w.decal(G, arch_outline(s - 0.6, s + 0.6, z0, z1 - 0.6, 6), WINDOW)
        w.decal(G, [(s - 0.5, 3.0), (s + 0.5, 3.0), (s + 0.5, 4.5), (s - 0.5, 4.5)], WINDOW)
        w.decal(G, [(s - 0.5, 8.5), (s + 0.5, 8.5), (s + 0.5, 10.0), (s - 0.5, 10.0)], WINDOW)
    # the lantern: square, an arch each side, a low pyramid cap, the flagpole
    a, b = Tc[0], Tc[1]
    yaw = math.atan2(b[1] - a[1], b[0] - a[0])
    Ln = Geo()
    boxz(Ln, -2.0, -2.0, 2.0, 2.0, 0.0, 3.2, STONE_L, top=STONE_L)
    for k in range(4):
        wf = Wall((-2.0, -2.0), (2.0, -2.0), (0, -1))
        Lk = Geo()
        wf.decal(Lk, arch_outline(1.1, 2.9, 0.4, 1.9, 6), SHADOW)
        Ln.add(Lk, Matrix.Rotation(k * math.pi / 2, 4, 'Z'))
    boxz(Ln, -2.3, -2.3, 2.3, 2.3, 3.2, 3.55, STONE_L)
    lathe(Ln, (0, 0, 3.55), [(3.2, 0), (0.0, 1.4)], STONE_D, segs=4, smooth=False, phase=math.pi / 4)
    lathe(Ln, (0, 0, 4.9), [(0.08, 0), (0.05, 7.0)], IRON, segs=6, smooth=False)
    lathe(Ln, (0, 0, 11.9), [(0.14, 0), (0.14, 0.2), (0.0, 0.3)], IRON, segs=6, smooth=False)
    G.add(Ln, place(tc[0], tc[1], ZT, yaw=yaw))


# ═════════════════════════════════════════════════════════════════════════════

def build_castell_montjuic():
    G = Geo()
    build_enceinte(G)
    build_moat(G)
    build_gate(G)
    build_keep(G)
    build_tower(G)
    return G


BUILDERS = {'castell-montjuic': (build_castell_montjuic, 'castell-montjuic', 75)}


# ── Build, export, preview ───────────────────────────────────────────────────
# The kit's `run` would do, but its preview puts a ground plane at z = 0, which
# would hide a moat 8 m down and every scarp. So this loop builds and exports
# exactly as `run` does, and for the preview only lifts a COPY of the mesh by
# 12 m (the ground plane then sits at z = -12, under everything) and draws the
# mapped outlines itself, at the parapet coping, so the top view can be checked
# against them.

def outline_object(rings, z, name):
    F = Geo()
    for rg in rings:
        rr = open_ring(rg)
        closed = len(rg) > 2 and dist(rg[0], rg[-1]) < 1e-6
        segs = list(zip(rr, rr[1:] + rr[:1])) if closed else list(zip(rr, rr[1:]))
        for a, b in segs:
            strut(F, (a[0], a[1], z), (b[0], b[1], z), 0.45, (1, 0, 0), d=0.12)
    ob = to_object(F, name)
    m = bpy.data.materials.new(name + '-m')
    m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (0.9, 0.05, 0.02, 1)
    bs.inputs['Emission Color'].default_value = (0.9, 0.05, 0.02, 1)
    bs.inputs['Emission Strength'].default_value = 2.0
    ob.data.materials.clear()
    ob.data.materials.append(m)
    return ob


def crop(G, x0, y0, x1, y1):
    """The faces of G wholly inside a plan box (10 m slack): for close preview
    sheets. The platform and the long scarps fall out, which is the point."""
    C = Geo()
    for f, c, sm in zip(G.faces, G.cols, G.smooth):
        pts = [G.verts[i] for i in f]
        if all(x0 - 10 <= p[0] <= x1 + 10 and y0 - 10 <= p[1] <= y1 + 10 for p in pts):
            C.poly([Vector(p) for p in pts], c, newell([Vector(p) for p in pts]))
    return C


def cull(ob):
    """three.js draws front faces only; so does the preview, so a face wound
    the wrong way shows up in the sheet as a hole."""
    for m in ob.data.materials:
        m.use_backface_culling = True


def main():
    out_dir = os.environ.get('LANDMARKS_OUT') or OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    prev = os.environ.get('LANDMARKS_PREVIEW')
    failures = []
    for name, (build, _, front_az) in BUILDERS.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        G = build()
        ob = to_object(G, name)
        tris = tri_count(ob)
        path = os.path.join(out_dir, f'{name}.glb')
        export(ob, path)
        lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
        hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
        kb = os.path.getsize(path) / 1024
        over = tris > BUDGET[name]
        if over:
            failures.append(f'{name}: {tris} tris > {BUDGET[name]}')
        print(f'[landmarks] {name:22} {tris:6} tris {kb:8.1f} KB  '
              f'x[{lo[0]:.1f},{hi[0]:.1f}] y[{lo[1]:.1f},{hi[1]:.1f}] z[{lo[2]:.2f},{hi[2]:.2f}]'
              + ('  ** OVER BUDGET **' if over else ''))
        if prev:
            os.makedirs(prev, exist_ok=True)
            lift = -Z_SKIRT
            rings = [KEEP, COURT, WELL, TOWER, GATE_PART, FOSSAT, W_OUT, W_IN,
                     CSCARP, CSCARP_E, CSCARP_W]
            # whole fortress
            ob.data.transform(Matrix.Translation((0, 0, lift)))
            outline_object(rings, lift + Z_PAR + 0.3, 'outline')
            cull(ob)
            preview(ob, name, [], front_az, os.path.join(prev, f'{name}.png'))
            # closer: the keep, the NE front with the gate, the W bastion
            crops = [('keep', (-70, -72, 52, 52), front_az), ('gate', (5, -5, 95, 80), 35),
                     ('west', (-200, -40, -90, 60), 200)]
            if os.environ.get('LANDMARKS_CROP'):          # x0,y0,x1,y1,az — for a closer look
                c_ = [float(v) for v in os.environ['LANDMARKS_CROP'].split(',')]
                crops = [('crop', tuple(c_[:4]), c_[4])]
            for tag, box_, az in crops:
                bpy.ops.wm.read_factory_settings(use_empty=True)
                C = crop(G, *box_)
                cob = to_object(C, f'{name}-{tag}')
                cull(cob)
                cob.data.transform(Matrix.Translation((0, 0, lift)))
                preview(cob, f'{name}-{tag}', [], az, os.path.join(prev, f'{name}-{tag}.png'))
    if failures:
        print('[landmarks] FAILED:\n  ' + '\n  '.join(failures))
        sys.exit(1)
    print('[landmarks] all landmarks within budget')


main()
