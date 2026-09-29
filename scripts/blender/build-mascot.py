# ─── build-mascot.py ──────────────────────────────────────────────────────────
# Authors "Bimo", the product mascot, and exports it as a rigged, animated GLB
# plus an editable .blend and (optionally) Cycles preview stills.
#
#   blender --background --python scripts/blender/build-mascot.py -- public/mascot
#   blender --background --python scripts/blender/build-mascot.py -- public/mascot --render
#
# DESIGN
#   A soft "squircle" body (super-ellipsoid, the same family as Apple's icon
#   shape) in pearl white with an indigo subsurface glow, a dark glass visor,
#   and emissive eyes/mouth. Arms, feet and the antenna cube are the brand
#   indigo (#5E6AD2), so on the product's near-black UI it reads as part of the
#   palette while the pearl body still pops. The antenna bulb is a rounded cube:
#   a small nod to the building elements the product is about.
#
# RIG
#   root → body → head → antenna.1 → antenna.2
#               ↘ arm.L / arm.R        root → foot.L / foot.R
#   Bone-local Y is "along the bone", so for the vertical bones:
#   X = nod (pitch), Y = turn (yaw), Z = tilt (roll).
#
# FACE
#   Expressions are shape keys on the "Face" mesh (exported as glTF morph
#   targets). Body motion lives in one armature action per emotion; the face
#   weights per emotion are in FACE_PRESETS and are blended at runtime with
#   springs (see public/mascot/index.html), which gives smoother transitions
#   than baked morph tracks. The .blend also stores a shape-key action per
#   emotion so animators can scrub both together.

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "public/mascot"
RENDER = "--render" in argv
os.makedirs(OUT, exist_ok=True)

FPS = 30

# ── palette (from src/index.css) ─────────────────────────────────────────────
def hex_rgba(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, a)

PEARL = hex_rgba("#EEF0FB")
INDIGO = hex_rgba("#5E6AD2")
INDIGO_LIGHT = hex_rgba("#8B93E8")
GLASS = hex_rgba("#0B0C16")
EYE = hex_rgba("#8C95FF")
BLUSH = hex_rgba("#FF8FB8")

# ── scene reset ──────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.unit_settings.system = "METRIC"

def link(obj):
    scene.collection.objects.link(obj)
    return obj

def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return link(bpy.data.objects.new(name, me))

# ── geometry ─────────────────────────────────────────────────────────────────
BODY_C = Vector((0, 0, 0.55))
BODY_R = Vector((0.47, 0.41, 0.42))
SQUIRCLE_P = 2.35

def squircle(d):
    """Scale unit direction d onto a super-ellipsoid surface."""
    r = (abs(d.x) ** SQUIRCLE_P + abs(d.y) ** SQUIRCLE_P + abs(d.z) ** SQUIRCLE_P) ** (-1 / SQUIRCLE_P)
    v = d * r
    return Vector((v.x * BODY_R.x, v.y * BODY_R.y, v.z * BODY_R.z))

def body_surface(bm, inflate=1.0):
    bmesh.ops.create_uvsphere(bm, u_segments=72, v_segments=40, radius=1.0)
    for v in bm.verts:
        p = squircle(v.co.normalized()) * inflate
        # slightly narrower at the top: friendlier, less "box"
        t = max(0.0, p.z / BODY_R.z)
        p.x *= 1 - 0.05 * t
        p.y *= 1 - 0.03 * t
        # mochi: a little heavier at the bottom, like it's sitting down
        b = max(0.0, -p.z / BODY_R.z)
        p.x *= 1 + 0.06 * b
        p.y *= 1 + 0.04 * b
        v.co = p + BODY_C

bm = bmesh.new()
body_surface(bm)
body = mesh_obj("Body", bm)

def surface_point(x, z, lift):
    """Ray-cast onto the body from the front; return point lifted along normal."""
    bpy.context.view_layer.update()
    ok, loc, nrm, _ = body.ray_cast(Vector((x, -2.0, z)), Vector((0, 1, 0)))
    assert ok, (x, z)
    return loc + nrm * lift, nrm


# Visor: a rounded-rectangle (squircle) grid projected onto the body, so its
# outline is a clean curve rather than the stair-step of cut faces.
VISOR_C = (0.0, 0.64)      # x, z centre
VISOR_H = (0.355, 0.215)     # half extents
bm = bmesh.new()
N, M = 56, 34
grid = []
for j in range(M + 1):
    row = []
    for i in range(N + 1):
        u, v = -1 + 2 * i / N, -1 + 2 * j / M
        k = max(abs(u), abs(v))
        sq = (u ** 4 + v ** 4) ** 0.25
        f = k / sq if sq > 1e-9 else 0
        x, z = VISOR_C[0] + u * f * VISOR_H[0], VISOR_C[1] + v * f * VISOR_H[1]
        loc, nrm = surface_point(x, z, 0.004)
        row.append(bm.verts.new(loc))
    grid.append(row)
for j in range(M):
    for i in range(N):
        bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
bm.normal_update()
bm.faces.ensure_lookup_table()
if bm.faces[0].normal.y > 0:
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
visor = mesh_obj("Visor", bm)
m = visor.modifiers.new("Solidify", "SOLIDIFY")
m.thickness, m.offset, m.use_rim = 0.012, 1, True
m = visor.modifiers.new("Subsurf", "SUBSURF")
m.levels = m.render_levels = 1

# Face: eyes + mouth + cheeks in one mesh with shape keys.
EYE_W, EYE_D, EYE_H = 0.058, 0.012, 0.09
EYE_X, EYE_Z = 0.138, 0.655
MOUTH_W, MOUTH_H = 0.032, 0.009
MOUTH_Z = 0.56
CHEEK_X, CHEEK_Z = 0.245, 0.575

face_bm = bmesh.new()
parts = {}  # name -> (verts, centre)

def add_blob(name, centre, normal, scale, segs=(24, 12)):
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    rot = Vector((0, -1, 0)).rotation_difference(normal).to_matrix().to_4x4()
    for v in tmp.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    me = bpy.data.meshes.new("tmp")
    tmp.to_mesh(me)
    tmp.free()
    before = len(face_bm.verts)
    face_bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    face_bm.verts.ensure_lookup_table()
    new = face_bm.verts[before:]
    for v in new:
        v.co = rot @ v.co + centre
    parts[name] = (list(range(before, len(face_bm.verts))), centre.copy(), rot.inverted())

for side, sx in (("L", 1), ("R", -1)):
    c, n = surface_point(sx * EYE_X, EYE_Z, 0.017)
    add_blob("eye." + side, c, n, (EYE_W, EYE_D, EYE_H))
c, n = surface_point(0, MOUTH_Z, 0.017)
add_blob("mouth", c, n, (MOUTH_W, 0.008, MOUTH_H), segs=(32, 10))
for side, sx in (("L", 1), ("R", -1)):
    c, n = surface_point(sx * CHEEK_X, CHEEK_Z, 0.018)
    add_blob("cheek." + side, c, n, (0.048, 0.004, 0.028), segs=(20, 8))

# Catchlights: two sparkles per eye, both lit from the same top-right key
# light. Nothing reads as "alive and cute" faster than a highlight in the eye.
for side, sx in (("L", 1), ("R", -1)):
    for tag, (ox, oz, r) in (("1", (0.02, 0.028, 0.017)), ("2", (-0.02, -0.03, 0.008))):
        c, n = surface_point(sx * EYE_X + ox, EYE_Z + oz, 0.03)
        add_blob(f"spark.{side}{tag}", c, n, (r, 0.004, r), segs=(16, 8))

face = mesh_obj("Face", face_bm)
MAT_SLOT = {"eye": 0, "mouth": 0, "cheek": 1, "spark": 2}
for name, (idx, _, _) in parts.items():
    s = set(idx)
    for p in face.data.polygons:
        if p.vertices[0] in s:
            p.material_index = MAT_SLOT[name.split(".")[0]]

# Shape keys, authored in each part's local frame (x right, z up).
face.shape_key_add(name="Basis")
base = [v.co.copy() for v in face.data.vertices]

def shape(key, fn, only, spark=None):
    sk = face.shape_key_add(name=key, from_mix=False)
    for name, (idx, c, inv) in parts.items():
        kind = name.split(".")[0]
        if kind == "spark" and spark:
            fn_ = fn
            fn = (lambda p, s: spark(p, s)) if spark.__code__.co_argcount == 2 else (lambda p, s: spark(p))
        elif kind not in only:
            continue
        side = -1 if name.endswith(".R") else 1
        fwd = inv.inverted()
        for i in idx:
            loc = inv @ (base[i] - c)
            loc = fn(loc, side)
            sk.data[i].co = fwd @ loc + c
        if kind == "spark" and spark:
            fn = fn_
    return sk

def eye_blink(p, s):
    return Vector((p.x, p.y, p.z * 0.08 - 0.012))

def eye_happy(p, s):
    # ^ ^ : remap the ellipse into a clean crescent band
    u = max(-1.0, min(1.0, p.x / EYE_W))
    w = max(-1.0, min(1.0, p.z / EYE_H))
    centre = EYE_H * (0.55 * (1 - u * u) - 0.2)
    thick = EYE_H * 0.2 * math.sqrt(max(0.0, 1 - u * u)) + EYE_H * 0.04
    return Vector((p.x * 1.15, p.y, centre + w * thick))

def eye_sad(p, s):
    # droop the outer top corner, soften height
    u = p.x * s / EYE_W
    z = p.z * 0.8
    if p.z > 0:
        z -= EYE_H * 0.45 * max(0, u + 0.2) * (p.z / EYE_H)
    return Vector((p.x, p.y, z - 0.006))

def eye_angry(p, s):
    u = p.x * s / EYE_W
    z = p.z * 0.85
    if p.z > 0:
        z -= EYE_H * 0.5 * max(0, -u + 0.3) * (p.z / EYE_H)
    return Vector((p.x, p.y, z))

def eye_wide(p, s):
    return Vector((p.x * 1.3, p.y, p.z * 1.22))

def eye_look_up(p, s):
    return Vector((p.x, p.y, p.z * 0.9 + 0.018))

def mouth_smile(p, s):
    u = p.x / MOUTH_W
    return Vector((p.x * 1.15, p.y, p.z * 0.9 + 0.028 * u * u - 0.008))

def mouth_frown(p, s):
    u = p.x / MOUTH_W
    return Vector((p.x * 0.85, p.y, p.z * 0.85 - 0.02 * u * u + 0.006))

def mouth_open(p, s):
    u = max(-1, min(1, p.x / MOUTH_W))
    z = p.z
    if p.z < 0:
        z -= 0.05 * (1 - u ** 4)
    return Vector((p.x * 1.05, p.y, z + 0.004))

def mouth_o(p, s):
    return Vector((p.x * 0.6, p.y, p.z * 2.8))

def cheek_show(p, s):
    return p * 1.0  # cheeks are driven by material opacity; key kept for scale pop

def cheek_puff(p, s):
    return Vector((p.x * 1.25, p.y * 1.4, p.z * 1.25))

shape("EyeBlink", eye_blink, {"eye"}, spark=lambda p: p * 0.0 + Vector((0, 0, -0.02)))
shape("EyeHappy", eye_happy, {"eye"}, spark=lambda p: p * 0.0)
shape("EyeSad", eye_sad, {"eye"}, spark=lambda p: p * 1.15 + Vector((0, 0, -0.008)))
shape("EyeAngry", eye_angry, {"eye"}, spark=lambda p: p * 0.5)
shape("EyeWide", eye_wide, {"eye"}, spark=lambda p: p * 1.35)
shape("EyeUp", eye_look_up, {"eye"}, spark=lambda p: p + Vector((0, 0, 0.018)))
shape("MouthSmile", mouth_smile, {"mouth"})
shape("MouthFrown", mouth_frown, {"mouth"})
shape("MouthOpen", mouth_open, {"mouth"})
shape("MouthO", mouth_o, {"mouth"})
shape("CheekPuff", cheek_puff, {"cheek"})

# ── extra expressions for product use ────────────────────────────────────────
def eye_heart(p, s):
    # polar remap of the ellipse onto the classic heart curve
    u, w = p.x / EYE_W, p.z / EYE_H
    r = min(1.0, math.hypot(u, w))
    t = math.atan2(u, w)
    hx = 16 * math.sin(t) ** 3 / 17
    hz = (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 17
    return Vector((r * hx * EYE_W * 1.35, p.y, r * hz * EYE_H * 0.9 + EYE_H * 0.12))

def side_only(fn, want):
    return lambda p, s: fn(p, s) if s == want else p

def shift(dx, dz):
    return lambda p, s=None: Vector((p.x + dx, p.y, p.z + dz))

def eye_small(p, s):
    return Vector((p.x * 0.45, p.y, p.z * 0.45 - 0.004))

def eye_down(p, s):
    return Vector((p.x, p.y, p.z * 0.85 - 0.02))

def mouth_cat(p, s):
    # ω: centre peak, two dips, corners up
    u = max(-1.0, min(1.0, p.x / MOUTH_W))
    return Vector((p.x * 1.45, p.y, p.z * 0.75 + 0.009 * math.cos(2 * math.pi * u) + 0.003))

def mouth_flat(p, s):
    return Vector((p.x * 0.9, p.y, p.z * 0.5))

hide = lambda p: p * 0.0
shape("EyeHeart", eye_heart, {"eye"}, spark=hide)
shape("EyeWinkL", side_only(eye_happy, 1), {"eye"}, spark=lambda p, s: p * 0.0 if s == 1 else p)
shape("EyeWinkR", side_only(eye_happy, -1), {"eye"}, spark=lambda p, s: p * 0.0 if s == -1 else p)
shape("EyeLookL", lambda p, s: shift(-0.022, 0)(p), {"eye"}, spark=shift(-0.026, 0))
shape("EyeLookR", lambda p, s: shift(0.022, 0)(p), {"eye"}, spark=shift(0.026, 0))
shape("EyeDown", eye_down, {"eye"}, spark=shift(0, -0.022))
shape("EyeSmall", eye_small, {"eye"}, spark=lambda p: p * 0.4)
shape("MouthCat", mouth_cat, {"mouth"})
shape("MouthFlat", mouth_flat, {"mouth"})
SHAPE_KEYS = [k.name for k in face.data.shape_keys.key_blocks[1:]]

# Arms: rounded capsules
def capsule(name, centre, radii, tilt_deg=0, axis="Y"):
    b = bmesh.new()
    bmesh.ops.create_uvsphere(b, u_segments=28, v_segments=16, radius=1.0)
    for v in b.verts:
        d = v.co.normalized()
        v.co = Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2]))
    rot = Matrix.Rotation(math.radians(tilt_deg), 4, axis)
    for v in b.verts:
        v.co = rot @ v.co + centre
    return mesh_obj(name, b)

arm_l = capsule("Arm.L", Vector((0.462, 0, 0.42)), (0.058, 0.058, 0.095), 38)
arm_r = capsule("Arm.R", Vector((-0.462, 0, 0.42)), (0.058, 0.058, 0.095), -38)
foot_l = capsule("Foot.L", Vector((0.17, -0.03, 0.06)), (0.105, 0.12, 0.065))
foot_r = capsule("Foot.R", Vector((-0.17, -0.03, 0.06)), (0.105, 0.12, 0.065))

# Antenna: curved stem + rounded cube bulb
b = bmesh.new()
ring = 10
pts = [Vector((0, 0, 0.96)), Vector((0, 0.005, 1.04)), Vector((0.01, 0.02, 1.11))]
prev = None
for i, pt in enumerate(pts):
    r = 0.018 - i * 0.004
    vs = [b.verts.new(pt + Vector((math.cos(a) * r, math.sin(a) * r, 0)))
          for a in (2 * math.pi * k / ring for k in range(ring))]
    if prev:
        for k in range(ring):
            b.faces.new((prev[k], prev[(k + 1) % ring], vs[(k + 1) % ring], vs[k]))
    prev = vs
stem = mesh_obj("AntennaStem", b)

bpy.ops.mesh.primitive_cube_add(size=0.075, location=(0.012, 0.022, 1.15))
bulb = bpy.context.active_object
bulb.name = "AntennaCube"
bulb.rotation_euler = (math.radians(35), math.radians(45), 0)
bpy.ops.object.transform_apply(rotation=True, scale=True, location=False)
bev = bulb.modifiers.new("Bevel", "BEVEL")
bev.width, bev.segments = 0.014, 5
bpy.ops.object.modifier_apply(modifier="Bevel")
bpy.ops.object.shade_smooth()
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY")
bulb_loc = bulb.location.copy()
bpy.ops.object.transform_apply(location=True)

# Subsurf the soft shapes for a pillowy silhouette (applied for export)
for o in (body, arm_l, arm_r, foot_l, foot_r, stem):
    m = o.modifiers.new("Subsurf", "SUBSURF")
    m.levels = m.render_levels = 1

# ── materials ────────────────────────────────────────────────────────────────
def principled(name, color, **kw):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = mat.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = color
    mapping = {
        "rough": "Roughness", "metal": "Metallic", "coat": "Coat Weight",
        "coat_rough": "Coat Roughness", "sss": "Subsurface Weight",
        "sss_scale": "Subsurface Scale", "sheen": "Sheen Weight",
        "sheen_tint": "Sheen Tint", "emit": "Emission Color",
        "emit_str": "Emission Strength", "ior": "IOR", "alpha": "Alpha",
        "trans": "Transmission Weight", "spec": "Specular IOR Level",
    }
    for k, v in kw.items():
        p.inputs[mapping[k]].default_value = v
    if "sss" in kw:
        p.inputs["Subsurface Radius"].default_value = (0.35, 0.45, 1.0)
    return mat

m_body = principled("Bimo_Pearl", PEARL, rough=0.42, sss=0.25, sss_scale=0.04,
                    coat=0.55, coat_rough=0.12, sheen=0.35, sheen_tint=INDIGO_LIGHT)
m_indigo = principled("Bimo_Indigo", INDIGO, rough=0.32, coat=0.8, coat_rough=0.08,
                      sheen=0.25, sheen_tint=hex_rgba("#C9CEFF"))
m_glass = principled("Bimo_Visor", GLASS, rough=0.06, coat=1.0, coat_rough=0.02,
                     spec=0.8, ior=1.5)
m_eye = principled("Bimo_Eye", hex_rgba("#1A1C3A"), rough=0.25, emit=EYE, emit_str=1.0)
m_blush = principled("Bimo_Blush", BLUSH, rough=0.5, emit=BLUSH, emit_str=0.6, alpha=0.8)
m_blush.blend_method = "BLEND" if hasattr(m_blush, "blend_method") else None
m_cube = principled("Bimo_Cube", INDIGO_LIGHT, rough=0.15, coat=1.0,
                    emit=INDIGO_LIGHT, emit_str=2.5)

body.data.materials.append(m_body)
visor.data.materials.append(m_glass)
face.data.materials.append(m_eye)
face.data.materials.append(m_blush)
m_spark = principled("Bimo_Spark", (1, 1, 1, 1), rough=0.2, emit=(1, 1, 1, 1), emit_str=12.0)
face.data.materials.append(m_spark)
for o in (arm_l, arm_r, foot_l, foot_r, stem):
    o.data.materials.append(m_indigo)
bulb.data.materials.append(m_cube)

# apply modifiers so the export and weights see final geometry
for o in (body, visor, arm_l, arm_r, foot_l, foot_r, stem):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

# ── armature ─────────────────────────────────────────────────────────────────
arm_data = bpy.data.armatures.new("BimoRig")
rig = link(bpy.data.objects.new("BimoRig", arm_data))
rig.show_in_front = True
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones

def bone(name, head, tail, parent=None, roll=0.0, connect=False):
    b = eb.new(name)
    b.head, b.tail, b.roll = Vector(head), Vector(tail), roll
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b

bone("root", (0, 0, 0), (0, 0, 0.1))
bone("body", (0, 0, 0.12), (0, 0, 0.36), "root")
bone("head", (0, 0, 0.36), (0, 0, 0.9), "body")
bone("antenna.1", (0, 0, 0.96), (0, 0.005, 1.05), "head")
bone("antenna.2", (0, 0.005, 1.05), tuple(bulb_loc), "antenna.1", connect=True)
bone("arm.L", (0.42, 0, 0.53), (0.52, 0, 0.34), "body")
bone("arm.R", (-0.42, 0, 0.53), (-0.52, 0, 0.34), "body")
bone("foot.L", (0.17, 0.0, 0.06), (0.17, -0.14, 0.06), "root")
bone("foot.R", (-0.17, 0.0, 0.06), (-0.17, -0.14, 0.06), "root")
for b in ("arm.L", "arm.R", "foot.L", "foot.R"):
    eb[b].align_roll(Vector((0, -1, 0)) if b.startswith("arm") else Vector((0, 0, 1)))
bpy.ops.object.mode_set(mode="OBJECT")

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def skin(obj, weights):
    """weights: callable(co) -> {bone: w} or a bone name for rigid binding."""
    for bname in [b.name for b in arm_data.bones]:
        obj.vertex_groups.new(name=bname)
    for v in obj.data.vertices:
        w = {weights: 1.0} if isinstance(weights, str) else weights(v.co)
        for bname, val in w.items():
            if val > 0:
                obj.vertex_groups[bname].add([v.index], val, "REPLACE")
    obj.parent = rig
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig

skin(body, lambda co: {"head": smoothstep(0.26, 0.44, co.z),
                       "body": 1 - smoothstep(0.26, 0.44, co.z)})
skin(visor, "head")
skin(face, "head")
skin(arm_l, "arm.L")
skin(arm_r, "arm.R")
skin(foot_l, "foot.L")
skin(foot_r, "foot.R")
skin(stem, lambda co: {"antenna.1": 1 - smoothstep(1.02, 1.08, co.z),
                       "antenna.2": smoothstep(1.02, 1.08, co.z)})
skin(bulb, "antenna.2")

# ── animation ────────────────────────────────────────────────────────────────
# Pose values are in bone-local space. For vertical bones: r=(nod, turn, tilt),
# l=(side, up, back). squash(k) keeps volume while stretching along Y.
def squash(k):
    s = 1 / math.sqrt(k)
    return (s, k, s)

BONES = [b.name for b in arm_data.bones]

ONESHOTS = []

def make_action(name, length, keys, loop=True, linear=()):
    if not loop:
        ONESHOTS.append(name)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    if loop and keys[-1][0] != length:
        keys = keys + [(length, keys[0][1])]
    used = sorted({b for _, pose in keys for b in pose})
    for f, pose in keys:
        for bname in used:
            pb = rig.pose.bones[bname]
            p = pose.get(bname, {})
            pb.location = p.get("l", (0, 0, 0))
            pb.rotation_euler = [math.radians(a) for a in p.get("r", (0, 0, 0))]
            pb.scale = p.get("s", (1, 1, 1))
            for path in ("location", "rotation_euler", "scale"):
                pb.keyframe_insert(path, frame=f, group=bname)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
            if fc.group and fc.group.name in linear:
                kp.interpolation = "LINEAR"
        if loop:
            fc.modifiers.new("CYCLES")
    act.frame_range = (0, length)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    track.mute = True
    rig.animation_data.action = None
    return act

# Arm helpers: arm bones point outward-down; rotating about local Z raises
# them. RAISE sign is resolved per side so +deg always means "up".
RAISE = {"arm.L": 1, "arm.R": -1}
def arm(side, up=0, fwd=0, twist=0):
    b = "arm." + side
    return {b: {"r": (fwd, twist * RAISE[b], up * RAISE[b])}}

def P(*parts):
    out = {}
    for p in parts:
        out.update(p)
    return out

def B(**kw):  # body
    return {"body": {k: v for k, v in kw.items()}}

def H(nod=0, turn=0, tilt=0):
    # the "head" drives the upper two-thirds of one soft body, so keep it subtle
    return {"head": {"r": (nod * 0.6, turn * 0.8, tilt * 0.6)}}

def R(up=0, side=0):
    return {"root": {"l": (side, up, 0)}}

def A(r1=(0, 0, 0), r2=(0, 0, 0)):
    return {"antenna.1": {"r": r1}, "antenna.2": {"r": r2}}

ACTIONS = {}

ACTIONS["idle"] = make_action("idle", 90, [
    (0,  P(B(s=squash(1.0)), H(0, 0, 0), A(), arm("L", 0), arm("R", 0))),
    (22, P(B(s=squash(1.025)), H(-2, 3, 2), A((3, 0, -4), (4, 0, -6)), arm("L", 4), arm("R", 3))),
    (45, P(B(s=squash(1.0)), H(0, 0, 0), A((0, 0, 2), (0, 0, 5)), arm("L", 0), arm("R", 0))),
    (68, P(B(s=squash(1.025)), H(-2, -3, -2), A((3, 0, 4), (4, 0, 6)), arm("L", 3), arm("R", 4))),
])

ACTIONS["happy"] = make_action("happy", 36, [
    (0,  P(R(0), B(s=squash(0.9)), H(4, 0, 6), A((-6, 0, 0), (-10, 0, 0)), arm("L", 25), arm("R", 25))),
    (9,  P(R(0.09), B(s=squash(1.08)), H(-3, 0, 0), A((10, 0, 0), (14, 0, 0)), arm("L", 55), arm("R", 55))),
    (18, P(R(0), B(s=squash(0.9)), H(4, 0, -6), A((-6, 0, 0), (-10, 0, 0)), arm("L", 25), arm("R", 25))),
    (27, P(R(0.09), B(s=squash(1.08)), H(-3, 0, 0), A((10, 0, 0), (14, 0, 0)), arm("L", 55), arm("R", 55))),
])

ACTIONS["excited"] = make_action("excited", 24, [
    (0,  P(R(0), B(s=squash(0.82)), H(6, 0, 0), A((-12, 0, 0), (-18, 0, 0)), arm("L", 60), arm("R", 60))),
    (6,  P(R(0.2), B(s=squash(1.14)), H(-6, 0, 4), A((18, 0, 6), (24, 0, 8)), arm("L", 130, 10), arm("R", 130, 10))),
    (12, P(R(0.24), B(s=squash(1.05)), H(-4, 0, -4), A((6, 0, -6), (10, 0, -8)), arm("L", 140), arm("R", 140))),
    (18, P(R(0.05), B(s=squash(1.1)), H(0, 0, 0), A((-8, 0, 0), (-12, 0, 0)), arm("L", 110), arm("R", 110))),
])

ACTIONS["curious"] = make_action("curious", 96, [
    (0,  P(B(r=(-6, 0, 0)), H(-4, 10, 14), A((-8, 0, -10), (-6, 0, -12)), arm("L", 8), arm("R", 14, 10))),
    (30, P(B(r=(-8, 0, 0), s=squash(1.02)), H(-6, 14, 16), A((-12, 0, -14), (-10, 0, -18)), arm("L", 10), arm("R", 18, 12))),
    (56, P(B(r=(-6, 0, 0)), H(-3, 6, 12), A((-4, 0, -6), (-2, 0, -4)), arm("L", 6), arm("R", 12, 8))),
    (76, P(B(r=(-7, 0, 0), s=squash(1.015)), H(-5, 12, 15), A((-10, 0, -12), (-12, 0, -16)), arm("L", 9), arm("R", 16, 10))),
])

ACTIONS["thinking"] = make_action("thinking", 90, [
    (0,  P(H(10, -8, -10), B(r=(2, 0, 0)), A((6, 0, 10), (10, 0, 16)), arm("R", 70, 55, -20), arm("L", 6))),
    (15, P(H(11, -9, -11), B(r=(2, 0, 0)), A((2, 0, 14), (6, 0, 20)), arm("R", 76, 58, -20), arm("L", 6))),
    (30, P(H(10, -8, -10), B(r=(2, 0, 0)), A((-2, 0, 10), (0, 0, 14)), arm("R", 70, 55, -20), arm("L", 6))),
    (45, P(H(12, -10, -12), B(r=(2, 0, 0), s=squash(1.015)), A((-6, 0, 4), (-8, 0, 6)), arm("R", 76, 58, -20), arm("L", 7))),
    (60, P(H(10, -7, -9), B(r=(2, 0, 0)), A((-2, 0, 0), (-4, 0, 2)), arm("R", 70, 55, -20), arm("L", 6))),
    (75, P(H(11, -9, -11), B(r=(2, 0, 0)), A((4, 0, 6), (8, 0, 10)), arm("R", 76, 58, -20), arm("L", 6))),
])

ACTIONS["sad"] = make_action("sad", 120, [
    (0,  P(B(s=squash(0.94), r=(3, 0, 0)), H(12, 0, 3), A((16, 0, 0), (22, 0, 0)), arm("L", -18), arm("R", -18))),
    (60, P(B(s=squash(0.955), r=(4, 0, 0)), H(14, 0, -3), A((20, 0, 4), (26, 0, 6)), arm("L", -20), arm("R", -20))),
])

ACTIONS["surprised"] = make_action("surprised", 60, [
    (0,  P(R(0.03, 0), B(s=squash(1.1), r=(-10, 0, 0)), H(-10, 0, 0), A((-16, 0, 0), (-8, 0, 0)), arm("L", 75, -20), arm("R", 75, -20))),
    (4,  P(R(0.035, 0), B(s=squash(1.11), r=(-11, 0, 0)), H(-11, 0, 1), A((-18, 0, 2), (-10, 0, 3)), arm("L", 78, -20), arm("R", 78, -20))),
    (8,  P(R(0.03, 0), B(s=squash(1.1), r=(-10, 0, 0)), H(-10, 0, -1), A((-16, 0, -2), (-8, 0, -3)), arm("L", 75, -20), arm("R", 75, -20))),
    (30, P(R(0.02, 0), B(s=squash(1.07), r=(-8, 0, 0)), H(-8, 0, 0), A((-12, 0, 0), (-6, 0, 0)), arm("L", 68, -18), arm("R", 68, -18))),
])

ACTIONS["love"] = make_action("love", 72, [
    (0,  P(R(0), B(r=(0, 0, 6), s=squash(0.97)), H(4, 0, 10), A((0, 0, 14), (0, 0, 20)), arm("L", 10, 55, 30), arm("R", 10, 55, 30))),
    (18, P(R(0.03), B(r=(0, 0, 0), s=squash(1.04)), H(2, 0, 0), A((6, 0, 0), (8, 0, 0)), arm("L", 14, 58, 30), arm("R", 14, 58, 30))),
    (36, P(R(0), B(r=(0, 0, -6), s=squash(0.97)), H(4, 0, -10), A((0, 0, -14), (0, 0, -20)), arm("L", 10, 55, 30), arm("R", 10, 55, 30))),
    (54, P(R(0.03), B(r=(0, 0, 0), s=squash(1.04)), H(2, 0, 0), A((6, 0, 0), (8, 0, 0)), arm("L", 14, 58, 30), arm("R", 14, 58, 30))),
])

ACTIONS["sleepy"] = make_action("sleepy", 150, [
    (0,   P(B(s=squash(0.96)), H(8, 0, 6), A((20, 0, 8), (28, 0, 12)), arm("L", -12), arm("R", -12))),
    (60,  P(B(s=squash(0.99)), H(22, 0, 10), A((34, 0, 12), (44, 0, 18)), arm("L", -16), arm("R", -16))),
    (72,  P(B(s=squash(1.03)), H(4, 0, 2), A((6, 0, 0), (-4, 0, 0)), arm("L", -6), arm("R", -6))),
    (110, P(B(s=squash(0.95)), H(10, 0, -4), A((22, 0, -6), (30, 0, -10)), arm("L", -12), arm("R", -12))),
])

ACTIONS["wave"] = make_action("wave", 40, [
    (0,  P(H(0, 6, 8), B(r=(0, 0, 4)), A((0, 0, 6), (0, 0, 10)), arm("L", 140, 0, 0), arm("R", 4))),
    (10, P(H(-2, 8, 10), B(r=(0, 0, 5), s=squash(1.02)), A((0, 0, -4), (0, 0, -10)), arm("L", 150, 0, 0), arm("R", 5))),
    (20, P(H(0, 6, 8), B(r=(0, 0, 4)), A((0, 0, 8), (0, 0, 14)), arm("L", 125, 0, 0), arm("R", 4))),
    (30, P(H(-2, 8, 10), B(r=(0, 0, 5), s=squash(1.02)), A((0, 0, -4), (0, 0, -10)), arm("L", 150, 0, 0), arm("R", 5))),
])

ACTIONS["angry"] = make_action("angry", 30, [
    (0,  P(B(s=squash(0.94), r=(6, 0, 0)), H(6, 0, 0), A((-4, 0, 0), (-6, 0, 0)), arm("L", -8, 10), arm("R", -8, 10))),
    (3,  P(B(s=squash(0.95), r=(6, 0, 1)), H(6, 2, 1), A((-4, 0, 3), (-6, 0, 5)), arm("L", -6, 12), arm("R", -10, 8))),
    (6,  P(B(s=squash(0.94), r=(6, 0, -1)), H(6, -2, -1), A((-4, 0, -3), (-6, 0, -5)), arm("L", -10, 8), arm("R", -6, 12))),
    (15, P(B(s=squash(0.92), r=(7, 0, 0)), H(7, 0, 0), A((-6, 0, 0), (-8, 0, 0)), arm("L", -8, 10), arm("R", -8, 10))),
])

# ── product actions ──────────────────────────────────────────────────────────
# Loops for UI states (listening, talking, loading, pointing…) and one-shots
# for moments (hello, celebrate, nod…). One-shots return to the previous loop
# in the web player.

ACTIONS["listening"] = make_action("listening", 80, [
    (0,  P(B(r=(-5, 0, 0)), H(-4, 0, 8), A((-6, 0, -4), (-8, 0, -6)), arm("L", 6), arm("R", 6))),
    (20, P(B(r=(-6, 0, 0)), H(2, 0, 9), A((-2, 0, -6), (-4, 0, -8)), arm("L", 8), arm("R", 8))),
    (40, P(B(r=(-5, 0, 0), s=squash(1.015)), H(-4, 0, 7), A((-6, 0, -3), (-8, 0, -5)), arm("L", 6), arm("R", 6))),
    (60, P(B(r=(-6, 0, 0)), H(2, 0, 9), A((-2, 0, -5), (-4, 0, -7)), arm("L", 8), arm("R", 8))),
])

ACTIONS["talking"] = make_action("talking", 48, [
    (0,  P(B(s=squash(1.0)), H(0, -4, 3), A((4, 0, 0), (6, 0, 0)), arm("L", 10, 10), arm("R", 20, 25))),
    (12, P(B(s=squash(1.03)), H(-4, 2, -2), A((-4, 0, 3), (-6, 0, 4)), arm("L", 14, 18), arm("R", 12, 10))),
    (24, P(B(s=squash(0.99)), H(2, 5, -3), A((4, 0, -2), (6, 0, -4)), arm("L", 24, 26), arm("R", 10, 12))),
    (36, P(B(s=squash(1.02)), H(-3, -2, 2), A((-3, 0, 0), (-5, 0, 0)), arm("L", 12, 12), arm("R", 16, 20))),
])

# antenna.2 spins linearly: the cube becomes a little loading indicator
ACTIONS["loading"] = make_action("loading", 40, [
    (0,  P(B(s=squash(1.0)), H(-6, 0, 0), A((0, 0, 0), (0, 0, 0)), arm("L", 4), arm("R", 4))),
    (10, P(B(s=squash(1.02)), H(-6, 0, 2), A((0, 0, 0), (0, 90, 0)), arm("L", 6), arm("R", 6))),
    (20, P(B(s=squash(1.0)), H(-6, 0, 0), A((0, 0, 0), (0, 180, 0)), arm("L", 4), arm("R", 4))),
    (30, P(B(s=squash(1.02)), H(-6, 0, -2), A((0, 0, 0), (0, 270, 0)), arm("L", 6), arm("R", 6))),
    (40, P(B(s=squash(1.0)), H(-6, 0, 0), A((0, 0, 0), (0, 360, 0)), arm("L", 4), arm("R", 4))),
], linear=("antenna.2",))

ACTIONS["confused"] = make_action("confused", 90, [
    (0,  P(H(0, 6, 14), A((0, 0, 20), (0, 0, 30)), arm("L", 45, 10, 30), arm("R", 45, 10, 30))),
    (40, P(H(0, 6, 16), A((0, 0, 24), (0, 0, 34)), arm("L", 50, 10, 30), arm("R", 50, 10, 30))),
    (48, P(H(0, -6, -14), A((0, 0, -20), (0, 0, -30)), arm("L", 45, 10, 30), arm("R", 45, 10, 30))),
    (82, P(H(0, -6, -16), A((0, 0, -24), (0, 0, -34)), arm("L", 50, 10, 30), arm("R", 50, 10, 30))),
])

ACTIONS["error"] = make_action("error", 60, [
    (0,  P(B(s=squash(0.97)), H(4, 0, 0), A((10, 0, 0), (14, 0, 0)), arm("L", 55, 25, 30), arm("R", 55, 25, 30))),
    (4,  P(B(s=squash(0.97)), H(4, 8, 0), A((10, 0, 6), (14, 0, 8)), arm("L", 55, 25, 30), arm("R", 55, 25, 30))),
    (8,  P(B(s=squash(0.97)), H(4, -8, 0), A((10, 0, -6), (14, 0, -8)), arm("L", 55, 25, 30), arm("R", 55, 25, 30))),
    (12, P(B(s=squash(0.97)), H(4, 5, 0), A((10, 0, 4), (14, 0, 6)), arm("L", 55, 25, 30), arm("R", 55, 25, 30))),
    (16, P(B(s=squash(0.96)), H(5, 0, 4), A((12, 0, 0), (16, 0, 0)), arm("L", 50, 22, 30), arm("R", 50, 22, 30))),
    (40, P(B(s=squash(0.96)), H(6, 0, 6), A((14, 0, 2), (18, 0, 2)), arm("L", 48, 22, 30), arm("R", 48, 22, 30))),
])

def pointing(side):
    # side = which way on screen; the character's left arm points to screen right
    a, o, t = ("L", "R", 1) if side == "right" else ("R", "L", -1)
    return make_action("point_" + side, 60, [
        (0,  P(B(r=(0, 6 * t, -4 * t)), H(0, 16 * t, -6 * t), A((0, 0, 8 * t), (0, 0, 12 * t)), arm(a, 85, 25), arm(o, 8))),
        (15, P(B(r=(0, 6 * t, -5 * t), s=squash(1.02)), H(-2, 18 * t, -7 * t), A((0, 0, 4 * t), (0, 0, 6 * t)), arm(a, 95, 22), arm(o, 10))),
        (30, P(B(r=(0, 6 * t, -4 * t)), H(0, 16 * t, -6 * t), A((0, 0, 10 * t), (0, 0, 14 * t)), arm(a, 85, 25), arm(o, 8))),
        (45, P(B(r=(0, 6 * t, -5 * t), s=squash(1.02)), H(-2, 18 * t, -7 * t), A((0, 0, 4 * t), (0, 0, 6 * t)), arm(a, 95, 22), arm(o, 10))),
    ])
ACTIONS["point_right"] = pointing("right")
ACTIONS["point_left"] = pointing("left")

ACTIONS["shy"] = make_action("shy", 90, [
    (0,  P(B(r=(4, 0, 4), s=squash(0.97)), H(10, -10, 10), A((10, 0, 10), (14, 0, 14)), arm("L", 30, 60, 30), arm("R", 30, 60, 30))),
    (45, P(B(r=(4, 0, 6), s=squash(0.96)), H(12, -12, 12), A((12, 0, 14), (16, 0, 18)), arm("L", 34, 64, 30), arm("R", 34, 64, 30))),
])

ACTIONS["dance"] = make_action("dance", 40, [
    (0,  P(R(0), B(r=(0, 0, 10), s=squash(0.92)), H(0, 8, 10), A((0, 0, 18), (0, 0, 26)), arm("L", 110), arm("R", 20)), ),
    (10, P(R(0.05), B(r=(0, 0, 0), s=squash(1.06)), H(-4, 0, 0), A((-6, 0, 0), (-10, 0, 0)), arm("L", 60), arm("R", 60))),
    (20, P(R(0), B(r=(0, 0, -10), s=squash(0.92)), H(0, -8, -10), A((0, 0, -18), (0, 0, -26)), arm("L", 20), arm("R", 110))),
    (30, P(R(0.05), B(r=(0, 0, 0), s=squash(1.06)), H(-4, 0, 0), A((-6, 0, 0), (-10, 0, 0)), arm("L", 60), arm("R", 60))),
])

ACTIONS["laugh"] = make_action("laugh", 20, [
    (0,  P(B(r=(-6, 0, 0), s=squash(0.95)), H(-10, 0, 0), A((-10, 0, 0), (-14, 0, 0)), arm("L", 20, 30), arm("R", 20, 30))),
    (5,  P(B(r=(-8, 0, 0), s=squash(1.03)), H(-14, 0, 2), A((6, 0, 0), (10, 0, 0)), arm("L", 26, 34), arm("R", 26, 34))),
    (10, P(B(r=(-6, 0, 0), s=squash(0.95)), H(-10, 0, 0), A((-10, 0, 0), (-14, 0, 0)), arm("L", 20, 30), arm("R", 20, 30))),
    (15, P(B(r=(-8, 0, 0), s=squash(1.03)), H(-14, 0, -2), A((6, 0, 0), (10, 0, 0)), arm("L", 26, 34), arm("R", 26, 34))),
])

# ── one-shots ────────────────────────────────────────────────────────────────
Z = lambda k: (k, k, k)
ACTIONS["hello"] = make_action("hello", 60, [
    (0,  P({"root": {"s": Z(0.01)}}, B(s=squash(1.0)), H(0, 0, 0), A(), arm("L", 0), arm("R", 0))),
    (8,  P({"root": {"s": Z(1.18), "l": (0, 0.06, 0)}}, B(s=squash(1.12)), H(-6, 0, 0), A((-20, 0, 0), (-30, 0, 0)), arm("L", 80), arm("R", 80))),
    (14, P({"root": {"s": Z(0.94)}}, B(s=squash(0.88)), H(4, 0, 0), A((16, 0, 0), (24, 0, 0)), arm("L", 30), arm("R", 30))),
    (20, P({"root": {"s": Z(1.02)}}, B(s=squash(1.03)), H(0, 4, 6), A((-6, 0, 4), (-8, 0, 6)), arm("L", 140), arm("R", 4))),
    (30, P({"root": {"s": Z(1.0)}}, B(s=squash(1.0)), H(0, 4, 8), A((0, 0, -4), (0, 0, -8)), arm("L", 150), arm("R", 4))),
    (38, P({"root": {"s": Z(1.0)}}, B(s=squash(1.0)), H(0, 4, 6), A((0, 0, 6), (0, 0, 10)), arm("L", 125), arm("R", 4))),
    (46, P({"root": {"s": Z(1.0)}}, B(s=squash(1.0)), H(0, 4, 8), A((0, 0, -4), (0, 0, -8)), arm("L", 150), arm("R", 4))),
    (60, P({"root": {"s": Z(1.0)}}, B(s=squash(1.0)), H(0, 0, 0), A(), arm("L", 0), arm("R", 0))),
], loop=False)

ACTIONS["celebrate"] = make_action("celebrate", 54, [
    (0,  P(R(0), {"root": {"r": (0, 0, 0)}}, B(s=squash(1.0)), H(0, 0, 0), A(), arm("L", 10), arm("R", 10))),
    (8,  P(R(0), {"root": {"r": (0, 0, 0)}}, B(s=squash(0.8)), H(8, 0, 0), A((-16, 0, 0), (-24, 0, 0)), arm("L", -10), arm("R", -10))),
    (18, P(R(0.38), {"root": {"r": (0, 200, 0)}}, B(s=squash(1.15)), H(-8, 0, 0), A((24, 0, 0), (34, 0, 0)), arm("L", 150), arm("R", 150))),
    (28, P(R(0.02), {"root": {"r": (0, 360, 0)}}, B(s=squash(1.05)), H(-4, 0, 0), A((10, 0, 0), (14, 0, 0)), arm("L", 140), arm("R", 140))),
    (32, P(R(0), {"root": {"r": (0, 360, 0)}}, B(s=squash(0.82)), H(8, 0, 0), A((-20, 0, 0), (-28, 0, 0)), arm("L", 70), arm("R", 70))),
    (40, P(R(0.04), {"root": {"r": (0, 360, 0)}}, B(s=squash(1.06)), H(-4, 0, 0), A((12, 0, 0), (16, 0, 0)), arm("L", 130), arm("R", 130))),
    (54, P(R(0), {"root": {"r": (0, 360, 0)}}, B(s=squash(1.0)), H(0, 0, 0), A(), arm("L", 20), arm("R", 20))),
], loop=False)

ACTIONS["nod"] = make_action("nod", 30, [
    (0,  P(H(0, 0, 0), A())),
    (7,  P(H(16, 0, 0), A((-14, 0, 0), (-20, 0, 0)))),
    (13, P(H(-4, 0, 0), A((12, 0, 0), (16, 0, 0)))),
    (20, P(H(12, 0, 0), A((-8, 0, 0), (-12, 0, 0)))),
    (30, P(H(0, 0, 0), A())),
], loop=False)

ACTIONS["shake"] = make_action("shake", 36, [
    (0,  P(H(0, 0, 0), A())),
    (6,  P(H(2, 18, 0), A((0, 0, -12), (0, 0, -18)))),
    (13, P(H(2, -18, 0), A((0, 0, 12), (0, 0, 18)))),
    (20, P(H(2, 12, 0), A((0, 0, -8), (0, 0, -12)))),
    (27, P(H(2, -8, 0), A((0, 0, 6), (0, 0, 8)))),
    (36, P(H(0, 0, 0), A())),
], loop=False)

ACTIONS["wink"] = make_action("wink", 36, [
    (0,  P(B(s=squash(1.0)), H(0, 0, 0), A(), arm("R", 0))),
    (8,  P(B(s=squash(0.95)), H(0, 6, -10), A((0, 0, -10), (0, 0, -14)), arm("R", 40, 30))),
    (24, P(B(s=squash(1.0)), H(0, 6, -10), A((0, 0, 4), (0, 0, 6)), arm("R", 44, 30))),
    (36, P(B(s=squash(1.0)), H(0, 0, 0), A(), arm("R", 0))),
], loop=False)

ACTIONS["jump"] = make_action("jump", 30, [
    (0,  P(R(0), B(s=squash(1.0)), H(0, 0, 0), A(), arm("L", 10), arm("R", 10))),
    (6,  P(R(0), B(s=squash(0.82)), H(6, 0, 0), A((-12, 0, 0), (-18, 0, 0)), arm("L", -10), arm("R", -10))),
    (13, P(R(0.26), B(s=squash(1.14)), H(-6, 0, 0), A((22, 0, 0), (30, 0, 0)), arm("L", 110), arm("R", 110))),
    (20, P(R(0), B(s=squash(0.86)), H(6, 0, 0), A((-14, 0, 0), (-20, 0, 0)), arm("L", 30), arm("R", 30))),
    (30, P(R(0), B(s=squash(1.0)), H(0, 0, 0), A(), arm("L", 10), arm("R", 10))),
], loop=False)

# Face presets: shape-key weights + cheek blush / eye glow (read by the web
# player via mascot.json).
FACE_PRESETS = {
    "idle":      {"MouthCat": 0.8, "_blush": 0.35},
    "happy":     {"EyeHappy": 1.0, "MouthSmile": 1.0, "MouthOpen": 0.35, "CheekPuff": 0.6, "_blush": 0.8},
    "excited":   {"EyeWide": 0.6, "EyeHappy": 0.5, "MouthOpen": 1.0, "MouthSmile": 0.8, "_blush": 0.6, "_glow": 1.5},
    "curious":   {"EyeWide": 0.35, "EyeUp": 0.4, "MouthO": 0.45},
    "thinking":  {"EyeUp": 1.0, "EyeBlink": 0.25, "MouthFrown": 0.25, "MouthO": 0.2},
    "sad":       {"EyeSad": 1.0, "MouthFrown": 0.9, "_glow": 0.55},
    "surprised": {"EyeWide": 1.0, "MouthO": 1.0, "MouthOpen": 0.4, "_glow": 1.3},
    "love":      {"EyeHeart": 1.0, "MouthCat": 1.0, "CheekPuff": 1.0, "_blush": 1.0, "_tint": "#FF7FB6", "_glow": 1.3},
    "sleepy":    {"EyeBlink": 0.82, "MouthO": 0.3, "_glow": 0.5},
    "wave":      {"EyeHappy": 0.7, "MouthSmile": 1.0, "MouthOpen": 0.2, "_blush": 0.4},
    "angry":     {"EyeAngry": 1.0, "MouthFrown": 1.0, "_tint": "#FF8A8A", "_glow": 1.2},
    "listening": {"EyeWide": 0.25, "EyeUp": 0.15, "MouthCat": 0.5, "_blush": 0.3},
    "talking":   {"MouthSmile": 0.4, "_talk": 1, "_blush": 0.3},
    "loading":   {"EyeUp": 0.7, "EyeSmall": 0.2, "MouthFlat": 0.8, "_glow": 1.2},
    "confused":  {"EyeWinkL": 0.35, "EyeLookR": 0.5, "MouthFrown": 0.35, "MouthO": 0.25},
    "error":     {"EyeSad": 0.6, "EyeSmall": 0.3, "MouthFlat": 0.6, "MouthFrown": 0.4, "_tint": "#FFB08A"},
    "point_right": {"EyeLookR": 1.0, "MouthSmile": 0.8, "_blush": 0.3},
    "point_left":  {"EyeLookL": 1.0, "MouthSmile": 0.8, "_blush": 0.3},
    "shy":       {"EyeHappy": 1.0, "EyeDown": 0.3, "MouthCat": 1.0, "CheekPuff": 1.0, "_blush": 1.0},
    "dance":     {"EyeHappy": 1.0, "MouthCat": 1.0, "_blush": 0.5, "_glow": 1.2},
    "laugh":     {"EyeHappy": 1.0, "MouthOpen": 1.0, "MouthSmile": 1.0, "CheekPuff": 0.8, "_blush": 0.8},
    "hello":     {"EyeHappy": 0.85, "MouthSmile": 1.0, "MouthOpen": 0.35, "_blush": 0.5},
    "celebrate": {"EyeHappy": 1.0, "MouthOpen": 1.0, "MouthSmile": 1.0, "_blush": 0.8, "_glow": 1.5},
    "nod":       {"EyeHappy": 0.4, "MouthSmile": 0.8},
    "shake":     {"EyeBlink": 0.2, "MouthFlat": 0.6, "MouthFrown": 0.3},
    "wink":      {"EyeWinkR": 1.0, "MouthSmile": 0.9, "_blush": 0.5},
    "jump":      {"EyeWide": 0.5, "MouthO": 0.6, "MouthOpen": 0.3},
}

# Store shape-key actions in the .blend for animators (not exported).
face.data.shape_keys.animation_data_create()
for emo, preset in FACE_PRESETS.items():
    a = bpy.data.actions.new("face_" + emo)
    a.use_fake_user = True
    face.data.shape_keys.animation_data.action = a
    for kb in face.data.shape_keys.key_blocks[1:]:
        kb.value = preset.get(kb.name, 0.0)
        kb.keyframe_insert("value", frame=0)
face.data.shape_keys.animation_data.action = None
for kb in face.data.shape_keys.key_blocks[1:]:
    kb.value = 0.0

# ── export ───────────────────────────────────────────────────────────────────
import json
with open(os.path.join(OUT, "mascot.json"), "w") as f:
    json.dump({"name": "Bimo", "fps": FPS, "emotions": list(ACTIONS.keys()),
               "oneshots": ONESHOTS,
               "shapeKeys": SHAPE_KEYS, "face": FACE_PRESETS}, f, indent=2)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "bimo.glb"),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_force_sampling=True,
    export_frame_step=1,
    export_morph=True,
    export_morph_normal=True,
    export_skins=True,
    export_all_influences=False,
    export_apply=False,
    export_yup=True,
)
bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "bimo.blend"))
print("exported", os.path.join(OUT, "bimo.glb"), "actions:", list(ACTIONS))

# ── preview renders (Cycles, CPU) ────────────────────────────────────────────
if RENDER:
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(os.environ.get("SAMPLES", "96"))
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = hex_rgba("#0A0A0C")
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

    # backdrop: seamless curved floor in the UI's surface colour
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.data.materials.append(principled("Floor", hex_rgba("#14141B"), rough=0.35, spec=0.3))

    def area(name, loc, energy, color, size):
        l = bpy.data.lights.new(name, "AREA")
        l.energy, l.color, l.size = energy, color[:3], size
        o = link(bpy.data.objects.new(name, l))
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.55)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    area("Key", (1.6, -2.2, 2.4), 260, (1, 0.97, 0.94), 1.6)
    area("Fill", (-2.2, -1.4, 1.2), 70, (0.72, 0.76, 1.0), 2.5)
    area("Rim", (-0.6, 2.0, 2.2), 320, hex_rgba("#8B93E8"), 1.2)
    area("Kick", (2.0, 1.4, 0.6), 120, hex_rgba("#5E6AD2"), 1.0)

    cam = link(bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")))
    cam.data.lens = 70
    cam.location = (0.95, -3.0, 1.05)
    cam.rotation_euler = (Vector((0, 0, 0.56)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    rig.animation_data.action = None
    for tr in rig.animation_data.nla_tracks:
        tr.mute = True
    stills = os.environ.get("STILLS", "idle,happy,curious,sad,surprised,love,thinking,wave").split(",")
    frame_for = {"happy": 9, "excited": 6, "wave": 10, "sleepy": 60, "surprised": 4,
                 "hello": 30, "celebrate": 40, "jump": 13, "wink": 20, "dance": 0}
    face.data.shape_keys.animation_data.action = None
    for emo in stills:
        for pb in rig.pose.bones:  # clear leftovers from the previous still
            pb.location, pb.rotation_euler, pb.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
        for tr in rig.animation_data.nla_tracks:
            tr.mute = tr.name != emo
        scene.frame_set(frame_for.get(emo, 0))
        preset = FACE_PRESETS[emo]
        for kb in face.data.shape_keys.key_blocks[1:]:
            kb.value = preset.get(kb.name, 0.0)
        m_blush.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = preset.get("_blush", 0.0) * 0.85
        tint = hex_rgba(preset["_tint"]) if "_tint" in preset else EYE
        pn = m_eye.node_tree.nodes["Principled BSDF"]
        pn.inputs["Emission Color"].default_value = tint
        pn.inputs["Emission Strength"].default_value = 1.0 * preset.get("_glow", 1.0)
        scene.render.filepath = os.path.join(OUT, "renders", f"bimo-{emo}.png")
        bpy.ops.render.render(write_still=True)
        print("rendered", emo)
