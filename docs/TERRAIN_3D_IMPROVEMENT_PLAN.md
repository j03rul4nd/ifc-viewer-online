# 3D Terrain Improvement Plan — provider sync + fidelity

> **STATUS: EXECUTED (2026-06-12)** — P0, P1, P2 and P3.1 are implemented and
> tested (478 tests green, build green). Deviations from the plan, decided
> during execution:
> • P3.2 "snap to terrain" was intentionally **skipped**: the patch already
>   shifts heights so the terrain surface passes through the ground plane at
>   the anchor — height offset 0 IS terrain-snapped by construction, and the
>   placement-rebuild (P3.1) re-anchors after moves, so a separate snap action
>   adds nothing. Revisit only if anchor-relative semantics change.
> • P3.3 EU mirror: not wired (left as a documented option).
> • New pure module `src/lib/geo/terrain-sampling.ts` hosts the sampling /
>   normals / zoom math shared by worker and tests; `latLonToTileFloat` was
>   added to `geo-math.ts`.
> The rest of this document is the original plan, kept as design rationale.
>
> **ROUND 2 (same day, user feedback "valleys don't show"):** the root cause
> was the opaque FLAT basemap plane occluding terrain below the anchor
> elevation (rivers/valleys dip under it). Implemented on top of the plan:
> • `BasemapEngine.setHole(planes)` — 4 world-space clipping planes
>   (clipIntersection, material-level, OBC already enables localClipping)
>   cut the flat tiles away under the patch (inset by the edge fade) while
>   terrain is on; restored on teardown; recomputed on placement moves.
> • Terrain visualization styles `imagery | shaded | hypsometric`
>   (`TerrainStyle`) + vertical exaggeration ×1–×3, both LIVE (vertex-colour
>   re-bake + `mesh.scale.z`), persisted in geoStore
>   (`ifc-geo-terrain-style:v1` / `ifc-geo-terrain-exagg:v1`), sticky across
>   rebuilds, exposed in GeoPanel under the terrain toggle.
> • Grid density 256 → 384 segments (385² verts ≈ 9.5 m spacing at z15).
> • New pure helpers: `hypsometricColor`, exaggeration-aware
>   `shadeFromNormal(…, ambient, exaggeration)`.

Step-by-step implementation guide for the next session. Scope: fix the
provider-switch staleness bug and substantially raise terrain fidelity, without
touching the map-mode invariants. Read `GIS_MAP_INTEGRATION_PLAN.md` §4 and
`GIS_MAP_MODE.md` first — this document assumes both.

**User-reported problem (2026-06):** (1) switching basemap providers while 3D
terrain is on leaves the terrain draped with the OLD provider's imagery;
(2) terrain should exploit the elevation data far better — it currently looks
coarse/blurry compared to the flat basemap.

---

## 1. Current-state analysis (exact code references)

### BUG-1 · Terrain drape not updated on provider switch
- `src/lib/geo/geo-system.ts` → `setProvider(p)` (~line 213): updates
  `provider` and calls `engine.setProvider(p)` (flat basemap swaps correctly),
  but **never touches `terrain`**. The patch keeps the imagery it was built
  with (`buildTerrainPatch(placement, provider?.urlTemplate)` captured the
  template once, in `setTerrain`).
- Aggravator: `setTerrain(true)` early-returns when `terrain` already exists
  (`if (!engine || !geoRoot || !placement || terrain) return`, ~line 223), so
  even a programmatic re-enable is a no-op. The ONLY current path that
  refreshes the drape is toggle off → on in the panel.
- `src/components/GeoPanel.tsx` → `applyProvider()` calls `geo.setProvider` +
  `refreshAttributions()` only. It must not grow terrain logic — the fix
  belongs in `geo-system` so SDK/embed callers get it too.

### Fidelity gaps (all in `src/lib/geo/geo-terrain.ts` + `src/workers/geo-terrain.worker.ts`)
| ID | Gap | Where | Effect |
|---|---|---|---|
| F1 | 9 independent per-tile meshes; adjacent tiles sample different border pixels (terrarium tiles have **no edge overlap** — verified, see §3) | `assemblePatch()` builds one `PlaneGeometry` per tile | Vertical cracks/seams along internal tile borders |
| F2 | Nearest-neighbour height sampling (`Math.round(j * step)`) when downsampling 256px → 65×65 grid | worker `fetchHeights()` | Terracing/aliasing; throws away real samples |
| F3 | Imagery fetched at the SAME z/x/y as the DEM tile (one 256px image stretched over ~4.9 km at z13 ≈ 19 m/px) | worker `buildTile()`/`fetchImagery()` | Drape is blurry vs. the flat basemap streaming z16-19 next to it |
| F4 | `MeshBasicMaterial` is unlit → the `computeVertexNormals()` call is dead weight; terrain reads as a flat poster | `assemblePatch()` | No relief perception |
| F5 | Zoom hardcoded `DEFAULT_ZOOM = 13`, grid `65×65` → vertex spacing ≈ 76 m | `geo-terrain.ts` constants | Site-scale bumps invisible |
| F6 | Placement edits while terrain is on: patch stays at the old geographic tiles until Apply (`finishEdit` rebuilds) — live drag staleness is accepted, but a placement applied via `setPlacement` from SDK never rebuilds | `geo-system.setPlacement` | Stale terrain for SDK/embed movers |

### What must NOT change
- INV-2 (map aligns to model; 1 unit = 1 true metre at anchor — terrain z is
  divided by `WEB_MERCATOR_WORLD_M × cos φ₀`, keep that), INV-3 (env
  snapshot/restore), INV-5 (only z/x/y in URLs, no coords in analytics).
- The epoch/token cancellation patterns (`terrainToken` in geo-system,
  `epoch` in geoStore). Every new async path needs the same guards.
- Worker conventions: fresh worker per run, UUID correlation, transfer lists,
  60 s watchdog (`buildTerrainPatch` is the template).
- The fixed no-LOD 3×3 patch concept (the scope cut that keeps this bug-class
  small). We improve WITHIN it; do not introduce streaming/LOD terrain.

---

## 2. Verified external facts (primary sources, fetched 2026-06)

| Fact | Detail | Source |
|---|---|---|
| Terrarium max zoom = **15** | Beyond z12-13, most of the world is oversampled ~30 m SRTM; real extra detail at z14-15 exists where better sources feed the mosaic | github.com/tilezen/joerd `docs/data-sources.md` |
| Regional native resolutions | USA 3DEP **10 m** (z10-15), UK **2 m**, Austria/Norway **10 m**, NZ **8 m**, ArcticDEM **5 m** (>60°N), Europe EU-DEM 30 m, elsewhere SRTM 30 m, Canada NRCAN 90 m | same |
| Ground resolution per zoom (equator) | z13 ≈ 19.1 m/px · z14 ≈ 9.6 m/px · z15 ≈ 4.8 m/px (× cos φ) | derived from `WEB_MERCATOR_WORLD_M / (256·2^z)` (`geo-math.groundResolution`) |
| No tile edge overlap | joerd formats doc lists plain 256×256 tiles; no buffer/overlap between adjacent terrarium tiles → border vertices of adjacent tiles are DIFFERENT samples | github.com/tilezen/joerd `docs/formats.md` |
| **`normal` tiles variant exists** | Same bucket, `…/normal/{z}/{x}/{y}.png`: RGB = precomputed surface normal, A = coarsely quantized elevation. Usable for hillshading without computing normals (we will compute our own instead — zero extra fetches — but it is the documented fallback) | same |
| EU replica bucket | `elevation-tiles-prod-eu` (eu-central-1) mirrors the primary | registry.opendata.aws/terrain-tiles |
| Attribution | Multi-source attribution required — keep `TERRARIUM_ATTRIBUTION` (already shown via the pill); full text list in joerd `docs/attribution.md` | same |
| OSM tile policy | No pre-emptive fetching beyond what the user views; "automated scans across wide bounding boxes, **especially at z≥14**" are flagged; never send no-cache; honour cache headers (browser does) | operations.osmfoundation.org/policies/tiles |

Policy consequence for the HD drape (step P2): for **OSM/OpenTopoMap** cap the
drape at `terrainZoom + 1` (4 child tiles per terrain tile = 36 per patch —
same order of magnitude the flat basemap fetches anyway for the visible area).
For **Esri/EOX/custom** providers `+2` (16 children, 144/patch) is acceptable.
Never `+3`.

---

## 3. Target design

### D1 — Split the two lifecycles: heights vs drape
Heights depend on (lat, lon, zoom). Drape depends on (provider, tiles).
Today both are fused in one `buildTerrainPatch` call — that fusion IS BUG-1.

- Worker gets a second message type `{ type: 'drape-terrain', id, tiles:
  Array<{tx,ty}>, zoom, imageryTemplate, imageryZoomOffset }` that fetches and
  composites imagery ONLY, returning `Array<{tx, ty, imagery: ImageBitmap}>`
  (transferred).
- `TerrainPatch` (geo-terrain.ts) gains `redrape(imageryTemplate: string |
  null, zoomOffset: number): Promise<void>` — runs the drape worker, then
  swaps `material.map` per mesh (dispose old texture + close old bitmap;
  null template → untextured colour). Patch keeps an internal
  `drapeToken` so an overlapping redrape/dispose drops stale results.
- `geo-system.setProvider(p)` becomes:
  ```ts
  setProvider(p) {
    provider = p
    engine?.setProvider(p)
    if (terrain) void redrapeActiveTerrain()   // token-guarded, never throws
  }
  ```
  where `redrapeActiveTerrain()` captures `terrainToken`, awaits
  `terrain.redrape(provider?.urlTemplate ?? null, drapeOffsetFor(provider))`,
  and silently aborts if the token moved (disable/toggle raced).
- `geo-system.setPlacement(p)`: if `terrain` exists and the new placement's
  centre tile (at the patch zoom) differs from the patch's centre tile →
  schedule a debounced (≈800 ms) full rebuild (`teardownTerrain(); void
  api.setTerrain(true)`?? — careful: `setTerrain(true)` reads
  `geoStore`-independent locals, fine). Debounce avoids thrashing during
  editor nudges; F6 fixed for SDK callers too.

### D2 — One unified height grid → one seamless mesh
Replace 9 grids/meshes with a single patch-wide sampling:

- Worker: after fetching the 9 terrarium tiles, blit each `ImageData` into one
  `Float32Array` of **768×768** decoded heights (row-major, north-up; reuse
  `decodeTerrarium`). From it, **bilinearly** sample an `(N+1)×(N+1)` vertex
  grid spanning the whole patch (recommended N = 256 → 257×257 ≈ 66k vertices
  ≈ 131k triangles — fine for any GPU this app targets; make it a constant).
  - Bilinear at fractional pixel `(u,v)`:
    `h = lerp(lerp(h00,h10,fx), lerp(h01,h11,fx), fy)`.
  - Also compute per-vertex **normals via central differences** on the height
    grid: `n = normalize(-(dh/dx)/sx, -(dh/dy)/sy, 1)` with `sx = sy =`
    metres-per-sample at the patch latitude (use `groundResolution(lat, zoom)
    × (768/grid)` scaling). Pack as a `Float32Array` and transfer.
  - Edge tiles missing (date line/pole skip in current code): keep the skip
    but fill their region of the unified grid with the nearest valid value so
    geometry stays rectangular (or shrink the patch — simpler: clamp).
- Main thread (`assemblePatch` rewrite): ONE `PlaneGeometry(patchW, patchH,
  N, N)` positioned at the patch centre in the normalized frame
  (`tileNormalizedCenter` of the centre tile ± size); set z from heights
  (still `(h − anchorElevation) × metresToNormalized`), set the supplied
  normals, keep the RGBA `color` attribute for the existing edge fade.
- **Seams disappear by construction** (one mesh). Drop the per-tile geometry
  path entirely. The drape (D1/D4) still needs per-tile texturing: split the
  single geometry into 9 **material groups** (`geometry.addGroup`) with one
  material per tile — `PlaneGeometry` vertices are row-major so building an
  index per group is the one fiddly part — OR simpler and recommended:
  worker composites the 9 (or HD, see D4) imagery tiles into **one
  patch-wide texture** (e.g. 3×3 × 512px = 1536² canvas → single
  `ImageBitmap`) so the single mesh keeps a single material. One texture also
  makes `redrape()` a one-swap operation. Max texture size 1536-3072² is safe
  (WebGL guarantees ≥4096 on anything modern); keep ≤ 4096.

### D3 — Adaptive zoom + density
- `terrainZoomFor(placement, modelSpanM)`: default **z15** (patch ≈ 3.7 km at
  equator — plenty for buildings); use **z14** when the model span > ~1.5 km
  or |lat| > 60° (patch shrinks with cos φ — at 60° a z15 patch is ~1.8 km);
  clamp to joerd max 15. Vertex spacing at z15 with N=256: 3×1223 m / 256 ≈
  **14 m** (≈ the real data resolution in the best-mapped regions; cf. §2).
- Keep `sampleElevation` (elevation.ts) at z13? No — bump `SAMPLE_ZOOM` to 15
  for consistency with the patch.

### D4 — High-resolution drape
- Worker composites imagery at `imageryZoom = terrainZoom + offset` where
  `offset = 1` for OSM-policy providers (`osm`, `opentopomap`) and `2`
  otherwise, **clamped by `provider.maxZoom`** (gibs maxZoom 8 → offset
  effectively 0 with low-zoom terrain… clamp maths: `imageryZoom =
  min(terrainZoom + offset, provider.maxZoom)`).
- Children of slippy tile `(x,y,z)` at `z+n` are `(2ⁿx+i, 2ⁿy+j)` for
  `i,j ∈ [0, 2ⁿ)`. Draw each child into the patch canvas at its slot
  (`drawImage`, `imageSmoothingEnabled = true`); missing/failed children:
  leave the slot — fill the canvas first with a neutral colour, never fail the
  whole drape for one tile (current per-imagery try/catch behaviour, keep).
- Keep `imageOrientation: 'flipY'` exactly as today (three.js ignores `flipY`
  for ImageBitmap — comment already in the worker). For a patch-wide canvas
  drawn top-down you flip ONCE on the final `createImageBitmap(canvas,
  { imageOrientation: 'flipY' })` — do not flip the children individually.
- Texture settings on the main thread: `colorSpace = SRGBColorSpace` (already
  done), `anisotropy = min(8, renderer.capabilities.getMaxAnisotropy())`,
  `generateMipmaps = true` (default), `minFilter = LinearMipmapLinear`
  (default). Anisotropy is the single biggest visual win for oblique views.
- Provider id must reach the worker decision: pass `imageryZoomOffset` from
  geo-system (`p.id === 'osm' || p.id === 'opentopomap' ? 1 : 2`) — keep the
  policy knowledge OUT of the worker.

### D5 — Relief shading without double-lighting
Map imagery already contains baked hillshading/colour; putting it under the
scene's directional light (Lambert/Standard) double-shades and shifts colours
with the dark theme. Recommended: **bake subtle shading into the existing
vertex colours** (the RGBA `color` attribute already exists for the edge
fade): `shade = 0.55 + 0.45 · max(0, n·L)` with a fixed L ≈ normalize(-0.4,
0.5, 0.75) (matches the scene key light direction loosely), multiply RGB by
`shade`, keep A = edge fade. Zero material changes, works with
`MeshBasicMaterial`, theme-stable, and `vertexColors: true` is already set.
Drop the dead `computeVertexNormals()` only if you skip normals entirely —
but D2 computes proper normals anyway; use them for this shading and (if
desired later) for a lit-material experiment behind a constant flag.

---

## 4. Step-by-step execution plan

Work in this order; `npm run test` + `npx tsc -b` green after every step.
All new user-visible strings → `src/locales/en/geo.json` + `es/geo.json`
(+ regenerate the 8 EN copies, keep `_status` flag) and register nothing new
(namespace `geo` already wired).

### P0 — BUG-1: provider switch redrapes terrain (smallest correct fix first)
1. Worker (`src/workers/geo-terrain.worker.ts`): add `drape-terrain` message
   (in/out types exported like the existing ones). Reuse `fetchImagery`;
   accept `tiles[{tx,ty}]`, `zoom`, `imageryTemplate`, `imageryZoomOffset`
   (offset can land in P2 — for P0, refetch at the same zoom as today).
2. `geo-terrain.ts`: store per-mesh `{tx, ty}` (or the patch tile list) inside
   the returned `TerrainPatch`; implement `redrape(template)` → runs the
   worker (same watchdog/UUID pattern as `buildTerrainPatch`), swaps each
   mesh's `material.map` (+ dispose old texture, close old bitmap, untextured
   fallback colour when template null), guarded by an internal token.
3. `geo-system.ts`: add `redrapeActiveTerrain()`; call from `setProvider`.
   Capture `terrainToken` before the await; bail if it moved.
4. Tests (`geo-terrain.test.ts` / new `geo-system` cases with the engine mock
   + a mocked `buildTerrainPatch`): provider switch with terrain on calls
   `redrape` with the new template; redrape racing `disable()` does not
   resurrect; terrain off → `setProvider` does nothing terrain-related.
5. Acceptance: switch Callejero→Topográfico→Satélite with terrain on; drape
   follows within ~1-2 s; no leak (`renderer.info.memory.textures` returns to
   baseline after disable).

### P1 — Unified seamless mesh + bilinear + normals (D2, D5)
1. Rewrite worker height path: 9 tiles → one 768² `Float32Array` → bilinear
   `(N+1)²` vertex grid + central-difference normals; transfer both. Keep the
   `anchorElevation` output (sample bilinearly at the anchor's fractional
   pixel — replaces today's nearest `gi/gj`).
2. Rewrite `assemblePatch`: single geometry, apply heights/normals, vertex
   colours = edge fade × shade (D5). Single material. Per-tile imagery can
   remain 9 textures TEMPORARILY by keeping 9 meshes that share the one
   height grid — but the recommended cut is to land the patch-wide composite
   texture (D4 step 1) in the same PR so the mesh count drops to 1.
3. Pure-function tests: export the bilinear sampler + normal computation from
   a small `terrain-sampling.ts` (importable by worker AND vitest — same
   pattern as `georef-ladder.ts`): bilinear at integer coords == nearest;
   bilinear midpoint == average; normal of a constant slope plane matches the
   analytic normal; seam test: heights sampled across an internal tile border
   are continuous (build two synthetic adjacent tiles with a linear ramp).
4. Acceptance: no visible cracks at any internal border (synthetic ramp test
   + visual); anchor still sits exactly on the ground plane (existing
   geo-system test stays green).

### P2 — HD drape + adaptive zoom (D3, D4)
1. Worker: composite patch-wide (or per-tile) imagery at `terrainZoom +
   offset` with the child-tile math; single final flipY.
2. `geo-terrain.ts`: anisotropy + texture settings; `terrainZoomFor()`
   replacing `DEFAULT_ZOOM`; thread `imageryZoomOffset` from geo-system.
3. `elevation.ts`: `SAMPLE_ZOOM` 13 → 15.
4. Tests: zoom selection table (span/lat cases); child-tile index math
   (`(2,3) z5 → children (4,6)(5,6)(4,7)(5,7) z6`); offset clamping vs
   `provider.maxZoom`; OSM gets offset 1, esri gets 2.
5. Acceptance: with satellite (Esri) terrain on, drape sharpness comparable
   to the flat basemap at the same camera distance; OSM drape never fetches
   more than `(3·2)² = 36` imagery tiles per build.

### P3 — Polish
1. `setPlacement` debounce-rebuild when the centre tile changed (D1 last
   bullet) — fixes F6.
2. Wire "snap to ground": `placement.resetHeight` button currently zeroes the
   offset; add a second action using `sampleElevation` + patch
   `anchorElevation` so the model base meets the terrain surface exactly
   (string keys: `placement.snapToTerrain` EN+ES).
3. Optional (cheap, nice): EU users → `elevation-tiles-prod-eu` mirror behind
   a const; do NOT auto-detect region (privacy: no IP-based logic client-side
   anyway — just leave a commented constant).
4. Update `docs/GIS_MAP_MODE.md` (terrain section + maintainer notes) and the
   memory note `project_gis_map_built.md` when done.

---

## 5. Pitfalls (learned the hard way — do not rediscover these)

1. **Hidden-tab verification trap:** the preview browser tab is `hidden` →
   Chrome freezes ALL `requestAnimationFrame` (geo-system's RAF and
   3d-tiles-renderer's internal queues). Tiles will appear "not to load" in
   headless verification. Use `globalThis.__basemapTiles` (dev-only handle in
   `basemap-engine.ts`) and manual `update()` pumping, or verify in a visible
   browser. Terrain worker fetches are NOT rAF-driven and work hidden.
2. **ImageBitmap flipY:** three.js ignores `texture.flipY` for ImageBitmap.
   The flip MUST happen in `createImageBitmap(..., { imageOrientation:
   'flipY' })` — once, on the final composite only.
3. **Transfer lists:** every `Float32Array.buffer` and `ImageBitmap` goes in
   the `postMessage` transfer array or you silently structured-clone megabytes.
4. **Token races:** redrape/rebuild/dispose can interleave (user spams layer
   buttons). Every await must re-check its captured token. `geoStore` epoch
   guards UI state; `terrainToken` guards GPU state — keep both.
5. **i18next is STRICTLY typed:** new keys must exist in `en/geo.json` before
   `t('geo:…')` compiles; dynamic keys need `t(key, { defaultValue })`.
6. **Zustand selectors:** never return fresh arrays/objects from a
   `useGeoStore(selector)` without memo (footgun documented in
   `validationStore.ts:428`).
7. **vite manualChunks:** if you add a new geo-only dependency, exclude it in
   `vite.config.ts` like `3d-tiles-renderer`/`proj4` or it lands in an eager
   vendor chunk.
8. **Do not** move terrain logic into `GeoPanel` — the panel orchestrates
   store state; `geo-system` owns GPU lifecycles (SDK/embed parity).
9. **OSM policy:** offset ≤ 1 for OSM-family providers, rely on browser HTTP
   cache, never add cache-busting params (INV-5 also forbids extra params).
10. **PlaneGeometry vertex order** is row-major from +y (north) — the worker's
    height rows (row 0 = north) already match; keep that convention in the
    unified grid or the terrain mirrors north/south silently.

## 6. Final verification checklist

- [ ] `npm run test` + `npx tsc -b` + `npm run build` green; GIS chunks still
  lazy (`geo-system` / `GeoPanel` separate in build output; entry ±0).
- [ ] Visual: terrain on → switch all 4 layer kinds → drape follows each time.
- [ ] Visual: no cracks across the patch; relief readable (shading) on a
  mountainous location (e.g. manual placement at 46.4°N 9.8°E, Alps).
- [ ] Toggle terrain ×10 + disable map: `renderer.info.memory` at baseline.
- [ ] Placement nudge > 1 tile then Apply → terrain follows (and SDK
  `setPlacement` path rebuilds after debounce).
- [ ] OSM drape network audit: ≤ 36 imagery fetches per build, all cacheable.
- [ ] Attribution pill still lists provider + terrarium when terrain ready.
