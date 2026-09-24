# Architectural Decision Log

Each entry documents a concrete technical choice made in this codebase. Entries are ordered roughly by when the decision was made.

---

## D-01 · @thatopen/components over raw web-ifc + Three.js

**Sprint:** 1

**Decision:** Use `@thatopen/components` v3 (and `@thatopen/fragments` v3) as the IFC rendering and model management layer instead of importing `web-ifc` directly and managing Three.js manually.

**Alternatives considered:**
- `web-ifc-three` (discontinued, last updated 2023)
- Raw `web-ifc` + manual Three.js geometry construction
- `xeokit-sdk` (mature but WebGL 1 only, separate scene graph)
- `ifcjs` (older name for the same @thatopen ecosystem)

**Reason:** @thatopen v3 provides: geometry batching via `FragmentsModel`, async raycasting, per-element highlight/color/opacity, bounding-box queries, camera-controls (`camera-controls` package wrapped as `OBC.SimpleCamera`), and an internal worker for geometry processing — all of which would take weeks to implement from scratch. The `FragmentsModel` binary format is key: it enables the OPFS cache (D-03) because the expensive WASM parsing can be done once and the geometry stored as a compact binary.

**Consequences:**
- Locked to `@thatopen/fragments` binary format for caching. Format is specific to the installed version; upgrading minor versions may break cached data (mitigated: cache key includes `lastModified`, so users re-download when the file changes, but not when the library upgrades — needs a version prefix in the cache key in future).
- Cannot use WebGPU with `OBC.SimpleRenderer` without writing a custom renderer class that satisfies `BaseRenderer`. (Deferred to Sprint 10.)
- `@thatopen/*` must be excluded from Vite's pre-bundling (`optimizeDeps.exclude`) because its WASM-loading code breaks when Vite inlines it.

---

## D-02 · Web Worker for IFC parsing (IfcImporter, not OBC.IfcLoader)

**Sprint:** 2

**Decision:** Run IFC parsing inside a dedicated Web Worker (`src/workers/ifc-parser.worker.ts`) using `@thatopen/fragments` `IfcImporter.process()` directly, rather than using `OBC.IfcLoader` on the main thread.

**Alternatives considered:**
- `OBC.IfcLoader` on the main thread (previous Sprint 1 approach — blocks UI)
- `OBC.IfcLoader` inside a worker (rejected: `OBC.Components` expects DOM/requestAnimationFrame; instantiating a world without a renderer is possible but fragile)
- Streaming parse with incremental `requestIdleCallback` chunks (does not prevent GC pressure from a 200 MB buffer)

**Reason:** `IfcImporter` is a pure IFC→fragments converter with no DOM dependencies. It takes `Uint8Array` bytes and returns `Uint8Array` (fragments binary) with a `progressCallback`. This makes it the cleanest option for a worker: zero DOM coupling, real progress events, and the output (fragments binary) is exactly what the cache stores. The main thread only receives the binary result and hands it to `fragmentsManager.core.load()`.

**Consequences:**
- Parse time is isolated from main thread; UI stays responsive during parse.
- WASM is loaded locally via the `copyWebIfcWasm` Vite plugin (copies `web-ifc.wasm` / `web-ifc-mt.wasm` to `dist/`). `import.meta.env.BASE_URL` points to the correct path in production.
- `ArrayBuffer` is *transferred* to the worker (zero-copy). The `file.arrayBuffer()` call on the main thread renders the buffer detached after transfer; the original `File` object remains accessible.
- `forceSingleThread: true` is passed to `IfcAPI.Init` to prevent Emscripten from spawning pthread sub-workers (which would fail inside a nested ES module worker context).

> **Superseded in part by D-29 (2026-09).** Parsing still runs in `ifc-parser.worker.ts` with `IfcImporter` and `forceSingleThread`. What changed: there is no single reused worker any more. `IfcConvertPool` (`src/lib/loading/ifc-convert-pool.ts`) spawns workers on demand, and the `LoadManager` convert lane decides how many run (one by default, by measurement). The main thread no longer reads the file and transfers an `ArrayBuffer`: it posts the `File` handle and the worker reads the bytes itself. Cancel is `worker.terminate()`. Progress is IfcImporter's per-class `ProgressData`, mapped to the `geometry` / `properties` / `relations` / `serialize` phases instead of a percentage. See `docs/MODEL_LOADING.md` §5.

---

## D-03 · OPFS over IndexedDB for model cache

**Sprint:** 2

**Decision:** Store fragments binaries in the Origin Private File System (`navigator.storage.getDirectory()`) rather than IndexedDB.

**Alternatives considered:**
- `IndexedDB` with a Blob value (common approach; works everywhere)
- `Cache API` (designed for network responses; awkward for arbitrary binary data)
- `localStorage` (5 MB limit; not viable)
- No cache (parse every time)

**Reason:** OPFS gives direct file handle access (`FileSystemFileHandle.createWritable()`), which is faster than IndexedDB for large binary blobs because there is no serialisation/deserialisation overhead. For 200 MB+ fragment binaries, IndexedDB read latency is measurably higher. OPFS also offers synchronous access handles (`createSyncAccessHandle`), but only inside dedicated workers, not shared workers or the main thread. The app does not use them yet.

**Consequences:**
- OPFS is not available in all environments (e.g., some private browsing modes, older Safari). The cache silently no-ops. A `opfsAvailable` boolean is exposed by `useIfcLoader`.
- OPFS is origin-scoped. Models cached in development (`localhost:3000`) are not accessible in production (different origin).
- Both `.frag` (fragments binary) and `.ifc` (original IFC bytes) are stored per cache key. The IFC bytes are needed for validation and future IFC export.

> **Superseded in part by D-29 (2026-09).** The last consequence no longer holds: the loading engine stores only `.frag` + `.meta.json`. The IFC bytes that validation, IDS and export use come from the user's `File`, the download or the SDK bytes, read once at commit into `modelRegistry`. No code path read the cached `.ifc` back. Writing it delayed every attach by a full-file write and counted against the cache budget, evicting other models' fragments. A rewrite now also removes a stale `.ifc` left by an older build.
>
> An entry also proves itself before it counts as a hit. `.meta.json` is written last, as the commit marker. A lookup needs a parseable meta and a non-empty `.frag` of the recorded size, plus a matching content fingerprint when one is stored. Least-recently-used entries are evicted when the cache would exceed min(4 GB, 50 % of the quota). See `docs/MODEL_LOADING.md` §7.

---

## D-04 · Cache key = name + size + lastModified (no hash)

**Sprint:** 2

**Decision:** The OPFS cache key is `"${file.name}:${file.size}:${file.lastModified}"` computed synchronously, without reading the file's bytes.

**Alternatives considered:**
- SHA-256 hash of file contents (content-addressable; immune to name collisions)
- `file.name` only (collides on different versions of same-named file)
- UUID generated per session (no persistence benefit)

**Reason:** Hashing a 200 MB file on the main thread takes 100–400 ms — a perceptible delay before the progress bar even starts. `lastModified` changes whenever the file is saved by the BIM tool. Name + size + lastModified has no practical collision risk for the use case.

**Consequences:**
- If the user touches a file (identical bytes, changed `lastModified`), the cache misses unnecessarily and re-parses. Acceptable — always produces a correct result.
- Cache key is stored in `.meta.json`. Upgrading the cache format requires a migration or cache invalidation.

> ⚠️ NOTE: The cache key should eventually include the `@thatopen/fragments` version (e.g., `v3.4.3`) so that a library upgrade automatically invalidates stale binaries. Not implemented yet. The key does carry a manual format prefix, `CACHE_VERSION` in `opfs-cache.ts`: `v2` since Sprint 5, and `v3` since the converter stopped applying `COORDINATE_TO_ORIGIN`. The prefix has to be bumped by hand whenever converter settings change what a `.frag` contains.

> **Superseded in part by D-29 (2026-09).** The key is unchanged on purpose: `v3:${name}:${size}:${lastModified}` still names the cache entry, saved georef placement and cached validation results. Two things were added around it:
> - **Stable keys for fetched files.** A `File` built from a download used to get `lastModified = now`, so URL, demo and `?model=` loads never hit the cache and wrote a new entry every time. `fetchIfcFromUrl` / `fetchDemoModel` now take `lastModified` from the `Last-Modified` header, or 0 when there is none. Measured on the Hotel Vela set: 3/3 hits, 2.4 s instead of 10.5 s cold.
> - **A content fingerprint.** The alternative rejected above is partly back, in a cheap form. `f1:<size>:<SHA-256 of three 64 KB samples (head, middle, tail)>` takes about a millisecond per file and never reads the whole file. It is stored in the entry's meta: a key hit whose fingerprint differs is stale, so it is evicted and treated as a miss. The same fingerprint drives duplicate detection in the import dialog.
> - **A full hash for SDK bytes.** Bytes have no mtime, so their key is `name:size:0`, and only the content tells two versions apart. A same-size in-place edit can sit where the samples never look. The whole buffer is already in memory, so bytes sources get `f2:<size>:<SHA-256 of every byte>`, and only that hash vouches for their entry. Without a digest (an insecure context, or over 1 GB) bytes are not cached, and the load gets a key of its own so no cached validation or placement is reused.

---

## D-05 · Zustand for cross-component state (introduced Sprint 3)

**Sprint:** 1 (deferred) → **3 (implemented)**

**Original decision (Sprint 1–2):** All application state lives as `useState` in `App.tsx`. No Zustand, Redux, Jotai, or Context.

**Sprint 3 update:** Zustand was added as predicted. Five stores are now active: `modelStore`, `validationStore`, `editorStore`, `uiStore`, `toastStore`. The validation engine produces results consumed by three UI areas simultaneously (spatial tree, validation panel, toolbar badge) — prop-drilling was no longer viable.

**Sprint 5 update:** `sceneStore` added as 6th store (multi-model foundation). `takeoffStore` added as 7th store (Sprint 5).

**Constraint (still applies):** Zustand stores must not hold Three.js objects (non-serialisable). Store references by ID only; let `viewer.ts` manage geometry.

---

## D-06 · Transferable ArrayBuffer (zero-copy) to parse worker

**Sprint:** 2

**Decision:** Pass the raw IFC file buffer to `ifc-parser.worker.ts` using the `Transferable` mechanism (`postMessage(msg, [buffer])`), not by copying.

**Alternatives considered:**
- `SharedArrayBuffer` (requires `Atomics`; overkill for a one-shot transfer)
- Structured clone (default `postMessage` behaviour; copies the entire buffer — up to 200 MB)
- Reading the file inside the worker (workers cannot access `File` objects directly without transfer)

**Reason:** Transferring a 200 MB `ArrayBuffer` takes < 1 ms (ownership transfer, no copy). Cloning it takes ~200 ms and doubles peak memory usage.

**Consequences:**
- The `ArrayBuffer` becomes **detached** on the main thread after transfer. A copy is made before transfer so the IFC bytes are retained for validation and export.
- The validator worker receives its own copy (`ifcBuffer.slice(0)`), so the original is never detached.

> **Superseded in part by D-29 (2026-09).** The IFC is no longer transferred to the parser at all. The third alternative above was rejected on a wrong premise: a `File` *can* be posted to a worker. Structured clone passes a handle, not the bytes, and the worker reads it with `file.arrayBuffer()`. The pool does exactly that now. It removes the synchronous whole-file copy on the main thread (the `slice(0)` before transfer), and the main-heap cost during conversion drops from 2× the IFC to 0×. The bytes the registry keeps for validation, IDS and export are read once, asynchronously, at commit (the `read` phase). Transfer still matters on the way back and on to the scene. The worker transfers the fragments buffer back, without a copy when the view spans its buffer. The engine writes it to OPFS first and then **transfers** it into the fragments worker (`loadFragments(ArrayBuffer)` detaches it), instead of structured-cloning a `Uint8Array`. The validator's `slice(0)` copy is unchanged.

---

## D-07 · COOP/COEP headers always enabled

**Sprint:** 1 (vite.config.ts) + production via coi-serviceworker

**Decision:** `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` are set in the Vite dev server headers and in production via `coi-serviceworker.js`.

**Alternatives considered:**
- Only enable for routes that need `SharedArrayBuffer`
- Ship without cross-origin isolation and lose `performance.measureUserAgentSpecificMemory()`

**Reason:** `@thatopen/fragments` uses a worker that requires `SharedArrayBuffer`. `performance.measureUserAgentSpecificMemory()` also requires `crossOriginIsolated`. GitHub Pages does not support custom HTTP headers, so `coi-serviceworker.js` is registered in `index.html` to inject them at the service worker level.

**Consequences:**
- Any future embedded content must serve `Cross-Origin-Resource-Policy: cross-origin`.
- WASM files must be served from the same origin (satisfied by the `copyWebIfcWasm` plugin).

---

## D-08 · loadFragments() as primary load path (not loadIfc())

**Sprint:** 2

**Decision:** After Sprint 2, all loads go through `viewer.loadFragments()` (fragments binary → scene). `viewer.loadIfc()` exists but is not called from `App.tsx`.

**Reason:** Both cache-hit and cache-miss paths produce the same artifact (fragments binary). Having a single GPU-upload entry point keeps `viewer.ts` simpler and ensures cache-hit behaviour is identical to cache-miss behaviour.

**Consequences:**
- The model setup code (`setupLoadedModel`, colour application, camera fit) runs identically on both paths.
- `loadIfc()` is dead code in the current app flow. If reactivated, verify that `setupLoadedModel` is still called.

> **Superseded in part by D-29 (2026-09).** `loadFragments()` is still the only way into the scene, but App no longer calls it: only the loading system's IFC adapter does. The signature grew an options object: `loadFragments(buffer, fileName, fileSize?, onProgress?, options?: { modelId, signal, onStage, frame })`.
> - The loading manager mints the `modelId` before the job starts (same `${fileName}-${13 digits}` shape, strictly increasing per page). The viewer only mints one for direct callers, such as the blog embed.
> - `signal` cancels the load. It uses fragments' `core.abort(modelId)` while the worker holds the model, and a full undo after that.
> - `onStage` reports fragments' real `decompressing` / `parsing` / `generating` stages (with the real 0..1 fraction of `generating`), then `setup`.
> - `frame: false` lets federated members land without moving the camera.
> - An `ArrayBuffer` is transferred into the fragments worker and a `Uint8Array` is copied.
> - Any rejection leaves the scene exactly as it was.
>
> New companions on `ViewerAPI`: `hasModel`, `waitForModelIdle` (for the background `stream` phase) and `getRenderStats`.

---

## D-09 · WebGPU: detect and plan, not yet implement

**Sprint:** 2 (deferred) → Sprint 10 (planned)

**Decision:** WebGPU support is planned but not implemented. `navigator.gpu` detection is documented; `three/webgpu` is available in the installed `three` version (r184+); but no WebGPU renderer is wired up.

**Reason:** Integrating WebGPU with `OBC.SimpleRenderer` requires subclassing or replacing it with a custom renderer that satisfies OBC's `BaseRenderer` interface. This is a non-trivial change belonging in a dedicated sprint.

**Consequences:**
- `getGpuEstimateBytes()` uses WebGL renderer info and is not GPU-API-specific.
- When implemented, `createViewer()` should accept a renderer factory parameter.

---

## D-10 · Validator runs in a second dedicated worker (not the parser worker)

**Sprint:** 3

**Decision:** IFC validation runs in `src/workers/validator.worker.ts`, a separate worker from `ifc-parser.worker.ts`. It receives a **copy** of the IFC buffer (not transferred) so the original is preserved.

**Alternatives considered:**
- Reusing the parser worker for validation (rejected: the parser worker is tied to the `IfcImporter` API; the validator needs `IfcAPI` directly for property sets and relationships)
- Running validation on the main thread (rejected: `IfcAPI` WASM operations block the thread; large models take several seconds)
- Sharing one worker that does both (rejected: would create ordering dependencies and make the worker protocol more complex)

**Reason:** `IfcImporter` converts IFC → fragments; `IfcAPI` provides direct entity/relationship access needed for validation rules. These are separate use cases with separate lifetimes. A dedicated validator worker can be terminated and recreated on WASM errors without affecting the parse worker.

**Consequences:**
- Two WASM instances may be active simultaneously (one in each worker). Memory cost is ~60–80 MB each. Acceptable on desktop; may be tight on mobile.
- The buffer copy (`ifcBuffer.slice(0)`) before postMessage preserves the original for export.
- The validator worker is a singleton managed by `validator.ts`; it is recreated after fatal errors (e.g., WASM SIGABRT). *(Since then it grew into a two-slot pool, `_pool` in `validator.ts`. Slot 0 runs half the rules plus the spatial tree, slot 1 the other half. A slot that errors is respawned on the next call.)*

> **Superseded in part by D-29 (2026-09).** "Two WASM instances" is now "as many as the scheduler admits, plus the enrichment workers".
> - Conversions go through the loading manager's convert lane. It runs one conversion at a time by default, because concurrent web-ifc conversions were measured to be slower each. The lane is memory-admitted, and large files run alone.
> - The validator pool, IDS and geo-extract each still bring their own instance.
> - The spatial-tree build (the `index` phase, a full web-ifc parse in the validator worker) takes a **convert-lane slot at background priority**, so it never runs beside a conversion and waits behind every model not yet on screen.
> - To keep a federated drop from stacking parses, post-load auto-validation (`?validate`) and georef extraction are deferred until the load queue is idle (`summary.managedActive === 0` / `load:idle`), and then run one model at a time.
> - Conversion workers that handled a file ≥ 64 MB are terminated after the job (Emscripten heaps never shrink). Idle ones are reaped after 60 s.

---

## D-11 · Worker rollupOptions must not externalize bare specifiers

**Sprint:** 3 (production bug fix — 2026-05-09)

**Decision:** The `worker` section of `vite.config.ts` must not include `rollupOptions: { external: [...] }` with bare module specifiers like `'three'`.

**Background:** The previous config had `rollupOptions: { external: ['three'] }` in the worker build. This told Rollup not to bundle `three` into the worker chunk. The built worker JS contained `import { ... } from 'three'` — a bare specifier that browsers cannot resolve in a Web Worker context (no `node_modules`, no import map for `three` in the worker). The worker failed silently on GitHub Pages; the error event fired with `message: undefined`.

**Why it worked in dev:** Vite's dev server resolves all imports through its own middleware, including inside workers. In production the worker is a self-contained Rollup bundle where external dependencies must be resolvable by the browser.

**Fix:** Removed `rollupOptions: { external: ['three'] }` from the `worker` config. Rollup now bundles `three` inline into the worker chunk.

**Consequences:**
- The worker bundle is larger (~4.2 MB uncompressed). Acceptable because the worker is loaded once and cached by the browser HTTP cache.
- Any future addition of `external` to worker rollupOptions must be limited to modules that are genuinely importable in a browser worker context (e.g., via an import map that covers the worker scope).

---

## D-12 · Result<T,E> monad at all I/O boundaries

**Sprint:** 3

**Decision:** All OPFS operations, cache reads/writes, and worker orchestration functions return `Result<T, AppError>` rather than throwing or returning `T | null`.

**Alternatives considered:**
- Throwing exceptions (implicit control flow; callers must know what can throw)
- Returning `T | null` / `T | undefined` (loses the error reason)
- `try/catch` everywhere at call sites (repetitive; no shared error type)

**Reason:** OPFS operations fail silently in private browsing. Worker errors arrive asynchronously. Having a single `Result<T,E>` type forces callers to handle both paths at compile time, making failure modes explicit without exceptions polluting the call stack.

**Consequences:**
- `unwrapOr(result, fallback)` is the idiomatic way to consume a `Result` when a default is acceptable.
- `CacheRepository` class wraps all OPFS I/O and always returns `Result`. Raw OPFS calls must not appear outside `opfs-cache.ts`.
- Worker message handlers validate payloads through type guards before passing to Zustand — a failed guard produces a typed `Result<never, AppError>`.

---

## D-13 · TypedEventBus (appBus) for cross-module communication

**Sprint:** 3

**Decision:** A typed singleton event bus (`appBus` in `src/lib/event-bus.ts`) replaces prop callbacks and direct store reads for cross-module lifecycle events. `AppEventMap` defines every event name and its payload type.

**Alternatives considered:**
- Custom React Context with callback props (only works inside the React tree; validator.ts and loader.ts are plain modules)
- Direct Zustand store subscriptions at module level (couples the emitter to the consumer's store shape)
- Native `EventTarget` / `CustomEvent` (untyped; no compile-time payload guarantee)

**Reason:** `loader.ts`, `validator.ts`, and `editorStore.ts` all need to signal lifecycle events (load complete, validation started/done, command applied) to arbitrary consumers including UI components and other services. A typed bus decouples emitters from consumers at compile time while keeping runtime wiring minimal.

**Consequences:**
- `useAppEvent(eventName, handler)` is the React-side bridge — subscribes on mount, unsubscribes on unmount.
- Every event name and payload is declared in `AppEventMap` in `src/lib/event-bus.ts` (it lived in `src/types/index.ts` in Sprint 3). Adding an event requires updating that map first.
- Avoid using the bus for data that belongs in a Zustand store (synchronous UI state). The bus is for fire-and-forget lifecycle signals.
- *(D-29, 2026-09)* The loading manager bridges its own event stream onto the bus as `load:queued / started / phase / progress / completed / failed / cancelled / batch-settled / idle`, each carrying `{ jobId, kind, fileName, batchId, requestId }`, plus `model:removed { modelId }`. `model:loaded { modelInfo, fromCache, cacheKey, modelId }` keeps its payload and its timing: after `modelRegistry` and `modelStore` hold the model, before `sceneStore` does. The loading UI does not listen to these events. It reads the throttled `loadingStore` snapshot.

---

## D-14 · Repository pattern for OPFS cache

**Sprint:** 3

**Decision:** All OPFS I/O is mediated through a `CacheRepository` class instance (`cacheRepo`) exported from `src/lib/cache-repository.ts`, which wraps the raw functions in `src/lib/opfs-cache.ts`. Direct `navigator.storage.getDirectory()` calls must not appear outside `opfs-cache.ts`.

**Alternatives considered:**
- Plain functions (`loadFromCache`, `saveToCache`, etc.) — the Sprint 2 approach; harder to mock and harder to swap out the storage backend
- IndexedDB adapter behind the same interface (kept as a future option)

**Reason:** Wrapping OPFS in a repository makes `Result<T,E>` returns consistent (the repository constructor can return early if OPFS is unavailable), and makes the storage layer testable without a real browser.

**Consequences:**
- `cacheRepo` is created once at module scope in `cache-repository.ts`.
- The public surface, all returning `Result<T, Error>`:
  - entry-level API used by the loading engine: `findEntry(key, fingerprint)`, `saveEntry(key, { fragments, ifc, meta })`, `touch`, `evictForSpace`, `getBudget`, `isAvailable`;
  - management: `listEntries`, `deleteEntry`, `deleteEntries`, `getStorageInfo`;
  - legacy per-file calls: `findFragments` / `saveFragments` / `findIfcBuffer` / `saveIfcBuffer`.

> **Updated by D-29 (2026-09).** The cache's main consumer is the IFC source adapter, through `cacheRepoAdapter()` in `src/lib/loading/ifc-source.ts`, not `loader.ts`. That adapter unwraps every `Result` into "a failure is a miss or a skipped write", because no cache problem is ever a reason to fail a load. `useIfcLoader` only lists and deletes entries for the cache readout.

---

## D-15 · Branded / nominal types (Brand<T,B>)

**Sprint:** 3

**Decision:** Stable identifiers are wrapped in branded types: `ExpressId` (number), `GlobalId` (string), `CacheKey` (string), `IfcModelId` (number). TypeScript structural typing would otherwise allow any `number` where an `ExpressId` is expected.

**Alternatives considered:**
- Plain `number` / `string` aliases (no type safety at call sites)
- Opaque class wrappers (runtime overhead; verbose construction)
- Zod schemas (runtime parsing — overkill for internal invariants)

**Reason:** Prevents the class of bug where an Express ID (reassigned on every re-export) is accidentally stored as the stable edit key. The compiler rejects the assignment; the developer must explicitly cast.

**Consequences:**
- `brand.ts` exports `Brand<T,B>` and cast helpers (`asExpressId`, `asGlobalId`, etc.).
- Only the layer that first obtains the value from the IFC API should cast to a branded type. All downstream code uses the branded type directly.

---

## D-16 · Auto spatial tree build on model load (separate from validation)

**Sprint:** 3

**Decision:** `buildSpatialTree()` is called fire-and-forget from `loader.ts` after every successful model load. It sends a `build-tree` message to `validator.worker.ts` and populates `validationStore.spatialTree` without running any validation rules.

**Alternatives considered:**
- Build the tree only when the user opens the tree panel (lazy) — causes a visible delay the first time the panel opens
- Build the tree as part of `runValidation()` — couples two independent workflows; tree unavailable until the user explicitly runs validation
- Build the tree in the parser worker — the parser worker uses `IfcImporter`, not `IfcAPI`; relationship traversal requires `IfcAPI`

**Reason:** The spatial tree is navigational UI — users expect it immediately after loading. Tying it to validation made the tree appear to be a validation output rather than a model structure view, which confused users.

**Consequences:**
- `validator.worker.ts` handles two message types: `validate` (rules + tree) and `build-tree` (tree only). The `build-tree` path skips all rule functions.
- `buildSpatialTree()` in `validator.ts` defers if validation is already running; retries via `appBus.once('validation:complete')`.
- The tree is rebuilt on every new model load. It is not persisted in OPFS.

> **Superseded in part by D-29 (2026-09).** The tree is still built automatically for every model, but not from `loader.ts`. It is the `index` phase of the model's load job. It is a background phase: it runs after the commit (the model is already interactive) and after the model's first view has streamed to the GPU (`stream`, bounded by a 30 s timeout).
> - **The build queues for a convert-lane slot at background priority**, because it is another full web-ifc parse. A tree build and a conversion never overlap, and models still loading go first.
> - **It has a size-scaled budget**, max(120 s, 60 s + 1 s/MB), that starts when the slot is granted.
> - **A failure or timeout is a warning** on the phase, not a failed load.
>
> The Loading Center shows the job as "finishing" while it runs. The deferral behind a running validation is unchanged.

---

## D-17 · Per-model pivot groups (not a single shared pivot)

**Sprint:** 6a

**Decision:** Each loaded model gets its own `THREE.Group` stored in `modelPivots: Map<string, THREE.Group>` (keyed by sceneModel ID). Sprint 5 used a single `modelPivot` group shared by all models.

**Alternatives considered:**
- Reuse the single pivot (rejected: transforms bleed across models when a user moves model A while model B is "active")
- Use the model's own `model.object` group (rejected: modifying OBC's internal object breaks geometry batching and highlight state)

**Reason:** With multi-model support, transforms are per-model by definition. A single shared pivot meant that whatever model happened to be the last "active" one in the viewer would receive all transform mutations. Per-model pivots also allow `frameActiveModel()`, `isolateModel()`, and `getModelBounds(id)` to operate independently.

**Consequences:**
- `setModelTransform(transform, modelId?)` must look up the correct pivot by modelId. Callers that omit `modelId` fall back to the current active model's pivot.
- `frameAllModels()` computes the union bounding box of all pivot-transformed AABB values.

---

## D-18 · modelRegistry as authority for IFC buffers (replaces modelStore.ifcBuffer)

**Sprint:** 6d

**Decision:** `modelRegistry` (from `src/lib/model-registry.ts`) is the single source of truth for per-model IFC buffers and typeMaps. `modelStore.ifcBuffer` (the legacy single-model buffer field) is deprecated for multi-model operations.

**Alternatives considered:**
- Keep `modelStore.ifcBuffer` as the source, update it to point to the "active" model's buffer — rejected because active model changes break background operations (export running while user switches active model)
- Store buffers in `sceneStore` — rejected because sceneStore is supposed to hold only serialisable data
- Store buffers in Zustand with a Map — rejected because large ArrayBuffers are non-serialisable and Zustand's devtools would try to clone them

**Reason:** `modelRegistry` is a plain JS Map outside the React/Zustand tree. It holds `ArrayBuffer` objects by reference, which are large and non-serialisable — they must not go into Zustand. Having a dedicated registry separates identity (sceneStore: `SceneModel[]`, stable UI metadata) from binary data (modelRegistry: IFC bytes).

**Consequences:**
- `getDiffsForModel(modelId)` and `exportAsIfc(buffer, diffs)` take explicit buffer arguments obtained via `modelRegistry.getBuffer(modelId)`.
- `modelStore.ifcBuffer` still exists for single-model legacy paths. Do not use it in new multi-model code.
- `modelRegistry.unregister(id)` must be called in `handleRemoveModel` to free the buffer from memory.

> **Updated by D-29 (2026-09).** Registration is now one function, `commitIfcModel` in `src/lib/loading/index.ts`, and it is the same for every entry point. It runs in a fixed order: `modelRegistry.register` → `modelStore.setModel` → `appBus 'model:loaded'` → App's `onModelLoaded` hook, which adds the model to `sceneStore`. The registry copy is read from the user's `File` (or taken from the SDK's own buffer, with no second copy) at commit, so it is still the largest steady-state memory cost after the GPU. `docs/MODEL_LOADING.md` §13 plans `Blob` handles instead.

---

## D-19 · Conditional state reset: only on first model load

**Sprint:** 6f

**Decision:** `handleFileLoad` in `App.tsx` resets `selected`, `hidden`, `isolated`, `hiddenElements` only when `sceneModels.length === 0` (the first model load). Subsequent loads do not touch existing UI state.

**Alternatives considered:**
- Always reset on every load (Sprint 5 behaviour — broke multi-model workflows: loading model B cleared model A's selection and hidden state)
- Never reset (leaves stale selection pointing to elements that no longer exist — only valid if models are related)

**Reason:** Loading a second model is additive; the user's existing selection and category visibility for the first model are intentional. Clearing them is destructive and surprising. The reset is only meaningful when going from "no model" to "first model".

**Consequences:**
- If the user loads an entirely unrelated second model and wants a clean slate, they must manually clear selection and restore visibility.
- `handleNavigateToLanding()` still resets everything — that path is a full session reset.

> **Superseded in part by D-29 (2026-09).** `handleFileLoad` is no longer the single entry point (it is a one-line wrapper that queues a file), and with concurrent loads `sceneModels.length === 0` stops being a safe test. Two members of a batch would both see an empty scene. The reset now lives in the loading system's `beforeSubmit` hook, which runs once per submission, whatever its source (dialog, drop, demo, URL, SDK, reload). It resets only when `sceneEmpty` holds, meaning no model is registered *and* no IFC job is active. `handleNavigateToLanding()` first calls `resetLoading()`: it cancels every load, bumps the manager's epoch so a load that is already attaching cannot repopulate the stores, and terminates the conversion workers. Only then does it clear the stores.

---

## D-20 · Vite chunk splitting for production build

**Sprint:** 6 (build optimisation — 2026-05-17)

**Decision:** `vite.config.ts` uses `manualChunks` in `rollupOptions.output` to split the production bundle into four chunks: `vendor-three` (three.js), `vendor-ifc` (@thatopen/* + web-ifc), `vendor-ui` (React, Radix, Framer, Zustand, everything else), and the app entry.

**Alternatives considered:**
- Default Vite chunking (produced a ~6.5 MB monolith that hit the JS heap OOM on Windows during build)
- Split into more chunks (caused circular-dependency warnings between React ecosystem packages: e.g., `vendor-react → vendor-misc → vendor-react`)
- Server-side rendering with streaming (not applicable — client-only app)

**Reason:** three.js (~1.3 MB) and @thatopen (~4.5 MB) are large, change infrequently, and are perfect long-lived browser cache targets. Separating them from the app code means a code change to the app does not invalidate the vendor cache. Merging React ecosystem into one `vendor-ui` chunk avoids the circular-dependency warning caused by cross-imports between Radix, Framer, and React.

**Consequences:**
- Worker chunks (validator + export workers) still bundle three.js inline (~3.2–4.3 MB uncompressed each) — this is unavoidable because workers cannot resolve bare specifiers at runtime (see D-11).
- `chunkSizeWarningLimit: 5000` is set to suppress the noise from unavoidably large worker bundles.
- `node --max-old-space-size=4096` is required for the build on Windows (514+ modules exhaust the default 2 GB Node heap without this flag).

---

## D-21 · Crawlable shared reports via a stateless edge Worker (not hash fragments)

**Date:** 2026-05-29 (strategic re-audit v2)

**Decision:** Shared reports today are encoded in the URL **hash fragment** (`#report=<base64>`, decoded client-side by `SharedReportView`). Hash fragments are never sent to a server, so these URLs are invisible to crawlers and link unfurlers — the shared report is the only compounding distribution asset, but in its current form it generates zero SEO/social value. The forward plan is to add a **stateless Cloudflare Worker SSR route** (e.g. `/r?d=<compressed>`) that receives the already-computed report summary as a **query parameter**, decompresses it (fflate), and renders server-side HTML with OpenGraph/Twitter meta so the link is crawlable and unfurls in chat apps.

**Alternatives considered:**
- **Keep hash fragments** — zero infra, perfectly private, but zero distribution value. The report never compounds.
- **Store reports in a database / KV** — would make rich permalinks trivial, but introduces stateful storage, a privacy liability (we'd be holding report data), and violates the spirit of "no backend." Rejected.
- **Pre-render at build time** — impossible; reports are generated per-user at runtime.

**Reason:** The summary (score + condensed issue list) is *not* the model. Passing it through the edge in a URL keeps the hard invariant intact — **the IFC file still never leaves the sender's browser**. Only the derived, already-public-to-the-recipient summary transits the edge, and only to render HTML; nothing is stored.

**Consequences / honest tradeoff:**
- The report summary now passes through the Cloudflare edge in the URL (in transit, not at rest). This is a real, if small, change from "100% client-side" — it must be disclosed accurately in copy. The privacy proof point becomes "your IFC model never leaves your browser" (still true), not "nothing ever touches a server."
- Reuses the existing `cf-worker/` deployment pattern (already a stateless proxy) — low marginal infra cost, stays on the free tier.
- `SharedReportView` decode path stays as a client-side fallback for legacy `#report=` links.
- Refines invariant 1 in `CONTEXT.md`: stateless edge compute that never touches the model is permitted.

---

## D-22 · Per-rule remediation guidance as a deterministic content table (not AI)

**Date:** 2026-05-29 (strategic re-audit v2)

**Decision:** The genuinely useful slice of the killed "AI-assisted validation" idea (old Sprint 12) is **how to fix this issue in your authoring tool**. This is delivered as a **finite, hand-authored content table** — roughly 38 rules × the major authoring tools (Revit, ArchiCAD, Tekla, Allplan) — authored in the i18n locale files alongside the existing `RULE_TRANSLATIONS`. No LLM, no server, no per-request cost.

**Alternatives considered:**
- **LLM-generated fix guidance** — non-deterministic, requires a server + API key (breaks the no-backend invariant), recurring cost, and no moat. Rejected (this is the "AI slop" the re-audit killed).
- **Generic per-rule text only** (no tool-specific steps) — cheaper to author but far less valuable; the coordinator→exporter handoff is where tool-specific steps matter most.

**Reason:** The content is finite and changes slowly, so it can be authored once and translated. It directly serves the retention engine (exporter fixes the issue and re-shares) and is fully compatible with every invariant. It also deepens the i18n moat (10 languages × tool-specific guidance is hard for a competitor to replicate quickly).

**Consequences:**
- Authoring + translation is real ongoing content work, not engineering — budget it as such.
- Lives in i18n; no new runtime dependency. `ValidationPanel` renders the guidance for the selected rule.

---

## D-23 · Capture Toolkit: staggered-recorder replay buffer + WebM→GIF via gifenc

**Date:** 2026-07-02

**Decision:** The Capture Toolkit (screenshot / retroactive clip / GIF export) is built as: (a) a **circular replay buffer** using two staggered `MediaRecorder`s over one `canvas.captureStream()`, (b) an intermediate **WebM** clip, and (c) GIF conversion with **`gifenc`** in a dedicated worker (`gif-export.worker.ts`, no WASM). The whole toolkit is lazy-loaded; only the toolbar buttons ship in the main bundle. Watermark is 2D-canvas compositing (`src/lib/capture/watermark.ts`) applied at extraction time.

**Why a replay buffer (vs manual start/stop recording):** the user story is a meeting — the interesting moment is only known *after* it happens. A DVR-style buffer removes the need to anticipate. Manual recording stays possible implicitly (capture 30 s, trim).

**Why two staggered recorders (vs a naive chunk ring):** `MediaRecorder` chunks produced with a `timeslice` are **not independently decodable** — only the first chunk carries the EBML/WebM header, and later chunks depend on preceding keyframes. Dropping old chunks DVR-style yields a corrupt file. Instead two recorders share the canvas stream, offset by one window (max 30 s), each restarted after two windows: the older recorder always holds a *single self-contained WebM* covering ≥ the last window. Trimming to "last N s" happens downstream at frame extraction — no WebM byte surgery, no demuxer dependency.

**Why WebM intermediate before GIF:** the browser's media pipeline encodes VP8/VP9 in hardware/off-thread for free — recording raw frames (RGBA 720p ≈ 3.7 MB/frame) would need ~1.1 GB for 30 s @ 10 fps. The compressed intermediate makes buffer memory trivial and lets the user preview/trim with a plain `<video>`. One quirk: Chromium `MediaRecorder` writes `duration = Infinity`; **`fix-webm-duration`** (MIT, ~4 KB) patches the EBML duration so seeking works. That is also why "trim WebM" is a realtime re-encode via canvas + `captureStream` (only when trim/watermark actually change the output), not byte manipulation.

**GIF library — alternatives considered:**
- **`gifenc` (chosen)** — MIT, pure JS (worker-safe, no DOM/polyfills), incremental per-frame API (enables streaming + real progress + flat memory), ~2× faster quantization than gif.js, already used by this repo's OG scripts.
- `gif.js` — unmaintained since 2016, spawns its own workers via `workerScript` URL (friction with Vite bundling + CSP), slower.
- `gif-encoder-2` — Node/stream-oriented; no advantage in-browser.
- `ffmpeg.wasm` — ~25–32 MB WASM and LGPL/GPL core (license risk) for a 15 s GIF; rejected.
- *(Note: the "license section" this evaluation was asked to check does not exist in this file; `package.json` is `private` with no license field. All chosen deps are MIT — compatible either way.)*

**Memory trade-off (the numbers):** recorders run at 5 Mbps (`REPLAY_BITS_PER_SECOND`). Worst case = 3 windows of compressed video held at the rotation instant (older slot 2 W + younger 1 W): 30 s window → **~56 MB**, 20 s → ~37.5 MB (`estimateReplayMemoryBytes`). A 48 MB per-slot byte cap forces early rotation if VP9 overshoots. GIF export streams **one frame at a time** with worker acks as backpressure — peak extra memory ≈ 1 RGBA frame, independent of clip length. Frame count is capped (`MAX_GIF_FRAMES = 600`) by lowering effective fps, not truncating.

**Why not `OffscreenCanvas`:** `captureStream()` on the visible canvas already encodes off the JS main thread (browser media pipeline); `transferControlToOffscreen()` would require exclusive canvas ownership, incompatible with the OBC renderer. The only viewer change is `ViewerAPI.getCanvas()`.

**Mobile:** iOS Safari records MP4, not WebM (`isTypeSupported` gates it) — replay is hidden on mobile/unsupported browsers and the toolkit degrades to the screenshot button (which reuses `takeSnapshot()`).

**Consequences:**
- Two parallel VP8/VP9 encodes run while the viewer is open (desktop only, paused via Page Visibility API when the tab is hidden). No measurable main-thread cost; battery cost only while visible.
- 12th Zustand store (`captureStore`, Blob held by reference), 8th worker (`gif-export.worker.ts`, the first non-WASM one), `capture:*` events on `appBus`.
- Captured content is the composed WebGL canvas only — the IFC model bytes never enter the pipeline (invariant 1 untouched); everything stays client-side.

---

## D-24 · Tour Mode reuses the BCF viewpoint/camera infrastructure (no parallel "steps" system)

**Date:** 2026-07-02

**Decision:** The guided validation walkthrough (Tour Mode) is built on the SAME camera primitives as BCF viewpoints, not a parallel system: a shared `ViewerAPI.getCameraViewpoint()` reads position/target/direction/frustum (used by both the tour recorder and BCF capture), `setCameraLookAt()` / the existing `setValidationHighlights()` / `isolateElements()` drive playback, and step captions render the **D-22 remediation corpus** (`getRuleRemediation`) directly. State lives in `presentationStore` (13th store, session-only — persistence is explicitly a separate future iteration).

**What was extracted from BCF (and why it was a real gap):** BCF viewpoint *capture* (`BcfPanel.handleCaptureView`) only stored the snapshot PNG — `cameraPosition`/`cameraDirection` existed **only on imported** viewpoints, so locally captured viewpoints could never be navigated back to. The camera read-back logic didn't exist anywhere reusable (only `geo-system.ts` read `controls.getPosition/getTarget` inline). The extraction: `getCameraViewpoint()` on `ViewerAPI` + `ViewerHandle`, now used by (a) BCF capture — which as a side effect makes captured viewpoints navigable and exportable with camera — and (b) the tour recorder. Playback reuses the pre-existing `setCameraViewpoint` pathway family; `setCameraLookAt(position, target)` was added because the BCF variant implies the orbit target at distance 1 from the eye, which corrupts orbit behaviour after each step.

**Issue grouping (the 300×RULE_EMPTY_NAME problem):** one step per **(rule, model)** pair, never per instance. Each step highlights a capped sample (25 elements — the palette-batching comfort zone) and frames the union AABB of that sample via the existing `getMergedBox` path (`getElementsBox`). Ordering: severity (error>warning>info) → instance count desc → ruleId (deterministic ties). Default cap: 10 steps. File-level issues (expressId 0) become an overview step with the presenter's current camera. Logic is pure and unit-tested (`src/lib/tour/generateAutoTour.ts`).

**Camera interpolation — libraries evaluated:** none needed. `camera-controls` (already wrapping the OBC camera) animates natively: `setLookAt(..., transition=true)` and `fitToBox(box, true)` with its `smoothTime` easing — the viewer already uses both in 10+ places. Writing (or importing) an interpolator would duplicate it. The auto-tour's *stored* camera per step is computed with a small pure `computeFrameCamera` (fitToSphere-equivalent: distance = boundingSphereRadius / sin(minFov/2) × 1.2), tested against known cases.

**Drag-to-reorder — libraries evaluated:** `@dnd-kit/core`+`sortable` (~30 KB, MIT), Atlassian `pragmatic-drag-and-drop` (MIT), native HTML5 drag. **Chosen: native** — the stop list is ≤ ~20 rows, desktop-first, and ↑/↓ buttons are needed anyway for accessibility; a dependency isn't justified. Revisit dnd-kit only if reordering grows beyond this list.

**Capture integration without double buffers:** the tour bar embeds `CaptureToolbar`, but two mounted instances would mean two `captureStream`s + four MediaRecorders. `CaptureToolbar` gained a `replay` ownership prop: the main Toolbar instance owns the replay buffer normally; the tour bar only claims it in embed **kiosk** (`ui=kiosk`), where the toolbar chrome doesn't render. Screenshot works from every instance.

**Mobile:** playback bar is responsive and reachable from `MobileBottomNav`'s tools sheet; the recorder renders as a bottom sheet with arrow-button reordering only (no touch drag — precise camera composition on mobile is already marginal, a drag library wouldn't change that).

**Consequences:**
- BCF captured viewpoints now carry camera data (strictly additive; imported-viewpoint parsing untouched).
- The tour shares the validation overlay channel — entering a tour takes it over, exiting hands it back to the panel's `validationMode` state.
- Tours are lost on reload by design (session-only). Persisting/sharing a tour (e.g. via the crawlable-report Worker) is a future, separate decision.

---

## D-25 · Client Presentation Mode (`ui=client`) — a uiStore flag layered over the embed chrome, not a parallel viewer

**Date:** 2026-07-03

**Decision:** The client-facing skin is implemented as **one boolean in `uiStore` (`clientMode`) + a 4th `EmbedUiPreset` value (`client`)**. App.tsx computes an `effectiveChrome` = client restrictions layered over the URL-derived `EmbedChrome`, and every technical surface is gated through the same flags the embed presets already use. `ClientPresentationLayout` only *composes* what remains (badge, walkthrough CTA, capture pill, presenter gear). Nothing is reimplemented and nothing remounts — toggling the mode preserves the loaded model, camera, validation results and any tour.

**Why uiStore and not a new store:** the mode is pure UI-layer state with zero domain data. A parallel store would duplicate the panel-open flags it needs to coordinate (it closes scene/measurement/clip/plans panels on entry) and create two sources of truth for "what chrome is visible". `?ui=client` at boot simply calls `setClientMode(true)` — after that the URL and the flag are decoupled, which is what makes the in-app toggle (Toolbar `···` menu) reload-free.

**Hidden (and why):** spatial tree + raw Psets/GlobalIds (jargon), ValidationPanel/IdsPanel/BcfPanel/GeoPanel/SolarPanel/FloorPlanPanel (coordinator tools), ScenePanel/transforms (accidental model displacement), scene right-click menu + all inline editing (the model is effectively read-only at the UI layer — `editorStore` itself is untouched, per the task's scope), toolbar with technical export, ModelInfoPanel/OverlayHud (file size/GPU/severity counters are noise). Measurement/section CAN return through the **presenter gear** (top-right, 25% opacity idle — deliberately ignorable for the audience) without leaving the skin.

**Shown:** `ClientHealthBadge` as the centrepiece — animated score ring + ONE phrase from a 3-tier mapping (`clientScoreTier`: ≥85 "model verified" green, ≥70 amber "good with observations", <70 red "needs review"; thresholds shared with D-26's honesty rule). `explainQualityScore` is deliberately NOT used here — its per-rule penalties are coordinator language. When validation hasn't run, the badge is a one-click "Verify model" CTA over the existing runner. Tour Mode is the primary CTA ("View walkthrough" — plays the existing tour or generates one via the shared `startAutoTour`). Postprocessing (SSAO/edges) switches on while the skin is active and the previous quality is restored on exit. Capture stays available as a simplified pill (the pill owns the replay buffer since the toolbar is hidden — see D-23's single-owner rule; it yields to the TourPlayer instance while a tour plays).

**Export (task point 4):** resolved as *reuse Capture Toolkit only* (image/GIF — formats a client can open). The one-page PDF (score + captures) is explicitly deferred to its own task: it needs a PDF library evaluation, branding and document i18n that don't belong in a UI-layer skin. No new dependencies were added for this mode.

**Consequences:**
- `EmbedUiPreset` gained `client` (url-params, SDK type, EmbedModal preset picker, `docs/EMBED_URL_PARAMS.md`).
- `ui:client-mode-toggled` on `appBus` (D-13) for future analytics.
- Entering the skin closes all technical floating panels (one-way tidy-up; exiting does not reopen them — the presenter decides).
- The skin is tablet-first (client meetings): all overlays use the same responsive/safe-area patterns as the tour bar.

---

## D-26 · Presentation templates + shareable tour links (extends D-21, D-23, D-24, D-25)

**Date:** 2026-07-03

**Decision:** Three goal-driven templates package the presentation stack — `applyTemplate(id)` in `src/lib/templates/presentationTemplates.ts` is pure **orchestration** over the existing stores (presentationStore + uiStore + captureStore), no new store. Tour generation gained a `strategy` parameter (`'severity'` = the original D-24 behaviour, `'showcase'` = whole-model views), NOT a duplicated function.

**The three templates and why each exists:**
- **`social`** (LinkedIn/feeds) — showcase, ≤5 steps, square aspect, **watermark forced ON** (public distribution content), 8 s GIF target, one-click "Export for LinkedIn" in the player (replay capture → GIF with these defaults, zero reconfiguration via the replay-controller singleton from D-23's single-owner rule).
- **`client-walkthrough`** (live meeting) — showcase, ≤10 steps, activates `ui=client` (D-25 reused, not reimplemented), watermark untouched (stays in the room), issues appear ONLY through the opt-in "areas to improve" step — showcase by default, audit only by choice.
- **`technical-review`** — exactly the D-24 severity default, now a named option; nothing new was built for it.
Templates are starting points: every store they touch stays freely adjustable afterwards.

**Showcase strategy:** 4-6 fixed view directions (ISO quarters, front, side, aerial oblique, closing) framed on `getModelBounds()` via the same `computeFrameCamera` math; localized captions positionally attached. **Health Score honesty rule:** the score becomes the step-1 headline ONLY when `scoreIsHeadlineWorthy(score)` — **threshold 70**, deliberately the same `attention` boundary as the D-25 client badge tiers (one shared definition of "presentable"). Below it, the neutral "Model walkthrough" caption leads; a low score never becomes a public hook against the user.

**Aspect ratio (square 1:1 / vertical 4:5) — crop, not re-render:** the capture pipeline already composites every frame through `drawImage` (GIF extraction and WebM re-encode alike), so the aspect is a **centre-crop source rect** (`computeCropRect`, pure + tested) plus a correspondingly-sized output canvas. Trade-off accepted: side pixels are discarded instead of re-rendering the model at the target ratio — irrelevant at social resolutions (≤720p) and it keeps the renderer, the replay buffer and D-23's memory model completely untouched.

**Shareable links — how D-21 was extended:** `src/lib/share/tourShareLink.ts` mirrors the share-report codec (UTF-8-safe JSON → base64, version field, 8000-char URL guard) with a compact payload: per step `[px,py,pz,tx,ty,tz]` rounded to 2 decimals + optional ruleId/severity/count/caption/highlight-ids (capped 10). The payload rides the **`#tour=` hash fragment** (per D-21: fragments never reach a server) and the model rides the **existing `?model=` param** — no new transport, the IFC bytes never enter the link. Decoding treats the link as untrusted input (shape/type/caps sanitisation). The receiver's App consumes the hash at boot, waits for `model:loaded`, rebuilds the tour and starts playback with zero clicks; corrupt links degrade to a clear toast, never a blank screen. **Worker upgrade path:** the payload is deliberately flat so a future `/t?d=<base64url>` route on the deployed cf-worker (D-21's report route pattern) can decode it and SSR an unfurl card — that route is a separate deploy task; until then links open-and-play but don't unfurl (the LinkedIn asset today is the exported GIF, which is what the social template produces anyway).

**The honest limit (models without a public URL):** `buildTourShareUrl` returns `{ok:false, reason:'no-model-url'}` for disk-loaded models and the player says so plainly ("no public URL — export a GIF instead"). We deliberately do NOT suggest uploading the model anywhere — that would contradict the product's core privacy positioning.

**Libraries:** none added. The D-21 codec in production uses plain base64 (no fflate); the tour payload measures ~1–3 KB for a 10-step tour, well under the guard. `fflate` remains the pre-approved choice if manual mega-tours ever hit the limit.

**Consequences:**
- `TemplateSelector` replaces the recorder's raw "generate" button — choosing *what the presentation is for* is now the entry point; `presentationStore.templateId` records the choice (drives the player's contextual buttons + travels in the link).
- `captureStore.aspectPreset` (adjustable in the capture modal's new Format chips) is the single aspect source for modal exports AND the one-click social export.
- Old `recorder.generateAuto*` i18n keys remain for one release (harmless) — the selector uses the new `templates.*` keys.

---

## D-27 · Privacy-invariant amendment — opt-in server-side model processing (F6-gated)

**Date:** 2026-07-04 (conformance-CDE pivot)

**Status:** ⏸️ Proposed / founder-gated. Does NOT take effect until (a) the founder ratifies it and (b) a real demand signal exists (≥1 client with a concrete CDE willing to wire the webhook). Specified now so **F6** is ready when the signal appears — see `docs/CDE_ROADMAP.md` (F6) and `docs-planning/vision/04-plan-ejecucion-fases.md`.

**Decision:** Amend invariant 1 in `CONTEXT.md` ("no server-side processing of the model") to permit server-side IFC processing **only** under ALL of: (a) explicit, per-action opt-in; (b) authenticated **paid** plans only — never anonymous/free; (c) short retention (72 h) with guaranteed deletion even on failure; (d) **honest copy** — the proof point becomes *"your IFC model never leaves your browser unless you opt into cloud processing"*, and marketing never claims blanket client-only once F6 ships; (e) SSRF hardening on any pull-ingest; (f) new RAT rows + DPAs before any code. Through F0–F5 the invariant stays fully intact — only derived JSON summaries + a locally-computed `sha256` transit the edge (per D-21).

**Alternatives considered:**
- **Keep invariant 1 absolute; never process server-side.** Rejected: forecloses the F6 CDE-monitor (the moat #3 mechanism CDEs cannot follow neutrally) and the automatic per-`Milestone` conformance that coordinators with recurring deliveries need.
- **Process server-side silently / for everyone.** Rejected outright: destroys the privacy positioning that is table-stakes trust, and is a GDPR liability.
- **Chosen:** a tightly-scoped, opt-in, paid-only, short-retention amendment with honest copy — the only form that keeps the privacy story truthful.

**Consequences:**
- F6 (`docs-planning/03-feature-procesado-nube.md`, `docs-planning/03-feature-monitorizacion-cde.md`) is the ONLY phase this unblocks; F0–F5 are unaffected.
- The outbound CDE webhook must NEVER carry model bytes (contract test) — only the condensed `ConformityReport`.
- R2 storage first appears here; a container runtime (DA-7) is required — the Worker cannot do heavy IFC processing.
- Site/README copy must be audited when F6 ships so no claim overstates client-only.

---

## D-28 · Immutable Submission + append-only AuditLog (conformance domain)

**Date:** 2026-07-04 (conformance-CDE pivot)

**Decision:** The conformance domain introduces seven entities (`Workspace / Project / Milestone / Submission / ValidationRun / ConformityReport / AuditLog` — full shapes in `docs/CONFORMANCE_DOMAIN.md`). Two carry hard behavioural invariants: a **`Submission` is immutable once submitted** (its model hash, ruleset version, and validation outcome are frozen — a correction is a NEW submission, never an in-place edit), and the **`AuditLog` is append-only** (every state transition is recorded; rows are never updated or deleted). This is what makes a `ConformityReport` mean "this model, against this ruleset, was delivered conformant at this moment."

**Alternatives considered:**
- **Mutable submissions (edit in place).** Rejected: destroys the evidentiary value — a conformance proof you can silently change is worthless. Immutability is the exact property that makes the artifact "DocuSign-like."
- **Editable / prunable audit log for storage economy.** Rejected: append-only is the point. R-7 (unbounded growth) is monitor-not-mitigate (payload ≤ ~5 KB; 100k rows ≈ 500 MB — fine for a long time). No TTL — the artifact's value is its permanence.
- **Chosen:** immutable Submission + append-only AuditLog, enforced at the DB layer, not just app logic.

**Consequences:**
- Re-certifying the same file+ruleset+outcome dedups to the same `cert_hash` (`computeCertHash` excludes `validated_at`) — a re-submission is distinct from a re-issue.
- The domain maps onto already-shipped primitives: `ValidationRun` wraps `runValidation`/`runIds`, `ConformityReport` wraps the frozen `src/lib/certify/` payload, and `AuditLog` entries can surface incoming BCF as visible comments.
- Enforced immutability shapes the Prisma schema (F0) and every write path (F1+). See `docs/CONFORMANCE_DOMAIN.md` state machines.

---

## D-29 · Centralized model loading manager (jobs, lanes, real phases)

**Date:** 2026-09 (model loading & orchestration rebuild)

**Status:** ✅ Implemented. Reference: `docs/MODEL_LOADING.md`, which wins where older passages disagree.

**Context:** Loading was a single-flight hook (`useIfcLoader` in `loader.ts`) that `App.tsx` drove through a handful of global flags. It worked for one file at a time. It broke, in ways that were hard to see, as soon as federated sets, demo sets, `?model=a,b` and SDK hosts started loading several models:
- A second load was **rejected**, not queued, and App flagged the whole scene as an error.
- Progress was fixed checkpoints that went backwards (20 → 0, 99 → 80). The real per-class progress from IfcImporter and fragments' real `generating` fraction were thrown away.
- **Cancel did nothing.** The overlay button changed its own state while the worker kept parsing.
- The model id was minted inside the viewer *after* the load, so nothing outside could cancel, prioritise or correlate a load. fragments' `abort(modelId)` existed and was unused.
- SDK correlation had one pending-request slot, and parse failures sent no `model-error`, so the host just timed out after 120 s.
- Every progress message re-rendered the whole app.
- Fetched files got `lastModified = now`, so URL and demo loads never hit the OPFS cache.
- The full IFC was copied on the main thread before transfer.

That is documented pain, not commodity polish, so it passes the Roadmap v2 prioritisation rule. The full list is in `MODEL_LOADING.md` §1.

**Decision:** Every load is a **job** in one `LoadManager` (`src/lib/loading/`). That covers upload, drop, demo set, `?model=`, `ifcviewer:load`, SDK bytes, companion model and reload. The manager is framework-agnostic: no React, no store, no viewer, no worker. Everything is injected, so it runs in plain node tests.
- **Phases reported by the code doing the work.** A job runs through `download → identify → cache-lookup → geometry → properties → relations → serialize → cache-write → attach → setup → read`, then the background phases `stream` and `index`. A phase shows a fraction only when that code measures one. Otherwise the UI shows activity.
- **Statuses:** `queued / held / running / waiting(reason) / loaded / failed / cancelled / unloading / removed`.
- **Three lanes**, decided by a pure scheduler:
  - `network`: 2, back-pressured. No download starts while `maxConverts + 1` downloaded files already wait to convert, so downloads never pile whole files on the heap far ahead of conversion.
  - `convert`: **1 by default**, memory-admitted, large files run alone, and reserved for the anchor of an empty scene. The spatial-tree build (`index`) also takes this lane, at background priority.
  - `attach`: 1, **anchor-first**. The first-submitted model sets fragments' coordinate base.
- **Real cancellation:** `worker.terminate()` during conversion, fragments `core.abort(modelId)` during attach, and compensation that removes partial models. `reset()` bumps an epoch that refuses late commits.
- **A retry policy per error class**, with at most 3 attempts.
- **Cache:**
  - stable keys for fetched files;
  - a content fingerprint in the meta: a sample for files, the full SHA-256 for SDK bytes;
  - the meta written last, as the commit marker;
  - LRU eviction;
  - no `.ifc` copy written any more.

  Duplicate detection is built on the same fingerprint.
- **The UI reads only a throttled Zustand mirror** (`loadingStore`, ≤ 10 updates/s). App reacts through `LoadingHooks`, which are refreshed every render so a commit never runs a stale closure.
- **Point clouds, meshes and GIS context are *tracked*, not executed.** Their runners keep their own alignment, budgets and streaming, and the manager mirrors them into jobs.

**Alternatives considered:**
- **Per-component loading state** (each entry point with its own flags and spinner, as before). Rejected: there is no global view, no queue, no cross-source cancel or priority, and the loading state lived in App's React state.
- **One worker per file, unbounded concurrency.** Rejected by measurement. On the Hotel Vela set (Chromium, 12 cores, 16 GB, cold cache):
  - 1 conversion at a time: 7.2 s for the whole set;
  - 2 concurrent: 7.6 s;
  - 3 concurrent: 16.0 s, and the 0.2 MB MEP model took 9.8 s instead of 0.09 s.

  IfcImporter builds geometry in JS arrays and web-ifc parses every file twice, so concurrent workers fight over allocation and memory bandwidth, not cores. Peak memory also multiplies (≈ size × 5 + 100 MB per conversion). The overlap that pays is across lanes (download ∥ convert ∥ attach).
- **web-ifc multithreaded build (web-ifc-mt).** Deferred. Its pthread sub-workers fail inside a nested module worker (D-02). It needs `crossOriginIsolated`, which `coi-serviceworker` does not give the very first visit. It pre-spawns `hardwareConcurrency` threads over a shared 4 GiB memory. A spike in a classic, non-nested worker comes first.
- **Server-side or SSR processing** (convert in the cloud, or prerender the viewer). Rejected: invariant 1. D-27 permits it only in F6, opt-in and paid, and the viewer is never prerendered (`docs/SEO_PRERENDER_PLAN.md`).
- **Chosen:** a client-only job manager with separate lanes whose limits come from measurement, adapters that report real signals, and a store that holds serialisable views only.

**Consequences:**
- Supersedes in part D-02, D-03, D-04, D-06, D-08, D-10, D-16 and D-19, and updates D-13, D-14 and D-18. Each carries a note; history is kept.
- **The `modelId` is minted before the load.** The shape is unchanged: `${fileName}-${13 digits}`, strictly increasing per page, so two same-named files in one millisecond no longer collide. A retry gets a fresh id.
- **Registration order is frozen:** registry → `modelStore` → `model:loaded` → App's hook → `sceneStore`. New bus events: `load:*` and `model:removed`.
- **The SDK and embed wire format is unchanged.** The behaviour is better:
  - `model-progress` is monotonic per job, correlated by `requestId`, and sent only while the job is loading;
  - `model-error` now also covers parse and scene failures and cancellations, with `url` for URL loads and `name` otherwise;
  - the iframe accepts concurrent loads;
  - `ifcviewer:load` with an array is one batch;
  - `ifcviewer:clear` cancels in-flight IFC loads first.
- **Memory:**
  - the main thread no longer copies the IFC during conversion (the `File` is posted to the worker);
  - downloads wait while conversion is backed up;
  - the fragments buffer is transferred, not cloned;
  - big-file workers are recycled and idle ones reaped;
  - post-load validation and georef extraction wait for an idle queue.
- **Observability:**
  - `[IFC-LOAD]` structured logs on the `Load` channel (`localStorage['ifc:log-level']='trace'` for trace);
  - `performance.mark` per phase in DEV (`ifc-load:<job>:<phase>`);
  - session metrics and renderer stats in the Loading Center's Advanced view;
  - `globalThis.__ifcLoad` in DEV.
- **New UI:** a toolbar loading chip (a floating variant for presets without a toolbar, a pill on mobile), the Loading Center (popover on desktop, sheet on mobile, with Basic/Advanced views), a first-load card, a "Loading" section in ScenePanel, and a multi-file import dialog with review, duplicates and a large-file notice.
- **Still outside the manager:**
  - the blog `EmbedViewer` path (`src/lib/embed-loader.ts`) keeps its own fetch → worker → `loadFragments` pipeline;
  - point cloud and mesh execution stays in their runners.

  `MODEL_LOADING.md` §13 lists the next steps.

---

*Last updated: 2026-09-24 · Sprints 1–9 complete · D-21/D-22 (re-audit v2) · D-23 Capture Toolkit · D-24 Tour Mode · D-25 Client Presentation Mode · D-26 Presentation Templates + Share Links · D-27 (privacy-invariant amendment, F6-gated) + D-28 (immutable Submission + append-only AuditLog) added for the conformance-CDE pivot — see `docs/CDE_ROADMAP.md` + `docs/CONFORMANCE_DOMAIN.md` · D-29 centralized model loading manager (2026-09) — see `docs/MODEL_LOADING.md`; D-02/03/04/06/08/10/13/14/16/18/19 annotated*
