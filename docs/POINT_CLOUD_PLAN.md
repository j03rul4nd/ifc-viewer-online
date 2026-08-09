# Point Cloud Integration — Design & Decisions

Status: **implemented** (first release). Companion user/API doc: `docs/POINT_CLOUD.md`.
Normative for anything that touches `src/lib/pointcloud/*`.

This document records the audit, the alternatives that were compared, and the
decisions taken — so the next person does not re-litigate them.

---

## 1. Repository audit (what already exists)

| Concern | Where it lives | Verdict for point clouds |
|---|---|---|
| Scene / renderer | `src/lib/viewer.ts` → `OBC.Components` + `OBC.SimpleScene` + `OBCF.PostproductionRenderer` (Three.js r184) | **Reuse.** One scene, one renderer, one camera. |
| Camera | `OBC.OrthoPerspectiveCamera` (camera-controls), persp/ortho swap via `world.camera.projection.onChanged` | **Reuse.** No second camera. |
| IFC load | `ifc-parser.worker.ts` (web-ifc WASM) → fragments → `viewer.loadFragments()`; per-model pivot `Object3D` | **Do not touch.** Point clouds are a sibling, not a modification. |
| Model transforms | `viewer.setModelTransform()` writes to a per-model pivot; `sceneStore.models[].transform` mirrors it | **Reuse the pattern**, not the objects. |
| Coordinates | Scene = **Y-up metres**. Project → scene is `x=x, y=z, z=-y` (see `geo-math.ts` header, `placement.ts`) | **Normative.** Point clouds land in the same frame. |
| Georeferencing | `geo-extract.worker.ts` (IfcMapConversion / ePSet / IfcSite ladder) → `GeorefExtraction`; `crs.ts` (proj4, EPSG registry); `placement.ts`; `geo-math.ts` | **Reuse wholesale.** This is the alignment backbone. |
| Units | web-ifc/fragments normalise IFC geometry to metres before the viewer sees it | Point-cloud units must be normalised to metres by us. |
| Lazy subsystems | `viewer.getGeo()` / `viewer.getSolar()` → `createGeoSystem` / `createSolarSystem`, dynamic `import()`, own GPU resources, snapshot/restore discipline | **Copy this pattern exactly.** |
| Stores | 21 Zustand stores, serialisable-only, `devtools`, `epoch` cancellation token (geoStore) | **Copy.** No Three objects in the store. |
| Workers | fresh worker per run, UUID correlation, copy-before-transfer, watchdog timeout (`geo-extract-runner.ts`, `ids-runner.ts`) | **Copy.** |
| GPU accounting | `viewer.getGpuEstimateBytes()`, `memory-tracker.ts` | **Extend**, don't replace. |
| Panels | `uiStore` / feature store `panelOpen` + `React.lazy` in `App.tsx` + `Toolbar` menu item, flag-gated by `isGisEnabled()` / `isSolarEnabled()` | **Copy.** |
| i18n | 10 locales, namespace per feature, `_status` marker on machine-seeded locales | **Copy.** |

**Nothing in the repo already renders points.** There is no octree, no BVH, no LOD
system, no point material, and no non-IFC geometry loader. So the feature is
additive; the only shared surfaces touched are `viewer.ts` (one lazy hook),
`Toolbar.tsx` (one menu item) and `App.tsx` (one lazy panel) — the exact three
seams `getGeo()` / Map mode already uses.

---

## 2. Format decision

### Compared

| Format | Parse cost in TS | Georef | Streaming | Dependency | Verdict |
|---|---|---|---|---|---|
| **LAS** 1.0–1.4 | Trivial — fixed-width records at a known offset, bbox + scale/offset in the header | **Yes** (`LASF_Projection` VLR: GeoTIFF key 3072 or OGC WKT) | Excellent — random access by record index | **none** | **Ship** |
| **PLY** (bin LE/BE + ascii) | Easy — ASCII header, then fixed-width records | No | Good (binary), OK (ascii) | **none** | **Ship** |
| **XYZ / PTS / CSV** | Easy but slow (text) | No | Good (line stream) | **none** | **Ship** |
| **LAZ** | Hard — LASzip arithmetic coding | Yes (same VLRs) | Chunked (50 k) | `laz-perf` WASM ≈ 300 kB | **Shipped** (see §2b) |
| **E57** | Very hard — XML + `CompressedVector` bit-packing | Yes | Poor without full impl | large | **Defer** |
| **COPC** | = LAZ + octree in one file; ideal for huge clouds | Yes | Excellent (range reads) | `laz-perf` | **Shipped** (see §2c) |
| **Potree / 3D Tiles pnts** | Best streaming, but needs a **server-side conversion step** (PotreeConverter/untwine) and a host to stream from | Yes | Excellent | converter + hosting | **Rejected for v1** |

### Decision

> **Ship LAS + PLY + XYZ/PTS/CSV, parsed by our own TypeScript readers in a
> Web Worker, with zero new runtime dependencies. Defer LAZ/COPC/E57 behind a
> loader registry (`pc-format.ts`) so each is a single file to add.**

Rationale, in order of weight:

1. **The product promise is "nothing leaves your browser."** Potree/3D-Tiles
   streaming requires a conversion pipeline and a server to stream tiles from.
   Adopting it would either break the privacy promise or force the user through
   an offline CLI before they can look at their own scan. Option B of the brief
   (convert-then-stream) is therefore *architecturally* right for 500 M-point
   city scans and *product-wise* wrong for this viewer today.
2. **LAS is what BIM/architecture actually receives.** Registered scans exported
   from Faro/Leica/Trimble/Recap land as LAS/LAZ or E57; photogrammetry and
   reconstruction pipelines (including LingBot-Map-style ones) emit PLY; survey
   crews still hand over XYZ. Those three cover the realistic inbox.
3. **LAS carries the CRS.** It is the only common format that lets us do the
   alignment *correctly* instead of asking the user to nudge sliders.
4. **Zero dependencies.** The brief explicitly forbids heavy deps "if not
   necessary". A LAS point record is `getInt32 ×3 + scale + offset`; writing it
   costs ~200 lines and removes a supply-chain surface.
5. **LAZ is the one real gap**, and it is one file (`laz-reader.ts` registering
   into `pc-format.ts`) plus `laz-perf`. Recorded as the next step, with the
   registry already shaped for it.

**Practical ceiling of v1:** ~30–60 M points on a desktop browser, bounded by the
point budget (§5) and the hard `maxPoints` cap, not by parse speed. Beyond that,
COPC is the answer, not a bigger buffer.

### 2b. LAZ: the deferral, reversed

Shipped after the first release, on an explicit call from the product owner. The
original reasoning ("zero dependencies") was sound as a default and wrong as a
permanent answer: most public and delivered LiDAR is `.laz`, so deferring it meant
telling users to convert their own data before they could look at it.

What kept the cost contained:

* `laz-perf` is imported **dynamically inside the reader**, so the WASM is fetched
  only when a `.laz` is actually opened. Users who never open one pay nothing.
* A LAZ header, its VLRs and its decompressed records are all ordinary LAS, so the
  reader reuses `las-reader`'s header, CRS and record decoding verbatim. That
  refactor (extracting `RecordLayout` / `decodeRecord` / `sampleRecordRanges`) is
  why the PDRF quirks still have exactly one implementation.
* Correctness is pinned to ground truth, not to a fixture: the Autzen survey
  exists as both `.las` and `.laz`, and the two readers produce **bit-identical**
  output (`maxCoordDelta: 0`, zero attribute mismatches over 3 000 points).

**The trap worth remembering — a growing WASM heap detaches your views.**
`laz-perf` allocates while it decompresses, and an emscripten heap that grows
*replaces* its `ArrayBuffer`; every existing `DataView` / `TypedArray` onto it is
detached mid-loop. The first implementation held one `DataView` over the decode
target across `getPoint()` calls and died with "Cannot perform
DataView.prototype.getInt32 on a detached or out-of-bounds ArrayBuffer" — but only
inside the real Web Worker, on a real file, after `open()` had already succeeded
(the sampling path happened to copy bytes out, so it was immune). Every record is
now copied into a JS-owned block buffer before decoding, reading `Module.HEAPU8`
fresh each time. *Lesson: never hold a view into WASM memory across a call that
can allocate.*

### 2c. COPC: the ceiling, removed

Shipped straight after LAZ, and it cost almost nothing extra — `laz-perf` already
exposes a `ChunkDecoder`, and a COPC octree node *is* a LASzip chunk. The reader
range-reads nodes out of the `File` instead of holding it in memory, so the plain
LAZ size cap simply does not apply to a converted cloud.

**The claim I had to fix before writing it down.** The first implementation walked
nodes coarsest-first and stopped at the budget, and I described that as "you get
the whole site, thinned". Measuring it said otherwise: on the COPC reference file
(only two levels) an 8 k budget covered **58% of the site — identical to plain
LAZ** — because the budget ran out *inside* the root node, and taking a node's
first N points is a corner of its cube, not a sample of it. Striding the
straddling node instead of truncating it made the property actually true: 100% x
100% coverage at the same budget, for one multiply per point.

Worth keeping as a habit: the claim was plausible, the mechanism was real, and it
was still wrong until measured against the thing it described.

### 2d. View-dependent loading: policy first, wiring next

Built as a pure module (`pc-octree.ts`, 21 tests) ahead of the plumbing, on
purpose. Node selection is the only part of streaming that involves judgement —
how much error is too much, what to do when the budget bites, what happens at the
frustum edge — and it is much easier to be confident of as a function from
(index, camera, budget) to a set than as emergent behaviour of a render loop.

The two rules worth remembering:

* **Screen-space spacing, measured to the cube.** Distance to a node's *centre*
  makes a large node the camera is standing inside look far away, which is
  exactly backwards.
* **Parent before child, by construction.** COPC nodes carry a slice of their
  cube's points, not the whole. Admitting a child alone punches a hole in the
  coarse layer. Making children eligible only after the parent is admitted makes
  that unrepresentable rather than merely tested for.

Now wired: a persistent worker session (`stream-open` / `stream-nodes` /
`stream-close`) holds the index and the File, and the LOD pass turns a selection
into loads and evictions. The one-shot `parse` path is untouched — every other
format has no index to stream from, and a working loader was not worth rewriting
to share a code path with one that is shaped differently.

**A weakness the headless check exposed.** The first version kicked off node
selection from the rAF loop, and the cloud came up with zero points in a hidden
pane — because `requestAnimationFrame` does not fire there at all. The same is
true of a background tab or a low-power mode. Fixed by running the first
selection immediately on `enableStreaming`. Worth generalising: any subsystem
whose *initial* state depends on an animation frame has a class of environments
where it never initialises, and "it works when I look at it" is precisely the
symptom that hides it.

---

## 3. Alignment — the core problem

`pointCloud.position = ifc.position` is rejected. The transform is derived from
whatever provenance the two files actually carry, through an explicit ladder that
mirrors the existing IFC georeferencing ladder in `georef-ladder.ts`.

### 3.1 Frames

```
point-cloud source frame          IFC project frame            scene frame
(source units, source axes,   →   (metres, Z-up, project   →   (metres, Y-up:
 optionally a projected CRS)       origin at file origin)       x=x, y=z, z=-y)
```

The scene frame is **already defined** by the repo (`geo-math.ts` header) and is
not up for renegotiation. The IFC model is never moved — the same INV-2 rule Map
mode obeys ("the map aligns to the model, never the reverse") now also governs
point clouds. The cloud is transformed *into* the IFC frame.

### 3.2 The ladder (`pc-align.ts`)

| Rung | Preconditions | Math | Confidence |
|---|---|---|---|
| **1 `map-conversion`** | Cloud has an EPSG (LAS VLR) **and** IFC has `IfcMapConversion` (rung 1/2) | Grid→grid via proj4 if the codes differ, then invert the MapConversion: `p_proj = R(−γ)·(E,N − E₀,N₀)/s`, `z = h − refElevation` | `exact` |
| **2 `shared-crs`** | Cloud EPSG == IFC EPSG but the IFC has no full MapConversion | Same, with the survey origin taken as (0,0) and the offset absorbed as a translation | `high` |
| **3 `geographic`** | Cloud has an EPSG, IFC has only `IfcSite` lat/lon | Cloud grid → WGS84 → local ENU metres about the IFC anchor, rotated by the IFC's true north | `approximate` |
| **4 `local`** | Neither is georeferenced, but the two bounding boxes plausibly coincide (centroid distance ≤ 3× the IFC diagonal, extents within 100×) | Unit + axis conversion only | `high` |
| **5 `manual`** | Nothing above holds | Cloud bbox centre → IFC bbox centre, cloud ground → IFC ground; user nudges from there | `manual` |

Every rung records `reasons[]` (i18n keys) so the UI can state *why* it chose
what it chose. A wrong-but-silent alignment is the failure mode to avoid: rungs
3 and 5 are surfaced as explicit badges, never as a silent success.

### 3.3 Representation

A single serialisable `PointCloudAlignment` (see `pc-types.ts`) holds
`{ rung, origin (scene metres, double), yawRad, scale, upAxis, confidence,
reasons, and the user's manual delta }`. It lives in `pointCloudStore` (state)
and is applied by `point-cloud-system.ts` to **one root `Group`** — never
per-chunk, never per-point.

### 3.4 Precision

Survey coordinates are ~5 × 10⁵ / 4.5 × 10⁶ m. Float32 there gives ~0.5 m of
error — visible garbage. Handled with a two-level origin shift, the same trick
the basemap uses:

* `cloudOrigin` — the source bbox centre, kept in **float64**, never uploaded.
* Chunk objects carry `chunkOrigin − cloudOrigin` (small, float32-safe).
* Vertex positions are `point − chunkOrigin` (≤ ~50 m, sub-micrometre in f32).
* The root `Group` carries `A·cloudOrigin` computed in float64.

---

## 4. Chunking, LOD, streaming

**No octree.** A full hierarchical octree with per-node LOD is what Potree needs
because it streams from disk over HTTP. We already hold the file locally and we
parse it once, so the cheaper structure wins:

1. **Spatial bucketing while parsing.** The worker hashes each point into a
   sparse voxel grid (cell size derived from the LAS header bbox, or from a
   bootstrap sample for PLY/XYZ) and flushes a cell to a chunk when it reaches
   `CHUNK_POINTS` (262 144). Chunks are therefore *spatially coherent* — which is
   the only property frustum culling actually needs — and they are emitted
   **progressively, during the parse**, so the first points appear in the scene
   about a second after the file is opened.
2. **Randomised intra-chunk order.** Each chunk's points are shuffled with a
   seeded Fisher–Yates before upload. Drawing the first *k* of a shuffled chunk
   is then a *uniform random subsample of its volume*. LOD becomes
   `geometry.setDrawRange(0, k)` — zero allocation, zero re-upload, continuous
   density. This is the single highest-leverage idea in the design and it is
   what makes "millions of points" tractable without an octree.
3. **Screen-space budget allocation.** Each frame (throttled, and only when the
   camera moved) `pc-lod.ts` scores visible chunks by projected size / distance
   and distributes a global budget (default 4 M rendered points) greedily. Chunks
   outside the frustum draw nothing.
4. **Hard memory ceiling.** `maxPoints` (default 20 M) stops the parse and reports
   `truncated: true` honestly — the repo's existing convention for partial data
   (`buildingsTruncated`).

Per-point GPU cost: 12 B position (f32×3) + 3 B colour (u8×3) + 1 B intensity +
1 B classification + 1 B confidence = **18 B/point** ⇒ 20 M points ≈ 360 MB VRAM
at the cap, ~90 MB for a typical 5 M-point building scan.

### Rejected alternatives

* **Int16 quantisation per chunk** (6 B/point). Halves the position attribute but
  costs a per-chunk scale in the shader and a second code path. The *precision*
  bug is already solved by the origin shift; this is only a memory optimisation,
  so it is deferred until the budget actually bites.
* **One `Points` object per octree node with real hierarchy.** More correct at
  100 M+, but it needs eviction, re-upload and a node cache — all of which are
  Potree/COPC's job, and all of which arrive for free when COPC lands.
* **`THREE.PointsMaterial`.** No colour modes, square points. Replaced by a ~90-line
  `ShaderMaterial` (`pc-material.ts`) — the repo already writes shaders
  (`facade-shader.ts`, `surface-shaders.ts`).

---

## 5. What LingBot-Map contributed (and what it did not)

LingBot-Map is a feed-forward **reconstruction** model (images/video → point
cloud + camera poses, PyTorch/CUDA). Reconstruction is explicitly out of scope:
no model, no PyTorch, no CUDA, no runtime dependency. It was read as a reference
for the *visualisation* half of its pipeline, and three of its ideas transferred:

| LingBot-Map concept | Transferred? | How |
|---|---|---|
| `--conf_threshold` (drop low-confidence points) | **Yes** | `confidence` is a first-class per-point attribute (read from PLY `confidence`/`quality`/`scalar_confidence`). A threshold slider discards below it **in the shader** — instant, no re-parse. |
| `--point_size` | **Yes** | Point size + attenuation toggle in the panel. |
| `--downsample_factor` (spatial downsampling for display) | **Yes, generalised** | Became the shuffled-order + draw-range LOD, which is a *continuous, view-dependent* version of the same idea instead of a fixed stride. |
| Keyframes / long-sequence KV cache / paged memory | **Concept only** | The "don't hold the whole sequence, hold a bounded working set" discipline is what the point budget and `maxPoints` cap express. |
| Camera poses, trajectory overlay, sky masking, windowed inference | **No** | Reconstruction-side. Nothing to visualise here — we consume a finished cloud. |

If a user runs LingBot-Map themselves and exports a PLY, this viewer opens it,
uses its `confidence` property, and can align it to the IFC through rung 4/5.
That is the whole intended relationship.

---

## 6. Extension points

* **New format** → write a reader exposing `PointReader`, register it in
  `pc-format.ts`. Nothing else changes.
* **LAZ/COPC** → `laz-reader.ts` + `laz-perf`; COPC additionally gets to skip the
  bucketing pass because the file already carries an octree — `pc-chunker.ts` is
  bypassed, `point-cloud-system.ts` is not.
* **Other spatial sources** (meshes, GIS vectors, topography) → the source→scene
  alignment in `pc-align.ts` is deliberately independent of "points"; it maps a
  `SourceFrame` to the scene and would serve any georeferenced source.

## 6b. A sign discrepancy found in map mode (NOT changed)

Deriving the point cloud rotation from `IfcMapConversion` surfaced an
inconsistency in the existing map code, recorded here rather than acted on.

`rotationFromXAxis` returns `γ = atan2(XAxisOrdinate, XAxisAbscissa)` — the
bearing of the **project X axis expressed in the map grid**, i.e. the rotation
`project → grid`. `placement.ts` uses it that way in its forward conversion
(`grid = origin + s·R(+γ)·project`), which is correct and is what `pc-align`
inverts.

`composeGeoRootTransform` then yaws the basemap by `+γ`. Working through it,
grid north expressed in scene coordinates is `(sin γ, 0, −cos γ)`, while the
map's own `northDirection(+γ)` is `(−sin γ, 0, −cos γ)` — mirrored in X. For a
site with a non-zero MapConversion rotation the basemap therefore appears yawed
the wrong way relative to the model. `geo-math.test.ts` covers the anchor's
invariance under yaw but never checks the sign against grid north, so nothing
caught it.

Not fixed here, deliberately: map mode's manual placement drags the same
`rotationDeg`, so flipping the sign would change behaviour users have already
tuned by eye, and that is a separate change with its own verification. The point
cloud path uses the mathematically derived sign and is unit-tested
(`pc-align.test.ts`, "inverts a rotated MapConversion"). **Follow-up: settle the
convention in one place and make both subsystems read from it.**

## 6c. Two defects the real files found

Both were invisible to synthetic fixtures and both came straight out of running
the demo corpus (PDAL's test data) through the reader. Recorded because each
suggests a class of test worth keeping.

**Cell keys collided for negative indices.** The chunker packed cell indices as
21 bits per axis into one number. The chunker's origin is the cloud's bounding
box CENTRE, so about half of every real cloud has negative indices; masking −1 to
21 bits gives 2 097 151, and 2 097 151 × 2⁴² ≈ 9.2 × 10¹⁸ is far past
`Number.MAX_SAFE_INTEGER`, where the lower two axes round away. Whole rows of
cells shared a key: chunks stopped being spatially compact, frustum culling
stopped culling and the LOD radii were wrong. Every fixture happened to use
non-negative coordinates, so 17 tests passed over a broken packing. Fixed by
biasing into a non-negative range and packing 17 bits per axis (51 bits, exactly
representable); regression tests now put cells on both sides of the origin.
*Lesson: fixtures centred on the origin are not the same as fixtures that
straddle it.*

**"Last AUTHORITY wins" read a unit code as the CRS.** `autzen_trim.las` carries
an Esri-flavoured WKT whose `PROJCS` declares no authority at all, ending in
`UNIT["foot",0.3048,AUTHORITY["EPSG","9002"]]`. Taking the last authority in the
string reported **EPSG:9002 — a linear unit — as the point cloud's coordinate
system**, which the panel would have shown to the user as fact. Fixed by
stripping the sub-clauses that carry their own authority (unit, spheroid, datum,
primem, …) before reading the code, and by refusing the 9001-9110 unit range
outright. No code at all is the right answer here: it drops the aligner to a rung
that admits it is guessing. *Lesson: heuristics over other people's formats need
a real corpus, not an example.*

## 7. Known limitations

* No LAZ/E57/COPC yet (see above).
* Alignment rung 4 (`local`) is a heuristic; it can be wrong for a scan that is
  legitimately far from the model. It is always labelled, and the manual controls
  are one click away.
* Legacy-datum EPSG codes without NTv2 grids carry metre-level error — inherited
  from `crs.ts`, and acceptable for the same reason (context, not survey).
* No point picking / measurement on the cloud yet; the raycast surface is there
  (`Points` objects with bounding spheres) but no UI consumes it.
* No eviction: a loaded cloud stays in VRAM until removed. The cap is what
  protects the tab.
