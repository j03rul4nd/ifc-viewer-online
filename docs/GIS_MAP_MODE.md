# GIS Map Mode — user & maintainer guide

Optional feature that places a loaded IFC model on a real-world 2D basemap
(OpenStreetMap and friends) inside the existing 3D scene. Implemented per
[`GIS_MAP_INTEGRATION_PLAN.md`](GIS_MAP_INTEGRATION_PLAN.md) — that document
remains the architectural reference; this one is the operational summary.

## Enabling the feature

Build-time flag: `VITE_FEATURE_GIS=true` (see `.env.example`). When unset, the
Map button never renders, no GIS chunk loads, and viewer behavior is
byte-identical to a build without the feature. This is the kill switch.

## What the user sees

1. **Map** button in the toolbar (globe icon, needs a loaded model).
2. First use shows a **privacy consent** dialog: tile requests reveal the
   approximate site location to the tile provider; the model never leaves the
   browser. Persisted in `localStorage` (`ifc-geo-consent:v1`).
3. On *Show on map*, georeferencing is extracted from the IFC in a web worker
   (ladder: `IfcMapConversion`+`IfcProjectedCRS` → `ePSet_MapConversion` →
   `IfcSite` lat/lon → none, with sanity gates for Null Island, bad scale,
   out-of-range and out-of-CRS-domain values):
   - **Georeferenced** → auto-placed, badge shows the rung + EPSG code.
   - **Grid coords with unknown CRS** → inline EPSG/proj4 picker.
   - **None/invalid** → manual placement form (WGS84 lat/lon), then
     fine-tuning with nudge buttons, rotation, height offset and
     "pick location on map" (single click, no drag conflicts).
4. Layers: **Streets** (OSM, default) · **Topo** (OpenTopoMap) · **Satellite**
   (explicit terms sheet — Esri non-revenue / EOX CC-BY-NC / NASA GIBS low-res;
   there is *no* license-clean free high-res satellite source) · **Custom**
   (any https XYZ/WMTS template, the vendor-lock-in escape hatch).
5. **3D terrain** toggle: fixed 3×3 patch of AWS terrarium elevation tiles
   (no LOD by design). Since the 2026-06 fidelity pass
   (`TERRAIN_3D_IMPROVEMENT_PLAN.md`): ONE seamless mesh from a unified 768²
   height grid (bilinear, 257² vertices), adaptive DEM zoom (z15 default, z14
   for big models / |lat|>60°), imagery draped at a HIGHER zoom than the DEM
   (+1 for OSM-policy providers, +2 otherwise, anisotropy 8), baked hillshade
   in vertex colours, and the drape **follows provider switches live**
   (`TerrainPatch.redrape()` — heights are never refetched). Moving the
   placement out of the centre tile triggers a debounced (800 ms) rebuild.
   While terrain is on, the FLAT basemap is clipped away under the patch
   (4 local clipping planes, intersection mode) so valleys below the ground
   plane are visible — rivers sink instead of hiding under the flat tiles.
   **Five** visualization styles (map imagery / shaded relief / hypsometric
   tint / slope / ecosystems) and a live ×1–×3 vertical exaggeration slider sit
   under the terrain toggle (persisted). Vertical datums IFC↔terrain can differ
   by metres; the height-offset slider absorbs it.
6. **Advanced relief** (collapsed under the terrain styles, round 3 —
   2026-08): configurable sun azimuth/altitude, shading softness (single hard
   light ↔ multi-directional Imhof blend), sky-view-factor occlusion, synthetic
   micro-relief blend, and contour lines. All re-bake vertex colours live with
   no refetch; only the micro-relief slider re-displaces geometry.
7. **Surroundings (OpenStreetMap)** toggle: the site's actual context, fetched
   in ONE Overpass query and shown as five independently toggleable layers —
   buildings, water, parks/greenery, trees and bridges. Each row states its own
   count, so an empty layer reads as "none mapped here" rather than a broken
   switch. Toggling is instant: layers rebuild from the cached features and
   never refetch. Buildings carry roof shapes (`roof:shape` → flat / gabled /
   pyramidal) and tagged wall/roof colours, and the panel reports how many
   heights were *estimated* rather than surveyed.
8. **Placement minimap** (Leaflet): drag the pin or click to place a
   non-georeferenced model, review where an IFC's own georeferencing landed,
   and "use my location" (opt-in per click; coordinates never leave the
   browser and never reach analytics). With several models loaded it also
   shows sibling pins and warns when the files disagree by more than 10 km.
9. **Save location to the IFC**: writes `IfcSite.RefLatitude/RefLongitude/
   RefElevation` as a normal, undoable edit that is applied on export.
10. Attribution pill (bottom-right) is a **license obligation**, not decor.
    OSM building data is ODbL — attributed whenever buildings are shown, even
    when the basemap comes from another provider.
11. Manual placements persist per file (`ifc-geo-placement:v1:<cacheKey>`) and
   win over extracted georeferencing on the next load. Note: demo-gallery
   models get a fresh `lastModified` per download, so their cache key — and
   therefore the saved placement — does not survive a re-download. User files
   opened from disk persist correctly.

## Architecture (file map)

| Piece | File |
|---|---|
| Feature flag | `src/lib/geo/gis-flag.ts` |
| Pure math (mercator, slippy, IFC angles, geoRoot compose) | `src/lib/geo/geo-math.ts` |
| CRS resolution (proj4 + bundled EPSG defs + custom) | `src/lib/geo/crs.ts` |
| Extraction ladder (pure) | `src/lib/geo/georef-ladder.ts` |
| Extraction worker (web-ifc, single-thread) | `src/workers/geo-extract.worker.ts` |
| Worker client + load-time quick scan | `src/lib/geo/geo-extract-runner.ts` |
| Extraction→placement glue + persistence | `src/lib/geo/placement.ts` |
| Provider registry + custom slot | `src/lib/geo/providers.ts` |
| Tile engine seam (3d-tiles-renderer impl + T0 decision block) | `src/lib/geo/basemap-engine.ts` |
| Lifecycle owner (geoRoot, env snapshot/restore, camera flight, picking) | `src/lib/geo/geo-system.ts` |
| Point elevation (terrarium) | `src/lib/geo/elevation.ts` |
| Terrain sampling math (pure: bicubic, normals, detail synthesis, sky-view factor, hillshade, ecosystems, zoom selection) | `src/lib/geo/terrain-sampling.ts` |
| Terrain look defaults + clamping (split out: geoStore is EAGER) | `src/lib/geo/terrain-look.ts` |
| Terrain worker + mesh assembly | `src/workers/geo-terrain.worker.ts`, `src/lib/geo/geo-terrain.ts` |
| web-ifc attribute unwrapping (pure, shared with the extractor) | `src/lib/geo/ifc-value.ts` |
| Multi-model siting (pure: haversine, anchor, disagreement) | `src/lib/geo/model-sites.ts` |
| OSM buildings: heights/bbox (pure) · extrusion incl. roof shapes | `src/lib/geo/buildings.ts`, `src/lib/geo/building-mesh.ts` |
| OSM feature classification + single multi-layer query (pure) | `src/lib/geo/osm-features.ts` |
| OSM layer meshes (water, greenery, instanced trees, bridge decks) | `src/lib/geo/osm-scene.ts` |
| Fetch worker (one query, all layers) | `src/workers/geo-buildings.worker.ts` |
| Placement minimap (Leaflet, lazy) | `src/components/PlacementMiniMap.tsx` |
| Product state (epoch-guarded) | `src/stores/geoStore.ts` |
| UI (panel, consent, layers, editor, pill) | `src/components/GeoPanel.tsx` |
| Viewer hook (lazy `getGeo()`, ~15 additive lines) | `src/lib/viewer.ts` |

Key invariants:

- **INV-2** — the map aligns to the model, never the reverse. 1 scene unit =
  1 true metre at the anchor latitude (`cos φ₀` scales the *basemap*).
  Measurements, BCF viewpoints and exports are identical in and out of map mode.
- **INV-3** — every environment value touched on enable (camera planes, fog,
  controls clamps, grid, camera pose) is snapshotted and restored exactly on
  disable. Covered by unit tests (`geo-system.test.ts`).
- **INV-5** — only `z/x/y` ever appear in tile URLs; analytics events carry no
  coordinates or file names.
- Chunking: entry growth ≈ a few kB (eager EN strings only); the engine lives
  in the lazy `geo-system` chunk (~126 kB), panel+proj4 in the lazy `GeoPanel`
  chunk, and Leaflet in its own lazy `PlacementMiniMap` chunk. `vite.config.ts`
  `manualChunks` explicitly keeps `3d-tiles-renderer`/`proj4`/`leaflet` out of
  the eager vendor chunks — verify with `grep -c leaflet dist/assets/index-*.js`
  (must be 0) after touching the geo import graph.

## Maintainer notes

- `3d-tiles-renderer` is pinned at 0.4.28 semantics: `GeneratedSurfacePlugin`
  (planar, centred, `applyOverlayTexture`) + `XYZTilesOverlay`. The deprecated
  `XYZTilesPlugin` must not be used. Full decision block at the top of
  `basemap-engine.ts`. The package ships no types for `GeneratedSurfacePlugin`
  — see `src/types/3d-tiles-renderer-plugins.d.ts` (delete when upstream adds
  them).
- Tile streaming is driven by a geo-owned `requestAnimationFrame`; browsers
  freeze rAF in hidden tabs, so streaming pauses while the tab is hidden and
  resumes on focus (also true for the rest of the viewer). In dev,
  `globalThis.__basemapTiles` exposes the live `TilesRenderer` for diagnosis.
- Provider licensing was reviewed 2026-06 (`lastReviewed` in `providers.ts`).
  Re-verify before GA, especially Esri terms and the EOX layer year.
- i18n namespace `geo`: EN + ES are hand-written; the other 8 locales are
  EN copies flagged `_status: machine-copy-of-en` pending translation — though
  keys added since 2026-08 ARE translated in all ten. `geo-parity.test.ts`
  enforces identical key sets and interpolation params (it ignores `_status`,
  which is a maintenance marker, not a UI string) and pins the honesty
  disclaimers so none can go missing in a locale.

### Ground handling differs per layer, on purpose

- **water** — flat, at the *lowest* ground under its own outline. Water is level
  by definition, and the minimum keeps a river in its bed rather than floating
  over the banks.
- **greenery** — follows the terrain per vertex; a flat patch would slice
  through a hillside park.
- **buildings** — flat base at the footprint centroid plus a buried skirt.
  Following terrain per-vertex would shear each building into a parallelogram.
- **bridges** — flat decks at their own height. Most bridges are tagged on the
  WAY, not as an area (measured in Paris: 56 of 81), so linear centrelines are
  buffered to a deck from `width`, lane count, or a per-type default. Treating
  the linear case as an edge case would lose two thirds of all bridges.
- **trees** — two InstancedMeshes (trunk + canopy): 1486 trees cost 2 draw
  calls. Low-poly on purpose; at map scale a tree is a silhouette.

### Buildings: why Overpass, and the usage rules

Footprints come from the **Overpass API**, not from a free 3D-buildings tile
proxy. Overpass serves canonical OSM under ODbL with attribution we already
display; a tile proxy would be a second undocumented dependency that can change
terms or vanish, for data available at the source. That choice only stays
acceptable if the query pattern stays small and interactive:

- ONE query per user toggle. Never per tile, never on camera movement.
- bbox no wider than the terrain patch (±700 m), 6000-element cap, timeouts on
  both the server (`[timeout:25]`) and the client.
- ONE query covers every layer. Results are cached per site, so toggling a
  layer — or terrain — re-extrudes locally instead of re-querying.
- Every failure degrades to "no buildings" with an honest message. Overpass
  rate-limits aggressively per IP: a handful of queries in quick succession
  earns a multi-minute cooldown, which the UI reports as "the service was
  busy". **Space out queries when testing.**

### Traps that cost real debugging time

- **Triangulate in METRES, not normalized units.** A 20 m wall is ~3e-8 in the
  normalized planar frame — close enough to earcut's degeneracy epsilon that
  most footprints collapse to zero triangles and vanish silently. Measured:
  437 of 3944 buildings survived before this was fixed. The triangulation is
  topological, so its indices apply unchanged to the normalized ring.
- **web-ifc attribute shapes are not interchangeable, and guessing wrong fails
  late.** `IfcSite.RefLatitude` is ONE wrapper around the whole integer list
  (`{ type: 10, value: number[] }`), not an array of tagged values;
  `RefElevation` is a NumberHandle measure that also needs `name`. A wrong
  shape throws only at `SaveModel`. Conversely, reading requires unwrapping —
  a missing unwrap silently disabled rung 3 of the ladder for every IFC2x3
  file. Both directions live in `ifc-value.ts` / the export worker, tested.
- **Compound plane angles carry the sign on EVERY non-zero component.** A
  southern latitude is `-33,-52,-7,-680000`, not `-33,52,7,680000`.
- **Leaflet adds `.leaflet-container` to the element you hand it**, so theming
  needs a compound selector (`.geo-minimap.leaflet-container`); a descendant
  selector never matches.
- Synthetic terrain detail and the ecosystem style are **models, not
  measurements**. Both are off/opt-in by default and both carry a UI
  disclaimer. Keep it that way.
- **An RGB triple and three per-vertex greys have the same TypeScript shape.**
  `pushTriangle` once accepted both and silently painted every tinted building
  face in greyscale. The ambiguous overload is gone: it takes either one grey
  or explicit per-vertex RGB. Do not reintroduce the convenience form.
- OSM is volunteer-mapped and uneven: a missing park is not an empty field.
  Report what was found; never let the UI imply absence of data means absence
  of the thing. Roof shapes are the clearest case — in Paris only 20 of 1254
  buildings tag `roof:shape` at all.
