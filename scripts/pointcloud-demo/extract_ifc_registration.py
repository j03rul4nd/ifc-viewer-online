"""Extract a registration surface from the CRAS IFC with IfcOpenShell.

Run with Blender's Python so the exact IfcOpenShell build bundled with Bonsai is
used.  The IFC itself is never rewritten.  Only products useful for geometric
registration are triangulated in world coordinates.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.unit
import numpy as np
import open3d as o3d


REGISTRATION_TYPES = (
    "IfcWall",
    "IfcSlab",
    "IfcCovering",
    "IfcColumn",
    "IfcBeam",
    "IfcDoor",
    "IfcWindow",
    "IfcStair",
    "IfcStairFlight",
    "IfcRamp",
    "IfcRampFlight",
    "IfcRoof",
)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ifc", type=Path, default=Path("demo/raw/model-original.ifc"))
    parser.add_argument("--output-dir", type=Path, default=Path("demo/processed"))
    parser.add_argument("--sample-points", type=int, default=750_000)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else None
    return parser.parse_args(argv)


def main() -> None:
    args = arguments()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    model = ifcopenshell.open(args.ifc.as_posix())
    unit_scale = float(ifcopenshell.util.unit.calculate_unit_scale(model))

    products_by_id: dict[int, object] = {}
    type_counts: Counter[str] = Counter()
    for ifc_type in REGISTRATION_TYPES:
        for product in model.by_type(ifc_type):
            if getattr(product, "Representation", None) is None:
                continue
            if product.id() in products_by_id:
                continue
            products_by_id[product.id()] = product
            type_counts[product.is_a()] += 1
    products = list(products_by_id.values())
    if not products:
        raise RuntimeError("The IFC contains no registration products with geometry")

    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    settings.set("weld-vertices", True)
    settings.set("apply-default-materials", True)
    iterator = ifcopenshell.geom.iterator(
        settings,
        model,
        max(1, min(os.cpu_count() or 1, 8)),
        include=products,
    )
    if not iterator.initialize():
        raise RuntimeError("IfcOpenShell geometry iterator could not initialize")

    vertex_parts: list[np.ndarray] = []
    triangle_parts: list[np.ndarray] = []
    shape_count = 0
    vertex_offset = 0
    while True:
        shape = iterator.get()
        verts = np.asarray(shape.geometry.verts, dtype=np.float64).reshape((-1, 3))
        faces = np.asarray(shape.geometry.faces, dtype=np.int64).reshape((-1, 3))
        if verts.size and faces.size:
            vertex_parts.append(verts)
            triangle_parts.append(faces + vertex_offset)
            vertex_offset += verts.shape[0]
            shape_count += 1
        if not iterator.next():
            break

    if not vertex_parts:
        raise RuntimeError("IfcOpenShell produced no registration triangles")

    vertices = np.concatenate(vertex_parts, axis=0)
    triangles = np.concatenate(triangle_parts, axis=0)
    mesh = o3d.geometry.TriangleMesh(
        o3d.utility.Vector3dVector(vertices),
        o3d.utility.Vector3iVector(triangles),
    )
    mesh.remove_duplicated_vertices()
    mesh.remove_degenerate_triangles()
    mesh.remove_unreferenced_vertices()
    mesh.compute_vertex_normals()

    mesh_path = args.output_dir / "ifc-registration-mesh.ply"
    sample_path = args.output_dir / "ifc-registration-surface.ply"
    if not o3d.io.write_triangle_mesh(mesh_path.as_posix(), mesh, write_ascii=False):
        raise RuntimeError(f"Could not write {mesh_path}")
    surface = mesh.sample_points_uniformly(number_of_points=args.sample_points, use_triangle_normal=True)
    surface.paint_uniform_color([0.30, 0.62, 0.95])
    if not o3d.io.write_point_cloud(sample_path.as_posix(), surface, write_ascii=False, compressed=False):
        raise RuntimeError(f"Could not write {sample_path}")

    bounds_min = mesh.get_min_bound()
    bounds_max = mesh.get_max_bound()
    projects = model.by_type("IfcProject")
    sites = model.by_type("IfcSite")
    buildings = model.by_type("IfcBuilding")
    stats = {
        "source": args.ifc.as_posix(),
        "schema": model.schema,
        "unitScaleToMetres": unit_scale,
        "project": getattr(projects[0], "Name", None) if projects else None,
        "site": getattr(sites[0], "Name", None) if sites else None,
        "building": getattr(buildings[0], "Name", None) if buildings else None,
        "registrationTypes": dict(sorted(type_counts.items())),
        "shapeCount": shape_count,
        "meshVertexCount": len(mesh.vertices),
        "meshTriangleCount": len(mesh.triangles),
        "surfaceSampleCount": len(surface.points),
        "bounds": {
            "min": bounds_min.tolist(),
            "max": bounds_max.tolist(),
            "extent": (bounds_max - bounds_min).tolist(),
        },
        "worldCoordinates": True,
        "ifcModified": False,
    }
    stats_path = args.output_dir / "ifc-stats.json"
    stats_path.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(stats, indent=2), flush=True)


if __name__ == "__main__":
    main()
