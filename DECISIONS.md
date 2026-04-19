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
- Cannot use WebGPU with `OBC.SimpleRenderer` without writing a custom renderer class that satisfies `BaseRenderer`. (Deferred.)
- `@thatopen` must be excluded from Vite's pre-bundling (`optimizeDeps.exclude`) because its WASM-loading code breaks when Vite inlines it.

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
- Parse time is isolated from main thread; UI stays responsive during parse (acceptance criterion: main thread idle > 90%).
- Worker WASM path currently points to unpkg CDN. Production builds must either serve WASM locally (the `copyWebIfcWasm` Vite plugin does this) or accept the CDN dependency.
- First parse still requires WASM download (~2 MB). Subsequent parses use cached WASM via browser HTTP cache.
- `ArrayBuffer` is *transferred* to the worker (zero-copy). The `file.arrayBuffer()` call on the main thread renders the buffer detached after transfer; the original `File` object remains accessible.

---

## D-03 · OPFS over IndexedDB for model cache

**Sprint:** 2

**Decision:** Store fragments binaries in the Origin Private File System (`navigator.storage.getDirectory()`) rather than IndexedDB.

**Alternatives considered:**
- `IndexedDB` with a Blob value (common approach; works everywhere)
- `Cache API` (designed for network responses; awkward for arbitrary binary data)
- `localStorage` (5 MB limit; not viable)
- No cache (parse every time)

**Reason:** OPFS gives direct file handle access (`FileSystemFileHandle.createWritable()`), which is faster than IndexedDB for large binary blobs because there is no serialisation/deserialisation overhead. For 200 MB+ fragment binaries, IndexedDB read latency is measurably higher. OPFS also supports synchronous access from a `SharedWorker` (useful if we later move cache I/O off main thread). The `for await...of` directory handle iteration is simple for listing entries.

**Consequences:**
- OPFS is not available in all environments (e.g., some private browsing modes, older Safari). The cache silently no-ops (`loadFromCache` returns `null`; `saveToCache` returns without error). A `opfsAvailable` boolean is exposed by `useIfcLoader` so the UI can indicate cache is disabled.
- OPFS is origin-scoped. Models cached in development (`localhost:5173`) are not accessible in production (different origin).
- The TypeScript DOM lib does not declare `FileSystemDirectoryHandle` as `AsyncIterable`; a cast is required in `opfs-cache.ts`.

---

## D-04 · Cache key = name + size + lastModified (no hash)

**Sprint:** 2

**Decision:** The OPFS cache key is `"${file.name}:${file.size}:${file.lastModified}"` computed synchronously, without reading the file's bytes.

**Alternatives considered:**
- SHA-256 hash of file contents (content-addressable; immune to name collisions)
- `file.name` only (collides on different versions of same-named file)
- UUID generated per session (no persistence benefit)

**Reason:** Hashing a 200 MB file on the main thread takes 100–400 ms — a perceptible delay before the progress bar even starts. `lastModified` changes whenever the file is saved by the BIM tool, which is the correct semantics (if the model changed, re-parse it). Name + size + lastModified has no practical collision risk for the use case.

**Consequences:**
- If the user saves a file with identical bytes but `lastModified` changes (e.g., touching the file), the cache misses unnecessarily and re-parses. This is acceptable — it is the rare case and always produces a correct result.
- Cache key is stored in `.meta.json`. Upgrading the cache format (e.g., adding a library version prefix) requires a migration or cache invalidation.

> ⚠️ NOTE: The cache key should eventually include the `@thatopen/fragments` version (e.g., `v3.4.3`) so that a library upgrade automatically invalidates stale binaries. Not implemented yet.

---

## D-05 · No state library in Sprint 1–2 (plain React useState)

**Sprint:** 1

**Decision:** All application state lives as `useState` in `App.tsx`. No Zustand, Redux, Jotai, or Context.

**Alternatives considered:**
- Zustand (lightweight, minimal boilerplate)
- React Context (built-in; verbose for complex derived state)
- Jotai (atomic model; good for derived state)

**Reason:** In Sprint 1–2 the state is shallow and co-located: file, model info, selected element, hidden/isolated categories. There is one component tree and no cross-cutting derived state. Adding a state library before it is needed creates indirection for no benefit.

**Consequences:**
- Sprint 3 will introduce the validation engine, which produces results that must be consumed by three different UI areas (spatial tree, 3D highlight layer, report panel). At that point, prop-drilling becomes unwieldy and Zustand (or equivalent) should be added. The `ROADMAP.md` Sprint 3 entry notes this.
- The `useIfcLoader` hook is the only piece of state that is already partially decoupled from `App.tsx`. It communicates via a `viewerApiRef` callback pattern rather than shared state.

---

## D-06 · Transferable ArrayBuffer (zero-copy) to parse worker

**Sprint:** 2

**Decision:** Pass the raw IFC file buffer to `ifc-parser.worker.ts` using the `Transferable` mechanism (`postMessage(msg, [buffer])`), not by copying.

**Alternatives considered:**
- `SharedArrayBuffer` (requires `Atomics`; overkill for a one-shot transfer; COOP/COEP already satisfy the security requirement but Atomics coordination is complex)
- Structured clone (default `postMessage` behaviour; copies the entire buffer — up to 200 MB)
- Reading the file inside the worker (workers cannot access `File` objects directly without transfer)

**Reason:** Transferring a 200 MB `ArrayBuffer` takes < 1 ms (ownership transfer, no copy). Cloning it takes ~200 ms and doubles peak memory usage. For large files this is the correct default.

**Consequences:**
- The `ArrayBuffer` becomes **detached** on the main thread after transfer. `file.arrayBuffer()` must be called exactly once. The `File` object is still valid (its bytes can be re-read), but the `ArrayBuffer` instance is neutered.
- If `loadFile` is called concurrently (two files in quick succession), the second call creates a new buffer from the second `File` — there is no state conflict.

---

## D-07 · COOP/COEP headers always enabled

**Sprint:** 1 (vite.config.ts)

**Decision:** `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` are set in the Vite dev server headers and must be set in production.

**Alternatives considered:**
- Only enable for routes that need `SharedArrayBuffer` (complex; OBC's fragments worker needs it at startup)
- Polyfill with `coi-serviceworker` (bypasses the requirement via a service worker; adds complexity and doesn't work in all environments)

**Reason:** `@thatopen/fragments` uses a worker that requires `SharedArrayBuffer`. `performance.measureUserAgentSpecificMemory()` also requires `crossOriginIsolated`. Enabling COOP/COEP globally is the correct solution; the app has no cross-origin embeds (no iframes from other origins, no `<script src="external">` that lacks CORS headers).

**Consequences:**
- Any future embedded content (e.g., a third-party analytics widget, a map embed) must serve `Cross-Origin-Resource-Policy: cross-origin` or the app will fail to load it.
- unpkg CDN (used for WASM download by `IfcImporter`) must support CORS — it does.

---

## D-08 · loadFragments() as primary load path (not loadIfc())

**Sprint:** 2

**Decision:** After Sprint 2, all loads go through `viewer.loadFragments()` (fragments binary → scene). `viewer.loadIfc()` exists but is not called from `App.tsx`.

**Alternatives considered:**
- Keep `loadIfc()` as primary and add caching as a parallel path
- Remove `loadIfc()` entirely

**Reason:** Both cache-hit and cache-miss paths produce the same artifact (fragments binary). Having a single GPU-upload entry point (`loadFragments`) keeps `viewer.ts` simpler and ensures cache-hit behaviour is identical to cache-miss behaviour. `loadIfc()` is retained as a direct fallback for testing and for future CLI/headless use cases.

**Consequences:**
- The model setup code (`setupLoadedModel`, colour application, camera fit) runs identically on both paths — verified by design.
- `loadIfc()` becoming dead code means it could drift from `loadFragments()` if both are not maintained. If it is needed again, check that `setupLoadedModel` is still called correctly.

---

## D-09 · WebGPU: detect and plan, not yet implement

**Sprint:** 2

**Decision:** WebGPU support is planned but not implemented. `navigator.gpu` detection is documented; `three/webgpu` is available in the installed `three` version (r184); but no WebGPU renderer is wired up.

**Alternatives considered:**
- Implement WebGPU in Sprint 2 (rejected: too much scope; requires custom `BaseRenderer` wrapper for OBC)
- Use Three.js WebGPU renderer for the whole app (bypasses OBC.SimpleRenderer; requires manual render loop)

**Reason:** Integrating WebGPU with `OBC.SimpleRenderer` requires subclassing or replacing it with a custom renderer that satisfies OBC's `BaseRenderer` interface. This is a non-trivial change to `viewer.ts` that belongs in a dedicated sprint where it can be properly tested. The Sprint 2 loading pipeline does not depend on WebGPU.

**Consequences:**
- The `getGpuEstimateBytes()` method on `ViewerAPI` exists as a placeholder for memory tracking; it uses WebGL renderer info and is not GPU-API-specific.
- When WebGPU is implemented, `createViewer()` in `viewer.ts` should be split into `createWebGPUViewer()` and `createWebGLViewer()` with a shared setup, or the renderer selection should be injected as a factory parameter.

---

*Last updated: 2026-04-19 · Current sprint: 2 (complete)*
