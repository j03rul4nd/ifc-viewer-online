# IFC Viewer Online

A browser-only IFC model viewer and validator built for architects and BIM coordinators who need fast, private inspection of large building models. Files are parsed in a Web Worker via WebAssembly, rendered in WebGL, and **never leave your machine**.

---

## Features

- **Fast loading** — IFC files are parsed off the main thread via a dedicated Web Worker using WebAssembly (`@thatopen/fragments` `IfcImporter`). The UI stays responsive during parse.
- **OPFS cache** — parsed geometry is stored in the browser's Origin Private File System. Subsequent loads skip the expensive WASM parse entirely (~10× faster).
- **3D viewer** — WebGL renderer with realistic lighting (hemisphere + directional shadows), orbit/pan/zoom camera controls, and per-category colour palette for 25 IFC element types.
- **Element selection** — click any element to highlight it and inspect its IFC type, display name, and Express ID in the Properties panel.
- **Category panel** — lists all IFC types present in the model with element counts, colour swatches, hide/show toggles, and per-category camera isolation.
- **Viewer styles** — `shaded` (palette colours), `blueprint` (flat grey), `xray` (global 20% opacity).
- **Memory tracker** — polls `performance.measureUserAgentSpecificMemory()` every 4 s with a `performance.memory` fallback.
- **Toast notifications** — per-action feedback (error, warning, info) surfaced without blocking the UI.
- **IFC validation** — rule-based validator runs in a second Web Worker; streams partial results into a filterable report panel. Detects empty names, duplicate GUIDs, missing type assignments, orphan elements, wrong containers, and more.
- **Spatial tree** — navigable hierarchy (Project → Site → Building → Storey → elements) with virtualised rendering for large models.
- **Non-destructive editing** — inline attribute editing (Name, LongName, Description) held in a diff store with undo/redo support.
- **Pre-flight IFC guards** — empty-buffer and IFC signature checks before WASM initialisation; informative error messages on every failure.

---

## Tech stack

| Layer | Package |
|---|---|
| IFC rendering | `@thatopen/components` v3, `@thatopen/fragments` v3 |
| 3D graphics | `three` (r184+) |
| IFC parsing + validation (workers) | `web-ifc` via `IfcImporter` / `IfcAPI` |
| State management | `zustand` v5 |
| Virtualised lists | `@tanstack/react-virtual` v3 |
| UI | React 18, Tailwind CSS, Framer Motion, Radix UI |
| Build | Vite 6 (ES module workers, WASM copy plugin) |
| Tests | Vitest + jsdom |

---

## Getting started

```bash
npm install
npm run dev
```

The dev server sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers automatically — these are required for `SharedArrayBuffer` and the memory measurement API.

```bash
npm run build   # production build → dist/
npm test        # Vitest unit tests
```

### Production / GitHub Pages

The app is deployed at `https://<user>.github.io/ifc-viewer-online/` via GitHub Actions (`.github/workflows/deploy.yml`). Push to `main` triggers a build and deploy automatically. See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for details, COEP/COOP header strategy, and known production gotchas.

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
                                          viewer.loadFragments()
                                          FragmentsModel → Three.js scene

User triggers validation
        │
        ▼
runValidation() (src/lib/validator.ts)
        │
        └─ IFC buffer ──▶ validator.worker.ts
                               │
                               ├─ spatial tree ──▶ useValidationStore.setSpatialTree()
                               ├─ partial issues ──▶ useValidationStore.addPartialIssues()
                               └─ done ──▶ useValidationStore.setResult()
```

All IFC parsing and validation runs in workers. The main thread only receives finished results.

---

## Project structure

```
src/
├── App.tsx                       # Root component; owns route + viewer bridge
├── components/
│   ├── Landing.tsx               # Marketing / hero page
│   ├── Viewer.tsx                # Three.js canvas wrapper (React ↔ ViewerAPI bridge)
│   ├── Toolbar.tsx               # File name, load status, actions
│   ├── Sidebar.tsx               # Properties + Categories panels
│   ├── ModelTree.tsx             # Spatial hierarchy tree (virtualised)
│   ├── ValidationPanel.tsx       # Validation report panel with filters
│   ├── UploadOverlay.tsx         # Drag-and-drop modal + progress bar
│   ├── ToastContainer.tsx        # Toast notification renderer
│   └── Icons.tsx                 # All SVG icons (single source of truth)
├── hooks/
│   └── useEditorHistory.ts       # Undo/redo keyboard shortcut binding
├── lib/
│   ├── viewer.ts                 # createViewer() factory — OBC world + ViewerAPI
│   ├── loader.ts                 # useIfcLoader() hook — pipeline orchestration
│   ├── validator.ts              # runValidation() — orchestrates validator worker
│   ├── diffStore.ts              # Diff helpers: buildRenameCommand, buildFixGuidCommand
│   ├── ifc-guards.ts             # validateIfcBuffer() — pre-flight checks
│   ├── ifc-guards.test.ts        # Tests for ifc-guards
│   ├── opfs-cache.ts             # OPFS read/write/list/delete
│   ├── memory-tracker.ts         # Memory polling helpers
│   ├── scheduler.ts              # yieldToMain() + runInChunks()
│   ├── utils.ts                  # cn() + lighten() utilities
│   └── loader.test.ts            # Vitest tests (11 tests)
├── stores/
│   ├── modelStore.ts             # Loaded model: ModelInfo, IFC buffer, cache key
│   ├── validationStore.ts        # Validation results, spatial tree, rules, filters
│   ├── editorStore.ts            # Edit diffs, command history, undo/redo
│   ├── uiStore.ts                # Global UI flags (panels open, active tab…)
│   └── toastStore.ts             # Toast queue + toast() helper
├── types/
│   └── index.ts                  # All shared TypeScript interfaces
└── workers/
    ├── ifc-parser.worker.ts      # IFC bytes → fragments binary (WASM, no DOM)
    └── validator.worker.ts       # IFC bytes → ValidationResult + SpatialTree (WASM)
```

---

## Key constraints

- **No server.** No upload endpoints. All processing is client-side.
- **`@thatopen/*` is the 3D/IFC layer.** Do not add raw `web-ifc` imports to `src/` outside the workers.
- **TypeScript strict mode.** `tsconfig.json` has `strict: true`. No `any` escapes.
- **`loadFragments()` is the primary load path.** `loadIfc()` exists on `ViewerAPI` as a fallback but is not called from `App.tsx`.
- **COOP/COEP headers must stay.** Required for `SharedArrayBuffer` and `performance.measureUserAgentSpecificMemory()`.
- **Cache key format is stable:** `"${name}:${size}:${lastModified}"` — do not change without a migration path.
- **Edits are keyed by GlobalId, not Express ID.** Express IDs are unstable across IFC re-exports.
- **Worker bundles must not externalize bare specifiers.** See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) and `DECISIONS.md` D-11.

---

## Roadmap

| Sprint | Status | Goal |
|---|---|---|
| 1 | ✅ Done | `@thatopen/components` migration — replace raw web-ifc + Three.js |
| 2 | ✅ Done | High-performance loading pipeline — OPFS cache + Web Worker + memory tracker |
| 3 | 🔄 In progress | IFC Validator + spatial hierarchy tree with inline attribute editing |
| 4 | Planned | Validation report panel, 3D error highlights, IFC/GLB export |

See [`ROADMAP.md`](./ROADMAP.md) for the full sprint breakdown, deliverables, and architectural constraints introduced by each sprint.

---

## Documentation

| File | Contents |
|---|---|
| [`CONTEXT.md`](./CONTEXT.md) | Product overview, current state, required reading order |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Folder map, data flow, component responsibilities |
| [`IFC_DOMAIN.md`](./IFC_DOMAIN.md) | IFC concepts, spatial hierarchy, entity types, expressId vs GlobalId |
| [`DECISIONS.md`](./DECISIONS.md) | Architectural decision log with alternatives and rationale |
| [`ROADMAP.md`](./ROADMAP.md) | Sprint-by-sprint plan |
| [`PROMPTS.md`](./PROMPTS.md) | Log of Claude Code prompts used to build the project |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | GitHub Pages deployment, WASM paths, COEP/COOP, production bug history |

---

## License

MIT
