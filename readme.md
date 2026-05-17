# IFC Viewer Online

A browser-only IFC model viewer, validator, and non-destructive editor built for architects and BIM coordinators who need fast, private inspection of large building models. Files are parsed in a Web Worker via WebAssembly, rendered in WebGL, and **never leave your machine**.

**Live app:** https://j03rul4nd.github.io/ifc-viewer-online/

---

## Features

### Loading & Performance
- **Fast loading** — IFC files are parsed off the main thread via a dedicated Web Worker using WebAssembly (`@thatopen/fragments` `IfcImporter`). The UI stays responsive during parse.
- **OPFS cache** — parsed geometry is stored in the browser's Origin Private File System. Subsequent loads skip the expensive WASM parse entirely (~10× faster).
- **Multi-model** — load multiple IFC files simultaneously. Each model has independent transforms, visibility, validation results, and export.

### 3D Viewer
- **WebGL rendering** — hardware-accelerated 3D with realistic lighting (hemisphere + directional shadows), orbit/pan/zoom controls, and per-category colour palette for 25 IFC element types.
- **Element selection** — click any element to highlight it; Sidebar shows IFC type, GlobalId, display name, Storey, and full property sets.
- **Category panel** — toggle/isolate categories; frame camera to a category's bounding box.
- **Viewer styles** — `shaded` (palette colours), `blueprint` (flat grey), `xray` (global 20% opacity).
- **Camera presets** — ISO, Top, Bottom, Front, Back, Left, Right via floating overlay; numpad keyboard shortcuts.
- **Model transforms** — non-destructive position/rotation/scale per model via ScenePanel. Snap-to-grid and reset.

### Validation — 18 Rules
- **Off-thread validation** — runs in a dedicated Web Worker; streams partial results into a filterable report panel.
- **18 built-in rules** covering: empty names, duplicate GUIDs, invalid GUID format, naming conventions, missing type assignments, missing property sets, orphan elements, wrong containers, broken aggregates, spatial hierarchy violations, circular references, empty property values, missing materials, elements placed directly under a building, outdated IFC schema version (IFC2x3 detection), and AABB clash detection.
- **Live progress** — Toolbar Validate button shows rule-by-rule progress (`N%`) with an animated underline bar; click to cancel.
- **3D error highlights** — red/amber/blue material overlay on elements with errors/warnings/info per model.
- **Batch auto-fix** — one-click fix for all auto-fixable issues (invalid/duplicate GUIDs).
- **Multi-model filter** — filter issues by model when multiple files are loaded.

### Non-Destructive Editing
- **Spatial tree** — navigable hierarchy (Project → Site → Building → Storey → elements) built automatically on load; virtualised for large models.
- **Inline editing** — Name, LongName, Description editable in tree; GlobalId regenerable via confirmation modal.
- **Property set editing** — edit Pset property values inline in Sidebar.
- **Undo/redo** — full command history (Ctrl+Z / Ctrl+Shift+Z); all edits carry `modelId`.
- **Right-click context menu** — Select in 3D, Frame camera, Rename, Fix GUID, Copy GlobalId, Copy Express ID.

### Export
- **IFC export** — applies all diffs (RENAME, FIX_GUID, SET_PROPERTY, REPARENT) via `web-ifc IfcAPI` in a Web Worker. Exports the corrected IFC binary.
- **GLB export** — exports visible scene geometry as GLB.
- **Multi-model export modal** — per-model IFC + GLB buttons; "Export all" footer.

### Analysis
- **Quantity takeoff** — reads `IfcElementQuantity` from property sets; aggregates area/volume/length per IFC class; per-model results.
- **Memory tracking** — polls `performance.measureUserAgentSpecificMemory()` every 4 s; shown in Model Info panel.
- **Model info panel** — floating pill with file size, element count, health badges (Tiny/Light/Normal/Large/Heavy; Small/Typical/Complex/Dense).

---

## Tech stack

| Layer | Package |
|---|---|
| IFC rendering | `@thatopen/components` v3, `@thatopen/fragments` v3 |
| 3D graphics | `three` (r184+) |
| IFC parsing + validation (workers) | `web-ifc` via `IfcImporter` / `IfcAPI` |
| State management | `zustand` v5 (7 stores) |
| Virtualised lists | `@tanstack/react-virtual` v3 |
| UI primitives | React 18, Tailwind CSS, Framer Motion, Radix UI |
| Build | Vite 6 (ES module workers, WASM copy plugin, chunk splitting) |
| Tests | Vitest + jsdom |

---

## Getting started

```bash
npm install
npm run dev
```

The dev server sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers automatically — these are required for `SharedArrayBuffer` and the memory measurement API.

```bash
npm run build   # production build → dist/  (uses 4 GB Node heap on Windows)
npm test        # Vitest unit tests
```

### Production / GitHub Pages

The app is deployed at `https://j03rul4nd.github.io/ifc-viewer-online/` via GitHub Actions. Push to `main` triggers a build and deploy automatically. See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for details, COEP/COOP header strategy, and known production gotchas.

---

## Architecture overview

```
User drops .ifc file
        │
        ▼
useIfcLoader (src/lib/loader.ts)
        │
        ├─ OPFS cache hit? ──yes──▶ load fragments binary directly
        │
        └─ no ──▶ transfer ArrayBuffer to ifc-parser.worker.ts
                          │
                          ▼
                  IfcImporter.process() [WASM, off main thread]
                          │
                          ├─ progress events ──▶ UI progress bar
                          │
                          └─ fragments binary ──▶ save to OPFS (background)
                                                        │
                                                        ▼
                                        viewer.loadFragments() — GPU upload
                                                        │
                                                        ▼
                                        FragmentsModel in scene (Three.js)
                                                        │
                                        ┌───────────────┴───────────────┐
                                        │                               │
                                 setupLoadedModel                 buildSpatialTree
                                 (palette, camera)                (validator.worker)
                                        │                               │
                                 sceneStore.addModel          validationStore.spatialTree
                                 modelRegistry.register       ModelTree.tsx renders
```

**7 Zustand stores:**

| Store | What it owns |
|---|---|
| `modelStore` | `modelInfo`, `ifcBuffer` (legacy single-model), `opfsCacheKey` |
| `sceneStore` | `SceneModel[]` metadata for all loaded models, `activeModelId` |
| `validationStore` | results, spatial trees (per model), rules config, filters, progress |
| `editorStore` | `EditDiff[]`, command history, undo/redo stack, selection |
| `uiStore` | open panels, active tabs, sidebar width, camera/scene/transform state |
| `takeoffStore` | quantity takeoff results `byModel`, status |
| `toastStore` | toast queue; `toast()` / `toastFromError()` imperative helpers |

---

## Project structure

```
src/
├── App.tsx                       # Root component; owns route + viewer bridge
├── components/
│   ├── Landing.tsx               # Marketing page with SEO
│   ├── Viewer.tsx                # Three.js canvas wrapper
│   ├── Toolbar.tsx               # Top bar; export dropdown/modal
│   ├── Sidebar.tsx               # Properties, Categories, Quantities tabs
│   ├── ModelTree.tsx             # Spatial hierarchy tree (virtualised)
│   ├── ValidationPanel.tsx       # Validation report; model filter chips
│   ├── ScenePanel.tsx            # Multi-model manager + transform controls
│   ├── CameraControls.tsx        # Camera preset overlay + numpad shortcuts
│   ├── ModelInfoPanel.tsx        # Floating model health pill
│   ├── ErrorBoundary.tsx         # React error boundary
│   └── ...
├── hooks/
│   ├── useModelSession.ts        # Facade: 4 stores → 1 stable surface
│   ├── useValidationRunner.ts    # Validation lifecycle (run/cancel/progress)
│   ├── useElementFocus.ts        # jumpTo / select / frame / revealInTree
│   └── ...
├── lib/
│   ├── viewer.ts                 # createViewer() factory — multi-model ViewerAPI
│   ├── loader.ts                 # useIfcLoader() — OPFS + worker pipeline
│   ├── validator.ts              # runValidation() + buildSpatialTree()
│   ├── diffStore.ts              # Command builders; exportAsIfc/exportAsGlb
│   ├── model-registry.ts         # IFC buffer + typeMap registry (multi-model)
│   ├── errors.ts                 # AppError hierarchy; safeVoid; tryAsync
│   └── ...
├── stores/
│   ├── sceneStore.ts             # Multi-model scene metadata
│   ├── takeoffStore.ts           # Per-model quantity results
│   └── ...
└── workers/
    ├── ifc-parser.worker.ts      # IFC → fragments binary (IfcImporter)
    ├── validator.worker.ts       # IFC → SpatialTree + ValidationResult
    └── export.worker.ts          # Apply diffs → corrected IFC binary
```

---

## Roadmap

| Sprint | Status | Theme |
|---|---|---|
| 1 | ✅ Done | @thatopen migration, WebGL viewer |
| 2 | ✅ Done | OPFS cache, Web Worker parsing |
| 3 | ✅ Done | Validator, spatial tree, inline editing |
| 4 | ✅ Done | IFC export, 3D highlights, memory management |
| 5 | ✅ Done | Camera presets, scene manager, takeoff, typed errors |
| 6 | ✅ Done | Multi-model, error hardening, build optimisation |
| 7 | 📋 Planned | Postproduction renderer (SSAO, edges), measurements |
| 8 | 📋 Planned | Floor plans, section cuts, clipping planes |
| 9 | 📋 Planned | BCF 2.1/3.0 import + export |
| 10 | 📋 Planned | WebGPU renderer, LOD streaming |
| 11 | 📋 Planned | Point clouds (LAS/LAZ/E57), AR mode |
| 12 | 📋 Planned | AI-assisted validation, natural language query |

See [`ROADMAP.md`](./ROADMAP.md) for full sprint details.

---

## License

MIT
