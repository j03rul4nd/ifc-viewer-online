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
    'train-carriage': 400,
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


def finish(name, parts):
    """Bake each part's colour into vertex colours, join, and drop to the floor."""
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

    # Base at z = 0 so an instance matrix can sit it on the ground directly.
    zs = [v.co.z for v in ob.data.vertices]
    if zs:
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


def build_train_carriage():
    """A carriage with a rounded roof and a continuous window band."""
    # Height matters more than it looks: a carriage that tops out at 2.9 m sits
    # barely twice a car's roofline, and the eye reads it as a tram. A real one
    # is close to 4 m above rail, which is nearly three times the car.
    parts = [
        cube('body', (19.0, 2.86, 2.60), (0, 0, 2.30), BODY),
        cube('windows', (17.2, 2.92, 0.72), (0, 0, 2.90), GLASS),
        cube('skirt', (18.6, 2.62, 0.75), (0, 0, 0.75), TRIM),
    ]
    parts.append(squash(
        cyl('roof', 1.44, 18.6, (0, 0, 3.75), BODY, verts=10, axis='X'),
        (1.0, 1.0, 0.34),
    ))
    for x in (7.0, -7.0):
        parts.append(cube(f'bogie{x}', (2.6, 2.2, 0.5), (x, 0, 0.45), TYRE))
    return finish('train-carriage', parts)


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


BUILDERS = {
    'car': build_car,
    'van': build_van,
    'bus': build_bus,
    'traffic-signal': build_traffic_signal,
    'catenary-mast': build_catenary_mast,
    'train-carriage': build_train_carriage,
    'tree-broadleaf': build_tree_broadleaf,
    'tree-conifer': build_tree_conifer,
    'street-lamp': build_street_lamp,
    'platform-canopy': build_platform_canopy,
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
            export_colors=True,
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
