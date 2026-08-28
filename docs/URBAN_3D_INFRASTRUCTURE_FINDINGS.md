# 3D urban infrastructure — findings and architecture

Phase-1 analysis for making the map-mode generator reason about **three-dimensional**
urban infrastructure: roads that climb onto bridges, dive into tunnels, cross each other
at different levels, and run over water on quays. Benchmark site: Barcelona's Port Vell /
W Hotel waterfront. Requirement: identical behaviour with SRTM terrain ON and OFF.

**Diagnosis only.** Nothing described here is a change already made. Baseline verified
before writing: `npx vitest run src/lib/geo` → **819 tests / 28 files green**.

Cost convention, inherited from `GIS_RENDER_QUALITY_FINDINGS.md`: **cheap** = < ~1 day,
local, no new API. **medium** = crosses modules or adds a field that crosses the worker.
**expensive** = new design + UI + persistence.

---

## 0. The headline, before the detail

Two measurements invert the priorities the task assumed.

**(a) At this site it is not a bridge problem — it is a quay problem.** Of 17 252 ways in
the benchmark box there are **21 bridge elements, 16 of them footbridges**, and *not one*
tags `width`, `height`, `min_height` or `incline`. Against that: **36 piers, 4 quays,
2 breakwaters, 2 drydocks, 10 coastline ways, 1 `landuse=harbour`, 9 `seamark:*`** — and
`buildFeaturesQuery` (`osm-features.ts:1017-1044`) **asks for none of them**. The open
Port Vell basin and the Mediterranean are not water polygons at all; they are the implicit
seaward side of `natural=coastline`. So today the generator draws **no sea, no quay edge
and no pier**, and hangs the roads and buildings of the Barceloneta over nothing.

**(b) The DEM is a surface model, and it is noisy over water.** Sampled directly from the
terrarium z15 tiles the app itself uses:

| Point | DEM reads | Reality |
|---|---:|---|
| Via Laietana, Gothic Quarter | **29.8 m** | street ~10 m — this is rooftops |
| Moll de Barcelona quay | **8.5 m** | flat reclaimed port land, ~2–3 m |
| **Port Vell open basin** | **4.7 m** | **water — should be 0** |
| Barceloneta / Sant Sebastià beach | −0.1 m | ~0 m, correct |
| **W Hotel (99 m)** | **0.0 m** | building absent from the DEM entirely |

So with SRTM ON the "terrain" is partly buildings and partly moored vessels, with
artificial cliffs at block edges; and because a water polygon takes the **minimum DEM
under its own ring** (`osm-scene.ts:257`), a harbour surface is placed by bathymetric and
vessel noise rather than by a datum. Any validation of "roads follow the relief" is
meaningless until this is addressed.

---

## 1–9. The ten questions of the brief, answered

### 1. What data do we have?

One Overpass query per site (`osm-features.ts:1044`), 7 groups with per-group quotas
(0.55 highway+railway, 0.05 bridges, 0.45 buildings, 0.30 ground cover, 0.02 platforms,
0.35 trees, 0.05 signals of `maxElements = 6000`). `out geom` with default verbosity, so
**full tags do arrive**. Nothing is excluded server-side on tunnel or layer grounds.

Measured in the benchmark box: 3 867 highways · 226 `tunnel=*` ways (**114 of them
`building_passage`**, 95 without a layer) · 186 ways with `layer` (**1.1 %**, six distinct
values −4, −3, −2, −1, +1, +3) · `cutting` used **zero** times · 83 `incline`, all `up`/`down`
on steps · 55 of the 129 tagged ways in the W Hotel micro-box carry **`building:part`**
with `building:levels`.

### 2. What attributes do we use? — 3. What are we ignoring?

The parser is a tag-to-enum compiler and **drops every raw tag at the worker boundary**.
The only vertical quantity that survives into the scene is `height.heightM` /
`height.minHeightM` (`buildings.ts:58`), and `minHeightM` is consumed only by
`building-mesh.ts:224`.

Read nowhere in `src/`, verified by grep: **`layer`, `level`, `ele`, `incline`, `covered`,
`embankment`, `cutting`, `surface`, `seamark:*`, `building:part`**. `layer` is *deliberately*
ignored, with sound reasoning at `osm-features.ts:529` — but that reasoning answers
"is this below the surface?", not "what level is this on?", and it is the tag the Ronda
Litoral's 11 open-trench ways depend on.

Never even requested: `man_made=pier|quay|breakwater|groyne`, `waterway=dock`,
`natural=coastline|beach`, `landuse=harbour|port`, `amenity=ferry_terminal`, `building:part`.

### 4. How does SRTM terrain work today?

`ground-frame.ts` is the documented single owner of the vertical axis and it is a good
piece of work. It exposes exactly one height field, `groundZ(nx,ny)`, plus `zAbove`
(object heights, never exaggerated) and `zAtElevationM` (absolute, exaggerated). With SRTM
OFF the sampler is null and `groundZ` collapses to a constant 0, so **both terrain modes
run the identical code path** — a per-vertex z-profile injected above the ground would
behave identically in both. That is the single most useful architectural fact in this
document.

### 5. How do we compute heights?

**There is no vertical stage.** Every geometry builder constructs its own frame and
computes z inline (`osm-scene.ts:236, :432, :626, :797, :1677, :1747`;
`building-mesh.ts:141`; `props-scene.ts:26`). `ground-frame.ts` is a shared *formula*, not
a *stage*. Because it exposes a single-valued height field with no notion of level, **a
road and the bridge over it are the same z by construction.**

### 6. How do we represent roads?

`road-network.ts` is a real node/edge graph with a junction solver — and it is **strictly
2D**: `NetworkWay.points`, `RoadRibbon.centre` and `RoadJunctionSurface.polygon` are all
`Vector2`, and the 866-line module contains no reference to z, height, elevation or ground.
Z is applied afterwards, per vertex, in three closures inside `buildLinearLayer`
(`osm-scene.ts:817, :852, :871`) as `frame.groundZ(v.x,v.y) + lift`.

Two properties make the fix tractable:

* `halfWidths` is already a **per-vertex scalar profile** parallel to `centre`, and
  `taperHalfWidths` (`road-network.ts:381`) is already a smoothstep blend toward a target
  over a distance. A `heightsM: number[]` profile is the same shape, and the ramp
  generator already exists in spirit.
* `buildRoadNetwork` is already invoked **per road class** (`osm-scene.ts:1014`), so
  disjoint graphs are an established pattern — partitioning by *level* is the same move.

### 7. How do we identify bridges?

`classifyFeature` promotes any `bridge=*` way carrying `highway`/`railway` to
`kind='bridge'` (`osm-features.ts:573`). That **removes it from the road graph**, because
only `kind==='road'` enters `networkWays` (`osm-scene.ts:959`). `buildBridgeLayer` then
stamps a bare slab: one **constant** z for the whole span, no piers, no abutments, no
parapets, no ramps, no continuity of any kind with the carriageway that feeds it.

### 8. How do we identify tunnels?

We do not. `isBelowSurface` deletes them at parse time (`osm-features.ts:797`), *before*
the session cache, so no layer toggle can ever bring them back. There is no `'tunnel'`
FeatureKind, no portal, no trench. The rule also deletes the 114 `building_passage` ways —
arcades and gateways that **are** the ground-floor street and should be drawn.

### 9. Where do conflicts appear? — the verified defect list

Every item below was confirmed at the cited line. Ordered by severity.

| # | Defect | Anchor | Cost |
|---|---|---|---|
| D1 | **Bridge clearance is vertically exaggerated.** The clearance is folded into the *elevation* argument of `zAtElevationM`, which multiplies by ×k — so at the ×3 slider a deck floats **18 m**, while `DECK_THICKNESS_M` on the next line stays 1.2 m. This is the exact rule `ground-frame.ts:21-27` was written to enforce, broken in the one builder doing 3D. **No test covers it** (the only bridge height test runs at k=1 and asserts only "above ground"). | `osm-scene.ts:657` | cheap |
| D2 | **The micro-relief slider moves the ground without rebuilding anything.** `setTerrainLook({detail})` is the only terrain mutator that does not call `rebuildLayers`; `applyHeights` rewrites the `effective` array that `sampleGroundM` reads. Up to ~2.4 m × k of silent detachment of every building, road, tree and water level. User-facing at `GeoPanel.tsx:1092`. | `geo-system.ts:627` | cheap |
| D3 | **Standard OSM tagging draws every bridge twice.** A `man_made=bridge` area *and* the `bridge=yes` way it carries both classify as `kind='bridge'`; each computes its own `groundRangeM().maxM` over a different point set, giving two decks that z-fight. | `osm-scene.ts:660` | cheap |
| D4 | **Bridge ground is sampled at raw OSM vertices only** — never densified — so a hill between two distant vertices is invisible and the deck passes through it. The fix exists 380 lines below in the same file (`frame.subdivisionsFor`). | `osm-scene.ts:657` | cheap |
| D5 | **Removing bridges from `networkWays` severs the graph.** A crossroads with one short bridge arm is solved as a 3-arm node — wrong junction polygon and wrong trims on the *surviving* arms. | `osm-scene.ts:959` | medium |
| D6 | **Clearance comes from the building height ladder.** OSM `height` on a bridge is the structure's height, not its clearance. | `osm-features.ts:800` | cheap |
| D7 | **Simple-quality decks are see-through from below** — no bottom cap, and `MeshBasicMaterial` defaults to `FrontSide`. | `osm-scene.ts:711` | cheap |
| D8 | **Props are buried in the road.** Cars, lamps and bollards sit at bare `groundZ` while the carriageway sits at `groundZ + 0.25 m` (rail 0.40 m). `props-scene.ts` is a third, independent road consumer that never touches `RoadNetwork`. | `props-scene.ts:418` | cheap |
| D9 | **Road markings are not DEM-densified** while the carriageway is — on a hill the asphalt curves and the paint is a straight chord. | `osm-scene.ts:1052` | cheap |
| D10 | `addLayer('building', …)` is called twice in showcase; the Map key collision **orphans the first mesh, unparented from disposal forever** (leak plus double draw). | `geo-system.ts:941` | cheap |
| D11 | Scenery `propObjects` are never disposed by `teardownBuildings()` / `disable()`. | `geo-system.ts` | cheap |
| D12 | `centroid()` uses the un-shifted shoelace form that `building-mesh.ts:400` exists to warn against. | `roof-props.ts:88` | cheap |
| D13 | **`min_height` is cancelled.** The wall base is `groundZ + (minHeightM − SKIRT_M)` with `SKIRT_M = 6`, so every real-world `min_height` under 6 m still reaches the ground. | `building-mesh.ts:224` | cheap |
| D14 | `DEFAULT_POLICY.tunnel` deletes the *surface* street above a tunnel model — a purely 2D plan test, made worse because the underground ways it meant to replace were already dropped at ingestion. | `context-suppression.ts:79` | medium |
| D15 | `truncated` is reported against 6000 while the per-group caps sum to 10 620. | `geo-buildings.worker.ts:94` | cheap |

### The Hotel Vela question

The building path is a **strict single-ring vertical prism**: one ring, two z values, the
same planar points top and bottom (`building-mesh.ts:326-361`). No second ring, no
per-height cross-section, no taper, lean or setback. The sail's curved *plan* would
survive — rings are never simplified — but its leaning, curving *section* is precisely the
degree of freedom the extruder does not have. From `height=99` it produces a 99 m prism,
and since `building=hotel` is unmapped in `buildingUse` it is painted
`mediterranean:generic` — a whitewash-and-terracotta render block where a glass sail stands.

**It is not reproducible procedurally, and the authored route already solves it.**
`bonsai_kit.extruded()` takes an arbitrary closed profile *per element*, and
`build-tower.py:169-192` already varies the footprint per storey. A 26-storey stack of
per-storey profiles is a mechanism that exists today and is under golden test.

---

## 10. Proposed architecture

### 10.1 The vertical model

Generalise the frame from **one datum** to **a datum plus a true-metres offset**, keeping
the existing doctrine exactly: *ground is exaggerated, object height never is.*

```
z(x, y) = datumZ(x, y) + offsetM × mToN
```

with three reference surfaces — `ground` (`frame.groundZ`), `sea`
(`frame.zAtElevationM(0)`; `elevation.ts:9` already documents the datum as approximately
orthometric, so terrarium 0 m *is* approximately MSL), and `deck` (a resolved structure
level).

Rejected: the brief's additive `terrain + layer + structure + explicit` formula. `layer` is
an **ordering**, not an elevation — 186 ways, six values. Two ways at layer +1 and +2 that
cross must be separated; a lone layer=+1 way over nothing needs no lift at all. Adding a
fixed per-layer offset would lift thousands of metres of perfectly ordinary street.

### 10.2 A vertical stage, between classification and geometry

New pure module `src/lib/geo/vertical.ts`. Geometry builders stop computing z from tags;
they consume a resolved profile.

```
tags → situation → level constraints → graph solve → per-vertex profile → geometry
```

1. **Situation** per way, from the full tag set: `surface | bridge | tunnel | covered |
   trench | floating`. `covered=yes` and `building_passage` resolve to **surface** — that
   alone restores 114 wrongly-deleted ways. `layer<0` without `tunnel` resolves to
   **trench**, which is what the Ronda Litoral's open sections actually are.
2. **Target offset** for a non-surface run, in true metres, best source first:
   explicit tag → **what it actually crosses** (a real segment-segment crossing test
   against lower-layer ways, with clearance from a table: over water or rail 5.5 m, road 5.0 m,
   footway 3.0 m) → `layer × separation` as an ordering fallback → a documented default.
   This is also the answer to §8 of the brief: today the graph has **no** segment-segment
   test, and OSM's own convention (ways at different layers share no node) already gives
   correct grade-separated connectivity — nothing needs inventing, only clearance.
3. **Graph solve for continuity.** Node offset = the largest-magnitude offset among its
   incident ways; a bridge endpoint meeting only surface ways sits at the abutment. Then a
   **max-gradient pass** (≈6–8 %) distributes the climb along the run, which is what
   generates the ramps the brief asks for, bounded by a physical constraint rather than a
   magic distance.
4. **Per-vertex profile** `heightsM: number[]`, parallel to `centre`, carried on
   `NetworkWay` and threaded through the ribbon solver — the same shape as the existing
   `halfWidths`.

Because the offset is added in true metres *above a datum*, the vertical relationships
survive SRTM OFF unchanged: with a null sampler `groundZ` is 0 and an overpass still sits
5 m above the road it crosses. That is requirement §5 satisfied by construction rather
than by a second code path.

### 10.3 Consequences for each layer

* **Roads** keep bridge and trench ways *inside* the graph (fixes D5), partitioned by
  level so a flyover and the street under it are never welded.
* **Bridges** become a structure derived from the road ribbon they carry — deck, parapets,
  piers dropped to the ground below — instead of an independent slab (fixes D1, D3, D4, D7).
* **Tunnels** render as trench plus portal at the ends and a hidden core, so the eye reads
  "it goes under" without geometry fighting the terrain.
* **Quays, piers, breakwaters** reuse the mechanism that already exists and is already
  correct: the railway platform at `osm-scene.ts:921` is a triangulated polygon lifted a
  constant unexaggerated height above its datum with an edge band. Change the datum to
  `sea` and it is a quay.
* **Sea** is assembled from `natural=coastline` chains clipped to the bbox — the standard
  algorithm, and the only way to get the Mediterranean, which is nobody's polygon.
* **Terrain** gains an optional **bare-earth correction**: a grey morphological opening
  (erode then dilate) at roughly building width over the height grid, which is the standard
  way to turn a DSM into an approximate DTM. Cheap, purely local to the already-fetched
  tiles, and it is what makes "roads follow the relief" true rather than "roads follow the
  rooftops". Water polygons additionally clamp to the sea datum instead of the DEM minimum.

### 10.4 What is deliberately NOT changed

`ground-frame.ts`'s doctrine, the purity of the geometry modules, the one-query Overpass
budget, the per-class road solver, and the `FeatureKind` vocabulary as an external contract
(the shipped SDK has no site/map command, so `cmd.layers` has no external caller today —
but the `?map=` tokens, the 13 `ifc-geo-*` localStorage keys, the `layers.osm.<kind>` i18n
keys across 10 locales and the `map-feature-picked` embed event all do).
