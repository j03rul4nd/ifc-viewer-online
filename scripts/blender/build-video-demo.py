# ─── build-video-demo.py ─────────────────────────────────────────────────────
# Authors an IFC4 operations pavilion and renders a short synthetic progress
# video from the SAME dimension table. Both assets are intentionally local and
# deterministic enough for an exhibition demo with unreliable venue Wi-Fi.
#
# Run:
#   blender --background --python scripts/blender/build-video-demo.py -- public/models/video-demo

import math
import os
import sys

import bpy
import ifcopenshell.api
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bonsai_kit as kit  # noqa: E402


WIDTH = 18.0
DEPTH = 12.0
FLOOR_DEPTH = 0.25
COLUMN = 0.42
COLUMN_HEIGHT = 4.6
BEAM_DEPTH = 0.38
ROOF_DEPTH = 0.22
ROOF_Z = COLUMN_HEIGHT + BEAM_DEPTH
GRID_X = (-8.0, 0.0, 8.0)
GRID_Y = (-5.0, 5.0)

AUTHOR = "IFC Viewer Online"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-08-20T00:00:00+00:00"


def name_spatial(ifc):
    kit.edit(
        ifc,
        ifc.by_type("IfcProject")[0],
        Name="IFC + Video Operations Demo",
        LongName="Operations Pavilion - exhibition digital twin demonstration",
        Description="Synthetic IFC4 reference paired with a locally rendered construction progress video",
        ObjectType="Exhibition reference model",
        Phase="DEMO",
    )
    kit.edit(
        ifc,
        ifc.by_type("IfcSite")[0],
        Name="Operations Demo Site",
        Description="Flat local-coordinate site for video and terrain placement demonstrations",
        CompositionType="ELEMENT",
        RefElevation=0.0,
    )
    kit.edit(
        ifc,
        ifc.by_type("IfcBuilding")[0],
        Name="Operations Pavilion",
        LongName="IFC Viewer Online operations and progress-monitoring pavilion",
        CompositionType="ELEMENT",
    )
    return kit.edit(
        ifc,
        ifc.by_type("IfcBuildingStorey")[0],
        Name="Ground Floor",
        LongName="Operations floor",
        CompositionType="ELEMENT",
        Elevation=0.0,
    )


def add_box(ifc, body, storey, ifc_class, element_type, name, description, origin, size):
    matrix = kit.placement_matrix(origin)
    obj = kit.placed_object(name, matrix)
    element = kit.add_occurrence(
        ifc, obj, matrix, ifc_class, element_type, name, description, storey,
    )
    representation = kit.extruded(
        ifc,
        body,
        [(0.0, 0.0), (size[0], 0.0), (size[0], size[1]), (0.0, size[1])],
        size[2],
        name,
    )
    kit.attach(ifc, obj, element, representation)
    return element


def build_ifc(output_path):
    ifc = kit.new_project()
    storey = name_spatial(ifc)
    body, _axis = kit.contexts(ifc)

    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C30/37", category="concrete")
    steel = ifcopenshell.api.run("material.add_material", ifc, name="Powder-coated steel", category="steel")
    composite = ifcopenshell.api.run("material.add_material", ifc, name="Composite roof panel", category="composite")

    floor_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-250-C30/37", "FLOOR", concrete, FLOOR_DEPTH)
    roof_type = kit.add_layered_type(ifc, "IfcSlabType", "ROF-220-Composite", "ROOF", composite, ROOF_DEPTH)
    column_type = kit.add_simple_type(ifc, "IfcColumnType", "COL-420-Steel", "COLUMN", steel)
    beam_type = kit.add_simple_type(ifc, "IfcBeamType", "BEA-380-Steel", "BEAM", steel)

    expected = {}
    floor_origin = (-WIDTH / 2, -DEPTH / 2, -FLOOR_DEPTH)
    floor = add_box(
        ifc, body, storey, "IfcSlab", floor_type,
        "Operations Floor", "Concrete exhibition and monitoring floor",
        floor_origin, (WIDTH, DEPTH, FLOOR_DEPTH),
    )
    expected[floor.Name] = floor_origin
    kit.add_pset(ifc, floor, "Pset_SlabCommon", {
        "IsExternal": True, "LoadBearing": True, "Reference": "SLB-250-C30/37",
    })

    columns = []
    for ix, x in enumerate(GRID_X, start=1):
        for iy, y in enumerate(GRID_Y, start=1):
            name = f"Pavilion Column {ix}.{iy}"
            origin = (x - COLUMN / 2, y - COLUMN / 2, 0.0)
            element = add_box(
                ifc, body, storey, "IfcColumn", column_type, name,
                "Steel pavilion column supporting the monitoring canopy",
                origin, (COLUMN, COLUMN, COLUMN_HEIGHT),
            )
            expected[name] = origin
            columns.append(element)
            kit.add_pset(ifc, element, "Pset_ColumnCommon", {
                "LoadBearing": True, "Reference": "COL-420-Steel",
            })

    beams = []
    for index, y in enumerate(GRID_Y, start=1):
        name = f"Longitudinal Beam {index}"
        origin = (-WIDTH / 2, y - COLUMN / 2, COLUMN_HEIGHT)
        element = add_box(
            ifc, body, storey, "IfcBeam", beam_type, name,
            "Primary steel beam along the pavilion grid",
            origin, (WIDTH, COLUMN, BEAM_DEPTH),
        )
        expected[name] = origin
        beams.append(element)
        kit.add_pset(ifc, element, "Pset_BeamCommon", {
            "LoadBearing": True, "Reference": "BEA-380-Steel",
        })

    roof_origin = (-WIDTH / 2, -DEPTH / 2, ROOF_Z)
    roof = add_box(
        ifc, body, storey, "IfcSlab", roof_type,
        "Monitoring Canopy", "Lightweight roof covering the operations pavilion",
        roof_origin, (WIDTH, DEPTH, ROOF_DEPTH),
    )
    expected[roof.Name] = roof_origin
    kit.add_pset(ifc, roof, "Pset_SlabCommon", {
        "IsExternal": True, "LoadBearing": False, "Reference": "ROF-220-Composite",
    })

    for element in [floor, roof, *columns, *beams]:
        kit.add_pset(ifc, element, "Pset_OperationsDemo", {
            "VideoCompanion": "operations-pavilion-progress.mp4",
            "DemoPurpose": "IFC plus positionable 3D video",
            "SyntheticAsset": True,
        })

    kit.set_header(ifc, os.path.basename(output_path), AUTHOR, ORGANISATION, TIMESTAMP)
    kit.write(ifc, output_path)
    return expected


def rgba(hex_value):
    value = hex_value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


def material(name, color, metallic=0.0, roughness=0.5, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(color)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(color)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = rgba(emission)
        bsdf.inputs["Emission Strength"].default_value = 3.0
    return mat


def cube(name, location, size, mat):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def animate_rise(obj, first, last, full_height, base_z):
    obj.scale.z = 0.001
    obj.location.z = base_z
    obj.keyframe_insert("scale", frame=first)
    obj.keyframe_insert("location", frame=first)
    obj.scale.z = 1.0
    obj.location.z = base_z + full_height / 2
    obj.keyframe_insert("scale", frame=last)
    obj.keyframe_insert("location", frame=last)


def point_camera(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def render_video(output_dir):
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 192
    scene.world.color = rgba("07131F")[:3]

    concrete = material("Warm concrete", "8A969E", roughness=0.72)
    steel = material("Graphite steel", "263747", metallic=0.75, roughness=0.27)
    roof_mat = material("Canopy", "D7E2E8", metallic=0.18, roughness=0.42)
    ground_mat = material("Site", "0D2434", roughness=0.9)
    accent = material("Inspection robot", "FF8A34", metallic=0.25, roughness=0.32)
    scan = material("Scan light", "20D5FF", roughness=0.2, emission="20D5FF")

    cube("Site ground", (0, 0, -0.38), (28, 22, 0.5), ground_mat)
    floor = cube("Operations floor", (0, 0, -FLOOR_DEPTH / 2), (WIDTH, DEPTH, FLOOR_DEPTH), concrete)
    floor.scale.z = 0.001
    floor.location.z = -FLOOR_DEPTH
    floor.keyframe_insert("scale", frame=1)
    floor.keyframe_insert("location", frame=1)
    floor.scale.z = 1
    floor.location.z = -FLOOR_DEPTH / 2
    floor.keyframe_insert("scale", frame=24)
    floor.keyframe_insert("location", frame=24)

    for index, (x, y) in enumerate((x, y) for x in GRID_X for y in GRID_Y):
        obj = cube(f"Column {index + 1}", (x, y, COLUMN_HEIGHT / 2), (COLUMN, COLUMN, COLUMN_HEIGHT), steel)
        animate_rise(obj, 28 + index * 3, 62 + index * 3, COLUMN_HEIGHT, 0.0)

    for index, y in enumerate(GRID_Y):
        beam = cube(
            f"Beam {index + 1}",
            (0, y, COLUMN_HEIGHT + BEAM_DEPTH / 2),
            (WIDTH, COLUMN, BEAM_DEPTH),
            steel,
        )
        beam.scale.x = 0.001
        beam.keyframe_insert("scale", frame=72 + index * 8)
        beam.scale.x = 1
        beam.keyframe_insert("scale", frame=105 + index * 8)

    roof = cube("Monitoring canopy", (0, 0, ROOF_Z + ROOF_DEPTH / 2), (WIDTH, DEPTH, ROOF_DEPTH), roof_mat)
    roof.scale.x = 0.001
    roof.keyframe_insert("scale", frame=112)
    roof.scale.x = 1
    roof.keyframe_insert("scale", frame=150)

    # An autonomous inspection cart and a pulsing LiDAR halo make the clip read
    # as operational monitoring, rather than a generic architectural fly-through.
    robot = cube("Inspection cart", (-7, -3.6, 0.42), (1.3, 0.9, 0.65), accent)
    robot.keyframe_insert("location", frame=1)
    robot.location = (7, -3.6, 0.42)
    robot.keyframe_insert("location", frame=96)
    robot.location = (-7, -3.6, 0.42)
    robot.keyframe_insert("location", frame=192)

    bpy.ops.mesh.primitive_torus_add(major_radius=1.2, minor_radius=0.035, location=robot.location)
    halo = bpy.context.object
    halo.name = "LiDAR scan halo"
    halo.data.materials.append(scan)
    halo.parent = robot
    halo.location = (0, 0, 0.05)
    halo.scale = (0.25, 0.25, 0.25)
    halo.keyframe_insert("scale", frame=1)
    halo.scale = (1.5, 1.5, 1.5)
    halo.keyframe_insert("scale", frame=24)
    halo.scale = (0.25, 0.25, 0.25)
    halo.keyframe_insert("scale", frame=48)
    for curve in halo.animation_data.action.fcurves:
        for modifier in curve.modifiers:
            modifier.type = "CYCLES"
        if not curve.modifiers:
            curve.modifiers.new("CYCLES")

    bpy.ops.object.light_add(type="AREA", location=(2, -6, 16))
    key = bpy.context.object
    key.data.energy = 1800
    key.data.shape = "DISK"
    key.data.size = 10
    key.data.color = (0.72, 0.86, 1.0)
    point_camera(key, (0, 0, 2))
    bpy.ops.object.light_add(type="AREA", location=(-10, 6, 8))
    fill = bpy.context.object
    fill.data.energy = 1100
    fill.data.size = 8
    fill.data.color = (1.0, 0.55, 0.3)
    point_camera(fill, (0, 0, 2))

    bpy.ops.object.camera_add(location=(22, -27, 17))
    camera = bpy.context.object
    camera.data.lens = 48
    point_camera(camera, (0, 0, 2.2))
    scene.camera = camera

    # Slow, subtle camera move: enough parallax to feel spatial without making
    # a looping fair display uncomfortable.
    camera.keyframe_insert("location", frame=1)
    camera.keyframe_insert("rotation_euler", frame=1)
    camera.location = (18, -29, 15)
    point_camera(camera, (0, 0, 2.2))
    camera.keyframe_insert("location", frame=192)
    camera.keyframe_insert("rotation_euler", frame=192)

    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.frame_set(150)
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 90
    scene.render.filepath = os.path.join(output_dir, "operations-pavilion-poster.jpg")
    bpy.ops.render.render(write_still=True)

    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.filepath = os.path.join(output_dir, "operations-pavilion-progress.mp4")
    scene.frame_start = 1
    scene.frame_end = 192
    bpy.ops.render.render(animation=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    output_dir = os.path.abspath(args[0] if args else "public/models/video-demo")
    ifc_only = "--ifc-only" in args[1:]
    os.makedirs(output_dir, exist_ok=True)
    output_ifc = os.path.join(output_dir, "IVO-Operations-Pavilion.ifc")

    kit.deterministic_guids("operations-pavilion-video")
    expected = build_ifc(output_ifc)
    ifc = kit.verify(output_ifc, expected)
    kit.report(ifc, output_ifc)
    if not ifc_only:
        render_video(output_dir)
        print(f"  OK video + poster -> {output_dir}")


if __name__ == "__main__":
    main()
