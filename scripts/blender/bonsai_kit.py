# ─── bonsai_kit.py ────────────────────────────────────────────────────────────
# Shared machinery for the reference IFC models we author with Blender + Bonsai
# (build-hello-world.py, build-temple.py).
#
# Everything here is either a Bonsai operator, a Bonsai core call, or an
# `ifcopenshell.api` usecase — the same layer those operators call. Nothing
# reaches past the API to `file.create_entity`, because a reference model whose
# entities were hand-placed proves nothing about what a real OpenBIM tool emits.
#
# THE ONE THING THAT LOOKS LIKE CHEATING AND IS NOT: `deterministic_guids`. The
# .ifc files are committed and asserted against. With uuid4 GUIDs and a live
# timestamp, every rebuild rewrites a hundred lines and the fixtures' expected
# values become unassertable. A uuid5 over a fixed namespace is exactly as
# unique as a uuid4 — it just happens to be the same one tomorrow.
#
# Run inside Blender only:
#   blender --background --python scripts/blender/build-<model>.py -- <out.ifc>

import bpy
import os
import uuid
from math import cos, radians, sin

import numpy as np
from mathutils import Matrix

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.guid
import ifcopenshell.util.element
import ifcopenshell.util.representation
import ifcopenshell.util.shape_builder
import ifcopenshell.validate

import bonsai.core.geometry
import bonsai.core.root
import bonsai.tool as tool

# RFC 4122 OID namespace — an arbitrary but fixed root for the seeded GUIDs.
GUID_NAMESPACE = uuid.UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")

# EXPRESS SETs, whose member order carries no meaning. The API builds them from
# Python sets, so two runs can emit the same relationship with its members in a
# different order — semantically identical, textually a diff. Once GUIDs and the
# timestamp are frozen, this is the only remaining source of churn.
UNORDERED_AGGREGATES = [
    ("IfcUnitAssignment", "Units"),
    ("IfcRelAggregates", "RelatedObjects"),
    ("IfcRelContainedInSpatialStructure", "RelatedElements"),
    ("IfcRelDefinesByType", "RelatedObjects"),
    ("IfcRelDefinesByProperties", "RelatedObjects"),
    ("IfcRelAssociatesMaterial", "RelatedObjects"),
    ("IfcRelAssociatesClassification", "RelatedObjects"),
    ("IfcPropertySet", "HasProperties"),
    ("IfcElementQuantity", "Quantities"),
]


# ── Reproducibility ───────────────────────────────────────────────────────────


def deterministic_guids(seed):
    """Replace ifcopenshell.guid.new() with a counter seeded from `seed`."""
    counter = {"n": 0}

    def new():
        counter["n"] += 1
        return ifcopenshell.guid.compress(uuid.uuid5(GUID_NAMESPACE, f"{seed}-{counter['n']}").hex)

    ifcopenshell.guid.new = new


def sort_unordered_aggregates(ifc):
    for ifc_class, attribute in UNORDERED_AGGREGATES:
        for entity in ifc.by_type(ifc_class):
            members = getattr(entity, attribute)
            if members:
                setattr(entity, attribute, tuple(sorted(members, key=lambda e: e.id())))


def set_header(ifc, file_name, author, organisation, timestamp):
    """The STEP header: metadata the model carries about itself.

    ISO 19650 traceability lives here (author and organisation), and two of the
    app's own rules read exactly these fields. IfcOpenShell defaults the name to
    '/dev/null' and the timestamp to now, neither of which is information.
    """
    header = ifc.header
    header.file_name.name = file_name
    header.file_name.time_stamp = timestamp
    header.file_name.author = (author,)
    header.file_name.organization = (organisation,)
    header.file_name.authorization = organisation
    # IfcOpenShell names itself here; the thing that actually authored the model
    # is Bonsai, and that is what someone reading the header wants to know.
    header.file_name.originating_system = (
        f"Bonsai {tool.Blender.get_bonsai_version()} (Blender {bpy.app.version_string})"
    )


# ── Placements ────────────────────────────────────────────────────────────────


def snap(v):
    """Round away float noise on values that are meant to be exact."""
    return round(v) if abs(v - round(v)) < 1e-12 else v


def cos_deg(degrees):
    return snap(cos(radians(degrees)))


def sin_deg(degrees):
    return snap(sin(radians(degrees)))


def offset_along(origin, rotation_z, distance):
    """A point `distance` along the +X axis of a placement rotated by `rotation_z`."""
    return (
        origin[0] + distance * cos_deg(rotation_z),
        origin[1] + distance * sin_deg(rotation_z),
        origin[2],
    )


def placement_matrix(origin, rotation_z=0.0, x_axis=None, y_axis=None):
    """A 4x4 placement in float64, with right angles that are exactly right.

    Blender stores object matrices as float32, so a placement round-tripped
    through `obj.matrix_world` comes back as 0.20000000298023224 and a quarter
    turn as (1.9470718e-07, 0.9999999999999811, 0). Both sit inside the model's
    1e-5 precision and both are noise in a file whose job is to be read by a
    human wondering what a correct placement looks like.

    Pass `rotation_z` for the common case, or an explicit `x_axis`/`y_axis` pair
    when the element is tilted out of plan — a roof plane, a stair, a section
    extruded along Y.
    """
    if x_axis is not None and y_axis is not None:
        x = np.array(x_axis, dtype=float)
        y = np.array(y_axis, dtype=float)
        x /= np.linalg.norm(x)
        y /= np.linalg.norm(y)
        z = np.cross(x, y)
    else:
        c, s = cos_deg(rotation_z), sin_deg(rotation_z)
        x, y, z = np.array([c, s, 0.0]), np.array([-s, c, 0.0]), np.array([0.0, 0.0, 1.0])

    matrix = np.eye(4)
    matrix[:3, 0], matrix[:3, 1], matrix[:3, 2] = x, y, z
    matrix[:3, 3] = origin
    return matrix


def placed_object(name, matrix, mesh=True):
    """The Blender side of an element: an empty-mesh object at the placement.

    The mesh starts empty because the representation comes from the IFC side,
    not from Blender geometry — that way profiles carry exact metres rather than
    whatever Blender's float32 vertex buffer rounds them to.

    `mesh=False` gives a Blender Empty, which is what a spatial container is:
    a storey has a placement and no geometry.
    """
    obj = bpy.data.objects.new(name, bpy.data.meshes.new(name) if mesh else None)
    # Blender's Matrix is row-major with the translation in the last column,
    # which is the same convention numpy is holding it in — no transpose.
    obj.matrix_world = Matrix([list(row) for row in matrix])
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    return obj


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# ── Project ───────────────────────────────────────────────────────────────────


def new_project(schema="IFC4"):
    """Bonsai's own New Project, which is where most of the correctness is.

    This one call writes the IfcProject, the SI unit assignment (metre, square
    metre, cubic metre), the 3D Model context at 1e-5 precision with its Body /
    Axis / Box / Annotation subcontexts, the 2D Plan context, and the
    Project → Site → Building → Storey chain with a properly nested
    IfcLocalPlacement under each. Reproducing that by hand is precisely the
    mistake these scripts exist to avoid.
    """
    # Clear the startup scene by hand. `wm.read_factory_settings` would be the
    # obvious way and is the wrong one: it also resets preferences, which
    # unregisters Bonsai mid-script and takes BIMProjectProperties with it.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.BIMProjectProperties.export_schema = schema

    bpy.ops.bim.create_project()
    return tool.Ifc.get()


def georeference(ifc, crs_name, datum, eastings, northings, height, x_abscissa, x_ordinate,
                 crs_description=None, vertical_datum=None):
    """Full IFC4 georeferencing: IfcProjectedCRS + IfcMapConversion.

    This is the top rung of the app's georeference ladder (LoGeoRef50) and the
    only one that can put a model on a map WITHOUT guessing. Rung 3 —
    IfcSite.RefLatitude/RefLongitude — locates a site but says nothing about
    which way the model is turned, so a building lands on the map facing an
    arbitrary direction and looks fine until you compare it to the street.

    `x_abscissa` / `x_ordinate` are the project's +X axis expressed in the map
    grid, which is what carries that rotation.
    """
    ifcopenshell.api.run("georeference.add_georeferencing", ifc)
    ifcopenshell.api.run(
        "georeference.edit_georeferencing", ifc,
        projected_crs={
            "Name": crs_name,
            "Description": crs_description,
            "GeodeticDatum": datum,
            "VerticalDatum": vertical_datum,
            "MapUnit": next(u for u in ifc.by_type("IfcSIUnit") if u.UnitType == "LENGTHUNIT"),
        },
        coordinate_operation={
            "Eastings": eastings,
            "Northings": northings,
            "OrthogonalHeight": height,
            "XAxisAbscissa": x_abscissa,
            "XAxisOrdinate": x_ordinate,
            "Scale": 1.0,
        },
    )


def aggregate(ifc, parts, whole):
    """Element decomposition — a curtain wall's panels, a stair's flights."""
    ifcopenshell.api.run("aggregate.assign_object", ifc, products=list(parts), relating_object=whole)


def edit(ifc, product, **attributes):
    ifcopenshell.api.run("attribute.edit_attributes", ifc, product=product, attributes=attributes)
    return product


def contexts(ifc):
    """(body, axis) — the two subcontexts these models put geometry in."""
    return (
        ifcopenshell.util.representation.get_context(ifc, "Model", "Body", "MODEL_VIEW"),
        ifcopenshell.util.representation.get_context(ifc, "Model", "Axis", "GRAPH_VIEW"),
    )


def add_storey(ifc, building, name, long_name, elevation):
    """A storey beyond the one create_project seeds, placed at its elevation.

    It goes through `root.assign_class` rather than `root.create_entity` because
    a storey created API-only has no Blender object behind it, and
    `bim.assign_container` reads the container's object to find the collection
    it should move things into. A storey nobody can put anything in is not a
    storey.
    """
    matrix = placement_matrix((0.0, 0.0, elevation))
    obj = placed_object(name, matrix, mesh=False)
    storey = bonsai.core.root.assign_class(
        tool.Ifc, tool.Collector, tool.Root,
        obj=obj, ifc_class="IfcBuildingStorey", should_add_representation=False,
    )
    edit(ifc, storey, Name=name, LongName=long_name, CompositionType="ELEMENT", Elevation=elevation)
    ifcopenshell.api.run("aggregate.assign_object", ifc, products=[storey], relating_object=building)
    ifcopenshell.api.run("geometry.edit_object_placement", ifc, product=storey, matrix=matrix)
    return storey


# ── Types, materials, classification ──────────────────────────────────────────


def add_layered_type(ifc, ifc_class, name, predefined_type, material, thickness):
    """A construction type whose material is a layer set — walls, slabs, roofs.

    The layer set lives on the TYPE; `type.assign_type` then gives every
    occurrence an IfcMaterialLayerSetUsage pointing back at it. That is the IFC4
    way to say "200 mm of masonry" once instead of once per element.
    """
    element_type = ifcopenshell.api.run(
        "root.create_entity", ifc, ifc_class=ifc_class, name=name, predefined_type=predefined_type
    )
    layer_set = ifcopenshell.api.run("material.add_material_set", ifc, name=name, set_type="IfcMaterialLayerSet")
    layer = ifcopenshell.api.run("material.add_layer", ifc, layer_set=layer_set, material=material)
    ifcopenshell.api.run(
        "material.edit_layer", ifc, layer=layer,
        attributes={"LayerThickness": thickness, "Name": material.Name},
    )
    ifcopenshell.api.run("material.assign_material", ifc, products=[element_type], material=layer_set)
    return element_type


def add_profiled_type(ifc, ifc_class, name, predefined_type, material, profile):
    """A construction type whose material is a profile set — columns, beams, …

    The profile-set analogue of a layer set, and the right answer for anything
    linear: a layer set says "this thickness is made of that", a profile set
    says "this cross-section, of that, swept along the member". `type.assign_type`
    then gives every occurrence an IfcMaterialProfileSetUsage, so the element
    itself carries its material rather than only its type — which is the
    difference between a beam a take-off can read and one it cannot.
    """
    element_type = ifcopenshell.api.run(
        "root.create_entity", ifc, ifc_class=ifc_class, name=name, predefined_type=predefined_type
    )
    profile_set = ifcopenshell.api.run(
        "material.add_material_set", ifc, name=name, set_type="IfcMaterialProfileSet"
    )
    ifcopenshell.api.run(
        "material.add_profile", ifc, profile_set=profile_set, material=material, profile=profile
    )
    ifcopenshell.api.run("material.assign_material", ifc, products=[element_type], material=profile_set)
    return element_type


def add_simple_type(ifc, ifc_class, name, predefined_type, material=None):
    """A construction type with a single material — columns, beams, doors, …

    A layer set would be a lie for a round timber pillar: layers stack across a
    thickness, and a pillar does not have one. IfcMaterial is the honest answer,
    and it is what satisfies "every element knows what it is made of".

    `material=None` is for types that are not made of anything: IfcRelAssociates-
    Material's AllowedElements rule rejects IfcSpaceType outright, and rightly
    so — a room is the absence of material.
    """
    element_type = ifcopenshell.api.run(
        "root.create_entity", ifc, ifc_class=ifc_class, name=name, predefined_type=predefined_type
    )
    if material is not None:
        ifcopenshell.api.run("material.assign_material", ifc, products=[element_type], material=material)
    return element_type


def classify(ifc, classification, products, identification, name):
    """One IfcClassificationReference, assigned to a set of products."""
    return ifcopenshell.api.run(
        "classification.add_reference", ifc,
        products=list(products), classification=classification,
        identification=identification, name=name,
    )


# ── Occurrences ───────────────────────────────────────────────────────────────


def add_occurrence(ifc, obj, matrix, ifc_class, element_type, name, description, storey=None,
                   predefined_type=None):
    """Blender object → placed, typed, contained occurrence — minus geometry.

    The order matters: create the product, give it its type (so the material
    usage exists before anything asks how thick the element is), put it in its
    container, and only then write the placement. Container first is not
    cosmetic — `edit_object_placement` writes an IfcLocalPlacement RELATIVE to
    whatever the element is nested under, so on a building with storeys at
    different elevations, placing before containing puts every element on the
    wrong floor by exactly the storey height.

    The matrix is always in world coordinates; the API does the subtraction.

    PredefinedType and ObjectType are normally left to the type object:
    `type.assign_type` strips both from the occurrence so the two can never
    disagree (IfcOpenShell #7006). Pass `predefined_type` only for elements with
    no type object of their own, like openings.
    """
    element = bonsai.core.root.assign_class(
        tool.Ifc, tool.Collector, tool.Root,
        obj=obj, ifc_class=ifc_class, predefined_type=predefined_type,
        should_add_representation=False,
    )
    if element_type is not None:
        ifcopenshell.api.run("type.assign_type", ifc, related_objects=[element], relating_type=element_type)
    edit(ifc, element, Name=name, Description=description)

    if storey is not None:
        select_only(obj)
        bpy.ops.bim.assign_container(container=storey.id())
    ifcopenshell.api.run("geometry.edit_object_placement", ifc, product=element, matrix=matrix)
    return element


def attach(ifc, obj, element, representation):
    ifcopenshell.api.run("geometry.assign_representation", ifc, product=element, representation=representation)
    bonsai.core.geometry.switch_representation(tool.Ifc, tool.Geometry, obj=obj, representation=representation)


def extruded(ifc, body, points, depth, name=None):
    """An IfcShapeRepresentation holding one IfcExtrudedAreaSolid.

    `points` is a closed 2D outline in the element's own XY plane and `depth`
    the extrusion along its +Z. Everything in these models that is not a wall or
    a slab is built this way: a profile plus a depth stays measurable, where a
    tessellated face set is a bag of triangles nobody can take off.
    """
    builder = ifcopenshell.util.shape_builder.ShapeBuilder(ifc)
    profile = builder.profile(builder.polyline(points, closed=True), name=name)
    return builder.get_representation(body, [builder.extrude(profile, magnitude=depth)])


def circular(ifc, body, radius, depth, name=None):
    """The same, for a round profile — a timber pillar rather than a post."""
    builder = ifcopenshell.util.shape_builder.ShapeBuilder(ifc)
    profile = ifc.create_entity("IfcCircleProfileDef", ProfileType="AREA", ProfileName=name, Radius=radius)
    return builder.get_representation(body, [builder.extrude(profile, magnitude=depth)])


def add_pset(ifc, element, name, properties):
    pset = ifcopenshell.api.run("pset.add_pset", ifc, product=element, name=name)
    ifcopenshell.api.run("pset.edit_pset", ifc, pset=pset, properties=properties)
    return pset


def add_qto(ifc, element, name, quantities):
    qto = ifcopenshell.api.run("pset.add_qto", ifc, product=element, name=name)
    ifcopenshell.api.run("pset.edit_qto", ifc, qto=qto, properties=quantities)
    return qto


def add_opening(ifc, body, host, name, matrix, points, depth):
    """A real IfcOpeningElement that voids its host, rather than a hole drawn in.

    Cutting the hole into the wall profile would render identically and lose
    every question worth asking of it: how wide is this opening, what fills it,
    does it move when the door moves. `feature.add_feature` writes the
    IfcRelVoidsElement that carries all three.

    An opening is never contained in a storey: it belongs to its host, and the
    void relationship is what puts it in the tree.
    """
    obj = placed_object(name, matrix)
    opening = add_occurrence(
        ifc, obj, matrix, "IfcOpeningElement", None, name, None, predefined_type="OPENING",
    )
    attach(ifc, obj, opening, extruded(ifc, body, points, depth))
    ifcopenshell.api.run("feature.add_feature", ifc, feature=opening, element=host)
    return opening


def fill_opening(ifc, opening, element):
    ifcopenshell.api.run("feature.add_filling", ifc, opening=opening, element=element)


# ── Verification ──────────────────────────────────────────────────────────────


def verify(output_path, expected_origins, schema="IFC4", require_all=True):
    """Open what was just written, in Bonsai, and refuse to ship it if it lies.

    Two different questions, and the build fails on either. `validate` with
    express_rules is the schema's own opinion: attribute types, cardinalities,
    WHERE rules. Reloading through `bim.load_project` catches what the schema
    cannot — an element whose representation resolves to no geometry is
    perfectly valid IFC and completely useless as a demo, and it is exactly what
    the first version of build-hello-world.py produced.
    """
    bpy.ops.bim.load_project(filepath=output_path)
    ifc = tool.Ifc.get()

    if ifc.schema != schema:
        raise SystemExit(f"expected {schema}, got {ifc.schema}")

    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(ifc, logger, express_rules=True)
    if logger.statements:
        for statement in logger.statements[:20]:
            print(f"    x {statement}")
        raise SystemExit(f"{len(logger.statements)} schema violations in {output_path}")

    seen = set()
    for obj in bpy.data.objects:
        element = tool.Ifc.get_entity(obj)
        if element is None or element.Name not in expected_origins:
            continue
        seen.add(element.Name)
        if not obj.data or not len(obj.data.vertices):
            raise SystemExit(f"{element.Name} loaded with no geometry")
        for axis, (got, want) in enumerate(zip(obj.matrix_world.translation, expected_origins[element.Name])):
            if abs(got - want) > 1e-4:
                raise SystemExit(f"{element.Name} is at {got} on axis {axis}, expected {want}")

    missing = set(expected_origins) - seen
    # A federated set shares one table of spot-checks, and no single discipline
    # file contains all of them — hence require_all.
    if missing and require_all:
        raise SystemExit(f"did not load back: {', '.join(sorted(missing))}")
    if not seen:
        raise SystemExit(f"none of the expected elements are in {output_path}")
    return ifc


def report(ifc, output_path):
    counts = {}
    for entity in ifc:
        if entity.is_a("IfcElement") or entity.is_a("IfcSpatialStructureElement"):
            counts[entity.is_a()] = counts.get(entity.is_a(), 0) + 1
    breakdown = ", ".join(f"{n} {k[3:]}" for k, n in sorted(counts.items(), key=lambda kv: -kv[1]))
    print(
        f"\n  OK {os.path.basename(output_path)} - {ifc.schema}, {len(list(ifc))} entities, "
        f"{os.path.getsize(output_path) / 1024:.1f} KB"
        f"\n     {breakdown}"
        f"\n     schema valid, reloads in Bonsai with geometry"
        f"\n     -> {output_path}\n"
    )


def output_path_from_argv(argv, default):
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    return os.path.abspath(args[0] if args else default)


def write(ifc, output_path):
    sort_unordered_aggregates(ifc)
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    ifc.write(output_path)
