# ─── build-montjuic-landmarks.py ──────────────────────────────────────────────
# Authors four landmarks of the 1929 Exposition axis on Montjuïc as GLB, for the
# 3D city context: the Palau Nacional, the Font Màgica, the Torres Venecianes
# (one model, placed twice) and the Barcelona Pavilion.
#
#   C:\tools\blender-4.5.12-windows-x64\blender.exe -b -P scripts/blender/build-montjuic-landmarks.py
#
#   env LANDMARKS_ONLY=palau-nacional,font-magica   build a subset
#   env LANDMARKS_PREVIEW=<dir>                     also render a 2x2 preview sheet per model
#
# THE FRAME IS THE CONTRACT (see build-ciutadella-landmarks.py). Every model is
# authored in the frame of its entry in montjuic_landmarks_site.json: origin at
# that entry's `centroid`, +X EAST, +Y NORTH, Z up, z = 0 = the ground at the
# centroid. The app places each GLB there with no rotation and no scale.
#
# MONTJUÏC IS A HILLSIDE, and the app samples the terrain at the origin only.
# So every ground-touching solid runs down to z = -6 m as a hidden foundation
# skirt (the Palau Nacional to -10 m: it stands on a terrace well above the
# fountains, and its north face is a real retaining wall). Where the ground
# falls away, the skirt reads as the plinth it is; where it rises, it is buried.
#
# THE AXIS. The whole Exposition is laid out on one grid, turned ~27° off the
# compass: the Avinguda de la Reina Maria Cristina runs from Plaça d'Espanya
# (NNW) up to the Palau (SSE) at a bearing of ~117° in the +X-east frame. Every
# footprint here has its edges on that grid, so each model is built square to
# its own local axes (u along the grid's 27° direction, v along 117°) and turned
# onto the grid ONCE at the end, by the angle measured from its own mapped
# outline (`grid_angle`) — never a hard-coded bearing.
#
# NO TEXTURES. Colour is per-face vertex colour (linear RGB).

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
    'palau-nacional': 30000,
    'font-magica': 15000,
    'torre-veneciana': 8000,
    'pavello-mies': 10000,
}


# ── Palette (linear RGB) ─────────────────────────────────────────────────────

STONE = (0.56, 0.42, 0.25)       # the Palau's warm beige artificial stone
STONE_L = (0.66, 0.52, 0.33)
STONE_D = (0.40, 0.29, 0.17)
ROOF = (0.34, 0.29, 0.23)
DOME = (0.47, 0.38, 0.26)
DOME_RIB = (0.62, 0.49, 0.31)
PAVING = (0.50, 0.41, 0.28)
WINDOW = (0.045, 0.04, 0.035)
SHADOW = (0.10, 0.075, 0.05)

WATER = (0.05, 0.17, 0.21)
WATER_L = (0.09, 0.26, 0.30)
JET = (0.72, 0.82, 0.86)         # pale: reads as white water against the basin
CURTAIN = (0.40, 0.56, 0.60)     # the thin sheets spilling over the tier rims
FOUNTAIN_STONE = (0.62, 0.53, 0.40)
FOUNTAIN_STONE_L = (0.72, 0.64, 0.50)

BRICK = (0.36, 0.10, 0.045)      # the towers' red brick
BRICK_D = (0.24, 0.065, 0.03)
TOWER_STONE = (0.80, 0.70, 0.50)  # OSM building:colour #f6eabe on the stone parts
COPPER = (0.14, 0.055, 0.035)    # OSM roof:colour #46251e on the pyramids

TRAVERTINE = (0.74, 0.67, 0.51)
TRAVERTINE_D = (0.60, 0.53, 0.39)
ONYX = (0.66, 0.43, 0.17)
GREEN_MARBLE = (0.035, 0.10, 0.06)
GLASS_T = (0.07, 0.10, 0.10)     # the grey-green tinted glass
GLASS_F = (0.62, 0.64, 0.62)     # the frosted light wall
CHROME = (0.78, 0.80, 0.83)
ROOF_WHITE = (0.82, 0.82, 0.80)
POOL_DARK = (0.02, 0.045, 0.05)  # black-lined basins
BRONZE = (0.18, 0.11, 0.05)


# ── Frame helpers ────────────────────────────────────────────────────────────

def grid_angle(ring):
    """The grid bearing of a rectilinear outline: the length-weighted mean of
    its edge directions, folded mod 90° (so any edge, either way round, votes
    for the same axis). Returns radians in (-45°, 45°]."""
    r = open_ring(ring)
    sx = sy = 0.0
    for a, b in zip(r, r[1:] + r[:1]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        t = math.atan2(b[1] - a[1], b[0] - a[0])
        sx += L * math.cos(4 * t)
        sy += L * math.sin(4 * t)
    return math.atan2(sy, sx) / 4


def to_local(p, th):
    c, s = math.cos(th), math.sin(th)
    return (p[0] * c + p[1] * s, -p[0] * s + p[1] * c)


def local_ring(ring, th):
    return [to_local(p, th) for p in open_ring(ring)]


def bbox_c(r):
    x0, y0, x1, y1 = ring_bbox(r)
    return (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0


def blk(G, w, s0, s1, z0, z1, depth, col, off=0.0, caps=(False, True)):
    """Wall.block without the hidden bottom face (the kit's has all six)."""
    o = w.p((s0 + s1) / 2, (z0 + z1) / 2, off + depth / 2)
    fbox(G, o, w.d, w.n, Vector((0, 0, 1)), s1 - s0, depth, z1 - z0, col, caps=caps)


def loft(G, rings, col, centre, smooth=True):
    """Quads between consecutive 3D rings of equal length (a drum, a shell).
    Outward = away from `centre` — right for the convex shells built here."""
    g = G.group() if smooth else None
    c = Vector(centre)
    for A, B in zip(rings, rings[1:]):
        n = len(A)
        for k in range(n):
            q = [A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]]
            mid = sum(q, Vector()) / 4
            G.poly(q, col, mid - c, g)


def stadium(cu, cv, hs, au, av, n=8, ns=4):
    """A stadium outline, CCW: two half-ellipse ends (semi-axes au, av) whose
    centres are hs either side of (cu, cv), joined by straights split in ns."""
    pts = []
    for i in range(n + 1):
        t = -math.pi / 2 + math.pi * i / n
        pts.append((cu + hs + au * math.cos(t), cv + av * math.sin(t)))
    for i in range(1, ns):
        pts.append((cu + hs - 2 * hs * i / ns, cv + av))
    for i in range(n + 1):
        t = math.pi / 2 + math.pi * i / n
        pts.append((cu - hs + au * math.cos(t), cv + av * math.sin(t)))
    for i in range(1, ns):
        pts.append((cu - hs + 2 * hs * i / ns, cv - av))
    return pts


def square_frustum(G, c, h0, z0, h1, z1, col, caps=True):
    """A square frustum / pyramid, axis-aligned, half-widths h0 -> h1."""
    k = math.sqrt(2.0)
    lathe(G, c, [(h0 * k, z0), (h1 * k, z1)], col, segs=4, phase=math.pi / 4, smooth=False,
          caps=caps)


# ═════════════════════════════════════════════════════════════════════════════
# 1. PALAU NACIONAL (MNAC) — way 43995751 (Cendoya, Catà, Domènech i Roura, 1929)
# ═════════════════════════════════════════════════════════════════════════════
#
# WHICH WAY IT FACES. The mapped outline is rectilinear on the 27° grid. Turned
# square to it, the long wings run along u (168 m, -80..88) and the depth runs
# along v (147 m): the full-width front range is at v 57..65 and the narrower
# rear block and its two back pavilions reach v -82. Three mapped things put the
# front on +v (NNW, toward the city): the Carrer Mirador del Palau Nacional
# (w43995750) runs straight along v = 86.8 in front of that range, the two
# monumental stairs (w61885612, w61885587) and the cascade basins (w126852909..)
# leave it downhill on +v, and the Font Màgica's centroid lies 353 m out on the
# same axis. The axis of symmetry is at u = 4.1 (the mid-point of the wings,
# the end pavilions and the front body all agree to 0.3 m), not at the vertex
# centroid, so everything symmetric is placed about AX.
#
# The mapped building:part ways are used as they are: the four corner towers
# (w214445447/-446 front, w666599320/-321 rear) at the angles of the Sala Oval,
# the big stadium-shaped dome over it (w214445448, 88 x 60 m) with its crown
# (w666599310, 43 x 15 m), the round dome behind the portico (w214445445,
# 22 m), the two smaller domes on the end pavilions (w214445442/-439), the small
# cupola over the entrance (w666599319), the rear dome (w666599312) and the two
# back pavilions (w666599313/-314).
#
# HEIGHTS (no OSM heights): the wings' cornice at 17 m, the end pavilions and
# back pavilions to 20.5 m, the Sala Oval block to 22 m and the front body to
# 23.5 m. The Sala Oval is 30 m high inside (MNAC), so its dome's drum is taken
# to 36 m, the shell to 47 m and the lantern to ~55 m above the terrace. The
# Santiago/Giralda-style towers stop just below the drum's top at ~47 m, as in
# every view from Plaça d'Espanya. z = 0 is the terrace in front, which is also
# the building's ground floor; the whole mass sits on a skirt to -10 m.

ZF_PALAU = -10.0


def clean_ring(ring, min_edge=1.2):
    """Collapse edges shorter than min_edge onto their mid-points, then drop
    collinear vertices: the mapped outline has 0.3-1 m jogs that a mitred
    offset would fold over. Used only for the mouldings, never for the walls."""
    r = [tuple(p) for p in ccw(ring)]
    changed = True
    while changed and len(r) > 4:
        changed = False
        n = len(r)
        Ls = [math.hypot(r[(i + 1) % n][0] - r[i][0], r[(i + 1) % n][1] - r[i][1]) for i in range(n)]
        i = min(range(n), key=lambda k: Ls[k])
        if Ls[i] < min_edge:
            a, b = r[i], r[(i + 1) % n]
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if i + 1 < n:
                r[i:i + 2] = [m]
            else:
                r = [m] + r[1:-1]
            changed = True
    out = []
    n = len(r)
    for i in range(n):
        a, b, c = r[i - 1], r[i], r[(i + 1) % n]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) > 0.05 * math.hypot(b[0] - a[0], b[1] - a[1]) * math.hypot(c[0] - b[0], c[1] - b[1]):
            out.append(b)
    return ccw(out)


def offset_ring(r, d):
    """Mitred offset of a CCW ring, d > 0 outward."""
    n = len(r)
    out = []
    for i in range(n):
        a, b, c = r[i - 1], r[i], r[(i + 1) % n]
        l1 = math.hypot(b[0] - a[0], b[1] - a[1])
        l2 = math.hypot(c[0] - b[0], c[1] - b[1])
        n1 = ((b[1] - a[1]) / l1, -(b[0] - a[0]) / l1)
        n2 = ((c[1] - b[1]) / l2, -(c[0] - b[0]) / l2)
        k = 1.0 + n1[0] * n2[0] + n1[1] * n2[1]
        k = max(k, 0.3)
        out.append((b[0] + (n1[0] + n2[0]) * d / k, b[1] + (n1[1] + n2[1]) * d / k))
    return out


def band(G, r, d_in, d_out, z0, z1, col, top=True, inner=False, bottom=False):
    """A moulding run all round a cleaned CCW ring, between offsets d_in and
    d_out: outer face, optional inner face, top and underside strips. Six
    triangles an edge, where per-edge boxes cost twelve and overlap at corners."""
    O = offset_ring(r, d_out)
    I = offset_ring(r, d_in)
    n = len(r)
    for i in range(n):
        j = (i + 1) % n
        a, b = r[i], r[j]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        nn = ((b[1] - a[1]) / L, -(b[0] - a[0]) / L, 0)
        G.poly([V(*O[i], z0), V(*O[j], z0), V(*O[j], z1), V(*O[i], z1)], col, nn)
        if inner:
            G.poly([V(*I[i], z0), V(*I[j], z0), V(*I[j], z1), V(*I[i], z1)], col,
                   (-nn[0], -nn[1], 0))
        if top:
            G.poly([V(*O[i], z1), V(*O[j], z1), V(*I[j], z1), V(*I[i], z1)], col, (0, 0, 1))
        if bottom:
            G.poly([V(*O[i], z0), V(*O[j], z0), V(*I[j], z0), V(*I[i], z0)], col, (0, 0, -1))


def facade(G, ring, z1, bay=4.8, z0=0.0, windows=True, parapet=True, min_len=2.5):
    """Plinth, string course, cornice and parapet as bands round the outline,
    and a pilastered bay rhythm: on a full-height front a ground-floor window
    and a tall arched main-floor window per bay; on an attic storey one small
    window per bay, kept inside the storey."""
    rc = clean_ring(ring)
    tall = z1 - z0 > 12
    band(G, rc, 0.0, 0.22, z0 - 0.6, z0 + 1.3, STONE_D, top=True)
    band(G, rc, 0.0, 0.55, z1 - 1.0, z1, STONE_L, top=True, bottom=True)
    if parapet:
        band(G, rc, -0.3, 0.0, z1, z1 + 1.1, STONE_L, top=True, inner=True)
    if tall:
        band(G, rc, 0.0, 0.16, z0 + 7.3, z0 + 7.8, STONE_L, top=True, bottom=True)
    if not windows:
        return
    r = ccw(ring)
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < max(min_len, bay * 0.9):
            continue
        w = Wall(a, b)
        n = max(1, int(round(L / bay)))
        step = L / n
        for k in range(1, n):
            sm = k * step
            blk(G, w, sm - 0.45, sm + 0.45, z0 + 1.3, z1 - 1.0, 0.18, STONE_L, caps=(False, False))
        for k in range(n):
            sm = (k + 0.5) * step
            hw = min(1.0, step / 2 - 0.9)
            if hw < 0.4:
                continue
            if tall:
                w.decal(G, [(sm - hw * 0.8, z0 + 2.3), (sm + hw * 0.8, z0 + 2.3),
                            (sm + hw * 0.8, z0 + 5.4), (sm - hw * 0.8, z0 + 5.4)], WINDOW)
                w.decal(G, arch_outline(sm - hw, sm + hw, z0 + 8.8, z1 - 3.0 - hw, 4), WINDOW)
            elif z1 - z0 >= 3.0:
                zt = z1 - 1.3
                zb = max(z0 + 0.6, zt - 1.6)
                w.decal(G, [(sm - hw * 0.6, zb), (sm + hw * 0.6, zb), (sm + hw * 0.6, zt),
                            (sm - hw * 0.6, zt)], WINDOW)


def drum_windows(G, ring2, z0, z1, col_pil, n_skip=1):
    """Arched windows and pilasters on each segment of a drum (a convex CCW ring)."""
    r = ccw(ring2)
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1.2:
            continue
        w = Wall(a, b)
        blk(G, w, 0, 0.35 * min(L, 2.5), z0, z1, 0.25, col_pil)
        if i % n_skip == 0:
            hw = min(0.9, L * 0.28)
            w.decal(G, arch_outline(L / 2 - hw, L / 2 + hw, z0 + (z1 - z0) * 0.22,
                                    z1 - (z1 - z0) * 0.14 - hw, 6), WINDOW)


def round_dome(G, cu, cv, r, z0, z_drum, z_top, lantern=True, segs=16, ribs=True, col=DOME):
    """Drum + ribbed shell + lantern for a round dome of radius r."""
    lathe(G, (cu, cv, z0), [(r, 0), (r, z_drum - z0)], STONE, segs=segs, smooth=False, caps=False)
    ring2 = [(cu + r * math.cos(2 * math.pi * k / segs), cv + r * math.sin(2 * math.pi * k / segs))
             for k in range(segs)]
    drum_windows(G, ring2, z0, z_drum, STONE_L)
    lathe(G, (cu, cv, z_drum - 0.6), [(r + 0.45, 0), (r + 0.45, 0.6)], STONE_L, segs=segs,
          smooth=False, caps=False)
    h = z_top - z_drum
    prof = [(r * math.cos(math.pi / 2 * i / 6) + 0.05, h * math.sin(math.pi / 2 * i / 6))
            for i in range(6)]
    rl = r * 0.2
    prof.append((rl, h * 0.97))
    lathe(G, (cu, cv, z_drum), [(r + 0.05, 0)] + prof[1:], col, segs=segs, smooth=True, caps=False)
    if ribs:
        for k in range(0, segs, 4):
            a = 2 * math.pi * (k + 0.5) / segs
            pts = [V(cu + (pr + 0.12) * math.cos(a), cv + (pr + 0.12) * math.sin(a), z_drum + pz)
                   for pr, pz in prof]
            for p, q in zip(pts, pts[1:]):
                strut(G, p, q, 0.35 * r / 6, DOME_RIB, d=0.22)
    if lantern:
        zl = z_drum + h * 0.97
        # a small open lantern: drum, cornice, cupola, finial
        lathe(G, (cu, cv, zl), [(rl, 0), (rl, r * 0.3), (rl * 1.2, r * 0.33), (rl * 0.95, r * 0.36),
                                (rl * 0.55, r * 0.47), (0.12, r * 0.53), (0.0, r * 0.68)], STONE_L,
              segs=8, smooth=True)


def tower(h_base):
    """A Santiago/Giralda-style corner tower, 12.6 m square, built at the
    origin from z = 0 (its foot on the roof it rises from) to z = h_base + 25."""
    G = Geo()
    hw = 6.3
    z1 = h_base + 5.0                         # square shaft clears the roof
    boxz(G, -hw, -hw, hw, hw, 0, z1, STONE, caps=(False, False))
    for (a, b) in (((-hw, -hw), (hw, -hw)), ((hw, -hw), (hw, hw)), ((hw, hw), (-hw, hw)),
                   ((-hw, hw), (-hw, -hw))):
        w = Wall(a, b)
        blk(G, w, 0, 1.2, 0, z1, 0.3, STONE_L)
        blk(G, w, w.L - 1.2, w.L, 0, z1, 0.3, STONE_L)
        w.decal(G, arch_outline(w.L / 2 - 1.3, w.L / 2 + 1.3, z1 - 4.2, z1 - 2.6, 6), WINDOW)
        blk(G, w, 0, w.L, z1 - 0.8, z1, 0.5, STONE_L)
    # stage 2: the belfry, 9.4 m square, three arches a side
    z2 = z1 + 8.0
    h2 = 4.7
    boxz(G, -hw, -hw, hw, hw, z1, z1 + 0.3, STONE_L, caps=(False, True))
    boxz(G, -h2, -h2, h2, h2, z1 + 0.3, z2, STONE, caps=(False, False))
    for (a, b) in (((-h2, -h2), (h2, -h2)), ((h2, -h2), (h2, h2)), ((h2, h2), (-h2, h2)),
                   ((-h2, h2), (-h2, -h2))):
        w = Wall(a, b)
        for k in range(3):
            sm = w.L * (k + 0.5) / 3
            w.decal(G, arch_outline(sm - 0.95, sm + 0.95, z1 + 1.4, z2 - 2.6, 6), SHADOW)
        for sm in (0.0, w.L / 3, 2 * w.L / 3, w.L):
            blk(G, w, max(0, sm - 0.3), min(w.L, sm + 0.3), z1 + 0.3, z2 - 0.6, 0.25, STONE_L)
        blk(G, w, 0, w.L, z2 - 0.8, z2, 0.5, STONE_L)
    # corner pinnacles on the shaft's parapet
    for x in (-hw + 0.6, hw - 0.6):
        for y in (-hw + 0.6, hw - 0.6):
            lathe(G, (x, y, z1 + 0.3), [(0.55, 0), (0.55, 1.1), (0.3, 1.3), (0.0, 3.2)], STONE_L,
                  segs=4, phase=math.pi / 4, smooth=False)
    # stage 3: an octagonal lantern with arches
    z3 = z2 + 5.0
    r3 = 3.6
    boxz(G, -h2, -h2, h2, h2, z2, z2 + 0.3, STONE_L, caps=(False, True))
    lathe(G, (0, 0, z2 + 0.3), [(r3, 0), (r3, z3 - z2 - 0.3)], STONE, segs=8, phase=math.pi / 8,
          smooth=False, caps=False)
    oc = [(r3 * math.cos(math.pi / 8 + math.pi / 4 * k), r3 * math.sin(math.pi / 8 + math.pi / 4 * k))
          for k in range(8)]
    for i in range(8):
        w = Wall(oc[i], oc[(i + 1) % 8])
        w.decal(G, arch_outline(w.L / 2 - 0.65, w.L / 2 + 0.65, z2 + 1.0, z3 - 1.6, 6), SHADOW)
    lathe(G, (0, 0, z3), [(r3 + 0.35, 0), (r3 + 0.35, 0.5), (r3 - 0.2, 0.5)], STONE_L, segs=8,
          phase=math.pi / 8, smooth=False)
    for x, y in oc[::2]:
        lathe(G, (x * 1.12, y * 1.12, z2 + 0.3), [(0.35, 0), (0.25, 2.0), (0.0, 3.4)], STONE_L,
              segs=4, smooth=False)
    # stage 4: a cupola, then the finial
    lathe(G, (0, 0, z3 + 0.5), [(r3 - 0.2, 0), (r3 - 0.5, 1.2), (2.3, 2.3), (1.0, 3.0), (0.35, 3.3)],
          DOME, segs=8, phase=math.pi / 8, smooth=True, caps=False)
    lathe(G, (0, 0, z3 + 3.7), [(0.35, 0), (0.55, 0.5), (0.2, 1.0), (0.0, 2.6)], STONE_L, segs=6,
          smooth=False)
    return G


def build_palau():
    s = SITE['palau-nacional']
    th = grid_angle(s['ringEN_m'])
    R = local_ring(s['ringEN_m'], th)
    ctx = s['context']

    def L(wid):
        return local_ring(ctx[wid]['ringEN_m'], th)
    G = Geo()
    ZF = ZF_PALAU
    AX = 4.1
    ZW = 17.0          # wing cornice
    ZP = 20.5          # end / back pavilions
    ZS = 22.0          # Sala Oval block
    ZC = 23.5          # front body

    # ── the terrace in front: z 0, out to the Mirador (w43995750, v = 86.8)
    TV = 87.6
    solid(G, rect(-100.0, 50.0, 107.5, TV), ZF, 0.0, STONE_D, top=PAVING)
    front = Wall((107.5, TV), (-100.0, TV))
    for k in range(int(front.L / 6.0)):
        s0 = 1.5 + k * 6.0
        blk(G, front, s0, s0 + 0.8, ZF, 0.0, 0.25, STONE)
    blk(G, front, 0, front.L, -0.5, 0.0, 0.3, STONE_L)
    # balustrade along the terrace edge, open at the two stair heads and the
    # cascade's belvedere on the axis
    for u0, u1 in ((-99.6, -15.8), (-7.0, 16.2), (25.0, 107.1)):
        balustrade(G, (u0, TV - 0.3, 0.0), (u1, TV - 0.3, 0.0), STONE_L, h=1.05, pitch=1.25)
    # lamp standards along the terrace
    for u in (-90, -70, -50, -30, 38, 58, 78, 98):
        lathe(G, (u, TV - 1.2, 0), [(0.35, 0), (0.25, 0.8), (0.12, 1.0), (0.1, 4.2), (0.3, 4.4),
                                    (0.0, 4.9)], ROOF, segs=6, smooth=False)

    # ── the two monumental stairs down from the terrace (upper flights only):
    # w61885612 on u = -11.4 and w61885587 on u = 20.7, both straight down +v to
    # the first landing at v = 110.3, which runs outward to u -35.3 / 44.6. The
    # drop is a judgement (the next flights and the terrain below take the rest).
    V0, V1, DROP = TV, 110.3, 6.0
    n = 26
    tread, rise = (V1 - V0) / n, DROP / n
    prof = [(V0, ZF), (V0, 0.0)]
    for i in range(n):
        prof.append((V0 + (i + 1) * tread, -i * rise))
        prof.append((V0 + (i + 1) * tread, -(i + 1) * rise))
    prof += [(V1 + 3.8, -DROP), (V1 + 3.8, ZF)]
    for ua, ub, lo, hi in ((-15.4, -7.4, -39.4, -15.4), (16.6, 24.8, 24.8, 48.6)):
        solid(G, prof, ua, ub, STONE_L, P=lambda a, b, w: V(w, a, b))
        solid(G, rect(lo, V1, hi, V1 + 3.8), ZF, -DROP, STONE_D, top=PAVING)
        for u in (ua, ub):
            strut(G, (u, V0, 0.2), (u, V1, -DROP + 0.2), 0.45, STONE, d=1.9)
        balustrade(G, (lo, V1 + 3.5, -DROP), (hi, V1 + 3.5, -DROP), STONE_L, h=1.05, pitch=1.25)

    # ── the building: the whole mapped outline to the wings' cornice
    solid(G, R, ZF, ZW, STONE, top=ROOF)
    facade(G, R, ZW)

    # end pavilions (front corners, 14.5 m wide) and back pavilions: an attic storey
    pav = [rect(-74.4, 4.0, -60.6, 63.0), rect(68.6, 3.6, 82.8, 63.0)]
    back = [L('w666599313'), L('w666599314')]
    for P_ in pav + back:
        solid(G, P_, ZW, ZP, STONE, top=ROOF, caps=(False, True))
        facade(G, P_, ZP, z0=ZW, bay=3.6, parapet=True)
    # the Sala Oval block between the four towers
    SALA = rect(-45.3, -57.0, 52.4, 22.0)
    solid(G, SALA, ZW, ZS, STONE, top=ROOF, caps=(False, True))
    facade(G, SALA, ZS, z0=ZW, bay=4.2)
    # the front body: a U of two piers round the portico, back to the Sala block
    BODY = [(-17.2, 22.0), (25.4, 22.0), (25.4, 65.2), (15.5, 65.2), (15.5, 62.3), (-6.9, 62.3),
            (-6.9, 65.3), (-17.2, 65.3)]
    solid(G, BODY, ZW, ZC, STONE, top=ROOF, caps=(False, True))
    facade(G, BODY, ZC, z0=ZW, bay=3.4)

    # ── the portico: steps up to the entrance, six giant columns, an attic above
    for i in range(6):
        boxz(G, -6.9, 62.3, 15.5, 65.3 - i * 0.5, ZF if i == 0 else 0.0, 0.25 * (i + 1),
             STONE_L, caps=(False, True))
    for k in range(6):
        u = -5.3 + k * (19.2 / 5)
        lathe(G, (u, 64.3, 1.5), [(0.85, 0), (0.75, 0.5), (0.68, 0.8), (0.66, 12.0), (0.56, 12.6),
                                  (0.95, 13.1), (0.95, 13.5)], STONE_L, segs=10, smooth=True)
    boxz(G, -6.9, 63.1, 15.5, 65.3, 15.0, ZC, STONE, top=ROOF)
    w = Wall((15.5, 65.3), (-6.9, 65.3))
    blk(G, w, 0, w.L, 15.0, 16.6, 0.3, STONE_L)
    blk(G, w, -0.6, w.L + 0.6, ZC - 1.0, ZC, 0.6, STONE_L)
    blk(G, w, 0, w.L, ZC, ZC + 1.2, 0.3, STONE_L, off=-0.3)
    for k in range(5):
        sm = w.L * (k + 0.5) / 5
        w.decal(G, [(sm - 1.2, 17.6), (sm + 1.2, 17.6), (sm + 1.2, 21.2), (sm - 1.2, 21.2)], SHADOW)
    for k in range(3):                                   # the doors, in shadow
        u = 0.6 + k * 3.5
        G.poly([V(u - 1.1, 62.28, 1.5), V(u + 1.1, 62.28, 1.5), V(u + 1.1, 62.28, 6.2),
                V(u - 1.1, 62.28, 6.2)], WINDOW, (0, 1, 0))
    G.poly([V(-6.9, 62.28, 1.5), V(15.5, 62.28, 1.5), V(15.5, 62.28, 15.0), V(-6.9, 62.28, 15.0)],
           STONE_D, (0, 1, 0))
    G.poly([V(-6.9, 63.1, 14.98), V(15.5, 63.1, 14.98), V(15.5, 62.3, 14.98), V(-6.9, 62.3, 14.98)],
           STONE_D, (0, 0, -1))

    # ── the four corner towers of the Sala Oval
    for wid in ('w214445447', 'w214445446', 'w666599320', 'w666599321'):
        cu, cv, _, _ = bbox_c(L(wid))
        G.add(tower(ZS), place(cu, cv, 0.0))

    # ── the great dome over the Sala Oval, on the mapped stadium (w214445448)
    # rising to its mapped crown (w666599310)
    OU, OV = 3.7, -16.9          # centre of the outer stadium
    base = dict(hs=17.0, au=27.2, av=30.0)
    crown = dict(hs=15.3, au=6.4, av=7.7)
    Z0, ZD0, ZD1, ZTOP = ZS, ZS + 2.0, 36.0, 47.0
    solid(G, stadium(OU, OV, base['hs'], base['au'], base['av'], 8, 4), Z0, ZD0, STONE,
          top=ROOF, caps=(False, True))
    dr = 0.93
    drum = stadium(OU, OV, base['hs'], base['au'] * dr - 2.0, base['av'] * dr - 2.0, 8, 6)
    ring_lo = [V(u, v, ZD0) for u, v in drum]
    ring_hi = [V(u, v, ZD1) for u, v in drum]
    loft(G, [ring_lo, ring_hi], STONE, (OU, OV, ZD0), smooth=False)
    drum_windows(G, drum, ZD0, ZD1 - 0.8, STONE_L)
    lip = stadium(OU, OV, base['hs'], base['au'] * dr - 1.4, base['av'] * dr - 1.4, 8, 6)
    solid(G, lip, ZD1 - 0.8, ZD1, STONE_L, caps=(True, False))
    # the shell: quarter-ellipse profile from the drum's head to the crown
    rings = []
    K = 7
    for i in range(K + 1):
        t = math.pi / 2 * i / K
        f = math.cos(t)
        hs = crown['hs'] + (base['hs'] - crown['hs']) * f
        au = crown['au'] + (base['au'] * dr - 2.0 - crown['au']) * f
        av = crown['av'] + (base['av'] * dr - 2.0 - crown['av']) * f
        z = ZD1 + (ZTOP - ZD1) * math.sin(t)
        rings.append([V(u, v, z) for u, v in stadium(OU, OV, hs, au, av, 8, 6)])
    # the shell starts a hair inside the lip so the two never z-fight
    loft(G, rings, DOME, (OU, OV, ZD1 - 8.0))
    top = rings[-1]
    G.poly(top, DOME_RIB, (0, 0, 1))
    nr = len(top)
    for k in range(0, nr, 4):
        pts = [r_[k] + Vector((0, 0, 0.15)) for r_ in rings]
        for p, q in zip(pts, pts[1:]):
            strut(G, p, q, 0.7, DOME_RIB, d=0.3)
    # the crown's balustrade, the lantern on the axis and its cupola
    band(G, ccw([(p.x, p.y) for p in top]), -0.35, 0.0, ZTOP, ZTOP + 1.0, STONE_L, inner=True)
    lathe(G, (AX, OV + 0.5, ZTOP), [(4.2, 0), (4.2, 5.0), (4.8, 5.3), (4.8, 5.8)], STONE, segs=12,
          smooth=False)
    lan = [(AX + 4.2 * math.cos(2 * math.pi * k / 12), OV + 0.5 + 4.2 * math.sin(2 * math.pi * k / 12))
           for k in range(12)]
    drum_windows(G, lan, ZTOP + 0.3, ZTOP + 4.8, STONE_L)
    lathe(G, (AX, OV + 0.5, ZTOP + 5.8), [(4.3, 0), (3.6, 1.2), (2.2, 2.2), (0.6, 2.7)], DOME,
          segs=12, smooth=True, caps=False)
    lathe(G, (AX, OV + 0.5, ZTOP + 8.5), [(0.6, 0), (0.8, 0.4), (0.25, 1.2), (0.0, 2.4)], STONE_L,
          segs=6, smooth=False)

    # ── the round dome behind the portico (w214445445), on the front body
    cu, cv, dw, _ = bbox_c(L('w214445445'))
    round_dome(G, cu, cv, dw / 2 - 0.4, ZC, ZC + 5.0, ZC + 13.5, segs=16)
    # the entrance cupola (w666599319) and the rear dome (w666599312)
    cu, cv, dw, _ = bbox_c(L('w666599319'))
    round_dome(G, cu, cv, dw / 2, ZC, ZC + 2.0, ZC + 4.4, segs=10, ribs=False)
    cu, cv, dw, _ = bbox_c(L('w666599312'))
    round_dome(G, cu, cv, dw / 2, ZW, ZS + 2.2, ZS + 8.0, segs=12, ribs=False)
    # the two smaller domes on the end pavilions (w214445442 / -439)
    for wid in ('w214445442', 'w214445439'):
        cu, cv, dw, _ = bbox_c(L(wid))
        round_dome(G, cu, cv, dw / 2, ZP, ZP + 3.4, ZP + 9.0, segs=12)

    G.transform(Matrix.Rotation(th, 4, 'Z'))
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 2. FONT MÀGICA — way 35816134 (Carles Buïgas, 1929)
# ═════════════════════════════════════════════════════════════════════════════
#
# Three concentric basins at stepped levels (Viquipèdia): the main basin is
# pseudo-elliptical, the middle one a 35 m circle and the upper one a 12 m
# circle, each ~1.6 m above the one below. The main basin follows the mapped
# outline exactly — its long axis lies across the avenue at 27° (64 m) and its
# short axis along it (48 m) — with a wide stone kerb on it. The two circles
# are centred on the outline's bounding-box centre (-0.7, -1.5), which is also
# its area centroid. The water is modelled as flat water-coloured surfaces (the
# mapped fountain polygon is replaced by them); the jets are a sparse static
# set of pale jet columns with plume heads. No balustrade: the rim is the low, wide kerb
# people sit on during the shows.

def build_font_magica():
    s = SITE['font-magica']
    ring = ccw(open_ring(s['ringEN_m']))
    G = Geo()
    ZF = -6.0
    cx, cy = -0.7, -1.5
    ZK, ZW0 = 0.7, 0.4                 # kerb top, main basin water
    ZW1 = ZW0 + 1.6                    # middle basin water
    ZW2 = ZW1 + 1.6                    # upper basin water
    R1, R2 = 17.5, 6.0

    # main basin: the mapped outline as a stone body, its top is the water
    solid(G, ring, ZF, ZW0, FOUNTAIN_STONE, top=WATER)
    # the kerb: an outward-leaning coping on every edge of the outline
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        du, dv = b[0] - a[0], b[1] - a[1]
        Le = math.hypot(du, dv)
        if Le < 0.05:
            continue
        nx, ny = dv / Le, -du / Le
        dx, dy = du / Le, dv / Le
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        # body of the kerb straddling the line, down into the skirt
        fbox(G, V(mx - nx * 0.25, my - ny * 0.25, (ZF + ZK - 0.15) / 2), (dx, dy, 0), (nx, ny, 0),
             (0, 0, 1), Le + 0.35, 1.0, ZK - 0.15 - ZF, FOUNTAIN_STONE, caps=(False, True))
        # the coping, a hair wider
        fbox(G, V(mx - nx * 0.25, my - ny * 0.25, ZK - 0.075), (dx, dy, 0), (nx, ny, 0), (0, 0, 1),
             Le + 0.4, 1.25, 0.15, FOUNTAIN_STONE_L, caps=(True, True))

    # middle basin: a 35 m drum rising from the main water, with its own water
    seg1 = 48
    lathe(G, (cx, cy, ZW0 - 0.3), [(R1, 0), (R1, ZW1 + 0.25 - ZW0 + 0.3)], FOUNTAIN_STONE,
          segs=seg1, smooth=True, caps=False)
    lathe(G, (cx, cy, ZW1 + 0.25), [(R1 + 0.35, 0), (R1 + 0.35, 0.2), (R1 - 0.6, 0.2)],
          FOUNTAIN_STONE_L, segs=seg1, smooth=False, caps=False)
    lathe(G, (cx, cy, ZW1 - 0.1), [(R1 - 0.6, 0), (R1 - 0.6, 0.1)], WATER, segs=seg1,
          smooth=False, caps=True)
    # the thin curtain spilling over the middle rim into the main basin
    lathe(G, (cx, cy, ZW0), [(R1 + 0.9, 0), (R1 + 0.4, 1.0), (R1 + 0.36, ZW1 + 0.2 - ZW0)], CURTAIN,
          segs=seg1, smooth=True, caps=False)
    # the upper basin: a 12 m drum on the middle water
    seg2 = 24
    lathe(G, (cx, cy, ZW1 - 0.3), [(R2, 0), (R2, ZW2 + 0.25 - ZW1 + 0.3)], FOUNTAIN_STONE,
          segs=seg2, smooth=True, caps=False)
    lathe(G, (cx, cy, ZW2 + 0.25), [(R2 + 0.3, 0), (R2 + 0.3, 0.2), (R2 - 0.5, 0.2)],
          FOUNTAIN_STONE_L, segs=seg2, smooth=False, caps=False)
    lathe(G, (cx, cy, ZW2 - 0.1), [(R2 - 0.5, 0), (R2 - 0.5, 0.1)], WATER_L, segs=seg2,
          smooth=False, caps=True)
    lathe(G, (cx, cy, ZW1), [(R2 + 0.8, 0), (R2 + 0.35, 0.9), (R2 + 0.32, ZW2 + 0.2 - ZW1)], CURTAIN,
          segs=seg2, smooth=True, caps=False)
    # the nozzle rings: dark bronze collars under the jets, on the water
    lathe(G, (cx, cy, ZW1), [(11.2, 0), (11.2, 0.12), (10.6, 0.12)], BRONZE, segs=seg1,
          smooth=False, caps=False)

    # the jets (static): columns that swell into a plume head, the way a jet
    # reads from a distance — never cones
    def jet(x, y, z, h, r0, segs=8):
        lathe(G, (x, y, z), [(r0, 0), (r0 * 0.8, h * 0.55), (r0 * 0.95, h * 0.78),
                             (r0 * 1.3, h * 0.9), (r0 * 0.9, h * 0.99), (0.0, h * 1.03)],
              JET, segs=segs, smooth=True)
    jet(cx, cy, ZW2, 17.0, 0.8, segs=10)
    # the spray skirt round its foot
    ellipsoid(G, (cx, cy, ZW2), (2.8, 2.8, 1.3), JET, segs=12, rings=4)
    # eight round the upper basin, eight round the middle one (alternate
    # heights), and ten low bubbling jets in the main basin
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        jet(cx + 3.8 * math.cos(a), cy + 3.8 * math.sin(a), ZW2, 8.5, 0.35, segs=6)
    for k in range(8):
        a = 2 * math.pi * k / 8
        jet(cx + 10.9 * math.cos(a), cy + 10.9 * math.sin(a), ZW1, 6.0 if k % 2 else 4.2, 0.3, segs=6)
    per = []
    cum = [0.0]
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    for k in range(10):
        target = cum[-1] * (k + 0.25) / 10
        j = max(i for i in range(n) if cum[i] <= target)
        a, b = ring[j], ring[(j + 1) % n]
        t = (target - cum[j]) / max(1e-6, cum[j + 1] - cum[j])
        px, py = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        dx, dy = cx - px, cy - py
        d = math.hypot(dx, dy)
        per.append((px + dx / d * 3.5, py + dy / d * 3.5))
    for x, y in per:
        lathe(G, (x, y, ZW0 - 0.05), [(0.45, 0), (0.45, 0.2), (0.3, 0.3)], BRONZE, segs=6,
              smooth=False)
        ellipsoid(G, (x, y, ZW0 + 0.25), (0.7, 0.7, 0.55), JET, segs=8, rings=4)
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 3. TORRES VENECIANES — way 305825434 (Ramon Reventós, 1929)
# ═════════════════════════════════════════════════════════════════════════════
#
# ONE MODEL FOR BOTH TOWERS. The west tower (w305825434) is the entry; the east
# one (w305825435) reuses this GLB at its own centroid. Their mapped outlines
# are the same 9.5 x 9.4 m square on the same ~27° grid (`check_twin_towers`
# prints both: three edges agree to 0.03 m; the east one's north corner sits
# ~0.45 m out, which makes one edge 9.96 m and tilts its mean bearing 0.7°, a
# tracing wobble rather than a different tower — their base, shaft and roof
# building:parts agree to 0.03 m, the gallery slabs to 0.25 m). So the model is built square and symmetric about its centroid.
#
# HEIGHTS come from the mapped building:parts of each tower (identical for the
# two): a 5 m stone base (w35816010, 8.6 m square, 1 m mansard), the brick shaft
# to 35 m (w305825431, 7.6 m square), a 0.5 m gallery slab at 35 m that is the
# widest part and so the outline itself (w305825429, 9.5 m), and the stone
# belfry from 35 m with a 6 m pyramid roof to 47 m (w305825427, 7.55 m,
# roof:colour #46251e — copper). The top is modelled after the St Mark's
# campanile it copies: arcaded belfry, attic, pyramid, and a small open
# pavilion carrying the spire.

def check_twin_towers():
    w = SITE['torre-veneciana']
    e = w['ensemble']['w305825435']['ringEN_m']
    A = open_ring(w['ringEN_m'])
    B = open_ring(e)
    ta, tb = grid_angle(A), grid_angle(B)
    ea = sorted(math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(A, A[1:] + A[:1]))
    eb = sorted(math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(B, B[1:] + B[:1]))
    print(f'[landmarks] torre-veneciana twin check: bearing {math.degrees(ta):.2f} vs '
          f'{math.degrees(tb):.2f} deg; edges {["%.2f" % x for x in ea]} vs {["%.2f" % x for x in eb]}')


def build_torre():
    s = SITE['torre-veneciana']
    th = grid_angle(s['ringEN_m'])
    R = local_ring(s['ringEN_m'], th)
    cu, cv, wu, wv = bbox_c(R)
    HG = (wu + wv) / 4                     # the gallery's half-width (mapped outline)
    G = Geo()
    ZF = -6.0
    H0 = 4.3                               # stone base, 8.6 m
    H1 = 3.79                              # brick shaft, 7.58 m
    H2 = 3.78                              # belfry, 7.55 m
    rnd = Rand(1929)

    def sides(h):
        return [((-h, -h), (h, -h)), ((h, -h), (h, h)), ((h, h), (-h, h)), ((-h, h), (-h, -h))]

    # stone base with a moulded foot, a cornice, and its 1 m mansard to the shaft
    boxz(G, -H0, -H0, H0, H0, ZF, 4.0, TOWER_STONE, caps=(False, False))
    boxz(G, -H0 - 0.2, -H0 - 0.2, H0 + 0.2, H0 + 0.2, ZF, 0.7, TOWER_STONE, caps=(False, True))
    boxz(G, -H0 - 0.15, -H0 - 0.15, H0 + 0.15, H0 + 0.15, 3.6, 4.0, TOWER_STONE, caps=(True, False))
    square_frustum(G, (0, 0, 4.0), H0 + 0.15, 0.0, H1, 1.0, TOWER_STONE, caps=False)
    for a, b in sides(H0):
        w = Wall(a, b)
        w.decal(G, arch_outline(w.L / 2 - 1.1, w.L / 2 + 1.1, 0.7, 2.3, 8), SHADOW)
        for s0 in (0.9, w.L - 1.7):
            w.decal(G, [(s0, 1.4), (s0 + 0.8, 1.4), (s0 + 0.8, 3.0), (s0, 3.0)],
                    (0.70, 0.60, 0.42))

    # the brick shaft: core, five lesenes a face, blind arches under the cornice
    ZS0, ZS1 = 5.0, 33.6
    boxz(G, -H1 + 0.12, -H1 + 0.12, H1 - 0.12, H1 - 0.12, 4.9, ZS1, BRICK, caps=(False, False))
    for a, b in sides(H1 - 0.12):
        w = Wall(a, b)
        n = 4
        pan = w.L / n
        for k in range(n + 1):
            s0 = k * pan
            blk(G, w, max(-0.12, s0 - 0.3), min(w.L + 0.12, s0 + 0.3), ZS0 - 0.1, ZS1, 0.12, BRICK)
        for k in range(n):
            sm = (k + 0.5) * pan
            hw = pan / 2 - 0.3
            # the arch heads of the panels, a course of darker brick
            w.decal(G, [(sm + hw * math.cos(math.pi * i / 6), ZS1 - 1.6 + hw * math.sin(math.pi * i / 6))
                        for i in range(7)], BRICK_D, off=0.02)
            # slit windows up the middle panels
            if k in (1, 2):
                for zz in (12.0, 20.0, 27.0):
                    w.decal(G, [(sm - 0.18, zz), (sm + 0.18, zz), (sm + 0.18, zz + 1.4),
                                (sm - 0.18, zz + 1.4)], SHADOW, off=0.02)
        # a few brick courses picked out darker, so the shaft is not a flat slab
        for zz in (9.5, 17.0, 24.5):
            blk(G, w, 0, w.L, zz, zz + 0.25, 0.05, BRICK_D)
    # stone cornice stepping out to the gallery
    boxz(G, -H1 - 0.05, -H1 - 0.05, H1 + 0.05, H1 + 0.05, ZS1, 34.3, TOWER_STONE, caps=(False, False))
    square_frustum(G, (0, 0, 34.3), H1 + 0.05, 0.0, HG - 0.1, 0.7, TOWER_STONE, caps=False)

    # the gallery slab at 35 m (the mapped outline) and its balustrade
    boxz(G, -HG, -HG, HG, HG, 35.0, 35.5, TOWER_STONE)
    corners = [(-HG + 0.25, -HG + 0.25), (HG - 0.25, -HG + 0.25), (HG - 0.25, HG - 0.25),
               (-HG + 0.25, HG - 0.25)]
    for a, b in zip(corners, corners[1:] + corners[:1]):
        balustrade(G, (a[0], a[1], 35.5), (b[0], b[1], 35.5), TOWER_STONE, h=1.0, pitch=0.42,
                   bw=0.14, rw=0.25)

    # the belfry: four corner piers, three arches a side with colonnettes
    ZB0, ZB1 = 35.5, 40.4
    boxz(G, -H2 + 0.9, -H2 + 0.9, H2 - 0.9, H2 - 0.9, ZB0, ZB1, SHADOW, caps=(False, False))
    for x in (-H2, H2 - 1.0):
        for y in (-H2, H2 - 1.0):
            boxz(G, x, y, x + 1.0, y + 1.0, ZB0, ZB1, TOWER_STONE, caps=(False, False))
    for a, b in sides(H2):
        w = Wall(a, b)
        span = (w.L - 2.0) / 3
        for k in range(3):
            s0 = 1.0 + k * span
            # the arch's spandrel: a stone band from the springing to the head
            spr = ZB1 - 1.5
            sp = [(s0, ZB1), (s0, spr)]
            for i in range(1, 8):
                t = math.pi - math.pi * i / 8
                sp.append((s0 + span / 2 + span / 2 * math.cos(t), spr + span / 2 * 0.8 * math.sin(t)))
            sp += [(s0 + span, spr), (s0 + span, ZB1)]
            G.poly([w.p(u, z, 0.0) for u, z in sp], TOWER_STONE, w.n)
            G.poly([w.p(u, z, -0.9) for u, z in sp], TOWER_STONE, -w.n)
            # soffit of the arch between the two faces
            for (u0, z0_), (u1, z1_) in zip(sp[1:-1], sp[2:-1]):
                G.poly([w.p(u0, z0_, 0.0), w.p(u1, z1_, 0.0), w.p(u1, z1_, -0.9), w.p(u0, z0_, -0.9)],
                       TOWER_STONE, (0, 0, -1))
        for k in range(1, 3):
            sm = 1.0 + k * span
            lathe(G, (w.p(sm, 0, -0.45).x, w.p(sm, 0, -0.45).y, ZB0), [(0.22, 0), (0.18, 0.3),
                                                                      (0.18, ZB1 - 1.6 - ZB0),
                                                                      (0.3, ZB1 - 1.5 - ZB0)],
                  TOWER_STONE, segs=6, smooth=True)
    # belfry floor (seen through the arches)
    boxz(G, -H2 + 0.9, -H2 + 0.9, H2 - 0.9, H2 - 0.9, ZB0, ZB0 + 0.05, TOWER_STONE,
         caps=(False, True))
    # cornice and attic
    boxz(G, -H2 - 0.25, -H2 - 0.25, H2 + 0.25, H2 + 0.25, ZB1, ZB1 + 0.5, TOWER_STONE)
    boxz(G, -H2 + 0.1, -H2 + 0.1, H2 - 0.1, H2 - 0.1, ZB1 + 0.5, 41.3, TOWER_STONE,
         caps=(False, False))
    for a, b in sides(H2 - 0.1):
        w = Wall(a, b)
        for k in range(4):
            sm = w.L * (k + 0.5) / 4
            w.decal(G, [(sm - 0.55, ZB1 + 0.65), (sm + 0.55, ZB1 + 0.65), (sm + 0.55, 41.15),
                        (sm - 0.55, 41.15)], (0.66, 0.56, 0.38))
    boxz(G, -H2 - 0.1, -H2 - 0.1, H2 + 0.1, H2 + 0.1, 41.3, 41.55, TOWER_STONE, caps=(True, False))
    # the copper pyramid, a small open pavilion on its tip, and the spire
    square_frustum(G, (0, 0, 41.55), H2 + 0.1, 0.0, 0.75, 4.25, COPPER, caps=False)
    ZT = 45.8
    boxz(G, -0.75, -0.75, 0.75, 0.75, ZT - 0.05, ZT + 0.05, TOWER_STONE, caps=(False, True))
    for x in (-0.6, 0.6):
        for y in (-0.6, 0.6):
            boxz(G, x - 0.1, y - 0.1, x + 0.1, y + 0.1, ZT + 0.05, ZT + 0.65, TOWER_STONE,
                 caps=(False, False))
    square_frustum(G, (0, 0, ZT + 0.65), 0.8, 0.0, 0.0, 0.35, COPPER, caps=True)
    lathe(G, (0, 0, ZT + 0.95), [(0.1, 0), (0.06, 0.25)], COPPER, segs=5, smooth=False)
    ellipsoid(G, (0, 0, ZT + 0.35 + 0.65 + 0.12), (0.12, 0.12, 0.12), (0.62, 0.45, 0.14), segs=6,
              rings=4)
    G.transform(Matrix.Translation((cu, cv, 0)))
    G.transform(Matrix.Rotation(th, 4, 'Z'))
    return G


# ═════════════════════════════════════════════════════════════════════════════
# 4. PAVELLÓ MIES VAN DER ROHE — way 67917935 (Mies van der Rohe, 1929; 1986)
# ═════════════════════════════════════════════════════════════════════════════
#
# The mapped building (w67917935) is the main roof plate: 14.2 x 25 m on the
# 27° grid, long side along v. Everything else is read from the mapped pieces
# around it, turned square: the Alba pool (w1104411431, 12.3 x 4.6 m) sits on
# the roof's NNW end inside the U of wall w1104411432, with Kolbe's "Morgen" /
# "Alba" (node 10106337168) at its west end; the large pool (w1104411435,
# 10 x 22 m) lies SSE in the travertine U formed by the long wall on the east
# (w1104411440), the end wall (w1104411436) and the west wall (w1104411433),
# with the service annex (w1104411434) at the U's SW corner; the steps up onto
# the podium (w1104411454) climb south between the roof and the long wall.
# Heights (no OSM heights): travertine podium 1.2 m, roof plate underside 3.1 m
# above it, 0.35 m thick. Eight chrome cruciform columns in two rows of four;
# the onyx wall between the rows, parallel to the long axis; tinted glass and
# the frosted light wall close the hall; green marble lines the Alba court.

def build_pavello():
    s = SITE['pavello-mies']
    th = grid_angle(s['ringEN_m'])
    R = local_ring(s['ringEN_m'], th)
    ens = s['ensemble']
    ctx = s['context']

    def L(ring):
        return local_ring(ring, th)
    G = Geo()
    ZF = -6.0
    ZP = 1.2                          # podium top
    ZR = ZP + 3.1                     # roof underside
    ZR1 = ZR + 0.35                   # roof top
    ru0, rv0, ru1, rv1 = ring_bbox(R)

    small = L(ens['w1104411431']['ringEN_m'])
    big = L(ens['w1104411435']['ringEN_m'])
    annex = L(ctx['w1104411434']['ringEN_m'])
    su0, sv0, su1, sv1 = ring_bbox(small)
    bu0, bv0, bu1, bv1 = ring_bbox(big)
    au0, av0, au1, av1 = ring_bbox(annex)
    east_u = L(ctx['w1104411440']['ringEN_m'])[0][0]            # the long wall's line
    west_u = sum(p[0] for p in L(ctx['w1104411433']['ringEN_m'])) / 2
    south_v = L(ctx['w1104411436']['ringEN_m'])[1][1]
    stair = L(ctx['w1104411454']['ringEN_m'])                    # (u, v5.8) -> (u, v2.0)
    sv_top = min(p[1] for p in stair)
    sv_bot = max(p[1] for p in stair)
    TW = 0.3                                                     # wall thickness

    # ── the podium: one outline round roof, Alba court, big-pool U and annex
    EW = east_u + TW
    POD = [(au0 - 0.2, av0 - 0.2), (EW, av0 - 0.2), (EW, sv_top), (ru1, sv_top), (ru1, rv1),
           (su1 + TW, rv1), (su1 + TW, sv1 + TW), (su0 - TW, sv1 + TW), (su0 - TW, rv1),
           (ru0 - 0.3, rv1), (ru0 - 0.3, rv0), (west_u - TW / 2, rv0), (west_u - TW / 2, av1),
           (au0 - 0.2, av1)]
    solid(G, POD, ZF, ZP, TRAVERTINE_D, top=TRAVERTINE)
    # a thin coping line round the podium edge
    pr = ccw(POD)
    for a, b in zip(pr, pr[1:] + pr[:1]):
        w = Wall(a, b)
        blk(G, w, 0, w.L, ZP - 0.12, ZP, 0.03, TRAVERTINE)
    # the steps (w1104411454): from the ground at their foot up south onto the podium
    n = 8
    for i in range(n):
        v1 = sv_bot - i * (sv_bot - sv_top) / n
        boxz(G, ru1, sv_top, east_u, v1, ZF if i == 0 else 0.0, ZP * (i + 1) / n, TRAVERTINE,
             caps=(False, True))
    # paving joints on the podium (a grid of fine lines, 1.1 m pitch, only in the open courts)
    for k in range(1, int((bv1 - av0) / 1.1)):
        v = av0 + k * 1.1
        if v > rv0 - 0.2:
            break
        G.poly([V(west_u + 0.2, v - 0.015, ZP + 0.006), V(east_u - 0.05, v - 0.015, ZP + 0.006),
                V(east_u - 0.05, v + 0.015, ZP + 0.006), V(west_u + 0.2, v + 0.015, ZP + 0.006)],
               TRAVERTINE_D, (0, 0, 1))

    # ── the pools: water flush with the podium, a dark lining round each
    G.poly([V(u, v, ZP + 0.03) for u, v in big], WATER, (0, 0, 1))
    G.poly([V(u, v, ZP + 0.03) for u, v in small], POOL_DARK, (0, 0, 1))
    # "Morgen" (Georg Kolbe) on a low plinth in the Alba pool, facing the hall
    mu, mv = to_local(ctx['n10106337168']['pointEN_m'], th)
    boxz(G, mu - 0.4, mv - 0.4, mu + 0.4, mv + 0.4, ZP, ZP + 0.5, TRAVERTINE)
    G.add(figure(1.75, BRONZE, pose='up'), place(mu, mv, ZP + 0.5, yaw=0.0))

    # ── walls
    WH = ZR                                            # free-standing walls stop at the roof plane
    # the Alba court's U of green marble (w1104411432)
    boxz(G, su0 - TW, sv1, su1 + TW, sv1 + TW, ZF, WH, GREEN_MARBLE)
    boxz(G, su0 - TW, sv0, su0, sv1, ZP, WH, GREEN_MARBLE)
    boxz(G, su1, sv0 + 1.2, su1 + TW, sv1, ZP, WH, GREEN_MARBLE)
    # the long travertine wall (w1104411440), with a bench along it by the pool
    boxz(G, east_u, av0 - 0.2, east_u + TW, sv_bot - 0.1, ZF, WH, TRAVERTINE_D, top=TRAVERTINE)
    boxz(G, east_u - 0.55, bv0 + 1.5, east_u, bv1 - 1.5, ZP, ZP + 0.45, TRAVERTINE)
    # the end wall (w1104411436) and the U's west wall (w1104411433)
    boxz(G, au1, south_v - TW / 2, east_u, south_v + TW / 2, ZP, WH, TRAVERTINE_D, top=TRAVERTINE)
    boxz(G, west_u - TW / 2, av1, west_u + TW / 2, rv0 - 1.2, ZP, WH, TRAVERTINE_D, top=TRAVERTINE)

    # ── the service annex (w1104411434): travertine box under its own roof plate
    boxz(G, au0, av0, au1, av1, ZP, ZR, TRAVERTINE_D, caps=(False, False))
    w = Wall((au1, av1), (au0, av1))
    w.decal(G, [(1.2, ZP + 0.2), (w.L - 1.2, ZP + 0.2), (w.L - 1.2, ZR - 0.2), (1.2, ZR - 0.2)],
            GLASS_T, off=0.02)
    for k in range(1, 5):
        sm = 1.2 + k * (w.L - 2.4) / 5
        w.block(G, sm - 0.03, sm + 0.03, ZP + 0.2, ZR - 0.2, 0.05, CHROME)
    boxz(G, au0 - 0.45, av0 - 0.45, au1 + 0.45, av1 + 0.45, ZR, ZR1, ROOF_WHITE)

    # ── the main hall: eight cruciform columns, the roof plate on them
    cu = (ru0 + ru1) / 2
    cv = (rv0 + rv1) / 2
    cols = [(cu + du, cv + dv) for du in (-3.9, 3.9) for dv in (-10.35, -3.45, 3.45, 10.35)]
    for x, y in cols:
        box(G, (x, y, (ZP + ZR) / 2), (0.30, 0.07, ZR - ZP), CHROME, caps=(False, False))
        box(G, (x, y, (ZP + ZR) / 2), (0.07, 0.30, ZR - ZP), CHROME, caps=(False, False))
    solid(G, R, ZR, ZR1, ROOF_WHITE)
    # the onyx wall between the rows, parallel to the long axis
    boxz(G, cu - 0.12, cv - 1.9, cu + 0.12, cv + 4.3, ZP, ZR, ONYX)
    # the green marble wall on the back line (+u, the long wall's side): it
    # takes over where the travertine wall stops and runs on into the Alba
    # court's U, so the court reads as one enclosure with the hall
    boxz(G, su1, sv_bot - 1.0, su1 + TW, sv0 + 1.2, ZP, WH, GREEN_MARBLE)

    def glass(u0, v0, u1, v1, col, mull=1.8):
        box(G, ((u0 + u1) / 2, (v0 + v1) / 2, (ZP + ZR) / 2),
            (max(abs(u1 - u0), 0.04), max(abs(v1 - v0), 0.04), ZR - ZP), col, caps=(False, False))
        Lg = math.hypot(u1 - u0, v1 - v0)
        k = max(1, int(Lg / mull))
        for i in range(k + 1):
            t = i / k
            x, y = u0 + (u1 - u0) * t, v0 + (v1 - v0) * t
            box(G, (x, y, (ZP + ZR) / 2), (0.07, 0.07, ZR - ZP), CHROME, caps=(False, False))
        box(G, ((u0 + u1) / 2, (v0 + v1) / 2, ZP + 0.04), (abs(u1 - u0) + 0.07, abs(v1 - v0) + 0.07,
                                                            0.08), CHROME, caps=(False, True))
    # glass is set well back under the plate, so the roof oversails open
    # ground on every side: grey-tinted glass on the front line (-u), between
    # the west column row and the onyx; green-tinted glass on the back line
    # facing the court; the frosted light wall across the SSE end
    glass(cu - 2.9, cv - 6.0, cu - 2.9, cv + 7.6, GLASS_T)
    glass(cu + 2.9, cv - 1.0, cu + 2.9, cv + 9.2, (0.06, 0.11, 0.08))
    glass(cu - 2.9, cv - 6.0, cu + 1.6, cv - 6.0, GLASS_F, mull=2.2)

    G.transform(Matrix.Rotation(th, 4, 'Z'))
    return G


BUILDERS = {
    'palau-nacional': (build_palau, 'palau-nacional', 117),
    'font-magica': (build_font_magica, 'font-magica', 117),
    'torre-veneciana': (build_torre, 'torre-veneciana', 117),
    'pavello-mies': (build_pavello, 'pavello-mies', 27),
}


check_twin_towers()
run(BUILDERS, SITE, BUDGET, OUT_DIR)
