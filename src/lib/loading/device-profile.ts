// ─── Device profile ───────────────────────────────────────────────────────────
// One answer to "is this a device whose tab dies when memory runs out?".
//
// On iOS every tab is ONE process with a hard memory ceiling — the main thread,
// every worker, every WebAssembly heap and the GPU (unified memory) all count
// against it, and crossing it kills the tab without a warning: Safari reloads
// the page. Safari exposes neither `deviceMemory` nor `performance.memory`, so
// the ceiling cannot be read; the device class is the only signal there is.
//
// iPadOS reports itself as a Mac ("Macintosh" UA, no `userAgentData`); the
// touch points give it away. `?lite=1` forces the profile on any device (a
// kiosk, a test), `?lite=0` turns it off; DEV can pin it via localStorage.

import { probeEnvironment } from './resource-policy'

const DEV_KEY = 'ifc:memory-constrained'

interface GlobalLike {
  navigator?: { userAgent?: string; maxTouchPoints?: number; deviceMemory?: number }
  location?: { search?: string }
  localStorage?: { getItem(key: string): string | null }
}

/** iPhone, iPod or iPad — including an iPad that claims to be a Mac. */
export function isAppleMobile(g: unknown = globalThis): boolean {
  try {
    const nav = (g as GlobalLike | null)?.navigator
    const ua = nav?.userAgent ?? ''
    if (/iPhone|iPad|iPod/i.test(ua)) return true
    return /Macintosh/i.test(ua) && (nav?.maxTouchPoints ?? 0) > 1
  } catch {
    return false
  }
}

function readOverride(g: GlobalLike): boolean | null {
  try {
    const q = new URLSearchParams(g.location?.search ?? '').get('lite')
    if (q === '1' || q === 'true') return true
    if (q === '0' || q === 'false') return false
  } catch { /* no location */ }
  if (import.meta.env.DEV) {
    try {
      const v = g.localStorage?.getItem(DEV_KEY)
      if (v === '1') return true
      if (v === '0') return false
    } catch { /* storage blocked */ }
  }
  return null
}

/** Pure decision, for tests. */
export function computeMemoryConstrained(g: unknown = globalThis): boolean {
  const gl = (g ?? {}) as GlobalLike
  const forced = readOverride(gl)
  if (forced !== null) return forced
  if (isAppleMobile(gl)) return true
  const env = probeEnvironment(g)
  if (env.mobile) return true
  return env.deviceMemoryGB !== null && env.deviceMemoryGB <= 4
}

/**
 * Above this an IFC converted ON a constrained device risks the tab: the
 * conversion peaks near 5× the file plus ~100 MB, next to the viewer and the
 * GPU in one capped process. Measured headroom on recent iPhones is roughly a
 * 1–1.5 GB tab; 80 MB (≈ 500 MB peak) is where it stops being comfortable.
 */
export const HEAVY_CONVERT_BYTES = 80 * 1024 * 1024

/** True when converting `sizeBytes` here deserves a warning first. */
export function isHeavyConvert(sizeBytes: number, constrained = isMemoryConstrained()): boolean {
  return constrained && sizeBytes >= HEAVY_CONVERT_BYTES
}

let cached: boolean | null = null

/**
 * True on phones, tablets and ≤ 4 GB machines: keep one copy of a model in
 * flight, release WebAssembly heaps as soon as their job ends, draw less.
 * Read once per session — the device does not change under the page.
 */
export function isMemoryConstrained(): boolean {
  if (cached === null) cached = computeMemoryConstrained()
  return cached
}

/** Tests only. */
export function __resetDeviceProfile(): void {
  cached = null
}
