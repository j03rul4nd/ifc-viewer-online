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

## Notes for future sessions

- If you are implementing Sprint 4, read `ROADMAP.md` for the full deliverables list before starting.
- If you change the OPFS cache key format, update `DECISIONS.md` D-04 and add a cache migration path.
- If you update Zustand stores, update `ARCHITECTURE.md` (State management section) and `DECISIONS.md` D-05.
- If you implement WebGPU, update `DECISIONS.md` D-09 and `ARCHITECTURE.md` (External dependencies section).
- Every new architectural decision should get a new entry in `DECISIONS.md`.
- After completing a sprint, update the `Status` field in `ROADMAP.md` and add a new prompt entry here.
- Before adding anything to `worker.rollupOptions.external`, verify it is resolvable in a browser worker context. See `DECISIONS.md` D-11.

---

*Last updated: 2026-05-09 · Current sprint: 3 (in progress)*
