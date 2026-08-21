"""Build the auditable CRAS Point Cloud + IFC Blender scene and captures."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def arguments() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--ifc", type=Path, default=Path("demo/raw/model-original.ifc"))
    p.add_argument("--pointcloud", type=Path, default=Path("demo/processed/pointcloud-web-source.ply"))
    p.add_argument("--ifc-fallback", type=Path, default=Path("demo/processed/ifc-registration-mesh.ply"))
    p.add_argument("--transformation", type=Path, default=Path("demo/transformation.json"))
    p.add_argument("--blend", type=Path, default=Path("demo/blender/alignment.blend"))
    p.add_argument("--captures", type=Path, default=Path("demo/captures"))
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return p.parse_args(argv)


def absolute(path: Path) -> Path:
    return path.resolve()


def ensure_collection(name: str, parent: bpy.types.Collection) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if collection.name not in {child.name for child in parent.children}:
        parent.children.link(collection)
    return collection


def move_object(obj: bpy.types.Object, target: bpy.types.Collection) -> None:
    if target.objects.get(obj.name) is None:
        target.objects.link(obj)
    for collection in list(obj.users_collection):
        if collection != target:
            collection.objects.unlink(obj)


def load_ifc(ifc_path: Path, fallback_path: Path) -> tuple[bool, str]:
    try:
        bpy.ops.preferences.addon_enable(module="bl_ext.user_default.bonsai")
    except Exception:
        pass
    try:
        result = bpy.ops.bim.load_project(
            filepath=ifc_path.as_posix(),
            should_start_fresh_session=True,
            use_relative_path=False,
            import_without_ifc_data=False,
        )
        if "FINISHED" not in result:
            raise RuntimeError(str(result))
        return True, "Bonsai bpy.ops.bim.load_project"
    except Exception as exc:
        # A geometric fallback keeps the scene inspectable if a future Bonsai
        # build changes its background operator. The report makes this explicit.
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        bpy.ops.wm.ply_import(filepath=fallback_path.as_posix())
        obj = bpy.context.active_object
        obj.name = "IFC_Registration_Surface_FALLBACK"
        obj["source_ifc"] = ifc_path.as_posix()
        obj["bonsai_import_error"] = repr(exc)
        return False, f"PLY fallback: {exc!r}"


def validation_material(name: str, rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = rgba
    material.surface_render_method = "DITHERED"
    material.use_transparency_overlap = False
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = rgba
    principled.inputs["Roughness"].default_value = 0.72
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Alpha"].default_value = rgba[3]
    return material


def point_material(obj: bpy.types.Object) -> bpy.types.Material:
    material = bpy.data.materials.new("PointCloud_RGB")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    colour_attributes = list(getattr(obj.data, "color_attributes", []))
    if colour_attributes:
        attribute = nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = colour_attributes[0].name
        links.new(attribute.outputs["Color"], principled.inputs["Base Color"])
        if principled.inputs.get("Emission Color"):
            links.new(attribute.outputs["Color"], principled.inputs["Emission Color"])
    else:
        principled.inputs["Base Color"].default_value = (0.08, 0.65, 0.95, 1.0)
        if principled.inputs.get("Emission Color"):
            principled.inputs["Emission Color"].default_value = (0.04, 0.32, 0.48, 1.0)
    principled.inputs["Roughness"].default_value = 0.75
    if principled.inputs.get("Emission Strength"):
        principled.inputs["Emission Strength"].default_value = 0.22
    return material


def add_points_geometry_nodes(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    modifier = obj.modifiers.new(name="Render points", type="NODES")
    tree = bpy.data.node_groups.new("PointCloud_Render", "GeometryNodeTree")
    modifier.node_group = tree
    tree.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nodes = tree.nodes
    links = tree.links
    group_in = nodes.new("NodeGroupInput")
    group_out = nodes.new("NodeGroupOutput")
    to_points = nodes.new("GeometryNodeMeshToPoints")
    to_points.mode = "VERTICES"
    to_points.inputs["Radius"].default_value = 0.012
    set_material = nodes.new("GeometryNodeSetMaterial")
    set_material.inputs["Material"].default_value = material
    links.new(group_in.outputs["Geometry"], to_points.inputs["Mesh"])
    links.new(to_points.outputs["Points"], set_material.inputs["Geometry"])
    links.new(set_material.outputs["Geometry"], group_out.inputs["Geometry"])


def add_reference_axes(collection: bpy.types.Collection) -> None:
    for name, direction, colour in (
        ("IFC_X", (2.0, 0.0, 0.0), (0.9, 0.12, 0.10, 1.0)),
        ("IFC_Y", (0.0, 2.0, 0.0), (0.12, 0.8, 0.20, 1.0)),
        ("IFC_Z", (0.0, 0.0, 2.0), (0.12, 0.36, 0.95, 1.0)),
    ):
        curve = bpy.data.curves.new(name, "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = 0.018
        spline = curve.splines.new("POLY")
        spline.points.add(1)
        spline.points[0].co = (0, 0, 0, 1)
        spline.points[1].co = (*direction, 1)
        obj = bpy.data.objects.new(name, curve)
        collection.objects.link(obj)
        mat = validation_material(f"{name}_Material", colour)
        curve.materials.append(mat)


def scene_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    low = Vector((math.inf, math.inf, math.inf))
    high = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        if obj.type not in {"MESH", "CURVE", "POINTCLOUD"} or not obj.visible_get():
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            low.x, low.y, low.z = min(low.x, point.x), min(low.y, point.y), min(low.z, point.z)
            high.x, high.y, high.z = max(high.x, point.x), max(high.y, point.y), max(high.z, point.z)
    if not math.isfinite(low.x):
        return Vector((-10, -10, -2)), Vector((10, 10, 4))
    return low, high


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def set_camera(camera: bpy.types.Object, low: Vector, high: Vector, view: str) -> None:
    center = (low + high) * 0.5
    extent = high - low
    span = max(extent.x, extent.y, extent.z)
    distance = span * 1.55
    camera.data.clip_start = 0.05
    camera.data.clip_end = distance * 5
    if view == "top":
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = max(extent.x, extent.y) * 1.18
        camera.location = (center.x, center.y, high.z + distance)
    elif view == "front":
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = max(extent.x, extent.z) * 1.18
        camera.location = (center.x, low.y - distance, center.z)
    elif view == "side":
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = max(extent.y, extent.z) * 1.18
        camera.location = (high.x + distance, center.y, center.z)
    elif view == "section":
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = max(extent.x, extent.z) * 1.18
        camera.location = (center.x, low.y - distance, center.z)
        # Clip everything behind the building midpoint to expose a genuine
        # longitudinal half-section without modifying source geometry.
        camera.data.clip_end = distance + extent.y * 0.5
    else:
        camera.data.type = "PERSP"
        camera.data.lens = 48
        camera.location = (high.x + distance * 0.72, low.y - distance * 0.78, high.z + distance * 0.48)
    look_at(camera, center)


def render_views(captures: Path, camera: bpy.types.Object, low: Vector, high: Vector) -> list[str]:
    captures.mkdir(parents=True, exist_ok=True)
    outputs = []
    for view in ("perspective", "top", "front", "side", "section"):
        set_camera(camera, low, high, view)
        output = captures / f"alignment-{view}.png"
        bpy.context.scene.render.filepath = output.as_posix()
        bpy.ops.render.render(write_still=True)
        outputs.append(output.as_posix())
    return outputs


def main() -> None:
    args = arguments()
    ifc_path = absolute(args.ifc)
    point_path = absolute(args.pointcloud)
    fallback_path = absolute(args.ifc_fallback)
    transform_path = absolute(args.transformation)
    blend_path = absolute(args.blend)
    captures_path = absolute(args.captures)
    blend_path.parent.mkdir(parents=True, exist_ok=True)

    transform_doc = json.loads(transform_path.read_text(encoding="utf-8"))
    matrix_rows = transform_doc["pointCloudToIfc"]["matrix4x4RowMajor"]
    transform = Matrix(matrix_rows)

    bonsai_ok, import_method = load_ifc(ifc_path, fallback_path)
    scene = bpy.context.scene
    root = scene.collection
    ifc_collection = ensure_collection("IFC", root)
    # Put every Bonsai root under one named IFC collection while preserving its
    # own spatial hierarchy and object metadata.
    for child in list(root.children):
        if child == ifc_collection:
            continue
        if child.name not in {nested.name for nested in ifc_collection.children}:
            ifc_collection.children.link(child)
        root.children.unlink(child)

    ifc_objects = [obj for obj in scene.objects if obj.type == "MESH"]
    ifc_material = validation_material("IFC_Validation_Blue", (0.10, 0.42, 0.88, 0.38))
    for obj in ifc_objects:
        if len(obj.data.materials):
            for index in range(len(obj.data.materials)):
                obj.data.materials[index] = ifc_material
        else:
            obj.data.materials.append(ifc_material)
        obj.visible_shadow = False

    point_collection = ensure_collection("PointCloud", root)
    bpy.ops.wm.ply_import(filepath=point_path.as_posix())
    point_obj = bpy.context.active_object
    point_obj.name = "CRAS_PointCloud_SourceFrame"
    point_obj.matrix_world = transform
    point_obj["source_file"] = point_path.as_posix()
    point_obj["transform_file"] = transform_path.as_posix()
    point_obj["units"] = "metres"
    point_obj["source_up_axis"] = "Z"
    move_object(point_obj, point_collection)
    material = point_material(point_obj)
    add_points_geometry_nodes(point_obj, material)

    reference_collection = ensure_collection("Reference", root)
    add_reference_axes(reference_collection)

    camera_data = bpy.data.cameras.new("ValidationCamera")
    camera = bpy.data.objects.new("ValidationCamera", camera_data)
    reference_collection.objects.link(camera)
    scene.camera = camera
    sun_data = bpy.data.lights.new("ValidationSun", type="SUN")
    sun_data.energy = 2.0
    sun_data.angle = math.radians(25)
    sun = bpy.data.objects.new("ValidationSun", sun_data)
    sun.rotation_euler = (math.radians(32), math.radians(-18), math.radians(-32))
    reference_collection.objects.link(sun)
    area_data = bpy.data.lights.new("ValidationFill", type="AREA")
    area_data.energy = 1150
    area_data.shape = "DISK"
    area_data.size = 18
    area = bpy.data.objects.new("ValidationFill", area_data)
    area.location = (0, 5, 18)
    reference_collection.objects.link(area)

    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.008, 0.012, 0.022)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene["dataset"] = "CRAS Labs @ FEUP"
    scene["dataset_doi"] = "10.5281/zenodo.7948116"
    scene["dataset_license"] = "CC BY 4.0"
    scene["ifc_import_method"] = import_method
    scene["point_cloud_to_ifc_matrix"] = json.dumps(matrix_rows)

    readme = bpy.data.texts.new("CRAS_ALIGNMENT_README")
    readme.write(
        "CRAS Labs @ FEUP Point Cloud + IFC validation scene\n"
        "Dataset: https://doi.org/10.5281/zenodo.7948116\n"
        "License: CC BY 4.0\n"
        f"IFC import: {import_method}\n"
        "Point cloud object remains in source coordinates; matrix_world is the measured\n"
        "pointCloudToIfc transform from demo/transformation.json. Scale is fixed at 1.\n"
    )

    low, high = scene_bounds(ifc_objects + [point_obj])
    captures = render_views(captures_path, camera, low, high)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path.as_posix(), check_existing=False)

    report = {
        "blend": blend_path.as_posix(),
        "bonsaiImportSucceeded": bonsai_ok,
        "ifcImportMethod": import_method,
        "ifcMeshObjectCount": len(ifc_objects),
        "pointCloudObject": point_obj.name,
        "pointCloudVertices": len(point_obj.data.vertices),
        "pointCloudMatrixWorld": [list(row) for row in point_obj.matrix_world],
        "bounds": {"min": list(low), "max": list(high), "extent": list(high - low)},
        "collections": ["PointCloud", "IFC", "Reference"],
        "captures": captures,
    }
    report_path = blend_path.parent / "build-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
