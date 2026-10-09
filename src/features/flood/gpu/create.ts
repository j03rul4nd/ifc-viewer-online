// ─── backend selection ────────────────────────────────────────────────────────
// WebGPU first, WebGL2 second. The CPU solver is the reference for tests and is
// only used when asked for by name: on a real grid it is two to three orders of
// magnitude slower, and a feature that silently crawls is worse than one that
// says it cannot run here.

import type { FloodBackend, FloodSolver, SolverInit } from '../core/solver-api'
import { CpuInertialSolver } from '../core/cpu-inertial'

export type BackendChoice = 'auto' | FloodBackend

export interface CreateOptions {
  backend?: BackendChoice
  /** 'low-power' prefers the integrated GPU on dual-GPU laptops. */
  powerPreference?: 'low-power' | 'high-performance'
}

export interface CreatedSolver {
  solver: FloodSolver
  /** GPU name as the browser reports it ('' when hidden). */
  device: string
  /** Why the preferred backend was skipped, when it was. */
  fallbackReason: string | null
}

export async function createFloodSolver(init: SolverInit, o: CreateOptions = {}): Promise<CreatedSolver> {
  const choice = o.backend ?? 'auto'
  if (choice === 'cpu') return { solver: new CpuInertialSolver(init), device: 'CPU', fallbackReason: null }
  let reason: string | null = null
  if (choice === 'auto' || choice === 'webgpu') {
    try {
      const { WebGpuInertialSolver } = await import('./webgpu-inertial')
      const s = await WebGpuInertialSolver.create(init, { powerPreference: o.powerPreference })
      const a = s.adapter
      return { solver: s, device: [a.vendor, a.architecture, a.description].filter(Boolean).join(' ') || 'WebGPU', fallbackReason: null }
    } catch (err) {
      reason = (err as Error)?.message ?? String(err)
      if (choice === 'webgpu') throw err
    }
  }
  const { WebGl2InertialSolver } = await import('./webgl2-inertial')
  const s = await WebGl2InertialSolver.create(init, { powerPreference: o.powerPreference })
  return { solver: s, device: s.renderer, fallbackReason: reason }
}

export interface FloodSupport {
  webgpu: boolean
  webgl2: boolean
  /** True when at least one GPU backend can run the solver. */
  supported: boolean
}

/** What this browser can run, without creating a solver. */
export async function detectFloodSupport(): Promise<FloodSupport> {
  let webgpu = false
  try {
    const gpu = (globalThis.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } } | undefined)?.gpu
    webgpu = !!(gpu && (await gpu.requestAdapter()))
  } catch { webgpu = false }
  let webgl2 = false
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1, 1)
      : typeof document !== 'undefined' ? document.createElement('canvas') : null
    const gl = canvas?.getContext('webgl2') as WebGL2RenderingContext | null | undefined
    webgl2 = !!(gl && gl.getExtension('EXT_color_buffer_float'))
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { webgl2 = false }
  return { webgpu, webgl2, supported: webgpu || webgl2 }
}
