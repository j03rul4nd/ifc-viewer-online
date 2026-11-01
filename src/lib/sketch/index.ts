// ─── Sketch: the public surface ───────────────────────────────────────────────
// Code outside `lib/sketch`, `components/sketch` and `hooks/sketch` imports from
// here, or opens the route. Everything else may change without notice. Layers,
// checked by boundaries.test.ts:
//
//   components/sketch → hooks/sketch → stores/sketchStore → lib/sketch
//
// lib/sketch has no React and no store. See docs/SKETCH_STUDIO.md.

export type { BrushKind, OrbitState, SketchDoc, SketchLayer, SketchPage, SketchPlane, Stroke, Vec3 } from './types'
export { openSketchWithModels, type ModelSource } from './handoff'
export type { ShowcaseId } from './showcase'
export type { ContextItem, ContextPoints, SketchOutbox } from './storage'
export { loadOutbox } from './storage'
