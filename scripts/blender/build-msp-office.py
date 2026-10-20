# ─── build-msp-office.py ─────────────────────────────────────────────────────
# Authors "MSP Demo Office": a two-storey office built for one job — showing a
# managed-service provider's world as a digital twin. Every room an MSP looks
# after has its name (Server Room, Comms Room, Open Office…), and the devices
# it manages are real IFC4 elements with their own classes, types and an asset
# property set: Wi-Fi access points on the ceilings, server racks and a UPS,
# a CCTV camera and a badge reader at the entrance.
#
#   blender --background --python scripts/blender/build-msp-office.py -- public/models/msp-office/MSP-Demo-Office.ifc
#
# Same machinery as the other reference models (bonsai_kit.py): Bonsai's own
# project, the ifcopenshell API for every entity, seeded GUIDs so the file is
# the same on every build. The `?twin=itops` template binds to these elements
# by class and name (device-sim.ts, itopsBindings).
#
# PLAN (metres, each storey 24 × 14, storey height 3.6):
#
#   y=14 ┌──────────────┬──────────┬─────────┐
#        │              │ Meeting  │ Manager │   Level 01: Open Office B (west),
#        │  Open Office │  Room    │ / Comms │   Meeting Room 2, Comms Room (east)
#   y=8  │      A       ├──────────┴─────────┤
#        │              │   Reception / Kitchen  Ground: Open Office A, Meeting 1,
#   y=0  └──────────────┴────────────────────┘   Server Room, Reception
#        x=0           x=12                  x=24

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ifcopenshell.api  # noqa: E402
import ifcopenshell.util.element  # noqa: E402

import bonsai_kit as kit  # noqa: E402

W, D, H = 24.0, 14.0, 3.6
T = 0.25            # exterior wall
TI = 0.12           # partition
SLAB = 0.25
CEIL = 3.0          # device height under the next slab

AUTHOR = "IFC Viewer Online"
ORGANISATION = "IFC Viewer Online"
TIMESTAMP = "2026-10-20T00:00:00+00:00"


def rect(w, d):
    return [(0.0, 0.0), (w, 0.0), (w, d), (0.0, d)]


class Office:
    def __init__(self):
        self.ifc = kit.new_project()
        self.body, self.axis = kit.contexts(self.ifc)
        self.storeys = {}
        self.walls = {}

    # ── helpers ──
    def box(self, ifc_class, element_type, name, description, storey, origin, size, rotation=0.0, pset=None):
        w, d, h = size
        matrix = kit.placement_matrix(origin, rotation)
        obj = kit.placed_object(name, matrix)
        el = kit.add_occurrence(self.ifc, obj, matrix, ifc_class, element_type, name, description, storey)
        kit.attach(self.ifc, obj, el, kit.extruded(self.ifc, self.body, rect(w, d), h))
        if pset:
            kit.add_pset(self.ifc, el, pset[0], pset[1])
        return el

    def wall(self, wall_type, name, storey, start, end, thickness, external):
        (x0, y0), (x1, y1) = start, end
        import math
        length = math.hypot(x1 - x0, y1 - y0)
        angle = math.degrees(math.atan2(y1 - y0, x1 - x0))
        matrix = kit.placement_matrix((x0, y0, storey.Elevation), angle)
        obj = kit.placed_object(name, matrix)
        el = kit.add_occurrence(self.ifc, obj, matrix, "IfcWall", wall_type, name, None, storey)
        kit.attach(self.ifc, obj, el, ifcopenshell.api.run(
            "geometry.add_axis_representation", self.ifc, context=self.axis, axis=[(0.0, 0.0), (length, 0.0)]))
        kit.attach(self.ifc, obj, el, ifcopenshell.api.run(
            "geometry.add_wall_representation", self.ifc, context=self.body,
            length=length, height=H - SLAB, thickness=thickness, direction_sense="POSITIVE", offset=-thickness / 2))
        ifcopenshell.util.element.get_material(el).LayerSetDirection = "AXIS2"
        kit.add_pset(self.ifc, el, "Pset_WallCommon", {"IsExternal": external, "LoadBearing": external})
        self.walls[name] = (el, matrix)
        return el

    def space(self, space_type, name, long_name, storey, x, y, w, d, use):
        matrix = kit.placement_matrix((x, y, storey.Elevation))
        obj = kit.placed_object(name, matrix)
        sp = kit.add_occurrence(self.ifc, obj, matrix, "IfcSpace", space_type, name, use, None)
        kit.attach(self.ifc, obj, sp, kit.extruded(self.ifc, self.body, rect(w, d), H - SLAB))
        kit.aggregate(self.ifc, [sp], storey)
        ifcopenshell.api.run("geometry.edit_object_placement", self.ifc, product=sp, matrix=matrix)
        kit.edit(self.ifc, sp, LongName=long_name, CompositionType="ELEMENT")
        kit.add_qto(self.ifc, sp, "Qto_SpaceBaseQuantities", {"NetFloorArea": w * d, "Height": H - SLAB})
        return sp

    def styles(self, palette):
        for material in self.ifc.by_type("IfcMaterial"):
            if material.Name not in palette:
                continue
            colour, transparency = palette[material.Name]
            style = ifcopenshell.api.run("style.add_style", self.ifc, name=material.Name)
            ifcopenshell.api.run("style.add_surface_style", self.ifc, style=style, ifc_class="IfcSurfaceStyleRendering", attributes={
                "SurfaceColour": dict(zip(("Red", "Green", "Blue"), colour)), "Transparency": transparency, "ReflectanceMethod": "NOTDEFINED"})
            ifcopenshell.api.run("style.assign_material_style", self.ifc, material=material, style=style, context=self.body)


def build(output_path):
    o = Office()
    ifc = o.ifc
    ifcopenshell.api.run("attribute.edit_attributes", ifc, product=ifc.by_type("IfcProject")[0], attributes={
        "Name": "MSP Demo Office", "LongName": "MSP Demo Office - managed IT estate",
        "Description": "Demo model: an office whose IT a managed-service provider runs", "Phase": "DEMO"})
    kit.edit(ifc, ifc.by_type("IfcSite")[0], Name="Demo Office Site", CompositionType="ELEMENT", RefElevation=0.0)
    building = kit.edit(ifc, ifc.by_type("IfcBuilding")[0], Name="Demo Office", LongName="Two-storey office", CompositionType="ELEMENT")
    gf = kit.edit(ifc, ifc.by_type("IfcBuildingStorey")[0], Name="Ground Floor", LongName="Ground floor", CompositionType="ELEMENT", Elevation=0.0)
    l1 = kit.add_storey(ifc, building, "Level 01", "First floor", H)
    o.storeys = {"GF": gf, "L1": l1}

    mat = lambda name, cat: ifcopenshell.api.run("material.add_material", ifc, name=name, category=cat)
    m_wall = mat("Rendered blockwork", "masonry")
    m_part = mat("Plasterboard partition", "gypsum")
    m_slab = mat("Concrete slab", "concrete")
    m_glass = mat("Double glazing", "glass")
    m_door = mat("Door leaf", "wood")
    m_rack = mat("Rack steel black", "steel")
    m_dev = mat("Device housing white", "plastic")
    m_desk = mat("Desk laminate", "wood")
    o.styles  # (applied at the end, once every material exists)

    t_ext = kit.add_layered_type(ifc, "IfcWallType", "WAL-250-External", "SOLIDWALL", m_wall, T)
    t_int = kit.add_layered_type(ifc, "IfcWallType", "WAL-120-Partition", "PARTITIONING", m_part, TI)
    t_slab = kit.add_layered_type(ifc, "IfcSlabType", "SLB-250-Floor", "FLOOR", m_slab, SLAB)
    t_roof = kit.add_layered_type(ifc, "IfcSlabType", "SLB-250-Roof", "ROOF", m_slab, SLAB)
    t_win = kit.add_simple_type(ifc, "IfcWindowType", "WIN-Ribbon", "WINDOW", m_glass)
    t_door = kit.add_simple_type(ifc, "IfcDoorType", "DOR-Entrance", "DOOR", m_door)
    t_space = kit.add_simple_type(ifc, "IfcSpaceType", "Office space", "INTERNAL")
    t_ap = kit.add_simple_type(ifc, "IfcCommunicationsApplianceType", "Wi-Fi access point", "NETWORKAPPLIANCE", m_dev)
    t_rack = kit.add_simple_type(ifc, "IfcCommunicationsApplianceType", "Server rack 42U", "COMPUTER", m_rack)
    t_switch = kit.add_simple_type(ifc, "IfcCommunicationsApplianceType", "Core switch", "NETWORKHUB", m_rack)
    t_ups = kit.add_simple_type(ifc, "IfcElectricFlowStorageDeviceType", "UPS 10 kVA", "UPS", m_rack)
    t_cam = kit.add_simple_type(ifc, "IfcAudioVisualApplianceType", "CCTV dome camera", "CAMERA", m_dev)
    t_badge = kit.add_simple_type(ifc, "IfcSensorType", "Badge reader", "IDENTIFIERSENSOR", m_dev)
    t_desk = kit.add_simple_type(ifc, "IfcFurnitureType", "Desk 160", "DESK", m_desk)

    for key, storey in o.storeys.items():
        z = storey.Elevation
        # floor slab and (on top) the roof
        o.box("IfcSlab", t_slab, f"Floor slab {key}", None, storey, (0.0, 0.0, z - SLAB), (W, D, SLAB))
        # exterior walls
        o.wall(t_ext, f"External wall S {key}", storey, (0, 0), (W, 0), T, True)
        o.wall(t_ext, f"External wall E {key}", storey, (W, 0), (W, D), T, True)
        o.wall(t_ext, f"External wall N {key}", storey, (W, D), (0, D), T, True)
        o.wall(t_ext, f"External wall W {key}", storey, (0, D), (0, 0), T, True)
        # partitions
        o.wall(t_int, f"Partition 12 {key}", storey, (12, 0), (12, D), TI, False)
        o.wall(t_int, f"Partition 8 {key}", storey, (12, 8), (W, 8), TI, False)
        o.wall(t_int, f"Partition 18 {key}", storey, (18, 8), (18, D), TI, False)
        # ribbon windows on the long facades (proud of the wall face, glazed)
        for i, x in enumerate([1.5, 4.5, 7.5, 13.5, 16.5, 19.5]):
            o.box("IfcWindow", t_win, f"Window S{i + 1} {key}", None, storey, (x, -T / 2 - 0.03, z + 0.9), (2.2, 0.06, 1.6))
            o.box("IfcWindow", t_win, f"Window N{i + 1} {key}", None, storey, (x, D + T / 2 - 0.03, z + 0.9), (2.2, 0.06, 1.6))

    o.box("IfcSlab", t_roof, "Roof slab", None, l1, (0.0, 0.0, 2 * H - SLAB), (W, D, SLAB))
    door = o.box("IfcDoor", t_door, "Main entrance door", "Badge-controlled entrance", gf, (16.0, -T / 2 - 0.05, 0.0), (1.8, 0.1, 2.3))

    # rooms
    S = lambda *a: o.space(t_space, *a)
    S("Open Office A", "Open office A (24 desks)", gf, 0.2, 0.2, 11.7, 13.6, "Open office")
    S("Reception", "Reception and visitor area", gf, 12.1, 0.2, 11.7, 7.7, "Reception")
    S("Meeting Room 1", "Meeting room 1 (8 seats)", gf, 12.1, 8.1, 5.8, 5.7, "Meeting")
    S("Server Room", "Server room - racks, UPS, cooling", gf, 18.1, 8.1, 5.7, 5.7, "Technical")
    S("Open Office B", "Open office B (24 desks)", l1, 0.2, 0.2, 11.7, 13.6, "Open office")
    S("Kitchen", "Kitchen and break area", l1, 12.1, 0.2, 11.7, 7.7, "Break")
    S("Meeting Room 2", "Meeting room 2 (12 seats)", l1, 12.1, 8.1, 5.8, 5.7, "Meeting")
    S("Comms Room", "Floor comms room - patch and switch", l1, 18.1, 8.1, 5.7, 5.7, "Technical")

    asset = lambda tag, ip, room, vendor: ("MSP_Asset", {"AssetTag": tag, "IPAddress": ip, "Room": room, "Vendor": vendor, "ManagedBy": "Demo MSP"})
    # Wi-Fi APs: two per open office, one per other room
    aps = [
        ("AP-GF-01", gf, (3.5, 4.5), "Open Office A"), ("AP-GF-02", gf, (8.0, 9.5), "Open Office A"),
        ("AP-GF-03", gf, (17.5, 4.0), "Reception"), ("AP-GF-04", gf, (14.8, 10.8), "Meeting Room 1"),
        ("AP-L1-01", l1, (3.5, 4.5), "Open Office B"), ("AP-L1-02", l1, (8.0, 9.5), "Open Office B"),
        ("AP-L1-03", l1, (17.5, 4.0), "Kitchen"), ("AP-L1-04", l1, (14.8, 10.8), "Meeting Room 2"),
    ]
    for i, (tag, storey, (x, y), room) in enumerate(aps):
        o.box("IfcCommunicationsAppliance", t_ap, f"Wi-Fi AP {tag}", f"Ceiling access point · {room}", storey,
              (x, y, storey.Elevation + CEIL - 0.06), (0.32, 0.32, 0.06), pset=asset(tag, f"10.20.{i // 4}.{11 + i}", room, "Generic Wi-Fi 6"))
    for i in range(3):
        o.box("IfcCommunicationsAppliance", t_rack, f"Server rack R{i + 1}", "42U rack · Server Room", gf,
              (19.0 + i * 0.9, 12.2, 0.0), (0.6, 1.0, 2.0), pset=asset(f"RACK-{i + 1}", f"10.10.0.{i + 1}", "Server Room", "Generic 42U"))
    o.box("IfcElectricFlowStorageDevice", t_ups, "UPS 10 kVA", "Uninterruptible power supply · Server Room", gf,
          (22.2, 9.0, 0.0), (0.6, 0.8, 1.2), pset=asset("UPS-1", "10.10.0.50", "Server Room", "Generic UPS"))
    o.box("IfcCommunicationsAppliance", t_switch, "Core switch L1", "Floor switch · Comms Room", l1,
          (22.0, 12.4, H), (0.6, 0.8, 1.6), pset=asset("SW-L1", "10.10.1.1", "Comms Room", "Generic 48-port"))
    o.box("IfcAudioVisualAppliance", t_cam, "CCTV entrance camera", "Dome camera over the main entrance", gf,
          (16.7, 0.3, 2.7), (0.2, 0.2, 0.15), pset=asset("CAM-01", "10.30.0.21", "Reception", "Generic 4K dome"))
    o.box("IfcSensor", t_badge, "Badge reader entrance", "Access control at the main entrance", gf,
          (18.05, -0.2, 1.1), (0.1, 0.06, 0.15), pset=asset("ACC-01", "10.30.0.40", "Reception", "Generic reader"))
    # a few desks so the open offices read as offices
    for storey, tag in [(gf, "A"), (l1, "B")]:
        for row in range(3):
            for col in range(2):
                o.box("IfcFurniture", t_desk, f"Desk cluster {tag}{row + 1}{col + 1}", None, storey,
                      (1.5 + col * 5.0, 2.0 + row * 3.8, storey.Elevation), (3.2, 1.6, 0.75))

    o.styles({
        "Rendered blockwork": ((0.86, 0.86, 0.84), 0.0),
        "Plasterboard partition": ((0.93, 0.93, 0.92), 0.0),
        "Concrete slab": ((0.62, 0.63, 0.65), 0.0),
        "Double glazing": ((0.55, 0.72, 0.85), 0.55),
        "Door leaf": ((0.30, 0.33, 0.38), 0.0),
        "Rack steel black": ((0.12, 0.13, 0.15), 0.0),
        "Device housing white": ((0.97, 0.97, 0.97), 0.0),
        "Desk laminate": ((0.80, 0.70, 0.55), 0.0),
    })
    kit.set_header(ifc, os.path.basename(output_path), AUTHOR, ORGANISATION, TIMESTAMP)
    kit.write(ifc, output_path)
    return door


def main():
    output_path = kit.output_path_from_argv(sys.argv, "public/models/msp-office/MSP-Demo-Office.ifc")
    kit.deterministic_guids("msp-demo-office")
    build(output_path)
    kit.report(kit.verify(output_path, {}, require_all=False), output_path)


if __name__ == "__main__":
    main()
