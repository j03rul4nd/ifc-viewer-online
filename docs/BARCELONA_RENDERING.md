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
- `marina-boats.ts` — berth plan from pontoons, boats; row boats on park lakes.
- `landmarks.ts` — hand-modelled landmark registry, loader and layer.
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
- Landmark models exist for the Ciutadella, Parc Güell and Montjuïc only;
  elsewhere monuments keep their extruded outline.
- A mapped animal sculpture (the Cascada's griffins) is drawn with the figure
  stand-in: OSM says `artwork_type=sculpture`, not what it represents.

## Parks — the Ciutadella pass

Measured on a capture of the whole Parc de la Ciutadella (300 m half-size
around 41.388, 2.187; the benchmark fixture is the same box).

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 18 | Paths drawn as asphalt | The park's walks are `surface=compacted` / `gravel` — Barcelona's sauló | Warm sauló tone for those surfaces inside the city |
| 19 | Courts and playgrounds drawn as lawn | `leisure=pitch` / `playground` fell to the green rule | Hard pitches and playgrounds are paved areas, court-coloured by sport; they count as pedestrian ground for furniture |
| 20 | Statues, busts, play equipment, pergolas never requested | 35 mapped artworks (statues, busts, sculptures), 5 play pieces and 4 pergolas in the park | Queried (`tourism=artwork`, `historic=memorial`, `playground=*`, `amenity=shelter`); stood where surveyed, faced to the nearest path; eight new Blender assets (statue on plinth, bust on pedestal, modern sculpture, slide, springer, swing, row boat, pergola) |
| 21 | A named 1880s sculpture drawn as an abstract fin | The four griffins of the Cascada are `artwork_type=sculpture` | Named pieces are figures unless the subject, material (steel, Corten…) or a post-1950 date say modern |
| 22 | The Cascada wrapped in a six-storey block of flats | Way 135115884 (the 1888 terraces, no height) got the Eixample fabric: 19 m, balconies | A building inside a park is a pavilion: plain masonry wall in sandstone / brick / stucco, and one tall storey (9 m) when unheighted — unless it is a palace, museum or chapel of its own size (the Parlament keeps 16 m; `building=palace` now defaults to 16 m) |
| 23 | Monuments as prisms | Cascada, Hivernacle, Umbracle, Castell dels Tres Dragons, Glorieta, Mamut | `landmarks.ts`: hand-built GLBs authored on the real footprint (`scripts/blender/build-ciutadella-landmarks.py`), placed at the footprint's centroid with no rotation. Showcase only; the model replaces its outline — and the Cascada's also replaces the terraces it carries |
| 24 | Empty lake | — | Rental row boats on the estany (`water=lake`/`pond` inside a park, ≥ 3 m from shore, 1 per 700 m², at most 14); never on a basin or fountain |
| 25 | Lawns without their low railings | The park's lawns are fenced with 0.75 m hoops, the park edge with 2 m railings | Fence height by position: 0.75 m inside, 2 m within 4 m of the park boundary |

## Landmarks — Parc Güell and Montjuïc

Hand-built GLBs in `public/models/landmarks/`, registered in
`src/lib/geo/landmarks.ts`, Showcase only, each authored on its real OSM
footprint about the footprint's centroid and placed there unrotated. The
shared Blender kit is `scripts/blender/landmark_kit.py`; each group has its
script and a site file with the OSM geometry in the model's metre frame:

| Script | Models |
|---|---|
| `build-parc-guell-landmarks.py` | Sala Hipòstila + Plaça de la Natura with the serpentine bench, Escalinata del Drac, Casa del Guarda, Pavelló de Consergeria, Casa Museu Gaudí, Turó de les Tres Creus, Pòrtic de la Bugadera |
| `build-montjuic-landmarks.py` | Palau Nacional (MNAC), Font Màgica, Torres Venecianes (one model, placed twice), Pavelló Mies van der Rohe |
| `build-anella-olimpica-landmarks.py` | Estadi Olímpic (open bowl, 1929 facade, Marathon Gate, west stand canopy), Palau Sant Jordi, Torre Calatrava |
| `build-castell-montjuic-landmark.py` | Castell de Montjuïc: keep and Pati d'Armes, bastioned enceinte, moat, bridge and gate |

How a landmark is found, and why it is not just "the outline id":

- The parser stands down every outline that has `building:part`s. The Casa
  del Guarda, the Casa Museu and the MNAC outlines never reach the scene, so a
  landmark is found by ANY id it `covers` (its parts) as well as its own.
- A point monument (Tres Creus, Bugadera) is keyed on the park with
  `anchorOnly`: the park tells us it is in view and is NOT replaced.
- `leisure=stadium` and `man_made=tower` are drawn by no classifier: the
  stadium is found by its grandstand and pitch, the Calatrava tower (`inArea`)
  whenever its origin is inside the loaded 700 m box.
- Mapping corrections found on the way: the Consergeria is way 672895651 (the
  site file's 672895744 is a school building); the 30 × 14 m pool 80 m from
  the Mies pavilion is not part of it.

Hillsides: the app samples terrain at the origin only, so every
ground-touching solid runs down to a hidden skirt (−6 to −14 m). The Parc Güell
stair and Sala were levelled against the same terrain tiles the app uses, so
the last step meets the Sala floor although the two are placed independently.

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

### The road layer, sliced (2026-09-25)

The cascade yields *between* layers, so one layer is still one task. On the
Poblenou plot (City preset, 2 895 road ways, 1.17 M road vertices) the road
layer was the long one. Measured in the running app on a full rebuild:

| | Before | After |
|---|---|---|
| Road layer on the main thread | one task, 1 342–1 385 ms | 41 slices; longest 50 ms, the rest ≤ 24 ms |
| Rail layer | one task, 170–395 ms | 6 slices; longest 20 ms |

Those are wall-clock numbers from a quiet machine. With other processes
saturating the CPU every task stretches — the buildings task went from 271 ms
to 500–1 430 ms — and the road slices with it (longest 63–246 ms). Outside
the browser the longest slice measures 20–36 ms (`linear-layer.bench.ts`).

- **No single stage dominated**, so there was nothing to make fast. Profiled,
  the time is spread over every vertex (surface quads, profile lookups, the
  topology pass, the final buffer passes). The builder now pauses instead.
- **One body, two drivers** (`steps.ts`): `buildLinearLayer`'s body is a
  generator (`linearLayerSteps`, and `roadNetworkSteps` inside it) that
  `yield`s between features, ribbons, junctions and buffer chunks.
  `buildLinearLayer` runs it straight through; `buildLinearLayerSliced` runs it
  a 12 ms slice at a time (`runSliced` in `render-scheduler.ts`). A pause carries
  no value and changes no state, so the output is the same bytes either way —
  `sliced-builders.test.ts` pins that on the Port Vell survey with a pause
  after every step.
- **The whole-buffer passes are chunked too**: the rebase, the float32 casts and
  `computeVertexNormals` (run as three's own routine over runs of triangles,
  valid because the geometry is still non-indexed then). The rebase and cast
  were one 150 ms task on a cold build.
- **An O(n²) that was real, but smaller than it looked**: a ribbon corner cut at
  a profile station projects onto a segment *end*, which both indexed lookups in
  `sampleProfile` decline, so it fell through to a full scan per vertex. An exact
  ring search (`ringNearest`) answers those now, same segment as the scan. On a
  5 km way that is 19 ms → 5 ms; on Poblenou's profiles it is ~10 % of the rail
  layer. The profiler put it at 91 % — per-call profiling overhead, not cost.
- **Benchmark**: `npx vitest bench --run scripts/geo/linear-layer.bench.ts`, on a
  real Overpass extract of the Poblenou box (`scripts/geo/poblenou-roads.json.gz`).
  It reports total build time and the longest slice.
### The rest of the rebuild, sliced (2026-09-25)

The same treatment for every other builder that held the thread, plus four
exact algorithmic fixes found on the way. Each builder keeps its synchronous
name and gains a `…Sliced` twin over the same generator; the cascade awaits
the twins. Measured on the full Poblenou extract in Node, warm-to-cold ranges;
the right column is the longest single step with a pause after every step
(a cold first run can add ~40 ms to it):

| Stage | Before, one task | After, longest step |
|---|---|---|
| Barcelona fabric (`barcelonaFabricSliced`) | 125–186 ms | 6–16 ms |
| Buildings mesh (`buildBuildingsGeometrySliced`) | 63–172 ms | 5–35 ms |
| Vertical solve (`solveSceneVerticalSliced`) | 224–418 ms | 20–44 ms |
| Greenery (`buildSurfaceLayerSliced`) | 77–222 ms | 10–27 ms |
| Trees (`buildTreeLayerSliced`) | 77–398 ms | 6–14 ms |
| Signals / furniture / barriers (`…LayerSliced`) | signals 53–155 ms | 5–19 ms |

- **The blocks moved into the cascade.** They were built in the same task as
  the call that asked for them; now they are the cascade's first phase. The
  estimated count reaches `setBuildings` after `layersSettled`, and picking
  switches to the new mesh in the same task that swaps it in. `geo.settled()`
  is how a caller — a test, an SDK `done` — waits for a rebuild to land.
- **`connectedDeck` scanned every feature for every stair vertex.**
  `deckLookup` indexes the deck vertices once and visits candidates in the
  scan's order, so every tie resolves as before (a test compares the two point
  by point). The vertical solve went from 224–259 to 179–195 ms in total.
- **`ringsTouch` measured every vertex against every segment** of each nearby
  pair. Vertices and segments clearly out of reach by box are now skipped,
  with a margin far above rounding. The fabric went from 125–138 ms to
  24–26 ms warm, 161–186 to 74–82 ms cold.
- **Keep heavy loop bodies out of generators.** The building mesh's
  several-hundred-line per-building body, left inline in the generator's loop,
  ran twice as slow on a first build; as a plain function the generator calls
  per building it is faster than before slicing (52–55 vs 63–66 ms warm). The
  road layer's loops already call out to closures and showed no difference.
- **The keep-out grid built a string per cell** for tens of thousands of road
  rings; numeric keys, same buckets, same order.
- **The plain ground cover pushed into `number[]`**; it uses `GrowableArray` now
  like the roads. On Poblenou that path was mostly garbage collection.
- Every change was checked the same way: every stage's output, fingerprinted
  byte for byte on ten real extracts, identical to the code before, run
  synchronously and sliced with a pause after every step.
- **In the app**, a full Poblenou rebuild (City preset, a layer toggle) is now
  90–116 slices over 1.1–1.5 s, and the longest of them is 30–34 ms; the
  synchronous start of the rebuild is 6–11 ms. Before, the same rebuild held
  the thread for 271 ms (blocks), 124 ms (ground), 239 ms (vertical),
  1.3–1.4 s (roads), 170–395 ms (rail) and 93–155 ms (signals).
- **Still one task**: an exaggeration change re-extrudes the terrain before
  the rebuild starts, 103–135 ms measured — terrain code, not investigated
  here. Roof props, landmarks, piers, bridges and the invented scenery stay
  synchronous; all are small on this data.
