// ─── Bimo load policy ─────────────────────────────────────────────────────────
// When the real, rigged 3D Bimo is allowed to replace the SVG twin. Nothing in
// this file imports three.js: it runs on first paint for every page, so it has
// to cost nothing.
//
// Order of operations for every Bimo on a page:
//   1. The SVG renders immediately. It is what crawlers index, what no-JS and
//      reduced-data visitors see, and what shows while anything below loads.
//   2. canRender3D() — a capable device on a connection that is not asking us
//      to save data.
//   3. whenIdle() — after the load event and an idle slot, so the upgrade can
//      never compete with LCP, TBT or INP.
//   4. The instance must be on screen, and one of MAX_LIVE slots must be free.
//      Offscreen live instances are the first to give their slot back.
//   5. Only then is the runtime chunk (three.js + ~200 KB meshopt GLB) fetched,
//      once for the whole page; later instances reuse the parsed asset.

let capable: boolean | null = null

export function canRender3D(): boolean {
  if (capable !== null) return capable
  capable = false
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  // QA switch: ?bimo3d=1 forces the 3D model (e.g. software GL in CI),
  // ?bimo3d=0 forces the SVG, to check the fallback on a capable machine.
  const force = /[?&]bimo3d=([01])/.exec(location.search)?.[1]
  if (force === '0') return false
  try {
    if (force === '1') { capable = !!document.createElement('canvas').getContext('webgl2'); return capable }
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
      deviceMemory?: number
    }
    if (nav.connection?.saveData) return false
    if (nav.connection?.effectiveType && /(^|-)2g$/.test(nav.connection.effectiveType)) return false
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return false
    if (matchMedia('(prefers-reduced-data: reduce)').matches) return false
    // Probe, then release the context immediately so the probe never counts
    // against the browser's live-context limit.
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    capable = true
  } catch {
    capable = false
  }
  return capable
}

let idle: Promise<void> | null = null

export function whenIdle(): Promise<void> {
  if (idle) return idle
  idle = new Promise<void>((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    const ric = (cb: () => void) => w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 2500 }) : w.setTimeout(cb, 600)
    const go = () => ric(() => resolve())
    if (document.readyState === 'complete') go()
    else window.addEventListener('load', go, { once: true })
  })
  return idle
}

// ── live slots ────────────────────────────────────────────────────────────────
// Each live Bimo owns a WebGL context. Browsers cap those (≈16) and each costs
// GPU memory, so a page keeps at most MAX_LIVE; a visible instance may evict
// an offscreen one, which falls back to its SVG until it is seen again.

export const MAX_LIVE = 3

interface Slot { visible: boolean; lastSeen: number; release: () => void }
const slots = new Set<Slot>()

export function claimSlot(release: () => void): Slot | null {
  if (slots.size >= MAX_LIVE) {
    let victim: Slot | null = null
    for (const s of slots) if (!s.visible && (!victim || s.lastSeen < victim.lastSeen)) victim = s
    if (!victim) return null
    slots.delete(victim)
    victim.release()
  }
  const slot: Slot = { visible: true, lastSeen: performance.now(), release }
  slots.add(slot)
  return slot
}

export function markSlot(slot: Slot, visible: boolean) {
  slot.visible = visible
  if (visible) slot.lastSeen = performance.now()
}

export function releaseSlot(slot: Slot | null) {
  if (slot) slots.delete(slot)
}
