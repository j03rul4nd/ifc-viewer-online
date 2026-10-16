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

ATTRIBUTES, WITH THEIR SOURCE
============================
Overture says WHICH dataset supplied each property (`sources[].property`), so
attributes are taken only where that source is not OpenStreetMap — anything
OSM-sourced we already read, first-hand, from Overpass. Each shipped attribute
set carries the dataset it came from, and the viewer stamps it as the
building's provenance, so an Overture height is never mistaken for a survey.

Two kinds of record are shipped:

  footprints  buildings whose GEOMETRY is not from OSM (ML detections, cadastre
              imports): the shape, plus whatever attributes they carry.
  osm         buildings whose geometry IS OSM's but which Overture enriched from
              elsewhere — a height, a storey count, a roof. Keyed by the OSM id
              Overture records (`w123`, `r456`), so the viewer fuses them onto
              the very building Overpass returned, exactly, with no geometric
              matching. The viewer only lets them fill what OSM left empty.

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
    ("placa-catalunya", 41.3870,    2.1700,   "Plaça de Catalunya, Barcelona"),
]

# Overture property -> the OSM tag the viewer already understands.
ATTRS = {
    "height": "height", "min_height": "min_height", "num_floors": "building:levels",
    "min_floor": "building:min_level", "roof_shape": "roof:shape", "roof_height": "roof:height",
    "roof_direction": "roof:direction", "roof_orientation": "roof:orientation",
    "facade_color": "building:colour", "roof_color": "roof:colour",
    "facade_material": "building:material", "roof_material": "roof:material",
    "class": "building",
}


def osm_key(record_id):
    """`w123@4` / `w123` -> `w123`; anything that is not an OSM element id -> None."""
    if not record_id:
        return None
    rid = str(record_id).split("@")[0]
    return rid if rid[:1] in ("w", "r") and rid[1:].isdigit() else None


def attributes(row, sources):
    """Tags from the row's properties whose source is NOT OpenStreetMap."""
    whole = None
    by_prop = {}
    for src in sources or []:
        prop = (src.get("property") or "").strip()
        if prop in ("", "/"):
            whole = src.get("dataset")
        else:
            by_prop[prop.rsplit("/", 1)[-1]] = src.get("dataset")
    tags, datasets = {}, set()
    for prop, tag in ATTRS.items():
        value = row.get(prop)
        if value is None or value == "":
            continue
        dataset = by_prop.get(prop, whole)
        if dataset == "OpenStreetMap" or dataset is None:
            continue
        if isinstance(value, float):
            value = round(value, 2)
        tags[tag] = str(value)
        datasets.add(dataset)
    return tags, sorted(datasets)

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
        SELECT id, ST_AsGeoJSON(geometry) AS gj, to_json(sources) AS srcs,
               height, min_height, num_floors, min_floor, roof_shape, roof_height,
               roof_direction, roof_orientation, facade_color, roof_color,
               facade_material, roof_material, class, is_underground
        FROM read_parquet('{S3}')
        WHERE bbox.xmin > {west} AND bbox.xmax < {east}
          AND bbox.ymin > {south} AND bbox.ymax < {north}
        """
    ).fetchall()
    names = [d[0] for d in con.description]
    took = time.time() - t0

    kept, osm_attrs, from_osm, unusable = [], {}, 0, 0
    for raw in rows:
        row = dict(zip(names, raw))
        if row.get("is_underground"):
            continue
        bid, gj = row["id"], row["gj"]
        sources = json.loads(row["srcs"]) if row.get("srcs") else []
        geometry_src = sources[0] if sources else {}
        tags, datasets = attributes(row, sources)
        # The provenance filter. An OSM-shaped row is one we already fetch, and
        # hand-mapped with tags — but Overture may have ENRICHED it from
        # elsewhere, and that enrichment is worth shipping, keyed by OSM id.
        if geometry_src.get("dataset") == "OpenStreetMap":
            from_osm += 1
            key = osm_key(geometry_src.get("record_id"))
            if key and tags:
                osm_attrs[key] = {"tags": tags, "src": datasets}
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
        entry = {"id": str(bid), "ring": ring}
        if tags:
            entry["tags"] = tags
            entry["src"] = datasets
        kept.append(entry)

    print(
        f"  {slug:14s} {len(rows):5d} rows in {took:5.0f}s"
        f"  ->  {from_osm:4d} already OSM ({len(osm_attrs)} enriched), {unusable:3d} unusable,"
        f" {len(kept):4d} shipped, {sum(1 for k in kept if 'tags' in k)} with attributes"
    )
    return {
        "release": RELEASE,
        "attribution": ATTRIBUTION,
        "label": label,
        "bbox": [round(west, 6), round(south, 6), round(east, 6), round(north, 6)],
        "footprints": kept,
        "osm": osm_attrs,
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
