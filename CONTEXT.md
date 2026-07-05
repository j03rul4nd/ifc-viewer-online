> **If you are a Claude session starting work on this repo, read all files listed below before writing any code.**
> Required reading: `CONTEXT.md` (this file) → `ARCHITECTURE.md` → `IFC_DOMAIN.md` → `DECISIONS.md` → `ROADMAP.md` → `PROMPTS.md`
>
> **★ Product direction (2026-07-04):** the forward plan is the **delivery-conformance platform** ("DocuSign for BIM deliveries"), growing **gate → lightweight CDE** by phases. Before any conformance / backend / CDE work also read: `docs/CDE_VISION.md` → `docs/CONFORMANCE_DOMAIN.md` → `docs/CDE_ARCHITECTURE.md` → `docs/INTEGRATIONS.md` → `docs/CONFORMANCE_PATTERNS.md` → `docs/CDE_ROADMAP.md`. New decisions **D-27/D-28** in `DECISIONS.md`. Private strategy suite: `docs-planning/vision/`.

---

# IFC Viewer Online — Project Context

## What this product is

A browser-only IFC model viewer, validator, and non-destructive editor targeting architects and BIM coordinators who work with large, complex building models. The app runs entirely client-side: IFC files are parsed in a Web Worker via WebAssembly, rendered via WebGL (Three.js / @thatopen), and never leave the user's machine. Multiple IFC files can be loaded simultaneously for side-by-side inspection and comparison.

## Who uses it and why

Architects and BIM coordinators who need to quickly inspect and validate IFC exports from authoring tools (Revit, ArchiCAD, Tekla, Allplan). The primary pain point is that competing web viewers are slow on large files (100–200 MB) and require upload. This product is faster because it caches parsed geometry in the browser's Origin Private File System and skips re-parsing on subsequent loads.

**Persona split (resolution 2026-05-29).** The **buyer** is the BIM coordinator — they own conformance and will pay to enforce it. The **mandated free user** is the exporter (architect/engineer) who is told to run a check before handing off a model. The handoff between them is the growth loop: a coordinator shares a report, the exporter opens it, fixes issues, re-shares. The Health Score is the acquisition *hook*; project/issue conformance is the retention *engine*. Roadmap priorities follow from this — see `ROADMAP.md` Roadmap v2.

**Live app:** `https://www.ifcvieweronline.eu/`  
**GitHub:** `https://github.com/j03rul4nd/ifc-viewer-online`

---

## Current state (Sprints 1–9 complete + IDS / GIS / embed shipped — updated 2026-06-21)

> **Note (2026-05-29):** This document previously claimed "Sprint 6 complete" and listed postprocessing, measurements, floor plans, section cuts, and BCF as "not yet implemented." That was stale — all of those shipped (Sprints 7–9).
> **Note (2026-06-21, doc-sync against code):** Several more things shipped since the v2 reset and are now reflected below: **buildingSMART IDS 1.0** (full six-facet checking, golden-tested), **3D Map / GIS mode** (flag-gated), the **BCF panel**, **embed + JS SDK**, the **mobile UI**, the **personalized-invite/attribution** system, and the four-phase **validation hardening**. The built-in validator now has **44 rules** (not 38). Zustand store count is now **11** (added `bcfStore`, `idsStore`, `geoStore`, `waiverStore`). Deploy target is **Vercel** (GitHub Pages was dropped). Forward priorities are not sprint-numbered; see `ROADMAP.md` Roadmap v2 + the Solibri-parity backlog.

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
- **Zustand stores (13)** — `modelStore`, `validationStore`, `editorStore`, `uiStore`, `sceneStore`, `toastStore`, `takeoffStore`, `bcfStore`, `idsStore`, `geoStore`, `waiverStore`, `captureStore`, `presentationStore` — all with Zustand devtools, named actions, and typed selectors. `editorStore` emits `appBus` events on every mutation.
- **IFC validation — 44 rules** — `validator.worker.ts` runs rule-based checks off the main thread (18 core + 11 spatial/file-header incl. ISO 19650 + 9 LOD/classification/MEP + 6 geometry/storey integrity). Streams partial results into `validationStore`. Emits `appBus` events for full lifecycle. All messages validated via zod schemas before routing. Full list in `ARCHITECTURE.md`. `DEFAULT_RULES` in `src/types/index.ts` is the canonical count.
- **buildingSMART IDS 1.0** — `ids.worker.ts` + pure-TS engine (`src/lib/ids/`) check a user-supplied `.ids` spec against the model. All six facets, golden-tested against 100 official bSI testcases. `IdsPanel` docks beside `ValidationPanel`; export to JSON/CSV/HTML/BCF; check-all-models; run-diff; SDK `checkIds()`. See `docs/IDS_IMPLEMENTATION_PLAN.md`.
- **3D Map / GIS mode** (flag-gated `VITE_FEATURE_GIS`) — places a georeferenced model on a real-world basemap + optional 3D terrain inside the existing scene. `geoStore`, `GeoPanel`, `geo-extract.worker.ts`, `geo-terrain.worker.ts`, `src/lib/geo/`. See `docs/GIS_MAP_MODE.md`.
- **BCF 2.1 / 3.0** — `bcf-parser.worker.ts` import + `bcf.ts` export; `BcfPanel` with topic CRUD, comments, viewpoint capture, filters; `bcfStore` (persisted).
- **Measurements / floor plans / sections** — length/area/edge/volume measurement tools, 2D floor plans per storey, clipping/section planes (Sprints 7–8).
- **Embed + JS SDK** — iframe/URL-param embedding (`?model=&embed=&ui=`), two-way `postMessage`, ~6 KB dependency-free `IfcViewer` SDK (`src/sdk/` → `public/sdk/`). See `docs/EMBED_URL_PARAMS.md`, `docs/IFC_VIEWER_SDK.md`.
- **Mobile UI** — `useIsMobile` + `MobileBottomNav` + bottom-sheet IDS/Validation panels (`src/components/mobile/`).
- **Validation hardening** — honest coverage (`validation-coverage.ts`), actionable score (`explainQualityScore`, "fix first"), Pro controls (`severityOverrides`, `waiverStore`, thresholds), run-diff (`validation-diff.ts` + `RunDiffBar`).
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
- **Clash detection** — `RULE_ELEMENT_CLASH` (off by default); AABB O(n²) with 5 cm threshold.
- **Infrastructure layer** — `Result<T,E>` monad, `TypedEventBus`, `createLogger`, `Brand<T,B>` nominal types, runtime type guards, `invariant/assertNever`, `safeVoid`, `ErrorBoundary`.
- **Facade hooks** — `useModelSession()`, `useAppEvent()`, `useValidationRunner()`, `useElementFocus()`, `usePersistedPreferences()`, `useKeyboardShortcuts()`.
- **Capture Toolkit** — toolbar screenshot (composed canvas via `takeSnapshot()`, clipboard + PNG download), retroactive replay buffer (`useCanvasReplayBuffer`: two staggered MediaRecorders, last 5/15/30 s as WebM, auto-pause on hidden tab), and GIF export in a dedicated non-WASM worker (`gif-export.worker.ts` + `gifenc`, streamed frames with progress). Preview modal with trim/fps/resolution/watermark. `captureStore` (12th store), `capture:*` appBus events, desktop-only replay (mobile degrades to screenshot). See `DECISIONS.md` D-23.
- **Tour Mode (guided walkthrough)** — linear presentation mode for coordinator→exporter handoff meetings: auto-generated tour from validation issues (one step per rule, worst first, grouped — `src/lib/tour/generateAutoTour.ts`) or manually recorded camera stops (shares the BCF viewpoint capture primitive `getCameraViewpoint()`). `TourPlayer` bottom bar (camera fly-to via native camera-controls easing, highlight overlay reuse, D-22 remediation text per step, isolate toggle, Capture Toolkit at hand), `TourRecorder` (add/reorder/caption stops), `presentationStore` (13th store, session-only), `tour:*` appBus events. Works in embed kiosk. See `DECISIONS.md` D-24.
- **Client Presentation Mode (`ui=client`)** — show-only skin for non-technical audiences (D-25): `uiStore.clientMode` layered over the embed chrome (instant toggle, no remount; model/camera persist), all technical panels/editing hidden, `ClientHealthBadge` (semantic score ring + tier phrase via `clientScoreTier`, one-click verify CTA), "View walkthrough" CTA wired to Tour Mode, simplified capture pill, discreet presenter gear (measurement/section on demand + exit), postpro quality on while active. 4th `EmbedUiPreset` (`?ui=client`, SDK, EmbedModal) + in-app entry (Toolbar `···`). i18n `client` ×10.
- **Presentation templates + shareable tour links** — three goal-driven presets over Tour/Client/Capture (D-26): `social` (showcase ≤5 pasos, 1:1, watermark on, one-click LinkedIn GIF), `client-walkthrough` (showcase ≤10, `ui=client`, opt-in improvements step), `technical-review` (= D-24 severity default, named). `applyTemplate()` orchestrates existing stores; `generateAutoTour` gained a `strategy` param; aspect = centre-crop at frame extraction (`computeCropRect`), never a re-render. Share links: `#tour=<base64>` hash (D-21 pattern, codec in `src/lib/share/tourShareLink.ts`, sanitised on decode) + existing `?model=` — auto-playback on open; honest `no-model-url` limit for disk-loaded models. Score headline gated by the 70-point honesty threshold (`scoreIsHeadlineWorthy`).
- **Build optimisation** — Vite chunk splitting: `vendor-three`, `vendor-ifc`, `vendor-ui`, app entry; `--max-old-space-size=4096` for Windows OOM fix.
- **Unit tests** — 11 tests in `loader.test.ts` (Vitest), additional tests in `ifc-guards.test.ts`.

### Partially implemented / stubs

- `loadIfc()` on `ViewerAPI` — still exists and works for direct IFC loading without the cache/worker pipeline, but is not called from `App.tsx`. It is a fallback/testing entry point.
- GPU memory estimate in `getGpuEstimateBytes()` — uses a rough heuristic based on `WebGLRenderer.info.memory`.
- `IFCPropertySet.expressId` per property — populated by `formatPsets()` in `viewer.ts` from the `@thatopen` data layer; available when `prop.expressId > 0`.

### Shipped since this doc was last accurate (Sprints 7–9 + post-v2)

- ✅ Postproduction renderer (SSAO, edge rendering) — Sprint 7
- ✅ Measurement tools (length, area, edge, volume) — Sprint 7
- ✅ Floor plan 2D views from IfcBuildingStorey — Sprint 8
- ✅ Clipping planes / section cuts — Sprint 8
- ✅ BCF 2.1 / 3.0 import and export + dedicated BCF panel — Sprint 9 / post-v2
- ✅ buildingSMART IDS 1.0 (six-facet, golden-tested) — post-v2 (`docs/IDS_IMPLEMENTATION_PLAN.md`)
- ✅ 3D Map / GIS mode (flag-gated) — post-v2 (`docs/GIS_MAP_MODE.md`)
- ✅ Embed + JS SDK — post-v2 (`docs/EMBED_URL_PARAMS.md`, `docs/IFC_VIEWER_SDK.md`)
- ✅ Mobile UI + personalized invite/attribution + validation hardening — post-v2

### Deferred or killed (resolution 2026-05-29 — see `ROADMAP.md` Roadmap v2)

- ❌ WebGPU renderer (old Sprint 10) — deferred indefinitely; no documented perf pain.
- ❌ Point cloud overlays (LAS/LAZ/E57) / scan-to-BIM / AR (old Sprint 11) — killed; different product and buyer, violates large-file constraint.
- ❌ AI-assisted validation / natural language query (old Sprint 12) — killed as AI slop; the useful slice (per-rule fix guidance) is reclassified as a deterministic content table in i18n.

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
| `docs/DEPLOYMENT.md` | Vercel deployment, WASM paths, COEP/COOP strategy, production bug history |
| `docs/IDS_IMPLEMENTATION_PLAN.md` | buildingSMART IDS 1.0 — engine, facets, worker, golden tests (SHIPPED banner up top) |
| `docs/GIS_MAP_MODE.md` · `docs/GIS_MAP_INTEGRATION_PLAN.md` | 3D Map / GIS mode — user guide + architecture |
| `docs/IFC_VIEWER_SDK.md` · `docs/EMBED_URL_PARAMS.md` | Embed + JS SDK reference |
| `docs/INVITE_SYSTEM.md` | Personalized invite + cookieless attribution system |
| `docs/CDE_VISION.md` | **Conformance-CDE** north-star vision, personas, years-out product image |
| `docs/CONFORMANCE_DOMAIN.md` | The 7 conformance entities, state machines, immutability/audit invariants (D-28) |
| `docs/CDE_ARCHITECTURE.md` | Client + cloud system architecture, privacy boundary, D-27 |
| `docs/INTEGRATIONS.md` | Integration contracts: SDK/embed, signed certificate + verify, CDE connectors, BCF, verify-batch API |
| `docs/CONFORMANCE_PATTERNS.md` | Engineering patterns for building the platform (entitlement, lazy auth, canonical/signature contract, migrations) |
| `docs/CDE_ROADMAP.md` | Conformance-CDE forward plan — phases F0..F6, tasks, files-to-touch, moat per phase |

---

## Key invariants every future session must respect

1. **No server-side processing of the model.** The IFC file never leaves the browser — no upload endpoints, no server parse/validate. *Clarification (2026-05-29):* **stateless edge Workers are permitted** as long as they never receive the model. The existing Cloudflare Worker (`cf-worker/`) is a pure email proxy; a future shared-report SSR route may receive only the already-computed report summary (score + condensed issue list) for crawlability. Edge compute that touches the IFC bytes remains forbidden. See `DECISIONS.md` D-21. *Amendment (2026-07-04, D-27 — proposed / founder-gated):* server-side model processing becomes permitted **only in F6** and **only** under opt-in + paid-only + 72 h-retention + honest-copy + SSRF-hardened conditions; F0–F5 keep this invariant fully intact (only derived JSON + a locally-computed `sha256` transit the edge). See `DECISIONS.md` D-27 and `docs/CDE_ROADMAP.md` (F6).
2. **@thatopen/components is the 3D/IFC layer.** Do not add raw `web-ifc` imports to `src/` outside the workers.
3. **All IFC parsing runs in `src/workers/ifc-parser.worker.ts`.** Main thread must not block during parse.
4. **All IFC validation runs in `src/workers/validator.worker.ts`.** Main thread only receives results via the Zustand store.
5. **TypeScript strict mode.** No `any` escapes. `tsconfig.json` has `strict: true`.
6. **Do not modify** `tailwind.config.js`, `postcss.config.js`, or Radix UI component internals unless the task explicitly targets them.
7. **COOP/COEP headers are required.** Set in `vite.config.ts` (dev) and via `coi-serviceworker.js` (production on Vercel — `vercel.json` does not set these headers, so the service worker is what enables cross-origin isolation).
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

*Last updated: 2026-07-03 (Capture Toolkit + Tour Mode + Client Presentation Mode) · Sprints 1–9 complete + IDS 1.0 / 3D Map (GIS) / BCF panel / embed+SDK / mobile UI / Capture Toolkit / Tour Mode / Client Mode shipped · 44 validation rules · 13 Zustand stores · 8 workers · Deploy: Vercel · Forward plan: ROADMAP.md Roadmap v2 + Solibri-parity backlog*
