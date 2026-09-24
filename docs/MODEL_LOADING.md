# Model loading and orchestration

How a model gets from a file, a URL or SDK bytes into the scene. This covers
the queue, the scheduler, the worker pool, memory, the cache, cancellation,
retry, federated batches, multimodal tracking and how it is observed.

Code: `src/lib/loading/` (engine), `src/stores/loadingStore.ts` (mirror),
`src/components/loading/` (UI). Contracts: `src/lib/loading/types.ts`.

> **Status:** implemented 2026-09. This document is the reference. Where it
> disagrees with older passages in `ARCHITECTURE.md`, `CONTEXT.md` or
> `DECISIONS.md`, this document wins (see D-29).

---

## 1. What was wrong

Loading was a single-flight hook (`useIfcLoader`) that App.tsx drove through a
handful of global flags. It worked for one file at a time and broke in ways
that were hard to see for anything else:

| Problem | Where it showed |
|---|---|
| A second load while one ran was **rejected**, not queued (`isLoadingRef`), and App then flagged the whole scene `'error'`. | Federated demos relied on a 60 s `model:loaded`-by-fileName wait; a slow parse dropped the next discipline silently. |
| **Progress went backwards** (20 → 0, 99 → 80) and was mostly fixed numbers. The real per-class `ProgressData` from IfcImporter and fragments' real `generating` fraction were thrown away. | The upload bar and the SDK `model-progress` event. |
| **Cancel did nothing.** The overlay's button changed its own state; the worker kept parsing and the model still arrived. | Upload overlay. |
| The **modelId was minted inside the viewer** after the load, so nothing outside could cancel, prioritise or correlate a load. | fragments `abort(modelId)` existed and was unused. |
| One `pendingRequestIdRef` slot for SDK correlation; parse failures emitted no `model-error`. | A host timeout could make `add(B)` resolve with model A. |
| Every progress message set React state in App, re-rendering the whole app once per IFC class. | Main-thread jank during loads. |
| The OPFS key used `lastModified`, which is "now" for every fetched `File`, so URL/demo/SDK loads **never hit the cache** and wrote a new entry every time; a 0-byte `.frag` counted as a hit. | Repeat demo loads re-parsed; OPFS grew without bound. |
| Full IFC copied on the main thread (`slice(0)`) before transfer; the fragments `Uint8Array` was structured-cloned into the fragments worker. | Main-thread stall of hundreds of ms on big files; 2× transient memory. |
| Concurrency-unsafe viewer code (shared `expressIDToType` alias read after awaits, orphan model when setup threw, coordinate base = whichever model finished first). | Latent; became real the moment two loads overlap. |

## 2. Architecture

```
            ┌──────────────────────────────────────────────────────────────┐
 UI         │ UploadOverlay (multi-file review) · global drop · DemoGallery│
            │ SDK/postMessage · ?model= · companion loaders                │
            └──────────────┬───────────────────────────────────────────────┘
                           │ submit(source, opts) / submitBatch(...)
            ┌──────────────▼───────────────────────────────────────────────┐
 Engine     │ LoadManager  (src/lib/loading/load-manager.ts)               │
            │  jobs · batches · lifecycle · retries · events · metrics     │
            │   ├─ Lanes: network(2, back-pressured) · convert(1, memory-admitted, anchor-reserved) · attach(1, anchor-first)
            │   │    decisions by the pure scheduler (scheduler.ts)        │
            │   ├─ ResourcePolicy (resource-policy.ts): cores, memory, pressure
            │   ├─ RetryPolicy (retry-policy.ts): classify → strategy      │
            │   └─ Adapters: ifc (managed) · pointcloud/mesh/gis (tracked) │
            └──────┬───────────────────────────┬───────────────────────────┘
                   │ IFC adapter (ifc-source.ts)│ events (throttled snapshot)
      ┌────────────▼──────────┐    ┌───────────▼───────────┐
      │ IfcConvertPool         │    │ loadingStore (Zustand) │──▶ LoadingIndicator
      │ ifc-parser.worker × N  │    │  snapshot mirror ≤10/s │──▶ LoadingCenter
      │ web-ifc WASM (ST)      │    └───────────┬───────────┘──▶ ScenePanel "loading" section
      └────────────┬──────────┘                 │              ──▶ FirstLoadCard
                   │ fragments ArrayBuffer      │ appBus load:* / model:removed
      ┌────────────▼──────────┐                 ▼
      │ viewer.loadFragments   │         App bridge: SDK model-progress/-loaded/-error,
      │ (modelId, signal,      │         analytics, toasts, first-model reset
      │  onStage) → fragments  │
      │ workers → GPU tiles    │
      └───────────────────────┘
```

Separation: the engine never imports React or a store. It talks to the scene
only through injected dependencies (`getViewer`, `commit` callbacks), and to
the UI only through snapshots and events. The store holds serialisable views;
`File`s, buffers, workers and AbortControllers stay inside the engine.

## 3. Lifecycle

```
submit ─▶ queued ──(lane granted)──▶ running ──▶ … ──▶ loaded ──▶ (finishing: stream, index)
            │  ▲                        │  ▲                 │
            ▼  │ resume                 ▼  │ lane granted    ▼ remove
           held                       waiting             unloading ─▶ removed
                                         │
   any non-terminal ── cancel ─▶ cancelled        any running ── error ─▶ failed ──retry─▶ queued
```

- **queued** — accepted; has not done heavy work; waiting for its first lane.
- **waiting** — started and then blocked on a lane, with an explicit reason:
  `slot`, `memory`, `exclusive`, `anchor`, `attach-lane`, `backoff`, `viewer`.
  The UI prints the reason ("Waiting for memory", "Waiting for Architecture.ifc
  to set the coordinate base") — the app never looks frozen *and* never
  pretends to be working when it is waiting.
- **loaded** — the commit point: the model is registered, in every store and
  interactive. Background phases (`stream`, `index`) keep reporting but do not
  count as "loading".
- **failed / cancelled** — terminal; buffers released. A failure Retry can fix
  keeps its source; one it cannot (invalid file, unsupported) drops it, and a
  cancel drops memory-backed sources (SDK bytes, downloaded Files). Upload/drop
  Files (disk-backed) and URLs are kept for Retry.
- **idle** — the manager's `idle` event (and the app's "still loading" state)
  means no *managed* IFC job is queued, running or waiting. Held jobs and
  tracked point cloud / mesh / GIS rows never keep the app "loading": deep
  links, deferred validation and georef extraction wait for models, not for a
  paused file or a terrain fetch. A reset (landing) emits no `idle`.
- **unloading / removed** — the model was removed (by the user, SDK or reset).

### Phases (IFC)

| Phase | Real signal | Progress |
|---|---|---|
| `download` | `fetch` body stream | bytes / content-length (determinate) |
| `identify` | header sniff + sampled fingerprint | activity |
| `cache-lookup` | OPFS entry + `.frag` read | activity |
| `geometry` | IfcImporter `ProgressData{process:'geometries'}` per IFC class | classes done / total, entities |
| `properties` | `process:'attributes'` per class | classes |
| `relations` | `process:'relations'` per class | classes |
| `serialize` | `process:'conversion'` → result message | activity |
| `cache-write` | OPFS write (`.frag`, then `.meta.json` as commit marker) | activity |
| `attach` | fragments `LoadProgressEvent` (`decompressing`, `parsing`, `generating` 0..1) | determinate in `generating` |
| `setup` | categories, type map, palette | activity |
| `read` | `File → ArrayBuffer` for validator / IDS / export | activity |
| `stream` *(background)* | fragments `model.isBusy` / `onViewUpdated` | activity |
| `index` *(background)* | `buildSpatialTree` in the validator worker | activity |

A cache hit replans the job to `identify → cache-lookup → attach → setup →
read → stream → index`.

**Honesty rules.** A phase reports a fraction only when the code doing it
measures one. Otherwise it reports `null` and the UI shows activity (a moving
segment, elapsed time, counters), never a made-up number. The job's overall %
aggregates phase weights and is labelled as an estimate; it is monotonic by
construction (done phases count fully, the active phase counts its real
fraction or 0), and the global figure is computed per *wave* (everything
loaded since the queue last went idle counts as done), so a model committing
never drags the indicator back. ETA is shown only when it is predictable: once
the session has calibrated `ms/MB` for every remaining phase from a finished
job **and** the active phase has real progress (a download alone no longer
produces a whole-job ETA); a countdown that overruns its forecast is withdrawn
rather than frozen at "<5 s left". With nothing measuring, the indicator spins
and shows no percentage.

## 4. Scheduling

Three lanes, each a priority queue ordered by *(effective priority, seq)*:

| Lane | Capacity | Admission |
|---|---|---|
| `network` | 2 | — |
| `convert` | `maxConcurrentConverts` (**1** by default — measured, see below) | memory budget; large files run exclusively; reserved for the anchor of an empty scene |
| `attach` | 1 | anchor-first when the scene has no IFC model |

**Priorities**: `critical 0 · high 1 · normal 2 · low 3 · background 4`.
Defaults: a single user-picked file → high; batch members → normal (the first
→ high); SDK/URL → normal; companion → normal; tracked GIS → background.
Aging lifts a waiting job one level every 45 s, so nothing starves. The user
can raise/lower priority, move a job, or hold/resume queued jobs.

**Convert admission** (`scheduler.ts`, pure): grant candidates in order while
`running < effectiveMax` and `Σ peak + candidate.peak ≤ budget` — except that
one job may always run when nothing else does (a huge file still loads, alone).
An exclusive job (≥ `largeFileBytes`, or peak > 60 % of the budget, or a retry
after OOM) runs only when the lane is empty, and nothing is admitted beside it.
Smaller jobs may backfill past a memory-blocked head only until the head has
waited 30 s; then the lane reserves for it.

**Why attach is serial and anchor-first.** fragments sets the scene's
coordinate base from the first model that reaches `core.load` (autoCoordinate)
— every later model is offset relative to it, and saved cloud offsets and geo
placement are relative to that base. Attaching one model at a time keeps
main-thread setup work and GPU uploads from piling up, and when the scene is
empty the lane grants the **first-submitted** live IFC job first. A small file
that finishes converting early shows "waiting for <anchor> (coordinate base)"
instead of silently reordering the federation.

**The anchor also goes first through `convert`.** Nothing can appear before the
anchor attaches, so in an empty scene the convert lane is reserved for it while
it still has conversion ahead (local phases always; a download only for its
first 3 s, so a slow download never leaves the CPU idle behind it). Measured on
Hotel Vela before this rule: the two smaller disciplines finished downloading
30 ms earlier, took the lane, and the architecture model waited 2.9 s for it.

**Why one conversion at a time.** Concurrency was meant to scale with cores
and was measured instead (Chromium, 12 cores, 16 GB, Hotel Vela: ARC 5.2 MB,
STR 1.4 MB, MEP 0.2 MB, cold cache):

| Concurrent conversions | ARC geometry | MEP geometry | Whole set |
|---|---|---|---|
| 1 | 1.5 s | 0.09 s | 7.2 s |
| 2 | 1.6 s | 2.75 s | 7.6 s |
| 3 | 11.7 s | 9.8 s | 16.0 s |

IfcImporter builds geometry in JS arrays and web-ifc parses each file twice;
concurrent workers fight over allocation and memory bandwidth rather than
cores, and every job gets slower than running them in turn. The overlap that
pays is **across lanes**: the next file downloads while this one converts, and a
converted model attaches while the next one converts. `ifc:load-max-converts`
(DEV localStorage) keeps the knob for re-measuring on other hardware.

**Resource policy** (`resource-policy.ts`): `navigator.hardwareConcurrency`,
`navigator.deviceMemory` (Chromium), `crossOriginIsolated`, a mobile heuristic,
and the main-thread heap ratio from `performance.memory` when present.

| Input | Rule |
|---|---|
| cores | reported in the Advanced view; conversions stay at 1 (measured above) |
| deviceMemory | budget = `min(deviceMemory × 0.4 GB, 3.2 GB)`; unknown → 2 GB desktop / 1 GB mobile |
| estimate | IFC convert peak ≈ `size × 5 + 100 MB` (JS copy + 2 WASM parses + geometry arrays + builder) |
| pressure | heap ≥ 80 % or an OOM this session → `elevated` (max 1 convert); ≥ 92 % → `critical` (one job only when idle) |

## 5. Workers and threads

| Work | Where |
|---|---|
| UI, scheduling, lanes, events, store mirror | main thread (cheap, event-driven) |
| Header sniff (1 KB) + fingerprint (3 × 64 KB SHA-256) | main thread, async I/O + `crypto.subtle` |
| File → bytes for conversion | **parser worker** (the `File` is posted, not its bytes) |
| IFC → fragments (`IfcImporter`, web-ifc WASM, single-thread) | `ifc-parser.worker` from `IfcConvertPool` |
| Fragments decompress / tiles / LOD / culling / raycast | fragments' own worker pool |
| Scene attach (pivot, categories, palette, framing) | main thread, one model at a time |
| GPU upload of streamed tiles | three.js on render, budgeted by fragments |
| IFC → ArrayBuffer for downstream consumers | main thread, async read at commit |
| Spatial tree (`index` phase) | validator worker, scheduled through the **convert lane at background priority** so it never runs beside a conversion; bounded by a size-scaled timeout |
| Validation, IDS, geo extraction | their own workers; `?validate` and georef extraction are deferred until the queue is idle |

**IfcConvertPool** spawns workers on demand (the convert lane, not the pool, bounds how many run).
Conversion is a synchronous WASM call — the worker cannot even read a message
while `StreamMeshes` runs — so **cancel = `worker.terminate()`** and the pool
respawns lazily. Workers that converted a file ≥ 64 MB are terminated after the
job (Emscripten heaps never shrink, so this returns the high-water mark to the
OS); idle workers are terminated after 60 s. A worker that dies is reported as
`worker-crash`, and the retry uses a fresh worker. There is no silence watchdog
that kills a parse — a big IFC class can legitimately take minutes without a
message; instead the job is flagged `stalled` in the UI after a size-scaled
threshold, with Cancel/Retry offered.

**Main-thread copies removed.** The main thread no longer materialises the IFC
during conversion: the worker reads the posted `File`. The bytes the
validator / IDS / export need are read once, asynchronously, at commit. The
fragments buffer is written to OPFS first and then **transferred** (not cloned)
into the fragments worker. Net: the synchronous whole-file `slice(0)` is gone,
the main-heap peak during conversion drops from 2× to 0× the IFC, and one full
copy of the fragments is avoided.

## 6. Memory

- Admission control keeps the sum of estimated peaks under the budget and runs
  large files alone.
- Pressure (`performance.memory` heap ratio, OOM errors) lowers concurrency for
  the rest of the session; the UI shows "Waiting for memory".
- Cancel and failure drop every reference the job holds (File for memory-backed
  sources, buffers, worker). Only `upload`/`drop` Files (disk-backed) are
  retained for Reload; memory-backed sources reload from the registry copy
  (zero-copy view) or the URL.
- Downloads are back-pressured: no new download starts while more files are
  downloaded-but-not-converted than conversions can take next
  (`maxConcurrentConverts + 1`), so a long `?model=` list never piles every
  file into memory at once. A URL job whose conversion fails after its download
  reuses the File for its automatic retry instead of downloading again.
- Downloads build the `File` straight from the streamed chunks — no
  concatenated copy.
- Job history is pruned (at most 50 finished rows; removed rows after 10 min).
- Large-conversion workers are recycled; idle workers are reaped.
- Post-load enrichment that parses the IFC again (auto-validation) is deferred
  until the queue is idle, so a burst of loads does not stack WASM parses.

What remains (see §13): the registry keeps one `ArrayBuffer` per model for the
validator/IDS/export — the largest steady-state cost after the GPU.

## 7. Cache

OPFS (`opfs-cache.ts` / `cache-repository.ts`), layout `<key>.frag | .meta.json`
(the `.ifc` copy is no longer written — nothing read it, and it pushed other
models' fragments out of the budget), with:

- **Stable keys for fetched files.** `fetchIfcFromUrl` / `fetchDemoModel` set
  `lastModified` from `Last-Modified` (or 0), so repeat URL/demo loads hit.
- **Content check.** The meta stores the content fingerprint (§8); a key hit
  whose fingerprint differs is evicted and treated as a miss (same name, size
  and mtime but different bytes no longer serves stale geometry). It is
  compared **before** the `.frag` is read, so a stale entry costs no read.
- **Commit marker.** `.meta.json` is written last; a lookup needs a parseable
  meta *and* a non-empty `.frag` of the recorded size, otherwise the orphan
  files are deleted and it is a miss — unless they are younger than the orphan
  grace period (another tab may be writing them), which is a plain miss.
- **Self-healing.** A cached `.frag` that fails inside fragments' own load
  (decompress / parse / generate) is `cache-corrupt`: evicted, retried once
  with `skipCache`. A failure before fragments had the buffer (viewer not up)
  or after setup began never evicts a good entry.
- **LRU eviction** by `lastUsedAt` when the cache would exceed its budget
  (min(4 GB, 50 % of quota)).
- A hit reads the IFC bytes the registry needs from the user's `File` (or the
  download), never from a cached copy.

The key format (`v3:name:size:lastModified`) is unchanged on purpose — it also
keys saved georef placement and cached validation results.

## 8. Duplicates

`fingerprint = f1:<size>:<SHA-256(head 64 KB ‖ middle 64 KB ‖ tail 64 KB)>` —
about a millisecond per file. SDK bytes are already in memory and have no
modification time, so they get a full digest, `f2:<size>:<SHA-256 of every
byte>` (≤ 1 GB; without it they are not cached at all). The import dialog flags a file whose fingerprint
is already loaded or already in the queue ("already loaded — Open existing /
Load duplicate anyway"), and unchecks in-batch duplicates. Programmatic loads
(SDK, URL, demo) keep today's behaviour and are not prompted.

## 9. Errors and retry

`retry-policy.ts` classifies every failure into a `LoadErrorCode` and decides:

| Code | Automatic | Next attempt |
|---|---|---|
| `network`, `http` 5xx/429, `timeout` (download) | yes, backoff 1 s / 4 s / 10 s (Retry-After honoured) | same |
| `worker-crash` | once | fresh worker |
| `worker-init` | once, after 2 s | fresh worker |
| `out-of-memory` | once | exclusive, and the session drops to 1 convert |
| `cache-corrupt` (failure inside fragments' load of a cached buffer) | once | `skipCache` (entry evicted) |
| `scene` (setup failed after fragments had the model) | no (manual) | fresh attach, cache kept |
| `gpu` | no (manual) | fresh attach (`skipCache` only if it came from cache) |
| `viewer-unavailable` (viewer never came up) | no (manual) | — |
| `parse`, `invalid-file`, `unsupported` | no | manual Retry offered only for `parse` |
| `cancelled` | no | — |

Max 3 attempts per job; retries never loop. A failure is scoped to its job —
other jobs and loaded models are untouched. Analytics receive `code@phase`,
never the raw message (which may contain the file name).

## 10. Cancellation

| Phase | How |
|---|---|
| queued / held / waiting | removed from the lane queue |
| download | `AbortController` on the fetch |
| convert | `worker.terminate()`; pool respawns on demand |
| cache-write | finishes (it is fast and leaves a valid entry), then stops |
| attach | fragments `core.abort(modelId)` → `LoadAbortedError`; partial state disposed on both threads |
| setup / read | viewer compensates: pivot removed, model disposed, maps cleared |
| after commit | "cancel" becomes Remove (the normal removal path) |

`reset()` (landing / `ifcviewer:clear`) cancels everything and bumps a session
epoch that every commit checks, so an in-flight load can no longer repopulate
the stores after a reset.

## 11. Federation and multimodal

**Batches.** Files submitted together form a batch (a multi-file drop, a demo
set, `?model=a,b`). The import dialog proposes a name (common filename prefix,
discipline tokens stripped: `Hotel_Vela_ARC.ifc` + `Hotel_Vela_STR.ifc` →
"Hotel Vela"); where the app supplies a `createGroup` hook it can also
create a scene group so members fall into it as they land (the checkbox only
shows when the hook exists). Disciplines are inferred from filename tokens (`discipline.ts`: ARC /
ARQ / STR / EST / MEP / HVAC / ELE / PLU / FIRE / LAND / SITE …) for badges.

**Project → group → model** is the existing automatic grouping
(`model-grouping.ts`, `useModelGroups`); loading adds batch progress and per-member
status on top of it (ScenePanel "Loading" section, Loading Center batch
headers).

**Multimodal.** Every source is a job under one abstraction. IFC is *managed*
(the manager executes it through `ifc-source.ts`). Point clouds, meshes and GIS
context are *tracked* (`external-sources.ts`): their own runners keep executing
them (they own alignment, budgets and streaming), and the manager mirrors their
store status into jobs so the Loading Center shows everything that is loading,
with cancel wired to each runner's own cancel. Moving their executors into the
manager is the next step (§13).

## 12. Observability

- Structured dev logs on the `Load` channel:
  `[IFC-LOAD] job=j3 file=Hotel_Vela.ifc phase=geometry progress=72 classes=31/48 entities=182431 elapsed=18.2s`.
  Levels trace/debug/info/warn/error; production prints warn/error only; trace
  needs `localStorage['ifc:log-level']='trace'`.
- `performance.mark/measure` per phase in DEV (`ifc-load:<job>:<phase>`).
- Session metrics: submitted/loaded/failed/cancelled, retries, cache hits /
  misses, bytes converted, ms/MB per phase, worker spawns/recycles/crashes,
  peak heap — in the Loading Center's Advanced view with renderer stats (draw
  calls, triangles, geometries, textures).
- `globalThis.__ifcLoad` (DEV only): the manager, its snapshot and policy.

## 13. Next evolutions

- Registry holds `Blob` handles instead of `ArrayBuffer`s and consumers read on
  demand (one IFC copy per model off the heap).
- Point cloud and mesh executors as managed adapters (their global store
  epochs currently cancel sibling loads).
- Self-host the fragments worker (today fetched from unpkg at viewer start).
- Custom geometry loop over `StreamMeshes` for per-entity progress and
  cooperative cancel; spike multithreaded web-ifc in a classic worker.
- Freeze (`model.frozen`) hidden federated models to cut background view
  updates; per-model GPU accounting from tile geometry.

## 14. Technology evaluation

The browser technologies considered for loading large and federated models,
rated against what this app and its libraries (`@thatopen/fragments` 3.4.5,
`web-ifc` 0.0.77, three 0.184) allow. "Current state" is what shipped with this
system, not what was proposed.

| Technology | Current state | Potential benefit | Complexity | Browser support | Risk | Recommendation |
|---|---|---|---|---|---|---|
| **Web Workers** | All heavy work is off the main thread: IFC conversion, validator, export, IDS, geo, point cloud, BCF, GIF. fragments runs its own worker pool. | A responsive UI. `terminate()` is the only hard cancel for a synchronous WASM call. | Low | Universal | Nested module workers break Emscripten pthreads. | **Keep.** Terminate-and-respawn is the official convert cancel (§5, §10). |
| **Worker pools** | `IfcConvertPool`: spawns on demand, keeps 1 warm, recycles after a file ≥ 64 MB, reaps idle workers after 60 s. The convert lane admits **1** conversion at a time by default. fragments has its own pool (`maxWorkers` = cores − 3, min 2). | A warm worker skips the module and WASM load. Parallel conversions *would* help if they scaled. | Medium | Universal | Measured: concurrent web-ifc conversions are each slower (whole set 7.2 s → 16.0 s at 3, §4). Memory peaks add up. `hardwareConcurrency` is clamped on Safari and Firefox. | **Keep the pool; keep convert at 1.** Re-measure on other hardware with `ifc:load-max-converts`. fragments `threadGroups` (priority isolation) is unused so far. |
| **WASM multithreaded vs single-thread** | Single-thread forced (`forceSingleThread` patch in the parser worker). | The MT build could speed parsing and geometry. | High | MT needs `crossOriginIsolated` + SharedArrayBuffer (Chrome 68+, Firefox 79+, Safari 15.2+) | MT pthread sub-workers fail inside a nested module worker. MT pre-spawns `hardwareConcurrency` threads over a shared 4 GiB memory, and the page is not isolated on the first visit. ST has a 4 GiB heap ceiling (≈ 2.5–2.7 GB IFC aborts, engine_fragment#258). | **Keep ST.** MT is deferred to a spike in a classic, non-nested worker, measured before it is adopted (§13). The size ceiling is refused up front in `identify` (2 GB). |
| **SharedArrayBuffer** | Never required by the loading engine. `crossOriginIsolated` is probed and shown in the Advanced view. COOP/COEP come from `coi-serviceworker` (D-07). The parser copies a SAB-backed result into a plain, transferable buffer. | Zero-copy progress counters or cancel flags readable during a synchronous WASM loop. | Medium | Requires COOP/COEP; `credentialless` is Chromium-only | Not isolated before the service worker controls the page. `require-corp` blocks third-party assets. | **Opportunistic only.** Feature-detect, never require. |
| **Atomics** | Not used. | Poll a cancel flag inside a custom geometry loop, or `Atomics.wait` in workers. | Medium | Same as SAB | IfcImporter's synchronous loops poll nothing, so there is no benefit without a custom loop. | **Defer** until a custom `StreamMeshes` loop exists (§13). |
| **Transferable ArrayBuffers** | Fragments come back from the worker transferred, with no copy when the view spans its buffer. They are written to OPFS **then** transferred into the fragments worker (`loadFragments(ArrayBuffer)` detaches). SDK bytes are transferred host → iframe. | Zero-copy handoffs. | Low | Universal | A detached buffer reads as 0 bytes. | **Keep.** Ownership rules are codified in `ifc-source.ts`: the cache write completes before attach, and `saveCacheEntry` refuses 0-byte fragments. |
| **Posting `File` to workers** | **Adopted.** The pool posts the `File` handle and the worker reads it. The main thread never materialises the IFC during conversion. The registry copy is read once, at commit. | Main-heap peak during conversion drops from 2× to 0× the IFC. No synchronous whole-file copy. | Low | Universal (structured clone of `File`/`Blob`) | The worker still holds the whole file, because web-ifc needs it in its heap. | **Done.** Next: the registry keeps `Blob` handles instead of `ArrayBuffer`s (§13). |
| **Transferable streams** | Not used. | Pipe fetch → worker. | Low | **Not Safari** (DataCloneError) | Breaks on Safari. | **Avoid.** Download on the main thread with streamed progress, then post the resulting `File`. |
| **OffscreenCanvas** | Not used for the viewer. Used for image decoding in `geo-terrain`. | Rendering off the main thread. | Very high: OBC and fragments are main-thread three.js | Baseline 2023; WebGL in workers varies on Safari | Would fork the whole viewer. | **No** for the viewer. |
| **IndexedDB** | Not used for IFC (OPFS, D-03). The COPC point-cloud node cache uses it. | Small records and metadata. | Low | Universal | Slow for large binaries (one report: 100 MB write ≈ 850 ms vs ≈ 90 ms in OPFS). | **Metadata only.** |
| **OPFS** | The IFC cache: `.frag` + `.meta.json` with the meta as commit marker (the `.ifc` copy is no longer written), fingerprint check, and LRU within min(4 GB, 50 % of quota) (§7). Writes use `createWritable` on the main thread. | A fast cache for large binaries. The key reuse makes repeat URL/demo loads skip conversion. | Low–Medium | Broad. Sync access handles are dedicated-worker only. Disabled in Safari private mode | Quota eviction removes the whole origin at once. Safari evicts script-written storage after 7 days without interaction. | **Keep.** Worth adding: `navigator.storage.persist()` (not called today), and worker-side sync handles for very large writes. |
| **Web Streams / `Blob.stream()`** | The download reads `response.body.getReader()` for byte-accurate progress and honours `AbortSignal`. The header sniff and fingerprint read small `Blob.slice()`s. | Byte progress; incremental reads. | Low | `Blob.stream` baseline 2021; fine in workers | web-ifc still needs the whole file in its heap. | **Adopted** for downloads. Incremental hashing is unnecessary with a sampled fingerprint. |
| **Compression Streams** | Not used. `.frag` output is already deflated by fragments (pako, inside the library). | Native gzip/deflate for app-owned artifacts or transport. | Low | Baseline 2023; fine in workers | Cannot replace pako inside fragments. | **Optional**, for app-owned artifacts only. Nothing needs it today. |
| **Chunked processing** | Not used for IFC input: web-ifc `OpenModel` copies the whole file, and IfcImporter streams meshes per IFC class. Point clouds already read `File` slices chunk by chunk. | Lower JS-side memory. | Medium | n/a | Chunked input does **not** lower the WASM peak, because the tape still holds the whole file (#258). | **JS-side memory only.** Posting the `File` already removed the main-thread copy. |
| **Instanced rendering** | fragments dedupes geometry (samples and representations). GIS props use `InstancedMesh`. | Fewer draws and less memory for repeated elements. | — | Universal | — | **Already covered.** No loading work. |
| **Geometry batching** | fragments owns IFC mesh batching and tiles. | Fewer draw calls. | High | Universal | Costs GPU memory, and fragments owns the meshes. | **Leave to fragments.** Consider it for GIS/mesh sources only. |
| **BVH / spatial indexes** | fragments' worker bundles three-mesh-bvh for picking. The `index` phase builds the IFC *containment* tree (navigation), not a geometric index. | Culling, picking, priority by distance. | Medium | Universal | Would duplicate fragments. | **Reuse fragments** for IFC. A grid or quadtree only if GIS tile priority ever needs one. |
| **Frustum culling** | fragments culls and streams tiles from the camera it is given. | Visibility-driven priority. | Low | Universal | — | **Already covered.** Visibility-based *job* priority is not needed while conversion is serial and user-ordered. |
| **LOD** | fragments LOD (`LodMode`, `graphicsQuality`) runs at its defaults, and loading does not expose it. | A memory and frame budget on low-end devices. | Low | — | — | **Later:** expose it as a policy knob (a low-memory mode). It is not part of this rebuild. |
| **Progressive geometry** | IfcImporter emits one buffer at the end. The wait is shown honestly as `geometry → properties → relations → serialize`. After commit, fragments streams tiles (the `stream` background phase, `waitForModelIdle`). A cache hit is the fast path. | First pixels earlier. | Medium–High | — | Needs a custom geometry loop over `StreamMeshes`. | **Via cache + fragments streaming** today. The custom loop is in §13. |
| **GPU upload scheduling** | The attach lane runs main-thread setup and first uploads **one model at a time**. fragments budgets tile uploads itself. `renderer.compileAsync` is not used. | No frame hitches when several models land. | Medium | `KHR_parallel_shader_compile` widely supported | three.js uploads lazily on first render. | **Serial attach adopted.** Add a per-frame attach budget or `compileAsync` only if hitches are measured. |
| **Content hashing** | Files: `f1:<size>:<SHA-256 of head / middle / tail 64 KB>` via `crypto.subtle`, ≈ 1 ms per file, with an FNV-1a fallback without SubtleCrypto. SDK bytes are already in memory and have no mtime, so they get `f2:<size>:<SHA-256 of every byte>` (≤ 1 GB); without that digest they are not cached. Either is stored in the cache meta and drives stale-cache eviction and duplicate detection (§7, §8). | Dedupe; cache identity for URL/demo files whose key reuses `Last-Modified`, and for bytes keyed `name:size:0`. | Low–Medium | `crypto.subtle` in secure contexts only; no streaming digest | For files, a sample can miss a same-size edit confined to unsampled bytes under a frozen header timestamp. The worst case is a stale entry that Reload clears. | **Sampled for files, full for bytes.** A full incremental hash of files only if certification or dedupe ever needs byte identity. |

## 15. Testing

Everything below runs in Vitest, most of it under `// @vitest-environment node`,
against fakes. **No test runs real web-ifc/WASM, a real OPFS, a real fragments
viewer, a real browser or a real network.** Those are exercised only by runs in
the real app; see §16 for the measured ones.

| File | Cases | What it verifies | Harness |
|---|---|---|---|
| `src/lib/loading/load-manager.test.ts` | 61 | Single jobs. Convert concurrency with 2, 5 and 10 jobs, and memory admission. Priority, aging, hold/resume. **Anchor-first attach**, and the convert lane reserved for the anchor. Failures and retries: a crash retries once, OOM retries alone and lowers concurrency, network backoff gives up after 3 attempts. Cancel while queued, converting, waiting or in backoff; lanes taken back from an adapter that never unwinds. Late commits refused after a reset. Event order, 100 ms progress throttle, progress never decreasing, stall detection. `idle` counts managed jobs only, and the global fraction is per wave. Batches settle correctly after dismiss and reload. Held jobs do not age. **Downloads held back while conversion is backed up.** Retention of sources for Retry, and 50-row history. | Fake adapter/run; fake timers and clock |
| `src/lib/loading/scheduler.test.ts` | 23 | The pure lane decisions: aging (one level per 45 s), slots, exclusive jobs, memory admission, reserving the lane after 30 s, pressure levels. The network lane grants nothing while conversion is backed up. First-submitted anchor, only the anchor attaching into an empty scene, and anchor reservation of the convert lane. | Pure |
| `src/lib/loading/ifc-source.test.ts` | 52 | The IFC adapter through a **real `LoadManager`**:<br/>• **Phases:** every phase in order with real class counters; registration before `loaded`.<br/>• **Cache:** hit replanning, fingerprint-mismatch miss, `skipCache`, the buffer saved before it is transferred, a bad cached entry evicted and reconverted once. A hit whose viewer never started keeps its entry, and a setup failure does not condemn it.<br/>• **URLs:** progress, 404 not retried, 503 and network errors retried, fallback URL, an automatic retry reusing the downloaded file.<br/>• **Bytes:** identified by a **full SHA-256**; a same-size edit the sample cannot see is a miss; no digest → not cached.<br/>• **Cancel:** during convert, attach and before commit (model taken back out); reset refusing a commit.<br/>• **Retries and lanes:** worker-crash retry on a fresh worker; convert released before attach; late and missing viewer.<br/>• **Background phases:** the tree build and a conversion never overlap (convert lane), and the build has its own budget. Failures there are warnings.<br/>• **Read errors:** OOM vs `read-failed`.<br/>• **Reload** from registry bytes. | Fake pool, viewer, network and cache; fake timers |
| `src/lib/loading/ifc-convert-pool.test.ts` | 42 | Posting a `File` handle, never bytes. Warm reuse. Abort → `terminate()`. `worker-init` / `worker-crash` / `parse` classification. Recycling above the size limit, the idle reaper, `maxIdleWorkers`. Exact per-class counts recovered from the importer's progress floats. | `FakeWorker`; fake timers |
| `src/lib/loading/retry-policy.test.ts` | 15 | Error classification (abort, network, OOM, GPU, unknown). Backoff: 1 s then 4 s, stopping at attempt 3; the 10 s step is only reachable with `maxAttempts: 4`. `Retry-After` capped at 30 s. 5xx/429 retried, other 4xx not. Once-only remedies. `scene` retried only when the attach came from the cache. Content errors and cancels never auto-retried. Manual retry rules. | Pure |
| `src/lib/loading/resource-policy.test.ts` | 13 | Environment probing (including hostile getters), one conversion by default, budget capped at 3.2 GB, peak ≈ size × 5 + 100 MB, heap pressure levels, sticky OOM, overrides. | Stubbed probes |
| `src/lib/loading/phases.test.ts` | 20 | Plan weights for miss, hit and URL. Aggregation excluding background and skipped phases. ETA gates: download ≥ 5 % and 1 s; other phases ≥ 15 %, 3 s and calibrated. The legacy SDK phase mapping. | Pure |
| `src/lib/loading/external-sources.test.ts` | 19 | Point cloud, mesh and GIS store status mirrored into tracked jobs (progress, error, cancel, removal, late start), `onCancel` wiring, GIS rows background-only and not cancellable. | Real zustand stores and i18n; fake and real manager |
| `src/lib/loading/viewer-abort.test.ts` | 18 | AbortError shape, recognising fragments' abort string, fraction clamping, restoring the active model after a discard, and `pollModelIdle` (two idle polls 100 ms apart, timeout). | Fake timers |
| `src/lib/loading/drop-routing.test.ts` | 13 | Mixed drops routed per subsystem, with arrival order kept (the anchor rule). Images count as textures only beside a mesh. `.xml` is not IDS. Drag-over sniffing. Extension lists match the importers. | Plain objects |
| `src/lib/loading/discipline.test.ts` | 8 | Discipline tokens (camelCase, accents, other languages, ISO 19650 role letters) and batch-name inference. | Pure |
| `src/lib/loading/fingerprint.test.ts` | 6 | `f1:<size>:<hex>` shape, equality and difference, Blob vs bytes parity, FNV fallback. | Pure |
| `src/lib/loading/load-log.test.ts` | 10 | `[IFC-LOAD]` line format, trace gated by `ifc:log-level`, a throwing `localStorage`, perf-mark cleanup. | Stubs |
| `src/lib/loading/metrics.test.ts` · `model-id.test.ts` | 7 · 4 | ms/MB running means, counters, peak heap. Model id shape, uniqueness within a millisecond, monotonic even if the clock goes back. | Pure |
| `src/components/loading/job-view.test.ts` | 45 | The pure view model: phase lines, wait-reason sentences, display order, stats, formatting, ETA display, indicator model, first-load focus, checklist. It never shows 100 % before commit. | Pure |
| `src/components/loading/loading-ui.test.ts` | 20 | Mounts `LoadingIndicator`, `LoadingCenter`, `FirstLoadCard` and `SceneLoadingSection`.<br/>• **Indicator:** activity rather than a %, while nothing measures; "All models loaded" only after a model actually landed; failures announced; the floating and mobile variants.<br/>• **Center:** real phase lines, Escape without reaching panels, confirming cancel-all and cache clear with focus moved and announced, Retry on a cancelled row, no "0 %", closing on a press outside.<br/>• **First-load card:** batch-led titles.<br/>• **Hand-over:** an upload does not open the Center. | **jsdom**, real stores and i18n, stub controller |
| `src/components/loading/useNow.test.ts` | 4 | One shared ticker per interval, cleared with its last subscriber, safe to unsubscribe during a tick. | Fake timers |
| `src/locales/loading-parity.test.ts` | 8 | `loading` namespace key parity across the 10 locales (plural-aware for ja/th/zh), the same interpolation params, no empty strings, a label for every engine enum, short discipline badges. | Reads JSON |
| `src/locales/toasts-loading-parity.test.ts` | 10 | The 5 loading toast keys exist with the English params in every locale. | Reads JSON |
| `src/lib/opfs-cache.test.ts` | 43 | Commit order (`.frag` → `.ifc` → meta). Cleanup after a quota error; no 0-byte leftovers. Orphans and their grace period, and another tab's write in progress left alone. LRU eviction within half the quota. Fingerprint checks through `cacheRepo`. | In-memory OPFS mock with swap-file writes and injected failures |
| `src/lib/fetch-ifc-url.test.ts` | 13 | `Last-Modified` → `lastModified` (0 when missing), building the `File` from streamed chunks, rejecting an empty body, abort pass-through, the demo fallback. | Stubbed `fetch` / `File` |
| `src/workers/ifc-parser.worker.test.ts` | 23 | `invalid-file`, `read-failed` and OOM before the importer is built. A posted `File` read inside the worker (`reading` stage first); the legacy transferred-buffer path. Stage order, ProgressData passthrough, a result with no copy, the throttle gate. OOM vs `worker-init` vs `parse` classification. | jsdom; `web-ifc` and fragments **mocked** |
| `src/lib/upload.utils.test.ts` | 46 | Header and schema checks, fingerprint and duplicate lookup, the single-small-file fast path, batch naming, the import-dialog reducer. | jsdom (real `File` slices) |

At the time of writing these 24 files hold **523 cases, all passing** (`npx vitest run src/lib/loading src/components/loading …`, about 10 s). Two things are not in the table:
- `src/lib/loader.test.ts` (19 cases) predates this system. Only its
  `buildCacheKey` and legacy OPFS cases exercise real code; the rest re-implement
  the old loader inside the test.
- There is no test of `controller.ts` itself, nor of the `useIfcLoader` hook.

## 16. Measured results

Measured 2026-09-24 in Chromium (12 cores, 16 GB), Vite dev build, on the
Hotel Vela demo set (ARC 5.2 MB + STR 1.4 MB + MEP 0.2 MB, loaded from the
demo gallery). "Before" is `origin/main` at the time (the single-flight
loader) served side by side; each cold run starts from an empty OPFS cache on a
freshly loaded page; three alternating rounds, medians shown.

| Scenario | Before | After |
|---|---|---|
| Cold — first model on screen | 3.53 s | 3.39 s |
| Cold — whole federation on screen | 6.01 s | **4.21 s** (−30 %) |
| Repeat load — first model | 3.31 s (cache never hit) | **0.70 s** |
| Repeat load — whole federation | 5.64 s (cache never hit) | **1.39 s** (4.0×) |
| Cache hits on the repeat load | 0 / 3 | 3 / 3 |
| Main-thread timer lag while loading (mean / max) | 5–8 ms / 74–115 ms | 5–6 ms / 76–123 ms |

Why: the whole-set gain comes from overlapping lanes (the next file downloads
and converts while the previous one attaches) with conversions kept strictly
one at a time (the concurrency table in §4 shows why parallel conversion is
slower); the first model is no longer delayed because the convert lane is
reserved for the anchor. The repeat-load gain is the stable cache key for
fetched files — the old key embedded "now" and never matched. The timer-lag
probe (a 50 ms interval measuring how late it fires) shows the Loading Center,
the store mirror and the per-phase events add no main-thread blocking.

Behaviour verified in the running app (same session):
- Cancel in the middle of `geometry` on the 90 MB Shanghai Tower: the job
  settles `cancelled`, the conversion worker is terminated
  (`workers: 0`), the model registry is unchanged, Retry is offered.
- A ≥ 64 MB conversion recycles its worker afterwards (`recycled: 1`,
  `workers: 0`), returning the WASM heap high-water mark.
- Dropping the three Hotel Vela files onto a scene that already holds them:
  the review dialog marks all three "Already loaded", unchecked, with
  "Open existing".
- The empty-scene card shows the real per-class counter
  ("Geometry · 3 / 18 classes · IFCDOOR") and "waiting for …-A-0002.ifc
  (coordinate base)" for the members that converted ahead of the anchor.
- `?validate` validates all three models once the queue is idle (Health
  Score 93 across the set).
