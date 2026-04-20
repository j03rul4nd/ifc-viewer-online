# IFC Viewer Online

A browser-only IFC model viewer built for architects and BIM coordinators who need fast, private inspection of large building models. Files are parsed in a Web Worker via WebAssembly, rendered in WebGL, and **never leave your machine**.

---

## Features

- **Fast loading** — IFC files are parsed off the main thread via a dedicated Web Worker using WebAssembly (`@thatopen/fragments` `IfcImporter`). The UI stays responsive during parse.
- **OPFS cache** — parsed geometry is stored in the browser's Origin Private File System. Subsequent loads skip the expensive WASM parse entirely.
- **3D viewer** — WebGL renderer with realistic lighting (hemisphere + directional shadows), orbit/pan/zoom camera controls, and per-category colour palette for 25 IFC element types.
- **Element selection** — click any element to highlight it and inspect its IFC type, display name, and Express ID in the Properties panel.
- **Category panel** — lists all IFC types present in the model with element counts, colour swatches, hide/show toggles, and per-category camera isolation.
- **Viewer styles** — `shaded` (palette colours), `blueprint` (flat grey), `xray` (global 20% opacity).
- **Memory tracker** — polls `performance.measureUserAgentSpecificMemory()` every 4 s with a `performance.memory` fallback.

---

## Tech stack

| Layer | Package |
|---|---|
| IFC rendering | `@thatopen/components` v3, `@thatopen/fragments` v3 |
| 3D graphics | `three` (r184+) |
| IFC parsing (worker) | `web-ifc` via `IfcImporter` |
| UI | React 18, Tailwind CSS, Framer Motion |
| Build | Vite (ES module worker, WASM copy plugin) |
| Tests | Vitest + jsdom |

---

## Getting started

```bash
npm install
npm run dev
```

The dev server sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers automatically — these are required for `SharedArrayBuffer` and the memory measurement API.

```bash
npm run build   # production build
npm test        # run Vitest unit tests
```

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
```

All IFC parsing runs in `src/workers/ifc-parser.worker.ts`. The main thread only receives the finished binary and hands it to the renderer. The `ArrayBuffer` is transferred (zero-copy) to the worker.

---

## Project structure

```
src/
├── components/
│   ├── Landing.tsx        # Marketing / hero page
│   ├── Viewer.tsx         # Three.js canvas wrapper (React ↔ ViewerAPI bridge)
│   ├── Toolbar.tsx        # File name, load status, actions
│   ├── Sidebar.tsx        # Properties + Categories panels
│   ├── UploadOverlay.tsx  # Drag-and-drop modal + progress bar
│   └── Icons.tsx          # All SVG icons (single source of truth)
├── lib/
│   ├── viewer.ts          # createViewer() factory — OBC world + ViewerAPI
│   ├── loader.ts          # useIfcLoader() hook — pipeline orchestration
│   ├── opfs-cache.ts      # OPFS read/write/list/delete
│   ├── memory-tracker.ts  # Memory polling helpers
│   ├── scheduler.ts       # yieldToMain() + runInChunks()
│   └── loader.test.ts     # Vitest tests (11 tests)
└── workers/
    └── ifc-parser.worker.ts   # IFC bytes → fragments binary (WASM, no DOM)
```

---

## Key constraints

- **No server.** No upload endpoints. All processing is client-side.
- **`@thatopen/*` is the 3D/IFC layer.** Do not add raw `web-ifc` imports to `src/` outside the parse worker.
- **TypeScript strict mode.** `tsconfig.json` has `strict: true`. No `any` escapes.
- **`loadFragments()` is the primary load path.** `loadIfc()` exists on `ViewerAPI` as a fallback/testing entry point but is not called from `App.tsx`.
- **COOP/COEP headers must stay.** They are required for `SharedArrayBuffer` (used by the fragments worker) and `performance.measureUserAgentSpecificMemory()`.
- **Cache key format is stable:** `"${name}:${size}:${lastModified}"` — do not change without a migration path.

---

## Roadmap

| Sprint | Status | Goal |
|---|---|---|
| 1 | ✅ Done | `@thatopen/components` migration — replace raw web-ifc + Three.js |
| 2 | ✅ Done | High-performance loading pipeline — OPFS cache + Web Worker + memory tracker |
| 3 | Planned | IFC Validator + spatial hierarchy tree with inline attribute editing |
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

---

## License

MIT