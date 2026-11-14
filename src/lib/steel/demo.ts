// The guided steel takeoff demo: one link, `/?steel=demo&tour=steel&ref=<code>`,
// opens the viewer with a generated steel hall (scripts/steel-demo/generate.ts,
// a static file under /models/steel-demo/), the Steel takeoff panel open and
// calculated, and with `tour=steel` the guided tour. Everything runs in the
// browser: no account, no backend call. `ref` goes only where every other
// `ref` link goes (attribution.ts, cookieless analytics).

export const STEEL_DEMO_FILE = 'steel-hall.ifc'
export const STEEL_DEMO_URL = `/models/steel-demo/${STEEL_DEMO_FILE}`

export interface SteelDemoParams {
  /** `?steel=demo`. */
  demo: boolean
  /** `?tour=steel` (only meaningful with the demo). */
  tour: boolean
}

export function readSteelDemoParams(search: string): SteelDemoParams {
  const p = new URLSearchParams(search)
  const demo = p.get('steel') === 'demo'
  return { demo, tour: demo && p.get('tour') === 'steel' }
}

/** `?tour=steel` is a one-shot: drop it so a reload does not restart the tour. */
export function stripSteelTourParam(): void {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('tour') !== 'steel') return
    url.searchParams.delete('tour')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  } catch { /* no history: harmless */ }
}

let booted = false

/**
 * Start the demo from the page's own URL, once per page load. Idempotent:
 * StrictMode runs effects twice, and the second run would read the URL with
 * `tour` already stripped. `tour` is dropped only after the demo has started.
 */
export function bootSteelDemo(start: (tour: boolean) => void, search: string = window.location.search): boolean {
  if (booted) return false
  const p = readSteelDemoParams(search)
  if (!p.demo) return false
  booted = true
  start(p.tour)
  stripSteelTourParam()
  return true
}

/** Tests only. */
export function resetSteelDemoBoot(): void { booted = false }
