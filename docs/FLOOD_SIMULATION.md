# Rain-flood simulation

A 2-D pluvial flood simulation that runs entirely in the browser, on the user's
GPU. Nothing about the model leaves the machine. It is a **simplified,
indicative** simulation — not a certified hydraulic study — and the UI says so
wherever results appear.

Code: `src/features/flood/` (self-contained; lazy-loaded; gated by
`VITE_FEATURE_FLOOD`).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Solver (CPU reference, WebGPU, WebGL2), worker, test cases, demo grid | **done** |
| 2 | Terrain + building rasterisation from the IFC, georeferencing, 3-D water layer, panel | **done** (flag off) |
| 3 | Timeline (hyetograph, flooded-area curve, scrub, replay), probe, flow particles, speed view, snapshots, infiltration, hyetograph editor | **done** (flag off) |
| 4 | Affected IFC elements in the validation panel, CSV / GeoTIFF / ASC / PNG / video export, legend in every capture, 10 languages | **done** (flag off) |

With `VITE_FEATURE_FLOOD=true` the viewer gets a Flood tool (rail icon and
Tools menu): build the grid from what is loaded, run a storm, see the water.
The solver alone is exercised by the dev page `flood-lab.html` and by
`npm run test:flood-gpu`.

## The scheme

Local-inertial shallow water (Bates, Horritt & Fewtrell 2010) with the flux
weighting of de Almeida et al. (2012), on a regular staggered grid: depth `h`
in the cells, discharges `qx`, `qy` on the faces.

Per step:

1. **Flux** on every face:
   `q⁺ = (q̄ − g·h_f·Δt·∂η/∂x) − friction`, with `η = z + h`,
   `h_f = max(η_L, η_R) − max(z_L, z_R)` (no flow below `hEps`),
   `q̄ = θ·q + (1 − θ)·(q_prev + q_next)/2`, Manning's `n` averaged over the
   two cells. Faces touching an obstacle carry nothing.
2. **Limiter**: a cell whose outflows would take more water than it holds has
   them scaled down by `h / outflow`. Each face has one donor, so mass is
   conserved exactly and depth never goes negative.
3. **Continuity**: `h += Δt/Δx · (in − out) + Δt · rain · rainFactor`.

**Step**: `Δt = α·Δx / √(g·h_max)` (α = 0.7), floored to whole milliseconds and
clamped so it never crosses a rain interval or the requested stop time. The
clock is an integer number of milliseconds on every backend, so CPU, WebGPU and
WebGL2 take *exactly* the same steps (the parity suite checks the step counts),
the rain that has fallen is known exactly from the clock, and long events do
not drift.

**Boundaries**: closed, or free outlet (water leaves only; driven by the bed
slope falling outwards, at least `freeSlopeMin` — LISFLOOD-FP's normal-depth
outlet). Outflow is accumulated per boundary face and folded into a float64
total on every read.

**Obstacles**: blocked cells take no water, give none and receive no rain.
Their rain is meant to be redistributed by `rainFactor` (roof drainage to the
building's perimeter — phase 2).

### Implicit friction (a departure from Bates 2010)

Bates' scheme lags friction one step: `q⁺ = b / (1 + a·|q_old|)` with
`a = g·Δt·n² / h_f^(7/3)`. On shallow, friction-dominated sheet flow — rain on
a slope, which is what this feature simulates — that recurrence degenerates
into `q⁺ ≈ C / q_old` and oscillates with period two. Measured on the
rain-on-plane case at α = 0.7: outlet discharge swinging between 0.43 and 1.68×
the rainfall, and depths off by 48 % near the outlet. α = 0.3 hides it at 2.3×
the cost.

The solvers instead take the root of `q⁺·(1 + a·|q⁺|) = b`:
`q⁺ = 2b / (1 + √(1 + 4a·|b|))`. Same Manning steady state, same cost (one
square root), no oscillation for any α up to 0.9 and cells from 0.5 to 5 m
(tested). `friction: 'bates'` keeps the original for comparison.

### Known limit: supercritical flow

The local-inertial equations drop the advection term. Over a **dry** bed, a dam
break becomes a bore — a ~0.58 m plateau whose front travels about half as far
as Ritter's analytical `2·√(g·h0)·t` (26 m vs 75 m in 12 s) — whatever θ or α.
That is the scheme, not a bug, and it is why rainfall flooding on urban terrain
(sub-critical, friction-dominated) is the use case. The solver sits behind
`FloodSolver` (`core/solver-api.ts`), which only exposes cell-centred `h, u, v`
and maxima: a shock-capturing finite-volume scheme (Kurganov–Petrova, HLL) can
replace it without touching anything else.

## Building the grid from the scene (phase 2)

`system.ts` (loaded through `viewer.getFlood()`), in order:

1. **Geometry** — every loaded model's items, read through fragments'
   `getItemsGeometry` into the feature's own meshes (`lib/scene/item-triangles.ts`,
   shared with the solar analysis): the viewer's fragments meshes follow the
   camera (tiles, LOD) and cannot be trusted off-screen. `IfcSite` and
   `IfcGeographicElement` are terrain; spaces, openings, furniture and abstract
   items are skipped; everything else may be an obstacle. Cached per model.
2. **Domain** (`raster/frame.ts`) — the models' plan footprints plus a margin,
   at the requested cell size, coarsened (never cropped) past ~1 M cells
   (300 k on phones). A georeferenced model gets a grid rotated by −γ: cells
   aligned to grid east / north, so an imported DEM and a future GeoTIFF export
   need no rotated resampling.
3. **Plan-view rasterisation on the GPU** (`raster/rasterize.ts`) — no camera:
   the vertex shader maps world (x, z) to grid axes and writes depth = height,
   so the depth test keeps the topmost (or, drawn from below, the lowest)
   surface and the colour holds its world Y. Supersampled up to 4×4 per cell
   (a 20 cm wall in a 2 m cell is still caught; envelopes stay closed) and
   folded per cell by a reduction pass. Three passes: terrain from above (mean),
   obstacles from below (lowest underside), obstacles from above (highest top,
   cover). With the map on, its `osm-buildings` meshes are drawn too.
4. **Ground** (`raster/build.ts`) per cell: IFC terrain where it covers half
   the cell → imported DEM → the map's relief WITHOUT its exaggeration
   (`geo.trueGroundHeightAt`) → holes filled from the nearest known cells
   (`raster/fill.ts`). With nothing at all, a plane at the project's ground
   floor (storey nearest ±0.00 − 15 cm), optionally sloped — and the panel says
   so.
5. **What stands on the ground** per cell: top within 0.75 m → it raises the
   bed (kerbs, steps, paving, low walls: overtoppable); underside within 1 m →
   obstacle (walls, slabs on grade, a podium on a slope); otherwise a canopy
   (water passes under, rain does not reach the ground). Open pockets under
   25 m² walled in by obstacles are closed (shafts, modelling gaps).
6. **Roof rain** (`raster/rain-routing.ts`) — to the nearest open ground (a
   discrete Voronoi split of each roof among the cells around it, conserving
   mass exactly), or to the sewer (lost).

**Imported DEM** (`raster/dem-import.ts`): ESRI ASCII grid and GeoTIFF read in
the browser with no dependency — classic TIFF, strips or tiles, none / LZW /
Deflate (fflate), predictors 2 and 3, 8–64-bit samples, PixelIsArea/Point,
EPSG from the GeoKeys, GDAL nodata — tested against files written by libtiff
(tifffile + imagecodecs). Only the tiles covering the grid are decoded. It is
placed through the model's IfcMapConversion; a DEM in another CRS is
reprojected (proj4, linearised over the site); without a height datum in the
file it is stood on the project's ground floor.

**Privacy**: the map's terrain is used only when the user already has the map
on (where the tile consent lives). The feature makes no network request of its
own.

### Water layer

`view/water-layer.ts`: one vertex per cell (capped at ~640 per side), lifted in
the vertex shader to bed + depth from two textures — the bed as drawn and the
solver's half-float display frame — so updating the water is one texture
upload. Depth-ramp colour, Fresnel tint and a specular glint; transparent
below the threshold (default 5 cm) with a soft shoreline; no raycast, so IFC
hover, selection and properties work through it. `view/ground-layer.ts` draws
the simulated ground only where the scene has none of its own (DEM or plane
with the map off).

### Traps found on the way (measured)

- **three r184 GLSL3 `ShaderMaterial` declares no fragment output**: `gl_FragColor`
  does not compile; declare `out vec4 outColor` (as `exposure-engine.ts` does).
- **An RG32F render target fails to draw** (INVALID_OPERATION) in the viewer's
  context; RGBA32F works and is also the format `readPixels` must accept.
- **The viewer's grid hid the water.** It is a transparent plane at y = 0 that
  writes depth; drawn before the water in the transparent pass, it occluded all
  water below y = 0. The flood system hides it while its layers are shown
  (`setGridVisible`), as the solar heatmap does.
- **Timers are throttled in a hidden tab, workers included.** A fence polled
  with `setTimeout` ran the solver at ×46 real time; in the worker a blocking
  read is fine (×2 480 on the same grid) and the loop yields through a
  `MessageChannel`.

## Timeline, probe and flow (phase 3)

- **Snapshots** (`worker/snapshots.ts`): the worker records the state — per
  cell (h, u, v, running max) as half floats, deflated — every
  `interval` simulated seconds (~200 per event, 10 s to 10 min), on exact
  instants of the solver's clock (a batch never runs past the next one). Over
  a 256 MB budget every other snapshot is dropped and the interval doubles, so
  a long event keeps its whole span. Any instant is interpolated between the
  two snapshots around it, so the timeline scrubs and replays without solving
  again. Measured: 211 snapshots of a 101 × 101 grid in 10 MB.
- **Run vs replay**: a run always computes as fast as the GPU allows, showing
  the live state; the timeline then replays from the snapshots at 1, 5 or
  20 simulated min per second, from any instant already computed. "Back to
  live" returns to the run while it is still computing.
- **Timeline** (`ui/FloodTimeline.tsx`): the storm hanging from the top (as
  hyetographs are drawn), the flooded-area curve (one reading per snapshot),
  the part not yet computed shaded, a draggable cursor, and the readings at
  the cursor — rain, flooded area, deepest water, water on the surface — or
  under the pointer while hovering; the colour scale of the current view.
- **Probe** (`setProbing` / `probe` in `system.ts`): while armed the viewer
  neither hovers nor selects (`floodPointerSuppressed`, like the map editor's
  flag); a click (≤ 5 px, ≤ 400 ms — a drag still orbits) meets the water or
  the ground by iterating the camera ray on the heightfield, drops a pin, and
  reads depth and speed at the instant on screen, the deepest so far, when the
  water arrived and peaked, the ground's absolute elevation when the model
  states its datum, and the depth at every snapshot (a sparkline).
- **Views**: depth now, maximum depth, speed (coloured where deeper than the
  threshold), and **flow lines** (`view/flow-particles.ts`): GPU particles on
  the viewer's renderer, advected through the same display-frame texture the
  water draws, respawned at random wet cells, drawn as streaks along the
  velocity (at least half a cell, at most three), brighter when faster.
- **Infiltration** (all three solvers): Horton's `f(t) = fc + (f0 − fc)·e^(−k·t)`
  from the event start, never more than the water in the cell, the absorbed
  depth kept per cell so the mass balance includes it. Presets: compacted soil
  (25 → 3 mm/h), loam (75 → 13), sandy (125 → 25), or impervious.
- **Hyetograph editor** (`ui/HyetographEditor.tsx`): draw the intensities;
  1–30 min intervals, 15 min to 6 h; total depth and peak always shown.

QA trap: after editing a module, Vite serves it as `?t=…` to the modules that
import it; importing `/src/features/flood/store.ts` from the console then gives
a second store. Read the importer's source for the real URL (or use
`globalThis.__flood`, which is the system the app created).

## Affected elements and exports (phase 4)

- **Affected elements** (`validation/affected.ts`, pure): for every door,
  window, space, ramp, stair, lift (`IfcTransportElement`) and piece of
  equipment (flow terminals, energy conversion devices, boards, pumps,
  tanks…), the highest water surface (bed + maximum depth) in a ring of open
  cells around its plan footprint (3 m) against the element's lowest point.
  A ring, not the cells under it: a door sits in a wall, and walls are
  obstacles, so the cells under it are always dry; what floods it is the water
  standing outside. An element walled in on every side (an interior door, a
  core stair) has no reading and is not reported.
  - **Water is what the view calls water** (the threshold, 5 cm by default).
    During a storm a centimetre of rain film covers everything; on a step 18 cm
    up it read as "19 cm over the entrance hall" (Poblenou A-0001) until the
    threshold applied here too.
  - **Below ground**: an element whose bottom is more than 0.5 m under the
    ground outside (a basement, a sunken access) would read "3.6 m" from 5 cm
    in the street. It is flagged, keeps the depth of the water outside, and
    sorts after what the water reaches directly.
  - Candidates come from fragments by class (`getItemsOfCategories`) with
    their world boxes (`getBoxes`), cached per study; names, storeys and
    GlobalIds only for the elements reported (≤ 1000).
- **In the validation panel**: a group, "Flood: elements reached", above the
  issue list (desktop) and above the issue cards (mobile sheet), lazy-loaded
  only once a run has been analysed (`ui/FloodValidationSlot.tsx`). A row
  selects the element and flies to it, like an issue. It never enters the
  validation result, the counts or the Health Score: a simulated storm is not
  a defect of the file. Analysed automatically when a run finishes; "Check
  now" analyses the maxima so far.
- **Exports** (`raster/dem-export.ts`, pure; `exportResult` in `system.ts`):
  maximum depth, maximum speed or arrival time as a GeoTIFF (float32, Deflate,
  ModelPixelScale + ModelTiepoint, the model's EPSG in the GeoKeys, GDAL
  nodata), an ESRI ASCII grid, or a CSV of the wet cells (cell centre in the
  CRS, ground elevation, max depth and speed, arrival and peak). North up:
  a georeferenced grid is aligned to grid north (r = −γ), so the north-west
  corner and the cell size are all the header needs. Buildings are no-data.
  Without a georeference the file uses the model's local plan metres and no
  CRS, and the panel says so. The GeoTIFF round-trips through our own reader
  (test).
- **Captures**: a 2-D overlay (`ui/capture-overlay.ts`) registered with the
  viewer's capture painters, so every capture of the water — this panel's PNG
  and video, the capture toolbar, Clip Studio — carries what the colours mean,
  the instant and the disclaimer. The video replays the whole event from the
  snapshots in 16 s and records the viewer's recording surface (MP4 where the
  browser can, else WebM).
- **Languages**: the flood namespace in all ten of the app's languages
  (`locales/*.json`, key parity enforced by `locales.test.ts`).

Measured on Poblenou A-0001 (1 m cells, 162 × 162, extreme storm, closed
edges): the entrance hall reached by 11 cm (5 cm of water outside, from 0:43);
the GeoTIFF reads back 162 × 162 in EPSG:25831 with 119 no-data cells; the
video is 15.9 s, the water visibly rising frame to frame, the legend in every
frame. On the Torre Poblenou the 16 doors are in the core, walled in, and
none is reported — correct.

QA: `globalThis.__flood.overlay()` is the capture overlay the panel set.

## The map's real relief, and the data it costs (2026-10-10)

First run on real terrain (Torre Poblenou, ICGC MET 5 m), after accepting the
map's tile consent. Three findings:

- **The relief was never used.** `groundHeightAt` only answered once the map
  had built its context layers (City / Presentation views); in the Relief
  view — the one that enables "use the map's relief" — it returned null for
  every point and the grid fell back to the plane. The geo system now reads
  the bare map's ground frame when no layers exist (cached: the flood grid
  asks once per cell) and updates only geoRoot's own matrix per call.
- **A file's stated height can be off by metres.** The tower states 12.5 m
  (IfcMapConversion.OrthogonalHeight); the ICGC's bare earth under it reads
  1.8 m lower. The map honours the file, so the tower floats; the simulation
  measures the external ground (map relief, or a DEM with a datum) under the
  footprint against the plane level (ground floor − 15 cm) and, beyond
  `GROUND_FIT_TOLERANCE_M` (0.5 m), says so with the number and stands the
  simulation's ground on the model (`GroundFit`, switch "Stand the ground on
  the model's ground floor", on by default). Its own ground is then drawn,
  since the map's relief no longer matches.
- **A slope under a building.** A bare-earth DEM runs on under the footprint;
  on the downhill side the ground-floor slab cleared it by more than the 1 m
  contact and classified as a canopy — water under the building. An underside
  within 1 m of the project's ground floor (`floorY`) is a wall too; a canopy
  3 m up is still a canopy (test).

Measured: 101 × 101 at 2 m, extreme storm. Free edges: the water runs off
downhill, 6.5 cm at most. Closed edges: it ponds against the low edge, up to
2.5 m, ~1 ha.

**Data leaving the browser.** The simulation itself sends nothing: it reads
what the map view already loaded. The map view requests, after the one-time
consent, basemap tiles (OpenFreeMap / OpenStreetMap), relief (ICGC in
Catalonia, AWS Open Data elsewhere) and surrounding buildings (OpenStreetMap
Overpass); each provider sees the area and the IP address. The flood panel
says so next to the two switches that use map data; the map panel's "Data and
permission" section names the providers and withdraws the consent (map off,
stored choice deleted, the dialog asks again), and the consent dialog itself
now mentions the IP address and that it can be withdrawn. The privacy policy
lists the providers and the withdrawal.

## Architecture

```
core/        pure TS, no DOM: grid, hyetograph, solver contract, CPU reference
             solver (float64), analytic solutions, reference cases, half floats
raster/      domain, GPU rasterisation, grid assembly, hole filling, roof runoff,
             DEM reader and writer (GeoTIFF / ASC), georeference maths
validation/  the elements the water reaches (pure)
view/        water layer, simulation ground, flow particles
ui/          FloodPanel, timeline, probe, hyetograph editor, the validation
             group and its slot, the capture overlay (strings in locales/)
system.ts    the viewer-side owner (viewer.getFlood())
gpu/         wgsl.ts + webgpu-inertial.ts · glsl.ts + webgl2-inertial.ts ·
             create.ts (WebGPU → WebGL2; CPU only by name)
worker/      flood.worker.ts owns the solver; runner.ts is the main-thread handle
lab/         dev page: parity suite, benchmark, 2-D preview
```

- **WebGPU**: five dispatches per step (`k_dt`, `k_flux`, `k_limit`, `k_scale`,
  `k_cont`) recorded in one compute pass. The step is computed on the GPU from
  the max depth, which `k_cont` reduces per workgroup first (one global atomic
  per 256 cells — a single contended address serialises). Steps past the stop
  time are no-ops, so a batch is recorded with a fixed step count and the CPU
  never waits mid-batch. Six storage buffers per pipeline (the default limit is
  eight): the static fields are a texture.
- **WebGL2**: the same step as fragment passes over float textures (ping-pong),
  the clock in a 1×1 RGBA32UI texture, the max depth by 4×4 reductions. Needs
  `EXT_color_buffer_float`. Runs on an OffscreenCanvas context of its own, and
  waits for the GPU with a polled fence, never a blocking read.
- **Not `three/webgpu`**: the viewer renders with `WebGLRenderer`
  (`OBCF.PostproductionRenderer`), and WebGPU and WebGL cannot share
  resources, so the solver keeps its own device and hands results over as
  half-float display frames (`h, u, v, h_max` — 2 MB at 500², a
  `DataTexture(RGBA, HalfFloatType)` takes them as-is). Also, `manualChunks`
  sends everything under `/three/` to the eager `vendor-three` chunk: importing
  `three/webgpu`, even lazily, would grow the initial bundle.
- **Worker**: batches sized to ~14 ms of wall time, display frames ≤ 15/s,
  stats ≤ 10/s, pacing in simulated seconds per wall second or as fast as
  possible.

## Verification

`npx vitest run src/features/flood` (CPU, float64):

| Case | Check |
|---|---|
| Lake at rest over a bumpy bed with islands and an obstacle, 30 min | `Δh = 0`, `v = 0`, mass error < 1e-12 |
| Closed basin under a triangular storm, with buildings | mass error < 1e-9, no negative depth, buildings dry |
| Free outlet | outflow accounted, mass error < 1e-9 |
| Rain on a 1 % plane (kinematic wave) | outlet discharge = rain ± 1 %, depth profile within 1 % (measured 0.4 %) |
| Stability on sheet flow at α 0.9 and 5 m cells | outlet swing < 1 % |
| Dam break, dry bed (Ritter) | reservoir untouched upstream, mass < 1e-12, positivity, front within the scheme's bounds |

`npm run test:flood-gpu` (real Chrome, headless) runs the four reference cases
on WebGPU and WebGL2 against the CPU, then a run through the worker. Result
(Chrome 154, AMD Radeon Vega iGPU of a Ryzen 5 5600H):

| Case | Steps GPU / CPU | Relative L1 vs CPU | Mass error (GPU) |
|---|---|---|---|
| Lake at rest | 4101 / 4101 | 0 | 0 |
| Closed basin with Horton infiltration | 4684 / 4684 | 4.4e-7 | ≤ 7.3e-7 |
| Dam break | 109 / 109 | 3.6e-7 | ≤ 1.6e-8 |
| Rain on plane | 1463 / 1463 | 1.7e-6 | 2.1e-6 |
| City demo 96² | 3776 / 3776 | 3.0e-6 | ≤ 2.5e-8 |

## Performance

`npm run test:flood-gpu -- --bench` — city demo (2 m cells, 90 mm/h storm),
integrated GPU (AMD Radeon Vega, Ryzen 5 5600H), Chrome 154:

| Grid | WebGPU ms/step | WebGL2 ms/step | × real time (WebGPU / WebGL2) |
|---|---|---|---|
| 250² | 0.43 | 0.45 | ~1 550 / ~1 460 |
| 500² | 1.62 | 1.64 | ~665 / ~657 |
| 1000² | 6.2 | 5.2 | ~210 / ~250 |

The target was 500² in real time on an integrated GPU: it runs ~650× faster
than real time (a 2-hour storm in ~11 s). Both backends are bound by memory
bandwidth (~30 GB/s effective at 500², near this iGPU's peak), which is why
they tie. "× real time" depends on the step, i.e. on the deepest water: at 1 m
depth and 2 m cells Δt ≈ 0.45 s instead of ~1 s, so expect roughly half the
figures above in deep floods. On Windows, Chrome picks the GPU itself:
`powerPreference: 'high-performance'` still returned the iGPU on this dual-GPU
laptop.
