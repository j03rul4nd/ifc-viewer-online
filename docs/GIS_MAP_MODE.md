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

0. **Two faces, one state** (2026-09). The panel has a *Basic / Advanced*
   switch in its header (persisted, `ifc-geo-panel-mode:v1`, Basic by default).
   **Basic** is four ready-made views — *Flat map · Terrain · City ·
   Presentation*, each with a light/medium/heavy cost marker — plus the
   basemap, the terrain and surroundings switches and the quality choice.
   **Advanced** is every control in five tabs: *Basemap · Terrain ·
   Surroundings · Placement · Performance*. A preset only writes the ordinary
   preferences (`src/lib/geo/scene-presets.ts`); the active preset is DERIVED
   from them, so touching any control reads as "Custom" and there is no second
   source of truth. Before the map is on, the panel already says whether the
   model will land by itself or need placing. A **scene status strip** under
   the primary action reports the build (progress), failed layers (with
   Retry), layers left out by the geometry budget (with *Load anyway*), a lost
   GPU context, an automatic quality step-down (with *Restore*) and a slow
   view (with *Lower quality*) — every warning carries its own remedy.
   The placement editor is a full-body step reachable from both faces
   ("Adjust" on the location card).
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
8. **Detail level** (under Surroundings): *Simple* · *Detailed* · *Showcase*.
   One control governs how much of everything is modelled — storey-banded
   facades, procedural ground surfaces and the relief itself — because the real
   question is "is this a working view or a view I am presenting", not three
   independent switches. **Showcase is the only level that downloads anything**:
   ~136 KB of authored GLB props from our own origin, fetched once, quoted in
   the panel before the user commits. Everything degrades asset-by-asset if a
   download fails, and the *level* decides what is drawn — never whether the
   assets happen to be cached, or "detailed" would look different depending on
   where the user had been.
9. **Scenery** toggle (vehicles, lamps, shelters), off by default and separate
   from every data layer. Cars, trains, street lamps and platform shelters are
   INVENTED placement — OSM does not record where a car is parked or which kerb
   carries a lamp — so they get their own switch and the UI says so. Traffic
   signals are the counter-example: `highway=traffic_signals` is a surveyed
   node, so they are a data layer like any other. A client looking at a render
   must never be able to mistake our set dressing for survey.
10. **Placement minimap** (Leaflet): drag the pin or click to place a
   non-georeferenced model, review where an IFC's own georeferencing landed,
   and "use my location" (opt-in per click; coordinates never leave the
   browser and never reach analytics). With several models loaded it also
   shows sibling pins and warns when the files disagree by more than 10 km.
11. **Save location to the IFC**: writes `IfcSite.RefLatitude/RefLongitude/
   RefElevation` as a normal, undoable edit that is applied on export.
12. Attribution pill (bottom-right) is a **license obligation**, not decor.
    OSM building data is ODbL — attributed whenever buildings are shown, even
    when the basemap comes from another provider.
13. Manual placements persist per file (`ifc-geo-placement:v1:<cacheKey>`) and
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
| Basemap sharpness maths (device-pixel LOD, error target, quality ladder) | `src/lib/geo/basemap/tile-quality.ts` |
| Cartographic style engine (palettes, knobs, ordered layer rules, zoom functions) | `src/lib/geo/basemap/map-styles.ts` |
| Vector tile painter (geometry, casings, labels + collisions) | `src/lib/geo/basemap/vector-painter.ts` |
| OpenMapTiles overlay (TileJSON, overzoom to z20, custom paint) | `src/lib/geo/basemap/vector-overlay.ts` |
| Lifecycle owner (geoRoot, env snapshot/restore, camera flight, picking) | `src/lib/geo/geo-system.ts` |
| Point elevation (terrarium) | `src/lib/geo/elevation.ts` |
| Terrain sampling math (pure: bicubic, normals, detail synthesis, sky-view factor, hillshade, ecosystems, zoom selection) | `src/lib/geo/terrain-sampling.ts` |
| Terrain look defaults + clamping (split out: geoStore is EAGER) | `src/lib/geo/terrain-look.ts` |
| Terrain worker + mesh assembly | `src/workers/geo-terrain.worker.ts`, `src/lib/geo/geo-terrain.ts` |
| web-ifc attribute unwrapping (pure, shared with the extractor) | `src/lib/geo/ifc-value.ts` |
| Multi-model siting (pure: haversine, anchor, disagreement) | `src/lib/geo/model-sites.ts` |
| OSM buildings: heights/bbox (pure) · extrusion incl. roof shapes | `src/lib/geo/buildings.ts`, `src/lib/geo/building-mesh.ts` |
| OSM feature classification + single multi-layer query (pure) | `src/lib/geo/osm-features.ts` |
| What the OSM context stops drawing where the model stands (pure) | `src/lib/geo/context-suppression.ts` |
| Growing a canopy on a greenery polygon, and the ground it must leave alone (pure) | `src/lib/geo/tree-seeding.ts` |
| OSM layer meshes (water, greenery, instanced trees, bridge decks, catenary masts) | `src/lib/geo/osm-scene.ts` |
| Signals (data) and scenery (vehicles, lamps, shelters) | `src/lib/geo/props-scene.ts` |
| Showcase GLB loading + cache + quoted download size | `src/lib/geo/props-assets.ts` |
| Authored assets, and the script that builds them (`npm run props`) | `public/models/props/*.glb`, `scripts/blender/build-props.py` |
| Fetch worker (one query, all layers) | `src/workers/geo-buildings.worker.ts` |
| Placement minimap (Leaflet, lazy) | `src/components/PlacementMiniMap.tsx` |
| Product state (epoch-guarded) | `src/stores/geoStore.ts` |
| Triangle budget per device tier, budget gate, frame watch, scene report (pure) | `src/lib/geo/scene-budget.ts` |
| Scene presets + "which preset is this" (pure) | `src/lib/geo/scene-presets.ts` |
| UI entry (lazy; composes only) | `src/components/GeoPanel.tsx` |
| Every panel action — the ONE route both faces and the SDK bridge take | `src/components/geo/useGeoController.ts` |
| Long-lived subscriptions: `sdk:site`, scene health, adaptive quality, canvas pick/hide | `src/components/geo/useGeoEffects.ts` |
| Header, primary action, scene status strip | `src/components/geo/chrome.tsx` |
| Basic face (presets) · Advanced face (tabs) | `src/components/geo/QuickSetup.tsx`, `src/components/geo/AdvancedTabs.tsx` |
| Advanced tab bodies | `src/components/geo/sections/*.tsx` |
| Sub-flows: CRS, manual placement, satellite terms, custom source, placement editor, consent | `src/components/geo/flows.tsx` |
| Attribution pill + hover tooltip | `src/components/geo/MapOverlays.tsx` |
| Layout primitives (one spacing scale, per-section error boundary) | `src/components/geo/ui.tsx` |
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

## Scene build scheduling (2026-09)

The cascade (`render-scheduler.ts`) builds the context phase by phase and
hands the thread back between them; `geo-system.ts` now schedules those
builds instead of letting every setter start one:

- **Coalesced** — requests in the same tick share one build; one that arrives
  mid-build supersedes it at the next phase or slice boundary. Slider-driven
  rebuilds (exaggeration, micro-relief) wait 220 ms for the drag to settle.
  Before, every setter extruded the whole district synchronously on its own.
- **Isolated** — a builder that throws marks its layer `failed`; the other
  phases still build and commit. The prelude and the vertical solve degrade
  instead of aborting the scene.
- **Budgeted** — each layer is admitted, in cascade order, under a triangle
  budget per device tier (`TRIANGLE_BUDGET`, tier from render-scheduler's
  `deviceBudget`); what does not fit is reported `skipped`, never silently
  dropped, and *Load anyway* lifts the budget for the session. A lost WebGL
  context halves the budget and rebuilds on restore. Invented scenery on a
  device without `heavyScenery` is reported as left out, not hidden.
- **Incremental** — a layer switched off is removed on the spot; one switched
  on is built alone against the cached prelude (full rebuild in Shanghai
  showcase, whose park detail is shared between layers).
- **Reported** — per-layer triangles, time and status reach the panel's
  Performance tab. The RAF feeds a frame watch (ignores hidden pages, which
  Chrome may throttle rather than freeze, and a 2.5 s grace after each
  rebuild); sustained < 20 fps drives *adaptive quality*, one detail step at a
  time, with the old level one click away.

`geo.settled()` resolves once every requested build has landed — tests and the
SDK bridge (`done` now means built, not requested) await it instead of
assuming a synchronous first phase.

Measured on Poblenou (1 613 buildings, 2 930 ways, 2 165 trees, 1.46 M
triangles, City preset) with the sliced road layer: a full rebuild yields 94
times and its longest slice is ~325 ms (buildings / vertical solve / ground
cover are still single tasks); before slicing and scheduling the road layer
alone was one ~1.9 s block. Switching trees back on builds that layer alone
(~0.5 s here) instead of the ~2.3 s full rebuild.

## Basemap rendering (2026-10)

### Why tiles looked pixelated — diagnosed, not guessed

`3d-tiles-renderer` refines a tile while one of its texels covers more than
`errorTarget` pixels of the resolution it was given. Three faults stacked:

1. **`errorTarget` was 6.** A 256 px OSM tile could be stretched over
   ~1500 px before its children were requested; a full-HD view was painted by
   two to four tiles.
2. **CSS pixels, not device pixels.** `setResolutionFromRenderer` reads
   `renderer.getSize()`. On a DPR 2 screen every texel was magnified twice
   more than LOD believed — up to 12 device px per texel.
3. **Resolution set once.** Only at map-on and projection swaps; resizing the
   window, opening a panel or moving to another monitor never reached LOD.

No CSS or filter could fix that. The fix (`tile-quality.ts`): the engine reads
the canvas size × DPR **every frame** and pushes it only when it changes;
`errorTarget` is 2 *device* px (`balanced`), 1.5 (`high`, raster only), 3.5
(`economy`). Effective DPR is capped at 2 and the LOD frame at a 4K pixel
count — beyond that only the tile bill grows. A slow view (frame watch) steps
the basemap down to `economy` *before* the scene's adaptive quality removes
buildings; a provider change restores `balanced`.

Loading: `loadAncestors` keeps the parent on screen until its children are
ready, `TilesFadePlugin` cross-fades them (220 ms, up to 120 simultaneous fades
so a fast zoom does not fall back to popping), and a **ground underlay** — one
quad in the provider's land colour, `depthWrite:false`, drawn first, not
pickable — means a tile still in flight shows *map colour*, never the black
sky. Priority (in-frustum, nearest, shallowest first), request abort on
unload, LRU + byte-target unloading are the library's and were already on.

### OSM as data: the vector basemap (default for new users)

`vt-<style>` providers read OpenMapTiles vector tiles from **OpenFreeMap**
(OSM-derived, no key, no cap, commercial use allowed — attribution only; the
URL is versioned weekly, so it is resolved from the TileJSON). They are painted
by **our** style engine into the same 3D ground surface the rasters use, so
terrain holes, placement, BCF, capture and every overlay work unchanged.

- **Overzoom.** Data stops at z14 (~2 km tiles). The *surface* tiling goes to
  z20 while the *content* tiling stays at z14, so a z19 surface tile repaints
  z14 geometry over 1/32 of its span: vector-sharp at building scale, where a
  raster would be a 32× magnified photograph.
- **Styles are architecture, not themes.** `map-styles.ts` builds one ordered
  layer list from *(palette, knobs)*: Standard, Light, Dark, BIM, Minimal,
  High contrast share the hierarchy (roads widen identically, labels arrive at
  the same zooms) and differ only where intended. Widths interpolate
  **geometrically** between zoom stops, which is what keeps on-screen width
  steady across a parent→children LOD swap. A new style = a palette + knobs; a
  new kind of feature = one rule, and every style gets it.
- **Progressive density.** Countries/cities from z2–4, towns z8, roads by class
  (motorway z5 … minor z12, service z13, paths z15), buildings z14 (BIM) / z16
  (Minimal), POIs z15 with per-tile budgets (8 → 40), house numbers z18. Street
  names from z13 (primary) to z17 (service).
- **Labels.** Greedy priority placement per tile; a label is drawn only if it
  fits *entirely* inside the tile (no label is ever cut by a tile edge), never
  over another, never repeated within its `repeatDistance`; line labels ride
  the longest straight segment and are kept upright. Name in the UI language
  when OSM has it, else the local name (what the street sign says). Font:
  Geist, halo per style.
- **BIM coexistence.** The BIM style keeps hue for the model and its issues:
  roads rank by width not colour, footprints are crisp and pale like a
  drawing's context layer, no commercial POIs, place names set as a drawing
  sheet. Dark is for presentation; High contrast is for site tablets in glare.
- **Fallbacks.** Vector providers keep `urlTemplate` = OSM raster, used only
  for the terrain drape (the drape is still a photograph). The degraded banner
  switches vector ↔ raster OSM (different hosts, so each is the other's way
  out).

### Our own map provider = a mixer in the browser (no backend, no storage, no cost)

The product is browser-only and spends nothing until it earns, so "our
provider" is not a tile server: it is `raster-sources.ts` + the vector overlay
composing each surface tile **client-side** from public sources read directly
(all verified `Access-Control-Allow-Origin: *`):

| Source | What it gives | Where | Licence |
|---|---|---|---|
| OpenFreeMap (OpenMapTiles) | OSM vectors: roads, names, land use, footprints | world | ODbL / free, attribution |
| PNOA (IGN WMTS) | orthophoto 15–25 cm | Spain | CC-BY 4.0, commercial OK |
| Catastro INSPIRE (WMS) | cadastral parcels | Spain, z ≥ 16 | free reuse, attribution |
| Terrarium (AWS open data) | relief (terrain patch) | world | open |

A style declares the rasters it mixes (`MapStyle.rasters`, `under` the
vectors or `over` them). **Hybrid** = PNOA under our roads and names (no land
or footprint fills — `knobs.imagery`). **BIM** = the plan style plus the legal
parcels over it. Pieces are fetched in parallel per tile, aborted with the
tile, decoded to `ImageBitmap` and closed when the tile is disposed; a failed
piece leaves the vector map, never a broken tile. Out of coverage (outside
Spain) nothing is requested. Attribution is assembled from every source the
style mixes. Adding a source = one `RasterSource` entry (coverage, zooms,
URL builder) and a `rasters` line in a style.

**Computed source — relief.** `HILLSHADE` reads Terrarium elevation (the same
tiles as the 3D terrain patch, so the browser cache serves both) and computes
shaded relief per tile in the browser: NW light at 45° (the cartographic
convention, not the scene sun), a cool grey-violet wash drawn with `multiply`
AFTER the ground fills and BEFORE any road (`placement: 'relief'`). z4–15 only;
exaggerated far out, true close in. On in Standard (0.55), Light (0.38),
Minimal (0.3); off in BIM (a plan is flat on purpose), Hybrid (the photo has
its own shadows), Dark and Contrast.

### Looks — art direction for the 3D map (2026-10)

Research (what the reference products do): Mapbox Standard separates **light
presets** (dawn/day/dusk/night: one directional + ambient light whose colour
and angle change), **themes** (default/faded/monochrome — a colour treatment
over everything), **fog/atmosphere** that dissolves the horizon, **ground
occlusion** at the foot of buildings, and **lit windows / flood lights** at
night. What makes it read as *designed* is that one choice moves all of those
together.

Ours (`src/lib/geo/map-look.ts`) is the same idea, three orthogonal parts:

- **LightPreset** — sun azimuth/altitude, key colour/intensity, sky palette
  (zenith/horizon/ground/sun → the procedural sky environment), fog colour,
  exposure, window glow + its colour, and a **ground tint** that multiplies the
  unlit basemap so the ground sits in the same light.
- **BuildingFinish** — natural, clay (white-card maquette), monochrome,
  blueprint. Applied in the facade shader as a tint that keeps the facade's own
  light/dark relief (windows, floors, cornice).
- **map style** — the basemap designed with it.

Six curated looks (Daylight, Maquette, Golden hour, Night, Blueprint, Dawn)
in the panel (Basic and Advanced), shown as swatches of their sky, sun and
building colour. Switching is **instant**: shared uniforms
(`setFacadeLook`), light parameters and a tile tint — no rebuild, no
recompile. There is still **one sun**: the controller moves the terrain-look
sun, so hillshade, surfaces, sky and key light keep agreeing; Sun Study (a real
date) still wins the key light. Everything a look touches (key colour and
intensity, exposure, fog colour, background) is in the env snapshot and
restored when map mode turns off.

Works at every detail level: `simple` buildings use `createUnlitFacadeMaterial`
(same finish + light tint + night glow, no lighting cost) and the other unlit
layers are multiplied by the light tint (`tintUnlit`, original colour kept in
`userData.lookBase`).

Trap found: night glow by luminance must NOT reuse `GLASS_BELOW` (0.34
linear). Barcelona's renders sit ~0.25, so whole facades lit up orange. Glow
uses its own band (0.05–0.13), where only the baked glazing lives.

**Night windows at simple detail.** Flat-coloured buildings have no glazing to
find, so `createUnlitFacadeMaterial` lays a window grid on every wall (never a
roof) in world metres — storeys 3.1 m, bays 3.2 m, ~half the panes lit — and
fades it to its average where a cell is under ~2 px (no moiré). Luminance glow
is NOT used there: a dark-painted block would read as one huge lit window.

**Finish relief must stay high (≥ 0.9).** The unlit path bakes face shading
(`wallShade` / `roofShade`) into vertex colours; a low `relief` flattened it and
the Maquette's white volumes vanished into a white ground. Maquette also sits
on Standard (beige ground) for the same reason. The sky behind the map is a
zenith → horizon → fog gradient (`skyBackdropStops`), ending in the fog colour
so the horizon has no edge. Dev handle: `__geoSystem.setMapLook('night')`
switches looks in the console without refetching the city.

Verified in the app (Poblenou, simple detail, 2026-10-03): Night, Maquette,
Blueprint, Dawn, Golden hour — each switch instant, no rebuild.

**Model staging** (`model-staging.ts`): a contact shadow under the model (a
blurred-rectangle quad, footprint + a margin that grows with the building,
capped at 10 m; opacity from the finish's `ao`) — Mapbox's ground occlusion,
with no post-processing — and, at dawn/dusk/night, a warm floodlight from the
street side (`LightPreset.floodlight`: 0 / 0.4 / 0.9 / 1.6) so the model stays
the most legible thing on screen after dark. Both refit on every placement
change and look switch, and are removed with map mode.

**Why no global colour grade (decided 2026-10-04).** Mapbox's themes are LUTs
over the whole frame. Here that would (a) need a pass in ThatOpen's
postproduction, which is off by default, and (b) miss every capture path
(PNG, GIF, `captureStream` video) if done as a CSS filter instead — and,
above all, (c) recolour the IFC model, whose colours carry meaning (materials,
validation highlights). So the grade is applied to the CONTEXT only (light
tint, finish, sky) and never to the model.

**Night streets and street level** (2026-10-04). Road and bridge layers take
`LightPreset.streetTint` instead of `groundTint`: sodium amber against a cool
moonlit ground. Separated by TEMPERATURE, not brightness — a brighter tint
(#b0905e) turned the pale road meshes into a daylit sand field. Facades get a
warm wash over their first ~6 m after dark (`uGroundY`, refreshed with the
placement): shopfronts and street lights putting the city's light on the
ground, not only in its windows.

The horizon haze already reaches every capture: the sky gradient is
`scene.background` and the haze is `scene.fog`, both rendered in-frame.

**Tower crowns.** Facade fragments above ~35 m only exist on tall buildings,
so the fragment's own height picks the landmarks with no per-building data;
they get a wash rising to the crown (35 → 90 m) after dark. A mid-rise block
never receives any.

**Night basemap.** Tiles take `LightPreset.mapTint`, not `groundTint`: the
night look's basemap (Dark) is already a night map, and the full moonlight
tint put its streets out. Dark's secondary/minor roads are warm grey now
(sodium-lit), so the map alone — 3D surroundings off — reads as a lit city.

**Landmarks by real height.** building-mesh now writes `aTopH` (the
building's height, metres) on every vertex — filled by vertex range after each
building, so every emission path is covered. The unlit facade floodlights
buildings from ~40 m (smoothstep 40→80 m): a faint uplight sheen over the
facade and a lit crown over the top quarter. Geometry without the attribute
falls back to the fragment-height heuristic. (Lit/detailed facades do not use
it yet.)

**Street glow in the Dark style** (`knobs.streetGlow`): a wide (3× + 4 px),
faint amber halo under motorway/trunk/primary (and secondary from z14),
drawn before the casings. Visible when the 3D surroundings are off; with them
on, the 3D road meshes cover the basemap and carry the street tint instead.

**Both detail levels share the night light** (2026-10-04): the street-level
wash and the landmark lighting live in one GLSL function (`NIGHT_WASH_GLSL`)
used by the unlit facade (as colour) and the lit one (as emissive), so Simple
and Detailed read the same after dark.

**The viewer's fill lights follow the look** (`LightPreset.ambient`: day 1,
dawn 0.75, dusk 0.6, night 0.3). The viewer's hemisphere and fill
directionals are tuned for a model at noon; untouched, a night look's lit
facades came out almost white. Their original intensities are captured on
first use and restored when map mode turns off. The key light is left to the
look's own key colour/intensity (and to Sun Study when it is on).

**User fine-tuning** (Advanced → Basemap): *Exposure* (×0.6–1.6) and *City
lights* (×0–2: windows, street wash, floodlight). Multipliers on top of the
look, persisted (`ifc-geo-look-tuning:v1`), so they survive a look switch.

**Verified at Detailed, night** (2026-10-04): lit facades in moonlight,
windows by storey, crowns, street-level warmth — and it exposed one bug: the
model's floodlight had `distance: 0` (unbounded), washing a whole district
orange down its cone. It now reaches 2.2× the light→model distance.

**Showcase comes in golden hour** (`ScenePreset.look`). Only Showcase has a
look — the working views keep the user's. It is applied by the preset card,
not part of `matchPreset`, so changing the look never turns a preset into
"Custom".

**Time-of-day transitions** (`animateLook`, panel button *Play to night / to
day*, 6 s): `lerpLightPreset` interpolates every colour IN LINEAR LIGHT (an
sRGB lerp from blue night to warm dusk passes through mud), every number, and
the sun's azimuth the short way round, eased in and out. geo-system plays it
through a temporary `lightOverride` that wins over both the look and the
terrain-look sun, so sky, key light, facades and tints move in the same frame;
the sky's PMREM is refreshed at most every 200 ms. On landing the controller
commits the target look, so the sun is persisted where the transition left
it. Map-mode off cancels a running transition.

**The site's real sun** (`site-sun.ts`, SunCalc via solar/sun-math): dawn =
sunrise + 30 min, day = solar noon + 2 h, dusk = sunset − 30 min, today, at
the placement — so a golden hour lights the facade the real sunset lights, in
any city and season. The preset's colours are kept; night keeps its moon;
polar day/night and an unplaced model fall back to the preset sun. Used when a
look is applied and at both ends of a transition.

**Deep link / SDK:** `?map=1&look=night` opens in a look; `look=daylight..night`
plays the transition once the scene is settled (`SdkSiteCommand.look / lookTo
/ lookDurationMs`). See EMBED_URL_PARAMS.md. The transition runs on rAF, so it
waits for the tab to be visible — a background embed shows it whole on arrival
(and in the hidden Claude pane it only advances while the pane is shown).

**The relief drape follows the style.** With terrain on, the patch was
draped with the raster OSM photograph whatever the style, so Dark/BIM/etc.
switched back to a bright photo exactly where the relief began. For vector
providers the terrain worker now paints each 256 px drape slot with the same
painter (`paintVectorSlot`, z14 ancestor overzoom via `basemap/tile-frame.ts`,
which is DOM-free so the worker never imports Leaflet). Place names are not
baked into the drape — the screen-space layer already names them.

**Placement minimap = the same cartography** (`basemap/leaflet-vector-layer.ts`).
The Leaflet minimap was the last raster-OSM map in the product (soft on Retina,
another style). A Leaflet `GridLayer` now paints each 256 px tile with the
same painter and style as the 3D basemap, at the device pixel ratio (verified:
320 px canvases at DPR 1.25), overzooming the z14 tile above z14
(`contentFrameFor`). A Leaflet tile at z is a style-zoom z−1 tile; pixelScale
= DPR. It follows the panel's basemap live; raster providers stay raster (with
`detectRetina`). TileJSON loading moved to `basemap/tilejson.ts` so the
minimap does not pull 3d-tiles-renderer into its chunk.

**The city when Overpass says no** (`omt-fallback.ts`, 2026-10-04). Overpass
is a shared public server: it rate-limits after a few loads in minutes and
answers "busy" at peak — and the surroundings then simply did not appear (hit
repeatedly during this work). On ANY Overpass failure (HTTP error, timeout,
busy `remark`) the worker now rebuilds the city from the basemap's own
OpenMapTiles z14 tiles (OpenFreeMap: OSM data, CDN, no key): building
footprints with `render_height`, roads by class with bridge/tunnel/ramp, rail,
water, parks, landcover — converted to pseudo-Overpass ways with the
equivalent OSM tags, so they flow through the SAME pipeline (as the Overture
extract already does). ~0.8 s for Poblenou (4 tiles, clipped to the query box:
9 732 ways, 6 257 buildings).

Rules learned on the way: OMT's default height (≤ 5 m, most of untagged
Poblenou came out at exactly 4 m) is dropped so the district height prior
decides; heights are tagged `note:height=estimated`; culverted/intermittent
waterways and drains are skipped (they cut blue lines across blocks); holes in
polygons are dropped like Overpass multipolygons. The thinner city (no trees,
furniture, facade colours, building parts) is said plainly in the panel
(`layers.buildingsFallback`) and credited ("OpenFreeMap © OpenMapTiles").
Dev QA: `localStorage['ifc-dev-force-fallback'] = '1'` skips Overpass.

**Screen-space place names** (`basemap/screen-labels.ts`, 2026-10-04). Point
labels — places, water names, POIs, house numbers — are no longer baked into
the ground: the painter hands them (per-layer budgeted) to a label layer that
draws them as sprites (`sizeAttenuation:false`, no fog, no tone mapping):
upright, constant CSS size, collision-resolved over the WHOLE screen, fading
in/out. Street names stay painted along their streets. Sprites, not an HTML
overlay, so the names appear in every capture (PNG, GIF, video).

- Only regions the engine is DISPLAYING contribute. GeneratedSurfacePlugin
  never calls the overlay's `setRegionVisible`, so visibility is read from
  `tiles.visibleTiles` → each mesh's texture → its region key.
- The label group lives at the SCENE ROOT; positions come from the tiles'
  matrixWorld. Under the basemap group the sprite shader would multiply by the
  Earth-sized scale.
- Screen quotas per layer (place 18, poi 12, water 6, housenumber 24): the
  per-tile budgets were not enough once a 3D view shows dozens of tiles —
  measured 32 names, mostly bus stops. Bus stops rank −45; POIs nearer the
  viewer (lower on screen) win.
- Sprites are rasterised only for names actually on screen (587 → 86 in the
  Poblenou view). Dev handle: `__screenLabels.debug()`.

**Presentation director:** not on this branch (`src/lib/director/` lives on
main / the `ifc-director` worktree). When merged, a "time of day" clip step is
`geo.animateLook(from, to, ms, suns)` — already promise-based for sequencing.

Status bar (bottom-left, `MapOverlays.tsx` + `map-readout.ts`): graphic scale
measured on the ground at the view centre (1-2-5 steps, "≈" because a tilted
3D view has no single scale) and the cursor's lat/lon, copied on click.

**Measured (Poblenou fixture, Chrome, 2026-10-03):** painting one 512 px tile
costs median **1.3 ms**, p90 **8 ms**, worst 15 ms. Before two fixes it was
p90 674 ms / worst 1.6 s: `closePath()` is linear in the current path's length
in Chrome (749 ms of an 831 ms tile), and one `fill()` over 20k footprints is
~18× slower than chunks of 256. Both are documented at the call sites.

**Known limits / next steps.** Street names are still ground-baked (by design,
they follow the street); place names moved to screen space (see below). Painting runs on the main thread (cheap now);
moving it to an `OffscreenCanvas` worker is the scale-out. The 2D placement
minimap now uses the vector painter too (see below).

**QA trap.** The library's queues are scheduled with `requestAnimationFrame`.
In a hidden/background pane rAF runs at ~1 Hz, so tiles appear at ~5/s and a
view takes ~30 s — that is the harness, not the product (measured: 3 rAF in
2 s with `visibilityState` still `visible`). Measure paint cost with
`imageSource.redraw(...)` timings instead (`__basemapTiles.plugins` → overlay).

**OSM tile policy.** Sharper raster LOD means more requests to
`tile.openstreetmap.org` (still comparable to Leaflet at DPR 1). It is another
reason the vector basemap is the default.

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
- **What showcase actually costs, measured 2026-08-09** on a city-centre
  feature set (320 ways ≈ 46 km of road, 24 electrified tracks, 2400 trees,
  120 green polygons, 90 signals), 1600×900, no terrain and no buildings in the
  scene so the numbers isolate these layers:

  | level | draw calls | triangles | programs | frame |
  |---|---|---|---|---|
  | simple | 19 | 606 k | 7 | 0.42 ms |
  | detailed | 21 | 665 k | 13 | 0.59 ms |
  | **showcase** | **15** | 849 k | 16 | **0.44 ms** |

  Showcase draws FEWER calls than either — one instanced mesh per silhouette
  replaces the seven colour-split car meshes and the trunk/canopy pair per tree
  species — so the authored props are not a cost, they are a saving. Build time
  is not comparable across a single run in that order: the ~70 ms
  `surface-textures` bake and the tree geometry caches land on whichever level
  runs first and needs them. The frame cost that matters in this scene is the
  terrain shader (2–9 ms, measured separately), not these layers.
  `MAX_LAMPS` was raised from 900 to 3000 off the back of this: the real demand
  was 961, so the cap was truncating a real scene — and it truncates in Overpass
  order, which is spatially arbitrary, so the symptom is half a map lit and half
  dark rather than uniformly sparse.
- **Community PBR assets: surveyed 2026-08-09, and deliberately NOT adopted for
  the ground.** The candidates are genuinely good and genuinely free — Poly
  Haven and ambientCG are both CC0, no attribution, redistribution and bundling
  into a product explicitly permitted, so licensing is not the obstacle. Size
  is. One 1K PBR set is 5–10 MB as published, ~1.5–3 MB trimmed to the three
  maps we would use; the five families here (grass, sand, rock, water, asphalt)
  come to roughly **7–15 MB**, or ~2–4 MB re-encoded to KTX2/ETC1S plus a
  ~250 KB transcoder. `surface-textures.ts` bakes the same five at 256² in
  ~70 ms and downloads **zero bytes** — and it is hex-tiled, so it does not
  repeat across a 400 m river the way a photo tile does. The whole authored
  showcase set is 136 KB; photo ground would be 15–100× the entire budget for a
  gain that mostly disappears at the distances this map is viewed from. Revisit
  only if street-level walkthroughs become a real use case, and then as an
  opt-in level of its own, never as a default.
- **Do not import community low-poly kits into `public/models/props`.** Kenney's
  city kits and similar are CC0 and comparable in per-model size (~1.9 MB for
  25–70 models), but they are texture-atlased and stylised for games, and
  importing them would forfeit the two properties that keep this set at 136 KB
  and reviewable: colour lives in the vertices, and **the script is the source
  of truth** — an asset's diff is the diff of the code that made it. Authoring
  one more asset in `build-props.py` costs about as much as importing one.
- Already evaluated and rejected as dependencies, for the record:
  THREE-CustomShaderMaterial (the `onBeforeCompile` technique it wraps is used
  directly), `three-hex-tiling` (supports three 0.151–0.173; this project is on
  0.184 — the algorithm is implemented by hand instead), TSL/WebGPU (needs
  `WebGPURenderer`, which would cost the `PostproductionRenderer` the whole
  viewer depends on), and HDRI environments (the procedural sky in
  `sky-environment.ts` follows the user's chosen sun, which a fixed-time HDRI
  cannot).
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

### How high a georeferenced IFC stands (2026-10)

`vertical-frame.ts`, `dem-sources.ts`, `multi-placement.ts`, applied in
`geo-system.applyPlacement`/`placeSatellites`.

- **Elevation source by site.** `dem-sources.ts` picks the ICGC *Model d'Elevacions
  del Terreny 5 m* inside Catalonia and the global terrarium mosaic elsewhere. ICGC
  is bare earth, so the lower-envelope opening (meant to strip buildings from a
  surface model) is skipped for it. Measured over Pl. Catalunya, the ICGC model
  agreed with the stated `OrthogonalHeight` of eight surveyed IFCs within
  ±0.5 m at their origins. The global mosaic was 7–15 m high there.
- **A file states the height of its origin (H). The ground there has a height
  (E).** The floor goes `H − E` above the ground **under the origin**, not under
  the middle of the bounding box: a monument's sunken steps or a metro
  entrance's stair put those 1–3 m apart. If H and E differ by more than 5 m
  (`DEM_AGREEMENT_M`), the DEM is not believed and the model is stood on the
  terrain. A model is never sunk: a DEM above the stated floor also stands it
  on the ground. Before this, every model was raised H above the map, as if the
  ground everywhere were at sea level, so Pl. Catalunya floated 15–19 m up.
  The coast (Hotel Vela, H 2.5 over a quay at ~2.7) was right only by luck.
- **The ground is the same with or without relief.** With terrain on, E comes
  from the patch. Without it, a single DEM sample is used
  (`elevation.sampleElevation`). Switching terrain never moves the building.
- **Files of one project move as one.** Satellites whose georeference matches
  the anchor's (same `IfcMapConversion`, `georefKey` from the App resolver) get
  exactly the anchor's transform. Before this, the Hotel Vela's architecture
  and structure were placed by their own bounding boxes and floated 8.4 and
  9.8 m above its MEP, by the depth of their basements.
- **Other satellites stand on their own origin**, on the terrain under it plus
  their own `H − E` (on the flat map, level with the anchor's floor).
- **Satellite placement is computed from the file, not from where it was
  moved.** The resolver strips the satellite offset from the bounds before
  `placementFromExtraction`. Reading the moved bounds as project coordinates
  made every re-placement (a pan, a terrain rebuild) push the model one offset
  further. Measured: 250 m per call.
- **DEV:** `__geoVerticalDebug()` returns the last decision: stated H, the lift
  applied, the anchor model and its origin, and the DEM values used.

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

### What OSM maps, and what is actually there to look at

OSM maps the whole solid, and a renderer that draws everything it can classify
draws a great deal that nobody standing on the site can see. Three rules, all
measured on the Parc de la Ciutadella box (7267 elements, Barcelona):

- **Nothing below the surface.** `tunnel=*`, `location=underground`,
  `indoor=yes` — 100 roads, 50 railways, 61 indoor ways and 3 culverted streams
  in that one box, which drew as a network of phantom streets under the park and
  a stream through the zoo. `isBelowSurface` in `osm-features.ts`. **`layer` is
  deliberately not consulted**: a negative layer is what an ordinary street
  carries where a bridge crosses it, and using it would delete real streets in
  every city with a flyover. `covered=yes` also stays — an arcade is the ground
  floor of the street.
- **An area is an area.** A closed `highway=*` with `area=yes` is a square, an
  esplanade or a pedestrianised street, and it is PAVED, not ribboned: 83 of
  them in the box, and ribboning the Passeig de Lluís Companys drew a 3 m
  footpath around its outline and left the middle showing the basemap. The fill
  shares the platform path in `buildLinearLayer` and skips the platform's
  painted edge.
- **The canopy does not plant on ground that is taken.** A park polygon covers
  its own lake and its own pavilions, because OSM draws the park outline first
  and the lake on top; seeding the outline put 83 trees in the water (31 in the
  big lake) and 300 through roofs. `buildKeepOut` in `tree-seeding.ts` indexes
  the water and building rings once per site and the seeder asks it per tree.
  Water and buildings only — a canopy that refused to cross a road would strip
  every avenue in the city.

### Monuments the outline cannot describe

`building=triumphal_arch` / `man_made=arch` builds an ARCH — two piers, an attic
and an opening — from the oriented box of the footprint, not a solid extrusion
of it. The Arc de Triomf is a 38-vertex outline with `height=29`, and extruded
like any other building it is a 29 m brick cube: the one landmark on that site
everybody recognises, drawn as the one thing it is not.

The oriented box comes from `orientedFootprint`, which is a real minimum-area
rectangle (every ring edge tried; the minimum has a side collinear with a hull
edge). Neither "longest edge" nor "longest diagonal" is good enough — on
Barcelona's diagonal grid both point somewhere between the monument's two axes,
and a 20° error puts the opening through a corner.

This is a SHORT list on purpose. It is the seam where "we model named
landmarks" would begin, and that is a different product; what belongs here is
only tags that state a form outright.

### Where the model and the map describe the same building

The mapped building and the surveyed one are two descriptions of one piece of
ground, and where they overlap the model wins — it is the subject, and OSM is
context. `context-suppression.ts` decides that, and it asks **three** questions,
because one shape can stand inside another in three different ways and each was
found the hard way:

1. **The mapped feature is inside the model.** ≥ 60 % of its vertices fall in
   the model's plan. The ordinary case: a small block under a tower.
2. **The model is inside the mapped feature.** The model's centre falls in the
   OSM ring. This is the temple-precinct case — one outline drawn around a whole
   complex, with not a single vertex anywhere near the model, so question 1
   scores zero however large the margin.
3. **Neither contains the other, but the plans overlap.** They share at least
   30 % of the smaller plan. Vertex coverage cannot express this: a rectangular
   neighbour has only 0/0.25/0.5/0.75/1 available, so any mapped hall that
   pushes two of its four corners into the model survives question 1 however
   deep it reaches, and question 2 never fires because the model's centre is
   still on its own side of the wall. What that looked like: a mapped block
   standing through the east flank of a surveyed temple.

Questions 2 and 3 are both guarded by `CONTAINMENT_AREA_RATIO` (6): an OSM
polygon more than a few multiples of the model's own plan is a block, a campus
or a `landuse` district, not a description of this building, and deleting one
because a model sits in it or clips its corner is a far worse artefact than a
redundant polygon. That case is meant to be solved by hiding the feature by
hand, not by widening the rule.

WHAT is suppressed still depends on what the model IS (`FacilityKind` →
`DEFAULT_POLICY`): a building takes the building on its plot and the trees
standing in its plan, never the street outside; a bridge takes the mapped bridge
and the carriageway it carries. All three questions run inside that policy.

The arithmetic is done about the model's own centre, for the reason the next
section gives.

### Traps that cost real debugging time

- **Triangulate in METRES, not normalized units.** A 20 m wall is ~3e-8 in the
  normalized planar frame — close enough to earcut's degeneracy epsilon that
  most footprints collapse to zero triangles and vanish silently. Measured:
  437 of 3944 buildings survived before this was fixed. The triangulation is
  topological, so its indices apply unchanged to the normalized ring.
- **Shoelace formulas need a LOCAL origin in the normalized frame — the same
  trap as the one above, one function further on.** A centroid or an area
  computed straight from normalized coordinates is a difference of numbers that
  agree to thirteen significant digits: a 4.65 m shrine spans ~1e-7 sitting at
  an absolute x of ~0.38, so `a.x * b.y - b.x * a.y` keeps two or three bits of
  signal and the quotient `cx / (3 · area)` lands anywhere. Measured at
  Kiyomizu-dera: the centroid came out **1151 m** from the building. Only an
  INFERRED pitched roof reads the centroid (the pyramidal apex and the gabled
  ridge are placed relative to it), so every flat-roofed block was fine and the
  bug hid until a site full of `building=shrine` rendered — as kilometre-long
  dark blades fanning across the map. `ringCentroid` and `polygonArea` now
  subtract the first vertex first; the degeneracy epsilon in `ringCentroid` had
  to become RELATIVE to the ring's own size at the same time, because a healthy
  building's area is ~1e-14 in this frame and a fixed `1e-18` was meaningless.
  Regression: "keeps an inferred pitched roof on top of the building that has
  it" in `building-mesh.test.ts`, verified failing without the fix.
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
- **Metres → normalized has a cosine, and its direction is invisible when
  wrong.** Mercator inflates distance by `1/cos(lat)`, so a ground metre is
  `1/(cos φ · WORLD_M)` normalized, and `geoRoot` scales by `WORLD_M · cos φ` to
  bring it back. Flip it and *everything still renders* — at `cos²(lat)` of its
  real size: correct at the equator, 43 % in Paris, invisible in Tromsø.
  Nothing throws and no single-module test notices; the only symptom is that
  the props look like toys. `props-scene.ts` shipped with it backwards and
  nobody saw it, because the scenery layer is off by default. There is now ONE
  `metresToNormalized` in `geo-math.ts` with a round-trip test at five
  latitudes. Do not write a private copy.
- **Reading a rotation off an instance matrix needs `decompose`, not
  `setFromRotationMatrix`.** Every instance matrix in the geo layers carries the
  ~4e-8 metres-to-normalized scale, and `setFromRotationMatrix` assumes a pure
  rotation — it returns near-identity whatever the real yaw is. Two placement
  tests were passing without checking anything because of this.
- **Blender: rotating a part that is already positioned swings it around the
  world origin.** Setting `rotation_euler` and then applying the transform
  displaces the mesh instead of turning it in place. The export succeeds, the
  triangle budget passes, the GLB is valid and the right size — the street
  lamp's arm shipped six metres down the street and four metres in the air, and
  the only way to find it was to measure the result. `build-props.py` builds
  every primitive at the origin and translates afterwards; use `spin()` /
  `squash()` for any further rotation or scale, never the raw ops.
- **Authored assets are checked against a tape measure, not a file size.**
  `scripts/blender/props-assets.test.ts` asserts every asset's extents in
  metres and that its base sits on `z = 0`, and asserts the table covers
  `PROP_ASSETS` exactly — iterating the table alone let a new asset skip the
  check, which is how the broken lamp survived. `PROP_ASSETS_KB` is checked in
  BOTH directions: an over-estimate passes a `<=` forever and still misinforms
  the person deciding whether to download.
- **Boats are the one family whose `z = 0` is NOT the ground.** `boat-*` is
  authored with `z = 0` at the waterline and the hull below it
  (`finish(..., bake_origin=True, waterline=True)`), and `loadOne()` skips its
  re-grounding for them. That skip is exact only because the node carries no
  transform; the asset test asserts both the identity node and that `z = 0`
  cuts every hull, so a boat quietly dropped onto the water fails.
- OSM is volunteer-mapped and uneven: a missing park is not an empty field.
  Report what was found; never let the UI imply absence of data means absence
  of the thing. Roof shapes are the clearest case — in Paris only 20 of 1254
  buildings tag `roof:shape` at all.
