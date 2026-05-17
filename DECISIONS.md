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

---

## D-03 · OPFS over IndexedDB for model cache

**Sprint:** 2

**Decision:** Store fragments binaries in the Origin Private File System (`navigator.storage.getDirectory()`) rather than IndexedDB.

**Alternatives considered:**
- `IndexedDB` with a Blob value (common approach; works everywhere)
- `Cache API` (designed for network responses; awkward for arbitrary binary data)
- `localStorage` (5 MB limit; not viable)
- No cache (parse every time)

**Reason:** OPFS gives direct file handle access (`FileSystemFileHandle.createWritable()`), which is faster than IndexedDB for large binary blobs because there is no serialisation/deserialisation overhead. For 200 MB+ fragment binaries, IndexedDB read latency is measurably higher. OPFS also supports synchronous access from a `SharedWorker`.

**Consequences:**
- OPFS is not available in all environments (e.g., some private browsing modes, older Safari). The cache silently no-ops. A `opfsAvailable` boolean is exposed by `useIfcLoader`.
- OPFS is origin-scoped. Models cached in development (`localhost:3000`) are not accessible in production (different origin).
- Both `.frag` (fragments binary) and `.ifc` (original IFC bytes) are stored per cache key. The IFC bytes are needed for validation and future IFC export.

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

> ⚠️ NOTE: The cache key should eventually include the `@thatopen/fragments` version (e.g., `v3.4.3`) so that a library upgrade automatically invalidates stale binaries. Not implemented yet.

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
- The validator worker is a singleton managed by `validator.ts`; it is recreated after fatal errors (e.g., WASM SIGABRT).

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
- Every event name and payload is declared in `AppEventMap` in `src/types/index.ts`. Adding an event requires updating that interface first.
- Avoid using the bus for data that belongs in a Zustand store (synchronous UI state). The bus is for fire-and-forget lifecycle signals.

---

## D-14 · Repository pattern for OPFS cache

**Sprint:** 3

**Decision:** All OPFS I/O is mediated through a `CacheRepository` class instance (`cacheRepo`) exported from `src/lib/opfs-cache.ts`. Direct `navigator.storage.getDirectory()` calls must not appear outside that module.

**Alternatives considered:**
- Plain functions (`loadFromCache`, `saveToCache`, etc.) — the Sprint 2 approach; harder to mock and harder to swap out the storage backend
- IndexedDB adapter behind the same interface (kept as a future option)

**Reason:** Wrapping OPFS in a repository makes `Result<T,E>` returns consistent (the repository constructor can return early if OPFS is unavailable), and makes the storage layer testable without a real browser.

**Consequences:**
- `cacheRepo` is created once at module scope in `opfs-cache.ts` and imported by `loader.ts`.
- `CacheRepository.listEntries()`, `.load()`, `.save()`, `.delete()`, `.getStorageEstimate()` are the only public surface.

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

*Last updated: 2026-05-17 · Sprints 1–6 complete*
