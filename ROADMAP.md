# Roadmap

Sprint-by-sprint plan. Each sprint builds on the previous and introduces architectural constraints that must not be broken in later sprints.

---

## Sprint 1 — @thatopen/components Migration

**Status:** DONE  
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
- `tsconfig.json`: `strict: true`, `skipLibCheck: true`
- `Icons.tsx` pre-existing type error fixed (`strokeWidth?: string | number`)
- All 0 TypeScript errors after migration

**Constraints introduced:**
- All IFC 3D operations must go through `ViewerAPI`. Do not bypass it to call OBC/Three.js directly from React components.
- `web-ifc` must not be imported in `src/` outside approved locations (currently only `@thatopen` internals + the worker).
- `@thatopen/*` packages must remain in `optimizeDeps.exclude`.
- COOP/COEP headers must remain in `vite.config.ts`.

---

## Sprint 2 — High-Performance Loading Pipeline

**Status:** DONE  
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
- `vitest` + `jsdom` installed; `npm test` / `npm run test:watch` scripts added
- New types: `LoadPhase`, `LoadProgress`, `MemoryStats`, `CacheEntry`

**Constraints introduced:**
- All IFC parsing must run in `ifc-parser.worker.ts`. Do not add `IfcImporter` or `OBC.IfcLoader` calls to the main thread.
- `loadFragments()` is the primary viewer load path. `loadIfc()` is a fallback entry point; it must not be called from `App.tsx`.
- The worker's `ArrayBuffer` is transferred (detached on main thread). Never read `rawBuffer` after posting to the worker.
- Cache keys are strings in the format `"${name}:${size}:${lastModified}"`. Do not change this format without migrating existing cache entries.
- `yieldToMain()` must be called between heavy processing chunks (see `runInChunks()`). Do not run loops of > 64 items without yielding on the main thread.

---

## Sprint 3 — IFC Validator + Spatial Tree

**Status:** PLANNED  
**Goal:** Add a validation engine that identifies common IFC errors and a spatial hierarchy tree with inline attribute editing.

**Delivers:**
- **IFC Validator engine** — rule-based validator reading from the parsed `FragmentsModel` and web-ifc `IfcAPI`:
  - Missing storey assignment
  - Duplicate GlobalId
  - Missing fire rating (`Pset_WallCommon.FireRating`, `Pset_SlabCommon.FireRating`)
  - Missing load-bearing flag
  - Uncategorised elements (type not in palette)
- **ValidationResult type** — `{ elementId: string (GlobalId), expressId: number, rule: string, severity: 'error'|'warn', message: string }`
- **Zustand store** — introduce `useValidationStore` for validation results; needed because results must drive three UI areas simultaneously (tree nodes, 3D highlights, report panel count badge)
- **Spatial hierarchy tree** — left panel navigating `IfcProject > IfcSite > IfcBuilding > IfcBuildingStorey > elements`; built from `IfcRelAggregates` + `IfcRelContainedInSpatialStructure` traversal
- **Virtualised tree** — `@tanstack/virtual` or `react-virtual` for 10k+ node models; install in this sprint
- **Inline attribute editing** — click any tree node to edit `Name`, `LongName`, `Description`; edits are non-destructive (held in a diff store, not written to the IFC immediately)
- **Diff store** — `useDiffStore`: `Map<GlobalId, Partial<IfcAttributes>>` — pending edits, keyed by GlobalId
- **web-ifc IfcAPI integration** — to read property sets and relationships for the validator; must run in a worker (not main thread)

**Constraints introduced:**
- Edits must be keyed by GlobalId (string), not Express ID (number). (See IFC_DOMAIN.md for why.)
- Validation rules must be pure functions `(model: FragmentsModel, api: IfcAPI) => ValidationResult[]`; no side effects.
- The validator must run in a worker; results are posted to the Zustand store via a message callback.
- Zustand stores must not hold Three.js objects (non-serialisable). Store references by ID only; let `viewer.ts` manage the geometry.

---

## Sprint 4 — Validation Report + 3D Highlights + Export

**Status:** PLANNED  
**Goal:** Close the validation loop with a structured report panel, 3D error highlights, and IFC/GLB export of the edited model.

**Delivers:**
- **Validation report panel** — right sidebar tab listing all `ValidationResult` entries grouped by severity and rule; click a result to select the element in 3D and in the tree
- **3D error highlights** — red/amber highlight material applied to elements with validation errors; uses `FragmentsModel.highlight()` with separate material slots for error vs warning vs selected
- **Export pipeline** — "Export IFC" button that:
  1. Reads the diff store
  2. Opens the IFC file via `web-ifc IfcAPI.Init()`
  3. Applies pending edits via `IfcAPI.WriteLine(expressId, ...)`
  4. Calls `IfcAPI.ExportFileAsIFC()` → `Uint8Array`
  5. Triggers browser download
- **GLB export** — uses Three.js `GLTFExporter` to export the currently visible scene geometry (no IFC semantics; purely visual)
- **Memory management** — explicit dispose on model unload: `THREE.BufferGeometry.dispose()`, `THREE.Material.dispose()`, `THREE.Texture.dispose()` for any geometry/materials not managed by OBC

**Constraints introduced:**
- The IFC export must use the original file's bytes as the base (not the fragments binary). The app must retain a reference to the original `File` object (or its `ArrayBuffer`) throughout the session, or re-request it from the OPFS cache. The fragments binary is geometry-only and cannot be round-tripped to IFC.
- GLB export must not include the grid geometry (added by `OBC.Grids`). Filter `world.scene.three.children` before exporting.
- After export, the diff store must be cleared (edits are now baked into the exported file).

---

*Last updated: 2026-04-19 · Current sprint: 2 (complete)*
