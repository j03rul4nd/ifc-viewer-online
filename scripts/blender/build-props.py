# ─── build-props.py ───────────────────────────────────────────────────────────
# Authors the showcase-mode props and exports them as GLB.
#
#   npm run props        (see package.json — wraps blender --background)
#
# WHY BLENDER AT ALL, when everything else in the scene is procedural:
# the procedural props are built for COUNT. A tree is three fused lobes because
# a neighbourhood has six hundred of them and the whole canopy has to cost four
# draw calls. That trade is right for the default view and wrong for a client
# presentation, where the camera comes down to street level and a car made of
# three boxes is the thing everyone looks at.
#
# So this file authors the same objects with real silhouettes, for the opt-in
# 'showcase' level only. Placement does not change — the loader swaps geometry
# into the existing instanced meshes, so a hundred cars are still one draw call.
#
# RULES THIS FILE FOLLOWS, because they are what keep the assets shippable:
#
#   • NO TEXTURES. Colour is baked per vertex. A texture set is megabytes, a
#     licence to track and a second download; vertex colour is free and travels
#     inside the GLB. It also means these assets have no PBR maps to go stale.
#   • LOW POLY, on purpose. Every one of these is instanced hundreds of times.
#     The budget below is enforced by the exporter check at the end.
#   • DETERMINISTIC. No randomness here — variation is applied per instance at
#     runtime (yaw, colour, scale), so one asset serves a whole street.
#
# Everything is modelled in METRES, Z-up, origin at the base, facing +X.
# That is the same convention props-scene.ts uses for its procedural geometry,
# so the two are interchangeable.

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# Triangle budget per asset. Exceeding it is a build failure, not a warning:
# these are instanced, so a careless subdivision multiplies by a thousand.
BUDGET = {
    'car': 400,
    'van': 400,
    'bus': 500,
    'traffic-signal': 400,
    'catenary-mast': 400,
    'tree-broadleaf': 900,
    'tree-conifer': 700,
    'street-lamp': 300,
    'platform-canopy': 500,
    'train-carriage': 1200,
    'train-cab': 1400,
    # Round 2. Trees are the expensive family because a crown is spheres; the
    # street furniture and the rooftop kit are boxes and stay tiny on purpose —
    # a chimney is instanced onto every pitched roof in view.
    'tree-palm': 900,
    'tree-columnar': 700,
    'tree-blossom': 900,
    'tree-olive': 800,
    'bench': 250,
    'litter-bin': 200,
    'bollard': 150,
    'bus-shelter': 300,
    'roof-chimney': 200,
    'roof-hvac': 350,
    'roof-tank': 400,
    'roof-stairbox': 200,
    # Round 3: Barcelona street furniture. Still instanced along every kerb, so
    # the same discipline — the cast-iron detail is a handful of boxes, not a
    # sculpted casting.
    'bench-bcn': 600,
    'lamp-park-bcn': 700,
    'lamp-street-bcn': 400,
    'fountain-bcn': 600,
    'ped-signal': 300,
    'traffic-signal-bcn': 600,
    'waste-basket-bcn': 300,
    # Round 4: moored boats. Bigger than street furniture because a hull is a
    # lofted surface rather than a box, but a marina is dozens of them, not the
    # hundreds a kerb carries — and most of the triangles are the thin rigging
    # and rails that make a boat read as a boat at all.
    'boat-motor': 1200,
    'boat-sail': 1200,
    'boat-small': 800,
}


# ── Scene helpers ─────────────────────────────────────────────────────────────

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def cube(name, size, at, color):
    """An axis-aligned box: size (x, y, z) in metres, `at` is the centre."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = Vector(size)
    bpy.ops.object.transform_apply(scale=True)
    ob.location = at
    ob['color'] = color
    return ob


def cyl(name, radius, depth, at, color, verts=8, axis='Z'):
    # Built at the origin, turned, THEN moved. See spin() for why the order is
    # not a style choice.
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, vertices=verts, location=(0, 0, 0),
    )
    ob = bpy.context.active_object
    ob.name = name
    if axis == 'X':
        ob.rotation_euler[1] = 1.5707963
    elif axis == 'Y':
        ob.rotation_euler[0] = 1.5707963
    bpy.ops.object.transform_apply(rotation=True)
    ob.location = at
    ob['color'] = color
    return ob


def _alone(ob):
    """Make `ob` the only selected object — transform_apply acts on selection."""
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def spin(ob, euler):
    """
    Rotate a part about its OWN centre.

    THIS IS THE BUG THAT ATE THE FIRST BUILD OF THESE ASSETS, so it is worth
    stating plainly: setting `rotation_euler` on an object that has already been
    positioned and then applying the transform swings the mesh around the WORLD
    origin, not around the part. A lamp arm authored 0.3 m off the column came
    out six metres down the street and four metres in the air, and nothing in
    the pipeline complains — the export succeeds, the triangle budget passes,
    the file is the right size. You only find out by measuring the result or by
    looking at it.

    Rotating at the origin and translating afterwards cannot do that.
    """
    at = tuple(ob.location)
    ob.location = (0, 0, 0)
    ob.rotation_euler = euler
    _alone(ob)
    bpy.ops.object.transform_apply(rotation=True)
    ob.location = at
    return ob


def squash(ob, scale):
    """Scale a part about its own centre — same trap as spin(), same fix."""
    at = tuple(ob.location)
    ob.location = (0, 0, 0)
    ob.scale = Vector(scale)
    _alone(ob)
    bpy.ops.object.transform_apply(scale=True)
    ob.location = at
    return ob


def sphere(name, radius, at, color, segments=10, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=radius, segments=segments, ring_count=rings, location=at,
    )
    ob = bpy.context.active_object
    ob.name = name
    ob['color'] = color
    return ob


def taper(ob, factor, axis=2):
    """Scale the upper half of a mesh toward its centre — a cheap taper."""
    me = ob.data
    zs = [v.co[axis] for v in me.vertices]
    lo, hi = min(zs), max(zs)
    if hi == lo:
        return
    for v in me.vertices:
        t = (v.co[axis] - lo) / (hi - lo)
        k = 1.0 + (factor - 1.0) * t
        for i in (0, 1, 2):
            if i != axis:
                v.co[i] *= k


def strut(name, p0, p1, width, color, verts=0):
    """
    A straight member from p0 to p1 — a box (verts=0) or a round tube.

    Built along Z at the origin, turned with spin() and only then moved to the
    midpoint, so it cannot orbit the world origin (see spin()).
    """
    a, b = Vector(p0), Vector(p1)
    d = b - a
    mid = tuple((a + b) / 2)
    if verts:
        ob = cyl(name, width / 2, d.length, (0, 0, 0), color, verts=verts)
    else:
        ob = cube(name, (width, width, d.length), (0, 0, 0), color)
    spin(ob, Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler())
    ob.location = mid
    return ob


def flute(ob, depth=0.86):
    """
    Pull every other vertex of a cylinder toward its axis: cast-iron fluting.

    Acts on the mesh's own coordinates, so call it on a part built by cyl() and
    before taper() — both read the part's local frame, never the world.
    """
    me = ob.data
    n = len({round(math.atan2(v.co.y, v.co.x), 4) for v in me.vertices})
    step = 2 * math.pi / n
    for v in me.vertices:
        k = round(math.atan2(v.co.y, v.co.x) / step)
        if k % 2:
            v.co.x *= depth
            v.co.y *= depth


def finish(name, parts, bake_origin=False, waterline=False):
    """
    Bake each part's colour into vertex colours, join, and drop to the floor.

    bake_origin=True also applies the joined object's location, so the GLB node
    carries NO translation. Without it the node keeps parts[0]'s position (a
    lamp column authored at z = 3.5 exports with translation [0, 0, 3.5]) while
    the drop to the floor acts on the local mesh only: the accessor min z reads
    0, which is all props-assets.test.ts looks at, but the loader bakes the node
    transform in, so the instance stands wherever parts[0] was. The Barcelona
    set (round 3) uses it; the earlier assets are left byte-identical here.

    waterline=True SKIPS the drop to the floor: the authored z = 0 plane is kept
    as it is, because for a boat it is the waterline and the hull is meant to go
    below it (see "Round 4: moored boats"). It needs bake_origin=True — with a
    node translation left in the file there would be no authored z = 0 to keep.
    """
    assert bake_origin or not waterline, 'waterline=True needs bake_origin=True'
    for ob in parts:
        me = ob.data
        layer = me.vertex_colors.new(name='Col')
        rgb = ob['color']
        for i in range(len(layer.data)):
            layer.data[i].color = (rgb[0], rgb[1], rgb[2], 1.0)

    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()

    ob = bpy.context.active_object
    ob.name = name

    if bake_origin:
        _alone(ob)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Base at z = 0 so an instance matrix can sit it on the ground directly.
    # Not for a boat: its z = 0 is the waterline, and it stays where authored.
    zs = [v.co.z for v in ob.data.vertices]
    if zs and not waterline:
        for v in ob.data.vertices:
            v.co.z -= min(zs)

    mat = bpy.data.materials.new(name=f'{name}-mat')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    attr = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.65
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


# ── Palettes ──────────────────────────────────────────────────────────────────
# Neutral on purpose: per-instance tint is applied at runtime, so a white-ish
# body takes a colour cleanly. Anything strongly coloured here would fight it.

BODY = (0.78, 0.78, 0.79)
GLASS = (0.20, 0.24, 0.29)
TYRE = (0.09, 0.09, 0.10)
TRIM = (0.28, 0.29, 0.31)
METAL = (0.45, 0.47, 0.50)
BARK = (0.32, 0.24, 0.18)
LEAF = (0.32, 0.48, 0.26)
CONCRETE = (0.66, 0.65, 0.64)
TIMBER = (0.48, 0.38, 0.28)
BRICK = (0.58, 0.50, 0.44)
NEEDLE = (0.24, 0.36, 0.24)
PALM_STEM = (0.42, 0.36, 0.28)
FROND = (0.30, 0.44, 0.24)
OLIVE = (0.42, 0.46, 0.34)
# Muted on purpose — see build_tree_blossom() for why this one is allowed to
# carry its own colour when the rest of the palette may not.
BLOSSOM = (0.72, 0.58, 0.62)


# ── Assets ────────────────────────────────────────────────────────────────────

def build_car():
    """A hatchback silhouette: bonnet, raked cabin, boot, four wheels."""
    parts = [
        cube('lower', (4.10, 1.78, 0.52), (0, 0, 0.52), BODY),
        cube('bonnet', (1.25, 1.70, 0.22), (1.35, 0, 0.88), BODY),
        cube('boot', (0.95, 1.70, 0.26), (-1.55, 0, 0.90), BODY),
    ]
    cabin = cube('cabin', (2.15, 1.66, 0.62), (-0.10, 0, 1.10), GLASS)
    taper(cabin, 0.82)
    parts.append(cabin)
    parts.append(cube('roof', (1.95, 1.60, 0.10), (-0.15, 0, 1.44), BODY))
    for x in (1.30, -1.35):
        for y in (0.80, -0.80):
            parts.append(cyl(f'wheel{x}{y}', 0.33, 0.22, (x, y, 0.33), TYRE, verts=8, axis='Y'))
    parts.append(cube('sill', (3.90, 1.84, 0.12), (0, 0, 0.30), TRIM))
    return finish('car', parts)


def build_van():
    """A box van — the other silhouette every street has."""
    parts = [
        cube('body', (5.20, 2.00, 1.70), (0, 0, 1.25), BODY),
        cube('cab', (1.40, 1.94, 0.85), (2.10, 0, 1.00), BODY),
        cube('screen', (0.18, 1.86, 0.66), (2.76, 0, 1.16), GLASS),
        cube('sill', (5.10, 2.06, 0.14), (0, 0, 0.42), TRIM),
    ]
    for x in (1.80, -1.60):
        for y in (0.92, -0.92):
            parts.append(cyl(f'wheel{x}{y}', 0.38, 0.24, (x, y, 0.38), TYRE, verts=8, axis='Y'))
    return finish('van', parts)


def build_train_carriage(cab=False):
    """A carriage with a rounded roof and a continuous window band."""
    # Height matters more than it looks: a carriage that tops out at 2.9 m sits
    # barely twice a car's roofline, and the eye reads it as a tram. A real one
    # is close to 4 m above rail, which is nearly three times the car.
    parts = [
        cube('body', (19.0, 2.86, 2.60), (0, 0, 2.30), BODY),
        cube('skirt', (18.6, 2.62, 0.75), (0, 0, 0.75), TRIM),
    ]
    parts.append(squash(
        cyl('roof', 1.44, 18.6, (0, 0, 3.75), BODY, verts=10, axis='X'),
        (1.0, 1.0, 0.34),
    ))
    for x in (7.0, -7.0):
        parts.append(cube(f'bogie{x}', (2.6, 2.2, 0.5), (x, 0, 0.45), TYRE))
        for axle in (-.85,.85):
            for side in (-1,1):
                parts.append(cyl('wheel',.43,.12,(x+axle,side*.78,.43),TYRE,verts=8,axis='Y'))
    for side in (-1,1):
        for x in (-7,-4.8,-2.6,-.4,1.8,4,6.2):
            parts.append(cube('window',(1.65,.035,.72),(x,side*1.44,2.85),GLASS))
        for x in (-8.4,8.4):
            parts.append(cube('door',(.8,.04,1.9),(x,side*1.44,2.15),TRIM))
            parts.append(cube('door-glass',(.55,.045,.6),(x,side*1.44,2.75),GLASS))
        parts.append(cube('blue-belt',(18.8,.04,.18),(0,side*1.44,2.22),(.08,.25,.48,1)))
    for x in (-9.35,9.35):
        if cab and x>0: continue
        parts.append(cube('gangway',(.3,1.4,1.8),(x,0,2.1),TYRE))
    if cab:
        # Reshape the driving end, keeping the 19 m placement envelope.
        for ob in parts:
            for v in ob.data.vertices:
                x=v.co.x+ob.location.x
                if x>6.5:
                    t=min(1,(x-6.5)/3)
                    v.co.y*=1-.58*t
                    v.co.z-=max(0,v.co.z+ob.location.z-1.4)*.32*t
        parts.append(cube('windscreen',(.025,1.12,.64),(9.505,0,2.47),GLASS))
        for y in (-.48,.48):
            parts.append(cube('headlight',(.06,.24,.12),(9.48,y,1.35),(1,.93,.7,1)))
    return finish('train-cab' if cab else 'train-carriage', parts)


def build_tree_broadleaf():
    """A trunk that forks, under a crown of overlapping masses."""
    trunk = cyl('trunk', 0.17, 3.0, (0, 0, 1.5), BARK, verts=6)
    taper(trunk, 0.62)
    parts = [trunk]
    for at, r in (((0.0, 0.0, 4.3), 1.85), ((0.95, 0.35, 4.9), 1.15),
                  ((-0.80, -0.45, 4.0), 1.05), ((0.15, -0.85, 5.2), 0.90)):
        parts.append(sphere(f'lobe{at}', r, at, LEAF, segments=8, rings=5))
    for a, b in (((0.6, 0.2, 3.4), 0.09), ((-0.5, -0.2, 3.2), 0.08)):
        parts.append(spin(cyl(f'limb{a}', b, 1.4, a, BARK, verts=5), (0.5, 0.4, 0)))
    return finish('tree-broadleaf', parts)


def build_tree_conifer():
    """Stacked tiers with a bare lower trunk — a fir, not a cone."""
    trunk = cyl('trunk', 0.16, 2.2, (0, 0, 1.1), BARK, verts=6)
    taper(trunk, 0.55)
    parts = [trunk]
    tiers = ((1.75, 2.2, 1.9), (1.35, 3.7, 1.7), (0.95, 5.0, 1.4), (0.5, 6.1, 1.0))
    for r, z, h in tiers:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0.0, depth=h, vertices=8,
                                        location=(0, 0, z + h / 2))
        ob = bpy.context.active_object
        ob.name = f'tier{z}'
        ob['color'] = (0.22, 0.38, 0.26)
        parts.append(ob)
    return finish('tree-conifer', parts)


def build_street_lamp():
    """Column, curved arm, luminaire. Reads at any distance the pole does."""
    column = cyl('column', 0.09, 7.0, (0, 0, 3.5), METAL, verts=6)
    taper(column, 0.7)
    parts = [column, cube('base', (0.32, 0.32, 0.35), (0, 0, 0.17), TRIM)]
    # The arm sweeps up and out from the column top: each segment is turned in
    # place and stepped along, so the joints meet instead of scattering.
    for i, (x, z, rot) in enumerate(((0.28, 6.95, 0.9), (0.72, 7.25, 0.5), (1.15, 7.38, 0.15))):
        parts.append(spin(cyl(f'arm{i}', 0.065, 0.55, (x, 0, z), METAL, verts=5), (0, rot, 0)))
    parts.append(cube('luminaire', (0.62, 0.26, 0.13), (1.55, 0, 7.34), (0.85, 0.84, 0.80)))
    return finish('street-lamp', parts)


def build_platform_canopy():
    """A platform shelter: columns, a beam, and a shallow pitched roof."""
    parts = []
    for x in (-5.0, 0.0, 5.0):
        parts.append(cyl(f'col{x}', 0.11, 3.2, (x, 0, 1.6), METAL, verts=6))
    parts.append(cube('beam', (11.4, 0.28, 0.30), (0, 0, 3.30), METAL))
    for y, rot in ((1.55, -0.16), (-1.55, 0.16)):
        parts.append(spin(cube(f'roof{y}', (11.8, 3.30, 0.09), (0, y, 3.62), CONCRETE),
                          (rot, 0, 0)))
    parts.append(cube('fascia', (11.8, 0.10, 0.20), (0, 3.15, 3.42), TRIM))
    return finish('platform-canopy', parts)


def build_bus():
    """A city bus: the silhouette that says "this is a street with a service"."""
    parts = [
        cube('body', (11.90, 2.52, 2.10), (0, 0, 1.10), BODY),
        cube('glazing', (11.30, 2.58, 0.95), (0, 0, 2.05), GLASS),
        cube('screen', (0.16, 2.34, 1.25), (5.92, 0, 1.95), GLASS),
        cube('skirt', (11.70, 2.58, 0.55), (0, 0, 0.62), TRIM),
    ]
    # A shallow crowned roof. Flat-topped buses read as shipping containers.
    parts.append(squash(
        cyl('roof', 1.30, 11.6, (0, 0, 2.62), BODY, verts=10, axis='X'),
        (1.0, 1.0, 0.30),
    ))
    # Doors are what make the scale legible: two dark slots at kerb height.
    for x in (4.05, -1.35):
        parts.append(cube(f'door{x}', (1.15, 2.60, 1.95), (x, 0, 1.30), GLASS))
    for x, y in ((4.30, 1.28), (4.30, -1.28), (-3.30, 1.28), (-3.30, -1.28)):
        parts.append(cyl(f'wheel{x}{y}', 0.51, 0.28, (x, y, 0.51), TYRE, verts=8, axis='Y'))
    return finish('bus', parts)


def build_traffic_signal():
    """
    A signal head on a pole, facing +X.

    The backboard is not decoration. At the size a signal occupies in a street
    view, three coloured dots on a dark box wash out against whatever is behind
    them; the pale surround is exactly what real installations add for the same
    reason, and it is what makes the head read at a distance.
    """
    H = 3.35
    column = cyl('column', 0.075, H, (0, 0, H / 2), METAL, verts=6)
    taper(column, 0.8)
    parts = [column, cube('base', (0.30, 0.30, 0.28), (0, 0, 0.14), TRIM)]
    parts.append(cube('backboard', (0.05, 0.54, 1.30), (-0.02, 0, H - 0.05), (0.80, 0.79, 0.76)))
    parts.append(cube('housing', (0.24, 0.38, 1.12), (0.10, 0, H - 0.05), (0.14, 0.15, 0.16)))
    for dz, rgb in ((0.38, (0.88, 0.16, 0.13)), (0.0, (0.94, 0.68, 0.10)), (-0.38, (0.20, 0.76, 0.34))):
        lens = cyl(f'lens{dz}', 0.115, 0.07, (0.235, 0, H - 0.05 + dz), rgb, verts=8, axis='X')
        parts.append(lens)
        # A hood over each lens: the shadow it casts is most of what stops the
        # three reading as one bright smear in a low sun.
        parts.append(cube(f'hood{dz}', (0.20, 0.28, 0.05), (0.30, 0, H + 0.10 + dz), (0.12, 0.13, 0.14)))
    return finish('traffic-signal', parts)


def build_catenary_mast():
    """
    An overhead line mast with its cantilever reaching over the track (+X).

    The bare post it replaces was indistinguishable from a fence stake. What
    makes a catenary mast recognisable is the cantilever and the stay above it —
    the triangle they form is the shape people have seen from every train.
    """
    H = 7.6
    column = cyl('column', 0.16, H, (0, 0, H / 2), METAL, verts=6)
    taper(column, 0.62)
    parts = [column, cube('footing', (0.60, 0.60, 0.45), (0, 0, 0.22), CONCRETE)]
    # Cantilever out over the track, and the diagonal stay that carries it.
    parts.append(cube('cantilever', (3.30, 0.13, 0.15), (1.62, 0, H - 0.55), METAL))
    stay = cyl('stay', 0.055, 3.05, (1.45, 0, H - 0.05), METAL, verts=5)
    parts.append(spin(stay, (0, 1.30, 0)))
    # Registration arm and the dropper that holds the contact wire.
    parts.append(cube('registration', (0.70, 0.09, 0.09), (2.95, 0, H - 1.05), METAL))
    parts.append(cube('dropper', (0.06, 0.06, 0.55), (3.20, 0, H - 1.35), METAL))
    for z in (H - 1.90, H - 2.55):
        parts.append(cube(f'insulator{z}', (0.16, 0.16, 0.22), (0.30, 0, z), (0.72, 0.70, 0.66)))
    return finish('catenary-mast', parts)


# ── Round 2 assets ────────────────────────────────────────────────────────────
# WHY THESE TWELVE, and not "more cars". The first ten props fixed the things a
# camera at street level looks AT. What still read as a game was the things it
# looks PAST: two tree species for a whole neighbourhood (the repeat is visible
# the moment there are fifty), pavements with nothing standing on them, and —
# the one that costs the most and is the least obvious — roofs that are empty
# planes. A real skyline is broken by chimneys, plant and tanks; an empty roof
# is the clearest tell that a block was extruded rather than built.
#
# The rooftop kit is deliberately NOT a fourth building detail level. These are
# instanced props scattered onto the roofs the extruder already makes, so they
# cost draw calls per SPECIES and not per building — the same property the
# canopy has.


def build_tree_palm():
    """
    A palm: bare curved stem, crown of drooping fronds.

    The silhouette is the whole asset — a palm at 40 m is a stick and a splash.
    The stem is stepped rather than swept so it stays inside budget while still
    leaning, which is what keeps a row of them from reading as lamp posts.
    """
    parts = []
    for i, (x, z, rot) in enumerate(((0.0, 0.9, 0.03), (0.10, 2.6, 0.07),
                                     (0.30, 4.2, 0.11), (0.62, 5.6, 0.15))):
        seg = cyl('stem%d' % i, 0.20 - i * 0.02, 1.8, (x, 0, z), PALM_STEM, verts=6)
        parts.append(spin(seg, (0, rot, 0)))
    cx, cz = 0.86, 6.35
    parts.append(sphere('heart', 0.30, (cx, 0, cz), (0.36, 0.40, 0.24), segments=6, rings=4))
    # Eight fronds around the crown, each a flattened box turned outward and
    # down. spin() first, place second — the other order orbits the world
    # origin, which is the trap documented on spin() itself.
    for i in range(8):
        a = i * (math.pi / 4)
        frond = cube('frond%d' % i, (2.30, 0.42, 0.06), (0, 0, 0), FROND)
        spin(frond, (0, 0.34, a))
        frond.location = (cx + 1.05 * math.cos(a), 1.05 * math.sin(a), cz - 0.30)
        parts.append(frond)
    return finish('tree-palm', parts)


def build_tree_columnar():
    """
    A cypress or Lombardy poplar: tall, narrow, near-vertical.

    Exists because every avenue in the previous build was broadleaf spheres of
    one radius. A columnar species breaks that rhythm with a single extra asset,
    and it is the cheapest tree in the set — three tapered lobes on a stick.
    """
    trunk = cyl('trunk', 0.14, 2.0, (0, 0, 1.0), BARK, verts=6)
    taper(trunk, 0.6)
    parts = [trunk]
    for z, r, s in ((2.9, 0.95, (1.0, 1.0, 1.9)), (5.0, 0.82, (1.0, 1.0, 1.7)),
                    (6.8, 0.55, (1.0, 1.0, 1.5))):
        lobe = sphere('lobe%s' % z, r, (0, 0, z), NEEDLE, segments=7, rings=5)
        squash(lobe, s)
        parts.append(lobe)
    return finish('tree-columnar', parts)


def build_tree_blossom():
    """
    A blossoming ornamental — cherry, plum or jacaranda depending on the tint.

    THE ONE ASSET THAT BENDS THE NEUTRAL-PALETTE RULE, on the same precedent the
    conifer set: for a tree whose entire identity is the colour of its crown, a
    neutral base tinted at runtime is a grey tree everywhere the tint is not
    applied. The tone baked here is muted, so a runtime tint reads on top of it
    instead of fighting a saturated pink.
    """
    trunk = cyl('trunk', 0.16, 2.1, (0, 0, 1.05), BARK, verts=6)
    taper(trunk, 0.58)
    parts = [trunk]
    for i, a in enumerate((0.0, 2.09, 4.18)):
        limb = cyl('limb%d' % i, 0.085, 1.5, (0, 0, 0), BARK, verts=5)
        spin(limb, (0.55 * math.sin(a), 0.55 * math.cos(a), 0))
        limb.location = (0.42 * math.cos(a), 0.42 * math.sin(a), 2.6)
        parts.append(limb)
    for i, (at, r) in enumerate((((0.0, 0.0, 3.9), 1.55), ((0.95, 0.30, 3.6), 1.00),
                                 ((-0.85, 0.35, 3.7), 0.95), ((0.05, -0.90, 3.55), 0.90))):
        lobe = sphere('bloom%d' % i, r, at, BLOSSOM, segments=8, rings=5)
        squash(lobe, (1.0, 1.0, 0.68))
        parts.append(lobe)
    return finish('tree-blossom', parts)


def build_tree_olive():
    """
    A Mediterranean olive: short gnarled trunk, wide low silver-green crown.

    Wide and LOW is the point — it is the species that stops a southern square
    looking like a northern one, and it does that by sitting under the eaveline
    instead of over it.
    """
    trunk = cyl('trunk', 0.30, 1.5, (0, 0, 0.75), (0.40, 0.36, 0.30), verts=7)
    taper(trunk, 0.72)
    parts = [trunk]
    for i, (at, r, s) in enumerate((((0.0, 0.0, 2.5), 1.70, (1.25, 1.25, 0.70)),
                                    ((0.85, 0.45, 2.2), 1.05, (1.15, 1.15, 0.72)),
                                    ((-0.75, -0.55, 2.3), 1.00, (1.15, 1.15, 0.72)))):
        lobe = sphere('lobe%d' % i, r, at, OLIVE, segments=8, rings=5)
        squash(lobe, s)
        parts.append(lobe)
    return finish('tree-olive', parts)


def build_bench():
    """A public bench: slatted seat and back on two cast ends."""
    parts = []
    for i, x in enumerate((-0.72, 0.72)):
        parts.append(cube('leg%d' % i, (0.09, 0.56, 0.42), (x, 0, 0.21), TRIM))
    for i, y in enumerate((-0.22, 0.0, 0.22)):
        parts.append(cube('slat%d' % i, (1.80, 0.16, 0.05), (0, y, 0.45), TIMBER))
    for i, (z, y) in enumerate(((0.66, -0.26), (0.84, -0.30))):
        parts.append(cube('back%d' % i, (1.80, 0.05, 0.15), (0, y, z), TIMBER))
    return finish('bench', parts)


def build_litter_bin():
    """A street bin. Small, but its absence is what makes a pavement read empty."""
    body = cyl('body', 0.28, 0.80, (0, 0, 0.40), TRIM, verts=8)
    taper(body, 1.12)
    parts = [
        body,
        cyl('rim', 0.31, 0.07, (0, 0, 0.82), METAL, verts=8),
        cyl('post', 0.05, 0.95, (0, 0.34, 0.48), METAL, verts=5),
    ]
    return finish('litter-bin', parts)


def build_bollard():
    """A bollard. Cheapest asset in the set, and the one that draws a kerb line."""
    post = cyl('post', 0.11, 0.90, (0, 0, 0.45), TRIM, verts=8)
    taper(post, 0.86)
    parts = [post,
             cyl('cap', 0.12, 0.06, (0, 0, 0.90), METAL, verts=8),
             cube('band', (0.24, 0.24, 0.05), (0, 0, 0.72), (0.82, 0.80, 0.76))]
    return finish('bollard', parts)


def build_bus_shelter():
    """
    A bus shelter: glazed back and ends, cantilever roof, bench inside.

    Deliberately a DIFFERENT object from platform-canopy — that one is rail and
    spans a platform; this sits on a pavement, and it is what tells a viewer the
    street has a bus route without a bus needing to be parked in the shot.
    """
    parts = [
        cube('back', (4.00, 0.06, 2.10), (0, 0.72, 1.20), GLASS),
        cube('endL', (0.06, 1.44, 2.10), (-1.97, 0, 1.20), GLASS),
        cube('endR', (0.06, 1.44, 2.10), (1.97, 0, 1.20), GLASS),
        cube('roof', (4.30, 1.80, 0.10), (0, -0.05, 2.32), CONCRETE),
        cube('fascia', (4.30, 0.08, 0.20), (0, -0.90, 2.27), TRIM),
        cube('seat', (3.20, 0.36, 0.06), (0, 0.50, 0.46), TIMBER),
    ]
    for i, x in enumerate((-1.90, 1.90)):
        parts.append(cube('post%d' % i, (0.10, 0.10, 2.30), (x, 0.70, 1.15), METAL))
        parts.append(cube('seatleg%d' % i, (0.07, 0.34, 0.44), (x * 0.75, 0.50, 0.22), METAL))
    return finish('bus-shelter', parts)


def build_roof_chimney():
    """
    A chimney stack with pots.

    The rooftop kit's workhorse: on pitched roofs it is the difference between a
    village and a set of extruded prisms, for a handful of triangles.
    """
    parts = [cube('stack', (0.62, 0.62, 1.30), (0, 0, 0.65), BRICK),
             cube('crown', (0.74, 0.74, 0.12), (0, 0, 1.36), (0.66, 0.62, 0.58))]
    for i, x in enumerate((-0.16, 0.16)):
        parts.append(cyl('pot%d' % i, 0.11, 0.34, (x, 0, 1.59), (0.52, 0.36, 0.30), verts=6))
    return finish('roof-chimney', parts)


def build_roof_hvac():
    """
    A packaged rooftop air-handling unit.

    What actually stands on a flat commercial roof. Modelled as the box, the fan
    cowls and the kerb it sits on — the kerb matters, because plant flush on the
    deck is exactly what looks pasted on.
    """
    parts = [
        cube('kerb', (2.35, 1.65, 0.16), (0, 0, 0.08), (0.44, 0.44, 0.46)),
        cube('body', (2.20, 1.50, 0.95), (0, 0, 0.63), (0.70, 0.71, 0.72)),
        cube('duct', (0.55, 0.70, 0.45), (1.32, 0, 0.40), METAL),
    ]
    for i, x in enumerate((-0.52, 0.52)):
        parts.append(cyl('cowl%d' % i, 0.34, 0.22, (x, 0, 1.21), METAL, verts=8))
        parts.append(cyl('guard%d' % i, 0.30, 0.06, (x, 0, 1.35), TRIM, verts=8))
    return finish('roof-hvac', parts)


def build_roof_tank():
    """
    A cylindrical water tank on a braced frame.

    Regional on purpose: this is the silhouette of a Mediterranean, Middle
    Eastern or Latin American roofscape. It is placed by the same scatter as the
    rest, so a site's region can weight tanks where a northern one weights
    chimneys.
    """
    parts = [cyl('tank', 0.80, 1.35, (0, 0, 1.92), (0.74, 0.74, 0.72), verts=10),
             cyl('lid', 0.84, 0.10, (0, 0, 2.64), METAL, verts=10),
             cyl('hatch', 0.22, 0.14, (0.28, 0, 2.74), TRIM, verts=6)]
    for i, x in enumerate((-0.62, 0.62)):
        for j, y in enumerate((-0.62, 0.62)):
            parts.append(cube('leg%d%d' % (i, j), (0.09, 0.09, 1.25), (x, y, 0.62), METAL))
    parts.append(cube('braceX', (1.34, 0.06, 0.06), (0, 0.62, 0.42), METAL))
    parts.append(cube('braceY', (0.06, 1.34, 0.06), (0.62, 0, 0.42), METAL))
    return finish('roof-tank', parts)


def build_roof_stairbox():
    """
    The stair and lift overrun — the little house on top of a flat roof.

    Every flat-roofed building above three storeys has one, and it is the
    element that gives a rooftop a sense of scale seen from the air.
    """
    parts = [
        cube('box', (3.10, 2.60, 2.55), (0, 0, 1.27), (0.72, 0.71, 0.69)),
        cube('cap', (3.30, 2.80, 0.14), (0, 0, 2.62), (0.60, 0.60, 0.60)),
        cube('door', (0.08, 1.00, 2.05), (1.56, 0, 1.02), TRIM),
        cube('louvre', (1.10, 0.07, 0.60), (0, -1.32, 1.95), METAL),
        cyl('vent', 0.16, 0.70, (1.05, 0.90, 3.04), METAL, verts=6),
    ]
    return finish('roof-stairbox', parts)


# ── Round 3: Barcelona street furniture ───────────────────────────────────────
# WHY A REGIONAL SET, when round 2 was deliberately neutral: the generic bench
# and lamp read as "a city"; these read as Barcelona, which is the showcase city.
# They are the pieces a local notices first — the green-black cast-iron bench,
# the Ciutadella lantern, the Eixample arm over the carriageway, the drinking
# fountain on the corner, the low repeater under the vehicle signal.
#
# SO THEY BREAK THE NEUTRAL-PALETTE RULE, on the same precedent the blossom
# tree set: these are not tinted per instance, and a grey Barcelona bench is not
# a Barcelona bench. Colours are baked as the real paint.
#
# FACING, stated per asset because the placement code depends on it: every one
# of these faces LOCAL +X, like the rest of the file (street-lamp's arm, the
# traffic-signal lenses, the catenary cantilever). props-scene.ts yaws kerbside
# furniture so that +X points across the carriageway ("facing the street, like
# the lamp arm"), so +X is also the side a person uses. Every one is built with
# finish(bake_origin=True): the GLB node carries no translation.
#
#   bench-bcn           seated person faces +X; length along Y; back at -X.
#   lamp-park-bcn       rotationally symmetric; nominal front +X.
#   lamp-street-bcn     arm reaches +X; column at the origin.
#   fountain-bcn        spout and basin face +X; column at the origin.
#   ped-signal          lenses face +X; pole at the origin.
#   traffic-signal-bcn  both heads' lenses face +X; pole at the origin.
#   waste-basket-bcn    bin hangs off the post toward +X; bin at the origin.
#
# NOTE the round-2 `bench` does NOT follow this: its length runs along X and a
# seated person faces +Y, so under the kerbside yaw it stands end-on to the
# street. bench-bcn is built the way the placement code assumes.

IRON_BCN = (0.169, 0.200, 0.188)      # #2b3330, the green-black cast iron
WOOD_BCN = (0.56, 0.34, 0.17)         # varnished tropical hardwood slats
PARK_IRON = (0.12, 0.19, 0.16)        # Ciutadella lantern green-black
FOUNT_GREEN = (0.15, 0.27, 0.20)      # drinking-fountain green
STEEL_BCN = (0.25, 0.26, 0.27)        # Eixample column dark grey
LANTERN_GLASS = (0.96, 0.88, 0.66)    # pale warm glass
BRASS = (0.70, 0.55, 0.28)
SIGNAL_BODY = (0.11, 0.12, 0.12)
LENS_RED = (0.96, 0.14, 0.10)
LENS_AMBER = (1.00, 0.70, 0.08)
LENS_GREEN = (0.12, 0.86, 0.42)
BIN_GREY = (0.58, 0.60, 0.61)


def cone(name, r1, r2, depth, at, color, verts=8):
    """A frustum along Z, built at the origin and then placed."""
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth,
                                    vertices=verts, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.location = at
    ob['color'] = color
    return ob


def build_bench_bcn():
    """
    The Barcelona "banc romàntic": timber slats over two cast-iron ends.

    FRONT: a seated person faces local +X. The bench runs along Y (1.8 m), the
    backrest leans back toward -X, the base is at z = 0 and the footprint is
    centred on the origin.
    """
    parts = []
    L = 1.80
    for side in (-1, 1):
        y = side * 0.80
        # The cast end: two legs on a foot rail, the seat bearer, a raked back
        # standard in two pieces (the curve), and a scrolled armrest.
        parts.append(strut('legF%d' % side, (0.20, y, 0.0), (0.17, y, 0.43), 0.055, IRON_BCN))
        parts.append(strut('legR%d' % side, (-0.20, y, 0.0), (-0.17, y, 0.43), 0.055, IRON_BCN))
        parts.append(cube('foot%d' % side, (0.46, 0.055, 0.04), (0, y, 0.02), IRON_BCN))
        parts.append(cube('bearer%d' % side, (0.48, 0.055, 0.05), (0.02, y, 0.405), IRON_BCN))
        parts.append(strut('backLo%d' % side, (-0.19, y, 0.40), (-0.25, y, 0.64), 0.05, IRON_BCN))
        parts.append(strut('backHi%d' % side, (-0.25, y, 0.64), (-0.31, y, 0.85), 0.05, IRON_BCN))
        parts.append(strut('armPost%d' % side, (0.17, y, 0.43), (0.16, y, 0.64), 0.045, IRON_BCN))
        parts.append(strut('arm%d' % side, (-0.23, y, 0.63), (0.17, y, 0.65), 0.045, IRON_BCN))
        parts.append(cyl('scroll%d' % side, 0.04, 0.05, (0.19, y, 0.63), IRON_BCN, verts=6, axis='Y'))
    # Seat: five slats, the front one dropped a little — the waterfall edge.
    for i, (x, z) in enumerate(((0.20, 0.435), (0.11, 0.445), (0.02, 0.45),
                                (-0.07, 0.45), (-0.16, 0.445))):
        parts.append(cube('seat%d' % i, (0.075, L, 0.03), (x, 0, z), WOOD_BCN))
    # Back: four slats following the curve of the standards, each tilted with it.
    for i, (x, z, rot) in enumerate(((-0.215, 0.52, -0.24), (-0.24, 0.62, -0.24),
                                     (-0.268, 0.72, -0.28), (-0.292, 0.81, -0.28))):
        parts.append(spin(cube('back%d' % i, (0.03, L, 0.075), (x, 0, z), WOOD_BCN),
                          (0, rot, 0)))
    return finish('bench-bcn', parts, bake_origin=True)


def build_lamp_park_bcn():
    """
    A park / promenade post-top lantern (Ciutadella, Passeig Lluís Companys).

    Fluted cast-iron column on a moulded base, lantern with pale warm panes
    that widen toward the roof. No arm: rotationally symmetric, nominal front
    +X. Column on the origin, base at z = 0.
    """
    parts = [
        cyl('plinth', 0.23, 0.12, (0, 0, 0.06), PARK_IRON, verts=8),
    ]
    drum = cyl('drum', 0.17, 0.46, (0, 0, 0.35), PARK_IRON, verts=8)
    taper(drum, 0.78)
    parts.append(drum)
    parts.append(cyl('collar', 0.15, 0.06, (0, 0, 0.61), PARK_IRON, verts=8))
    column = cyl('column', 0.078, 2.72, (0, 0, 0.64 + 1.36), PARK_IRON, verts=16)
    flute(column, 0.84)
    taper(column, 0.74)
    parts.append(column)
    parts.append(cone('bell', 0.065, 0.13, 0.14, (0, 0, 3.42), PARK_IRON, verts=8))
    parts.append(cyl('capital', 0.13, 0.05, (0, 0, 3.515), PARK_IRON, verts=8))
    # Lantern: floor plate, glass, the six corner bars, the crown and roof.
    parts.append(cyl('floor', 0.16, 0.04, (0, 0, 3.56), PARK_IRON, verts=6))
    glass = cyl('glass', 0.145, 0.42, (0, 0, 3.79), LANTERN_GLASS, verts=6)
    taper(glass, 1.36)
    parts.append(glass)
    lo = [v.co for v in glass.data.vertices if v.co.z < 0]
    hi = [v.co for v in glass.data.vertices if v.co.z > 0]
    for i, b in enumerate(lo):
        # The top corner on the same bearing — taper() scaled it radially.
        t = min(hi, key=lambda h: abs(math.atan2(h.y, h.x) - math.atan2(b.y, b.x)))
        parts.append(strut('bar%d' % i, (b.x, b.y, 3.58), (t.x, t.y, 4.00), 0.022, PARK_IRON))
    parts.append(cyl('crown', 0.215, 0.05, (0, 0, 4.025), PARK_IRON, verts=6))
    parts.append(cone('roof', 0.235, 0.035, 0.17, (0, 0, 4.135), PARK_IRON, verts=6))
    parts.append(sphere('finial', 0.04, (0, 0, 4.25), PARK_IRON, segments=6, rings=4))
    return finish('lamp-park-bcn', parts, bake_origin=True)


def build_lamp_street_bcn():
    """
    The Eixample street lamp: a tall slender dark-grey column with one long arm
    reaching over the carriageway to a flat luminaire.

    FRONT: the arm reaches local +X — the same convention as `street-lamp`, so
    the kerbside yaw in props-scene.ts puts it over the road. Column on the
    origin, base at z = 0.
    """
    base = cyl('base', 0.15, 0.95, (0, 0, 0.475), STEEL_BCN, verts=8)
    taper(base, 0.82)
    column = cyl('column', 0.105, 8.55, (0, 0, 0.95 + 4.275), STEEL_BCN, verts=8)
    taper(column, 0.52)
    parts = [base, column,
             cyl('cap', 0.07, 0.08, (0, 0, 9.54), STEEL_BCN, verts=8)]
    # One straight arm, rising slightly, with a brace under its root. Struts are
    # built at the origin and placed, so the joints meet where they are drawn.
    parts.append(strut('arm', (0.0, 0, 9.35), (2.60, 0, 9.62), 0.075, STEEL_BCN, verts=6))
    parts.append(strut('brace', (0.03, 0, 8.70), (0.95, 0, 9.44), 0.05, STEEL_BCN, verts=5))
    parts.append(cube('luminaire', (0.80, 0.32, 0.10), (2.82, 0, 9.60), STEEL_BCN))
    parts.append(cube('diffuser', (0.70, 0.26, 0.02), (2.84, 0, 9.54), (0.93, 0.91, 0.84)))
    return finish('lamp-street-bcn', parts, bake_origin=True)


def build_fountain_bcn():
    """
    A Barcelona cast-iron drinking fountain (the green "Fernando" column).

    FRONT: the brass spout and the basin under it face local +X. Column on the
    origin, base at z = 0.
    """
    parts = [cyl('plinth', 0.30, 0.10, (0, 0, 0.05), FOUNT_GREEN, verts=8)]
    ped = cyl('pedestal', 0.22, 0.36, (0, 0, 0.28), FOUNT_GREEN, verts=8)
    taper(ped, 0.80)
    parts.append(ped)
    parts.append(cyl('torus', 0.19, 0.06, (0, 0, 0.49), FOUNT_GREEN, verts=8))
    column = cyl('column', 0.095, 0.86, (0, 0, 0.52 + 0.43), FOUNT_GREEN, verts=16)
    flute(column, 0.84)
    taper(column, 0.82)
    parts.append(column)
    parts.append(cyl('capital', 0.145, 0.09, (0, 0, 1.425), FOUNT_GREEN, verts=8))
    dome = sphere('dome', 0.13, (0, 0, 1.48), FOUNT_GREEN, segments=8, rings=5)
    squash(dome, (1.0, 1.0, 0.75))
    parts.append(dome)
    parts.append(cyl('stem', 0.03, 0.14, (0, 0, 1.63), FOUNT_GREEN, verts=6))
    parts.append(sphere('ball', 0.055, (0, 0, 1.73), FOUNT_GREEN, segments=6, rings=4))
    # The spout: a boss on the column and a short brass pipe out along +X.
    parts.append(cyl('boss', 0.055, 0.05, (0.095, 0, 0.98), FOUNT_GREEN, verts=8, axis='X'))
    parts.append(cyl('spout', 0.018, 0.16, (0.19, 0, 0.98), BRASS, verts=6, axis='X'))
    parts.append(cyl('nozzle', 0.022, 0.04, (0.27, 0, 0.965), BRASS, verts=6))
    # The basin at the foot, in front, with its dark drain grate. It stands on
    # the pavement, not on the plinth: it reaches past the plinth's edge, and
    # starting it at the plinth top left it hovering 10 cm over the ground.
    basin = cyl('basin', 0.15, 0.30, (0.30, 0, 0.15), FOUNT_GREEN, verts=10)
    taper(basin, 1.3)
    parts.append(basin)
    parts.append(cyl('grate', 0.195, 0.012, (0.30, 0, 0.301), (0.06, 0.07, 0.07), verts=10))
    return finish('fountain-bcn', parts, bake_origin=True)


def build_ped_signal():
    """
    A pedestrian signal: slim dark pole, two-lens head near the top.

    FRONT: the lenses (red over green) face local +X. Pole on the origin, base
    at z = 0; the head hangs on the +X face of the pole.
    """
    H = 2.80
    pole = cyl('pole', 0.045, H, (0, 0, H / 2), STEEL_BCN, verts=6)
    parts = [pole,
             cyl('foot', 0.075, 0.10, (0, 0, 0.05), STEEL_BCN, verts=6),
             cyl('cap', 0.052, 0.03, (0, 0, H + 0.015), STEEL_BCN, verts=6),
             cube('housing', (0.17, 0.26, 0.60), (0.13, 0, 2.43), SIGNAL_BODY)]
    for z, rgb in ((2.58, LENS_RED), (2.28, LENS_GREEN)):
        # Square lenses, as the Spanish pedestrian heads are.
        parts.append(cube('lens%s' % z, (0.02, 0.20, 0.21), (0.225, 0, z), rgb))
        parts.append(cube('hood%s' % z, (0.12, 0.23, 0.02), (0.285, 0, z + 0.125), SIGNAL_BODY))
    return finish('ped-signal', parts, bake_origin=True)


def build_traffic_signal_bcn():
    """
    A Barcelona vehicle signal: dark pole, three-lens head at the top, and the
    low repeater at driver's-eye height for the car stopped at the line.

    FRONT: every lens faces local +X — the same axis as `traffic-signal`. Pole
    on the origin, base at z = 0; both heads hang on the +X face of the pole.
    No pale backboard: Barcelona's heads are dark, and the lenses carry it.
    """
    H = 3.50
    column = cyl('pole', 0.062, H, (0, 0, H / 2), STEEL_BCN, verts=6)
    taper(column, 0.85)
    parts = [column,
             cyl('foot', 0.10, 0.12, (0, 0, 0.06), STEEL_BCN, verts=6),
             cyl('cap', 0.058, 0.03, (0, 0, H + 0.015), STEEL_BCN, verts=6),
             cube('housing', (0.22, 0.32, 0.94), (0.16, 0, 3.02), SIGNAL_BODY)]
    for z, rgb in ((3.32, LENS_RED), (3.02, LENS_AMBER), (2.72, LENS_GREEN)):
        parts.append(cyl('lens%s' % z, 0.105, 0.03, (0.285, 0, z), rgb, verts=8, axis='X'))
        parts.append(cube('hood%s' % z, (0.16, 0.25, 0.02), (0.35, 0, z + 0.125), SIGNAL_BODY))
    parts.append(cube('rep-housing', (0.12, 0.16, 0.44), (0.11, 0, 1.76), SIGNAL_BODY))
    for z, rgb in ((1.90, LENS_RED), (1.76, LENS_AMBER), (1.62, LENS_GREEN)):
        parts.append(cyl('rep%s' % z, 0.05, 0.02, (0.18, 0, z), rgb, verts=8, axis='X'))
    return finish('traffic-signal-bcn', parts, bake_origin=True)


def build_waste_basket_bcn():
    """
    Barcelona's cylindrical grey-metal litter bin on a single post.

    FRONT: the bin hangs off the post toward local +X (the post stands behind
    it, at -X). Bin centred on the origin, base of the post at z = 0.
    """
    parts = [
        cyl('post', 0.03, 0.92, (-0.205, 0, 0.46), STEEL_BCN, verts=6),
        cyl('body', 0.17, 0.50, (0, 0, 0.62), BIN_GREY, verts=10),
        cyl('rim', 0.182, 0.035, (0, 0, 0.8825), BIN_GREY, verts=10),
        cyl('mouth', 0.155, 0.01, (0, 0, 0.90), (0.08, 0.08, 0.08), verts=10),
        cyl('bottom', 0.12, 0.03, (0, 0, 0.355), STEEL_BCN, verts=10),
    ]
    # The two darker perforated bands that give it its look at a distance.
    for z in (0.47, 0.80):
        parts.append(cyl('band%s' % z, 0.174, 0.035, (0, 0, z), (0.42, 0.44, 0.45), verts=10))
    for z in (0.45, 0.78):
        parts.append(cube('clamp%s' % z, (0.07, 0.06, 0.05), (-0.17, 0, z), STEEL_BCN))
    return finish('waste-basket-bcn', parts, bake_origin=True)


# ── Round 4: moored boats ─────────────────────────────────────────────────────
# WHY BOATS: Port Vell and the Marina Vela are water edged with pontoons, and a
# pontoon with nothing moored to it reads as a car park by the sea. Three hulls
# cover what a Mediterranean marina is actually full of: motor cruisers, sailing
# yachts (whose masts are the marina's skyline) and the small open llaüts.
#
# ══ THE BOATS DO NOT STAND ON z = 0. FOR A BOAT, z = 0 IS THE WATERLINE. ══════
#
#   • z = 0 is the plane of the water surface. The hull goes BELOW it (the
#     antifouling bottom, ~0.4–0.65 m) and everything else is above it. The
#     placement code puts an instance's z = 0 on the water level, never on a
#     terrain sample.
#   • They are built with finish(..., bake_origin=True, waterline=True): the
#     joined mesh is NOT dropped to min z = 0 like every other asset here, and
#     the GLB node carries no translation, so the authored z = 0 is exactly the
#     z = 0 of the file.
#   • src/lib/geo/props-assets.ts loadOne() re-grounds every asset to min z = 0
#     EXCEPT names starting with 'boat-', which it leaves as authored. That
#     exception is only exact because the node translation is zero: a boat built
#     without bake_origin would come out wherever parts[0] happened to be.
#   • scripts/blender/props-assets.test.ts exempts 'boat-*' from "stands on the
#     ground" and asserts instead that the waterline cuts the hull (min z
#     between -1.2 and -0.2 m). So a boat that silently got dropped to z = 0
#     (sitting ON the water like a toy) fails a test.
#
# FACING: the BOW points local +X, the stern -X. Length runs along X, beam
# along Y, and the boat is centred on the origin in both (symmetric about
# y = 0; x = 0 is roughly amidships). In the Med a berth is stern-to the
# pontoon, so placement yaws +X away from the quay.
#
# Built like the rest of the file: every primitive at the origin, placed after.
# The hull is the one part that is not a primitive: hull() lofts it from
# stations, writing each vertex directly in the boat's frame. That object never
# moves, so there is no transform on it to get wrong.
#
# Colours are the real paint, not a tintable neutral: a per-instance tint is
# NOT applied to boats (white hulls are what a marina looks like).
#
# NOT MODELLED, on purpose: the sailing yacht's fin keel (a real one draws
# ~1.9 m) and every rudder and propeller. They sit under water that is never
# transparent, would cost triangles nobody sees, and would make the bounding
# box describe a boat bigger than the one on screen.

HULL_WHITE = (0.90, 0.90, 0.88)
DECK_WHITE = (0.80, 0.80, 0.77)       # non-slip deck, a shade off the topsides
BOOT_STRIPE = (0.07, 0.10, 0.16)      # the dark navy boot-top line
ANTIFOUL = (0.30, 0.12, 0.10)         # oxide-red bottom paint, below the water
TEAK = (0.56, 0.41, 0.26)
BOAT_GLASS = (0.09, 0.11, 0.14)
STAINLESS = (0.72, 0.74, 0.76)
ALU = (0.76, 0.78, 0.80)              # anodised mast and boom
SAIL_COVER = (0.50, 0.64, 0.78)       # light-blue stack-pack and UV strip
CUSHION = (0.86, 0.84, 0.78)
FENDER = (0.93, 0.93, 0.92)
LLAUT_BLUE = (0.16, 0.36, 0.60)       # the sheer band of a Balearic llaüt
LLAUT_WOOD = (0.62, 0.47, 0.30)

BOOT_TOP = 0.14   # top of the boot stripe, metres above the waterline


def _hull_pt(st, z, side):
    """
    The hull surface at height z on one side (+1 port, -1 starboard) of a station.

    A station is (x, b_sheer, z_sheer, b_chine, z_chine, z_keel, rake): the half-
    breadths at the sheer and the chine, the heights of sheer, chine and keel,
    and how far the stem leans forward per metre of height (negative leans aft,
    for a double-ender's stern post). The half-breadth runs linearly from the
    keel (on the centreline) out to the chine and on up to the sheer.
    """
    x, b, zd, c, zc, zk, rake = st
    if z <= zc:
        h = c * (z - zk) / (zc - zk)
    else:
        h = c + (b - c) * (z - zc) / (zd - zc)
    return Vector((x + rake * z, side * h, z))


def _deck_z(stations, x):
    """Sheer height at x, interpolated between stations — for sitting parts on deck."""
    for a, b in zip(stations, stations[1:]):
        if a[0] <= x <= b[0]:
            t = (x - a[0]) / (b[0] - a[0])
            return a[2] + (b[2] - a[2]) * t
    return stations[0][2] if x < stations[0][0] else stations[-1][2]


def _mesh(name, faces, color):
    """
    One object from a list of (coords, outward_hint, smooth) faces.

    Vertices are shared only between smooth faces, so a flat transom does not
    bend the shading of the topsides it meets. `outward_hint` (or None when the
    winding is right by construction) is the direction the face must look:
    it is flipped to agree with it, because a front-side material hides a face
    that points into the boat and nothing else would say so.
    """
    bm = bmesh.new()
    shared = {}
    for coords, hint, smooth in faces:
        vs = []
        for co in coords:
            key = (round(co.x, 5), round(co.y, 5), round(co.z, 5))
            v = shared.get(key) if smooth else None
            if v is None:
                v = bm.verts.new(co)
                if smooth:
                    shared[key] = v
            vs.append(v)
        f = bm.faces.new(vs)
        f.normal_update()
        if hint is not None and f.normal.dot(hint) < 0:
            f.normal_flip()
        f.smooth = smooth
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob['color'] = color
    return ob


def hull(name, stations, top=HULL_WHITE, boot=BOOT_STRIPE, bottom=ANTIFOUL,
         deck=DECK_WHITE, sheer_band=None, well=0.0, wall=0.06):
    """
    A hull lofted through `stations` (stern first, bow last), waterline at z = 0.

    Returned as separately coloured parts — sheer band (optional), topsides,
    boot stripe (0 → BOOT_TOP), antifouled bottom (below z = 0) and the deck —
    because finish() colours per part. well > 0 makes an open boat: the floor
    sits `well` below the sheer, with an inner bulwark `wall` thick.
    """
    bands = []
    if sheer_band:
        d, color = sheer_band
        bands.append(('sheer', lambda st: [st[2], st[2] - d], color))
        bands.append(('topsides', lambda st: [st[2] - d, BOOT_TOP], top))
    else:
        bands.append(('topsides', lambda st: [st[2], BOOT_TOP], top))
    bands.append(('boot', lambda st: [BOOT_TOP, 0.0], boot))
    bands.append(('bottom', lambda st: [0.0, st[4], st[5]], bottom))

    parts = []
    for label, levels, color in bands:
        keel = label == 'bottom'
        rings = []
        for st in stations:
            zs = levels(st)
            port = [_hull_pt(st, z, 1) for z in zs]
            stbd = [_hull_pt(st, z, -1) for z in reversed(zs)]
            if keel:
                stbd = stbd[1:]          # the keel is one vertex, on the centreline
            rings.append((port, stbd))
        faces = []
        for (pa, sa), (pb, sb) in zip(rings, rings[1:]):
            # The bottom is one strip through the keel; a band above it is two,
            # one per side — joining them would lay a face across the inside.
            strips = [(pa + sa, pb + sb)] if keel else [(pa, pb), (sa, sb)]
            for a, b in strips:
                for k in range(len(a) - 1):
                    # Stern-to-bow, then down the port side and up the
                    # starboard: this winding faces outward all the way round.
                    faces.append(([a[k], b[k], b[k + 1], a[k + 1]], None, True))
        faces.append((rings[0][0] + rings[0][1], Vector((-1, 0, 0)), False))
        faces.append((rings[-1][0] + rings[-1][1], Vector((1, 0, 0)), False))
        parts.append(_mesh(f'{name}-{label}', faces, color))

    up = Vector((0, 0, 1))
    sheer = [(_hull_pt(st, st[2], 1), _hull_pt(st, st[2], -1)) for st in stations]
    if not well:
        faces = [([p0, s0, s1, p1], up, False)
                 for (p0, s0), (p1, s1) in zip(sheer, sheer[1:])]
        parts.append(_mesh(f'{name}-deck', faces, deck))
        return parts

    inner = []
    for st in stations:
        z = st[2] - well
        p, s = _hull_pt(st, z, 1), _hull_pt(st, z, -1)
        p.y = max(p.y - wall, 0.004)
        s.y = min(s.y + wall, -0.004)
        inner.append((p, s))
    floor = [([p0, s0, s1, p1], up, False)
             for (p0, s0), (p1, s1) in zip(inner, inner[1:])]
    walls = []
    for i in range(len(stations) - 1):
        for side, inward in ((0, Vector((0, -1, 0))), (1, Vector((0, 1, 0)))):
            o0, o1 = sheer[i][side], sheer[i + 1][side]
            n0, n1 = inner[i][side], inner[i + 1][side]
            walls.append(([o0, o1, n1, n0], inward, False))
    for i, inward in ((0, Vector((1, 0, 0))), (-1, Vector((-1, 0, 0)))):
        (op, os_), (ip, is_) = sheer[i], inner[i]
        walls.append(([op, os_, is_, ip], inward, False))
    parts.append(_mesh(f'{name}-floor', floor, deck))
    parts.append(_mesh(f'{name}-bulwark', walls, top))
    return parts


def _sheer(st, side, inset=0.0, lift=0.0):
    """A point on the sheer line, `inset` in from the hull side, `lift` above it."""
    p = _hull_pt(st, st[2], side)
    p.y = side * max(abs(p.y) - inset, 0.0)
    p.z += lift
    return p


def rail(name, stations, height, color, width=0.03, inset=0.06, posts=True, lift=0.0):
    """
    A guard rail along the sheer on both sides, through the given stations:
    a top rail `height` above the deck and (optionally) a stanchion at each
    station. Where the sheer narrows to nothing at the bow, the two sides meet.
    """
    parts = []
    for side in (1, -1):
        feet = [_sheer(st, side, inset, lift) for st in stations]
        tops = [p + Vector((0, 0, height)) for p in feet]
        for i, (a, b) in enumerate(zip(tops, tops[1:])):
            parts.append(strut(f'{name}-rail{side}-{i}', a, b, width, color))
        if posts:
            for i, (p, t) in enumerate(zip(feet, tops)):
                if side < 0 and abs(p.y) < 1e-6:
                    continue                 # the bow post is shared by both sides
                parts.append(strut(f'{name}-post{side}-{i}', p, t, width, color))
    return parts


def fenders(stations, idx, z, radius=0.09, depth=0.50):
    """White fenders hung against the topsides, both sides, at station indices `idx`."""
    parts = []
    for side in (1, -1):
        for i in idx:
            st = stations[i]
            y = abs(_hull_pt(st, z, 1).y) + radius + 0.01
            parts.append(cyl(f'fender{side}{i}', radius, depth, (st[0], side * y, z),
                             FENDER, verts=8))
    return parts


# Stations: (x, b_sheer, z_sheer, b_chine, z_chine, z_keel, rake), stern first.
MOTOR_STATIONS = [
    (-5.00, 1.60, 1.12, 1.46, -0.10, -0.42, 0.00),   # transom
    (-4.00, 1.66, 1.14, 1.52, -0.12, -0.50, 0.00),
    (-2.80, 1.70, 1.17, 1.54, -0.13, -0.57, 0.00),
    (-1.40, 1.70, 1.21, 1.52, -0.14, -0.62, 0.00),
    (0.00, 1.66, 1.26, 1.44, -0.14, -0.64, 0.00),
    (1.30, 1.56, 1.32, 1.28, -0.13, -0.62, 0.00),
    (2.40, 1.38, 1.38, 1.02, -0.11, -0.56, 0.02),
    (3.30, 1.10, 1.44, 0.70, -0.08, -0.46, 0.06),
    (4.00, 0.74, 1.50, 0.38, -0.05, -0.32, 0.12),
    (4.45, 0.36, 1.55, 0.12, -0.03, -0.18, 0.20),
    (4.62, 0.02, 1.58, 0.01, -0.02, -0.08, 0.26),    # stem: deck at x = 5.03
]


def build_boat_motor():
    """
    A ~10 m Mediterranean motor cruiser with a flybridge (~10.6 × 3.4 m).

    White hull with a dark boot stripe, saloon with a dark window band and a
    raked windscreen, flybridge with helm and a radar arch, teak aft deck and
    swim platform. BOW +X, centred on the origin, WATERLINE at z = 0 (hull
    bottom ~0.64 m below it) — see the Round 4 block.
    """
    st = MOTOR_STATIONS
    parts = hull('motor', st)
    parts += [
        cube('platform', (0.62, 3.00, 0.08), (-5.29, 0, 0.30), TEAK),
        cube('aft-deck', (2.55, 2.96, 0.10), (-3.68, 0, 1.14), TEAK),
        cube('saloon', (4.40, 2.70, 1.02), (-0.20, 0, 1.63), HULL_WHITE),       # z 1.12–2.14
        cube('saloon-glass', (3.90, 2.74, 0.44), (-0.35, 0, 1.80), BOAT_GLASS),
        cube('saloon-door', (0.04, 1.60, 0.86), (-2.415, 0, 1.58), BOAT_GLASS),
    ]
    # The saloon's nose: a box whose front is narrowed to fit the bow and whose
    # top is pulled down into a raked windscreen. Edited in the part's own frame
    # before it is placed, like every other part.
    nose = cube('nose', (1.00, 2.70, 1.02), (0, 0, 0), HULL_WHITE)
    for v in nose.data.vertices:
        if v.co.x > 0:
            v.co.y *= 0.74
            if v.co.z > 0:
                v.co.z -= 0.62
    nose.location = (2.50, 0, 1.63)
    parts.append(nose)
    screen = spin(cube('windscreen', (0.62, 2.20, 0.03), (0, 0, 0), BOAT_GLASS), (0, 0.555, 0))
    screen.location = (2.31, 0, 1.97)
    parts.append(screen)
    parts.append(cube('sunpad', (0.90, 1.10, 0.18), (3.50, 0, 1.49), CUSHION))

    # Flybridge on the saloon roof, overhanging the aft deck.
    fz = 2.24
    parts += [
        cube('fly-deck', (3.90, 2.60, 0.10), (-0.90, 0, 2.19), HULL_WHITE),
        cube('fly-helm', (0.55, 1.10, 0.55), (0.55, 0.45, fz + 0.275), HULL_WHITE),
        cube('fly-screen', (0.04, 1.00, 0.18), (0.84, 0.45, fz + 0.45), BOAT_GLASS),
        cube('fly-seat', (0.55, 1.90, 0.40), (-1.35, 0, fz + 0.20), CUSHION),
        cube('fly-back', (0.14, 1.90, 0.35), (-1.62, 0, fz + 0.575), CUSHION),
    ]
    corners = [(-2.80, 1.25), (1.00, 1.25), (1.00, -1.25), (-2.80, -1.25)]
    for i, (x, y) in enumerate(corners):
        nx, ny = corners[(i + 1) % 4]
        parts.append(strut(f'fly-post{i}', (x, y, fz), (x, y, fz + 0.72), 0.03, STAINLESS))
        parts.append(strut(f'fly-rail{i}', (x, y, fz + 0.72), (nx, ny, fz + 0.72), 0.03, STAINLESS))
    for side in (1, -1):
        parts.append(strut(f'arch{side}', (-2.50, side * 0.80, fz), (-2.30, side * 0.55, 3.25),
                           0.12, HULL_WHITE))
    parts.append(cube('arch-bar', (0.18, 1.30, 0.12), (-2.30, 0, 3.28), HULL_WHITE))
    parts.append(cyl('radome', 0.30, 0.18, (-2.25, 0, 3.43), HULL_WHITE, verts=10))

    parts += rail('bow', st[5:], 0.62, STAINLESS)
    parts += fenders(st, (2, 4), 0.55)
    return finish('boat-motor', parts, bake_origin=True, waterline=True)


SAIL_STATIONS = [
    (-5.40, 1.62, 1.02, 1.30, -0.06, -0.22, 0.00),   # wide modern transom
    (-4.20, 1.74, 1.04, 1.50, -0.10, -0.36, 0.00),
    (-2.80, 1.80, 1.07, 1.58, -0.13, -0.48, 0.00),
    (-1.30, 1.80, 1.10, 1.56, -0.15, -0.55, 0.00),
    (0.20, 1.74, 1.14, 1.46, -0.15, -0.57, 0.00),
    (1.60, 1.58, 1.19, 1.24, -0.14, -0.54, 0.00),
    (2.80, 1.30, 1.24, 0.92, -0.12, -0.46, 0.02),
    (3.80, 0.96, 1.29, 0.58, -0.09, -0.36, 0.06),
    (4.60, 0.56, 1.33, 0.26, -0.05, -0.24, 0.12),
    (5.10, 0.22, 1.36, 0.08, -0.03, -0.12, 0.20),
    (5.28, 0.02, 1.38, 0.01, -0.02, -0.06, 0.24),    # stem: deck at x = 5.61
]


def build_boat_sail():
    """
    An ~11 m sailing yacht (~11.1 × 3.6 m) moored with her sails furled.

    White hull, low coachroof with dark portlights, teak cockpit and wheel, an
    aluminium mast 15 m above the deck with spreaders, shrouds, forestay and
    backstay, the boom with the mainsail in its light-blue stack-pack, and a
    roller-furled genoa on the forestay. BOW +X, centred on the origin,
    WATERLINE at z = 0 (canoe body ~0.57 m below; no fin keel — see Round 4).
    """
    st = SAIL_STATIONS
    parts = hull('sail', st)
    roof = cube('coachroof', (4.00, 2.30, 0.60), (0, 0, 0), HULL_WHITE)    # x -1.4..2.6
    for v in roof.data.vertices:
        if v.co.x > 0 and v.co.z > 0:
            v.co.z -= 0.22               # the roof slopes down toward the bow
    roof.location = (0.60, 0, 1.32)
    parts.append(roof)
    parts.append(cube('portlights', (2.00, 2.34, 0.10), (0.10, 0, 1.38), BOAT_GLASS))
    parts += [
        cube('cockpit', (3.30, 2.50, 0.08), (-3.15, 0, 1.07), TEAK),
        cube('coaming-p', (3.40, 0.07, 0.32), (-3.10, 1.28, 1.22), HULL_WHITE),
        cube('coaming-s', (3.40, 0.07, 0.32), (-3.10, -1.28, 1.22), HULL_WHITE),
        strut('pedestal', (-4.10, 0, 1.08), (-4.10, 0, 1.72), 0.08, STAINLESS),
    ]
    # The wheel: a hexagon of tube standing across the boat, not a solid disc —
    # a disc reads as a table from the pontoon.
    wc, wr = Vector((-4.18, 0, 1.78)), 0.45
    rim = [wc + Vector((0, wr * math.cos(a), wr * math.sin(a)))
           for a in (i * math.pi / 3 for i in range(6))]
    for i in range(6):
        parts.append(strut(f'wheel{i}', rim[i], rim[(i + 1) % 6], 0.035, STAINLESS))

    # Mast, stepped through the coachroof at x = 1.2; its head is 15 m above
    # the deck. Built at the origin, shaped, then placed.
    mx, deck = 1.20, _deck_z(st, 1.20)
    head = deck + 15.0
    mast = cyl('mast', 0.085, head - 1.40, (0, 0, 0), ALU, verts=8)
    taper(mast, 0.60)
    squash(mast, (1.35, 1.0, 1.0))
    mast.location = (mx, 0, (head + 1.40) / 2)
    parts.append(mast)
    parts.append(cube('spreaders', (0.07, 1.90, 0.05), (mx - 0.05, 0, 9.40), ALU))
    boom = cyl('boom', 0.07, 4.60, (0, 0, 0), ALU, verts=6, axis='X')
    boom.location = (mx - 2.30, 0, 2.55)
    parts.append(boom)
    cover = cyl('stack-pack', 0.17, 4.20, (0, 0, 0), SAIL_COVER, verts=8, axis='X')
    taper(cover, 1.35, axis=0)           # the bundle is fattest at the mast
    squash(cover, (1.0, 0.70, 1.10))
    cover.location = (mx - 2.20, 0, 2.80)
    parts.append(cover)

    # Standing rigging: cap shrouds over the spreader tips, lowers, the
    # forestay with the furled genoa around it, and the backstay.
    for side in (1, -1):
        tip = (mx - 0.05, side * 0.95, 9.40)
        chain = (mx - 0.15, side * 1.58, _deck_z(st, mx - 0.15))
        parts.append(strut(f'cap-hi{side}', (mx, 0, head - 0.25), tip, 0.022, STAINLESS))
        parts.append(strut(f'cap-lo{side}', tip, chain, 0.022, STAINLESS))
        parts.append(strut(f'lower{side}', (mx, 0, 9.30),
                           (mx - 0.35, side * 1.56, _deck_z(st, mx - 0.35)), 0.022, STAINLESS))
    stem = Vector((5.60, 0, 1.42))
    top = Vector((mx + 0.10, 0, head - 0.20))
    parts.append(cube('stemhead', (0.50, 0.18, 0.12), (5.45, 0, 1.40), STAINLESS))
    parts.append(strut('forestay', stem, top, 0.02, STAINLESS))
    parts.append(strut('genoa', stem.lerp(top, 0.03), stem.lerp(top, 0.88), 0.13,
                       SAIL_COVER, verts=6))
    parts.append(strut('backstay', (mx - 0.08, 0, head - 0.10), (-5.30, 0, 1.06), 0.02, STAINLESS))

    parts += rail('lifelines', [st[i] for i in (1, 3, 5, 7, 9, 10)], 0.60, STAINLESS)
    parts += fenders(st, (2, 4), 0.50)
    return finish('boat-sail', parts, bake_origin=True, waterline=True)


SMALL_STATIONS = [
    (-2.72, 0.02, 0.86, 0.01, -0.03, -0.10, -0.22),  # stern post, raked aft
    (-2.55, 0.34, 0.80, 0.14, -0.05, -0.22, -0.14),
    (-2.10, 0.72, 0.74, 0.46, -0.08, -0.34, -0.05),
    (-1.30, 0.98, 0.70, 0.76, -0.10, -0.40, 0.00),
    (-0.30, 1.10, 0.68, 0.88, -0.10, -0.42, 0.00),
    (0.70, 1.08, 0.69, 0.84, -0.10, -0.41, 0.00),
    (1.60, 0.92, 0.74, 0.64, -0.09, -0.37, 0.02),
    (2.25, 0.64, 0.82, 0.36, -0.06, -0.28, 0.08),
    (2.62, 0.30, 0.90, 0.12, -0.04, -0.17, 0.16),
    (2.76, 0.02, 0.96, 0.01, -0.02, -0.08, 0.22),    # stem
]


def build_boat_small():
    """
    A ~6 m open llaüt-style fishing boat (~6.0 × 2.2 m), double-ended.

    White hull with the blue sheer band, open with a wooden floor inside a low
    bulwark, wooden gunwale capping, the tall stem post (the roda) that marks a
    llaüt, a centre console with its screen, an engine box and a seat box.
    BOW +X, centred on the origin, WATERLINE at z = 0 (keel ~0.42 m below).
    """
    st = SMALL_STATIONS
    well = 0.42
    parts = hull('small', st, deck=LLAUT_WOOD, sheer_band=(0.12, LLAUT_BLUE), well=well)
    parts += rail('gunwale', [st[i] for i in (0, 1, 2, 4, 6, 8, 9)], 0.0, LLAUT_WOOD,
                  width=0.08, inset=0.03, posts=False, lift=0.02)

    def floor(x):
        return _deck_z(st, x) - well

    parts += [
        strut('roda', (2.95, 0, 0.92), (3.05, 0, 1.24), 0.08, LLAUT_WOOD),
        strut('stern-post', (-2.88, 0, 0.82), (-2.95, 0, 1.02), 0.07, LLAUT_WOOD),
        cube('console', (0.55, 0.65, 0.75), (0.40, 0, floor(0.40) + 0.375), HULL_WHITE),
        cube('seat-box', (0.45, 0.80, 0.36), (-0.35, 0, floor(-0.35) + 0.18), LLAUT_WOOD),
        cube('engine-box', (0.80, 0.70, 0.36), (-1.60, 0, floor(-1.60) + 0.18), LLAUT_WOOD),
    ]
    top = floor(0.40) + 0.75
    parts.append(spin(cube('console-screen', (0.03, 0.62, 0.28), (0, 0, 0), BOAT_GLASS),
                      (0, -0.35, 0)))
    parts[-1].location = (0.70, 0, top + 0.13)
    parts += fenders(st, (3, 5), 0.38, radius=0.07, depth=0.36)
    return finish('boat-small', parts, bake_origin=True, waterline=True)


BUILDERS = {
    'car': build_car,
    'van': build_van,
    'bus': build_bus,
    'traffic-signal': build_traffic_signal,
    'catenary-mast': build_catenary_mast,
    'train-carriage': build_train_carriage,
    'train-cab': lambda: build_train_carriage(True),
    'tree-broadleaf': build_tree_broadleaf,
    'tree-conifer': build_tree_conifer,
    'street-lamp': build_street_lamp,
    'platform-canopy': build_platform_canopy,
    'tree-palm': build_tree_palm,
    'tree-columnar': build_tree_columnar,
    'tree-blossom': build_tree_blossom,
    'tree-olive': build_tree_olive,
    'bench': build_bench,
    'litter-bin': build_litter_bin,
    'bollard': build_bollard,
    'bus-shelter': build_bus_shelter,
    'roof-chimney': build_roof_chimney,
    'roof-hvac': build_roof_hvac,
    'roof-tank': build_roof_tank,
    'roof-stairbox': build_roof_stairbox,
    'bench-bcn': build_bench_bcn,
    'lamp-park-bcn': build_lamp_park_bcn,
    'lamp-street-bcn': build_lamp_street_bcn,
    'fountain-bcn': build_fountain_bcn,
    'ped-signal': build_ped_signal,
    'traffic-signal-bcn': build_traffic_signal_bcn,
    'waste-basket-bcn': build_waste_basket_bcn,
    'boat-motor': build_boat_motor,
    'boat-sail': build_boat_sail,
    'boat-small': build_boat_small,
}


def tri_count(ob):
    me = ob.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def main():
    out_dir = sys.argv[-1]
    os.makedirs(out_dir, exist_ok=True)
    failures = []

    for name, build in BUILDERS.items():
        if os.environ.get('PROPS_ONLY') and name not in os.environ['PROPS_ONLY'].split(','):
            continue
        reset()
        ob = build()
        tris = tri_count(ob)
        budget = BUDGET[name]
        path = os.path.join(out_dir, f'{name}.glb')

        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_materials='EXPORT',
            # 'MATERIAL' exports the colour layers the material actually reads,
            # which is exactly the one `finish()` wires into the Base Color.
            # NOT `export_colors=True`: that keyword was removed from the glTF
            # exporter in Blender 4.x, and the failure is a hard TypeError at
            # export time rather than a silently colourless asset.
            export_vertex_color='MATERIAL',
            export_cameras=False,
            export_lights=False,
            export_yup=False,          # keep Z-up: the scene frame is Z-up
        )
        size = os.path.getsize(path)
        flag = '' if tris <= budget else f'  ** OVER BUDGET ({budget}) **'
        if tris > budget:
            failures.append(f'{name}: {tris} tris > {budget}')
        print(f'[props] {name:18} {tris:5} tris  {size / 1024:7.1f} KB{flag}')

    if failures:
        print('[props] FAILED:\n  ' + '\n  '.join(failures))
        sys.exit(1)
    print('[props] all assets within budget')


main()
