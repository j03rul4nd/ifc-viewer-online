"""Render repeatable QA views of the Hotel Vela architectural IFC.

Usage:
  blender --background --python scripts/blender/render-hotel-vela.py -- \
    public/models/hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc output/folder

The colours are diagnostic Blender materials only.  They are not written back
to the IFC and therefore cannot be mistaken for surveyed material data.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Vector, Matrix
from bonsai import tool


def make_material(name, colour, metallic=0.0, roughness=0.45, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*colour, alpha)
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*colour, alpha)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Alpha"].default_value = alpha
    transmission = shader.inputs.get("Transmission Weight") or shader.inputs.get("Transmission")
    if transmission is not None:
        transmission.default_value = 0.18 if alpha < 1.0 else 0.0
    if alpha < 1.0 and hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    return material


def apply_material(obj, material):
    if not getattr(obj, "data", None) or not hasattr(obj.data, "materials"):
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def look_at(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ifc_path = os.path.abspath(args[0] if args else
                               "public/models/hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc")
    out_dir = os.path.abspath(args[1] if len(args) > 1 else "artifacts/hotel-vela")
    os.makedirs(out_dir, exist_ok=True)
    native = "--native" in args

    bpy.ops.bim.load_project(filepath=ifc_path)
    import ifcopenshell.util.placement
    building_frame = Matrix(ifcopenshell.util.placement.get_local_placement(
        tool.Ifc.get().by_type("IfcBuilding")[0].ObjectPlacement))
    frame_point = lambda p: building_frame @ Vector(p)

    glass = make_material("QA Glass", (0.12, 0.38, 0.57), metallic=.40, roughness=0.22, alpha=1.)
    guard_glass = make_material("QA Guard Glass", (.12,.40,.60), roughness=.2, alpha=.35)
    metal = make_material("QA Aluminium", (0.72, 0.75, 0.78), metallic=0.62, roughness=0.24)
    spandrel = make_material("QA Spandrel", (0.69, 0.67, 0.62), metallic=0.10, roughness=0.38)
    stair = make_material("QA Stair Steel", (0.19, 0.22, 0.25), metallic=0.72, roughness=0.30)
    louvre = make_material("QA Louvre", (0.25, 0.28, 0.30), metallic=0.55, roughness=0.38)
    concrete = make_material("QA Concrete", (0.66, 0.66, 0.63), roughness=0.78)

    # Optional structural federation, imported as diagnostic meshes using the
    # actual IFC world placements (no guessed displacement in the render).
    if "--structure" in args:
        import ifcopenshell.geom
        structure_path = args[args.index("--structure")+1]
        structure = ifcopenshell.open(structure_path)
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)
        for element in structure.by_type("IfcElement"):
            if not element.Representation or element.is_a("IfcOpeningElement"):
                continue
            shape = ifcopenshell.geom.create_shape(settings, element)
            v,f = shape.geometry.verts, shape.geometry.faces
            mesh = bpy.data.meshes.new(element.Name)
            mesh.from_pydata([v[i:i+3] for i in range(0,len(v),3)], [],
                             [f[i:i+3] for i in range(0,len(f),3)])
            obj = bpy.data.objects.new(element.Name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            obj["qa_ifc_name"] = element.Name
            apply_material(obj, concrete)

    for obj in list(bpy.data.objects):
        entity = tool.Ifc.get_entity(obj)
        if entity is None:
            continue
        if entity.is_a("IfcSpace"):
            obj.hide_render = True
            continue
        if native:
            continue
        if entity.is_a("IfcRailing"):
            apply_material(obj, guard_glass)
        elif entity.is_a("IfcCurtainWall"):
            apply_material(obj, glass)
        elif entity.is_a("IfcStairFlight"):
            apply_material(obj, stair)
        elif entity.is_a("IfcWall") and "Louvre" in (entity.Name or ""):
            apply_material(obj, louvre)
        elif entity.is_a("IfcMember") or entity.is_a("IfcDoor"):
            apply_material(obj, metal)
        elif entity.is_a("IfcPlate"):
            apply_material(obj, spandrel)
        elif entity.is_a("IfcSlab") or entity.is_a("IfcRoof"):
            apply_material(obj, concrete)

    bpy.ops.mesh.primitive_plane_add(size=420.0, location=(-10.0, 0.0, -0.20))
    ground = bpy.context.object
    ground.name = "QA Ground Plane"
    apply_material(ground, make_material("QA Ground", (0.43, 0.45, 0.43), roughness=0.92))

    world = bpy.context.scene.world or bpy.data.worlds.new("QA World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.50, 0.60, 0.75, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65

    bpy.ops.object.light_add(type="SUN", location=(0.0, 0.0, 160.0))
    sun = bpy.context.object
    sun.rotation_euler = (math.radians(24.0), math.radians(-18.0), math.radians(-32.0))
    sun.data.energy = 3.0
    sun.data.angle = math.radians(8.0)
    bpy.ops.object.light_add(type="AREA", location=(-80.0, -100.0, 110.0))
    bpy.context.object.data.energy = 2200.0
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 80.0

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.lens = 52.0
    camera.data.sensor_width = 36.0
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    views = {
        "hotel-vela-sail": ((-18.0, -235.0, 92.0), (-10.0, -8.0, 47.0), 58.0),
        "hotel-vela-stair": ((175.0, -28.0, 62.0), (16.0, -28.0, 50.0), 62.0),
        "hotel-vela-perspective": ((-175.0, -175.0, 122.0), (-10.0, -5.0, 45.0), 55.0),
        "hotel-vela-stair-detail": ((-93.0, -28., 17.), (-40., -28., 17.), 60.),
    }
    for filename, (location, target, lens) in views.items():
        camera.location = frame_point(location)
        camera.data.lens = lens
        look_at(camera, frame_point(target))
        scene.render.filepath = os.path.join(out_dir, f"{filename}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {scene.render.filepath}")

    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 121.0
    camera.location = frame_point((-12., -240., 49.))
    look_at(camera, frame_point((-12., -28., 49.)))
    scene.render.filepath = os.path.join(out_dir, "hotel-vela-elevation.png")
    bpy.ops.render.render(write_still=True)

    # Plan cut views isolate the authored storey instead of seeing its roof.
    # The neutral floor is generated from the same profile as the STR slab.
    from hotel_vela_geometry import plate_at, ANNEX, link_profiles
    for level in (4, 12, 24):
        z = 6. + (level-1)*3.25
        level_name = f"Level {level:02d}"
        for obj in list(bpy.data.objects):
            entity = tool.Ifc.get_entity(obj)
            if entity is not None or obj.get("qa_ifc_name"):
                name = (entity.Name or "") if entity else obj["qa_ifc_name"]
                obj.hide_render = not (
                    (name.startswith(("Plan ","Core Wall","Annex Room","Annex Corridor")) and level_name in name)
                    or name in (f"{level_name} Curtain Wall", f"{level_name} Spandrel")
                    or (level==4 and name in ("Annex Glazing - Level 04","Annex Spandrel - Level 04")))
        mesh = bpy.data.meshes.new(f"QA Floor {level}")
        points = plate_at(z)
        rings = [points,ANNEX,*link_profiles()] if level==4 else [points]
        vertices, faces = [], []
        for ring in rings:
            start = len(vertices)
            vertices.extend([frame_point((x,y,z-.01)) for x,y in ring])
            faces.append(list(range(start,len(vertices))))
        mesh.from_pydata(vertices, [], faces)
        floor = bpy.data.objects.new(f"QA Floor {level}", mesh)
        scene.collection.objects.link(floor)
        apply_material(floor, make_material(f"QA Plan Floor {level}", (.84,.84,.82)))
        camera.data.ortho_scale = 110. if level==4 else 74.
        camera.location = frame_point((0. if level==4 else -13.5, -28., 180.))
        camera.rotation_euler = building_frame.to_euler()
        scene.render.filepath = os.path.join(out_dir, f"hotel-vela-plan-{level}.png")
        bpy.ops.render.render(write_still=True)
        floor.hide_render = True


if __name__ == "__main__":
    main()
