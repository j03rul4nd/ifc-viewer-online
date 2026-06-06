# Roadmap

Sprint-by-sprint plan. Each sprint builds on the previous and introduces architectural constraints that must not be broken in later sprints.

---

## ⭐ Roadmap v2 — Distribution-led (resolution 2026-05-29)

> **This section is the authoritative forward plan. It supersedes the original Sprint 10–12 plan below.**
> **★ UPDATE 2026-06-06:** A market re-audit (fresh research) found the thesis commoditized — buildingSMART's official validator went GA (free, 100+ rules), free OSS 100%-client-side clones exist (ifcchecker.com, opensource.construction), and Data Octopus ships shareable links + tool-specific remediation. The refocus — **own the Health Score as a citable, benchmarked number (Lighthouse-style percentile, filling a vacuum like Moz DA); prerender the landing for crawlers/LLMs; absorb IDS; monetize via a certificate artifact + B2B embed/API, not a $9 individual sub** — supersedes the priorities below where they conflict. The CF Worker is now **DEPLOYED**. Full decision doc: `memory/project_refocus_save_2026-06.md`.
> Sprints 1–9 are **complete and shipped** (see status fields). The product is technically mature; the bottleneck is distribution and retention, not features. Every item below is chosen to close the growth loop (free flywheel → paid retention), not to add viewer capability.

### Strategic frame

- **Buyer = BIM Coordinator.** Free user = the exporter (architect/engineer) they mandate it onto. The handoff between them ("run it through the health check before you send me the IFC, and send me the report link") is the growth loop.
- **Health Score = acquisition hook** (memorable, viral, owns the "ifc health check" keyword). **Retention engine = project-specific conformance** (IDS-lite / checklist), built only when a paying-adjacent coordinator asks.
- **The only compounding asset is the shared report/link.** Make it crawlable + social-shareable (see P2).

### Moat vs commodity (the lens that orders everything below)

Our **technical features are commodities** — anyone can ship them, and they don't compound:
- The 3D viewer runs on `@thatopen/components`, which is open-source and controlled by a *competitor*. Every web IFC viewer uses it.
- IFC parsing, BCF export, basic geometry/GUID validation, OPFS speed — all replicable.
- "Privacy / no upload" is now table stakes (competitors are client-side too), not a differentiator.

The **only three moats are distribution/content/brand, not tech**:
1. **Health Score as a *cited standard*** — being the number the industry quotes ("scored 82") is defensible like a credit score. Activated by distribution + a consistent algorithm.
2. **The i18n + remediation content corpus** — ~38 rules × 4 authoring tools × 10 languages. A competitor copies the feature in a day but not the corpus. Compounds; it's content, not code.
3. **The crawlable shared-report loop** — each report is a backlink + a viral invite. Currently worth zero (hash fragments aren't crawlable).

**Who builds the moats:** the *buyer* (coordinator) monetizes, but the *free user* (exporter) builds moats #1 and #3 every time they share a report — so the free tier stays generous on purpose.

> **Prioritization rule:** every item is tagged with the moat it builds. **If an item only improves the commodity (more viewer features, perf with no documented pain), defer it by default.** This is *why* WebGPU and point clouds were killed. Full analysis: `memory/project_moats_vs_commodities.md`.

### Priorities (P0 highest)

| P | Item | Builds moat | Status | Why / realism |
|---|---|---|---|---|
| **P0** | Distribution & signal capture (forums, niche pages, bimcorner outreach, Capterra/G2, deploy CF Worker, ProductHunt prep) | #1 + #3 (activates them) | 🔁 Ongoing | Already the documented bottleneck. Non-engineering. See `memory/project_strategic_direction_2026.md`. |
| **P1** | **Remediation content table** — per-rule "how to fix in Revit/ArchiCAD/Tekla" in the free tier | **#2 (corpus)** | ✅ DONE (2026-05-29) | Content, not AI/infra. 380 entries (10 langs × 38 rules) in `src/i18n/rule-remediation.ts` + `remediation` keys in every `validation.json`. Renders in-app (`RemediationBlock`) and in shared reports. See D-22 + `memory/project_remediation_corpus.md`. |
| **P2** | **Crawlable / shareable reports** — migrate `#report=` hash to a stateless CF Worker route with server-rendered HTML + OG meta | **#3 (network/SEO)** | ✅ Worker DEPLOYED (2026-06-06) | Server route **done**: `GET /r?d=…` in `cf-worker/worker.js` renders crawlable HTML (title + OG/Twitter meta + JSON-LD + issue list + EN "how to fix" prose), stateless + XSS-hardened. Share button emits the Worker URL when `VITE_REPORT_URL` is set (else falls back to hash). **Worker DEPLOYED (2026-06-06).** Share codec refactored to `src/lib/share-report.ts` (`buildShareUrl`). **Verify:** the `VITE_REPORT_URL` GitHub Actions secret is populated so prod builds emit the crawlable `/r?d=` route (not `#report=`) — without it the moat is worth zero despite the deploy. Optional `fflate` for very large reports. See D-21 + `memory/project_refocus_save_2026-06.md`. |
| **P3** | **Model-vs-model revision diff** — "what changed between rev C and rev D" via GlobalId matching | retention (not a moat) | 📋 Planned (signal-gated) | Real coordinator pain; reuses the existing multi-model engine. Build when a coordinator asks. Replaces the killed WebGPU slot. |
| **P4** | **IDS-lite / project checklist** — coordinator defines plain-English requirements once; supply chain checks against them | retention (Pro engine) | 📋 Planned (signal-gated) | The retention/Pro engine. Build when leading indicators are met OR ≥5 IDS mentions appear (per existing gate). Plain-English UX, never raw XML. |

### Explicitly killed / deferred

- **WebGPU renderer (old Sprint 10)** — ❌ deferred indefinitely. No documented perf pain; custom `BaseRenderer` over OBC is weeks of solo work.
- **Point clouds / scan-to-BIM / AR (old Sprint 11)** — ❌ killed. Different product, different buyer (surveyors), multi-GB files that violate the no-cache-large-files constraint.
- **"Chat with your BIM" / NL query (old Sprint 12)** — ❌ killed as AI slop. The only useful slice (fix guidance) is reclassified as the P1 content table — it is not AI.

> Rationale for the kills is recorded so future sessions don't resurrect them: see this section + `DECISIONS.md` (forward-plan note).

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

**Status:** ✅ DONE
**Goal:** Add a validation engine that identifies common IFC errors and a spatial hierarchy tree with inline attribute editing.

**Delivers:**
- **Zustand stores** — `modelStore`, `validationStore`, `editorStore`, `uiStore`, `toastStore` — all with devtools middleware, named actions, and typed selectors
- **Toast system** — `toastStore` + `ToastContainer.tsx`; imperative `toast(msg, level)` used throughout; `toastFromError()` handles unknown error types
- **Pre-flight IFC guards** — `src/lib/ifc-guards.ts` (`validateIfcBuffer()`) with buffer size and STEP signature checks
- **Validator worker** — `src/workers/validator.worker.ts` runs `IfcAPI` off the main thread; emits `tree`, `partial`, and `done` messages
- **Validation orchestrator** — `src/lib/validator.ts` (`runValidation()`): pre-flight check, in-memory result cache, streaming partial issues, worker error recovery
- **Auto spatial tree on load** — `buildSpatialTree()` called fire-and-forget from `loader.ts` after every model load
- **16 validation rules** — RULE_EMPTY_NAME, RULE_EMPTY_LONGNAME, RULE_DUPLICATE_NAME, RULE_NAMING_CONVENTION, RULE_MISSING_TYPE, RULE_DUPLICATE_GUID, RULE_MISSING_PROPERTY_SET, RULE_ORPHAN_ELEMENT, RULE_WRONG_CONTAINER, RULE_BROKEN_AGGREGATE, RULE_INVALID_GUID_FORMAT, RULE_SPATIAL_HIERARCHY, RULE_CIRCULAR_REFERENCE, RULE_EMPTY_PROPERTY_VALUE, RULE_MISSING_MATERIAL, RULE_ELEMENT_IN_BUILDING
- **Spatial tree** — `ModelTree.tsx` renders the hierarchy, virtualised with `@tanstack/react-virtual`
- **Inline editing in tree** — Name, LongName, Description editable inline; GlobalId regenerable via confirmation modal
- **Validation panel** — `ValidationPanel.tsx` with filters, **batch auto-fix button**
- **Non-destructive editing infrastructure** — `editorStore`, `diffStore.ts`, `useEditorHistory.ts`
- **SET_PROPERTY + REPARENT diffs** — fully implemented at export
- **Infrastructure layer** — `Result<T,E>`, `TypedEventBus` / `appBus`, `CacheRepository`, `Brand<T,B>`, `createLogger`, `invariant`, `ErrorBoundary`
- **Facade hooks** — `useModelSession()`, `useAppEvent()`, `useValidationRunner()`, `useElementFocus()`, `usePersistedPreferences()`, `useKeyboardShortcuts()`

**Constraints introduced:**
- Edits must be keyed by GlobalId (string), not Express ID (number).
- Validation rules must be pure functions; no side effects.
- The validator must run in a worker; results are streamed via Zustand, not returned directly.
- Zustand stores must not hold Three.js objects. Store IDs only; let `viewer.ts` manage geometry.
- Worker bundles must not externalize bare specifiers that cannot be resolved by the browser at runtime.

---

## Sprint 4 — 3D Error Highlights + IFC Export + Memory Management

**Status:** ✅ DONE
**Goal:** Close the full edit-validate-export loop: apply diffs and export a corrected IFC file, surface validation errors in the 3D scene, manage GPU/CPU memory on unload.

**Delivered:**
- **3D error highlights** — `setValidationHighlights(issues, enabled)` on `ViewerAPI`; red/amber/blue material slots for error/warning/info; wired to `validationMode` toggle
- **IFC export worker** — `src/workers/export.worker.ts`; applies all diffs (RENAME, FIX_GUID, SET_PROPERTY, REPARENT) via `web-ifc IfcAPI` off the main thread
- **GLB export** — Three.js `GLTFExporter` exports visible scene geometry
- **Memory dispose on unload** — `ViewerAPI.dispose()` calls `components.dispose()`; `teardownCurrentModel()` removes model and calls `model.dispose()`
- **State reset on navigate-to-landing** — clears all stores before routing
- **Zod worker schemas** — `src/lib/worker-schemas.ts`; typed parse helpers for all worker messages
- **Resizable panels** — `react-resizable-panels` v4; tree/viewer split with drag handle
- **Right-click context menu** — `@radix-ui/react-context-menu`; available on every tree row

**Constraints introduced:**
- IFC export runs in `export.worker.ts`. Do not move WASM init back to the main thread.
- State reset must go through `handleNavigateToLanding()`.
- Worker message validation uses zod schemas from `worker-schemas.ts`. Extend the schemas when adding new message types.

---

## Sprint 5 — Performance, Camera Controls, Scene Manager & Quantity Takeoff

**Status:** ✅ DONE
**Goal:** Make the app faster for large models, add camera presets, model transform controls, scene management foundation, typed error hierarchy, and quantity takeoff.

**Delivered:**
- **Cache version prefix** — `CACHE_VERSION = 'v2'` prepended to all OPFS keys
- **Streaming validation progress** — live `N%` in Toolbar Validate button with animated underline bar
- **Cancel validation** — `cancelValidation()` terminates worker mid-run
- **IFC schema version check** — `RULE_INVALID_IFC_VERSION` (17th rule, `info` severity): detects IFC2x3 and suggests IFC4/4X3
- **Clash detection rule** — `RULE_ELEMENT_CLASH` (18th rule, `warning`, off by default): AABB O(n²) intersection with 5 cm threshold
- **Quantity takeoff panel** — `TakeoffPanel` in Sidebar "Quantities" tab; reads `IfcElementQuantity`; `takeoffStore` + `takeoff.ts`
- **Large-model colour performance** — batched `setColor`/`setOpacity` calls (≤25 instead of per-element)
- **Typed error hierarchy** — `src/lib/errors.ts`: 26-code `ErrorCode` union, `AppError` + 7 domain subclasses, `tryAsync()`, `formatUserError()`
- **`ts-pattern` exhaustive routing** — validator and takeoff message handlers use `match().exhaustive()`
- **Camera preset system** — `CameraControls.tsx`: 7 presets (ISO, Top, Bottom, Front, Back, Left, Right); numpad shortcuts; `ViewerAPI.setCameraPreset()`
- **Model transform controls** — `modelPivot` THREE.Group wraps geometry; `ScenePanel.tsx` position/rotation/scale inputs; `ViewerAPI.setModelTransform/resetModelTransform/getModelBounds/getModelTransform`
- **Model info panel** — `ModelInfoPanel.tsx`: collapsible pill with file size + element count health badges
- **Scene store** — `sceneStore.ts` (6th Zustand store): `SceneModel[]` + `activeModelId`; Toolbar Scene button; ScenePanel model list

**Constraints introduced:**
- `ValidationIssue.globalId` is now `string | null`. Null-check before passing to `buildFixGuidCommand`.
- OPFS cache key format changed to `v2:<name>:<size>:<lastModified>`. Existing `v1` entries are orphaned.
- All user-facing model transforms must go through `modelPivot` — not `model.object.matrix` directly.
- `sceneStore` holds only serialisable data. Three.js geometry stays in `viewer.ts`.

---

## Sprint 6 — Multi-Model Support, Error Hardening & Build Optimisation

**Status:** ✅ DONE  
**Goal:** Full multi-model loading (N simultaneous IFC files), per-model state throughout the entire stack, hardened error handling across all async boundaries, and production-grade build splitting.

### 6a — Core multi-model (viewer + ScenePanel)

- **Per-model pivots** — `modelPivots: Map<string, THREE.Group>` in viewer; each model owns its own transform group
- **Multi-model raycast** — `getBestHit()` iterates all models, returns `{ localId, modelId }`; click-select stamps `modelId` on the React selection
- **Remove / activate / frame** — `removeModel(id)`, `setActiveModel(id)`, `frameActiveModel()`, `frameAllModels()`, `isolateModel(id)`, `showAllModels()` — all multi-model aware
- **Validation highlights per model** — `validationHighlightedByModel: Map<string, Set<number>>`
- **ScenePanel multi-model UX** — per-row Isolate, Frame, Validate, Delete buttons; Frame All header button; "isolated" banner; active model highlighting

### 6b — Export, takeoff & validation filter per model

- **ExportModal** — multi-model export dialog; per-row IFC + GLB; "Export all" footer; opened from Toolbar when >1 models
- **diffStore multi-model** — `EditorCommand.modelId`, `getDiffsForModel(modelId)`, `exportAsIfc(buffer, diffs)` decoupled from modelStore
- **viewer.getModelObject(id)** — returns THREE.Object3D for GLB export per model
- **takeoffStore per model** — `byModel: Record<string, { status, result, error }>`; `computeTakeoff(modelId)` reads from modelRegistry
- **ValidationPanel model filter** — model chips when >1 models; `modelFilter` in `filtered` useMemo deps

### 6c — Error hardening

- **`safeVoid` pattern** — `safeVoid(promise, context)` in `errors.ts`; replaces all `catch { /* ignore */ }` in `viewer.ts`
- **export.worker.ts `skippedDiffs`** — failed diffs counted, not abort; diffStore shows warning toast
- **ExportModal handlers** — return `boolean` success/fail; aggregate toast on "Export all"
- **Toolbar export guards** — explicit `sceneModels[0]` guard before buffer/object access

### 6d — Multi-model flow hardening (critical bug fixes)

- **`loader.ts`** — removed `clearHistory()` from `loadFile`; history only clears on navigate-to-landing
- **`sceneStore.removeModel`** — promotes most-recent remaining model when active is deleted
- **`modelStore.setModel`** — `SetModelParams.modelId?` so sceneStore ID aligns with modelRegistry key
- **`validator.ts buildSpatialTree`** — defers if validation in progress; retries on `validation:complete` via `appBus.once`
- **`validator.ts resolveBuffer`** — uses `activeModelId` from sceneStore when no explicit modelId given
- **`event-bus.ts model:loaded`** — carries `modelId: string` in payload
- **`useModelSession.canValidate`** — `modelRegistry.size() > 0` check works for multi-model sessions from cache

### 6e — Scene control multi-model

- **ViewerAPI methods with `modelId?`** — `setModelTransform`, `resetModelTransform`, `getModelBounds`, `getModelTransform`, `focusElement`, `frameElements`, `frameCategory`
- **ScenePanel TransformSection** — all callbacks pass explicit `model.id` (prevents cross-model transform mutation)

### 6f — Final audit (ModelTree, ValidationPanel, App.tsx)

- **ModelTree.tsx** — full `modelId` threading: `commitEdit`, all InlineEdit `onCommit`, Fix GUID in SpatialRow + ElementRow, `startEdit` / `guidWarning` state carry `modelId?`
- **ValidationPanel.tsx** — `modelFilter` in useMemo deps; Run button disabled logic; empty-state copy
- **App.tsx** — conditional reset on first-model-only; `handleRemoveModel` clears stale selection + takeoff; `handleNavigateToLanding` resets takeoff store

### Build optimisation (committed 2026-05-17)

- **Vite chunk splitting** — `manualChunks`: `vendor-three` (~1.3 MB), `vendor-ifc` (~4.5 MB), `vendor-ui` (~518 KB), app entry ~220 KB
- **OOM fix** — `node --max-old-space-size=4096` on Windows build (heap was exhausted on 514+ modules)
- **Chunk warning threshold** — `chunkSizeWarningLimit: 5000` to suppress unavoidable worker bundle noise

**Constraints introduced:**
- `modelRegistry` is the authority for IFC buffers per model. Do not read `modelStore.ifcBuffer` for multi-model operations.
- `getDiffsForModel(modelId)` filters the diff history by modelId. Always pass modelId when building export payloads.
- Clearing history (`clearHistory()`) must only happen in `handleNavigateToLanding`, never during `loadFile`.
- Transform callbacks in ScenePanel must pass explicit `model.id` — not rely on "active model" in the viewer.

---

## Sprint 7 — Postproduction Renderer + Measurement Tools

**Status:** ✅ DONE  
**Goal:** Add cinematic rendering quality and interactive in-viewer measurements using `@thatopen/components-front` APIs.

### Why now

Postproduction (AO, edges, bloom) and measurements are the two most-requested features after multi-model. Both are first-class OBC APIs that integrate with the existing `OBC.Components` world without requiring a renderer swap. Completing these before sections/BCF maximises visual impact for the target audience.

### Planned deliveries

**OBCF.PostproductionRenderer** — Cinematic rendering
- Replace `OBC.SimpleRenderer` with `OBCF.PostproductionRenderer` (drop-in, same `BaseRenderer` contract)
- Enable **screen-space ambient occlusion** (SSAO) — contact shadows under beams and slabs
- Enable **edge rendering** (crisp outlines on element boundaries) — architectural line drawing feel
- **Bloom** pass for bright emissive elements (lights, MEP)
- Expose toggle in `ScenePanel`: "Quality" mode (postpro on) vs "Performance" mode (WebGL standard)
- `uiStore.renderQuality: 'standard' | 'quality'` — persisted in localStorage via `usePersistedPreferences`

**OBCF.LengthMeasurement** — Point-to-point distance
- Activate on "Measure" toolbar button → click first point → click second → shows dimension line + label
- Results panel listing all placed measurements with delete buttons
- `measurementStore.ts` — 7th Zustand store: `Measurement[]`, `activeTool: MeasurementTool | null`

**OBCF.AreaMeasurement** — Polygon area on surfaces
- Click vertices on a face, close polygon → shows area label
- Combined with LengthMeasurement in the same Measurements panel

**OBCF.EdgeMeasurement** — Snap-to-edge with one click
- Hover edge → preview → click to place
- Useful for BIM coordinate checks

**OBCF.VolumeMeasurement** — Select element → shows net volume
- Reads directly from the fragment geometry bounding box
- Alternative: reads `IfcQuantityVolume` from the takeoff pipeline (more accurate)

**Keyboard shortcuts**
- `M` — activate length measurement tool
- `Escape` — cancel active measurement
- `Delete` — remove last measurement

**Constraints to add:**
- Postproduction renderer must degrade gracefully on WebGL 1 hardware (detect `renderer.capabilities.isWebGL2`).
- Measurements store only Three.js-free data (points as `[x,y,z]` tuples). Geometry is managed by OBCF.
- All OBCF measurement classes must be disposed on `ViewerAPI.dispose()`.

---

## Sprint 8 — Floor Plans, Sections & Clipping

**Status:** ✅ DONE  
**Goal:** Add 2D floor plan view generation, arbitrary section cuts, and clipping planes — the three spatial navigation features most requested by architects.

### Planned deliveries

**OBCF.Plans** — 2D floor plan views
- Auto-detect storeys from `IfcBuildingStorey` entities via `OBC.IfcRelationsIndexer`
- Each storey → section cut at storey elevation → renders to a 2D orthographic canvas
- `PlansPanel.tsx` — thumbnail strip of all storeys; click to activate; camera animates to section
- Plan view rendered in a secondary `<canvas>` overlay (not replacing the 3D canvas)
- Markers on the plan that navigate the 3D camera when clicked (linked views)

**OBCF.Sections / OBC.Clipper** — Arbitrary section cuts
- Toolbar "Section" button → drag to place clipping plane (normal + offset)
- `OBCF.ClipEdges` — hatching material on the cut face (professional section look)
- Multiple simultaneous planes; individual toggle and delete
- Snap to axis-aligned planes (keyboard shortcut: `X`, `Y`, `Z`)
- `ViewerAPI.addClipPlane(normal, constant)` / `removeClipPlane(id)` / `clearClipPlanes()`

**OBC.IfcRelationsIndexer** — Fast relationship queries
- Pre-build relationship index after model load (background, off main thread via build-tree worker)
- Exposes `getRelated(expressId, relType)` — used by Plans storey detection and future BCF positioning
- Replaces manual `IfcAPI.GetLine` traversal in `validator.ts` (performance win on large models)

**Constraints to add:**
- Section plane geometry must be cleaned up in `ViewerAPI.dispose()`.
- Plan view canvas must share the same OBC Components world — do not create a second world.
- `IfcRelationsIndexer` results are stored in `validationStore` alongside the spatial tree.

---

## Sprint 9 — BCF Issue Tracking + Collaboration Export

**Status:** ✅ DONE — BCF 2.1/3.0 import + export shipped (`bcf-parser.worker`, `bcf-export.worker`, BCF tab in `ValidationPanel`).  
**Goal:** Add BCF 2.1 / 3.0 issue import/export so the tool can be part of a professional BIM coordination workflow alongside Solibri, BIMCollab, and Navisworks.

### Why BCF matters

BCF (BIM Collaboration Format) is the open standard for IFC issue communication. Every validation issue identified by this tool is a potential BCF topic — if the user can export them, they can share findings with Revit/ArchiCAD teams without emailing screenshots.

### Planned deliveries

**BCF import** — Load `.bcfzip` files
- Parse BCF 2.1 / 3.0 XML (pure browser, no server)
- Show imported issues in `ValidationPanel` as a "BCF" tab
- Navigate camera to the viewpoint stored in each BCF topic
- Restore component visibility/selection from the BCF viewpoint state

**BCF export** — Write `.bcfzip` from validation issues
- Convert validation issues (or any subset) to BCF topics
- Capture current camera viewpoint + selection snapshot for each issue
- Includes component GUIDs for tool compatibility (Revit, ArchiCAD, Solibri)
- "Export BCF" button in ValidationPanel header

**`@thatopen/bcf-manager`** — If available in OBC v3+ ecosystem, use the official package; otherwise implement a minimal BCF 3.0 writer (XSD is public)

**Collaboration comment threads** — Local-only (browser memory)
- Add comments to validation issues
- Comments exported as BCF markup `<Comment>` elements

**Constraints to add:**
- BCF file parsing must run off the main thread (bcf-parser.worker.ts).
- BCF snapshots (screenshots) must use `renderer.domElement.toDataURL()` — no external services.
- BCF topics generated from validation issues must use the element's GlobalId as the component identifier.

---

## Sprint 10 — WebGPU Renderer + Performance Tier

**Status:** ❌ DEFERRED INDEFINITELY (resolution 2026-05-29). No documented perf pain at current model sizes; a custom `BaseRenderer` over OBC is weeks of solo work with no distribution payoff. Revisit only if real users report frame-rate complaints on large models. See Roadmap v2 above.  
**Goal:** Unlock WebGPU for users on supported browsers (Chrome 113+, Edge 113+), dramatically improving rendering performance for models with 200k+ elements.

### Planned deliveries

**WebGPU detection and renderer swap**
- `navigator.gpu` detection in `createViewer(container, options?)`
- Custom `WebGPURendererAdapter` implementing OBC's `BaseRenderer` interface
- Uses `three/webgpu` (`WebGPURenderer`) — available in three.js r160+
- Falls back to WebGL automatically if WebGPU is unavailable
- `uiStore.gpuBackend: 'webgpu' | 'webgl' | 'detecting'` — shown in `ModelInfoPanel`

**Instanced rendering for repeated elements**
- Use `THREE.InstancedMesh` for elements that share the same geometry (columns, windows in curtain wall)
- `OBC.FragmentsManager` already uses instancing internally; surface the option in `ScenePanel`

**LOD streaming for ultra-large models (200–500 MB)**
- Tile the model into chunks using `OBC.ModelTiler` (fragmented streaming format)
- Load-in tiles based on camera frustum
- Progressive level-of-detail: full geometry when close, simplified mesh at distance
- `loader.ts` extended: detect tiled models vs single-file models

**Worker pool** — Replace single validator worker with a pool of 2–4 workers
- Parallel rule execution (assign rule subsets to different workers)
- Reduces validation time proportionally for large models

**Constraints to add:**
- WebGPU renderer must be behind a user-visible toggle — do not auto-switch without notice.
- LOD tiling changes the model binary format; add `v3` OPFS cache prefix if tile format changes.
- Worker pool must implement graceful shutdown (terminate all workers on dispose).

---

## Sprint 11 — Point Clouds + Scan-to-BIM + AR

**Status:** ❌ KILLED (resolution 2026-05-29). Different product, different buyer (surveyors, not BIM coordinators), and multi-GB scan files violate the "don't cache large files" constraint and the no-backend invariant. Not a fit. See Roadmap v2 above.  
**Goal:** Support point cloud overlays (LAS/LAZ, E57) for scan-to-BIM workflows, and add basic AR mode for on-site IFC viewing.

### Planned deliveries

**Point cloud support**
- `src/workers/las-parser.worker.ts` — parse LAS/LAZ binary (using `las-rs` compiled to WASM or `laz-perf.js`)
- Render via `THREE.Points` with spatial octree (`potree-core` or `@pnext/three-loader`)
- Coordinate alignment: snap IFC model to point cloud origin (manual offset via ScenePanel transforms)
- Toggle point cloud visibility alongside IFC models in ScenePanel

**E57 format support**
- `e57-js` or custom minimal E57 reader (binary XML + point data blocks)
- Converts to the same `THREE.Points` path as LAS

**WebXR AR mode** — View IFC on-site
- `THREE.WebXRManager` + `ARButton` from Three.js examples
- Hit-test API: tap floor to place the IFC model anchored in real space
- Scale controls: pinch to scale model relative to real world
- Fallback: `<model-viewer>` web component for iOS Safari (no WebXR)

**Constraints to add:**
- Point cloud workers must not import Three.js (geometry is constructed on the main thread from raw Float32Array data).
- AR mode requires HTTPS + device motion permissions — add to `docs/DEPLOYMENT.md`.
- Point cloud data must not be cached in OPFS (too large; scan files are multi-GB).

---

## Sprint 12 — AI-Assisted Validation + Natural Language Query

**Status:** ❌ KILLED as AI slop (resolution 2026-05-29). "Chat with your BIM" adds a server dependency (LLM API), recurring cost, and no defensible moat. The one genuinely useful slice — per-rule fix guidance — is reclassified as the P1 deterministic content table (~38 rules × authoring tool), authored in i18n, no AI. See Roadmap v2 above.  
**Goal:** Integrate a local LLM (WebLLM / Transformers.js) or Claude API calls to provide natural language BIM queries and AI-assisted rule generation.

### Planned deliveries

**Natural language model query**
- "How many load-bearing walls are there?" → runs a structured query against the spatial tree + property sets
- Uses `OBC.IfcPropertiesManager` to read pset values as the data source
- If a local LLM is available (WebLLM with Llama 3.2 3B): fully offline
- If not: optional Claude API key (user-provided) for cloud inference

**AI-assisted validation rules**
- "Generate a rule that checks all IfcBeam elements have a defined load capacity" → emits a JSON rule spec
- Rule spec is compiled into a new validation rule function at runtime (Function constructor, sandboxed)
- Rule appears in `ValidationPanel` rule filter list

**Conflict summary** — Natural language summary of validation report
- "Your model has 23 GUID errors and 5 walls in the wrong storey. Critical: …"
- Generated from `ValidationResult` structured data → short prompt → LLM response

**Constraints to add:**
- LLM inference must run in a worker. Do not block the main thread.
- No model data is sent to any server unless the user explicitly configures an API key.
- AI-generated rules must be sandboxed (no access to `fetch`, `window`, or `navigator`).

---

*Last updated: 2026-05-29 · Sprints 1–9 complete (incl. BCF) · Roadmap v2 (distribution-led) is the authoritative forward plan — see top of file · Old Sprints 10–12 deferred/killed*
