#!/usr/bin/env python3
"""Extract the building footprints OpenStreetMap has not mapped yet.

WHY THIS IS A BUILD STEP AND NOT A FETCH
========================================
Overture Maps publishes the planet's buildings as GeoParquet on public S3 — free,
no key, no account. Getting the 714 buildings of one Shanghai bbox took DuckDB
140 seconds of columnar scanning. No browser is doing that while somebody waits,
so the districts we care about are extracted once, here, and shipped as a small
JSON file the viewer loads beside its Overpass query.

WHAT IS FILTERED HERE, AND WHAT IS NOT
======================================
Overture publishes each building's provenance, and this script keeps only the
rows it does NOT attribute to OpenStreetMap — those we already have, and better,
because they are hand-mapped and carry tags.

That filter is necessary and *not sufficient*. Measured over the Lujiazui core
bbox: of 308 ML-sourced rows, **47 (15%) land on an OSM building anyway**,
because Overture kept both where its own matcher failed to pair them. So a
second, geometric pass is required — and it deliberately lives at RUNTIME in
`src/lib/geo/overture-footprints.ts`, not here. OSM grows; a de-duplication
baked in at build time goes stale against exactly the data it complements.

HEIGHTS ARE NOT TAKEN
=====================
Overture's China heights are OSM-derived, so its ML footprints carry almost
none: 7 of 287 in the core bbox. Reading a height here would import a guess we
cannot inspect. These buildings arrive with no height and are given the
district's own measured median by the local height prior, flagged estimated.

Usage:
    pip install duckdb
    python scripts/overture-footprints.py

Writes public/geo/overture/<slug>.json for each district below.
"""

from __future__ import annotations

import io
import json
import math
import os
import sys
import time

# Overture release to pin. Bumping this is a deliberate act: a new release can
# add, move or withdraw footprints, and the extract should change when somebody
# decided it should, not because a build ran on a Tuesday.
RELEASE = "2026-08-19.0"

S3 = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type=building/*.parquet"

ATTRIBUTION = "© Overture Maps Foundation"

# Half-size of each extract, metres. Matches BUILDINGS_HALF_SIZE_M in
# geo-system so the extract covers exactly what the Overpass query does —
# a larger one ships bytes nobody draws, a smaller one leaves a visible edge
# where the extra buildings stop and OSM's carry on.
HALF_SIZE_M = 700

DISTRICTS = [
    # slug,            lat,        lon,        label
    ("lujiazui",       31.2397,   121.4998,   "Lujiazui, Pudong"),
    ("poblenou",       41.4064,     2.1900,   "Poblenou, Barcelona"),
    ("barceloneta",    41.3687,     2.1900,   "Barceloneta / Port Vell"),
]

OUT_DIR = os.path.join("public", "geo", "overture")


def bbox_around(lat: float, lon: float, half_m: float):
    d_lat = half_m / 111_132.0
    d_lon = half_m / (111_320.0 * math.cos(math.radians(lat)))
    return (lon - d_lon, lat - d_lat, lon + d_lon, lat + d_lat)


def extract(con, slug: str, lat: float, lon: float, label: str) -> dict:
    west, south, east, north = bbox_around(lat, lon, HALF_SIZE_M)
    t0 = time.time()
    rows = con.execute(
        f"""
        SELECT id, ST_AsGeoJSON(geometry) AS gj, sources[1].dataset AS src
        FROM read_parquet('{S3}')
        WHERE bbox.xmin > {west} AND bbox.xmax < {east}
          AND bbox.ymin > {south} AND bbox.ymax < {north}
        """
    ).fetchall()
    took = time.time() - t0

    kept, from_osm, unusable = [], 0, 0
    for bid, gj, src in rows:
        # The provenance filter. OSM-sourced rows are ones we already fetch, and
        # hand-mapped with tags, so ours are strictly better.
        if src == "OpenStreetMap":
            from_osm += 1
            continue
        try:
            geom = json.loads(gj)
        except Exception:
            unusable += 1
            continue
        # Outer ring only. A courtyard is a hole we cannot express in the
        # viewer's footprint model, and filling it is better than dropping the
        # building — but taking an INNER ring as a building would draw the void.
        coords = None
        if geom.get("type") == "Polygon":
            coords = geom["coordinates"][0]
        elif geom.get("type") == "MultiPolygon" and geom["coordinates"]:
            coords = max(geom["coordinates"], key=lambda p: len(p[0]))[0]
        if not coords or len(coords) < 4:
            unusable += 1
            continue
        # GeoJSON closes its rings; the viewer's model does not.
        ring = [{"lat": round(c[1], 7), "lon": round(c[0], 7)} for c in coords[:-1]]
        kept.append({"id": str(bid), "ring": ring})

    print(
        f"  {slug:14s} {len(rows):5d} rows in {took:5.0f}s"
        f"  ->  {from_osm:4d} already OSM, {unusable:3d} unusable, {len(kept):4d} shipped"
    )
    return {
        "release": RELEASE,
        "attribution": ATTRIBUTION,
        "label": label,
        "bbox": [round(west, 6), round(south, 6), round(east, 6), round(north, 6)],
        "footprints": kept,
    }


def main() -> int:
    try:
        import duckdb  # noqa: PLC0415
    except ImportError:
        print("duckdb is required:  pip install duckdb", file=sys.stderr)
        return 1

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    con.execute("INSTALL spatial; LOAD spatial;")

    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Overture release {RELEASE}, {HALF_SIZE_M} m half-size\n")
    index = []
    for slug, lat, lon, label in DISTRICTS:
        data = extract(con, slug, lat, lon, label)
        path = os.path.join(OUT_DIR, f"{slug}.json")
        with io.open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, separators=(",", ":"))
        print(f"  {'':14s} wrote {path}  ({os.path.getsize(path) / 1024:.0f} KB)")
        index.append(
            {"slug": slug, "label": label, "bbox": data["bbox"],
             "count": len(data["footprints"])}
        )

    # An index, so the viewer asks one small question — "is there an extract for
    # where this model stands?" — before deciding to download a district.
    # Without it every site would have to guess a slug, and a 404 on every load
    # is a worse answer than a 1 KB list.
    index_path = os.path.join(OUT_DIR, "index.json")
    with io.open(index_path, "w", encoding="utf-8") as fh:
        json.dump(
            {"release": RELEASE, "attribution": ATTRIBUTION, "districts": index},
            fh, separators=(",", ":"),
        )
    print("")
    print(f"  wrote {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
