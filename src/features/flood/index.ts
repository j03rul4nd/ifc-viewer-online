// ─── flood feature: public surface ───────────────────────────────────────────
// What the app may import. Everything heavy (solvers, shaders) is behind the
// worker and the dynamic imports in gpu/create.ts, so importing this module
// costs a few hundred bytes until a run starts.

export { isFloodEnabled } from './flag'
export { detectFloodSupport, type FloodSupport, type BackendChoice } from './gpu/create'
export { FloodRunner, type RunnerEvents, type RunnerInit } from './worker/runner'
export type { RunPerf } from './worker/protocol'
export type { FloodGrid, GridFrame } from './core/grid'
export type { Hyetograph } from './core/hyetograph'
export type { FloodBackend, FloodStats, MaxFields, SolverParams, BoundaryConfig } from './core/solver-api'
