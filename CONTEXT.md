> **If you are a Claude session starting work on this repo, read all files listed below before writing any code.**
> Required reading: `CONTEXT.md` (this file) → `ARCHITECTURE.md` → `IFC_DOMAIN.md` → `DECISIONS.md` → `ROADMAP.md` → `PROMPTS.md`

---

# IFC Viewer Online — Project Context

## What this product is

A browser-only IFC model viewer and validator targeting architects who work with large, complex building models. The app runs entirely client-side: IFC files are parsed in a Web Worker via WebAssembly, rendered via WebGL (Three.js / @thatopen), and never leave the user's machine. The product roadmap extends this viewer into a validator and non-destructive editor — Sprint 3 is in progress; Sprint 4 is planned.

## Who uses it and why

Architects and BIM coordinators who need to quickly inspect and validate IFC exports from authoring tools (Revit, ArchiCAD, Tekla, Allplan). The primary pain point is that competing web viewers are slow on large files (100–200 MB) and require upload. This product is faster because it caches parsed geometry in the browser's Origin Private File System and skips re-parsing on subsequent loads.

---

## Current state (as of Sprint 3 — in progress)

### Works

- **Landing page** — marketing page with hero, feature grid, FAQ, CTA. Fully static, no data dependencies.
- **IFC loading pipeline** — `useIfcLoader` hook orchestrates: OPFS cache check → Web Worker parse (IfcImporter) → fragments binary → viewer render. Real progress events. Cache persists across page reloads.
- **Pre-flight IFC guards** — `validateIfcBuffer()` in `ifc-guards.ts` checks for empty buffer, wrong file signature, and file size before WASM initialisation.
- **Toast notifications** — `toastStore` + `ToastContainer.tsx`; all error/warning/info messages surface as non-blocking toasts.
- **3D viewer** — OBC world with WebGL renderer, realistic lighting (hemisphere + directional with shadows), orbit/pan/zoom camera controls.
- **Per-category palette** — 25 IFC types have assigned colours and opacity. Applied after every load.
- **Element selection** — click any element to highlight it (blue overlay) and see its IFC type, display name, and Express ID in the Properties tab.
- **Hover highlight** — lighter blue overlay on hover; cursor changes to pointer over elements.
- **Category panel** — lists all IFC types in the loaded model with element counts, colour swatches, hide/show toggles, and isolation.
- **Filter/isolate** — hide individual categories; isolate a single category; frame camera to a category's bounding box.
- **Three viewer styles** — `shaded` (default palette), `blueprint` (flat grey), `xray` (global 20% opacity).
- **OPFS cache management** — list, delete, quota display. Badge when models are cached.
- **Memory tracking** — polls `performance.measureUserAgentSpecificMemory()` (crossOriginIsolated) or `performance.memory` fallback every 4 s.
- **Zustand stores** — `modelStore`, `validationStore`, `editorStore`, `uiStore`, `toastStore` all implemented and wired.
- **IFC validation** — `validator.worker.ts` runs rule-based checks off the main thread; `runValidation()` in `validator.ts` streams partial results into the Zustand `validationStore`. Rules: empty name/longname, duplicate names, naming convention patterns, missing type, duplicate GUID, missing property sets, orphan elements, wrong container, broken aggregates.
- **Spatial tree** — `ModelTree.tsx` renders the spatial hierarchy (Project → Site → Building → Storey → elements) from `validationStore.spatialTree`. Virtualised with `@tanstack/react-virtual`.
- **ValidationPanel** — `ValidationPanel.tsx` shows validation results with filtering by severity, rule, grouping, and text search.
- **Non-destructive editing** — `editorStore` holds edit diffs as `EditDiff[]` with full undo/redo command history. `diffStore.ts` provides `buildRenameCommand`, `buildFixGuidCommand` helpers. `useEditorHistory` binds keyboard shortcuts.
- **Unit tests** — 11 tests in `loader.test.ts` (Vitest), additional tests in `ifc-guards.test.ts`.

### Partially implemented / stubs

- `loadIfc()` on `ViewerAPI` — still exists and works for direct IFC loading without the cache/worker pipeline, but is not called from `App.tsx`. It is a fallback/testing entry point.
- GPU memory estimate in `getGpuEstimateBytes()` — uses a rough heuristic based on `WebGLRenderer.info.memory`.
- Inline attribute editing UI — `editorStore` and command infrastructure are complete; the tree-node editing form in `ModelTree.tsx` may not be fully wired to the viewer highlight layer.

### Not implemented (Sprint 4)

- 3D error highlights (red/amber materials on elements with validation issues)
- IFC export (apply diffs via `web-ifc IfcAPI.WriteLine` → `ExportFileAsIFC` → browser download)
- GLB export (Three.js `GLTFExporter`)
- Explicit memory management / dispose on model unload
- WebGPU renderer

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

---

*Last updated: 2026-05-09 · Current sprint: 3 (in progress)*
