> **If you are a Claude session starting work on this repo, read all files listed below before writing any code.**
> Required reading: `CONTEXT.md` (this file) → `ARCHITECTURE.md` → `IFC_DOMAIN.md` → `DECISIONS.md` → `ROADMAP.md` → `PROMPTS.md`

---

# IFC Viewer Online — Project Context

## What this product is

A browser-only IFC model viewer targeting architects who work with large, complex building models. The app runs entirely client-side: IFC files are parsed in a Web Worker via WebAssembly, rendered via WebGL (Three.js / @thatopen), and never leave the user's machine. The product roadmap extends this viewer into a validator and non-destructive editor — Sprint 3 and beyond — but the codebase today contains only the viewer and loading pipeline.

## Who uses it and why

Architects and BIM coordinators who need to quickly inspect and validate IFC exports from authoring tools (Revit, ArchiCAD, Tekla, Allplan). The primary pain point is that competing web viewers are slow on large files (100–200 MB) and require upload. This product is faster because it caches parsed geometry in the browser's Origin Private File System and skips re-parsing on subsequent loads.

---

## Current state (as of Sprint 2)

### Works

- **Landing page** — marketing page with hero, feature grid, FAQ, CTA. Fully static, no data dependencies.
- **IFC loading pipeline** — `useIfcLoader` hook orchestrates: OPFS cache check → Web Worker parse (IfcImporter) → fragments binary → viewer render. Real progress events. Cache persists across page reloads.
- **3D viewer** — OBC world with WebGL renderer, realistic lighting (hemisphere + directional with shadows), orbit/pan/zoom camera controls.
- **Per-category palette** — 25 IFC types have assigned colours and opacity (walls, slabs, windows, MEP, etc.). Applied after every load.
- **Element selection** — click any element to highlight it (blue overlay) and see its IFC type, display name, and Express ID in the Properties tab.
- **Hover highlight** — lighter blue overlay on hover; cursor changes to pointer over elements.
- **Category panel** — lists all IFC types in the loaded model with element counts, colour swatches, hide/show toggles, and isolation (frame camera to that category).
- **Filter/isolate** — hide individual categories; isolate a single category (hides everything else); frame camera to a category's bounding box.
- **Three viewer styles** — `shaded` (default palette), `blueprint` (flat grey), `xray` (global 20% opacity).
- **OPFS cache management** — `listCacheEntries`, `deleteCacheEntry`, quota display via StorageManager API. App shows a badge when models are cached; click to clear.
- **Memory tracking** — polls `performance.measureUserAgentSpecificMemory()` (crossOriginIsolated) or `performance.memory` fallback every 4 s.
- **Scheduler** — `yieldToMain()` using `scheduler.postTask()` with `setTimeout(0)` fallback.
- **Unit tests** — 11 tests in `src/lib/loader.test.ts` (Vitest): cache key generation, OPFS hit/miss, progress event sequencing.

### Partially implemented / stubs

- `loadIfc()` on `ViewerAPI` — still exists and works for direct IFC loading without the cache/worker pipeline, but is not called from `App.tsx`. It is a fallback/testing entry point.
- GPU memory estimate in `getGpuEstimateBytes()` — uses a rough heuristic based on `WebGLRenderer.info.memory` geometry/texture counts, not actual VRAM measurement.
- OPFS cache badge in `App.tsx` is a minimal proof-of-concept, not a full cache management panel.

### Not implemented

- IFC Validator engine (Sprint 3)
- Spatial hierarchy tree with inline editing (Sprint 3)
- Diff/edit store (non-destructive edits) (Sprint 4)
- Validation report panel + 3D error highlights (Sprint 4)
- IFC/GLB export (Sprint 4)
- WebGPU renderer (planned, detected at runtime, Three.js `three/webgpu` build exists in node_modules but not wired up)
- Zustand state management (all state is local React `useState` in `App.tsx`)
- Virtualised spatial tree (no virtualization library installed)

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

---

## Key invariants every future session must respect

1. **No server-side processing.** Files stay in the browser. No upload endpoints.
2. **@thatopen/components is the 3D/IFC layer.** Do not add raw `web-ifc` imports to `src/` outside the parse worker.
3. **All IFC parsing runs in `src/workers/ifc-parser.worker.ts`.** Main thread must not block during parse.
4. **TypeScript strict mode.** No `any` escapes. `tsconfig.json` has `strict: true`.
5. **Do not modify** `tailwind.config.js`, `postcss.config.js`, or Radix UI component internals unless the task explicitly targets them.
6. **COOP/COEP headers are required.** They are set in `vite.config.ts` and must not be removed (SharedArrayBuffer + memory API depend on them).
7. **`loadIfc()` on ViewerAPI is a legacy entry point.** New code should call `loadFragments()` after producing a binary via the worker or cache.

---

*Last updated: 2026-04-19 · Current sprint: 2 (complete)*
