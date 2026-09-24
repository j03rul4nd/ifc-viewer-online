# Barcelona rendering — findings and fixes (2026-09-24)

How the 3D OpenStreetMap context renders Barcelona, what was measured to be
wrong, and what changed. Everything here was measured on real Overpass
captures of six study boxes (Eixample, Ciutadella, Glòries, Plaça d'Espanya,
Litoral, Nus de la Trinitat); three of them are kept as fixtures and pinned by
`src/lib/geo/barcelona-benchmark.test.ts`.

## What was wrong, measured

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | Courtyards filled solid | Inner rings of multipolygons were assembled and then ignored: 71 building relations with a courtyard/light well in the Eixample box were drawn as slabs | `OsmFeature.holes`; building walls face into the void; ground surfaces triangulate with holes |
| 2 | Eixample blocks filled solid | CartoBCN plot footprints run from the facade to the middle of the block; 530 of 675 unheighted plots got the prior's 20 m over their whole depth | `perimeter-blocks.ts`: blocks recognised from touching buildings (convex hull, fill ratio), inset by the buildable depth; plots split — front at street height, back at ground floor with a terrace/garden roof |
| 3 | One skyline for the whole city | 815 of 841 outlines in the Eixample box have no `height`; every barri came out the same height and colour | `barcelona-barris.ts` (73 barris, 10 districts, from OSM admin boundaries) → 13 urban typologies → `barcelona-fabric.ts` storey counts for guessed heights |
| 4 | Generic facades | Horizontal bands only | Procedural facade shader driven by the typology: bays, balcony doors, iron railings, persianes (closed / half-open / glass), shopfronts with roller shutters, cornice; blank party walls (mitgeres) where a building shares an edge with a neighbour |
| 5 | Mapped furniture never requested | 80 benches, 40 lamps, 25 drinking fountains, 15 bins in the Ciutadella box; 81 fences, 25 walls, 10 hedges | Query groups for furniture nodes and barrier ways; `street-furniture.ts` places and orients them; Barcelona-pattern assets (banc romàntic, fanal, font, papelera) |
| 6 | Benches facing nowhere | 2 of 80 benches carry `direction` | Face the nearest path; surveyed-on-the-line → moved to its edge; never on a carriageway |
| 7 | Traffic signals in the middle of the road, random yaw | The node sits on the carriageway (stop line); 63 of 114 state `traffic_signals:direction` | Mast at the right kerb of the controlled direction, facing the traffic; a second mast on wide one-way streets; pedestrian heads at both kerbs of signalised crossings (`crossing=traffic_signals`, 251 nodes in the Eixample box); pushed off any other carriageway. Measured: 0 masts inside a carriageway (was 24/19/24/61 in four boxes) |
| 8 | Roundabout island paved over mapped greenery | The island was drawn at road height over whatever was mapped inside | Skipped where a mapped green / water / square covers its centre |
| 9 | Flyover decks sagging onto the street they cross | Short deck pieces beside junctions; Ronda de Dalt (layer 2) 2.7 m over a climbing slip road | Crossing clearance floors per station, re-derived from solved profiles; junctions held up by the deck that needs it. 16 → 0 violating bridge crossings in the four boxes |
| 10 | Approach ramps floating | A ground-tagged footway lifted 3.8 m to meet a footbridge was a ribbon with a black underside | Ramp walls down to the terrain |
| 11 | Tree rows missing | `natural=tree_row` ways (32 in the Eixample box) | Expanded into trees every 7 m |
| 12 | Surface car parks missing | 7 in Port Vell | Paved areas (`parking=surface` only) |
| 13 | Empty marinas | No `mooring`/`berth` in the data | Pontoon names carry the berth plan ("Nr 40-67" = 28 berths); boats moored stern-to (scenery switch, showcase). Port Vell box: 138 boats (72 motor, 66 sail) |
| 14 | Props floating | The GLB node keeps the first part's position; the loader baked it back: lamp base +3.50 m, signal +1.67 m, cars +0.52 m | Re-grounded at load; legacy bench turned to the kit's +X convention |
| 15 | Building mesh leaking | One layer slot per kind; roof props overwrote the buildings, so every rebuild left another copy and unticking Buildings left them standing | A list of objects per layer kind |
| 16 | Showcase facades unlit | Only `detailed` used the lit facade material | Lit at every level but `simple` |
| 17 | Showcase without its models after a reload | A persisted Showcase preference is applied before map mode is enabled; the asset download finished with no `geoRoot` and was thrown away, never retried — procedural trees and cars, no boats | The kit is kept whenever it lands, and requested again by any showcase rebuild that finds it missing |

## Where things live

- `perimeter-blocks.ts` — pure block recognition and plot splitting.
- `barcelona-barris.ts` / `.data.ts` — barri lookup and typology profiles (regenerate with `node scripts/geo/build-barcelona-barris.mjs <raw.json>`).
- `barcelona-fabric.ts` — applies the typology: heights for guesses, perimeter split, facade parameters.
- `street-furniture.ts` — mapped furniture, barriers, signal placement (pure planners + builders).
- `marina-boats.ts` — berth plan from pontoons, boats.
- `facade-shader.ts` — the procedural facade (attributes `aFacA/B/C` from building-mesh).
- `shader-glsl.test.ts` — guards injected GLSL against reserved words: the first facade shader named a parameter `half` and every building vanished while still casting its shadow.

## Verifying in the app without Overpass

Overpass was returning 504 on every mirror during this work. The captures in
the scratchpad were served to the app from a local caching proxy (pointing
`OVERPASS_ENDPOINT` at it temporarily), and pixels were taken with a private
`WebGLRenderer` on the app's own scene (see the showcase-props memory note).

## Still open

- Stacked metro/rail tunnels (layer −2 over −3) can be closer than a bore's
  clearance near portals — underground, not visible.
- A pedestrian passage under a rail approach ramp (Trinitat) conflicts with the
  ramp — a data gap (the ramp is untagged as a cutting).
- The àtic setback of Eixample buildings is not modelled (only the palette and
  storey rhythm). Chamfer facades use the same rhythm as the street facades.
- Parks: playgrounds and pitches are drawn as green; no play equipment.

## Loading without freezing the page (performance pass)

Measured on the Glòries capture (the densest box), main-thread build of every
layer at "Detailed":

| | Before | After |
|---|---|---|
| Whole rebuild, one blocking task | ~6.2 s | ~1.5 s, split in phases |
| Road layer | 3.66 s, 1 379 001 vertices | ~0.3 s, 278 325 vertices |
| Longest task in the browser (Chromium, long-task observer) | the whole rebuild | 263 ms |

- **Allocation, not maths, was the cost.** Profiled: GC 843 ms + the final
  `number[]` → `Float32Array` copy 648 ms of a 1.4 s road build.
  `growable-array.ts` writes straight into doubling typed arrays (Float64 for
  positions, which are rebased before the float32 cast).
- **Edge-marked crossings were 81 % of the road layer.** The line width was in
  metres where the rest is normalized: 40 million times too wide, thousands of
  km off the map, then subdivided to its cap.
- **Cascade** (`render-scheduler.ts`): blocks are drawn in the first task; the
  vertical solve, ground, roads, rail, furniture, bridges, trees and scenery
  follow a phase at a time, handing the main thread back between phases with
  `scheduler.yield()` (fallbacks: `scheduler.postTask`, MessageChannel,
  `setTimeout`). Each layer is double-buffered — the old one stays until its
  replacement exists — and a newer rebuild cancels an older one mid-way.
- **Shaders** are compiled with `renderer.compileAsync` (`KHR_parallel_shader_compile`)
  before a layer joins the scene, so no first frame freezes on a compile.
- **Device budget**: `deviceMemory`, `hardwareConcurrency`, `saveData` /
  `effectiveType` and a software-rasteriser check (SwiftShader, llvmpipe) set
  the download concurrency and drop invented scenery on weak devices.
- **Assets on demand**: showcase asks only for what the scene can draw
  (`neededPropAssets`), data before scenery, a few downloads at a time; a later
  scene adds a batch instead of re-downloading the kit.
