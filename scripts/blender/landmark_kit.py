# ─── landmark_kit.py ──────────────────────────────────────────────────────────
# The shared kit of the hand-built landmark scripts (build-*-landmarks.py):
# the polygon accumulator, ring helpers, solids, a small sculpture kit, the
# mesh/export path and the optional preview sheet. Imported by each script;
# not run on its own.
#
# THE FRAME IS THE CONTRACT (see build-ciutadella-landmarks.py): every model is
# authored about its OSM footprint's centroid, +X east, +Y north, Z up, ground
# at z = 0, and the app places it there with no rotation and no scale.

import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector, Matrix

def V(x, y, z):
    return Vector((x, y, z))


# ── Geometry accumulator ─────────────────────────────────────────────────────

def newell(pts):
    n = Vector((0.0, 0.0, 0.0))
    k = len(pts)
    for i in range(k):
        a, b = pts[i], pts[(i + 1) % k]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


class Geo:
    """Polygons with one colour each. `g` (a group id) shares vertices between
    the faces of one smooth surface; faces without a group are flat-shaded."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.cols = []
        self.smooth = []
        self._share = {}
        self._gid = 0

    def group(self):
        self._gid += 1
        return self._gid

    def _v(self, p, g):
        if g is None:
            self.verts.append((p.x, p.y, p.z))
            return len(self.verts) - 1
        key = (g, round(p.x, 4), round(p.y, 4), round(p.z, 4))
        i = self._share.get(key)
        if i is None:
            self.verts.append((p.x, p.y, p.z))
            i = len(self.verts) - 1
            self._share[key] = i
        return i

    def poly(self, pts, col, out=None, g=None):
        P = []
        for p in pts:
            p = Vector(p)
            if not P or (p - P[-1]).length > 1e-5:
                P.append(p)
        if len(P) > 1 and (P[0] - P[-1]).length < 1e-5:
            P.pop()
        if len(P) < 3:
            return
        if out is not None and newell(P).dot(Vector(out)) < 0:
            P.reverse()
        idx = [self._v(p, g) for p in P]
        if len(set(idx)) < 3:
            return
        self.faces.append(idx)
        self.cols.append(tuple(col))
        self.smooth.append(g is not None)

    def add(self, other, M):
        """Append another Geo through matrix M (built at the origin, then placed)."""
        base = len(self.verts)
        for v in other.verts:
            self.verts.append(tuple(M @ Vector(v)))
        flip = M.to_3x3().determinant() < 0
        for f, c, s in zip(other.faces, other.cols, other.smooth):
            idx = [base + i for i in f]
            if flip:
                idx.reverse()
            self.faces.append(idx)
            self.cols.append(c)
            self.smooth.append(s)

    def transform(self, M):
        self.verts = [tuple(M @ Vector(v)) for v in self.verts]

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)


def place(x, y, z, yaw=0.0, scale=1.0):
    return (Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z')
            @ Matrix.Diagonal((scale, scale, scale, 1.0)))


# ── Rings ─────────────────────────────────────────────────────────────────────

def open_ring(r):
    r = [tuple(p) for p in r]
    if len(r) > 1 and abs(r[0][0] - r[-1][0]) < 1e-9 and abs(r[0][1] - r[-1][1]) < 1e-9:
        r = r[:-1]
    return r


def ring_area(r):
    n = len(r)
    return 0.5 * sum(r[i][0] * r[(i + 1) % n][1] - r[(i + 1) % n][0] * r[i][1] for i in range(n))


def ccw(r):
    r = open_ring(r)
    return r if ring_area(r) > 0 else r[::-1]


def ring_bbox(r):
    xs = [p[0] for p in r]
    ys = [p[1] for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def fit_circle(pts):
    """Least-squares (Kasa) circle through a set of 2D points."""
    n = len(pts)
    sx = sum(p[0] for p in pts) / n
    sy = sum(p[1] for p in pts) / n
    u = [(p[0] - sx, p[1] - sy) for p in pts]
    suu = sum(a * a for a, b in u)
    svv = sum(b * b for a, b in u)
    suv = sum(a * b for a, b in u)
    suuu = sum(a ** 3 for a, b in u)
    svvv = sum(b ** 3 for a, b in u)
    suvv = sum(a * b * b for a, b in u)
    svuu = sum(b * a * a for a, b in u)
    det = suu * svv - suv * suv
    uc = (0.5 * (suuu + suvv) * svv - 0.5 * (svvv + svuu) * suv) / det
    vc = (0.5 * (svvv + svuu) * suu - 0.5 * (suuu + suvv) * suv) / det
    r = math.sqrt(uc * uc + vc * vc + (suu + svv) / n)
    return sx + uc, sy + vc, r


# ── Solids ───────────────────────────────────────────────────────────────────

def PZ(u, v, w):
    return V(u, v, w)


def solid(G, ring, w0, w1, col, P=PZ, top=None, bottom=None, caps=(True, True), g=None):
    """Extrude a 2D ring (any winding, may be concave) from w0 to w1 through the
    affine map P(u, v, w). Side faces are oriented by the ring's own outward
    edge normal, so a concave outline (a stair profile, a U) shades correctly."""
    r = ccw(ring)
    n = len(r)
    wm = (w0 + w1) / 2
    for i in range(n):
        a, b = r[i], r[(i + 1) % n]
        du, dv = b[0] - a[0], b[1] - a[1]
        L = math.hypot(du, dv)
        if L < 1e-7:
            continue
        nu, nv = dv / L, -du / L
        hint = P(a[0] + nu, a[1] + nv, wm) - P(a[0], a[1], wm)
        G.poly([P(a[0], a[1], w0), P(b[0], b[1], w0), P(b[0], b[1], w1), P(a[0], a[1], w1)],
               col, hint, g)
    cu = sum(p[0] for p in r) / n
    cv = sum(p[1] for p in r) / n
    up = P(cu, cv, w1) - P(cu, cv, w0)
    if caps[1]:
        G.poly([P(u, v, w1) for u, v in r], top or col, up)
    if caps[0]:
        G.poly([P(u, v, w0) for u, v in r], bottom or top or col, -up)


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def boxz(G, x0, y0, x1, y1, z0, z1, col, top=None, caps=(True, True)):
    solid(G, rect(x0, y0, x1, y1), z0, z1, col, top=top, caps=caps)


def box(G, c, size, col, yaw=0.0, top=None, caps=(True, True), g=None):
    hx, hy = size[0] / 2, size[1] / 2
    ca, sa = math.cos(yaw), math.sin(yaw)
    ring = [(c[0] + ca * x - sa * y, c[1] + sa * x + ca * y)
            for x, y in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))]
    solid(G, ring, c[2] - size[2] / 2, c[2] + size[2] / 2, col, top=top, caps=caps, g=g)


def fbox(G, o, ex, ey, ez, sx, sy, sz, col, caps=(True, True)):
    """A box centred on o with (unit, orthogonal) axes ex, ey, ez."""
    o, ex, ey, ez = Vector(o), Vector(ex), Vector(ey), Vector(ez)

    def P(u, v, w):
        return o + ex * u + ey * v + ez * w
    solid(G, rect(-sx / 2, -sy / 2, sx / 2, sy / 2), -sz / 2, sz / 2, col, P=P, caps=caps)


def strut(G, p0, p1, w, col, d=None, caps=(True, True)):
    """A member from p0 to p1; its cross-section keeps one side horizontal."""
    a, b = Vector(p0), Vector(p1)
    ez = b - a
    L = ez.length
    if L < 1e-6:
        return
    ez.normalize()
    ref = Vector((0, 0, 1)) if abs(ez.z) < 0.95 else Vector((1, 0, 0))
    ex = ref.cross(ez).normalized()
    ey = ez.cross(ex)
    fbox(G, (a + b) / 2, ex, ey, ez, w, d or w, L, col, caps=caps)


def lathe(G, c, prof, col, segs=12, smooth=True, phase=0.0, sx=1.0, sy=1.0, caps=True):
    """Surface of revolution. prof = [(radius, z), ...] bottom to top."""
    c = Vector(c)
    g = G.group() if smooth else None
    ring = [(math.cos(phase + 2 * math.pi * k / segs), math.sin(phase + 2 * math.pi * k / segs))
            for k in range(segs)]

    def pt(dirn, r, z):
        return V(c.x + dirn[0] * r * sx, c.y + dirn[1] * r * sy, c.z + z)
    for i in range(len(prof) - 1):
        (r0, z0), (r1, z1) = prof[i], prof[i + 1]
        if abs(r0 - r1) < 1e-9 and abs(z0 - z1) < 1e-9:
            continue
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
            G.poly(pts, col, hint, g)
    if caps:
        if prof[0][0] > 1e-6:
            G.poly([pt(d, prof[0][0], prof[0][1]) for d in ring], col, (0, 0, -1))
        if prof[-1][0] > 1e-6:
            G.poly([pt(d, prof[-1][0], prof[-1][1]) for d in ring], col, (0, 0, 1))


def ellipsoid(G, c, r, col, segs=10, rings=6, M=None, smooth=True):
    c = Vector(c)
    M3 = M.to_3x3() if M is not None else Matrix.Identity(3)
    g = G.group() if smooth else None

    def pt(i, k):
        phi = -math.pi / 2 + math.pi * i / rings
        th = 2 * math.pi * k / segs
        p = Vector((r[0] * math.cos(phi) * math.cos(th), r[1] * math.cos(phi) * math.sin(th),
                    r[2] * math.sin(phi)))
        return c + M3 @ p
    for i in range(rings):
        for k in range(segs):
            if i == 0:
                pts = [pt(0, 0), pt(1, k + 1), pt(1, k)]
            elif i == rings - 1:
                pts = [pt(i, k), pt(i, k + 1), pt(rings, 0)]
            else:
                pts = [pt(i, k), pt(i, k + 1), pt(i + 1, k + 1), pt(i + 1, k)]
            mid = sum(pts, Vector()) / len(pts)
            G.poly(pts, col, mid - c, g)


def tube(G, pts, radii, col, segs=8, caps=True):
    """A tube swept along a polyline with parallel-transported frames."""
    P = [Vector(p) for p in pts]
    n = len(P)
    T = []
    for i in range(n):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, n - 1)]
        T.append((b - a).normalized())
    ref = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = [ref.cross(T[0]).normalized()]
    for i in range(1, n):
        v = N[-1] - T[i] * N[-1].dot(T[i])
        N.append(v.normalized())
    rings = []
    for i in range(n):
        B = T[i].cross(N[i])
        rings.append([P[i] + (N[i] * math.cos(2 * math.pi * k / segs)
                              + B * math.sin(2 * math.pi * k / segs)) * radii[i]
                      for k in range(segs)])
    g = G.group()
    for i in range(n - 1):
        for k in range(segs):
            q = [rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]]
            mid = sum(q, Vector()) / 4
            G.poly(q, col, mid - (P[i] + P[i + 1]) / 2, g)
    if caps:
        G.poly(rings[0], col, -T[0])
        G.poly(rings[-1], col, T[-1])


def seg_arc(span, rise, n):
    """(x, z) samples of a segmental arc of the given span and rise, x centred."""
    h = span / 2.0
    R = (h * h + rise * rise) / (2 * rise)
    zc = rise - R
    al = math.asin(min(1.0, h / R))
    if rise > h:          # more than a semicircle is not used here
        al = math.pi / 2
    return [(R * math.sin(-al + 2 * al * i / n), zc + R * math.cos(-al + 2 * al * i / n))
            for i in range(n + 1)]


def arch_outline(x0, x1, z0, zs, n=8):
    """A round-arched opening in (x, z): rectangle to the springing, semicircle over it."""
    r = (x1 - x0) / 2
    cx = (x0 + x1) / 2
    pts = [(x0, z0), (x1, z0)]
    for i in range(n + 1):
        t = math.pi * i / n
        pts.append((cx + r * math.cos(t), zs + r * math.sin(t)))
    return pts


class Wall:
    """A vertical wall plane from a to b (2D) facing outward normal n; maps
    (s = metres along a->b, z) to 3D, `off` metres proud of the face."""

    def __init__(self, a, b, n=None):
        self.a = Vector((a[0], a[1], 0))
        self.b = Vector((b[0], b[1], 0))
        d = self.b - self.a
        self.L = d.length
        self.d = d / self.L
        self.n = Vector((n[0], n[1], 0)).normalized() if n else Vector((self.d.y, -self.d.x, 0))

    def p(self, s, z, off=0.0):
        q = self.a + self.d * s + self.n * off
        return V(q.x, q.y, z)

    def decal(self, G, pts2, col, off=0.03):
        G.poly([self.p(s, z, off) for s, z in pts2], col, self.n)

    def block(self, G, s0, s1, z0, z1, depth, col, off=0.0):
        """A box proud of the wall: from `off` to `off + depth` along the normal."""
        o = self.p((s0 + s1) / 2, (z0 + z1) / 2, off + depth / 2)
        fbox(G, o, self.d, self.n, Vector((0, 0, 1)), s1 - s0, depth, z1 - z0, col)


def balustrade(G, p0, p1, col, h=1.0, pitch=0.45, rail=None, post=None, bw=0.16, rw=0.3):
    """Balusters under a rail from p0 to p1 (3D base points; may slope)."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    Lh = math.hypot(d.x, d.y)
    if Lh < 0.3:
        return
    rail = rail or col
    k = max(1, int(Lh / pitch))
    yaw = math.atan2(d.y, d.x)
    for i in range(k):
        t = (i + 0.5) / k
        q = a + d * t
        # smooth-shaded: reads as a turned baluster, and shares its 8 vertices
        box(G, (q.x, q.y, q.z + 0.15 + (h - 0.3) / 2), (bw, bw, h - 0.3), col, yaw,
            caps=(False, False), g=G.group())
    up = Vector((0, 0, 1))
    strut(G, a + up * (h - 0.075), b + up * (h - 0.075), rw, rail, d=0.15)
    strut(G, a + up * 0.075, b + up * 0.075, rw * 0.87, rail, d=0.15)
    for q in (a, b):
        box(G, (q.x, q.y, q.z + (h + 0.1) / 2), (rw * 1.2, rw * 1.2, h + 0.1), post or rail, yaw)


class Rand:
    """A tiny deterministic LCG: the builds are reproducible byte for byte."""

    def __init__(self, seed):
        self.s = seed & 0x7FFFFFFF

    def __call__(self, lo=0.0, hi=1.0):
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return lo + (hi - lo) * self.s / 0x7FFFFFFF


# ── Sculpture kit (built at the origin, placed with Geo.add) ─────────────────

def figure(h=1.8, col=(0.86, 0.85, 0.81), pose='down'):
    """A robed standing figure, base at the origin, facing -Y."""
    G = Geo()
    s = h / 1.8
    lathe(G, (0, 0, 0), [(0.30 * s, 0), (0.26 * s, 0.5 * s), (0.21 * s, 1.0 * s), (0.17 * s, 1.16 * s)],
          col, segs=8, smooth=False)
    ellipsoid(G, (0, 0, 1.33 * s), (0.21 * s, 0.14 * s, 0.24 * s), col, segs=8, rings=5)
    ellipsoid(G, (0, 0, 1.64 * s), (0.105 * s, 0.11 * s, 0.13 * s), col, segs=8, rings=5)
    for side in (-1, 1):
        sh = V(side * 0.22 * s, 0, 1.48 * s)
        if pose == 'up':
            hand = V(side * 0.36 * s, -0.08 * s, 2.05 * s)
        elif pose == 'forward':
            hand = V(side * 0.30 * s, -0.45 * s, 1.40 * s)
        else:
            hand = V(side * 0.30 * s, -0.05 * s, 0.95 * s)
        strut(G, sh, hand, 0.09 * s, col)
    return G


def horse(col):
    """A rearing horse ~2.5 m long, hind hooves at the origin, facing +X."""
    G = Geo()
    ellipsoid(G, (0, 0, 1.35), (0.85, 0.30, 0.36), col, segs=10, rings=6)
    tube(G, [(0.55, 0, 1.45), (0.85, 0, 1.85), (1.02, 0, 2.2)], [0.26, 0.2, 0.15], col, segs=7)
    ellipsoid(G, (1.18, 0, 2.2), (0.30, 0.12, 0.14), col, segs=8, rings=5,
              M=Matrix.Rotation(-0.6, 3, 'Y'))
    for side in (-1, 1):
        y = side * 0.14
        strut(G, (-0.55, y, 1.2), (-0.72, y, 0.62), 0.12, col)
        strut(G, (-0.72, y, 0.62), (-0.62, y, 0.0), 0.10, col)
        strut(G, (0.55, y, 1.15), (0.92, y, 1.12), 0.11, col)
        strut(G, (0.92, y, 1.12), (0.90, y, 0.72), 0.09, col)
    tube(G, [(-0.82, 0, 1.45), (-1.02, 0, 1.2), (-1.08, 0, 0.8)], [0.07, 0.08, 0.05], col, segs=5)
    # Rear onto the hind hooves: turn the whole animal about its hooves.
    H = Geo()
    H.add(G, Matrix.Rotation(-0.38, 4, 'Y'))
    return H


def quadriga(col):
    """The Quadriga de l'Aurora: four rearing horses, a chariot and Aurora with
    raised arms. Built facing +X at the origin, ~7.2 m tall."""
    G = Geo()
    for y in (-2.4, -0.8, 0.8, 2.4):
        G.add(horse(col), place(0.2, y, 0.0, scale=1.25))
    # chariot: a rounded car on two wheels, behind the team
    lathe(G, (-1.9, 0, 1.0), [(0.0, 0.0), (1.1, 0.0), (1.2, 0.6), (1.15, 1.3)], col, segs=10,
          smooth=False, sx=0.9, sy=1.2)
    for side in (-1, 1):
        cyl = Geo()
        lathe(cyl, (0, 0, -0.1), [(0.75, 0), (0.75, 0.2)], col, segs=12, smooth=False)
        G.add(cyl, Matrix.Translation((-1.9, side * 1.45, 0.75)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    G.add(figure(3.2, col, pose='up'), place(-1.9, 0, 1.8, yaw=math.pi / 2))
    # Aurora's torch / the flame she carries: a gilded spike over the raised hands
    lathe(G, (-1.75, 0, 5.5), [(0.18, 0), (0.08, 0.6), (0.0, 1.2)], col, segs=6, smooth=False)
    return G


# ── Mesh, material, export ───────────────────────────────────────────────────

def to_object(G, name):
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new('Col')
    bv = [bm.verts.new(v) for v in G.verts]
    dup = 0
    for f, c, sm in zip(G.faces, G.cols, G.smooth):
        try:
            face = bm.faces.new([bv[i] for i in f])
        except ValueError:
            dup += 1
            continue
        face.smooth = sm
        for loop in face.loops:
            loop[col] = (c[0], c[1], c[2], 1.0)
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    mat = bpy.data.materials.new(name=f'{name}-mat')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    attr = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.7
    me.materials.append(mat)
    if dup:
        print(f'[landmarks] {name}: {dup} duplicate faces skipped')
    return ob


def tri_count(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


def export(ob, path):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_materials='EXPORT',
        export_vertex_color='MATERIAL',   # the layer the material reads (see build-props.py)
        export_texcoords=False,
        export_cameras=False,
        export_lights=False,
        export_yup=False,                 # keep Z-up: the scene frame is Z-up
    )


# ── Preview sheets (optional) ────────────────────────────────────────────────

def preview(ob, name, rings, front_az, out_png):
    import numpy as np
    scene = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = 960, 640
    scene.render.film_transparent = False
    try:
        scene.eevee.taa_render_samples = 24
    except AttributeError:
        pass
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.45, 0.58, 0.78, 1)
    bg.inputs[1].default_value = 0.7
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(front_az + 60))
    scene.collection.objects.link(sun)

    def mat(name_, rgb, emit=False):
        m = bpy.data.materials.new(name_)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*rgb, 1)
        if emit:
            b.inputs['Emission Color'].default_value = (*rgb, 1)
            b.inputs['Emission Strength'].default_value = 2.0
        return m
    lo = Vector([min(v.co[i] for v in ob.data.vertices) for i in range(3)])
    hi = Vector([max(v.co[i] for v in ob.data.vertices) for i in range(3)])
    ctr = (lo + hi) / 2
    size = (hi - lo).length
    gm = bpy.data.meshes.new('ground')
    S = size * 3
    gm.from_pydata([(ctr.x - S, ctr.y - S, -0.02), (ctr.x + S, ctr.y - S, -0.02),
                    (ctr.x + S, ctr.y + S, -0.02), (ctr.x - S, ctr.y + S, -0.02)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new('ground', gm)
    gm.materials.append(mat('g', (0.22, 0.25, 0.18)))
    scene.collection.objects.link(ground)
    # footprint outlines in red, on the ground
    F = Geo()
    for rg in rings:
        rr = open_ring(rg)
        for a, b in zip(rr, rr[1:] + rr[:1]):
            strut(F, (a[0], a[1], 0.05), (b[0], b[1], 0.05), 0.35, (1, 0, 0), d=0.1)
    if F.faces:
        fo = to_object(F, 'footprint')
        fo.data.materials.clear()
        fo.data.materials.append(mat('fp', (0.9, 0.05, 0.02), emit=True))

    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = [('persp', front_az - 30, 12, 1.0), ('persp', front_az + 150, 38, 1.0),
             ('top', 0, 90, 1.0), ('persp', front_az, 4, 0.7)]
    tiles = []
    for i, (kind, az, el, zoom) in enumerate(views):
        a, e = math.radians(az), math.radians(el)
        d = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
        if kind == 'top':
            cam.data.type = 'ORTHO'
            cam.data.ortho_scale = max(hi.x - lo.x, (hi.y - lo.y) * 1.5) * 1.1
            cam.location = ctr + Vector((0, 0, size * 2))
            cam.rotation_euler = (0, 0, 0)
        else:
            cam.data.type = 'PERSP'
            cam.data.lens = 35
            dist = size * 0.5 / math.tan(cam.data.angle / 2) * 1.05 * zoom
            cam.location = ctr + d * dist
            cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        cam.data.clip_end = size * 20
        path = out_png.replace('.png', f'-{i}.png')
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
        tiles.append(px)
        bpy.data.images.remove(img)
        os.remove(path)
    top = np.concatenate([tiles[2], tiles[3]], axis=1)
    bot = np.concatenate([tiles[0], tiles[1]], axis=1)
    sheet = np.concatenate([top, bot], axis=0)  # pixel rows run bottom-up
    h, w = sheet.shape[:2]
    out = bpy.data.images.new('sheet', w, h)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = out_png
    out.file_format = 'PNG'
    out.save()


def run(builders, site, budget, out_dir):
    """Build, export and budget-check every landmark in `builders`:
    name -> (build_fn, site_key_or_None, front_azimuth_deg).

    env LANDMARKS_ONLY=a,b     build a subset
    env LANDMARKS_PREVIEW=dir  also render a 2x2 preview sheet per model
    env LANDMARKS_OUT=dir      write the GLBs somewhere other than `out_dir`
    """
    out_dir = os.environ.get('LANDMARKS_OUT') or out_dir
    os.makedirs(out_dir, exist_ok=True)
    only = os.environ.get('LANDMARKS_ONLY')
    prev = os.environ.get('LANDMARKS_PREVIEW')
    failures = []
    for name, (build, way, front_az) in builders.items():
        if only and name not in only.split(','):
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        G = build()
        ob = to_object(G, name)
        tris = tri_count(ob)
        path = os.path.join(out_dir, f'{name}.glb')
        export(ob, path)
        lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
        hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
        kb = os.path.getsize(path) / 1024
        over = tris > budget[name]
        if over:
            failures.append(f'{name}: {tris} tris > {budget[name]}')
        print(f'[landmarks] {name:22} {tris:6} tris {kb:8.1f} KB  '
              f'x[{lo[0]:.1f},{hi[0]:.1f}] y[{lo[1]:.1f},{hi[1]:.1f}] z[{lo[2]:.2f},{hi[2]:.2f}]'
              + ('  ** OVER BUDGET **' if over else ''))
        if prev:
            os.makedirs(prev, exist_ok=True)
            rings = []
            if way:
                rings.append(site[way]['ringEN_m'])
                for k, v in site[way].get('ensemble', {}).items():
                    if not k.startswith('_'):
                        rings.append(v['ringEN_m'])
            preview(ob, name, rings, front_az, os.path.join(prev, f'{name}.png'))
    if failures:
        print('[landmarks] FAILED:\n  ' + '\n  '.join(failures))
        sys.exit(1)
    print('[landmarks] all landmarks within budget')
