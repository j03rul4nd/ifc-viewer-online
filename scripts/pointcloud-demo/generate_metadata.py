"""Generate the CRAS demo manifest from measured pipeline outputs."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "demo"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def measured_file(relative: str, role: str, include_sha256: bool = True) -> dict:
    path = ROOT / relative
    result = {"path": relative.replace("\\", "/"), "role": role, "sizeBytes": path.stat().st_size}
    if include_sha256:
        result["sha256"] = sha256(path)
    return result


def aligned_ply_bounds(path: Path) -> dict:
    dtype = np.dtype(
        [("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("red", "u1"),
         ("green", "u1"), ("blue", "u1"), ("intensity", "u1"), ("classification", "u1")]
    )
    with path.open("rb") as stream:
        count = None
        while True:
            line = stream.readline().decode("ascii").strip()
            if line.startswith("element vertex "):
                count = int(line.rsplit(" ", 1)[-1])
            if line == "end_header":
                break
        rows = np.fromfile(stream, dtype=dtype, count=count)
    xyz = np.column_stack((rows["x"], rows["y"], rows["z"]))
    low, high = xyz.min(axis=0), xyz.max(axis=0)
    return {"min": low.tolist(), "max": high.tolist(), "extent": (high - low).tolist()}


def main() -> None:
    processing = json.loads((DEMO / "processed/processing-stats.json").read_text(encoding="utf-8"))
    ifc = json.loads((DEMO / "processed/ifc-stats.json").read_text(encoding="utf-8"))
    transform = json.loads((DEMO / "transformation.json").read_text(encoding="utf-8"))
    blender = json.loads((DEMO / "blender/build-report.json").read_text(encoding="utf-8"))

    metadata = {
        "dataset": {
            "name": "Indoor point cloud dataset for BIM related applications",
            "shortName": "CRAS Labs @ FEUP",
            "version": "v1",
            "published": "2023-05-18",
            "doi": "10.5281/zenodo.7948116",
            "descriptorDoi": "10.3390/data8060101",
            "authors": ["Nuno Abreu", "Rayssa Souza", "Andry Pinto", "Anibal Matos", "Miguel Pires"],
            "buildingType": "Electrical and computer engineering laboratories, workshop, offices and hallway",
            "location": "Faculty of Engineering, University of Porto, Portugal",
            "realBuilding": True,
            "pairTier": "A",
            "license": "CC BY 4.0",
            "commercialDemoAllowed": True,
            "attributionRequired": True,
        },
        "acquisition": {
            "method": "Terrestrial laser scanning",
            "scanner": "Leica BLK360 G2",
            "scanCount": 21,
            "date": "2023-03",
            "declaredResolution": "5 mm at 10 m",
            "registrationSoftware": "Leica Cyclone Register 360",
            "declaredMeanRegistrationErrorM": 0.003,
        },
        "pointCloud": {
            "originalFormat": "ZIP containing tab-delimited ASCII",
            "originalPointCount": processing["source"]["pointCount"],
            "originalUncompressedBytes": 26_752_658_348,
            "columns": processing["source"]["columns"],
            "units": "metres",
            "upAxis": "Z",
            "crs": None,
            "semanticClasses": 34,
            "qualityOutput": processing["outputs"][0],
            "webSourceOutput": {
                **processing["outputs"][1],
                "path": "demo/processed/pointcloud-web-source.ply",
                "frame": "CRAS source local frame",
            },
            "webOutput": {
                **processing["outputs"][1],
                "path": "demo/processed/pointcloud-web.ply",
                "frame": "IFC project local frame",
                "bounds": aligned_ply_bounds(DEMO / "processed/pointcloud-web.ply"),
            },
        },
        "ifc": {
            "schema": ifc["schema"],
            "unitScaleToMetres": ifc["unitScaleToMetres"],
            "crs": None,
            "worldBounds": ifc["bounds"],
            "registrationGeometry": {
                "types": ifc["registrationTypes"],
                "shapeCount": ifc["shapeCount"],
                "triangleCount": ifc["meshTriangleCount"],
            },
            "modified": False,
        },
        "alignment": {
            "sourceFrame": transform["frames"]["source"],
            "targetFrame": transform["frames"]["target"],
            "method": transform["registration"]["method"],
            "scaleLocked": transform["registration"]["scaleLocked"],
            "pointCloudToIfc": transform["pointCloudToIfc"],
            "validation": transform["validation"],
        },
        "blender": {
            "version": "4.5.12 LTS",
            "ifcImporter": blender["ifcImportMethod"],
            "bonsaiImportSucceeded": blender["bonsaiImportSucceeded"],
            "collections": blender["collections"],
            "ifcMeshObjectCount": blender["ifcMeshObjectCount"],
            "pointCloudVertices": blender["pointCloudVertices"],
        },
        "processing": {
            "qualitySampling": "Deterministic systematic stride 117 (4,997,453 points)",
            "webSampling": "Deterministic systematic stride 585 (999,491 points)",
            "outlierRemoval": "None; source authors already removed unwanted scan noise",
            "attributesRetained": processing["sampling"]["attributesRetained"],
            "intensityConversion": "0-1 source values mapped linearly to uint8 0-255",
            "webCoordinates": "Rigid pointCloudToIfc transform baked into XYZ",
            "deviationBandsM": [0.02, 0.05, 0.10],
        },
        "files": [
            {
                **measured_file("demo/raw/pointcloud-original.zip", "unaltered original point cloud", False),
                "md5": "e5ecedab8f2a1d1f91861a3aec028a72",
                "md5Verified": True,
            },
            {
                **measured_file("demo/raw/model-original.ifc", "unaltered original IFC", False),
                "md5": "e20658f0d2d9e13c62363169b7fa3193",
                "md5Verified": True,
            },
            measured_file("demo/processed/pointcloud-clean.ply", "quality source-frame sample"),
            measured_file("demo/processed/pointcloud-web-source.ply", "web sample before alignment"),
            measured_file("demo/processed/pointcloud-web.ply", "web sample aligned to IFC"),
            measured_file("demo/processed/pointcloud-deviation-web.ply", "aligned web deviation heatmap"),
            measured_file("demo/processed/model.ifc", "unaltered IFC web copy"),
            measured_file("demo/blender/alignment.blend", "Bonsai validation scene"),
        ],
        "generatedOn": "2026-08-20",
    }
    (DEMO / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2), flush=True)


if __name__ == "__main__":
    main()
