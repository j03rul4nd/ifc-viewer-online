# Point Clouds

Load a laser scan or a photogrammetry/reconstruction output next to an IFC
model, aligned through the same georeferencing the 3D Map mode uses. Everything
is parsed in the browser — a point cloud never leaves the machine, exactly like
an IFC.

Feature-flagged: set `VITE_FEATURE_POINTCLOUD=true` to build it in. With the flag
off there is no toolbar entry, no chunk and no worker.

**Design decisions and the alternatives they beat live in
[`POINT_CLOUD_PLAN.md`](./POINT_CLOUD_PLAN.md).** This document is the how-to.

---

## 1. Supported formats

| Format | Extensions | Colour | Intensity | Classification | Confidence | CRS |
|---|---|---|---|---|---|---|
| **LAS** 1.0–1.4, PDRF 0–10, uncompressed | `.las` | ✅ (PDRF 2,3,5,7,8,10) | ✅ | ✅ | — | ✅ |
| **LAZ** (LASzip-compressed LAS) | `.laz` | ✅ | ✅ | ✅ | — | ✅ |
| **COPC** (LAZ + octree index) | `.copc.laz` | ✅ | ✅ | ✅ | — | ✅ |
| **PLY** ascii / binary LE / binary BE | `.ply` | ✅ | ✅ | ✅ | ✅ | — |
| **Text** whitespace / comma / semicolon / tab | `.xyz` `.pts` `.csv` `.asc` `.txt` | ✅ | ✅ | — | — | — |

**Not supported yet** — and each says so specifically rather than "unknown file":
`.e57`, `.pcd`, and scanner-native project files (`.rcp`, `.rcs`, `.fls`,
`.zfs`). See [§7](#7-adding-a-format).

### What the readers sniff for you

* **LAS** — scale/offset, the header bounding box, and the CRS from the
  `LASF_Projection` VLR (GeoTIFF key `3072`, or an OGC WKT `AUTHORITY`/`ID`
  clause). Linear units come from GeoTIFF key `3076`, so a US-survey-foot file
  converts correctly. RGB and intensity are sampled first to detect whether the
  file writes 8-bit values into its 16-bit fields — a very common export quirk
  that a naive `>> 8` turns into a black cloud.
* **LAZ** — the same, because a LAZ header, its VLRs and its *decompressed*
  point records are all ordinary LAS. Only the decompression differs, so header
  parsing, CRS extraction and record decoding are shared verbatim with the LAS
  reader. A `.las` file whose payload is actually LASzip-compressed (a common
  mislabel) is re-routed to the LAZ reader rather than refused.
* **COPC** — the `copc` info VLR (pinned by the spec as the first VLR) and the
  octree hierarchy pages. A `.copc.laz` is routed to the octree reader by its
  double extension, since `extensionOf` sees only ".laz".
* **PLY** — property names, including the aliases scanners actually emit
  (`red`/`r`/`diffuse_red`, `intensity`/`scalar_intensity`/`reflectance`,
  `confidence`/`quality`/`scalar_confidence`).
* **Text** — the delimiter, an optional header row, the `.pts` leading
  point-count line, and what the columns after XYZ mean. `x y z r g b` and
  `x y z nx ny nz` are told apart by sign: colour channels are never negative.

---

## 2. Loading a cloud

**Tools → Point cloud**, then drop a file on the panel or click to browse. You do
not need an IFC open first — a scan on its own is a valid thing to look at.

### Sample scans

With nothing loaded the panel lists four **public LiDAR samples** you can open in
one click — the point cloud counterpart of the demo IFC gallery. They are fetched
straight from `raw.githubusercontent.com` into the browser and go through the
exact same loader a dropped file does, so what you see is what you would get with
your own scan. Registry: `src/demo-models/point-clouds.ts`.

| Sample | Size | Points | Shows |
|---|---|---|---|
| Autzen Stadium — aerial LiDAR | **589 kB (LAZ)** | 110 k | LASzip decompression, true colour, ground/unclassified returns, and a file recorded in **feet** that the reader converts. Its WKT declares no CRS, so it also shows the honest "placed by hand" rung. |
| New Mexico — ground survey | 5.7 MB | 199 k | **LAS 1.4, point format 6** and US survey feet, with a real `EPSG:2903`. |
| Mississippi Valley — classified | 175 kB | 6.3 k | Six ASPRS classes — the fastest way to see **Colour by → Classification**. |
| Warsaw — coloured sample | 100 kB | 3 k | Instant load; handy for trying the appearance controls. |

**These are surveys of real places, not scans of the demo buildings.** No public
scan-and-IFC pair of the same site exists, so every sample lands on the bottom
rung of the ladder and the panel says so. They demonstrate reading, rendering,
units, colour modes, classification and LOD — not a matched alignment. To see the
top rungs you need your own georeferenced pair.

Every number in the registry (byte size, point count, CRS, unit, which channels
are present) was read out of the actual file rather than copied from a
description; `docs/POINT_CLOUD_PLAN.md` §2 explains why that matters.

Points appear **progressively**, roughly a second in: the worker streams the file
in 8 MB slices and posts each block of points to the GPU as it completes. There
is no "loading 100%" wall before the first pixel.

While it loads the panel shows the file, a progress bar, and a running point
count. Removing a row cancels the parse and frees the buffers immediately.

---

## 3. How the two coordinate systems are reconciled

This is the part that matters, and it is not `pointCloud.position = ifc.position`.

```
point-cloud source frame          IFC project frame            scene frame
(source units, source axes,   →   (metres, Z-up, origin    →   (metres, Y-up:
 optionally a projected CRS)       at the file origin)          x=x, y=z, z=−y)
```

**The IFC model never moves.** The cloud is transformed into the model's frame —
the same rule 3D Map mode follows for the basemap. Nothing that depends on IFC
coordinates (validation, BCF viewpoints, measurements, saved tours) can be
invalidated by loading a scan.

The transform is chosen by a ladder, top rung first. The panel always names the
rung it used, how much to trust it, and why:

| Rung | When it applies | Confidence | What happens |
|---|---|---|---|
| **Georeferenced (map conversion)** | The scan has an EPSG code and the IFC has an `IfcMapConversion` (or the IFC2x3 `ePSet_MapConversion` equivalent) | `Exact` | The MapConversion is inverted: `project = R(−γ)·(grid − E₀N₀) / s`, heights referenced to `OrthogonalHeight`. If the two files use different grids, the scan is reprojected with proj4 and the grid convergence between them is corrected. |
| **Georeferenced (shared grid)** | The scan has an EPSG code; the IFC gives grid coordinates but names no CRS, or its CRS is unresolvable | `High` | Same maths, with the scan's CRS assumed to be the project's. Stated explicitly. |
| **Geographic anchor** | The scan has an EPSG code; the IFC only has `IfcSite` latitude/longitude | `Approximate` | The scan is converted to WGS84 and offset from the model's site anchor on a local tangent plane. Site lat/lon is coarse and there is no shared elevation datum, so the scan's floor is placed on the model's floor. |
| **Shared local coordinates** | Neither is georeferenced, but the two bounding boxes plausibly coincide | `High` | Units and axis convention only. A millimetre or foot-based file is detected from the extent ratio and scaled. |
| **Placed by hand** | Nothing links the two | `Unverified` | The scan is centred on the model plan and rested on its floor. The offset controls open automatically. |

### Precision

Survey coordinates are ~5 × 10⁵ / 4.5 × 10⁶ metres. Stored as float32 that is
half-metre-accurate — visible garbage. Handled with a two-level origin shift:

* the source bounding-box centre is kept in **float64** and never uploaded;
* each chunk sits at `chunkOrigin − cloudOrigin` (small);
* each vertex is `point − chunkOrigin` (≤ tens of metres, sub-micrometre in f32);
* the cloud root carries the full scene-space position, computed in float64.

The alignment tests assert millimetre accuracy 1.2 km from the survey origin.

### When the scan's CRS is not in the build

`crs.ts` bundles the construction-common EPSG definitions plus every UTM zone,
which is not everything — US State Plane, for instance, is ~120 zones with
per-zone parameters and none of them are formulaic.

Rather than ship a wrong-shaped subset, an unresolvable CRS is treated as an
**actionable** gap, distinct from "no CRS at all": the panel says the scan named
a system this build has no definition for, and offers a proj4 box. Paste the line
from epsg.io, and the alignment re-derives immediately. The definition is stored
per file, and registered into the **same** CRS registry map mode uses — so it
resolves everywhere, not just for point clouds.

Measured on `mvk-thin.las`, which declares EPSG:26995 (NAD83 / Louisiana South,
ftUS) against an IFC georeferenced in the same grid:

| | rung | confidence |
|---|---|---|
| first open | `Placed by hand` | Unverified |
| after pasting the proj4 line | `Georeferenced (map conversion)` | **Exact** |
| after a reload | `Georeferenced (map conversion)` | Exact (definition restored from storage) |

### Adjusting a placement

The panel exposes X / Y / Z, rotation and scale **only when the system had to
guess** (the bottom two rungs), or on request. Offsets apply *on top of* the
derived transform and are never folded into it, so **Reset placement** always
returns to what the files actually say.

A placement you tune is **persisted per file** (keyed by name, size and
modification time, in `localStorage`, device-local and never uploaded) and
restored the next time you open that same scan — it takes precedence over a
fresh guess, exactly as a saved map placement does. **Reset placement** forgets
it again.

---

## 4. Display controls

| Control | Effect |
|---|---|
| **Colour by** | Scan colour (RGB) · Intensity · Height · Classification (ASPRS palette) · Single colour. Modes the file has no data for are disabled rather than shown empty. |
| **Point size** + **Shrink with distance** | Constant pixels, or world-sized sprites. |
| **Opacity**, **Round points** | Round sprites read far better at low density. |
| **Detail** | Scales the render budget (points drawn per frame). Lower it if navigation stutters — it changes density, not coverage. |
| **Confidence cut-off** | Hides points below a per-point confidence. Only appears for files that carry the channel (see [§6](#6-reconstruction-outputs)). |
| **Fit to scan** / **Fit model + scan** | Camera framing, through the viewer's own `fitToBox`. |
| **Re-run alignment** | Re-derives the placement against whatever model is active *now*. The two files rarely arrive together — a scan opened before the IFC had nothing to align to, and switching the active model changes the answer. Your manual offset is carried across, because the derived transform and the nudge are separate by construction. |
| **Both / Scan only / Model only** | Isolation, using the existing per-model visibility API. |
| **Inspect → Click a point** | Reads one point out of the scan: its scene position, its coordinates *in the file*, and the classification and intensity recorded there. |

Every one of these is a uniform or a draw-range change. Nothing is re-parsed, no
buffer is re-uploaded — they are instant on a 20-million-point cloud.

### Inspecting a point

**Inspect → Click a point** reports what the file actually recorded at a
location — including the coordinates as written in the file, which is the number
a surveyor will quote back at you, not our scene metres.

Three.js's own `Points.raycast` tests every vertex in a geometry, which at 20 M
points is not a slow pick but a frozen tab — which is why the renderer disables
it outright, so a cloud can never intercept an IFC click. Picking instead reuses
the structure that already exists:

* chunk bounding spheres are tested first, so a ray touches a few hundred spheres
  before a single point;
* only the **drawn** range of a chunk is scanned — LOD has already decided what
  is visible, and picking something invisible would be a lie;
* the tolerance is a **screen-space** one (8 px), converted to world units at the
  chunk's distance, so it behaves the same across a room and across a site;
* the winner is the nearest point **along** the ray, not the nearest *to* it —
  otherwise a click passing near a far surface reaches straight through the near
  one and grabs what is behind it.

Inspecting is an explicit mode, and its click listener runs in the capture phase,
so turning it on never doubles as selecting the IFC element behind the scan.

---

## 5. Performance

**No octree.** Potree-style hierarchies exist to stream from disk over HTTP; we
already hold the file locally. The cheaper structure that gets the same result:

1. **Spatial bucketing while parsing.** The worker hashes points into a sparse
   voxel grid and flushes a cell as its own chunk when it fills. Chunks are
   spatially compact, which is the only property frustum culling needs. Grid
   resolution follows the point count: a 120 k-point room becomes ~8 chunks, a
   20 M-point site a few hundred.
2. **Randomised order inside each chunk.** Points are shuffled with a seeded
   Fisher–Yates before upload, so drawing the first *k* of a chunk is a *uniform
   random subsample of its volume*. Level of detail is therefore
   `geometry.setDrawRange(0, k)` — no allocation, no re-upload, continuous
   density. This is the single idea that makes millions of points affordable.
3. **Screen-space budget.** ~12 times a second, and only when the camera has
   moved, chunks are scored by projected size and a global budget (4 M points at
   Detail 1) is distributed greedily. Chunks outside the frustum draw nothing.
4. **Hard ceiling.** 20 M resident points across all clouds. Reaching it stops
   the parse and reports `truncated` in the panel — it never pretends the file
   was fully loaded.

**Cost per point:** 12 B position + 3 B colour + 1 B intensity + 1 B class +
1 B confidence = **18 bytes**. A 5 M-point building scan is ~90 MB of VRAM; the
cap is ~360 MB. `viewer.getGpuEstimateBytes()` counts it exactly.

**One `THREE.Points` per chunk, never one per object or per point.** A 300 k-point
cloud adds fewer than 20 nodes to the scene graph, and there is one shared
material for every chunk of every cloud. `point-cloud-system.test.ts` asserts it.

Points are excluded from the model raycaster, so selection behaves exactly as it
did before a scan was loaded.

### About LAZ

LASzip is arithmetic-coded, so there is no dependency-free decoder for it the way
there is for LAS. It is the one place this feature takes a runtime dependency
(`laz-perf`, ~300 kB of WASM), and the cost is contained: the module is imported
**dynamically inside the reader**, so it is fetched the first time someone opens a
`.laz` and never otherwise.

One structural limit: `laz-perf`'s decoder needs the whole compressed file in
memory — it has no range-read entry point, which is exactly what COPC exists to
provide. LAZ runs 5–10x smaller than its LAS (the Autzen sample: 589 kB vs
3.6 MB, 6.2x), so this is comfortable in practice, and a hard cap fails with a
sentence rather than an out-of-memory crash.

Correctness is pinned to ground truth rather than to a fixture: the same survey
exists as both `.las` and `.laz` in the PDAL corpus, and decoding each with its
own reader gives **bit-identical** coordinates and attributes.

### About COPC — and why it changes the ceiling

A COPC file is LAZ with an octree baked in: points live in nodes, each node is a
self-contained LASzip chunk at a known byte offset, and each *level* is a
progressively finer sample of the whole cloud. Two things follow, and both are
measured rather than asserted:

**Nothing is read that is not drawn.** Nodes are range-read from the `File` one at
a time, so the reader never holds the file in memory the way the plain LAZ path
must. On a deep octree this is the difference between a few hundred kB of reads
and a multi-gigabyte download.

**Running out of budget stops being a truncation.** Nodes are walked
coarsest-first, and the node that straddles the budget is *strided* rather than
cut short — so what you get is the entire site, uniformly thinned, instead of a
dense corner of it. Measured on the COPC reference file at an 8 k point budget
(8% of the cloud):

| | coverage of the site | bytes read |
|---|---|---|
| **COPC** | **100% × 100%** | 424 kB, 3 range reads |
| the same cloud as plain LAZ | 58% × 100% | 696 kB (whole file) |

That reference file has only two octree levels, so the byte figures are close;
the gap widens sharply on real files, which run six to twelve levels deep. The
coverage figure is the one that holds regardless of depth.

**If you have a big cloud, convert it to COPC** rather than decimating it:

```bash
# Any LAS/LAZ -> COPC, with PDAL
pdal translate big.laz big.copc.laz --writers.copc.filename=big.copc.laz

# Or with untwine, which is built for large inputs
untwine --files big.laz --output_dir out --single_file
```

### View-dependent loading

`pc-octree.ts` is the decision layer for streaming: given the octree index, the
camera and a budget, which nodes should be resident? It is a pure function — no
three.js, no WASM, no `File` — because that is the part with judgement in it and
it is far easier to be sure of in isolation than tangled into a render loop.

The policy:

* **Refine on on-screen point spacing.** A node whose points would land more than
  `maxSpacingPx` apart reads as confetti and must be refined; one already tighter
  than that is spending budget on detail nobody can see. Distance is measured to
  the node's *cube*, not its centre, so a large node the camera sits inside
  scores as near rather than far.
* **Never a child without its parent.** COPC nodes each carry a *slice* of the
  points in their cube, so a child admitted without its ancestors renders a hole
  where the coarse samples belong. Enforced by construction — children only
  become eligible once the parent is in — rather than by a check afterwards.
* **Coarsest-first fetch order**, so the first thing to arrive covers the whole
  site and everything after it only sharpens.
* **Idempotent.** `diffSelection` returns empty when the view has not moved, so
  the loop can run every frame and ask for nothing.

That policy drives a **persistent worker session**: `stream-open` hands back the
octree index without reading points, the LOD pass turns a selection into
`stream-nodes` requests and evictions, and `stream-close` frees the reader. A
COPC node arrives as its own chunk — deliberately *not* routed through the voxel
bucketing the file-order formats need, since an octree node already has spatial
coherence and re-bucketing would only split one tidy draw call into several and
throw away the level structure.

Eviction has **hysteresis**. A node that leaves the selection is not dropped; it
is held for a grace period first, so a camera nudged back and forth across a node
boundary costs nothing instead of re-reading and re-decompressing the same node
forever. Measured on the reference file with a budget tight enough to make the
boundary bite, over ten oscillating passes: **9 re-fetches without it, 1 with**.
The escape hatch matters as much as the grace — once held nodes push resident
points past `budget × 1.6`, the stalest are dropped immediately, because
smoothing is a courtesy and running out of VRAM is not.

One behaviour worth knowing about: the first selection runs **immediately** on
`enableStreaming`, not on the next animation frame. That saves a frame plus the
stream interval, but the real reason is that `requestAnimationFrame` does not
fire at all in a background tab, a hidden window, or some low-power modes — and a
streamed cloud that silently stays empty because the loop was throttled is
indistinguishable from a broken one.

Verified against the COPC reference file through the real worker: `stream-open`
returns the index (5 nodes), a `stream-nodes` request for four ids returns four
chunks with the right counts, and the panel reports 100 k points in **5 blocks** —
one draw call per octree node. On the selection side, a camera 50 km out takes the
root alone (66 k of 100 k points); up close it takes everything; at a 70 k budget
it takes the root and reports `budgetLimited`.

### Working with clouds bigger than the cap

Until COPC lands ([§7](#7-adding-a-format)), decimate or tile ahead of time:

```bash
# Keep every 10th point (PDAL)
pdal translate big.laz smaller.laz decimation --filters.decimation.step=10

# Or crop to the area you actually need
pdal translate big.laz site.laz crop --filters.crop.bounds="([500000,500400],[4500000,4500300])"

```

Cropping beats decimating: full density over the building you are checking is
more useful than a thin haze over the whole site.

---

## 6. Reconstruction outputs

Feed-forward reconstruction pipelines (LingBot-Map and its relatives) emit a PLY
plus camera poses. This viewer consumes the **finished cloud** — it does not run
reconstruction, and there is no model, no PyTorch and no CUDA anywhere in it.

What does carry over is the display half of those pipelines:

* a per-point **confidence** channel is read as a first-class attribute, and the
  confidence cut-off applies it **in the shader**, so the equivalent of a
  `--conf_threshold` sweep is a slider drag rather than a re-export;
* **point size** is a direct control;
* **spatial downsampling** became the view-dependent LOD in §5 — a continuous,
  camera-aware version of a fixed stride.

Camera poses, trajectory overlays and sky masking are reconstruction-side and are
not consumed. Such a cloud is not georeferenced, so it aligns at the
"shared local coordinates" or "placed by hand" rung.

---

## 7. Adding a format

The reader registry in `pc-format.ts` is the only place that knows formats exist:

```ts
// 1. Implement PointReader (see pc-reader.ts)
export class LazReader implements PointReader {
  readonly format = 'laz'
  constructor(private readonly file: File) {}
  async open(): Promise<ReaderHeader> { /* header, CRS, attributes, bounds */ }
  async read(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    // decode; call consumer.push(x, y, z, r, g, b, intensity, class, confidence)
    // in SOURCE units, checking opts.shouldStop() between slices
  }
}

// 2. Register it — nothing else changes.
const READERS = { las: …, ply: …, xyz: …, laz: (f) => new LazReader(f) }
const EXTENSION_FORMATS = { …, '.laz': 'laz' }
```

Chunking, alignment, LOD, rendering, disposal and the UI are format-agnostic and
pick the new reader up for free.

**LAZ** is the obvious next one (`laz-perf` WASM, ~300 kB). **COPC** after it: it
already carries an octree, so it would bypass `pc-chunker` and feed chunks
straight to `point-cloud-system` — that is the path to clouds far beyond the
current cap.

---

## 8. Architecture

```
PointCloudPanel (React.lazy)         pointCloudStore (Zustand, serialisable only)
        │                                     │
        └── pc-runner ────────────────────────┘
              │  worker lifecycle, alignment resolution, chunk hand-off
              │
              ├── point-cloud.worker ── pc-format → las/ply/xyz reader
              │                      └─ pc-chunker (bucket + shuffle + emit)
              │
              └── viewer.getPointClouds() → point-cloud-system   (lazy chunk)
                                              ├── pc-align     (the ladder)
                                              ├── pc-material  (one ShaderMaterial)
                                              └── pc-lod       (budget allocation)
```

| File | Responsibility |
|---|---|
| `src/lib/pointcloud/pc-types.ts` | Types, budgets, worker protocol. No runtime deps. |
| `src/lib/pointcloud/pc-reader.ts` | The `PointReader` contract + slice/bounds helpers. |
| `src/lib/pointcloud/las-reader.ts` · `ply-reader.ts` · `xyz-reader.ts` | Format decoders. `las-reader` also owns the shared record layout/decoding the LAZ reader reuses. |
| `src/lib/pointcloud/laz-reader.ts` | LASzip decompression via `laz-perf` (dynamically imported WASM); owns the shared, memoised module instance. |
| `src/lib/pointcloud/copc-reader.ts` | COPC: info VLR, octree hierarchy walk, per-node range reads, coarsest-first strided traversal, and the streaming surface (`octreeRoot`, `octreeNodes`, `readNode`). |
| `src/lib/pointcloud/pc-format.ts` | Detection + reader registry (the extension point). |
| `src/lib/pointcloud/pc-chunker.ts` | Spatial bucketing, shuffling, chunk emission. |
| `src/lib/pointcloud/pc-align.ts` | The alignment ladder. Reuses `geo/crs.ts` (proj4) and `geo/geo-math.ts`. |
| `src/lib/pointcloud/pc-lod.ts` | Screen-space budget allocation across resident chunks. |
| `src/lib/pointcloud/pc-pick.ts` | Ray→point picking: sphere prefilter, nearest-along-ray selection, screen-space tolerance. Pure. |
| `src/lib/pointcloud/pc-octree.ts` | COPC node selection and residency policy: node bounds, screen-space spacing, parent-before-child refinement, budget, eviction hysteresis. Pure. |
| `src/lib/pointcloud/pc-material.ts` | The point ShaderMaterial (colour modes, confidence, sprites). |
| `src/lib/pointcloud/point-cloud-system.ts` | Owns every Three.js resource. Twin of `geo-system` / `solar-system`. |
| `src/lib/pointcloud/pc-runner.ts` | Worker orchestration + store updates. |
| `src/workers/point-cloud.worker.ts` | Off-thread parse, streams transferable chunks. |
| `src/stores/pointCloudStore.ts` | Product state, display prefs, epoch cancellation. |
| `src/components/PointCloudPanel.tsx` | The UI. Uses the shared `ViewportPanel` shell, so it is a right-hand card on desktop and a two-detent bottom sheet on a phone, like the map and solar panels. |

**What it reuses rather than reinvents:** the scene, camera and renderer
(`viewer.ts`); `geo-extract.worker` + `crs.ts` + `placement.ts` for the IFC's
georeferencing — the same code map mode and the sun study use, so the app has one
georeferencing story instead of three; `sceneStore` visibility; `ViewportPanel` +
`MobileSheet` for the panel shell; the toast, i18n, logger and worker
conventions.

---

## 9. Limitations

* No E57 or PCD yet (§7). Each is refused with a specific message.
* A plain LAZ is decompressed whole in memory, so a very large one is capped
  rather than streamed. Converting it to COPC removes that limit entirely.
* Streaming has no node cache across sessions: reopening a COPC re-reads the
  nodes it needs. They are small range reads, so this is cheap, but it is not
  free.
* Streaming holds no decoded-node cache: a node dropped after its grace period
  is re-read if the camera returns much later. The reads are small, so this is
  cheap rather than free.
* The "shared local coordinates" rung is a heuristic. It can be wrong for a scan
  that is legitimately far from the model — it is always labelled, and the manual
  controls are one click away.
* Legacy-datum EPSG codes without NTv2 grid shifts carry metre-level error,
  inherited from `crs.ts` and acceptable for the same reason (context, not survey).
* The bundled CRS registry does not cover US State Plane and other regional
  grids. Those are not silently ignored — see "When the scan's CRS is not in
  the build" above for the one-paste fix.
* No eviction: a loaded cloud stays in VRAM until removed. The 20 M cap is what
  protects the tab.
* Clouds are not included in exports (IFC/GLB/BCF) or in the SDK surface.

---

## 10. Worked examples

**A registered scan of a modelled building.** Open the IFC, open the panel, drop
`site-scan.las`. If both are georeferenced you get *Georeferenced (map
conversion) · Exact* and the scan lands on the model to the millimetre. Switch
**Colour by → Height** and use **Model only** / **Scan only** to compare as-built
against as-designed.

**A scan with no georeferencing, exported in millimetres.** The panel reports
*Shared local coordinates · High* with "Extent suggests millimetres — scaled by
0.001". If it looks a metre off, open **Adjust placement**, nudge, and use
**Reset placement** to get back to the file's own answer.

**A photogrammetry PLY with confidence.** The **Confidence cut-off** slider
appears. Drag it to ~0.4 and the low-confidence haze disappears live, with no
re-import.

**A 400-million-point city scan.** Crop or decimate it first (§5) — the viewer
will otherwise stop at 20 M points and tell you it did.
