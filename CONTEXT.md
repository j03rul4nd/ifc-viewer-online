> **If you are a Claude session starting work on this repo, read all files listed below before writing any code.**
> Required reading: `CONTEXT.md` (this file) → `ARCHITECTURE.md` → `IFC_DOMAIN.md` → `DECISIONS.md` → `ROADMAP.md` → `PROMPTS.md`

---

# IFC Viewer Online — Project Context

## What this product is

A browser-only IFC model viewer, validator, and non-destructive editor targeting architects and BIM coordinators who work with large, complex building models. The app runs entirely client-side: IFC files are parsed in a Web Worker via WebAssembly, rendered via WebGL (Three.js / @thatopen), and never leave the user's machine. Multiple IFC files can be loaded simultaneously for side-by-side inspection and comparison.

## Who uses it and why

Architects and BIM coordinators who need to quickly inspect and validate IFC exports from authoring tools (Revit, ArchiCAD, Tekla, Allplan). The primary pain point is that competing web viewers are slow on large files (100–200 MB) and require upload. This product is faster because it caches parsed geometry in the browser's Origin Private File System and skips re-parsing on subsequent loads.

**Live app:** `https://j03rul4nd.github.io/ifc-viewer-online/`  
**GitHub:** `https://github.com/j03rul4nd/ifc-viewer-online`

---

## Current state (Sprint 6 complete — 2026-05-17)

### Works

- **Landing page** — marketing page with hero, feature grid, FAQ, CTA. Fully static, no data dependencies.
- **IFC loading pipeline** — `useIfcLoader` hook orchestrates: OPFS cache check → Web Worker parse (IfcImporter) → fragments binary → viewer render. Real progress events. Cache persists across page reloads. Emits `model:loaded` (with `modelId`) on `appBus` after every successful load.
- **Multi-model loading** — N simultaneous IFC files; each model gets its own pivot group, own entry in sceneStore, modelRegistry, validationStore spatial tree, and takeoffStore.
- **Pre-flight IFC guards** — `validateIfcBuffer()` in `ifc-guards.ts` checks for empty buffer, wrong file signature, and file size before WASM initialisation.
- **Toast notifications** — `toastStore` + `ToastContainer.tsx`; all error/warning/info messages surface as non-blocking toasts. `toastFromError()` handles any unknown error type.
- **3D viewer** — OBC world with WebGL renderer, realistic lighting (hemisphere + directional with shadows), orbit/pan/zoom camera controls.
- **Per-category palette** — 25 IFC types have assigned colours and opacity. Applied after every load.
- **Element selection** — click any element to highlight it and see its IFC attributes, GlobalId, LongName, Description, Storey, and full property sets in the Sidebar. Click stamps `modelId` on selection.
- **Hover highlight** — lighter blue overlay on hover; cursor changes to pointer over elements.
- **Category panel** — lists all IFC types in the loaded model with element counts, colour swatches, hide/show toggles, and isolation.
- **Filter/isolate** — hide individual categories; isolate a single category; frame camera to a category's bounding box.
- **Three viewer styles** — `shaded` (default palette), `blueprint` (flat grey), `xray` (global 20% opacity).
- **OPFS cache management** — list, delete, quota display. Badge when models are cached. Repository pattern wraps all OPFS I/O with `Result<T,E>` returns. Cache key prefix `v2`.
- **Memory tracking** — polls `performance.measureUserAgentSpecificMemory()` (crossOriginIsolated) or `performance.memory` fallback every 4 s.
- **Zustand stores** — `modelStore`, `validationStore`, `editorStore`, `uiStore`, `sceneStore`, `toastStore`, `takeoffStore` — all with Zustand devtools, named actions, and typed selectors. `editorStore` emits `appBus` events on every mutation.
- **IFC validation — 18 rules** — `validator.worker.ts` runs rule-based checks off the main thread. Streams partial results into `validationStore`. Emits `appBus` events for full lifecycle. All messages validated via zod schemas before routing.
- **Validation highlights per model** — `validationHighlightedByModel: Map<string, Set<number>>`; each model's errors are tracked independently.
- **Spatial tree — auto-built on load** — `buildSpatialTree()` triggers automatically after every model load via `build-tree` worker message. `ModelTree.tsx` renders immediately. Virtualised with `@tanstack/react-virtual`.
- **Inline editing in tree** — Name, LongName, Description fields editable inline. GlobalId regenerable via double-click + confirmation modal. All edits carry `modelId`.
- **Property set editing in Sidebar** — Each Pset property value has an inline edit button that commits a `SET_PROPERTY` diff.
- **ValidationPanel** — `ValidationPanel.tsx` shows validation results with filtering by severity, rule, grouping, text search, and model. **Batch auto-fix button** applies all auto-fixable issues at once. Run button works for multi-model sessions.
- **Non-destructive editing** — `editorStore` holds `EditDiff[]` with full undo/redo command history. All commands carry `modelId`. `getDiffsForModel(modelId)` filters history for export. Diff types: `RENAME`, `FIX_GUID`, `REPARENT`, `SET_PROPERTY`.
- **IFC export per model** — export worker applies diffs for a specific model; `ExportModal` for multi-model sessions.
- **GLB export per model** — `viewer.getModelObject(id)` returns the Three.js Object3D for GLB export.
- **Multi-model export** — `ExportModal.tsx` shows all loaded models with per-row IFC + GLB buttons and "Export all" footer actions.
- **ScenePanel multi-model UX** — per-row Isolate, Frame, Validate, Delete; Frame All; "isolated" banner; active model highlighting; transform section with explicit model.id.
- **Model transform controls** — ScenePanel position/rotation/scale inputs; "Snap to grid"; `modelPivot` group keeps IFC placement untouched. All transforms pass explicit `modelId`.
- **Camera preset system** — `CameraControls.tsx` floating overlay (ISO/Top/Front/Back/Left/Right/Bottom), collapses to icon; numpad shortcuts.
- **Model info panel** — `ModelInfoPanel.tsx` collapsible pill showing active model's file size, element count, health badges.
- **Quantity takeoff** — `TakeoffPanel` in Sidebar "Quantities" tab; reads `IfcElementQuantity`; per-model results in `takeoffStore`.
- **Clash detection** — `RULE_ELEMENT_CLASH` (18th rule, off by default); AABB O(n²) with 5 cm threshold.
- **Infrastructure layer** — `Result<T,E>` monad, `TypedEventBus`, `createLogger`, `Brand<T,B>` nominal types, runtime type guards, `invariant/assertNever`, `safeVoid`, `ErrorBoundary`.
- **Facade hooks** — `useModelSession()`, `useAppEvent()`, `useValidationRunner()`, `useElementFocus()`, `usePersistedPreferences()`, `useKeyboardShortcuts()`.
- **Build optimisation** — Vite chunk splitting: `vendor-three`, `vendor-ifc`, `vendor-ui`, app entry; `--max-old-space-size=4096` for Windows OOM fix.
- **Unit tests** — 11 tests in `loader.test.ts` (Vitest), additional tests in `ifc-guards.test.ts`.

### Partially implemented / stubs

- `loadIfc()` on `ViewerAPI` — still exists and works for direct IFC loading without the cache/worker pipeline, but is not called from `App.tsx`. It is a fallback/testing entry point.
- GPU memory estimate in `getGpuEstimateBytes()` — uses a rough heuristic based on `WebGLRenderer.info.memory`.
- `IFCPropertySet.expressId` per property — populated by `formatPsets()` in `viewer.ts` from the `@thatopen` data layer; available when `prop.expressId > 0`.

### Not yet implemented (Sprint 7+)

- Postproduction renderer (SSAO, edge rendering, bloom) — Sprint 7
- Measurement tools (length, area, edge, volume) — Sprint 7
- Floor plan 2D views from IfcBuildingStorey — Sprint 8
- Clipping planes / section cuts — Sprint 8
- BCF 2.1 / 3.0 import and export — Sprint 9
- WebGPU renderer — Sprint 10
- Point cloud overlays (LAS/LAZ/E57) — Sprint 11
- AI-assisted validation / natural language query — Sprint 12

---

## Documentation suite

| File | Contents |
|---|---|
| `CONTEXT.md` | This file — product overview, current state, reading order |
| `ARCHITECTURE.md` | Folder map, data flow diagram, component responsibilities, dependency rationale |
| `IFC_DOMAIN.md` | IFC concepts, spatial hierarchy, entity types, expressId, relationships, web-ifc constraints |
| `DECISIONS.md` | Architectural decision log with alternatives, reasons, and consequences |
| `ROADMAP.md` | Sprint-by-sprint plan (status, goals, deliverables, constraints) |
| `PROMPTS.md` | Log of Claude Code prompts used to build the project |
| `docs/DEPLOYMENT.md` | GitHub Pages deployment, WASM paths, COEP/COOP strategy, production bug history |

---

## Key invariants every future session must respect

1. **No server-side processing.** Files stay in the browser. No upload endpoints.
2. **@thatopen/components is the 3D/IFC layer.** Do not add raw `web-ifc` imports to `src/` outside the workers.
3. **All IFC parsing runs in `src/workers/ifc-parser.worker.ts`.** Main thread must not block during parse.
4. **All IFC validation runs in `src/workers/validator.worker.ts`.** Main thread only receives results via the Zustand store.
5. **TypeScript strict mode.** No `any` escapes. `tsconfig.json` has `strict: true`.
6. **Do not modify** `tailwind.config.js`, `postcss.config.js`, or Radix UI component internals unless the task explicitly targets them.
7. **COOP/COEP headers are required.** Set in `vite.config.ts` (dev) and via `coi-serviceworker.js` (production/GitHub Pages).
8. **`loadIfc()` on ViewerAPI is a legacy entry point.** New code must call `loadFragments()` after producing a binary via the worker or cache.
9. **Edits are keyed by GlobalId, not Express ID.** Express IDs are reassigned on every IFC re-export; GlobalId is the stable identifier.
10. **Worker bundles must not externalize bare module specifiers** (`three`, etc.). Externalizing causes unresolvable imports in browser worker context (production-only crash). See `DECISIONS.md` D-11.
11. **All user model transforms go through `modelPivot`.** Do not modify `model.object.matrix` or `.position` directly — use `ViewerAPI.setModelTransform(transform, modelId)`.
12. **`sceneStore` holds only serialisable data.** Three.js geometry management stays in `viewer.ts`.
13. **Worker messages must be validated via zod schemas** in `worker-schemas.ts` before routing. Extend the schemas when adding new message types.
14. **`modelRegistry` is the authority for IFC buffers per model.** Do not read `modelStore.ifcBuffer` for multi-model operations. Use `modelRegistry.getBuffer(modelId)`.
15. **`getDiffsForModel(modelId)` filters the diff history.** Always pass `modelId` when building per-model export payloads.
16. **Clearing history (`clearHistory()`) only happens in `handleNavigateToLanding`.** Never call it inside `loadFile`.
17. **Transform callbacks in ScenePanel pass explicit `model.id`.** Do not rely on the viewer's current active model — always be explicit.

---

*Last updated: 2026-05-17 · Sprints 1–6 complete · Current sprint: 7 (planned)*
