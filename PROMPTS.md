# Claude Code Prompt Log

Ordered log of prompts used to build this project. Future sessions must not undo decisions made in earlier prompts.

---

## Sprint 1 — @thatopen/components Migration

### Prompt S1-P1 — Full migration from web-ifc + Three.js to @thatopen

**Summary:** Migrate the entire 3D/IFC layer from direct `web-ifc` usage and manual Three.js setup to the `@thatopen/components` v3 ecosystem.

**What it asked Claude to do:**
- Remove `src/lib/ifcLoader.ts` (direct web-ifc imports)
- Install `@thatopen/components`, `@thatopen/components-front`, `@thatopen/fragments`
- Upgrade `three` and `web-ifc` to peer-compatible versions
- Create `src/lib/viewer.ts` with `createViewer()` factory and `ViewerAPI` interface
- Rewrite `src/components/Viewer.tsx` to use `ViewerAPI`
- Update `vite.config.ts` for WASM/worker exclusions and COOP/COEP headers
- Achieve `tsc --noEmit` with zero errors

**Key constraints introduced:**
- Do not touch Radix UI components, Tailwind config, GSAP/Framer Motion, or state management files
- Keep existing React component hierarchy
- TypeScript strict mode — no `any` escapes
- `@thatopen/*` in `optimizeDeps.exclude`
- COOP/COEP headers mandatory

**Decisions locked in this prompt:** D-01 (use @thatopen), D-07 (COOP/COEP headers)

**Outcome:** Zero TypeScript errors. `vite build` succeeds (407 modules). `src/lib/ifcLoader.ts` deleted. `Icons.tsx` pre-existing type error fixed as a by-product.

---

## Sprint 2 — High-Performance Loading Pipeline

### Prompt S2-P1 — Production-grade IFC loading pipeline

**Summary:** Design and implement an OPFS cache + Web Worker + scheduler + memory tracker pipeline so large IFC files load faster than competing viewers, with the main thread staying idle during parse.

**What it asked Claude to do:**
- Implement OPFS cache layer (`src/lib/opfs-cache.ts`)
- Implement dedicated Web Worker for IFC parsing (`src/workers/ifc-parser.worker.ts`) using `@thatopen/fragments` `IfcImporter`
- Implement `scheduler.postTask()` wrapper (`src/lib/scheduler.ts`) with `setTimeout(0)` fallback
- Implement memory tracker (`src/lib/memory-tracker.ts`)
- Implement `useIfcLoader()` React hook (`src/lib/loader.ts`)
- Extend `ViewerAPI` with `loadFragments()` and `getGpuEstimateBytes()`
- Add `viewerApiRef` prop to `Viewer.tsx`
- Refactor `App.tsx` to use `useIfcLoader` instead of `ifcFile` state
- Update `vite.config.ts` for ES worker format, WASM copy plugin, Vitest config
- Write unit tests in `src/lib/loader.test.ts`

**Key constraints introduced:**
- All IFC parsing runs in the worker — main thread must not call `IfcImporter` or `OBC.IfcLoader`
- `loadFragments()` is primary load path; `loadIfc()` is legacy/fallback
- Cache keys use `name:size:lastModified` format — stable, do not change without migration
- ArrayBuffer is transferred to worker — make a copy before transfer when bytes are needed later
- `yieldToMain()` between heavy chunks

**Decisions locked in this prompt:** D-02 (IfcImporter in worker), D-03 (OPFS over IndexedDB), D-04 (cache key format), D-05 (no state library yet), D-06 (transferable ArrayBuffer), D-08 (loadFragments primary path), D-09 (WebGPU deferred)

**Outcome:** `tsc --noEmit` zero errors. `vitest run` 11/11 tests pass. `vite build` succeeds (411 modules). Worker bundles as separate `ifc-parser.worker-*.js` chunk.

---

### Prompt S2-P2 — Generate project documentation suite

**Summary:** Generate `CONTEXT.md`, `ARCHITECTURE.md`, `IFC_DOMAIN.md`, `DECISIONS.md`, `ROADMAP.md`, and `PROMPTS.md` based on the actual current codebase state.

**Key constraints this prompt establishes for all future sessions:**
- Read all six docs before writing any code
- Sprint 3 has not started — do not implement validator, spatial tree, or diff store ahead of their sprint
- `loadIfc()` is dead code in the current app flow
- No Zustand yet — add it in Sprint 3 when cross-component validation state requires it
- `gsap` and `@radix-ui/*` are installed but unused in Sprint 1–2 — do not remove them
- `lucide-react` is installed but unused — all icons are in `Icons.tsx`; do not mix icon sources

**Outcome:** Six documentation files created at repo root.

---

## Sprint 3 — IFC Validator + Spatial Tree

### Prompt S3-P1 — Harden loading pipeline, add toast system, IFC guards, validation infrastructure

**Summary:** Hardened the IFC loading pipeline with pre-flight validation and better error reporting, introduced the toast notification system, added Zustand stores, and laid the Sprint 3 foundation.

**What it asked Claude to do:**
- Add `ifc-guards.ts` with `validateIfcBuffer()` — empty buffer + IFC STEP signature check
- Add `ToastContainer.tsx` + `toastStore.ts` — non-blocking toast notifications
- Add `useModelStore` — holds `modelInfo`, `ifcBuffer`, `opfsCacheKey`, `modelObject`
- Add `useValidationStore` — holds validation results, spatial tree, rules, filters, progress
- Add `useEditorStore` — holds edit diffs + command history + undo/redo
- Add `validator.worker.ts` — second worker for `IfcAPI`-based validation
- Add `validator.ts` — `runValidation()` orchestrator with buffer pre-flight and in-memory result cache
- Add `ModelTree.tsx` — virtualised spatial hierarchy tree
- Add `ValidationPanel.tsx` — filterable validation report panel
- Add `useEditorHistory.ts` — keyboard shortcut binding for undo/redo
- Add `diffStore.ts` — command builder helpers (`buildRenameCommand`, `buildFixGuidCommand`)
- Wire `ifc-guards` into the parser worker pre-flight
- Harden the parser worker: `forceSingleThread: true`, improved ErrorEvent reporting

**Key constraints introduced:**
- Zustand stores must not hold Three.js objects
- Edits keyed by GlobalId, not Express ID
- Validation rules are pure functions
- Validator runs in a dedicated worker (not the parser worker)

**Decisions locked in this prompt:** D-05 updated (Zustand added), D-10 (second validator worker)

**Outcome:** PR #1 merged to main. Sprint 3 foundation complete. Zustand stores wired. Toast system active. Validator worker operational.

---

### Prompt S3-P2 — Fix production-only IFC worker crash on GitHub Pages

**Date:** 2026-05-09

**Summary:** Diagnosed and fixed a production-only crash where the IFC parser worker failed silently on GitHub Pages with error `Parser worker script error: undefined`. Also improved error reporting in `loader.ts`.

**Root cause identified:**
- `vite.config.ts` had `worker: { rollupOptions: { external: ['three'] } }`, which told Rollup not to bundle `three` into the worker chunk
- The built worker JS contained `import { ... } from 'three'` — a bare specifier that browsers cannot resolve in a Web Worker context (no `node_modules`, no import map)
- The worker failed to load; Chrome fired an `ErrorEvent` with `message: undefined`
- In dev mode Vite resolved `three` transparently through its own middleware — masking the bug

**What it asked Claude to do:**
- Remove `rollupOptions: { external: ['three'] }` from `worker` in `vite.config.ts`
- Improve `errorHandler` in `loader.ts` to include `filename`, `lineno`, `colno`, and a fallback message when `e.message` is empty/undefined
- Create `docs/DEPLOYMENT.md` documenting the pipeline, WASM paths, COEP/COOP strategy, and the production bug

**Files changed:**
- `vite.config.ts` — removed `rollupOptions.external`
- `src/lib/loader.ts` — improved `errorHandler`
- `docs/DEPLOYMENT.md` — created

**Decisions locked in this prompt:** D-11 (worker bundles must not externalize bare specifiers)

**Outcome:** `vite build` succeeds. Grep confirms no bare `import ... from 'three'` in the worker bundle. WASM files present at `dist/` root. Production worker now loads correctly.

---

### Prompt S3-P3 — Architecture hardening: infrastructure layer, store upgrades, facade hooks

**Date:** 2026-05-14

**Summary:** Introduced a production-grade infrastructure layer across the codebase: `Result<T,E>` monad, `TypedEventBus`, `CacheRepository`, `Brand<T,B>` nominal types, `createLogger`, `invariant`/`assertNever`, `ErrorBoundary`, and an expanded `utils.ts`. All five Zustand stores gained devtools middleware, named actions, and typed selectors. A set of facade hooks was added to reduce component coupling.

**What it asked Claude to do:**
- Add `src/lib/result.ts` — `Result<T,E>`, `ok()`, `err()`, `unwrapOr()`, `mapResult()`
- Add `src/lib/event-bus.ts` — `TypedEventBus<AppEventMap>` class + `appBus` singleton; `useAppEvent()` hook
- Add `src/lib/logger.ts` — `createLogger(ns)` with log levels, env-gated debug output
- Add `src/lib/invariant.ts` — `invariant()`, `assertNever()`
- Add `src/lib/brand.ts` — `Brand<T,B>`, `asExpressId`, `asGlobalId`, `asCacheKey`, `asIfcModelId`
- Migrate `opfs-cache.ts` to `CacheRepository` class returning `Result<T,E>`; export `cacheRepo` singleton
- Upgrade all five Zustand stores: `devtools()` wrapper, named action strings, typed `select*` selectors
- Add `ErrorBoundary` class component + `withErrorBoundary()` HOC; mount in `main.tsx`
- Update `loader.ts`: replace bare `listCacheEntries()` call with `cacheRepo.listEntries()` + `unwrapOr()`
- Update `validator.ts`: add `buildSpatialTree()` export; add appBus emissions for `validation:started/progress/complete/failed`; validate worker output through type guards
- Update `editorStore.ts`: add appBus emissions in `addCommand`, `undo`, `redo`, `clearHistory`; change `(set)` to `(set, get)`
- Add facade hooks: `useModelSession()`, `useAppEvent()`, `useValidationRunner()`, `useElementFocus()`, `usePersistedPreferences()`, `useKeyboardShortcuts()`

**Key constraints introduced:**
- All OPFS I/O must go through `cacheRepo`. Direct `navigator.storage.getDirectory()` calls must not appear outside `opfs-cache.ts`
- Every appBus event name and payload must be declared in `AppEventMap` in `src/types/index.ts`
- Branded types must only be cast at the layer that first receives the value from the IFC API

**Decisions locked in this prompt:** D-12 (Result monad), D-13 (TypedEventBus / appBus), D-14 (CacheRepository), D-15 (Brand<T,B>)

**Outcome:** Full TypeScript compilation. Infrastructure layer in place. All five stores upgraded. `buildSpatialTree()` fixes the "tree only appears after validation" bug.

---

### Prompt S3-P4 — Enhanced validator: 6 new rules, auto-tree on load, SET_PROPERTY diff, REPARENT fix, batch auto-fix, Pset editing

**Date:** 2026-05-14

**Summary:** Extended the validation and editing capabilities to cover IFC schema/normative errors. Added 6 new validation rules, fixed the spatial tree auto-build after load, implemented SET_PROPERTY diff for Pset value editing, fixed REPARENT apply at export, added batch auto-fix button in ValidationPanel, added LongName/Description inline editing in ModelTree, and added property editing in Sidebar.

**What it asked Claude to do:**
- Add 6 new rules to `validator.worker.ts`:
  - `RULE_INVALID_GUID_FORMAT` — IFC GUID must be exactly 22 chars from `[0-9A-Za-z_$]`; autoFixable
  - `RULE_SPATIAL_HIERARCHY` — IfcBuilding must contain IfcBuildingStorey, not raw elements
  - `RULE_CIRCULAR_REFERENCE` — detect cycles in `IfcRelAggregates` parent chain using visited Set
  - `RULE_EMPTY_PROPERTY_VALUE` — warn on blank `NominalValue` in `IfcPropertySingleValue`
  - `RULE_MISSING_MATERIAL` — warn on wall/slab/column/beam/roof/footing/pile with no `IfcRelAssociatesMaterial`
  - `RULE_ELEMENT_IN_BUILDING` — warn on physical elements directly under `IfcBuilding` (should be under a storey)
- Add `handleBuildTree()` to `validator.worker.ts` — builds tree via `build-tree` message, no rules
- Update `ValidatorOutMessage` union to include `{ type: 'tree-done'; id: string }`
- Update `src/types/index.ts`: add 6 fields to `RulesConfig`, update `DEFAULT_RULES`, add `SET_PROPERTY` to `EditDiff` union
- Implement `SET_PROPERTY` diff apply in `diffStore.ts` via `IfcAPI.GetLine` + `IfcAPI.WriteLine`
- Fix `REPARENT` diff apply: remove from old `IfcRelAggregates`/`IfcRelContainedInSpatialStructure`, add to new parent's rel; warn if no rel found
- Extend `IFCPropertySet` interface in `viewer.ts` with `expressId` on pset and on each property; update `formatPsets()` to populate from `@thatopen` data layer
- Add `buildSetPropertyCommand()` to `diffStore.ts`
- Update `ValidationPanel.tsx`: add 6 new `RULE_COLORS` entries; add `handleBatchFix` (batch auto-fix for `RULE_INVALID_GUID_FORMAT`); add "Fix N" button in panel header
- Update `ModelTree.tsx`: add "LN" and "D" inline edit buttons on hover for LongName and Description
- Update `Sidebar.tsx`: rewrite `PsetRow` with inline edit per property; show edit button when `prop.expressId > 0`; wire `handleEditProperty` → `buildSetPropertyCommand` → `addCommand`

**Key constraints introduced:**
- `SET_PROPERTY` diffs must carry both `psetName`/`propName` (for display) and `propExpressId` (for apply); the expressId is the authoritative key at export time
- The batch auto-fix button must not mutate the validation store; it generates `FIX_GUID` commands through the same `addCommand` path as manual fixes
- `build-tree` message path must skip all validation rule functions

**Decisions locked in this prompt:** D-16 (auto spatial tree build on model load)

**Outcome:** 16 validation rules active. Spatial tree appears immediately after model load. Pset properties editable inline. Batch auto-fix button live. REPARENT fully applied at export.

---

## Sprint 5 — Performance, Camera Controls, Scene Manager & Quantity Takeoff

### Prompt S5-P1 — Camera presets, scene manager, typed errors, takeoff, performance

**Date:** 2026-05-15

**Summary:** Added camera preset system, model transform controls, scene store, model info panel, typed error hierarchy with ts-pattern, streaming validation cancel, quantity takeoff, large-model colour performance, clash detection rule, and IFC schema version rule.

**Key deliveries:**
- `CameraControls.tsx` — floating 7-preset overlay with numpad shortcuts; `ViewerAPI.setCameraPreset()`
- `ScenePanel.tsx` — model list + visibility toggle + transform controls; `modelPivot` THREE.Group
- `ModelInfoPanel.tsx` — collapsible health pill with size/count badges
- `sceneStore.ts` — 6th Zustand store for multi-model foundation
- `errors.ts` — `AppError` + 7 domain subclasses + `tryAsync` + `ts-pattern` exhaustive routing
- `takeoffStore.ts` + `takeoff.ts` — quantity takeoff from IfcElementQuantity
- `RULE_INVALID_IFC_VERSION` (rule 17) — IFC2x3 detection from STEP header
- `RULE_ELEMENT_CLASH` (rule 18, off by default) — AABB O(n²) with 5 cm threshold
- Streaming validation cancel: `cancelValidation()` terminates worker mid-run
- Batch palette: `setColor`/`setOpacity` batched by category (≤25 calls instead of per-element)

**Decisions locked:** D-05 update (sceneStore + takeoffStore added), D-09 update (WebGPU deferred to Sprint 10)

**Outcome:** Sprint 5 complete. 18 validation rules active. Scene store ready for Sprint 6 multi-model.

---

## Sprint 6 — Multi-Model Support, Error Hardening & Build Optimisation

### Prompt S6-P1 — Full multi-model stack (6a–6f) + build optimisation

**Date:** 2026-05-16 – 2026-05-17

**Summary:** Multi-sprint series covering the complete multi-model stack. Six sub-sprints plus a build optimisation pass, committed as a single comprehensive commit on 2026-05-17.

**What it asked Claude to do:**

**6a — Core multi-model:**
- `viewer.ts`: `modelPivots: Map<string, THREE.Group>`, `getBestHit()` iterates all models, `removeModel(id)`, `setActiveModel(id)`, `frameActiveModel()`, `frameAllModels()`, `isolateModel(id)`, `showAllModels()`
- `ScenePanel.tsx`: per-row Isolate, Frame, Validate, Delete; Frame All header; isolated banner

**6b — Export, takeoff, validation filter:**
- `diffStore.ts`: `EditorCommand.modelId`, `getDiffsForModel(modelId)`, `exportAsIfc(buffer, diffs)`
- `viewer.ts`: `getModelObject(id)` for GLB export per model
- `ExportModal.tsx`: multi-model export UI
- `takeoffStore.ts`: `byModel: Record<string, ...>` + per-model selectors
- `takeoff.ts`: `computeTakeoff(modelId)` reads from modelRegistry
- `ValidationPanel.tsx`: model filter chips, `modelFilter` in useMemo deps

**6c — Error hardening:**
- `errors.ts`: `safeVoid(promise, context)` pattern
- `viewer.ts`: all `catch { /* ignore */ }` replaced with `safeVoid` or debug log
- `export.worker.ts`: `skippedDiffs` count in done response

**6d — Critical flow bugs:**
- `loader.ts`: removed `clearHistory()` from `loadFile`
- `sceneStore.removeModel`: promotes most-recent remaining model
- `modelStore.setModel`: `SetModelParams.modelId?` aligns sceneStore + modelRegistry IDs
- `validator.ts buildSpatialTree`: defers via `appBus.once('validation:complete')` if validation in progress
- `validator.ts resolveBuffer`: uses `sceneStore.activeModelId` when no explicit modelId
- `event-bus.ts model:loaded`: added `modelId: string` to payload
- `useModelSession.canValidate`: checks `modelRegistry.size() > 0`

**6e — Scene control multi-model:**
- `ViewerAPI` methods with `modelId?`: `setModelTransform`, `resetModelTransform`, `getModelBounds`, `getModelTransform`, `focusElement`, `frameElements`, `frameCategory`
- ScenePanel TransformSection: all callbacks pass explicit `model.id`

**6f — Final audit:**
- `ModelTree.tsx`: full modelId threading — `commitEdit`, all InlineEdit onCommit, Fix GUID, `guidWarning` state
- `ValidationPanel.tsx`: `modelFilter` in deps; Run button disabled; empty state
- `App.tsx`: conditional reset; `handleRemoveModel` clears selection + takeoff; `handleNavigateToLanding` resets takeoff

**Build optimisation:**
- `vite.config.ts`: `manualChunks` splitting vendor-three / vendor-ifc / vendor-ui
- `package.json`: `node --max-old-space-size=4096` for Windows OOM fix

**Decisions locked:** D-17 (per-model pivots), D-18 (modelRegistry authority), D-19 (conditional state reset), D-20 (chunk splitting)

**Outcome:** Sprint 6 complete. Build clean. 4 chunks. TypeScript zero errors. Commit: 6724a27.

### Prompt S6-P2 — Docs, SEO, ROADMAP Sprint 7+ planning

**Date:** 2026-05-17

**Summary:** Updated all documentation to reflect Sprint 6 completion and planned advanced Sprint 7–12 roadmap. Added comprehensive SEO to index.html and Landing.tsx for Google and AI search engines (Perplexity, ChatGPT, Claude).

**What it asked Claude to do:**
- `ROADMAP.md`: Mark Sprint 5 done; document Sprint 6 (6a–6f + build); write Sprint 7–12 plans leveraging `@thatopen/components-front` (OBCF.PostproductionRenderer, OBCF.LengthMeasurement, OBCF.Plans, OBCF.Sections), BCF 2.1/3.0, WebGPU, point clouds (LAS/LAZ/E57, potree), and AI-assisted validation (WebLLM/Transformers.js)
- `index.html`: Add canonical URL, JSON-LD WebApplication + SoftwareSourceCode schemas, llms.txt comment block for AI discovery, Twitter Card, full keywords, GitHub Pages URL
- `Landing.tsx`: Update hero copy and feature grid (9 cards covering all Sprint 1–6 capabilities), GitHub link in nav and footer, open-source callout section, expanded FAQ (8 questions), ARIA labels, schema.org FAQPage markup, improved alt text, GitHub CTA button
- `CONTEXT.md`: Update current state to Sprint 6 complete; add Sprint 7+ planned list; add invariants 14–17 for multi-model
- `ARCHITECTURE.md`: Update folder structure (new files, ExportModal, takeoffStore), update ViewerAPI table (new multi-model methods), add ModelRegistry section, update build table, update store table
- `DECISIONS.md`: Add D-17 (per-model pivots), D-18 (modelRegistry authority), D-19 (conditional reset), D-20 (chunk splitting)
- `readme.md`: Full rewrite — new features list, 7-store table, project structure tree, roadmap table to Sprint 12

**Key constraints introduced:**
- GitHub Pages URL: `https://j03rul4nd.github.io/ifc-viewer-online/`
- llms.txt convention embedded in index.html comment block for AI engine discovery

**Outcome:** All documentation and SEO updated. Sprint 7 (postproduction + measurements) is next.

---

## Notes for future sessions

- If you are implementing Sprint 7, start with `OBCF.PostproductionRenderer` (renderer swap) before measurements — the renderer change may affect highlights and selection overlay rendering.
- If you implement `OBC.IfcRelationsIndexer` (Sprint 8), add it as a 4th `build-tree`-adjacent step in `loader.ts` so the index is always pre-built.
- If you change the OPFS cache key format, update `DECISIONS.md` D-04 and add a cache migration path.
- If you update Zustand stores, update `ARCHITECTURE.md` (State management section) and `DECISIONS.md` D-05.
- If you implement WebGPU, update `DECISIONS.md` D-09 and `ARCHITECTURE.md` (External dependencies section).
- Every new architectural decision should get a new entry in `DECISIONS.md`.
- After completing a sprint, update the `Status` field in `ROADMAP.md` and add a new prompt entry here.
- Before adding anything to `worker.rollupOptions.external`, verify it is resolvable in a browser worker context. See `DECISIONS.md` D-11.
- `modelRegistry` is the authority for IFC buffers. Do not store large ArrayBuffers in Zustand.
- `clearHistory()` only in `handleNavigateToLanding` — never in `loadFile`. See D-19.

---

*Last updated: 2026-05-17 · Sprints 1–6 complete · Sprint 7 next*
