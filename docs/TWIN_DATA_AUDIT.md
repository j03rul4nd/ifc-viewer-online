# Digital-twin R&D package — audit (phase A)

What the package `joel/ID-integracion-datos-ciudades/` contains, what each part is
worth to ifcvieweronline.eu, and what was checked rather than assumed. Audited
2026-10-09/10. Sources (APIs) are audited separately and in more depth in
[`CITY_DATA_SOURCES.md`](CITY_DATA_SOURCES.md); this file covers the package itself.

## 1. Where the package comes from

The scripts describe themselves as tooling for another product: "CDE Scenes",
"CDE-Frontend", a Luciad scene, connector services named `MW-TS-API-*`. Every IFC
header names its author:

```
IFCPERSON($,$,'InGreen CDE demo',…)   IFCORGANIZATION($,'InGreen',…)
IFCAPPLICATION(#2,'2.0','InGreen landmark builder (IfcOpenShell)','ingreen-landmark')
```

**Consequence.** Eight of these files are now published in `public/models/barcelona-catalunya/`
(PR #213), header included. Whoever owns the InGreen material must be happy for it to
be public on this site under these names. That has not been confirmed in writing. If it
is not, the fix is mechanical: rewrite the three header entities (or remove the files
and the Barcelona demo scene).

## 2. Inventory

### IFC models (`ifc/`)

| City | Files | Schema | CRS (IfcMapConversion) | Size |
|---|---|---|---|---|
| Barcelona | 8 models × 2 variants (plain + `_qto`), plus 8 `_cutouts.json` | IFC4X3_ADD2 | EPSG:25831 (ETRS89 / UTM 31N), heights Alicante | 0.47–3.9 MB each, 9.9 MB for the eight `_qto` |
| Helsinki | `elielinaukio-bus-terminal`, `helsinki-cathedral`, `helsinki-central-station` | IFC4 | EPSG:3879 (ETRS-GK25FIN), N2000 | 0.6, 1.0, 6.8 MB |
| Tokyo | `tochomae-a4-entrance`, `waseda-tram-stop` (+ `_qto`) | IFC4X3_ADD2 | EPSG:6677 (JGD2011 / Japan Plane Rectangular CS IX), TP | 2.6–4.2 MB |

- The `_qto` variants are the plain files plus base quantities (`qto.py`). The demo uses
  the `_qto` ones, so quantity take-off works on them.
- `_cutouts.json` lists the footprints where the OpenStreetMap city must be cut away
  for the model to show. The app already does that from the model itself
  ([`URBAN_3D_INFRASTRUCTURE_FINDINGS.md`](URBAN_3D_INFRASTRUCTURE_FINDINGS.md)), so
  the files are not used.
- The Barcelona models are illustrative assets (≈ LOD 400 geometry, LOD 500-style
  `Pset_CDE_AssetManagement`). Real organisations appear only as `(demo)`,
  `(assumed)` or `(fictitious)` values, and the project description says
  "Illustrative IFC4X3 model… with demo values". Positions are derived from
  OpenStreetMap (ODbL), which the files credit.

### Generators (`generadores-ifc/`, `modelos-3d-blender/`)

| Script | What it does | Reused here? |
|---|---|---|
| `ifcbuild.py` | IfcOpenShell authoring layer: georeferenced IFC4 with `IfcMapConversion` | No — offline authoring tool |
| `qto.py` | Base quantities from tessellated geometry | No — its output (the `_qto` files) is |
| `ifc2tiles.py` | IFC → single-tile 3D Tiles (b3dm) + a static WFS of the element tree | No — the viewer loads IFC directly |
| `tools/icgc_ground*.py`, `gsi_laser.py`, `lod2_ground.py` | Ground heights from the ICGC mesh / MET 5 m, GSI 5 m laser DEM, LOD2 | **The idea, yes**: the ICGC MET 5 m terrain is now a DEM source of the map (`dem-sources.ts`, PR #212) |
| `hel3d_patch.py` | Hides Helsinki LOD2 buildings where an IFC stands | No — Helsinki 3D Tiles are not a layer here (yet) |
| `landmarks/*.py` + `*_site.json` | One authoring script per landmark | No |
| `modelos-3d-blender/*` | Blender scripts for rail cars and chargers (GLB props) | No — the viewer has its own prop pipeline (`scripts/blender/build-props.py`) |

### `INTEGRACION-DATOS.md`

This is the package's research on public data sources. Each source it names was checked
from a browser origin instead of being taken on trust. The results are in
`CITY_DATA_SOURCES.md` (§1 works, §2 no CORS). The main corrections to the research:

- Renfe GTFS-RT, the SCT incidents GML, ACA gauges and the Barcelona itineraries file
  **send no CORS headers**. They cannot be read from a browser without a proxy.
- The Open Data BCN portal is **slow** (15–40 s a file) and rejects some of several
  simultaneous requests. The app retries with backoff and jitter.
- Endolla's GELFS `last_updated` is a port's last **change**, not a heartbeat, and the
  file has no feed timestamp. Freshness can only be timed by the download.
- Terrarium (the global DEM) reads 7–15 m high in central Barcelona because it measures
  roofs. ICGC MET 5 m agrees with the IFC origins within ±0.5 m.

## 3. What was built from it

| Phase | Result | PR |
|---|---|---|
| Connectors | JSON records (Socrata, GELFS, ODPT, data.gov.sg), hourly air-quality tables, URL time templates, 16 presets, CRS 3879 / JGD2011 / ED50 | #207 |
| Scenes | `ifc-viewer-scene` v1: `?scene=`, `#scene=`, *Share → Digital-twin scene*, JSON Schema | #211 |
| Geo heights | Models stand on the terrain (ICGC DEM in Catalonia), one project moves as one, satellites stop drifting | #212 |
| Barcelona demo | Plaça de Catalunya: 8 IFC + 4 live layers + Bicing and Endolla painting IFC elements; gallery card; `DEMOS.md` | #213 |
| SDK v1.17 | Scenes and data-layer API, `layer-feature-picked` / `alert` events; client-mode map fix | #215 |

## 4. Opportunities not taken yet

| Opportunity | Value | Cost / blocker |
|---|---|---|
| Helsinki and Tokyo demo scenes | Shows the platform is not Barcelona-only. CRS and presets exist (Toei stations) | Few live sources with CORS near the Tokyo models; Helsinki sources (HSL, FMI) need adapters. Check the InGreen ownership first (§1) |
| ICGC Barcelona 3D mesh (3D Tiles) as a layer | Photogrammetric city instead of OSM blocks | Ellipsoidal heights (−49.7 m to orthometric), no licence declared on the tileset, a 3D Tiles renderer to add |
| Helsinki LOD2 3D Tiles (kartta.hel.fi) | Official city model | Same renderer cost; licence not checked yet |
| GSI 5 m laser DEM for Japan | Correct ground under the Tokyo models | A new DEM source (text tiles, z15) |

## 5. Risks

- **Ownership of the IFCs** (§1).
- **Provider fragility.** Every live source is a third party's free endpoint. FGC's
  Opendatasoft quota is 5 000 requests a day per IP. The BCN portal is slow. Licences
  differ, and Bicing declares none. The scene lists each source's attribution, and
  `CITY_DATA_SOURCES.md` records the measured behaviour.
- **Demo values read as real.** The scene shows its notes when it opens, and `DEMOS.md`
  repeats them. Any article must repeat them too.
