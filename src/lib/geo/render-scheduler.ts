// ─── render-scheduler ─────────────────────────────────────────────────────────
// How the map context is built without freezing the page.
//
// THE PROBLEM, MEASURED. Every layer of the OSM context was built in one
// synchronous call on the main thread. On the Glòries capture that was ~6 s of
// uninterrupted work — roads alone 3.6 s — during which the page could not
// scroll, click or paint. After the allocation fixes (growable-array) it is
// ~2.3 s, still one block. This module is what turns it into a CASCADE: the
// build is cut into phases, and between phases the main thread is handed back
// so the browser can paint what is ready and answer the user.
//
// The best primitive available is used, most capable first:
//   • `scheduler.yield()` (Chromium 129+) — the continuation keeps its place
//     at the front of the queue, so the cascade is not starved by other tasks;
//   • `scheduler.postTask()` — prioritised tasks without the continuation perk;
//   • a MessageChannel round trip — a macrotask with no 4 ms clamp;
//   • `setTimeout(0)` where nothing else exists.
// `navigator.scheduling.isInputPending()` lets a long phase notice a pending
// click or key and give way early instead of at its next boundary.
//
// The device is asked what it can afford — `deviceMemory`,
// `hardwareConcurrency`, the network's `saveData`, and whether WebGL is running
// on a software rasteriser — and budgets scale from that answer.

import type * as THREE from 'three'

type SchedulerLike = {
  yield?: () => Promise<void>
  postTask?: (cb: () => void, opts?: { priority?: string; delay?: number; signal?: AbortSignal }) => Promise<void>
}

const scheduler = (): SchedulerLike | undefined =>
  (globalThis as unknown as { scheduler?: SchedulerLike }).scheduler

let channel: MessageChannel | null = null
const channelQueue: Array<() => void> = []

/** Hand the main thread back for one turn of the event loop. */
export function yieldToMain(priority: 'user-visible' | 'background' = 'user-visible'): Promise<void> {
  const s = scheduler()
  if (s?.yield && priority === 'user-visible') return s.yield()
  if (s?.postTask) return s.postTask(() => {}, { priority })
  // jsdom ships a MessageChannel whose ports never deliver: yielding there
  // would hang forever. There is no frame to paint in it anyway.
  if (/jsdom/i.test(globalThis.navigator?.userAgent ?? '')) return Promise.resolve()
  if (typeof MessageChannel !== 'undefined') {
    if (!channel) {
      channel = new MessageChannel()
      channel.port1.onmessage = () => channelQueue.shift()?.()
      // Node's ports keep the process alive; a browser's have no such method.
      ;(channel.port1 as unknown as { unref?: () => void }).unref?.()
      ;(channel.port2 as unknown as { unref?: () => void }).unref?.()
    }
    return new Promise((resolve) => { channelQueue.push(resolve); channel!.port2.postMessage(null) })
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}

type InputPending = { isInputPending?: (opts?: { includeContinuous?: boolean }) => boolean }

/** True when the user is waiting on the page — a click, a key, a drag. */
export function inputPending(): boolean {
  const s = (globalThis.navigator as unknown as { scheduling?: InputPending } | undefined)?.scheduling
  try { return s?.isInputPending?.({ includeContinuous: true }) === true } catch { return false }
}

/**
 * A slice timer: `due()` says it is time to give way — the slice is spent, or
 * input is waiting. Budget in ms; 12 leaves room for a 60 Hz frame's own work.
 */
export function slice(budgetMs = 12): { due(): boolean; reset(): void } {
  let start = performance.now()
  return {
    due: () => performance.now() - start > budgetMs || inputPending(),
    reset: () => { start = performance.now() },
  }
}

// ── What the device can afford ───────────────────────────────────────────────

export type DeviceTier = 'low' | 'mid' | 'high'

export interface DeviceBudget {
  tier: DeviceTier
  /** Multiplier for vertex budgets of procedural refinement (subdivision). */
  detailScale: number
  /** How many asset downloads may run at once. */
  fetchConcurrency: number
  /** Whether invented scenery (cars, boats) is worth its triangles here. */
  heavyScenery: boolean
  reasons: string[]
}

let cachedBudget: DeviceBudget | null = null

/** WebGL renderer string, when the driver will say — a software rasteriser is the tell. */
function rendererName(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): string {
  if (!gl) return ''
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
  } catch { return '' }
}

/**
 * Classify the device once. Every signal is optional and treated as absent
 * when the browser does not expose it — Safari and Firefox hide most of them,
 * and absent must mean "assume capable", not "assume weak".
 */
export function deviceBudget(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): DeviceBudget {
  if (cachedBudget) return cachedBudget
  const nav = (globalThis.navigator ?? {}) as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean; effectiveType?: string }
  }
  const reasons: string[] = []
  let score = 0
  const mem = nav.deviceMemory
  if (typeof mem === 'number') {
    if (mem <= 2) { score -= 2; reasons.push(`deviceMemory ${mem} GB`) } else if (mem <= 4) { score -= 1; reasons.push(`deviceMemory ${mem} GB`) }
  }
  const cores = nav.hardwareConcurrency
  if (typeof cores === 'number') {
    if (cores <= 2) { score -= 2; reasons.push(`${cores} cores`) } else if (cores <= 4) { score -= 1; reasons.push(`${cores} cores`) }
  }
  if (nav.connection?.saveData) { score -= 1; reasons.push('saveData') }
  if (/(^|\s)(slow-)?2g/.test(nav.connection?.effectiveType ?? '')) { score -= 1; reasons.push(`network ${nav.connection?.effectiveType}`) }
  const renderer = rendererName(gl).toLowerCase()
  if (/swiftshader|llvmpipe|softpipe|basic render|software/.test(renderer)) { score -= 3; reasons.push(`software GL (${renderer})`) }
  const tier: DeviceTier = score <= -3 ? 'low' : score <= -1 ? 'mid' : 'high'
  cachedBudget = {
    tier,
    detailScale: tier === 'low' ? 0.35 : tier === 'mid' ? 0.7 : 1,
    fetchConcurrency: tier === 'low' ? 2 : tier === 'mid' ? 4 : 6,
    heavyScenery: tier !== 'low',
    reasons,
  }
  return cachedBudget
}

/** Test hook: forget the cached classification. */
export function __resetDeviceBudget(): void { cachedBudget = null }

// ── Shaders ──────────────────────────────────────────────────────────────────

/**
 * Compile an object's shader programs before it joins the scene.
 *
 * Without this, the first frame that draws a new layer compiles its programs
 * synchronously — a facade or surface shader is tens to hundreds of ms of
 * frozen page, paid again for every material variant. `compileAsync` uses
 * `KHR_parallel_shader_compile` to let the driver compile off the main thread
 * and polls for completion; where the extension or the method is missing this
 * resolves at once and the old behaviour applies. Never rejects, and never
 * waits more than `timeoutMs`.
 */
export async function precompile(
  renderer: THREE.WebGLRenderer | null | undefined,
  object: THREE.Object3D,
  camera: THREE.Camera | null | undefined,
  scene: THREE.Scene | null | undefined,
  timeoutMs = 1500,
): Promise<void> {
  const r = renderer as unknown as { compileAsync?: (o: THREE.Object3D, c: THREE.Camera, s?: THREE.Scene | null) => Promise<unknown> } | null | undefined
  if (!r?.compileAsync || !camera) return
  try {
    await Promise.race([
      r.compileAsync(object, camera, scene ?? null),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  } catch {
    // A failed pre-compile only means the first frame compiles instead.
  }
}

// ── Concurrency ──────────────────────────────────────────────────────────────

/** Run async jobs with at most `limit` in flight, in the given order. */
export async function mapLimited<T, R>(items: ReadonlyArray<T>, limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}
