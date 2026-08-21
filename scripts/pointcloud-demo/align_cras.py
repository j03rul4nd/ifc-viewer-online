"""Rigidly register the CRAS point cloud to its corresponding IFC.

The published dataset states that the two files use different local frames but
does not publish a matrix.  This script therefore estimates a rigid transform
(scale is locked to 1), refines it with multi-scale point-to-plane ICP, measures
point-to-nearest-triangle distances, and writes the explicit result.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import time
from pathlib import Path

import numpy as np
import open3d as o3d


PLY_DTYPE = np.dtype(
    [
        ("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
        ("red", "u1"), ("green", "u1"), ("blue", "u1"),
        ("intensity", "u1"), ("classification", "u1"),
    ]
)
STRUCTURAL_CLASSES = {1, 2, 3, 4, 5, 27}
CLASS_NAMES = {1: "ceiling", 2: "floor", 3: "wall", 4: "door", 5: "window", 27: "stairs"}


def arguments() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quality", type=Path, default=Path("demo/processed/pointcloud-clean.ply"))
    p.add_argument("--web", type=Path, default=Path("demo/processed/pointcloud-web.ply"))
    p.add_argument("--ifc-surface", type=Path, default=Path("demo/processed/ifc-registration-surface.ply"))
    p.add_argument("--ifc-mesh", type=Path, default=Path("demo/processed/ifc-registration-mesh.ply"))
    p.add_argument("--output-dir", type=Path, default=Path("demo"))
    p.add_argument("--yaw-step", type=float, default=10.0)
    return p.parse_args()


def read_cras_ply(path: Path) -> tuple[bytes, np.ndarray]:
    with path.open("rb") as stream:
        header = bytearray()
        count = None
        while True:
            line = stream.readline()
            if not line:
                raise RuntimeError(f"Missing PLY end_header in {path}")
            header.extend(line)
            decoded = line.decode("ascii").strip()
            if decoded.startswith("element vertex "):
                count = int(decoded.rsplit(" ", 1)[-1])
            if decoded == "end_header":
                break
        if count is None:
            raise RuntimeError(f"Missing PLY vertex count in {path}")
        rows = np.fromfile(stream, dtype=PLY_DTYPE, count=count)
    if rows.shape[0] != count:
        raise RuntimeError(f"Read {rows.shape[0]} records from {path}; expected {count}")
    return bytes(header), rows


def point_cloud(points: np.ndarray) -> o3d.geometry.PointCloud:
    cloud = o3d.geometry.PointCloud()
    cloud.points = o3d.utility.Vector3dVector(points.astype(np.float64, copy=False))
    return cloud


def structural_points(rows: np.ndarray) -> np.ndarray:
    labels = rows["classification"]
    mask = np.zeros(labels.shape[0], dtype=bool)
    for label in STRUCTURAL_CLASSES:
        mask |= labels == label
    return np.column_stack((rows["x"][mask], rows["y"][mask], rows["z"][mask])).astype(np.float64)


def initial_matrix(source_center: np.ndarray, target_center: np.ndarray, yaw_deg: float) -> np.ndarray:
    angle = math.radians(yaw_deg)
    c, s = math.cos(angle), math.sin(angle)
    matrix = np.eye(4)
    matrix[:3, :3] = [[c, -s, 0], [s, c, 0], [0, 0, 1]]
    matrix[:3, 3] = target_center - matrix[:3, :3] @ source_center
    return matrix


def downsample_with_normals(cloud: o3d.geometry.PointCloud, voxel: float) -> o3d.geometry.PointCloud:
    result = cloud.voxel_down_sample(voxel)
    result.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel * 3, max_nn=40))
    return result


def choose_initial(source: o3d.geometry.PointCloud, target: o3d.geometry.PointCloud, yaw_step: float) -> dict:
    voxel = 0.18
    src = source.voxel_down_sample(voxel)
    dst = target.voxel_down_sample(voxel)
    source_center = src.get_axis_aligned_bounding_box().get_center()
    target_center = dst.get_axis_aligned_bounding_box().get_center()
    estimator = o3d.pipelines.registration.TransformationEstimationPointToPoint(False)
    criteria = o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=18)
    trials = []
    for yaw in np.arange(0.0, 360.0, yaw_step):
        init = initial_matrix(source_center, target_center, float(yaw))
        result = o3d.pipelines.registration.registration_icp(
            src, dst, 1.20, init, estimator, criteria
        )
        score = float(result.fitness) / (float(result.inlier_rmse) + 0.05)
        trials.append(
            {
                "yawDeg": float(yaw),
                "fitness": float(result.fitness),
                "inlierRmseM": float(result.inlier_rmse),
                "score": score,
                "matrix": np.asarray(result.transformation),
            }
        )
    return max(trials, key=lambda item: item["score"])


def refine(source: o3d.geometry.PointCloud, target: o3d.geometry.PointCloud, transform: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    stages = [(0.20, 0.70, 45), (0.10, 0.35, 55), (0.05, 0.16, 70), (0.025, 0.08, 80)]
    reports: list[dict] = []
    current = transform.copy()
    for voxel, threshold, iterations in stages:
        src = downsample_with_normals(source, voxel)
        dst = downsample_with_normals(target, voxel)
        result = o3d.pipelines.registration.registration_icp(
            src,
            dst,
            threshold,
            current,
            o3d.pipelines.registration.TransformationEstimationPointToPlane(),
            o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=iterations),
        )
        current = np.asarray(result.transformation)
        reports.append(
            {
                "voxelM": voxel,
                "maxCorrespondenceDistanceM": threshold,
                "fitness": float(result.fitness),
                "inlierRmseM": float(result.inlier_rmse),
            }
        )
    return current, reports


def transform_points(points: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    return points @ matrix[:3, :3].T + matrix[:3, 3]


def distance_stats(distances: np.ndarray) -> dict:
    return {
        "count": int(distances.size),
        "meanM": float(np.mean(distances)),
        "rmseM": float(np.sqrt(np.mean(np.square(distances)))),
        "medianM": float(np.median(distances)),
        "p90M": float(np.percentile(distances, 90)),
        "p95M": float(np.percentile(distances, 95)),
        "p99M": float(np.percentile(distances, 99)),
        "within2cmPct": float(np.mean(distances <= 0.02) * 100),
        "within5cmPct": float(np.mean(distances <= 0.05) * 100),
        "within10cmPct": float(np.mean(distances <= 0.10) * 100),
        "within20cmPct": float(np.mean(distances <= 0.20) * 100),
    }


def triangle_distances(mesh: o3d.geometry.TriangleMesh, points: np.ndarray, block: int = 250_000) -> np.ndarray:
    tensor_mesh = o3d.t.geometry.TriangleMesh.from_legacy(mesh)
    scene = o3d.t.geometry.RaycastingScene()
    scene.add_triangles(tensor_mesh)
    out = np.empty(points.shape[0], dtype=np.float32)
    for start in range(0, points.shape[0], block):
        stop = min(points.shape[0], start + block)
        query = o3d.core.Tensor(points[start:stop].astype(np.float32), dtype=o3d.core.Dtype.Float32)
        out[start:stop] = scene.compute_distance(query).numpy()
    return out


def euler_xyz_degrees(rotation: np.ndarray) -> list[float]:
    # R = Rz @ Ry @ Rx, reported as intrinsic XYZ angles.
    sy = math.hypot(rotation[0, 0], rotation[1, 0])
    if sy > 1e-9:
        x = math.atan2(rotation[2, 1], rotation[2, 2])
        y = math.atan2(-rotation[2, 0], sy)
        z = math.atan2(rotation[1, 0], rotation[0, 0])
    else:
        x = math.atan2(-rotation[1, 2], rotation[1, 1])
        y = math.atan2(-rotation[2, 0], sy)
        z = 0.0
    return [math.degrees(x), math.degrees(y), math.degrees(z)]


def replace_header_count(header: bytes, count: int) -> bytes:
    lines = header.decode("ascii").splitlines(keepends=True)
    return "".join(
        f"element vertex {count:012d}\n" if line.startswith("element vertex ") else line
        for line in lines
    ).encode("ascii")


def write_rows(path: Path, header: bytes, rows: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as stream:
        stream.write(replace_header_count(header, rows.shape[0]))
        stream.write(rows.tobytes())


def deviation_colours(distances: np.ndarray) -> np.ndarray:
    # Green <=2 cm, yellow <=5 cm, orange <=10 cm, red >10 cm.
    colours = np.empty((distances.size, 3), dtype=np.uint8)
    colours[:] = [220, 55, 47]
    colours[distances <= 0.10] = [243, 132, 31]
    colours[distances <= 0.05] = [245, 196, 66]
    colours[distances <= 0.02] = [48, 164, 108]
    return colours


def main() -> None:
    args = arguments()
    started = time.monotonic()
    quality_header, quality_rows = read_cras_ply(args.quality)
    source_backup = args.web.with_name("pointcloud-web-source.ply")
    web_source = source_backup if source_backup.exists() else args.web
    web_header, web_rows = read_cras_ply(web_source)
    structural = structural_points(quality_rows)
    source = point_cloud(structural)
    target = o3d.io.read_point_cloud(args.ifc_surface.as_posix())
    if len(target.points) == 0:
        raise RuntimeError("IFC registration surface is empty")

    coarse = choose_initial(source, target, args.yaw_step)
    matrix, stages = refine(source, target, coarse["matrix"])
    rotation = matrix[:3, :3]
    orthogonality_error = float(np.linalg.norm(rotation.T @ rotation - np.eye(3)))
    determinant = float(np.linalg.det(rotation))
    if abs(determinant - 1.0) > 1e-4 or orthogonality_error > 1e-4:
        raise RuntimeError("Registration returned a non-rigid transform")

    mesh = o3d.io.read_triangle_mesh(args.ifc_mesh.as_posix())
    aligned_structural = transform_points(structural, matrix)
    structural_distances = triangle_distances(mesh, aligned_structural)
    overall_stats = distance_stats(structural_distances)

    labels = quality_rows["classification"]
    per_class = {}
    cursor = 0
    for label in sorted(STRUCTURAL_CLASSES):
        count = int(np.count_nonzero(labels == label))
        # structural_points preserves input order, not class blocks; calculate
        # each class independently for unambiguous validation statistics.
        points_for_class = np.column_stack(
            (quality_rows["x"][labels == label], quality_rows["y"][labels == label], quality_rows["z"][labels == label])
        )
        distances = triangle_distances(mesh, transform_points(points_for_class, matrix))
        per_class[str(label)] = {"name": CLASS_NAMES[label], **distance_stats(distances)}
        cursor += count

    if not source_backup.exists():
        shutil.copy2(args.web, source_backup)
    aligned_web_points = transform_points(
        np.column_stack((web_rows["x"], web_rows["y"], web_rows["z"])).astype(np.float64), matrix
    )
    aligned_web = web_rows.copy()
    aligned_web["x"], aligned_web["y"], aligned_web["z"] = aligned_web_points.T.astype(np.float32)
    write_rows(args.web, web_header, aligned_web)

    web_distances = triangle_distances(mesh, aligned_web_points)
    deviation_rows = aligned_web.copy()
    colours = deviation_colours(web_distances)
    deviation_rows["red"], deviation_rows["green"], deviation_rows["blue"] = colours.T
    deviation_path = args.web.with_name("pointcloud-deviation-web.ply")
    write_rows(deviation_path, web_header, deviation_rows)

    result = {
        "pointCloudToIfc": {
            "translation": matrix[:3, 3].tolist(),
            "rotationEulerXYZDegrees": euler_xyz_degrees(rotation),
            "scale": 1.0,
            "matrix4x4RowMajor": matrix.tolist(),
        },
        "frames": {
            "source": "CRAS point-cloud local coordinates, metres, Z-up",
            "target": "IFC world/project coordinates, metres, Z-up",
            "web": "pointcloud-web.ply has this transform baked into its positions",
        },
        "registration": {
            "method": "yaw sweep + rigid point-to-point ICP + multi-scale point-to-plane ICP",
            "scaleLocked": True,
            "structuralClasses": sorted(STRUCTURAL_CLASSES),
            "coarse": {key: value for key, value in coarse.items() if key != "matrix"},
            "refinementStages": stages,
            "rotationDeterminant": determinant,
            "rotationOrthogonalityError": orthogonality_error,
        },
        "validation": {
            "metric": "Euclidean point-to-nearest IFC triangle surface distance",
            "qualityStructuralSample": overall_stats,
            "perSemanticClass": per_class,
            "webSample": distance_stats(web_distances),
            "interpretation": (
                "Distances include real as-built/model differences, occlusion, clutter labels, "
                "IFC modelling abstractions and residual registration error; they are not survey accuracy."
            ),
        },
        "outputs": {
            "alignedWebPointCloud": args.web.as_posix(),
            "sourceFrameWebPointCloud": source_backup.as_posix(),
            "deviationHeatmapPointCloud": deviation_path.as_posix(),
        },
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    transformation_path = args.output_dir / "transformation.json"
    transformation_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
