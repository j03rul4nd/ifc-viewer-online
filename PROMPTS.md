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

**Outcome:** Zero TypeScript errors. `vite build` succeeds (407 modules). `src/lib/ifcLoader.ts` deleted. `Icons.tsx` pre-existing type error fixed as a by-product (`strokeWidth?: string | number`).

---

## Sprint 2 — High-Performance Loading Pipeline

### Prompt S2-P1 — Production-grade IFC loading pipeline

**Summary:** Design and implement an OPFS cache + Web Worker + scheduler + memory tracker pipeline so large IFC files load faster than competing viewers, with the main thread staying idle during parse.

**What it asked Claude to do:**
- Implement OPFS cache layer (`src/lib/opfs-cache.ts`)
- Implement dedicated Web Worker for IFC parsing (`src/workers/ifc-parser.worker.ts`) using `@thatopen/fragments` `IfcImporter`, not `OBC.IfcLoader`
- Implement `scheduler.postTask()` wrapper (`src/lib/scheduler.ts`) with `setTimeout(0)` fallback
- Implement memory tracker (`src/lib/memory-tracker.ts`) using `measureUserAgentSpecificMemory` with fallback
- Implement `useIfcLoader()` React hook (`src/lib/loader.ts`) orchestrating the full pipeline
- Extend `ViewerAPI` with `loadFragments()` and `getGpuEstimateBytes()`
- Add `viewerApiRef` prop to `Viewer.tsx`
- Refactor `App.tsx` to use `useIfcLoader` instead of `ifcFile` state
- Update `vite.config.ts` for ES worker format, WASM copy plugin, Vitest config
- Write unit tests in `src/lib/loader.test.ts`
- Use `ArrayBuffer` transfer (zero-copy) to worker
- Graceful degradation: OPFS unavailable → in-memory only with warning; `scheduler` unavailable → `setTimeout(0)`

**Key constraints introduced:**
- All IFC parsing runs in the worker — main thread must not call `IfcImporter` or `OBC.IfcLoader`
- `loadFragments()` is primary load path; `loadIfc()` is legacy/fallback
- Cache keys use `name:size:lastModified` format — stable, do not change without migration
- ArrayBuffer is transferred to worker — do not read it on main thread after `postMessage`
- `yieldToMain()` between heavy chunks; do not run > 64 items without yielding on main thread
- TypeScript strict: no `any`; worker uses `satisfies` for message type narrowing

**Decisions locked in this prompt:** D-02 (IfcImporter in worker), D-03 (OPFS over IndexedDB), D-04 (cache key format), D-05 (no state library yet), D-06 (transferable ArrayBuffer), D-08 (loadFragments primary path), D-09 (WebGPU deferred)

**Outcome:** `tsc --noEmit` zero errors. `vitest run` 11/11 tests pass. `vite build` succeeds (411 modules). Worker bundles as separate `ifc-parser.worker-*.js` chunk.

---

### Prompt S2-P2 — Generate project documentation suite

**Summary:** Generate `CONTEXT.md`, `ARCHITECTURE.md`, `IFC_DOMAIN.md`, `DECISIONS.md`, `ROADMAP.md`, and `PROMPTS.md` (this file) based on the actual current codebase state.

**What it asked Claude to do:**
- Read every file in `src/` before writing anything
- Write accurate docs — no invented features
- Flag inconsistencies with `> ⚠️ NOTE:` blockquotes
- Write as a senior engineer handing off to a new teammate

**Key constraints this prompt establishes for all future sessions:**
- Read all six docs before writing any code
- Current sprint is 2; Sprint 3 has not started — do not implement validator, spatial tree, or diff store ahead of their sprint
- `loadIfc()` is dead code in the current app flow — do not call it from `App.tsx`
- No Zustand yet — add it in Sprint 3 when cross-component validation state requires it
- `gsap` and `@radix-ui/*` are installed but unused in Sprint 1–2 — do not remove them (needed in Sprint 3)
- `lucide-react` is installed but unused — all icons are in `Icons.tsx`; do not mix icon sources

**Outcome:** Six documentation files created at repo root.

---

## Notes for future sessions

- If you are implementing Sprint 3 or Sprint 4, read `ROADMAP.md` for the full deliverables list before starting.
- If you change the OPFS cache key format, update `DECISIONS.md` D-04 and add a cache migration path.
- If you add Zustand, update `ARCHITECTURE.md` (State management section) and `DECISIONS.md` D-05.
- If you implement WebGPU, update `DECISIONS.md` D-09 and `ARCHITECTURE.md` (External dependencies section).
- Every new architectural decision should get a new entry in `DECISIONS.md`.
- After completing a sprint, update the `Status` field in `ROADMAP.md` and add a new prompt entry here.

---

*Last updated: 2026-04-19 · Current sprint: 2 (complete)*
