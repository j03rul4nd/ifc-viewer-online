# GIS / Map Integration Plan

**Feature:** Optional GIS / Map mode — visualize loaded IFC models on real-world basemaps and terrain, inside the existing viewer.
**Status:** Design complete — ready for implementation.
**Date:** 2026-06-10
**Audience:** Implementing engineers and AI agents. Each task in §7 is independently executable.
**Repo facts verified against:** `src/lib/viewer.ts` (2,135 lines), `src/App.tsx`, `src/stores/*`, `src/workers/validator.worker.ts`, `src/i18n/*`, `vite.config.ts`, `package.json` as of commit `c2b09fd`.

---

## 0. How to use this document

- §1–§4 are **context and architecture**. Read them fully before touching code. They contain the coordinate math and the invariants that every task depends on.
- §5–§6 define **user flows and state**. The store shape in §6 is normative — do not invent additional state.
- §7 is the **task breakdown**. Tasks are grouped in phases; tasks within a phase note their dependencies. Every task lists objective, files, risks, expected bugs, debugging guide, acceptance criteria, and rollback.
- §8–§13 are **cross-cutting specs** (risk, UX, i18n, performance, testing, definition of done). Acceptance criteria in §7 reference them.
- Appendices A–C contain the **provider licensing research**, the **IFC georeferencing reference**, and **external references**.

Conventions used below:

- "Mode A" = today's standard IFC visualization. "Mode B" = GIS/Map mode.
- "Anchor" = the single geographic point (lat/lon + height + rotation) that ties the three.js scene to the Earth.
- All file paths are relative to repo root. All code blocks are TypeScript unless noted.
- `MUST` / `MUST NOT` are hard requirements; violating one fails review.

---

## 1. Executive context

### 1.1 Why this feature exists

The product is a 100% client-side IFC viewer + validator whose wedge is the **IFC Health Score**. Map mode adds the one visualization capability users repeatedly expect from "serious" BIM platforms (Trimble Connect, Catenda, Dalux, ArcGIS GeoBIM all offer geographic context) and that no free, no-account, client-side viewer currently offers well: **see your building where it actually stands**.

It also closes a product loop that already exists in the codebase: the validator already detects georeferencing problems (`RULE_COORDINATE_OFFSET` in `src/workers/validator.worker.ts:2040-2090`, remediation corpus entries about `IfcMapConversion` in `src/i18n/rule-remediation.ts`). Today we *tell* users their georeferencing is broken; with map mode we can *show* them — and let them fix the placement interactively. Map mode is therefore not just a viewer feature; it is a **visual extension of the Health Check**: "your file says this building is at Null Island — here's what that looks like."

### 1.2 Product goals

1. **Optional, default OFF.** Mode A is untouched. A user who never clicks the Map button experiences zero change — zero new bytes on the critical path (the GIS chunk is lazy-loaded), zero behavioral differences, zero new network requests.
2. **Zero infrastructure cost.** Only free, keyless providers by default. No API keys shipped, no proxy servers, no map bills. Users may bring their own provider (custom XYZ/WMTS template) for premium imagery.
3. **Privacy posture preserved.** The IFC model NEVER leaves the browser. Map mode adds outbound requests for *public map tiles only* (tile coordinates necessarily reveal the approximate site location to the tile provider). This MUST be disclosed in the UI before the first tile request (§5.1, §9.6) because "your data never leaves your machine" is a core marketing claim.
4. **Honest with broken data.** Most real-world IFCs are badly georeferenced (see Appendix B.4). The feature must degrade gracefully through a ladder of fallbacks ending in manual placement — never silently place a model at a wrong location and never hard-fail.
5. **Production-grade.** Deterministic state machine, cancellation-safe async, bounded memory, full disposal on exit, i18n from day one (EN + ES), typed analytics, tests at every layer.

### 1.3 Strategic note (read before scheduling)

Per the current product strategy (Health-Score-as-moat, viewer features = commodity), this plan is a **design artifact to be executed when consciously scheduled** — it is intentionally complete so implementation can start at any time with minimal re-derivation. Two on-strategy framings when it ships: (a) map mode as the *visual remediation tool* for georeferencing issues found by the Health Check (differentiated, not commodity), and (b) map mode in the embeddable viewer/SDK as a B2B differentiator. A "GIS viewer for its own sake" framing is explicitly NOT the goal.

### 1.4 What must not break (hard invariants)

- **INV-1:** With map mode off, no GIS code executes and no GIS chunk loads. `npm run build` output for the entry chunk grows by < 5 KB (the lazy-loading stub, store, and toolbar button only).
- **INV-2:** Enabling map mode MUST NOT mutate any model's pivot transform, selection state, hidden categories, validation results, measurement entities, or clipping planes. The map aligns itself to the model — never the reverse — unless the user explicitly uses the placement editor or accepts a "re-center" suggestion.
- **INV-3:** Disabling map mode restores the exact prior scene environment (camera near/far, fog, background, controls limits) and frees all GPU resources acquired by GIS (`renderer.info.memory` returns to within tolerance of the pre-enable snapshot; see §12.4).
- **INV-4:** All existing tests stay green; `tsc -b` stays clean; no new ESLint suppressions without justification.
- **INV-5:** Model bytes, model-derived coordinates beyond tile indices, file names, and validation results are never sent to any map/geocoding provider.
- **INV-6:** Attribution for active map providers is always visible while tiles are on screen — including in embed/kiosk chrome. This is a license obligation, not a styling choice.

---

## 2. Current architecture analysis

This section documents what the implementing agent must know about the existing system. All claims verified by reading the code.

### 2.1 Rendering architecture & viewer lifecycle

- The viewer is a **closure factory**, not a class: `createViewer(container: HTMLElement): ViewerAPI` in `src/lib/viewer.ts:602`. All Three/ThatOpen objects live in closure scope. The public surface is the `ViewerAPI` interface (`src/lib/viewer.ts:154-349`).
- That Open setup (`viewer.ts:604-641`):
  - `OBC.Components` → `OBC.Worlds` → one `world` typed `<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>`.
  - Renderer: `OBCF.PostproductionRenderer` (postproduction off by default, toggled by `setRenderQuality`). Shadow map PCF, ACES tone mapping, sRGB output.
  - Scene: background `0x0A0A0C`, `THREE.Fog(0x0A0A0C, 80, 200)`, hemisphere + 2 directional lights, `OBC.Grids` infinite grid.
  - Camera: `OBC.OrthoPerspectiveCamera` — wraps the `camera-controls` library (`world.camera.controls`), supports perspective/ortho projection switching (`cam.set('Orbit')`, used by storey views). `dollyToCursor = true`, `dollySpeed 0.8`, `truckSpeed 1.5`.
- **That Open has NO map/GIS support.** Verified: no map-related component in `@thatopen/components` 3.4.x; the community has an open request (ThatOpen/engine_components issue #258 "how to make mapbox and ifc view together"). The old IFC.js-era Mapbox examples inverted rendering ownership (three.js inside Mapbox's GL context) and do not apply to the current Fragments/Components architecture. **All map rendering must be added by us, inside our own three.js scene.**
- **Update loop:** `components.init()` starts OBC's internal RAF loop. Fragments need explicit refresh: `fragmentsManager.core.update()` is called on camera `control`/`rest` events (`viewer.ts:678-680`) and after mutations. The OBC renderer exposes `onBeforeUpdate` / `onAfterUpdate` events (OBC `BaseRenderer`); nothing in our code uses them yet — the GIS system will (verify in T0).
- **Scene-scale tuning:** `tuneSceneToBounds(box)` (`viewer.ts:648-673`) re-tunes camera near/far, fog near/far, and the shadow frustum to the model bounding box on every load. **Map mode must suspend this** (a 30 m house would otherwise get a 180 m fog wall in front of a 20 km basemap) — see T9.
- **Per-model pivots:** every loaded model gets a `THREE.Group` pivot (`modelPivots: Map<string, THREE.Group>`); `setModelTransform/resetModelTransform/getModelTransform/getModelBounds` operate on it (degrees for rotation). This is the existing, store-mirrored mechanism for moving models — manual re-centering of far-from-origin models reuses it.
- **Disposal:** `viewer.dispose()` removes canvas listeners, disposes measurement/clipper, then `components.dispose()`. The GIS system must hook here (T6).

### 2.2 Model loading & data access

- Load pipeline: `useIfcLoader` (`src/lib/loader.ts`) → OPFS cache check → `ifc-parser.worker.ts` (IFC → Fragments binary) → `viewer.loadFragments()`. Multiple models can coexist (`loadFragments` does not tear down).
- **Raw IFC bytes are retained per model**: `modelRegistry.getBuffer(modelId)` (`src/lib/model-registry.ts:110`) returns the original `ArrayBuffer` (may be empty for legacy cache-only loads — callers must size-check). The validator worker and IDS runner already consume it this way. **The georeferencing extractor will use the same pattern** (web-ifc inside a dedicated worker fed by this buffer).
- web-ifc is already a dependency (`web-ifc@^0.0.77`) and is used raw (STEP-level) in `validator.worker.ts` — including `GetLineIDsWithType`, `GetLine`, type constants (`IFCSITE`, etc.). `IFCMAPCONVERSION` and `IFCPROJECTEDCRS` constants exist in web-ifc's IFC4 schema surface.
- Workers are instantiated as `new Worker(new URL('../workers/x.worker.ts', import.meta.url), { type: 'module' })` (7 existing workers follow this exact pattern).
- Cache keying: `buildCacheKey(file)` = `"${fileName}:${size}:${lastModified}"` (`src/lib/opfs-cache.ts`) — reused for placement persistence (T13).

### 2.3 State management

- 9 Zustand stores with `devtools` middleware, serializable-only state, named actions, exported selectors (see `src/stores/`). Non-serializable per-model data lives in `modelRegistry` (plain module Map).
- UI panel pattern (from `uiStore.ts`): boolean `xPanelOpen` + `setXPanelOpen/toggleXPanel`, consumed in `App.tsx`, rendered as floating panels positioned over the viewport.
- `sceneStore` mirrors viewer pivot transforms (`SceneModel.transform`) — UI source of truth for model transforms; the viewer is the geometry source of truth. The GIS placement editor must keep this mirroring discipline (geoStore mirrors what geo-system applies).

### 2.4 UI system & design language

- Tailwind (dark theme, bg `#0A0A0C`), Radix primitives (dialog, tabs, switch, tooltip), `lucide-react` icons, CSS var accent (`--accent`, default indigo `#5E6AD2`), framer-motion for panel transitions. Toolbar buttons are plain props callbacks (`onOpenIds`, `onOpenEmbed`, … in `Toolbar.tsx:24-36`); modal open flags live in `App.tsx` local state; panels live in `uiStore`.
- i18n: i18next; namespace JSONs under `src/locales/{lng}/{ns}.json`; EN bundled eagerly in `src/i18n/config.ts` (`EN_RESOURCES` + `ns` array), other locales lazy via `loadLocaleNamespace` (`src/i18n/lazyLoader.ts` — a bare dynamic-import template, so **every locale folder must contain every namespace file** or the import rejects). 10 locales exist; this feature ships real strings for EN + ES only (§10).
- Feature gating convention: build-time env (`import.meta.env.VITE_*`, cf. `VITE_REPORT_URL` usage). There is no runtime flag system. GIS uses `VITE_FEATURE_GIS` (T1).

### 2.5 Analytics, toasts, errors

- PostHog wrapper with one typed function per event (`src/lib/analytics.ts`, `trackXxx(props)` pattern, ~19 events). Cookieless (`persistence: 'memory'`).
- Toasts via `toast` / `toastFromError` from `src/stores/toastStore.ts`. Logging via `createLogger(tag)` (`src/lib/logger.ts`). Error helpers: `safeVoid` (`src/lib/errors.ts`).

### 2.6 Build & test

- Vite 6, `tsc -b` strict, vitest (jsdom) — 140+ tests. `manualChunks` splits `vendor-three`, `vendor-ifc`, `vendor-ui` (`vite.config.ts:223-233`). GIS deps must land in a **separate lazy chunk** (dynamic import gives this for free; verify chunk name in build output — T6 acceptance).
- Deployed on GitHub Pages under a base path (`import.meta.env.BASE_URL` is used in routing) — **everything client-side, no server**. Map mode must work from static hosting: all providers must be CORS-enabled public endpoints (the ones selected in Appendix A are).

### 2.7 Reusable systems inventory (do not reinvent)

| Need | Existing system to reuse |
|---|---|
| Raw IFC bytes for parsing | `modelRegistry.getBuffer(modelId)` |
| Worker pattern + Zod-validated messages | `src/workers/*.worker.ts`, `src/lib/worker-schemas.ts` |
| Model transform + UI mirror | `ViewerAPI.setModelTransform` + `sceneStore` |
| Per-file persistence key | `buildCacheKey` (`opfs-cache.ts`) |
| Panel UI pattern | `MeasurementPanel.tsx` / `ScenePanel.tsx` + `uiStore` flags |
| Typed analytics | `src/lib/analytics.ts` |
| Toast + logger + safeVoid | `toastStore.ts`, `logger.ts`, `errors.ts` |
| Camera fit / presets | `world.camera.controls` (camera-controls), `fitToBox` |
| Scale-adaptive scene env | `tuneSceneToBounds` (needs a suspend hook — T9) |
| Georef *detection* messaging | `RULE_COORDINATE_OFFSET` + remediation corpus |

---

## 3. GIS architecture proposal

### 3.1 Decision summary

| Decision | Choice | Status |
|---|---|---|
| Where map renders | **Inside the existing three.js/OBC scene** (single renderer, single camera) | Final |
| Tile engine | **`3d-tiles-renderer` (NASA-AMMOS)** planar XYZ raster tiles, wrapped behind our own `BasemapEngine` interface | Final (plugin API pinned in T0 spike) |
| Terrain | **AWS Terrain Tiles (terrarium PNG, keyless)** → custom fixed-extent displaced-grid patch built in a worker; flat basemap beyond the patch | Final |
| Coordinate frame | **Local anchor frame**: anchor (lat₀, lon₀) ≙ scene origin; tiles recentered + scaled by cos φ₀ so 1 scene unit = 1 true meter | Final |
| CRS conversion | **proj4js** + bundled common EPSG defs + user-pasteable proj4 string | Final |
| Georef extraction | **Dedicated `geo-extract.worker.ts`** using web-ifc on `modelRegistry` bytes (validator-worker pattern) | Final |
| State | New **`geoStore`** (Zustand) + `createGeoSystem` closure owning Three objects (mirrors viewer pattern) | Final |
| Default providers | OSM streets (default), OpenTopoMap topo, satellite = explicit opt-in (Esri/EOX with terms notice) or BYO, NASA GIBS low-res fallback | Final |
| Feature flag | `VITE_FEATURE_GIS` build-time env | Final |

### 3.2 Scene architecture

One renderer, one camera, one scene. GIS adds a single subtree, fully owned by the geo system:

```
world.scene.three
├── (existing) per-model pivot Groups            ← untouched (INV-2)
├── (existing) lights, grid, selection helpers   ← grid hidden while map mode on
└── geoRoot: THREE.Group                         ← created on enable, removed+disposed on disable
    ├── basemapGroup: THREE.Group                ← BasemapEngine output (streamed flat tiles)
    │   └── TilesRenderer.group (3d-tiles-renderer)
    └── terrainGroup: THREE.Group                ← optional 3D terrain patch (T14/T15)
        └── 3×3..5×5 displaced grid tiles + draped imagery
```

`geoRoot` carries the **whole** geographic transform (recenter translation, cos φ₀ scale, true-north rotation, height offset). Model pivots are never modified by map mode (INV-2). Inverting the mental model — "the user drags the building on the map" is implemented as the inverse transform applied to `geoRoot` — keeps every existing feature (selection, validation overlays, measurements, BCF viewpoints, exports) byte-identical between Mode A and Mode B.

Why this direction (map moves, model stays):

- Mode A artifacts (saved BCF viewpoints, measurement positions, camera presets) reference model-space coordinates. Moving models would corrupt them.
- The model is near the origin (or the user is told to re-center it) → float32 precision is preserved where it matters: on the geometry the user inspects and measures.
- Multi-model federation keeps working: all models keep their relative positions; the single map aligns to the anchor model (§4.6).

### 3.3 Tile engine: alternatives considered

| Option | Verdict | Reasoning |
|---|---|---|
| **A. `3d-tiles-renderer` (NASA-AMMOS) inside our scene** | ✅ **Chosen** | Actively maintained (NASA JPL); Apache-2.0; three.js-native; ships XYZ/TMS/WMTS raster tile support with planar projection (`XYZTilesPlugin` historically, `GeneratedSurfacePlugin` + `XYZTilesOverlay`/`WMTSTilesOverlay` + `ImageOverlayPlugin` in newer releases — T0 pins the exact API for the version we lock); built-in LOD/streaming/LRU cache/`UnloadTilesPlugin` GPU budget/`TilesFadePlugin`; future upgrade path to real 3D Tiles (cities, BYO Cesium ion via `CesiumIonAuthPlugin`, quantized-mesh terrain via `QuantizedMeshPlugin`). We do not hand-roll a tile quadtree, abort handling, or cache eviction. |
| B. `geo-three` (tentone) | ❌ Rejected as dependency, ✅ kept as design reference | Exactly our use case (slippy tiles + height tiles in three.js, MIT) but last npm release ~2 years old; provider classes assume API-key services; LOD heuristics less battle-tested. Its `MapView`/provider split inspired our `MapProvider` registry. If `3d-tiles-renderer`'s image-tiles API proves unfit in T0, the fallback is a ~400-line in-house quadtree modeled on geo-three (`SimpleQuadtreeBasemap`, same `BasemapEngine` interface). |
| C. MapLibre GL JS + three.js custom layer | ❌ Rejected | Inverts rendering ownership: MapLibre owns the canvas, camera, and projection; our scene would render inside MapLibre's WebGL context via a custom layer. Incompatible with `OBCF.PostproductionRenderer` (full-frame pipeline), `camera-controls`, OBC raycasting, clipper, measurement — essentially a viewer rewrite. MapLibre stays interesting only as a *future* 2D minimap (out of scope). |
| D. CesiumJS dual-canvas (Cesium below, three.js above, synced cameras) | ❌ Rejected | Two render engines, double GPU memory, camera sync is a permanent source of one-frame lag and projection mismatch; Cesium's terrain/imagery quality is excellent but its free assets funnel through Cesium ion (account + token; commercial use beyond community tier is paid) — conflicts with the cost constraint. Revisit only if photorealistic 3D city context becomes a paid feature. |
| E. Static single-image basemap (one stitched texture on a plane) | ❌ Rejected as the *only* mode | No zoom continuity, blurry close-up or enormous download. But the *terrain patch* (Tier 2, §3.5) deliberately uses a bounded version of this idea — fixed extent, stitched imagery per DEM tile — because near-field context has bounded extent by definition. |

### 3.4 BasemapEngine abstraction (our seam against upstream churn)

The geo system never imports `3d-tiles-renderer` types outside one file. Everything goes through:

```ts
// src/lib/geo/basemap-engine.ts
export interface BasemapEngine {
  /** Attach to scene; starts streaming. Idempotent. */
  start(opts: {
    provider: ResolvedProvider          // url template, tileDimension, maxZoom, attribution
    anchor: MercatorAnchor              // anchor in EPSG:3857 meters + cos(lat) scale factor
    parent: THREE.Group                 // basemapGroup
    camera: THREE.Camera
    renderer: THREE.WebGLRenderer
  }): void
  /** Per-frame: LOD update, fetch scheduling. Call before render. */
  update(): void
  /** Swap imagery source without rebuilding the quadtree where possible. */
  setProvider(provider: ResolvedProvider): void
  /** Re-register camera after OrthoPerspectiveCamera projection swaps. */
  setCamera(camera: THREE.Camera): void
  setOpacity(o: number): void
  /** Current attribution strings of everything on screen. */
  getAttributions(): string[]
  /** GPU bytes estimate for the memory HUD / budget enforcement. */
  getGpuBytesEstimate(): number
  /** Detach + dispose EVERYTHING (geometries, textures, caches, in-flight aborts). */
  dispose(): void
}
```

Concrete implementation `TilesRendererBasemap` (T7). Contingency implementation `SimpleQuadtreeBasemap` (only if T0 fails — see T0 exit criteria).

### 3.5 Terrain system (two tiers)

**Tier 1 — flat basemap (always on in map mode):** the streamed XYZ raster quadtree on a plane at ground height. Cheap, infinite extent, covers the "where is my building / what's around it" need.

**Tier 2 — 3D terrain patch (optional toggle, default off):** real relief for the site surroundings.

- Source: AWS Terrain Tiles, terrarium encoding — `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Free, keyless, CORS-enabled, AWS Open Data program. Decode: `elevation_m = (R*256 + G + B/256) − 32768`.
- Fixed extent: N×N DEM tiles at fixed zoom around the anchor (default 3×3 at z14 ≈ 7.3 km × 7.3 km at the equator, scaling with latitude; configurable to 5×5). **No streaming LOD for terrain** — uniform grid resolution per tile (e.g. 128×128 segments) means adjacent tiles share edge vertices exactly → **no cracks, no skirts needed, no LOD-seam class of bugs**. This is a deliberate scope cut that removes the hardest 30% of terrain engineering for <5% of the user value.
- Imagery drape: per DEM tile, fetch the 2^(zi−zd) × 2^(zi−zd) imagery tiles covering it (default zi = 16 → 16 imagery tiles per DEM tile, 144 requests for 3×3 — budgeted, throttled to 6 concurrent) and stitch them into one 1024² texture in the worker via `OffscreenCanvas`. One draw call per DEM tile, 9 total.
- All decode + geometry building in `geo-terrain.worker.ts`; transfers `Float32Array` position/normal/uv buffers + `ImageBitmap` textures back (zero-copy).
- While terrain is on, the flat basemap continues *outside* the patch (the patch occludes the flat tiles beneath it; a subtle opacity fade ring on the patch edge hides the seam — §9.4).
- Why not Cesium quantized-mesh (`QuantizedMeshPlugin` exists in the tile engine): there is **no free keyless quantized-mesh endpoint** — Cesium World Terrain requires an ion account/token. Documented as a BYO-endpoint follow-up, not v1.

### 3.6 Geolocation system (extraction)

A dedicated worker (`src/workers/geo-extract.worker.ts`) parses the original IFC bytes with web-ifc and walks the **georeferencing ladder** (full algorithm in §4.3, IFC entity reference in Appendix B):

1. `IfcMapConversion` + `IfcProjectedCRS` (IFC4/4x3 — LoGeoRef50)
2. `ePSet_MapConversion` / `ePSet_ProjectedCRS` property sets (IFC2x3 convention)
3. `IfcSite.RefLatitude/RefLongitude/RefElevation` (+ `TrueNorth` from the geometric representation context) (LoGeoRef20/40)
4. Nothing → `none` → manual placement flow

The worker returns a `GeorefExtraction` (typed, Zod-validated like other worker messages). A **cheap synchronous pre-scan** (regex over the STEP text for `IFCMAPCONVERSION`/`RefLatitude` patterns) runs at load time to power the "Georeferenced" badge without paying for a full parse (§7 T5); the full worker parse runs only when the user opens map mode or the geo panel.

### 3.7 Coordinate transformation system

Pure-function module `src/lib/geo/geo-math.ts` + `src/lib/geo/crs.ts` (proj4). Full math in §4. No Three.js imports in these modules → trivially unit-testable.

### 3.8 State architecture

`geoStore` (Zustand, serializable-only) is the single source of truth for *intent and status*; `createGeoSystem` (closure over Three objects, created lazily inside `viewer.ts`) is the single owner of *GPU resources*. The store never holds Three objects; the geo system never holds product state. Wiring lives in `App.tsx` effects (same discipline as `sceneStore` ↔ `ViewerAPI`). Full shape in §6.

### 3.9 Camera synchronization

There is only ONE camera (the existing `OrthoPerspectiveCamera`) — no synchronization between two views is needed, by construction. What map mode does manage:

- **Per-frame engine update:** `BasemapEngine.update()` hooked into the render loop — primary: `world.renderer.onBeforeUpdate` event; verified fallback: a geo-owned RAF (one-frame-late LOD is imperceptible). Pinned in T0.
- **Projection swaps:** `OrthoPerspectiveCamera` swaps `world.camera.three` between perspective and ortho (storey views call `cam.set(...)`). The engine must re-register the camera on swap (T9) or tile LOD selection silently breaks (symptom: tiles stuck at one zoom).
- **Scoped environment overrides** (applied on enable, snapshot-restored on exit — INV-3): far plane → ≥ 60,000 m; fog → pushed to ~0.5–0.9 × far (keeps the dark-theme horizon fade); `controls.maxDistance` → 30,000 m (precision guard, §4.7); `controls.maxPolarAngle` → ~88° (can't go under the map); `OBC.Grids` grid hidden; `tuneSceneToBounds` suspended via a lock flag so a model load during map mode doesn't clobber the horizon (T9).
- **Transitions:** entering map mode flies the camera with `controls.setLookAt(..., true)` (animated, same call style as existing presets) to a 45° aerial framing of the model + ~500 m context. Exit restores the pre-enable camera pose (snapshotted via `controls.getPosition/getTarget`).

### 3.10 Provider abstraction system

```ts
// src/lib/geo/providers.ts
export type MapLayerKind = 'streets' | 'satellite' | 'topo' | 'custom'

export interface MapProvider {
  id: string                    // 'osm', 'opentopomap', 'esri-imagery', 'eox-s2', 'gibs', 'custom'
  kind: MapLayerKind
  urlTemplate: string           // 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  attribution: string           // shown verbatim in the attribution pill (HTML-escaped)
  maxZoom: number
  tileDimension: number         // 256
  requiresTermsNotice: boolean  // true → user must acknowledge provider terms once (persisted)
  homepage: string
}
```

Registry of built-ins + one user-defined `custom` slot (URL template + attribution text, persisted in `localStorage`, validated: https only, must contain `{z}/{x}/{y}` or be a WMTS GetTile template). The custom slot is the **vendor-lock-in escape hatch**: any future paid/keyed provider works without code changes (key embedded in the user's own template, stored only locally). Full provider comparison and licensing analysis: **Appendix A**. Defaults: `streets=osm` (safe), `topo=opentopomap`, `satellite` has **no silent default** — the user explicitly picks Esri/EOX (terms notice) or configures custom (§9.3).

### 3.11 Scalability implications

- **Cost scale:** all default providers are keyless public services; our marginal cost stays zero at any user count. The risk that scales is *provider* rate-limiting (OSM tile policy). Mitigations: browser-side HTTP caching honored (providers send long cache headers), modest `errorTarget` (don't fetch deeper zoom than visually needed), no prefetch, provider abstraction makes a future self-hosted/paid swap a config change. See Appendix A.1.
- **Code scale:** GIS is one lazy chunk behind one interface seam (`BasemapEngine`) + one store. Upgrading or replacing the tile engine touches one file.
- **Capability scale:** the chosen engine natively supports real 3D Tiles — future city-model context (national 3D-tile programs: Switzerland, Japan PLATEAU…) and BYO Cesium ion plug into the same `geoRoot` without architectural change.

---

## 4. Coordinate system strategy (CRITICAL)

Read this section twice. Every placement bug traces back to one of these definitions.

### 4.1 The four coordinate spaces

| Space | Units | Axes | Where it lives |
|---|---|---|---|
| **S — Scene** (three.js world) | meters | Y-up, right-handed | `world.scene.three`; fragments meshes are already Y-up converted by the loader |
| **P — Project** (IFC engineering CRS) | model units (already normalized to meters by web-ifc geometry; attribute values need `IfcProject` unit scale) | Z-up in IFC; X-east-ish per project | The IFC file's `IfcGeometricRepresentationContext` WCS |
| **G — Grid** (projected CRS, e.g. EPSG:25832 UTM32N) | meters (check `IfcProjectedCRS.MapUnit`!) | X=Eastings, Y=Northings, Z=orthogonal height | What `IfcMapConversion` maps into |
| **W — Geographic** (WGS84 lat/lon, EPSG:4326) → **M — Web Mercator** (EPSG:3857) for tiles | degrees / mercator-meters | — | Tile indices: standard slippy scheme in M |

### 4.2 Transform chain

```
P --(IfcMapConversion: rotate γ, scale s, translate E₀,N₀,H₀)--> G
G --(proj4: projDef → EPSG:4326)--> W (lat, lon)
W --(webMercator)--> M (mx, my)
M --(recenter at anchor, scale by k₀ = cos φ₀)--> S (map side)
P --(IFC Z-up → three Y-up, identity translation)--> S (model side; already done by loader)
```

Key formulas (implement in `geo-math.ts`, all pure):

```
R = 6378137                                  // WGS84 / spherical mercator radius
mx = R · λ(rad)
my = R · ln(tan(π/4 + φ(rad)/2))             // valid |φ| ≤ 85.0511°
groundResolution(φ, z) = cos φ · 2πR / (256 · 2^z)   // m per pixel
k₀ = cos φ₀                                  // mercator→true-meter compensation at anchor
γ = atan2(XAxisOrdinate, XAxisAbscissa)      // grid rotation of MapConversion (rad, CCW from grid-east)
compoundAngle([d, m, s, μ?]) = sign·(|d| + |m|/60 + |s|/3600 + |μ|/3.6e9)
                                             // sign = sign of first non-zero component; all components share it
```

**Why scale the map and not the model (the cos φ decision):** Web Mercator distances are inflated by 1/cos φ relative to true meters. If we worked in raw mercator units, the IFC model (true meters) would have to be scaled UP by 1/cos φ₀ — corrupting every measurement tool, quantity readout, and exported transform. Instead the basemap group is scaled DOWN by k₀ = cos φ₀ about the anchor: **1 scene unit remains exactly 1 true meter at the anchor latitude**; measurements on the model stay exact; map distances are exact at the anchor and drift by ~0.008% per km north/south at φ=50° — irrelevant at site scale (< 25 km). Document this in code; never "fix" it by scaling models.

### 4.3 The georeferencing ladder (extraction algorithm)

The worker classifies each model into exactly one of these (first match wins). Quality maps loosely to LoGeoRef levels (Clemen & Görne) — see Appendix B.

| Rung | Source entities | Output | `GeorefExtraction.status` |
|---|---|---|---|
| 1 | `IfcMapConversion` (Eastings, Northings, OrthogonalHeight, XAxisAbscissa/Ordinate, Scale) + `IfcProjectedCRS` (Name like `"EPSG:25832"`, MapUnit) | E₀, N₀, H₀, γ, s, epsgCode | `found` (full) |
| 2 | `ePSet_MapConversion` + `ePSet_ProjectedCRS` psets on `IfcProject`/context (IFC2x3 convention) | same as rung 1 | `found` (full) |
| 3 | `IfcSite.RefLatitude/RefLongitude` (compound plane angles) + `RefElevation`; rotation from context `TrueNorth` if present, else 0 | lat, lon, h, γ_TN | `partial` (no CRS, position often coarse) |
| 4 | none of the above | — | `none` |
| any | data present but fails sanity gates (§4.4) | raw values kept for the debug panel | `invalid` |

Notes for the implementer:

- Rung 1: `IfcMapConversion.SourceCRS` must reference the model's `IfcGeometricRepresentationContext` (the 3D "Model" context). If multiple map conversions exist, prefer the one attached to the Model context; log others.
- Rung 1 unit trap: `Eastings/Northings` are in **TargetCRS units** (`IfcProjectedCRS.MapUnit`) and `Scale` converts project lengths to grid lengths. A file in mm with Scale 0.001 is common. Normalize everything to meters in the worker; emit normalized values only.
- Rung 3 sign trap: compound angles carry sign on the first non-zero component; southern/western hemispheres break naive `abs()` implementations. Unit-test ±.
- `TrueNorth` is a 2D direction `(DirectionRatios [x, y])` in the context's plan plane: γ_TN = atan2(x, y) … **verify sign with the rotation fixture (T2/T10)** — this is the single most commonly flipped value in BIM-GIS code.
- EPSG parsing: accept `EPSG:NNNN`, `urn:ogc:def:crs:EPSG::NNNN`, bare `NNNN` digits in `IfcProjectedCRS.Name` or `.Identifier`. Unknown/missing code with plausible E/N → `partial` + UI asks for CRS (§5.2).

### 4.4 Sanity gates (broken-file defenses)

Applied in the worker; failing values downgrade the rung (`found` → `partial`/`invalid`) and attach machine-readable reasons (i18n keys) for the UI:

1. **Null Island:** |lat| < 0.1° AND |lon| < 0.1° → treat as `none` (Revit's default site exports 0,0). Same for E₀=N₀=0 with a CRS whose valid area excludes (0,0) — UTM false easting makes E₀=0 ~impossible for real sites.
2. **Range:** |lat| ≤ 85.05 (mercator limit; reject poles), |lon| ≤ 180, |H₀| ≤ 9,000 m.
3. **CRS plausibility:** after proj4 inverse, the resulting lat/lon must be finite and within the CRS's rough domain (bundle per-def bounding boxes; e.g. UTM zone ±buffer). Out-of-domain → `invalid` with reason `crsOutOfDomain`.
4. **Rotation normalization:** normalize (XAxisAbscissa, XAxisOrdinate) — files write non-unit vectors; zero vector → γ = 0 + reason.
5. **Scale:** s ≤ 0 or s > 10⁴ → `invalid` reason `badScale`.
6. **Geometry offset cross-check:** compute model bbox center magnitude (available cheaply from `viewer.getModelBounds`). If > 10 km (same threshold as `RULE_COORDINATE_OFFSET`), set `largeWcsOffset: true` — the UI offers "Re-center model" (§5.2 scenario D) and placement math uses the bbox-aware anchor (§4.5).

### 4.5 Anchor derivation & applying the transform

The **anchor** is where scene origin meets the Earth. To avoid placing the scene origin kilometers away from the building (survey origins frequently are), anchor at the **building, not the survey origin**:

```
c_P   = model bbox center in P (from viewer.getModelBounds, pivot-aware), Y→(x, z) plan components
(E_c, N_c) = MapConversion applied to c_P            // rotate γ, scale s, translate E₀ N₀
(φ₀, λ₀)  = proj4(projDef → wgs84)(E_c, N_c)
h₀        = H₀ + c_P.elevation·s                      // or RefElevation on rung 3
```

Then the geoRoot transform (map side) is composed so that:

- mercator(φ₀, λ₀) lands at the scene plan position of c_P (NOT at world 0,0 — the model does not move; INV-2),
- basemap is scaled by k₀ about that point,
- basemap is rotated about the vertical axis at that point by **−(γ_total)** where γ_total is the model's grid/true-north rotation — i.e., the *map* rotates around the building so the model's project-north alignment is respected. North in scene is then NOT +Z in the general case: expose `getNorthDirection(): THREE.Vector3` for the compass UI (§9.5).
- vertical: ground plane Y = (model bbox min Y) − placement.heightOffsetM by default ("snap map to model base"). With terrain on, the patch is shifted so sampled terrain elevation at the anchor equals that same Y (§7 T11/T15). Vertical datum mismatch (ellipsoidal vs orthometric vs local) is accepted as ±meters error with the height offset slider as escape hatch — document in code and UI tooltip.

**Manual placement** is the same math with user-supplied (φ₀, λ₀, rotation, heightOffset) instead of extracted values. One code path (`composeGeoRootTransform(placement, modelBounds)`), two data sources — this is what keeps auto and manual placement from drifting apart behaviorally.

### 4.6 Multi-model scenes

Federated models are expected to share one project CRS (that's what federation means). Rules:

- The anchor derives from the **active model** if georeferenced, else the first georeferenced model, else manual.
- All models share the single `geoRoot` transform. Models whose own extraction disagrees with the anchor model by > 50 m get a per-model warning chip in the geo panel ("placed by federation, its own georeferencing differs by N m") — no auto-correction in v1.

### 4.7 Precision mitigation (float32 reality)

- Mercator magnitudes reach 2×10⁷; float32 has ~24-bit mantissa → ~1.2 m absolute resolution at that magnitude. **Vertices must never carry mercator-magnitude values.** Tile/terrain geometry must be tile-local; large numbers live only in `Object3D` transforms (JS doubles). Three.js computes `modelViewMatrix = camera.matrixWorldInverse × matrixWorld` on the CPU in doubles, so camera-relative magnitudes are small *before* the float32 GPU cast. **T0 must verify** the chosen tile plugin builds tile-local geometry (inspect `geometry.attributes.position` max magnitude < ~10⁵; if violated, wrap with a re-origin step or fall back to `SimpleQuadtreeBasemap`).
- The anchor recenter keeps everything the camera ever gets close to within ~30 km of origin (`controls.maxDistance` clamp) → worst-case float32 error ≈ 30,000/2²⁴ ≈ 2 mm. Fine.
- Re-anchoring on pan is deliberately NOT implemented (no globe roaming in v1 — the camera is leashed to the site). If a future version unleashes the camera, implement anchor rebasing (move geoRoot, not vertices) — leave a code comment pointing here.
- Raycast precision for the drag-placement editor: raycast against a mathematical ground plane (`THREE.Plane`), not tile meshes — immune to tile LOD churn mid-drag.

### 4.8 How broken IFC files are handled (decision table)

| Input condition | Detected by | UX outcome (§5.2) |
|---|---|---|
| Valid MapConversion + known EPSG | rung 1 + gates pass | Auto-place, badge "Georeferenced · EPSG:NNNN", confidence *high* |
| MapConversion, unknown/missing EPSG | rung 1, CRS unresolved | Prompt: pick CRS from list / paste proj4; preview placement after pick |
| Only site lat/lon (2x3 typical) | rung 3 | Auto-place, confidence *approximate* ("placed from site coordinates — verify"), rotation 0 unless TrueNorth |
| Lat/lon = (0,0) | gate 1 | Treated as not georeferenced; manual flow with explanation |
| E/N out of CRS domain, NaN, scale ≤ 0 | gates 3/5 | "Georeferencing present but invalid (reason)" → manual flow; raw values in debug panel |
| Geometry 10–10,000 km from origin | gate 6 / `RULE_COORDINATE_OFFSET` | Offer one-click "Re-center model" (uses existing `setModelTransform`; reversible; mirrored to sceneStore) before/with placement |
| Wrong rotation (it happens silently) | not detectable | Placement editor rotate handle + satellite layer make it visually obvious; 1-click 90° steps + fine drag |
| No georeferencing at all | rung 4 | Manual placement flow: search (optional geocoder, §9.7) or click-on-map; saved per file (T13) |

---

## 5. User flows

### 5.1 Enable map mode

Entry points: Toolbar "Map" button (globe icon, after the IDS button — `Toolbar.tsx` props pattern); also a contextual "Show on map" CTA inside the `RULE_COORDINATE_OFFSET` issue card (post-v1 nice-to-have, listed in T16 stretch).

States (drive directly off `geoStore.mapMode` + `georefByModel`):

```
OFF ──click──► CONSENT (first time only)
   modal: "Map mode loads tiles from public providers (OpenStreetMap, …).
   Tile requests reveal the approximate site location to the provider.
   Your model file never leaves your browser." [Enable] [Cancel]
   persisted: localStorage 'ifc-geo-consent:v1' = '1'
CONSENT/click ──► STARTING
   • dynamic-import GIS chunk (spinner on toolbar button; ≤ ~2 s on 3G — chunk budget §11)
   • run geo-extract worker on active model (if not already cached in store)
   • compose anchor (auto) or open placement flow (none/invalid)
   • engine.start(), camera flight
STARTING ──ok──► ON            (geo panel opens; attribution pill appears)
STARTING ──chunk/network fail──► ERROR (toast + button reset; retryable; mode stays OFF)
ON ──click──► OFF              (snapshot restore, full dispose — INV-3)
ON ──tiles failing (>50% errors over 10 s)──► ON + degraded banner in panel
   "Map tiles unavailable (provider may be down). [Retry] [Switch provider]"
ON ──all models removed──► stays ON with empty-scene hint; navigate-to-landing → forced OFF + dispose
```

`unavailable` state: button hidden when `VITE_FEATURE_GIS` is off; button disabled with tooltip "Load a model first" when no model is loaded (map without a model is allowed only via the panel's "explore map" toggle — v1: disabled, keep scope).

### 5.2 Import IFC with GIS (per-scenario expected UX)

Trigger: model finishes loading **while map mode is ON**, or user enables map mode with a model loaded.

- **A. Valid georeferencing (rung 1/2, gates pass):** model appears on the map at the right spot with a brief settle animation (map fades in under it — `TilesFadePlugin`); status chip `Georeferenced · EPSG:25832 · ±high confidence`; geo panel shows lat/lon, E/N, rotation, CRS, source rung. No dialogs. **This must feel like magic — zero clicks.**
- **B. Missing georeferencing (rung 4):** map mode still opens (at last-used or world view), model NOT placed yet; panel shows empty-state: "This model has no georeferencing." → primary action **Place manually** (5.3), secondary "How to fix this in Revit/ArchiCAD…" linking the existing remediation corpus entry for coordinates. If a saved manual placement exists for this exact file (cache key match), apply it automatically with chip `Manual placement (saved)`.
- **C. Corrupted coordinates (gates failed):** as B, plus an amber explainer: "Georeferencing found but invalid: <reason>" with a *Show raw values* disclosure (coordinate debugging, §9.5). Never attempt to place from invalid data.
- **D. Huge offsets (geometry far from origin):** info banner: "Model geometry sits 5,400 km from the file origin — this causes precision artifacts. [Re-center model]". Re-center = `setModelTransform` translation to bring bbox center plan-position to origin, mirrored to sceneStore (existing pattern), fully undoable via Reset in Scene panel. Placement math already accounts for the offset either way (§4.5); re-centering fixes *rendering* precision, not placement.
- **E. Wrong rotations:** no automatic detection possible. Mitigation is UX: rotation visibly wrong against the satellite/streets backdrop; placement editor (5.3) rotate handle; the confidence chip for rung-3 placements says "verify orientation".

### 5.3 Manual adjustment flow (placement editor)

Entered via "Place manually" (no georef) or "Adjust placement" (always available in the geo panel). The editor is a mode (`geoStore.editing = true`) with an on-canvas footer bar (`Esc` cancel · `Enter`/✔ apply — same interaction grammar as measurement tools).

1. **Locate:** search box (geocoder, §9.7 — optional, can be skipped) OR pan/zoom map (model ghost follows at screen center until first click), OR type lat/lon directly. Click map = drop model there.
2. **Move:** drag anywhere on the ground plane → model ghost translates (implementation: inverse transform on geoRoot; raycast against `THREE.Plane`, §4.7). Modifier `Shift` = slow/fine.
3. **Rotate:** ring handle around the model footprint + numeric input (degrees, 0–360, 90° step buttons). 
4. **Height:** small vertical slider + numeric (±100 m, 0.1 m step) for ground mismatch; "Snap to ground" button re-samples terrain elevation under the model (T11).
5. **Reset:** restores extracted placement (if any) or clears manual placement.
6. **Save / apply:** persists `{v:1, lat, lon, rotationDeg, heightOffsetM, source:'manual', savedAt}` to `localStorage['ifc-geo-placement:v1:'+cacheKey]` (T13). Chip switches to `Manual placement`. Exporting/sharing never includes this (local-only, privacy).

While `editing`: element hover/select raycast suppressed (same suppression flag pattern as `activeMeasurementTool` in `viewer.ts:941`), camera controls remain live, validation overlay untouched.

---

## 6. State management

### 6.1 Store shape (normative)

```ts
// src/stores/geoStore.ts — Zustand + devtools, serializable only (repo convention)
export type MapMode       = 'off' | 'starting' | 'on' | 'error'
export type GeorefStatus  = 'unknown' | 'extracting' | 'found' | 'partial' | 'none' | 'invalid'
export type TerrainStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface GeoPlacement {
  lat: number; lon: number
  rotationDeg: number          // model plan rotation vs true north, CCW
  heightOffsetM: number
  source: 'ifc' | 'manual'
  confidence: 'high' | 'approximate'   // rung 1/2 vs rung 3 / manual
}

export interface GeorefExtraction {
  status: GeorefStatus
  rung: 1 | 2 | 3 | 4 | null
  epsgCode: string | null
  raw: Record<string, number | string | null>   // normalized values for the debug panel
  reasons: string[]            // i18n keys, e.g. 'geo:invalid.nullIsland'
  largeWcsOffset: boolean
}

interface GeoStore {
  mapMode: MapMode
  mapErrorKey: string | null               // i18n key for the error state
  epoch: number                            // cancellation token — see §6.3
  baseLayerId: string                      // provider id; persisted ('ifc-geo-layer:v1')
  termsAccepted: Record<string, boolean>   // per provider id; persisted
  consentGiven: boolean                    // tile-network consent; persisted
  terrainEnabled: boolean
  terrainStatus: TerrainStatus
  georefByModel: Record<string, GeorefExtraction>
  placement: GeoPlacement | null           // EFFECTIVE placement driving geoRoot
  editing: boolean
  draftPlacement: GeoPlacement | null      // editor working copy; null unless editing
  attributions: string[]                   // mirrored from engine for the pill
  degraded: boolean                        // tile failure banner
  panelOpen: boolean

  // actions (named, devtools-labeled — repo convention)
  startEnable(): number                    // sets 'starting', returns ++epoch
  confirmEnabled(epoch: number): void      // ignores stale epochs
  fail(epoch: number, errorKey: string): void
  disable(): void                          // sets 'off', ++epoch (cancels everything in flight)
  setBaseLayer(id: string): void
  acceptTerms(id: string): void
  setConsent(v: boolean): void
  setTerrainEnabled(v: boolean): void
  setTerrainStatus(epoch: number, s: TerrainStatus): void
  setGeoref(modelId: string, g: GeorefExtraction): void
  setPlacement(p: GeoPlacement | null): void
  beginEditing(): void                     // draft = placement ?? sensible default
  updateDraft(patch: Partial<GeoPlacement>): void
  applyDraft(): void                       // placement = draft, editing=false
  cancelEditing(): void
  setAttributions(a: string[]): void
  setDegraded(v: boolean): void
  setPanelOpen(v: boolean): void
  resetForScene(): void                    // navigate-to-landing: full reset (like clearScene)
}
```

Persisted keys (read on init, written on change): `ifc-geo-consent:v1`, `ifc-geo-layer:v1`, `ifc-geo-terms:v1`, `ifc-geo-placement:v1:<cacheKey>`. Everything else is session state.

### 6.2 Legal transitions (state machine)

```
mapMode:   off → starting → on | error;  on → off;  starting → off (user cancels); error → starting (retry)
           anything → off on resetForScene()
georef:    unknown → extracting → found|partial|none|invalid   (per model; cached for session)
terrain:   idle → loading → ready|error; ready → idle (on disable/anchor change); error → loading (retry)
editing:   false → true → false (apply|cancel|mapMode off forces cancel)
```

Illegal transitions MUST throw in dev (devtools middleware makes them visible) and no-op in prod with a `log.warn`.

### 6.3 Async safety: the epoch pattern (race-condition prevention)

Every async chain (chunk import, extraction worker, tile engine start, terrain build, elevation sample) captures `const epoch = geoStore.getState().epoch` at start and **checks it before every commit**: `if (epoch !== get().epoch) return // stale`. `disable()` and `resetForScene()` increment `epoch`, instantly invalidating all in-flight work, and the geo system additionally aborts fetches via per-epoch `AbortController`. This single convention eliminates the entire class of "user toggled map off during load and tiles appeared anyway" bugs. The same pattern guards: rapid enable→disable→enable, model removed mid-extraction, provider switched mid-terrain-build, anchor changed mid-elevation-sample.

### 6.4 Tile & terrain cache states

- Tile cache is owned by the engine (LRU inside `3d-tiles-renderer` + `UnloadTilesPlugin` GPU byte target + browser HTTP cache). The store only sees aggregate signals: `degraded`, `attributions`, GPU estimate (polled into the existing memory HUD via `getGpuBytesEstimate`).
- Terrain patch cache: in-memory per (anchor-quantized-to-~100 m, zoom, provider) so toggling terrain off/on doesn't refetch; dropped on dispose. NOT cached in OPFS in v1 (OSM policy prohibits bulk offline anyway; terrarium would be fine but is cheap to refetch).

---

## 7. Task breakdown (CRITICAL)

Phases ship in order; tasks within a phase can parallelize unless `Depends` says otherwise. Every task ends with `tsc -b` clean + `npm run test` green.

> **Shared rollback strategy** (applies to every task, stated once): all GIS code is additive and behind `VITE_FEATURE_GIS`. Rolling back any task = revert its commit(s); rolling back the feature = unset the env flag (button disappears; chunk never loads). No task may modify Mode-A behavior except where explicitly listed (T5 loader hook, T6 viewer hook, T9 tune-lock, T16 toolbar/App wiring) — those four touchpoints each carry their own rollback note.

---

### Phase 0 — Foundations

#### T0 · Spike: pin the tile engine integration (timeboxed: 1–2 days)

- **Objective:** lock the exact `3d-tiles-renderer` version + plugin combination that renders OSM XYZ tiles on a plane inside an OBC world, and verify the four integration unknowns.
- **Technical explanation:** the library's raster-tiles API has churned (standalone `XYZTilesPlugin { projection:'planar', center:true }` in earlier versions vs `GeneratedSurfacePlugin` + `XYZTilesOverlay` + `ImageOverlayPlugin` in current docs). Build a throwaway page (`/dev-geo.html` or a vitest browser sandbox) that: creates an OBC world exactly like `createViewer` does, adds the tile group, and answers: **(1)** which plugin set works at our pinned version and what the tiles group's local axes are (mercator XY → expect a `rotation.x = −π/2` style fix to lay tiles on scene XZ); **(2)** does `world.renderer.onBeforeUpdate` exist and fire every frame (else use own RAF); **(3)** are tile vertex positions tile-local (max |position attribute| < 10⁵ — §4.7) — if not, can we enable an RTC/centering option, else flag fallback; **(4)** do `camera-controls` + `OrthoPerspectiveCamera` drive correct LOD via `setResolutionFromRenderer` + `setCamera`, including after a projection swap.
- **Files impacted:** none shipped — spike branch only; findings recorded at the top of `src/lib/geo/basemap-engine.ts` as a comment block + pinned version in `package.json` later (T7).
- **Dependencies:** none.
- **Risks:** plugin API mismatch at pinned version (mitigated by `BasemapEngine` seam); planar mode unmaintained corners.
- **Expected bugs during spike:** tiles invisible (group rotation/scale wrong — log group matrix); tiles all at lowest zoom (camera not registered / resolution not set); tiles upside-down or mirrored (Y-flip between XYZ and TMS conventions); CORS errors with OSM (must send no custom headers; plain `fetch`/img is fine — browser sends Referer automatically, which satisfies OSM's website identification requirement).
- **Debugging guide:** start with `errorTarget` high (40) to force low zoom; render `THREE.AxesHelper(1000)` at origin; log `tiles.group.children.length` per frame; inspect one tile mesh's `geometry.boundingBox` and `matrixWorld` to verify local-vs-global vertices; use the library's debug bounds option if available.
- **Acceptance criteria:** a written decision block (plugin names, version pin, axes fix, update-hook choice, vertex-locality verdict) and a 30-line minimal repro. **Exit criteria for fallback:** if (1) or (3) fail after the timebox → record decision to implement `SimpleQuadtreeBasemap` in T7 (geo-three-style, ~400 lines: quadtree subdivide on screen-space error, `THREE.PlaneGeometry` per tile, `ImageBitmapLoader`, LRU 256 tiles) — interface unchanged, T7 estimate +3 days.
- **Rollback:** n/a (spike).

#### T1 · Feature flag, types, store skeleton

- **Objective:** land `VITE_FEATURE_GIS`, `src/lib/geo/geo-types.ts` (all types from §6.1 + `MapProvider` + `GeoAnchor`/`MercatorAnchor`), and `src/stores/geoStore.ts` with the full state machine — no rendering yet.
- **Technical explanation:** store implements §6.1–§6.3 verbatim, devtools-named actions, exported selectors (`selectMapMode`, `selectPlacement`, …), persistence read/write for the four localStorage keys with versioned parsing (`v:1` envelope; tolerate corrupt JSON → defaults + `log.warn`). Epoch logic unit-tested here, before anything async exists.
- **Files impacted:** NEW `src/lib/geo/geo-types.ts`, `src/stores/geoStore.ts`, `src/stores/geoStore.test.ts`; `.env.example` (+ document flag in `docs/DEPLOYMENT.md`).
- **Dependencies:** none.
- **Risks:** over-modeling — resist adding state not in §6.1.
- **Expected bugs:** localStorage quota/SecurityError in private windows (wrap in try/catch — see `usePersistedPreferences` for the repo's pattern); Set/Map sneaking into state (don't — serializable only).
- **Debugging guide:** Redux devtools shows named actions; illegal-transition throw should fire in dev tests.
- **Acceptance criteria:** ≥ 15 unit tests: every legal transition, every illegal transition no-ops in prod mode, epoch invalidation (`startEnable → disable → confirmEnabled(stale)` leaves mode `off`), persistence round-trip + corrupt-JSON tolerance.
- **Rollback:** revert; nothing imports the store yet.

#### T2 · `geo-math.ts` — pure projection & rotation math

- **Objective:** implement and exhaustively test every formula in §4.2: WGS84↔WebMercator, `groundResolution`, slippy tile↔mercator bounds (`tileToMercatorBounds`, `lonLatToTile`), `compoundAngle`, γ from XAxis pair (with normalization), `cosLatScale`, and `composeGeoRootTransform(placement, modelBoundsPlanCenter, modelMinY)` returning `{ position, rotationY, scale }` for geoRoot (§4.5).
- **Technical explanation:** zero imports from three (return plain `{x,y,z}`); the viewer-side applies them. Keep `composeGeoRootTransform` the ONLY place the map-vs-model inversion logic exists.
- **Files impacted:** NEW `src/lib/geo/geo-math.ts`, `src/lib/geo/geo-math.test.ts`.
- **Dependencies:** T1 (types).
- **Risks:** sign conventions (TrueNorth, γ, the geoRoot inverse-rotation). Mitigate with the **golden fixture**: a hand-computed case (e.g. φ₀=41.3851 N, λ₀=2.1734 E, rotation 30°, model center at (10, 0, −5)) with expected outputs to 1e-6, derived independently (document the derivation in the test).
- **Expected bugs:** mercator Y sign flips (slippy tile Y grows southward!); degree/radian mixups; `compoundAngle` sign on negative minutes-only values.
- **Debugging guide:** round-trip property tests (`merc(unmerc(p)) ≈ p` for 1,000 random points); compare tile indices against any online "tile calculator" for 3 known cities.
- **Acceptance criteria:** ≥ 25 tests incl. round-trips, hemisphere signs (±lat, ±lon), |φ|→85.05 edge, golden fixture, γ normalization of non-unit vectors, zero-vector → 0 + reason.
- **Rollback:** revert; pure module.

#### T3 · `crs.ts` — proj4 wrapper + EPSG definitions

- **Objective:** dependency `proj4` (MIT, ~50 KB gz — lives in the lazy geo chunk); API: `resolveCrs(code: string): Result<CrsDef>`, `gridToWgs84(def, e, n): {lat, lon}`, `registerCustomProj4(string)`, plus per-def rough domain bboxes for gate 3.
- **Technical explanation:** bundle defs for the construction-common set: UTM ETRS89 zones 25828–25838, UTM WGS84 zones 32601–32660/32701–32760 (generate programmatically — UTM defs are formulaic: `+proj=utm +zone=N [+south] +datum=WGS84`), GB 27700 (note: without NTv2 grid → ~2–5 m error; record in def metadata + UI tooltip), FR 2154 (Lambert-93), DE 31466–31469 (legacy DHDN, same grid caveat), CH 2056, NL 28992, AT 31256, ES/PT via ETRS89 UTM, US state-agnostic via WGS84 UTM. Unknown code: return `err('unknownCrs')` → UI offers proj4-string paste (`registerCustomProj4`, persisted with the placement). NO network fetch to epsg.io in v1 (keeps the zero-third-party-beyond-tiles posture and offline determinism); leave a commented extension point.
- **Files impacted:** NEW `src/lib/geo/crs.ts`, `crs.test.ts`; `package.json` (+proj4, types via `@types/proj4` dev).
- **Dependencies:** T1.
- **Risks:** datum-shift accuracy expectations — set them explicitly (meters-level OK for context viz; we are not a survey tool: state this in the panel tooltip and in code comments).
- **Expected bugs:** proj4 axis order (proj4 uses [x=easting, y=northing] — consistent, but verify against a known control point per def family); ESM import shape of proj4 under vite/vitest.
- **Debugging guide:** control points: pick one published coordinate pair per def family (e.g. ETRS89/UTM32N: Cologne Cathedral ≈ E 356,800 / N 5,644,800 → 50.9413 N, 6.9583 E) and assert ≤ 1e-4° (~11 m) tolerance; bigger error = wrong def, not "tolerance tuning".
- **Acceptance criteria:** ≥ 12 tests: 5 control points across def families, unknown code path, custom proj4 registration + round-trip, domain bbox gate.
- **Rollback:** revert; pure module + dependency removal.

---

### Phase 1 — Georeferencing extraction

#### T4 · `geo-extract.worker.ts` + client (`geo-extract.ts`)

- **Objective:** the ladder of §4.3 + gates of §4.4 as a worker over raw IFC bytes; typed client with epoch-aware cancellation.
- **Technical explanation:** mirror `validator.worker.ts` bootstrap (web-ifc `IfcAPI.Init` with the same wasm path config, `OpenModel` on transferred copy of the buffer — **copy before transfer**, the registry buffer must not detach: same `slice()` discipline as `ids-runner.ts:21-23`). Rung 1: `GetLineIDsWithType(modelID, IFCMAPCONVERSION)` → `GetLine` (deref `TargetCRS` for `IFCPROJECTEDCRS`). Rung 2: scan `IfcPropertySet` names `ePSet_MapConversion`/`ePSet_ProjectedCRS`. Rung 3: `IFCSITE` → `RefLatitude/RefLongitude/RefElevation`; TrueNorth via `IFCGEOMETRICREPRESENTATIONCONTEXT`. Normalize per §4.3 notes (MapUnit, Scale, compound angles via T2). Apply gates; return `GeorefExtraction`. Message schema added to `src/lib/worker-schemas.ts` (Zod, repo convention). Client `extractGeoref(modelId): Promise<GeorefExtraction>` reads `modelRegistry.getBuffer`, handles empty-buffer (legacy cache) → `{status:'unknown', reasons:['geo:noBuffer']}`, terminates worker on error (loader's `resetWorker` pattern), caches result in geoStore.
- **Files impacted:** NEW `src/workers/geo-extract.worker.ts`, `src/lib/geo/geo-extract.ts`, `src/lib/geo/geo-extract.test.ts`, edit `src/lib/worker-schemas.ts`.
- **Dependencies:** T1, T2, T3.
- **Risks:** web-ifc entity coverage differences across IFC versions (2x3 files have no IFCMAPCONVERSION type — `GetLineIDsWithType` returns empty, fine); huge files → worker memory (extraction opens the model *without* geometry where web-ifc settings allow; verify the same `LoadSettings` trick validator uses).
- **Expected bugs:** compound-angle arrays arriving as `{value}`-wrapped objects (unwrap like `attrStr` does in viewer.ts); `RefLatitude` null vs missing; multiple sites (take the one with coordinates, else first); transferred-buffer detach crash (the `slice()` rule above).
- **Debugging guide:** unit-test against **string STEP fixtures** (10–30 line synthetic IFC snippets per scenario — full files not needed; web-ifc parses fragments with a valid header). Fixture set = the matrix in §4.8 + §12.2. For a real-file smoke test use `public/Ifc2x3_Duplex_Architecture.ifc` (expect rung 3 or 4 — verify and pin whichever it is into the test).
- **Acceptance criteria:** all §12.2 fixtures classified correctly; worker terminates + frees on cancel (epoch bump mid-parse); zero main-thread blocking > 16 ms (parse fully in worker).
- **Rollback:** revert; worker unused elsewhere.

#### T5 · Load-time badge pre-scan + store wiring

- **Objective:** cheap "is this file georeferenced?" signal at load time without a full parse, surfaced in geoStore (and available to ModelInfoPanel later).
- **Technical explanation:** in `useIfcLoader`'s post-load step, run a regex scan over the first + last 2 MB of the IFC text (`IFCMAPCONVERSION|EPSET_MAPCONVERSION|IFCSITE\([^)]*\(` heuristics; decode via `TextDecoder` on subarrays — no full-string materialization for GB files) → set `georefByModel[modelId] = { status:'unknown'-with-hint }`... Implementation detail: introduce `quickScanGeoref(buffer): 'likely'|'unlikely'` in `geo-extract.ts` and store it as `raw.quickScan`; full status remains `unknown` until T4 runs on demand. **Rollback note (Mode-A touchpoint):** the hook is 3 lines in `loader.ts` behind `VITE_FEATURE_GIS` — reverting restores byte-identical loader behavior.
- **Files impacted:** edit `src/lib/loader.ts` (3-line hook), `src/lib/geo/geo-extract.ts` (+`quickScanGeoref` + tests).
- **Dependencies:** T1, T4 (types only — can land before T4 finishes).
- **Risks:** false positives on the regex (acceptable — it only gates a badge tint, never placement).
- **Expected bugs:** scanning a compressed/odd-encoding file (IFC is ASCII STEP; non-STEP rejected earlier by `validateIfcBuffer` — rely on it).
- **Debugging guide:** time the scan (`performance.now`) on a 500 MB synthetic buffer — must stay < 50 ms (subarray trick).
- **Acceptance criteria:** scan ≤ 50 ms on 500 MB; loader tests untouched; flag-off build has zero references (tree-shaken — verify with a bundle-size diff).
- **Rollback:** remove the 3-line hook.

---

### Phase 2 — Map scene core

#### T6 · `geo-system.ts` lifecycle + viewer integration

- **Objective:** `createGeoSystem(ctx): GeoSystemAPI` closure + the single lazy hook in `viewer.ts`.
- **Technical explanation:**
  ```ts
  // viewer.ts — inside createViewer closure, near other component setups
  let geoSystem: GeoSystemAPI | null = null
  let geoLoadPromise: Promise<GeoSystemAPI> | null = null
  // exposed on ViewerAPI:
  async getGeo(): Promise<GeoSystemAPI> {
    geoLoadPromise ??= import('./geo/geo-system').then((m) => {
      geoSystem = m.createGeoSystem({
        world, components,
        requestRender: () => { void fragmentsManager.core.update() },
        getModelBounds: (id) => /* delegate to existing closure logic */,
        setSceneTuneLock: (locked: boolean) => { sceneTuneLocked = locked },  // see T9
        setRaycastSuppressed: (s: boolean) => { geoRaycastSuppressed = s },   // editor mode; checked in onPointerMove/Up like activeMeasurementTool
      })
      return geoSystem
    })
    return geoLoadPromise
  }
  // and in dispose(): geoSystem?.dispose()
  ```
  `GeoSystemAPI` (returned object, owns geoRoot): `enable(placement, provider, opts) → Promise<void>`, `disable()`, `setPlacement(p)`, `setProvider(p)`, `setTerrain(enabled)`, `pickGround(screenXY): {lat,lon}|null`, `getNorthDirection()`, `getAttributions()`, `getGpuBytesEstimate()`, `isActive()`, `dispose()`. Enable: create geoRoot, apply `composeGeoRootTransform`, start BasemapEngine (T7), apply env overrides (T9), camera flight; disable: reverse everything, dispose engine, remove geoRoot, restore env snapshot. All async paths epoch-checked (epoch passed in from the App wiring; the geo system itself is store-agnostic — testability).
  **Rollback note (Mode-A touchpoint):** `getGeo` + `geoSystem?.dispose()` + two boolean flags in viewer.ts — ~15 lines, additive, flag-guarded at the call sites (App/Toolbar), trivially revertible.
- **Files impacted:** NEW `src/lib/geo/geo-system.ts`; edit `src/lib/viewer.ts` (ViewerAPI interface + ~15 lines).
- **Dependencies:** T0 (decisions), T1, T2.
- **Risks:** disposal completeness — THE leak surface. Counter: a `disposables: Array<() => void>` accumulator inside the closure; every acquisition pushes its release; `dispose()` drains it in reverse. No ad-hoc cleanup.
- **Expected bugs:** geoRoot left in scene after viewer dispose (hook order: geo dispose BEFORE `components.dispose()`); double-enable creating two geoRoots (idempotence guard); `getGeo()` called after viewer dispose (return rejected promise with clear message).
- **Debugging guide:** `world.scene.three.children` count before/after enable/disable cycles; `renderer.info.memory.{geometries,textures}` snapshots (this becomes the §12.4 leak test).
- **Acceptance criteria:** 10× enable/disable cycle in a browser-mode test leaves children count and `renderer.info.memory` at baseline (±0); GIS chunk visible as separate file in `npm run build` output; entry chunk growth < 5 KB (INV-1).
- **Rollback:** remove viewer hook lines; delete files.

#### T7 · `TilesRendererBasemap` (BasemapEngine impl)

- **Objective:** implement §3.4 over the T0-pinned plugin set; pinned `3d-tiles-renderer` version in `package.json`.
- **Technical explanation:** per T0 findings: instantiate TilesRenderer with the XYZ source, planar projection; apply axes fix; wire `setCamera` + `setResolutionFromRenderer`; recenter/scale per `MercatorAnchor`; register `UnloadTilesPlugin` (`bytesTarget` 256 MB) + `TilesFadePlugin`; set `lruCache` sizes (min 50 / max 300 tiles) and `errorTarget` (start 6, tune in T20); URL hygiene — plain GET, no custom headers (OSM Referer-based identification; INV-5: nothing but z/x/y in URLs); failed-tile retry with exponential backoff capped at 3, then count toward the degraded signal (>50% of last 20 loads failed → `onDegraded(true)`).
- **Files impacted:** NEW `src/lib/geo/basemap-engine.ts` (interface + impl), `basemap-engine.test.ts` (interface-level with mocked engine internals where jsdom can't render); `package.json`.
- **Dependencies:** T0, T6 (parallel-able against the interface).
- **Risks:** upstream API churn (seam contains it); planar-mode edge cases at low zoom (clamp min zoom to 3).
- **Expected bugs:** tile seams/Z-fighting between zoom levels during fade (small per-level Y offset or `polygonOffset` — check what the lib does first); texture color space (tiles must be `SRGBColorSpace` to match renderer output config — washed-out tiles = this); memory not falling after `dispose` (must call the lib's dispose AND drop our group refs).
- **Debugging guide:** the lib's stats/debug options; `tiles.group.traverse` counting meshes; Chrome perf memory tab for texture residency; network tab — verify cache hits on pan-back (`from disk cache`).
- **Acceptance criteria:** OSM + OpenTopoMap render correctly at z3–z19 over a known anchor; provider swap < 1 s without full reload artifacts; degraded signal fires with a blackholed URL template; dispose returns `renderer.info` to baseline; attribution strings reported.
- **Rollback:** revert; engine unused until T16 wires UI.

#### T8 · Provider registry + custom provider

- **Objective:** `providers.ts` per §3.10 with the Appendix-A built-ins, terms-notice metadata, custom-slot validation + persistence.
- **Technical explanation:** pure data + small functions (`resolveProvider(id)`, `validateCustomTemplate(url)` — https-only, `{z}/{x}/{y}` presence, length cap, no credentials in URL warning is shown but allowed since it stays local). WMTS templates accepted as raw GetTile REST templates in v1 (KVP/Capabilities parsing deferred — note as follow-up).
- **Files impacted:** NEW `src/lib/geo/providers.ts`, `providers.test.ts`.
- **Dependencies:** T1.
- **Risks:** licensing drift — each entry carries `homepage` + a `lastReviewed: '2026-06'` field; §13 DoD requires re-review before GA.
- **Expected bugs:** users pasting `{x}/{y}/{z}` ordered templates (validate placeholders individually, not as a fixed string); `{s}` subdomain placeholder (support `{s}` with a default rotation `abc`).
- **Debugging guide:** straightforward unit tests.
- **Acceptance criteria:** ≥ 10 tests; every built-in provider URL responds 200 for a known tile in a manual checklist (recorded in the task PR, not CI — external network).
- **Rollback:** revert.

#### T9 · Camera & environment scoping

- **Objective:** scoped env overrides + restoration (INV-3), `tuneSceneToBounds` lock, projection-swap re-registration, controls clamps, camera flight in/out.
- **Technical explanation:** snapshot record `{near, far, fogNear, fogFar, background, maxDistance, maxPolarAngle, gridVisible, cameraPos, cameraTarget}` taken in `enable()` before mutation; restore exact values in `disable()`. `tuneSceneToBounds` gets a 2-line guard: `if (sceneTuneLocked) return` (flag set via ctx callback — Mode-A behavior unchanged when flag false; **rollback note:** guard is inert without GIS). Projection swap: subscribe to the OrthoPerspectiveCamera projection change event (verify exact event name in OBC 3.4 — `world.camera.projection.onChanged` family; T0 confirms) → `engine.setCamera(world.camera.three)`. Storey-view interaction: opening a storey view while map mode is on switches to ortho/top — allowed; map stays (it's the ground context); verify no fitToBox fights.
- **Files impacted:** edit `src/lib/viewer.ts` (guard + flag), `src/lib/geo/geo-system.ts`.
- **Dependencies:** T6.
- **Risks:** missed restore key → permanent Mode-A regression after one map session (THE regression risk of this phase — hence the dedicated test below).
- **Expected bugs:** fog restored but `tuneSceneToBounds` not re-run (call it once with current combined bounds on exit); shadow frustum left widened; camera flight racing user input (camera-controls handles interruption gracefully — verify).
- **Debugging guide:** serialize the snapshot record and the post-restore record; deep-equal them in the test.
- **Acceptance criteria:** property test: enable → randomize layers/terrain → disable ⇒ env record deep-equals pre-enable snapshot; loading a model mid-map-mode does NOT shrink far/fog (lock works) and DOES re-tune after exit.
- **Rollback:** revert (guard is dead code without GIS).

---

### Phase 3 — Placement

#### T10 · Auto-placement pipeline

- **Objective:** `placementFromExtraction(g: GeorefExtraction, modelBounds): Result<GeoPlacement>` — the glue from extraction to `composeGeoRootTransform`, including CRS resolution, anchor-at-centroid (§4.5), confidence assignment, and the multi-model rules (§4.6).
- **Technical explanation:** pure function in `src/lib/geo/placement.ts`; consumed by the App wiring effect: on map-enable or model-load-while-on → ensure extraction (T4) → compose placement → `geoSystem.setPlacement`. Saved manual placement (T13) takes precedence over extracted (explicit user intent wins; chip shows source).
- **Files impacted:** NEW `src/lib/geo/placement.ts`, `placement.test.ts`.
- **Dependencies:** T2, T3, T4.
- **Risks:** the sign-convention bug class — covered by the golden rotation fixture: a synthetic MapConversion with γ=30° must yield a placement that the T2 fixture confirms geometrically.
- **Expected bugs:** anchor at survey origin instead of centroid (visible as "map is right but origin is 2 km off, camera flight overshoots"); double-applying Scale (once in worker normalization, once here — normalize ONLY in the worker, assert meters here).
- **Debugging guide:** the coordinate debug panel (§9.5) shows every intermediate (E/N → lat/lon → mercator → scene); compare against an online converter for the fixture CRS.
- **Acceptance criteria:** fixtures: rung-1 EPSG:25832 file → expected lat/lon ±1e-5°; rung-3 lat/lon file → identical passthrough; unknown EPSG → `err('unknownCrs')`; precedence test (manual-saved beats extracted).
- **Rollback:** revert.

#### T11 · Elevation sampling + ground snap

- **Objective:** `sampleElevation(lat, lon): Promise<Result<number>>` from a single terrarium tile; "Snap to ground" action.
- **Technical explanation:** compute tile (z=13) for the point, fetch PNG, decode via `createImageBitmap` + 1×1 `OffscreenCanvas` readback of the target pixel (or decode in the T14 worker once it exists — start standalone, refactor in T14), apply terrarium formula. Cache per tile in-session. Ground snap sets `heightOffsetM` so map plane meets model bbox min-Y at sampled elevation (§4.5). Timeout 8 s → `err('elevationUnavailable')` → snap falls back to bbox-min (flat assumption) + toast info.
- **Files impacted:** NEW `src/lib/geo/elevation.ts`, `elevation.test.ts` (fetch mocked with a crafted 2×2 PNG fixture).
- **Dependencies:** T2.
- **Risks:** none significant — single keyless request.
- **Expected bugs:** terrarium offset math off-by-32768; pixel addressing flipped (PNG row order); CORS fine on the AWS endpoint (verified — public bucket).
- **Debugging guide:** assert a known elevation (e.g. a point in Barcelona ≈ 12 m, Mont Blanc summit tile ≈ 4,800 m) in a manual checklist; unit tests use the synthetic PNG.
- **Acceptance criteria:** decode correctness on synthetic fixture (exact); timeout path returns err and never throws; ≤ 1 network request per snap.
- **Rollback:** revert; snap button hidden.

#### T12 · Manual placement editor (interaction)

- **Objective:** the §5.3 flow: drag-move, rotate ring, height slider, click-to-place, Esc/Enter semantics, raycast suppression.
- **Technical explanation:** interaction layer lives in geo-system (it owns the canvas listeners' world side) + a React footer/controls component (T16 renders it). Drag: pointerdown on ground (no element hit) while `editing` → raycast `THREE.Plane(up, −groundY)` → store delta → `updateDraft` → `composeGeoRootTransform` applied live (map moves under the static model — feels like dragging the building; cheap because it's one group transform). Rotate ring: a `THREE.RingGeometry` helper sized to model footprint ×1.2, dragged angularly. Suppression: set `setRaycastSuppressed(true)` during editing (viewer skips hover/select exactly like during measurements). Throttle draft→transform application to RAF.
- **Files impacted:** edit `src/lib/geo/geo-system.ts` (+`beginPlacementEdit/endPlacementEdit` + helpers), NEW `src/lib/geo/placement-edit.ts` (pure drag math + tests).
- **Dependencies:** T6, T7, T10.
- **Risks:** interaction conflicts with measurement/clipper modes — rule: entering placement edit force-exits those tools (and vice versa), enforced in App wiring; assert in tests.
- **Expected bugs:** drag "slips" under cursor at high latitudes (must apply cos φ scale in the screen-delta→meters conversion — use the plane raycast delta, never pixel heuristics); rotation jumps crossing ±180°; camera orbiting while dragging (capture pointer + `controls.enabled = false` during an active drag, restore on up).
- **Debugging guide:** log draft placement at pointermove (dev only); the ring helper makes rotation state visible; test drag math purely (pointer ray → plane intersection mocked).
- **Acceptance criteria:** drag accuracy: a 100 px drag moves the model the plane-raycast distance exactly (test with mocked rays); Esc restores pre-edit placement bit-exact; Enter persists (T13); tools mutual exclusion enforced.
- **Rollback:** revert; editor entry hidden.

#### T13 · Placement persistence

- **Objective:** save/load `GeoPlacement` (+ custom proj4 string if used) per file via `buildCacheKey`, versioned envelope, applied on load (precedence per T10).
- **Technical explanation:** `src/lib/geo/placement-persistence.ts`: `savePlacement(cacheKey, p)`, `loadPlacement(cacheKey)`, `clearPlacement(cacheKey)`; storage key `ifc-geo-placement:v1:<cacheKey>`; tolerant parse (corrupt → null + warn); cap total saved placements at 200 (LRU by `savedAt` — localStorage is shared budget).
- **Files impacted:** NEW `src/lib/geo/placement-persistence.ts` + test.
- **Dependencies:** T1.
- **Risks:** none notable.
- **Expected bugs:** cacheKey collisions for re-exported same-name files (key includes size+mtime — acceptable); private-window storage errors (try/catch).
- **Debugging guide:** trivial.
- **Acceptance criteria:** round-trip, corruption tolerance, LRU eviction at 201, clear-on-reset action.
- **Rollback:** revert.

---

### Phase 4 — Terrain

#### T14 · `geo-terrain.worker.ts` — DEM decode + mesh build

- **Objective:** worker: input `{epoch, anchor, demZoom, gridN, imageryZoom, providerTemplate, segments}` → output per-tile transferables `{positions, normals, uvs, indices, imageryBitmap}`.
- **Technical explanation:** fetch N×N terrarium tiles (+1 ring for normal continuity at patch edges), decode to height grids; for each tile build a `segments×segments` grid displaced by heights (positions tile-local — §4.7! tile origin in the transform, not vertices), compute smoothed normals using neighbor-tile edge data; stitch imagery (zi tiles per DEM tile) onto a 1024² `OffscreenCanvas` → `transferToImageBitmap`. Concurrency: 6 fetches; `AbortController` wired to a cancel message; progress messages (`{epoch, loaded, total}`) for the UI bar. Zod schemas in `worker-schemas.ts`.
- **Files impacted:** NEW `src/workers/geo-terrain.worker.ts`, `src/lib/geo/terrain.ts` (client), tests with mocked fetch.
- **Dependencies:** T2 (math), T11 (shared terrarium decode — extract to `terrarium.ts`).
- **Risks:** memory spikes (9 tiles × 1024² RGBA ≈ 36 MB textures + grids — fine; 5×5 ≈ 100 MB — gate behind the perf budget §11); `OffscreenCanvas` availability (baseline in all target browsers; feature-check anyway → fallback: transfer raw imagery tiles and stitch on main thread during idle callbacks).
- **Expected bugs:** normal seams at tile borders (the +1 ring fixes it — easy to skip accidentally); UV flip (imagery upside down); partial tile failures (missing ocean tiles return valid zero-elevation terrarium — but 404s happen at high zoom: fill height 0 + flag tile `degraded`).
- **Debugging guide:** render the patch with `MeshNormalMaterial` in a dev flag to inspect normal continuity; checkerboard test template for UV orientation; throttle network in devtools to test progress/cancel.
- **Acceptance criteria:** synthetic-fixture geometry correctness (flat input → flat mesh; ramp input → expected slope); cancel mid-build leaks nothing (worker terminates, bitmaps closed); full 3×3 build on real network < 8 s on a 10 Mbps line (manual checklist).
- **Rollback:** revert; terrain toggle absent until T15 anyway.

#### T15 · Terrain patch integration

- **Objective:** wire worker output into `terrainGroup`: positioning vs anchor + elevation alignment (§4.5), edge fade ring, toggle lifecycle (loading → ready; rebuild on anchor move > 250 m; dispose on disable), imagery follows active base layer where the provider allows draping (streets drape looks bad — terrain forces satellite/topo imagery; rule in UI §9.4).
- **Technical explanation:** materials: `MeshLambertMaterial({ map })` (scene already has hemisphere+directional light); `receiveShadow = true` only when patch ≤ 3×3 (shadow map cost); edge fade via `alphaMap` radial gradient or onBeforeCompile fragment fade (pick simpler: alphaMap, `transparent: true`, renderOrder after basemap).
- **Files impacted:** edit `src/lib/geo/geo-system.ts`, NEW `src/lib/geo/terrain-patch.ts` + test.
- **Dependencies:** T14, T7.
- **Risks:** model intersecting terrain (building half-buried on slopes — *correct* behavior geodetically, jarring visually): mitigate with the height-offset slider + a hint when bbox-min is > 2 m under sampled terrain ("building appears below terrain — adjust height or snap").
- **Expected bugs:** patch floating above/below flat basemap (both must share groundY: flat map renders at anchor elevation plane — verify after T11 changes); fade ring sorting against transparent IFC materials (windows) — set patch `renderOrder` below model, `depthWrite: true` except in the fade band.
- **Debugging guide:** dev wireframe toggle on the patch; log patch group bounding box vs flat-plane Y.
- **Acceptance criteria:** toggle on/off ×10 leaves memory at baseline; anchor move > 250 m triggers exactly one rebuild (debounced 500 ms); slope site (manual checklist: alpine demo coordinates) shows building snapped correctly after "snap to ground".
- **Rollback:** revert; flat basemap unaffected.

---

### Phase 5 — UI, i18n, analytics

#### T16 · GeoPanel + Toolbar button + App wiring

- **Objective:** all §9 UI: toolbar button with state, consent modal, GeoPanel (status chip, layer picker, terrain toggle, placement section, debug disclosure, degraded banner), placement editor footer, CRS picker dialog, empty/loading/error states.
- **Technical explanation:** follow the panel pattern (`MeasurementPanel.tsx` floating panel + uiStore-like flags — here in geoStore: `panelOpen`); toolbar: add `onToggleMap` prop to `Toolbar.tsx` (existing props-callback pattern) + button (lucide `Globe2` or `Map`), hidden when flag off, active state tinted with `--accent`; App.tsx: one `GeoBridge`-style effect module (or inline effects, matching how validation wiring is done) connecting geoStore intents → `viewerApiRef.current.getGeo()` calls with epoch passing; force-exit interactions per T12 exclusion rule; `resetForScene()` on navigate-to-landing (where `clearScene` is called). **Rollback note (Mode-A touchpoint):** Toolbar prop + App effects are flag-guarded; with flag off, render tree is byte-identical.
- **Files impacted:** NEW `src/components/geo/GeoPanel.tsx`, `GeoPlacementControls.tsx`, `GeoConsentModal.tsx`, `CrsPickerDialog.tsx`; edit `src/components/Toolbar.tsx`, `src/App.tsx`.
- **Dependencies:** T6–T13 (consumes everything).
- **Risks:** App.tsx is large — keep additions to ≤ ~80 lines by pushing logic into `src/lib/geo/app-wiring.ts` (a hook `useGeoMode(viewerApiRef)`).
- **Expected bugs:** stale viewerApiRef on fast route switches (guard like `useElementFocus` does); panel z-index vs mobile bottom nav (test at < md breakpoint; geo panel becomes bottom-sheet style like other panels per `project_mobile_ux` conventions); button spinner stuck if enable throws synchronously (try/catch sets error state).
- **Debugging guide:** React devtools + zustand devtools side by side; the §5.1 state diagram is the test script.
- **Acceptance criteria:** every §5 flow click-through matches spec on desktop + mobile widths; keyboard: Esc/Enter in editor, button focusable with visible ring; no console errors across the full flow; flag-off build renders identical toolbar (snapshot test).
- **Rollback:** flag off; or revert (additive components).

#### T17 · Attribution overlay (legal — not optional)

- **Objective:** persistent bottom-right pill: "© OpenStreetMap contributors" (+ active provider strings, deduped), data-source line for terrain when patch is on ("Terrain: Mapzen/AWS Open Data" + sources list link), visible in ALL chrome presets including embed/kiosk (INV-6).
- **Technical explanation:** small fixed component reading `geoStore.attributions`; links open in new tab; never overlaps existing memory HUD (stack them); pointer-events only on links.
- **Files impacted:** NEW `src/components/geo/GeoAttribution.tsx`; mount in App viewer route.
- **Dependencies:** T7 (attribution feed), T16.
- **Risks:** none technical; legal if skipped — hence its own task.
- **Expected bugs:** attribution flashing during provider swap (debounce store updates 300 ms).
- **Debugging guide:** visual.
- **Acceptance criteria:** rendered with map on, absent with map off, present under `?embed=1&ui=kiosk` (manual embed checklist), strings HTML-escaped.
- **Rollback:** none — this ships with or before T16 user-visibility. Do not GA without it.

#### T18 · i18n — `geo` namespace (EN + ES)

- **Objective:** all strings of §10 in `src/locales/en/geo.json` + `src/locales/es/geo.json`; mechanical EN copies into the other 8 locale folders (lazyLoader requires the file to exist per locale — §2.4); register namespace.
- **Technical explanation:** edit `src/i18n/config.ts`: import `enGeo`, add to `EN_RESOURCES` (key `geo`) — `ns` derives from `Object.keys(EN_RESOURCES)` so no second edit; components use `useTranslation('geo')`. No hardcoded user-visible strings anywhere in geo components/system (reasons/errors are i18n keys end-to-end — already enforced by the `reasons: string[]` design).
- **Files impacted:** NEW `src/locales/{en,es,fr,de,pt,it,zh,ja,th,ca}/geo.json` (10 files; 8 are EN copies marked `"_status": "machine-copy-of-en"`), edit `src/i18n/config.ts`.
- **Dependencies:** T16 (consumer), but file can land first.
- **Risks:** missing-key fallbacks masking typos — dev `missingKeyHandler` already warns (config.ts:111); CI grep test: every `t('...')` key in `src/components/geo/**` exists in `en/geo.json` (add a small test like `validation-coverage.test.ts` style).
- **Expected bugs:** namespace not in `EN_RESOURCES` → `t` returns key strings (the config comment block explains the bundling contract — follow it).
- **Debugging guide:** switch language to ES in the running app; check console for missing-key warnings.
- **Acceptance criteria:** zero missing-key warnings in EN/ES full click-through; key-coverage test green; ES reviewed by a human (the repo owner is a native speaker).
- **Rollback:** revert.

#### T19 · Analytics events

- **Objective:** typed events following `analytics.ts` conventions: `trackMapModeEnabled({georef_status, source})`, `trackMapModeDisabled({duration_s})`, `trackMapLayerChanged({layer})`, `trackMapPlacementSaved({source, used_search}1)`, `trackMapTerrainToggled({enabled})`, `trackMapGeorefExtracted({status, rung, has_epsg})`, `trackMapError({stage})`. **No coordinates, no file names in properties** (INV-5 extends to analytics).
- **Files impacted:** edit `src/lib/analytics.ts`; call sites in app-wiring.
- **Dependencies:** T16.
- **Risks/Expected bugs:** property cardinality (keep enums, no free text).
- **Acceptance criteria:** events visible in PostHog debug; property review confirms no location data.
- **Rollback:** revert (analytics is fire-and-forget).

---

### Phase 6 — Hardening & docs

#### T20 · Performance + leak + race test pass

- **Objective:** enforce §11 budgets and §12.4 suites; tune `errorTarget`, cache sizes, concurrency with measurements, not vibes.
- **Technical explanation:** add browser-mode vitest (already configured: `@vitest/browser` + playwright-core in devDeps) suites: leak cycle (T6 criteria, now with terrain + provider swaps in the loop), race grid (§12.5 — scripted rapid sequences), FPS smoke (rotate camera 360° over the map with a mid-size model, assert no frame > 100 ms via `PerformanceObserver` longtask, advisory not blocking).
- **Files impacted:** NEW `src/lib/geo/geo-hardening.test.ts`; tuning edits in `basemap-engine.ts`.
- **Dependencies:** all previous.
- **Risks:** CI flakiness on network-dependent tests — ALL CI tests run against mocked fetch/local fixture tiles (a tiny static tile set in `src/lib/geo/__fixtures__/tiles/`); real-network checks live in the manual checklist only.
- **Expected bugs found here by design:** texture leaks on provider swap; epoch leaks in terrain progress messages; fog restore drift after storey-view + map interleaving.
- **Debugging guide:** `renderer.info`, Chrome memory snapshots, devtools FPS meter; bisect with feature toggles (terrain off, fade off).
- **Acceptance criteria:** §11 budget table all green; leak/race suites green in CI 10 consecutive runs.
- **Rollback:** n/a (tests).

#### T21 · Documentation

- **Objective:** `docs/GIS_MAP_MODE.md` (user-facing capabilities + provider terms summary + privacy disclosure), README feature row, code-level READMEs in `src/lib/geo/` (the T0 decision block lives here), update `docs/EMBED_URL_PARAMS.md` with a "map params: reserved, not yet implemented (`map`, `lat`, `lon`)" note so the param namespace is reserved deliberately.
- **Files impacted:** docs only.
- **Dependencies:** all.
- **Acceptance criteria:** another engineer can answer "what providers, what licenses, what's stored locally, what leaves the browser" from docs alone.
- **Rollback:** n/a.

---

## 8. Risk prevention

| Risk | Prevention (built into tasks above) | Residual handling |
|---|---|---|
| **Coordinate drift / wrong placement** | Single transform composer (`composeGeoRootTransform`, T2) used by auto AND manual paths; golden fixtures with independent derivations; coordinate debug panel exposing every intermediate (§9.5) | Confidence chips + "verify placement" copy for rung-3; placement editor always one click away |
| **Floating-point precision (jitter)** | Anchor recenter (§4.7); tile-local vertices verified in T0; `maxDistance` 30 km leash; terrain vertices tile-local (T14); model re-center offer for far-origin files | `RULE_COORDINATE_OFFSET` already educates users; debug panel shows WCS offset |
| **Large world coordinates in models** | Gate 6 detection + one-click re-center via existing `setModelTransform` (reversible, store-mirrored) | Documented limitation for un-recentered far models (existing Mode-A issue, not introduced by GIS) |
| **Tile flickering** | `TilesFadePlugin`; LRU floor (50) prevents thrash at static views; `errorTarget` tuned in T20; no per-frame provider churn (layer switch is debounced) | Degraded banner if provider is slow rather than churn |
| **Memory leaks** | `disposables` accumulator pattern (T6); `UnloadTilesPlugin` byte target; bitmap `close()` discipline in workers; leak test in CI (10-cycle, exact baseline) | Memory HUD already exists — geo GPU estimate feeds it |
| **Camera desync** | No second camera by construction (§3.9); projection-swap re-registration (T9); env snapshot/restore property test | — |
| **Terrain mismatch (building floats/buried)** | Ground snap via real elevation sample (T11); below-terrain hint (T15); height slider; vertical-datum honesty in tooltip | Manual offset is the universal escape hatch |
| **Provider downtime / rate-limiting** | Failure-rate → degraded banner + one-click provider switch; retry/backoff caps; provider abstraction = config-level swap; OSM policy compliance (attribution, Referer, cache headers, no prefetch) reduces block risk | Custom provider slot; if OSM blocks the referrer, switch default via constant + patch release |
| **Invalid IFC georeferencing** | The ladder + sanity gates (§4.3–§4.4) make "silently wrong" structurally hard: bad data lands in `invalid` with reasons, never in placement | Manual placement, saved per file |
| **Race conditions (toggle spam, model swap mid-load)** | Epoch pattern everywhere (§6.3) + AbortControllers + scripted race grid in CI (T20) | — |
| **Legal/licensing** | Appendix A analysis encoded into provider metadata (`requiresTermsNotice`); attribution pill is its own task (T17) with embed coverage; satellite has no silent default | `lastReviewed` field + DoD re-check |
| **Privacy claim erosion** | Consent modal before first tile (T16); INV-5 enforced in code review + analytics property review (T19) | Privacy policy update listed in DoD |
| **Bundle bloat** | All GIS deps in lazy chunk (INV-1, measured in T6); proj4 defs generated not bundled-as-data | Bundle-size check in DoD |

---

## 9. UI/UX specification

Design language: existing dark premium minimal (bg `#0A0A0C`, accent `--accent`, Radix + Tailwind, lucide icons, framer-motion 150–250 ms ease-out). No new colors except semantic chips reuse `var(--ok)/--warn/--danger`. Everything below uses i18n keys from §10.

### 9.1 GIS controls (toolbar)

- One button: globe icon + label "Map" (hidden ≤ sm, icon-only like neighbors). States: default / loading (spinner overlay) / active (accent tint + filled icon) / disabled (no model; tooltip). Click toggles; long operations never block the button (it becomes the cancel affordance during `starting`).

### 9.2 Geo panel (right-floating, like Measurement panel; bottom sheet on mobile)

Sections top→down:
1. **Status chip row:** `Georeferenced · EPSG:25832` (ok-green) / `Site coordinates — verify placement` (warn-amber) / `Manual placement` (accent) / `No georeferencing` (neutral) + confidence dot; secondary line lat/lon to 5 decimals, monospace.
2. **Layers:** segmented control `Streets · Satellite · Topo · Custom` + terrain switch (`3D terrain`, with tile-count/progress while loading). Satellite first-pick opens the provider terms sheet (Esri vs EOX vs configure custom — radio + short license line each + Accept).
3. **Placement:** `Adjust placement` (primary when none/invalid: `Place on map`), `Snap to ground`, `Reset to file georeferencing` (only when a manual override exists), saved-state line ("Saved for this file · 2026-06-10").
4. **Disclosure: Coordinate details** (§9.5).
5. Degraded banner slot (amber, with Retry / Switch provider) — appears above section 1 when active.

### 9.3 Map settings

Kept inside the panel (no separate settings page): layer pick + terrain + custom provider editor (URL template, attribution text, validation feedback inline). Custom editor warns: "Stored only in this browser. Keys you paste stay local."

### 9.4 Placement editor (on-canvas)

- Footer bar (same visual as measurement footer): `[✓ Apply] [↺ Reset] [Esc Cancel]` + live lat/lon/rotation readout (monospace).
- Handles: footprint rotate ring (accent, 40% opacity, hover 70%); height mini-slider docked to panel; drag = grab cursor on ground.
- Search field (if geocoder enabled, §9.7) docked top-center, with provider attribution inside the dropdown footer.
- Terrain + streets drape rule: enabling terrain with Streets active switches imagery to Topo with an inline note (streets tiles drape illegibly on 3D relief).

### 9.5 Coordinate debugging (the "details" disclosure)

Read-only monospace grid — every value the pipeline produced: extraction rung + status + reasons; raw E/N/H/γ/scale; EPSG + resolved proj4 string; computed lat/lon; mercator; anchor scene offset; WCS bbox offset magnitude; active placement source. Copy-as-JSON button (for support/bug reports — contains coordinates, user-initiated only). North indicator: small compass in the viewport corner while map mode is on, driven by `getNorthDirection()`.

### 9.6 Empty / loading / error states

- **Consent modal** (first enable): two short paragraphs (§5.1 wording), checkbox-free (button = consent), link to privacy policy.
- **Starting:** toolbar spinner + skeleton shimmer rectangle where panel will be; map fades in (no popping).
- **No georef empty state** (panel): illustration-free, two lines + primary `Place on map` + link "Why doesn't my file have coordinates?" → remediation corpus entry.
- **Error:** toast (`toastFromError` style) + panel inline error with Retry. Tile-degraded banner per §5.1.
- **All-models-removed while on:** map stays, hint chip "Load a model to place it here".

### 9.7 Geocoder (optional, default ON for the search box, OFF for autocompletion)

Nominatim search endpoint, keyless: explicit-submit only (Enter), never per-keystroke (policy), ≤ 1 req/s client-side throttle, attribution "Search © OpenStreetMap/Nominatim" in dropdown, results cached per session. Behind a constant so it can be disabled instantly. Query text goes to OSM — covered by the same consent modal sentence ("searches are sent to OpenStreetMap").

---

## 10. Internationalization

- New namespace `geo` (one file per locale — see T18 for the 10-file requirement; **real translations: EN + ES only**, others are explicit EN copies until a future translation pass).
- No hardcoded strings: enforced by the design (reasons/errors are keys end-to-end) + key-coverage test (T18).
- Numbers/coordinates formatted via the existing `formatNumber` Intl helper (`src/i18n/config.ts:15`); lat/lon always rendered with `.` decimal separator regardless of locale (geodetic convention) — implement a small `formatCoord` in geo-math.

Full EN string table (ES translated in-file; keys are normative):

```json
{
  "toolbar": { "map": "Map", "enableTooltip": "View model on a map", "disableTooltip": "Exit map mode", "needModel": "Load a model first" },
  "consent": {
    "title": "Enable map mode?",
    "body1": "Map mode loads tiles from public map providers (OpenStreetMap and others you choose). Tile requests reveal the approximate site location to the provider — nothing else.",
    "body2": "Your IFC file never leaves your browser. Searches, if used, are sent to OpenStreetMap.",
    "accept": "Enable map mode", "cancel": "Cancel", "privacy": "Privacy policy"
  },
  "status": {
    "georeferenced": "Georeferenced · {{crs}}", "siteCoords": "Site coordinates — verify placement",
    "manual": "Manual placement", "manualSaved": "Manual placement (saved)", "none": "No georeferencing",
    "invalid": "Georeferencing invalid", "extracting": "Reading georeferencing…",
    "confidenceHigh": "High confidence", "confidenceApprox": "Approximate"
  },
  "layers": { "streets": "Streets", "satellite": "Satellite", "topo": "Topo", "custom": "Custom", "terrain": "3D terrain", "terrainLoading": "Loading terrain… {{loaded}}/{{total}}" },
  "providers": {
    "termsTitle": "Choose a satellite provider", "termsAccept": "Accept and use",
    "esriNote": "Esri World Imagery — requires attribution; review Esri terms for commercial use.",
    "eoxNote": "Sentinel-2 cloudless by EOX — free for non-commercial use (CC-BY-NC).",
    "customTitle": "Custom tile provider", "customUrl": "Tile URL template", "customAttribution": "Attribution text",
    "customHint": "Use {z}/{x}/{y} placeholders. HTTPS only. Stored only in this browser.",
    "customInvalid": "Template must be HTTPS and contain {z}, {x} and {y}"
  },
  "placement": {
    "place": "Place on map", "adjust": "Adjust placement", "snap": "Snap to ground",
    "resetToFile": "Reset to file georeferencing", "savedAt": "Saved for this file · {{date}}",
    "apply": "Apply", "reset": "Reset", "cancel": "Cancel",
    "lat": "Latitude", "lon": "Longitude", "rotation": "Rotation", "height": "Height offset",
    "searchPlaceholder": "Search location…", "searchAttribution": "Search © OpenStreetMap / Nominatim",
    "belowTerrain": "The building appears below the terrain — adjust height or snap to ground.",
    "recenter": "Re-center model", "recenterHint": "Geometry sits {{km}} km from the file origin, which causes precision artifacts."
  },
  "empty": { "noGeoref": "This model has no georeferencing.", "noGeorefHint": "Place it manually, or fix the export in your authoring tool.", "whyLink": "Why doesn't my file have coordinates?", "noModel": "Load a model to place it here" },
  "invalid": { "nullIsland": "Coordinates are 0,0 (Null Island) — a common export default.", "outOfRange": "Coordinates are out of range.", "crsOutOfDomain": "Coordinates fall outside the declared CRS area.", "badScale": "The declared scale factor is invalid.", "unknownCrs": "The file declares an unknown coordinate system.", "noBuffer": "Original IFC bytes unavailable (cached load) — re-open the file to read georeferencing." },
  "crsPicker": { "title": "Which coordinate system?", "hint": "The file has grid coordinates but no usable EPSG code.", "paste": "Paste a proj4 definition", "apply": "Apply" },
  "errors": { "chunkLoad": "Couldn't load the map module. Check your connection and retry.", "tilesDegraded": "Map tiles are unavailable — the provider may be down.", "terrain": "Terrain failed to load.", "elevation": "Couldn't read ground elevation — using flat ground.", "retry": "Retry", "switchProvider": "Switch provider" },
  "debug": { "title": "Coordinate details", "copy": "Copy as JSON", "north": "N" },
  "attribution": { "terrain": "Terrain: Mapzen / AWS Open Data" }
}
```

---

## 11. Performance

Budgets (enforced in T20; measured on a mid-2020s laptop, integrated GPU, 10 Mbps):

| Metric | Budget |
|---|---|
| Entry bundle growth (flag on, mode off) | < 5 KB gz (INV-1) |
| GIS lazy chunk (engine + proj4 + geo code) | < 350 KB gz |
| Enable → first tiles visible | < 2.5 s (warm DNS) |
| Steady-state map mode frame time (50k-element model + tiles) | no regression > 15% vs Mode A same model |
| Tile GPU memory | ≤ 256 MB (UnloadTilesPlugin target) |
| Terrain patch build (3×3, z16 imagery) | < 8 s network-bound; main thread never blocked > 16 ms |
| Disable → resources freed | `renderer.info` baseline ±0; < 200 ms |
| Tile request burst on enable | ≤ 40 requests first 5 s (errorTarget tuning) |

Mechanisms (all specified in tasks): lazy chunk; workers for DEM decode/stitch (`geo-terrain.worker`) and extraction (`geo-extract.worker`); `createImageBitmap` off-main-thread texture decode; transferables everywhere; LRU + GPU-byte unloading; abort-on-epoch; fetch concurrency caps (6); RAF-throttled drag updates; no per-frame allocations in the update path (reuse vectors — the repo already follows this in viewer.ts).

Large-IFC interplay: map mode adds zero cost to fragments rendering; the one shared resource is GPU memory — the memory HUD shows combined estimate (`getGpuEstimateBytes` + `getGpuBytesEstimate`), and the tile byte target yields headroom degradation (fewer cached tiles) rather than model eviction.

---

## 12. Testing strategy

### 12.1 Unit (vitest, jsdom — fast, no GPU)

- geo-math: ≥ 25 cases (T2) — projections, round-trips, signs, golden fixture.
- crs: control points per def family, custom defs (T3).
- geoStore: full state machine + epochs + persistence (T1).
- providers, placement-persistence, placement precedence, elevation decode, terrain geometry from synthetic DEM, placement-edit drag math (T8–T14).

### 12.2 Georeferencing fixture matrix (string STEP fixtures, T4)

1. IFC4 MapConversion + ProjectedCRS `EPSG:25832` → `found`, rung 1, exact values.
2. Same with `Scale=0.001` + mm units → normalized meters.
3. IFC4 MapConversion, `Name='unknown-string'` → `partial` + `unknownCrs`.
4. IFC2x3 ePSet_MapConversion psets → `found`, rung 2.
5. IFC2x3 RefLat/RefLon (positive, NE hemisphere) → `partial`, rung 3.
6. RefLat/RefLon negative compound angles (S/W hemisphere) → sign-correct.
7. RefLat=RefLon=0 → `none` + `nullIsland`.
8. TrueNorth (0.5, 0.866…) → γ_TN = 30° ± 1e-6.
9. Non-unit XAxis vector → normalized; zero vector → γ=0 + reason.
10. E/N outside CRS domain → `invalid` + `crsOutOfDomain`.
11. No georef entities at all → `none`, rung 4.
12. Real file smoke: `public/Ifc2x3_Duplex_Architecture.ifc` → pinned expected status.

### 12.3 Integration (browser-mode vitest; mocked tile fixtures — no external network in CI)

- Enable → tiles render → disable → scene byte-state restored (env snapshot deep-equal).
- Provider swap, terrain toggle, layer + terrain combined lifecycles.
- Placement: extracted vs saved-manual precedence; editor apply/cancel; re-center flow.
- Degraded path: blackholed template → banner → switch provider recovers.
- Embed/kiosk: attribution present.

### 12.4 Leak & stress (T20)

- 10× enable/disable (with terrain + swaps) ⇒ `renderer.info.memory` and scene child count exactly baseline.
- 500 MB synthetic buffer quick-scan timing; extraction cancel mid-parse.
- Long-session soak (scripted 5-min camera orbit) — no monotonic memory growth (±5% band).

### 12.5 Race grid (scripted, CI)

All pairs of `{enable, disable, switch-layer, toggle-terrain, load-model, remove-model, navigate-landing}` fired at 0 ms / 50 ms / 250 ms offsets ⇒ final state always consistent with the LAST user intent; zero unhandled rejections; zero stale commits (epoch assertions).

### 12.6 Manual checklist (PR template for T16/T20; real network)

Real providers respond; 3 real georeferenced IFCs place correctly (collect: one Revit IFC4 w/ MapConversion, one ArchiCAD IFC2x3 w/ site coords, one broken Null-Island file); slope-site terrain snap; mobile bottom-sheet flows; ES locale pass; embed attribution; private-window (no storage) pass.

### 12.7 Regression

- Full existing suite green (INV-4).
- Toolbar snapshot with flag off ≡ pre-feature.
- Mode-A perf smoke unchanged (load Duplex, validate, measure — timings within noise).

---

## 13. Definition of done

Ship when ALL of the following hold:

1. **Invariants:** INV-1…INV-6 each verified by a named test or checklist item (traceability table in the GA PR description).
2. **Flows:** every §5 flow demonstrable, including all five §5.2 broken-data scenarios, on desktop and mobile widths, in EN and ES.
3. **Quality gates:** `tsc -b` clean; lint clean; all suites (§12.1–12.5, 12.7) green 10 consecutive CI runs; §11 budget table green with recorded measurements.
4. **Resource correctness:** leak suite exact-baseline; disable restores environment deep-equal; epoch race grid green.
5. **Legal/privacy:** attribution pill in all chrome modes; provider `lastReviewed` re-checked at GA date; consent modal wired; privacy policy updated (map tiles + optional geocoder disclosure — coordinate with `project_legal_pages` owner); no coordinates/file names in analytics (property audit).
6. **Cost sustainability:** zero keys in the repo; default providers keyless; OSM policy compliance points (attribution, identification, caching, no prefetch) individually checked.
7. **Docs:** T21 artifacts merged; T0 decision block present in `basemap-engine.ts`; this plan updated with any deviations (deviations MUST be recorded, not silently diverged).
8. **Product sign-off:** the three-file manual placement demo (§12.6) recorded as a GIF for the README; feature flag default decision (on/off at GA) made consciously by the owner.

---

## Appendix A — Map & terrain provider research (licensing verified 2026-06)

### A.1 Comparison

| Provider | Kind | Key? | Cost | License/terms summary | Sustainability | Complexity | Verdict |
|---|---|---|---|---|---|---|---|
| **OpenStreetMap raster** (`tile.openstreetmap.org`) | Streets | No | Free | OSMF Tile Usage Policy: attribution "© OpenStreetMap contributors" required & always visible; requests must be identifiable (browser Referer suffices for websites); honor cache headers (≥7 d); **no bulk prefetch/offline**; heavy use should move to third-party/self-hosted; access can be withdrawn for commercial services | Donation-run; fine at our scale if polite; swap-ready via abstraction | Trivial (XYZ) | **Default streets layer** |
| **OpenTopoMap** | Topo | No | Free | CC-BY-SA tiles; attribution required; fair-use volume | Community-run; same caveats as OSM | Trivial | Default topo layer |
| **Esri World Imagery** (`server.arcgisonline.com`) | Satellite (high-res) | No (URL) | Free *only* for non-revenue apps + attribution, under ArcGIS terms; **not for general commercial use without ArcGIS account/license** | Legal gray for a monetizing product → gate behind explicit user terms-acceptance; never silent default | Esri-funded, stable | Trivial | Opt-in with terms notice |
| **EOX Sentinel-2 cloudless** | Satellite (10 m) | No | Free | **CC-BY-NC 4.0** (non-commercial only) + attribution | Stable (ESA-adjacent) | Trivial | Opt-in with terms notice (NC flag) |
| **NASA GIBS** (WMTS) | Satellite (low-res, ~250 m) | No | Free | Open NASA imagery; attribution requested | Government-run, very stable | WMTS template | Fallback global satellite |
| **AWS Terrain Tiles / Mapzen terrarium** (`s3.amazonaws.com/elevation-tiles-prod`) | Terrain DEM | No | Free | AWS Open Data program; mixed open sources (SRTM, USGS NED, ETOPO1…); attribution list required | AWS-sponsored Open Data; the de-facto free DEM | PNG decode (simple formula) | **Terrain + elevation source** |
| Mapbox / MapTiler / Stadia | All | Yes | Free tier w/ key | Per-key billing; ToS restrict key exposure | Vendor lock-in, cost at scale | Trivial | **Rejected as defaults**; reachable via custom slot (user's own key, stored locally) |
| Cesium ion (World Terrain/Imagery) | Terrain/3D | Yes | Community tier free (non-commercial-ish), paid beyond | Token + ToS | Quality excellent, cost risk | Engine supports it (`CesiumIonAuthPlugin`, `QuantizedMeshPlugin`) | Future BYO-token option |
| Google Photorealistic 3D Tiles | 3D context | Yes | $ credit then paid | Strict display/attribution ToS, no mixing with non-Google basemaps | High wow, high lock-in | Engine supports it | Out of scope v1 |
| OpenFreeMap / Protomaps / VersaTiles (vector) | Streets (vector) | No | Free | Open; but **vector** tiles need a raster/GL renderer — incompatible with our raster-in-three approach | Promising for future self-host raster | High (style rendering) | Not v1; noted as OSM-pressure relief path |
| **Nominatim** (geocoding) | Search | No | Free | 1 req/s, identifiable requests, attribution, **no autocomplete** | OSMF-run | Trivial | Search box (explicit submit only) |

### A.2 Honest constraint

There is **no free, keyless, license-clean, high-resolution global satellite layer**. The design absorbs this truth instead of hiding it: streets/topo are clean defaults; satellite is an explicit, informed user choice (Esri/EOX terms sheet) or BYO. Revisit at GA (`lastReviewed`).

## Appendix B — IFC georeferencing reference (implementer crib sheet)

**B.1 IFC4 / 4x3 (rung 1):** `IfcMapConversion` (subtype of `IfcCoordinateOperation`): `SourceCRS` (→ the model's `IfcGeometricRepresentationContext`), `TargetCRS` (→ `IfcProjectedCRS`), `Eastings`, `Northings`, `OrthogonalHeight`, `XAxisAbscissa`, `XAxisOrdinate` (unit direction of the project X-axis expressed in grid coords → γ = atan2(ordinate, abscissa)), `Scale`. `IfcProjectedCRS`: `Name` (commonly `"EPSG:NNNN"`), `GeodeticDatum`, `MapProjection`, `MapZone`, `MapUnit`. IFC4x3 adds `IfcMapConversionScaled` variants — out of scope; detect & downgrade to `partial` with reason if encountered.

**B.2 IFC2x3 (rungs 2–3):** no MapConversion entity. Convention (bSI georeferencing guideline): property sets `ePSet_MapConversion` / `ePSet_ProjectedCRS` with same-named properties. Fallback: `IfcSite.RefLatitude` / `RefLongitude` (`IfcCompoundPlaneAngleMeasure` = `[deg, min, sec, (millionth-sec)]`, all components carry the sign of the first non-zero), `RefElevation`; `TrueNorth` on `IfcGeometricRepresentationContext` (2D `IfcDirection`; γ_TN per §4.3 note — verify sign against fixture).

**B.3 LoGeoRef levels (Clemen & Görne)** — useful shared vocabulary: 10 = postal address only; 20 = site lat/lon; 30 = IfcSite local placement carries grid coords; 40 = context WCS + TrueNorth; 50 = MapConversion + CRS. Our ladder maps rung1/2→50, rung3→20/40. Level 30 (grid coords smuggled into site placement) is intentionally NOT auto-interpreted (too ambiguous to distinguish from "modelled far from origin") — it surfaces as `largeWcsOffset` + manual flow instead.

**B.4 Field reality (why the gates exist):** Revit default site = (0,0) Null Island; exports at survey point put geometry megameters from origin; mm-unit files with Scale traps; non-normalized axis vectors; TrueNorth set but MapConversion absent (or disagreeing); EPSG field containing prose ("ETRS89 UTM Zone 32" not "EPSG:25832" — add a loose-text matcher for the common ones as a `partial` upgrade, T4 stretch).

## Appendix C — Key references

- ThatOpen map-support gap: github.com/ThatOpen/engine_components/issues/258
- Tile engine: github.com/NASA-AMMOS/3DTilesRendererJS (npm `3d-tiles-renderer`; plugin docs under `src/three/plugins/`)
- geo-three (design reference / fallback model): github.com/tentone/geo-three
- OSM Tile Usage Policy: operations.osmfoundation.org/policies/tiles/
- AWS Terrain Tiles (terrarium): registry.opendata.aws/terrain-tiles/ · tile endpoint `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- Esri attribution/terms: developers.arcgis.com/documentation/esri-and-data-attribution/
- EOX Sentinel-2 cloudless: s2maps.eu (CC-BY-NC)
- NASA GIBS WMTS: nasa-gibs.github.io/gibs-api-docs/
- proj4js: github.com/proj4js/proj4js
- bSI georeferencing guidance & LoGeoRef: buildingSMART "User Guide for Geo-referencing in IFC"; Clemen & Görne, "Level of Georeferencing (LoGeoRef)"
- Nominatim usage policy: operations.osmfoundation.org/policies/nominatim/
