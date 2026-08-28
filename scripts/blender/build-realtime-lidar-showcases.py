# ─── build-realtime-lidar-showcases.py ──────────────────────────────────────
# Authors three compact IFC4 reference models from the same dimensions used by
# src/demo-models/realtime-lidar-showcases.ts. The temporal returns are
# simulated; the IFC files themselves are valid Bonsai-authored OpenBIM assets.
#
# Run:
#   blender --background --python scripts/blender/build-realtime-lidar-showcases.py -- public/models/realtime-lidar

import os
import subprocess
import sys

import bpy
import ifcopenshell.api

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bonsai_kit as kit  # noqa: E402


AUTHOR = "IFC Viewer Online"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-08-25T00:00:00+00:00"


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


def begin_model(title, site_name, building_name, description):
    ifc = kit.new_project()
    kit.edit(
        ifc, ifc.by_type("IfcProject")[0],
        Name=title,
        LongName=description,
        Description="Synthetic IFC4 reference paired with a deterministic temporal LiDAR replay",
        ObjectType="IFC plus temporal point-cloud exhibition reference",
        Phase="DEMO",
    )
    kit.edit(
        ifc, ifc.by_type("IfcSite")[0],
        Name=site_name,
        Description="Local-coordinate site for an IFC and temporal point-cloud demonstration",
        CompositionType="ELEMENT",
        RefElevation=0.0,
    )
    kit.edit(
        ifc, ifc.by_type("IfcBuilding")[0],
        Name=building_name,
        LongName=description,
        CompositionType="ELEMENT",
    )
    storey = kit.edit(
        ifc, ifc.by_type("IfcBuildingStorey")[0],
        Name="Reference Level",
        LongName="Temporal LiDAR reference level",
        CompositionType="ELEMENT",
        Elevation=0.0,
    )
    body, _axis = kit.contexts(ifc)
    return ifc, storey, body


def demo_pset(ifc, element, use_case, replay_file):
    kit.add_pset(ifc, element, "Pset_RealtimeLidarDemo", {
        "UseCase": use_case,
        "ReplayCompanion": replay_file,
        "TemporalSource": "Deterministic browser simulation",
        "SyntheticAsset": True,
        "CoordinateFrame": "Local metres; Y-up after viewer conversion",
    })


def build_warehouse(output_path):
    width, depth, height, floor_depth, roof_depth = 30.0, 18.0, 8.0, 0.22, 0.22
    ifc, storey, body = begin_model(
        "IFC + Moving LiDAR Warehouse Demo",
        "Warehouse Operations Demo Site",
        "Automated Distribution Warehouse",
        "Warehouse reference with racks and circulation lanes for moving LiDAR returns",
    )
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C30/37", category="concrete")
    steel = ifcopenshell.api.run("material.add_material", ifc, name="Warehouse steel", category="steel")
    panel = ifcopenshell.api.run("material.add_material", ifc, name="Insulated panel", category="composite")
    floor_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-220-Warehouse", "FLOOR", concrete, floor_depth)
    roof_type = kit.add_layered_type(ifc, "IfcSlabType", "ROF-220-Warehouse", "ROOF", panel, roof_depth)
    column_type = kit.add_simple_type(ifc, "IfcColumnType", "COL-340-Warehouse", "COLUMN", steel)
    rack_type = kit.add_simple_type(ifc, "IfcBuildingElementProxyType", "RACK-Operational", "ELEMENT", steel)
    wall_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-220-Panel", "SOLIDWALL", panel, 0.22)
    expected = {}
    elements = []

    specifications = [
        ("IfcSlab", floor_type, "Warehouse Floor", (-15.0, -9.0, -floor_depth), (width, depth, floor_depth)),
        ("IfcSlab", roof_type, "Warehouse Roof", (-15.0, -9.0, height - roof_depth), (width, depth, roof_depth)),
        ("IfcWall", wall_type, "Warehouse Wall North", (-15.0, 8.78, 0.0), (width, 0.22, height)),
        ("IfcWall", wall_type, "Warehouse Wall South", (-15.0, -9.0, 0.0), (width, 0.22, height)),
        ("IfcWall", wall_type, "Warehouse Wall West", (-15.0, -8.78, 0.0), (0.22, 17.56, height)),
        ("IfcWall", wall_type, "Warehouse Wall East", (14.78, -8.78, 0.0), (0.22, 17.56, height)),
    ]
    for ifc_class, item_type, name, origin, size in specifications:
        item = add_box(ifc, body, storey, ifc_class, item_type, name, "Warehouse envelope reference", origin, size)
        expected[name] = origin
        elements.append(item)

    for x_index, x in enumerate((-12.0, -4.0, 4.0, 12.0), start=1):
        for y_index, y in enumerate((-7.5, 0.0, 7.5), start=1):
            name = f"Warehouse Column {x_index}.{y_index}"
            origin = (x - 0.17, y - 0.17, 0.0)
            item = add_box(ifc, body, storey, "IfcColumn", column_type, name, "Warehouse structural grid", origin, (0.34, 0.34, height))
            expected[name] = origin
            elements.append(item)

    for x_index, x in enumerate((-10.0, -5.0, 0.0, 5.0, 10.0), start=1):
        for aisle, y in (("A", -6.2), ("B", 6.2)):
            name = f"Rack {aisle}{x_index}"
            origin = (x - 1.75, y - 0.625, 0.0)
            item = add_box(ifc, body, storey, "IfcBuildingElementProxy", rack_type, name, "Operational storage rack represented as a coordination proxy", origin, (3.5, 1.25, 4.7))
            expected[name] = origin
            elements.append(item)

    for element in elements:
        demo_pset(ifc, element, "Moving forklift and autonomous-cart spatial context", "warehouse-operations-snapshot.ply")
    kit.set_header(ifc, os.path.basename(output_path), AUTHOR, ORGANISATION, TIMESTAMP)
    kit.write(ifc, output_path)
    return expected


def build_construction(output_path):
    width, depth, floor_depth = 26.0, 20.0, 0.26
    ifc, storey, body = begin_model(
        "IFC + 4D Construction LiDAR Demo",
        "Construction Progress Demo Site",
        "Structural Progress Frame",
        "Structural reference for phased point-cloud progress and deviation review",
    )
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Concrete C35/45", category="concrete")
    steel = ifcopenshell.api.run("material.add_material", ifc, name="Temporary structural steel", category="steel")
    floor_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-260-Progress", "FLOOR", concrete, floor_depth)
    upper_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-380-Progress", "FLOOR", concrete, 0.38)
    column_type = kit.add_simple_type(ifc, "IfcColumnType", "COL-460-Progress", "COLUMN", concrete)
    beam_type = kit.add_simple_type(ifc, "IfcBeamType", "BEA-460-Progress", "BEAM", steel)
    wall_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-340-Core", "SOLIDWALL", concrete, 0.34)
    expected = {}
    elements = []

    floor_origin = (-13.0, -10.0, -floor_depth)
    floor = add_box(ifc, body, storey, "IfcSlab", floor_type, "Construction Ground Slab", "Current structural datum", floor_origin, (width, depth, floor_depth))
    expected[floor.Name] = floor_origin
    elements.append(floor)

    for x_index, x in enumerate((-10.0, -5.0, 0.0, 5.0, 10.0), start=1):
        for y_index, y in enumerate((-7.5, 0.0, 7.5), start=1):
            name = f"Progress Column {x_index}.{y_index}"
            origin = (x - 0.23, y - 0.23, 0.0)
            item = add_box(ifc, body, storey, "IfcColumn", column_type, name, "Planned structural column", origin, (0.46, 0.46, 7.4))
            expected[name] = origin
            elements.append(item)

    for index, y in enumerate((-7.5, 0.0, 7.5), start=1):
        name = f"Progress Beam {index}"
        origin = (-13.0, y - 0.23, 7.4)
        item = add_box(ifc, body, storey, "IfcBeam", beam_type, name, "Planned primary beam", origin, (width, 0.46, 0.35))
        expected[name] = origin
        elements.append(item)

    for name, center_x, center_y in (("Core Wall East", 8.5, -4.3), ("Core Wall West", -8.5, 4.3)):
        origin = (center_x - 0.17, center_y - 3.1, 0.0)
        item = add_box(ifc, body, storey, "IfcWall", wall_type, name, "Planned reinforced-concrete core wall", origin, (0.34, 6.2, 6.2))
        expected[name] = origin
        elements.append(item)

    upper_origin = (-13.0, -10.0, 7.37)
    upper = add_box(ifc, body, storey, "IfcSlab", upper_type, "Upper Progress Slab", "Planned upper structural slab", upper_origin, (width, depth, 0.38))
    expected[upper.Name] = upper_origin
    elements.append(upper)

    for element in elements:
        demo_pset(ifc, element, "Phased construction progress and shifted-column return cluster", "construction-progress-snapshot.ply")
    kit.set_header(ifc, os.path.basename(output_path), AUTHOR, ORGANISATION, TIMESTAMP)
    kit.write(ifc, output_path)
    return expected


def build_tunnel(output_path):
    length, width, height, shell = 42.0, 8.0, 6.0, 0.24
    ifc, storey, body = begin_model(
        "IFC + Mobile LiDAR Tunnel Demo",
        "Utility Tunnel Demo Site",
        "Linear Utility Corridor",
        "Dense utility-corridor reference for mobile inspection and issue localization",
    )
    concrete = ifcopenshell.api.run("material.add_material", ifc, name="Tunnel concrete", category="concrete")
    steel = ifcopenshell.api.run("material.add_material", ifc, name="Galvanised service steel", category="steel")
    shell_type = kit.add_layered_type(ifc, "IfcSlabType", "SLB-240-Tunnel", "FLOOR", concrete, shell)
    wall_type = kit.add_layered_type(ifc, "IfcWallType", "WAL-240-Tunnel", "SOLIDWALL", concrete, shell)
    service_type = kit.add_simple_type(ifc, "IfcBuildingElementProxyType", "SERVICE-Tunnel", "ELEMENT", steel)
    expected = {}
    elements = []

    for ifc_class, item_type, name, origin, size in (
        ("IfcSlab", shell_type, "Tunnel Floor", (-21.0, -4.0, -shell), (length, width, shell)),
        ("IfcSlab", shell_type, "Tunnel Roof", (-21.0, -4.0, height - shell), (length, width, shell)),
        ("IfcWall", wall_type, "Tunnel Wall South", (-21.0, -4.0, 0.0), (length, shell, height)),
        ("IfcWall", wall_type, "Tunnel Wall North", (-21.0, 4.0 - shell, 0.0), (length, shell, height)),
    ):
        item = add_box(ifc, body, storey, ifc_class, item_type, name, "Utility tunnel envelope", origin, size)
        expected[name] = origin
        elements.append(item)

    for index, (service_z, service_y) in enumerate(((4.7, -3.35), (3.7, -3.45), (2.7, -3.50)), start=1):
        name = f"Longitudinal Service {index}"
        origin = (-21.0, service_y - 0.23, service_z - 0.23)
        item = add_box(ifc, body, storey, "IfcBuildingElementProxy", service_type, name, "Linear service proxy used for scan alignment", origin, (length, 0.46, 0.46))
        expected[name] = origin
        elements.append(item)

    for index, y in enumerate((-1.05, 1.05), start=1):
        name = f"Inspection Rail {index}"
        origin = (-21.0, y - 0.08, 0.0)
        item = add_box(ifc, body, storey, "IfcBuildingElementProxy", service_type, name, "Inspection trolley guide rail", origin, (length, 0.16, 0.20))
        expected[name] = origin
        elements.append(item)

    tray_origin = (-21.0, 3.35, 0.97)
    tray = add_box(ifc, body, storey, "IfcBuildingElementProxy", service_type, "North Service Tray", "Coordination tray near the inspection wall", tray_origin, (length, 0.45, 0.16))
    expected[tray.Name] = tray_origin
    elements.append(tray)

    for element in elements:
        demo_pset(ifc, element, "Mobile inspection trolley and pulsing wall-condition cluster", "utility-tunnel-snapshot.ply")
    kit.set_header(ifc, os.path.basename(output_path), AUTHOR, ORGANISATION, TIMESTAMP)
    kit.write(ifc, output_path)
    return expected


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    output_dir = os.path.abspath(args[0] if args else "public/models/realtime-lidar")
    os.makedirs(output_dir, exist_ok=True)
    builds = {
        ("warehouse-operations-lidar", "IVO-Warehouse-Operations.ifc", build_warehouse),
        ("construction-progress-lidar", "IVO-Construction-Progress.ifc", build_construction),
        ("utility-tunnel-lidar", "IVO-Utility-Tunnel.ifc", build_tunnel),
    }
    selected = args[1] if len(args) > 1 else None
    if selected is None:
        # Bonsai keeps per-project collection state after a verified reload.
        # Isolating each reference in its own Blender process makes the default
        # all-model build reproducible and identical to authoring them manually.
        for seed, _file_name, _builder in sorted(builds):
            subprocess.check_call([
                bpy.app.binary_path, "--background", "--python", os.path.abspath(__file__),
                "--", output_dir, seed,
            ])
        return

    try:
        seed, file_name, builder = next(item for item in builds if item[0] == selected)
    except StopIteration:
        raise SystemExit(f"unknown showcase: {selected}")
    output_path = os.path.join(output_dir, file_name)
    kit.deterministic_guids(seed)
    expected = builder(output_path)
    ifc = kit.verify(output_path, expected)
    kit.report(ifc, output_path)


if __name__ == "__main__":
    main()
