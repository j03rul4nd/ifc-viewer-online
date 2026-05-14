# Roadmap

Sprint-by-sprint plan. Each sprint builds on the previous and introduces architectural constraints that must not be broken in later sprints.

---

## Sprint 1 — @thatopen/components Migration

**Status:** ✅ DONE
**Goal:** Replace direct `web-ifc` + manual Three.js with the `@thatopen` ecosystem as the IFC rendering layer.

**Delivers:**
- Replaced `src/lib/ifcLoader.ts` (direct web-ifc usage) — deleted
- New `src/lib/viewer.ts` with `createViewer()` factory and `ViewerAPI` interface
- OBC world: `OBC.Components`, `OBC.SimpleScene/Camera/Renderer`, `OBC.FragmentsManager`, `OBC.IfcLoader`, `OBC.Grids`
- Shadow maps, SRGBColorSpace, ACESFilmic tone mapping, hemisphere + directional lights
- Per-category IFC palette (25 types, colours + opacity)
- `expressIDToType` map built after load via `model.getCategories()` + `model.getItemsOfCategories()`
- Click-select with `fragmentsManager.raycast()` and `MaterialDefinition` highlights (hover + select)
- `applyFilters()` (hide/show by canonical IFC type) and `applyStyle()` (`shaded`/`blueprint`/`xray`)
- `Viewer.tsx` rewritten as a thin React wrapper around `ViewerAPI`
- `vite.config.ts` updated: `@thatopen/*` excluded from `optimizeDeps`; COOP/COEP headers

**Constraints introduced:**
- All IFC 3D operations must go through `ViewerAPI`. Do not bypass it to call OBC/Three.js directly from React components.
- `web-ifc` must not be imported in `src/` outside approved locations (currently only `@thatopen` internals + the workers).
- `@thatopen/*` packages must remain in `optimizeDeps.exclude`.
- COOP/COEP headers must remain in `vite.config.ts`.

---

## Sprint 2 — High-Performance Loading Pipeline

**Status:** ✅ DONE
**Goal:** Make the tool faster than competing web viewers on large files by adding an OPFS cache and off-main-thread IFC parsing.

**Delivers:**
- `src/workers/ifc-parser.worker.ts` — IFC bytes → fragments binary via `FRAGS.IfcImporter`, zero-copy `ArrayBuffer` transfer, real progress events
- `src/lib/opfs-cache.ts` — OPFS cache: `buildCacheKey`, `loadFromCache`, `saveToCache`, `listCacheEntries`, `deleteCacheEntry`, `getStorageEstimate`
- `src/lib/memory-tracker.ts` — `getMemoryStats()` (measureUserAgentSpecificMemory → performance.memory fallback), `startMemoryTracking()`
- `src/lib/scheduler.ts` — `yieldToMain()` (scheduler.postTask → setTimeout fallback), `runInChunks()`
- `src/lib/loader.ts` — `useIfcLoader()` hook: full pipeline orchestration, cache-miss → worker parse, cache-hit → direct binary load, background OPFS save, memory polling
- `viewer.ts` extended: `loadFragments(buffer, fileName, onProgress?)`, `getGpuEstimateBytes()`, shared `setupLoadedModel()` helper, `teardownCurrentModel()` helper
- `Viewer.tsx` extended: optional `viewerApiRef` prop populates ref when scene is ready
- `App.tsx` updated: uses `useIfcLoader` instead of `ifcFile` state + Viewer load props; cache badge UI
- `vite.config.ts`: `worker: { format: 'es' }`, `assetsInclude: ['**/*.wasm']`, WASM copy plugin, Vitest config
- `src/lib/loader.test.ts`: 11 Vitest tests — cache key, OPFS hit/miss/delete, progress event sequencing
- New types: `LoadPhase`, `LoadProgress`, `MemoryStats`, `CacheEntry`

**Constraints introduced:**
- All IFC parsing must run in `ifc-parser.worker.ts`. Do not add `IfcImporter` or `OBC.IfcLoader` calls to the main thread.
- `loadFragments()` is the primary viewer load path. `loadIfc()` is a fallback entry point; it must not be called from `App.tsx`.
- The worker's `ArrayBuffer` is transferred (detached on main thread). A copy must be made before transfer when the bytes are needed later (validation, export).
- Cache keys are strings in the format `"${name}:${size}:${lastModified}"`. Do not change this format without migrating existing cache entries.
- `yieldToMain()` must be called between heavy processing chunks. Do not run loops of > 64 items without yielding on the main thread.

---

## Sprint 3 — IFC Validator + Spatial Tree

**Status:** 🔄 IN PROGRESS
**Goal:** Add a validation engine that identifies common IFC errors and a spatial hierarchy tree with inline attribute editing.

### Already delivered

- **Zustand stores** — `modelStore`, `validationStore`, `editorStore`, `uiStore`, `toastStore` — all implemented and wired up
- **Toast system** — `toastStore` + `ToastContainer.tsx`; imperative `toast(msg, level)` used throughout the loading and validation pipelines
- **Pre-flight IFC guards** — `src/lib/ifc-guards.ts` (`validateIfcBuffer()`) with buffer size and STEP signature checks; used by both the parser worker and `loader.ts`
- **IFC parser worker hardening** — pre-flight validation, `forceSingleThread: true` fix, improved error reporting with filename/lineno/colno
- **Validator worker** — `src/workers/validator.worker.ts` runs `IfcAPI` off the main thread; emits `tree`, `partial`, and `done` messages
- **Validation orchestrator** — `src/lib/validator.ts` (`runValidation()`): pre-flight buffer check, in-memory result cache keyed by OPFS key, streaming partial issues into `validationStore`, worker error recovery
- **Validation rules** — `RULE_EMPTY_NAME`, `RULE_EMPTY_LONGNAME`, `RULE_DUPLICATE_NAME`, `RULE_NAMING_CONVENTION`, `RULE_MISSING_TYPE`, `RULE_DUPLICATE_GUID`, `RULE_MISSING_PROPERTY_SET`, `RULE_ORPHAN_ELEMENT`, `RULE_WRONG_CONTAINER`, `RULE_BROKEN_AGGREGATE`
- **Spatial tree** — `ModelTree.tsx` renders the hierarchy from `validationStore.spatialTree`, virtualised with `@tanstack/react-virtual`
- **Validation panel** — `ValidationPanel.tsx` with filters by severity, rule, groupBy, text search, and activeTab
- **Non-destructive editing infrastructure** — `editorStore` (diffs + command history + undo/redo), `src/lib/diffStore.ts` (command builder helpers), `src/hooks/useEditorHistory.ts` (keyboard shortcuts)
- **Types** — `ValidationIssue`, `ValidationResult`, `RulesConfig`, `SpatialNode`, `SpatialElement`, `EditDiff`, `EditorCommand`
- **Production bug fix** — removed `external: ['three']` from worker rollupOptions (see `DECISIONS.md` D-11, `docs/DEPLOYMENT.md`)

### Remaining for Sprint 3 completion

- Full inline attribute editing form wired to the viewer highlight layer
- `ifc-guards.test.ts` expanded coverage

**Constraints introduced:**
- Edits must be keyed by GlobalId (string), not Express ID (number). (See `IFC_DOMAIN.md`.)
- Validation rules must be pure functions; no side effects.
- The validator must run in a worker; results are streamed via Zustand, not returned directly.
- Zustand stores must not hold Three.js objects. Store IDs only; let `viewer.ts` manage geometry.
- Worker bundles must not externalize bare specifiers that cannot be resolved by the browser at runtime.

---

## Sprint 4 — Validation Report + 3D Highlights + Export

**Status:** PLANNED
**Goal:** Close the validation loop with 3D error highlights and IFC/GLB export of the edited model.

**Delivers:**
- **3D error highlights** — red/amber highlight material applied to elements with validation errors via `FragmentsModel.highlight()`, separate material slots for error vs warning vs selected
- **Export pipeline** — "Export IFC" button that:
  1. Reads the diff store
  2. Opens the IFC file via `web-ifc IfcAPI.Init()` using the stored `ifcBuffer`
  3. Applies pending edits via `IfcAPI.WriteLine(expressId, ...)`
  4. Calls `IfcAPI.ExportFileAsIFC()` → `Uint8Array`
  5. Triggers browser download
- **GLB export** — uses Three.js `GLTFExporter` to export the currently visible scene geometry (purely visual, no IFC semantics)
- **Memory management** — explicit dispose on model unload: `THREE.BufferGeometry.dispose()`, `THREE.Material.dispose()`, `THREE.Texture.dispose()` for any geometry/materials not managed by OBC

**Constraints introduced:**
- The IFC export must use the original file's bytes (`useModelStore.getState().ifcBuffer`) as the base. The fragments binary cannot be round-tripped to IFC.
- GLB export must not include the grid geometry (added by `OBC.Grids`). Filter `world.scene.three.children` before exporting.
- After export, the diff store must be cleared (edits are now baked into the exported file).

---

*Last updated: 2026-05-09 · Current sprint: 3 (in progress)*
