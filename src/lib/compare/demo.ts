// The guided demo of revision compare: one link, `/?compare=demo&tour=revision&ref=<code>`,
// opens the comparator with a sample pair already loaded (F8, Poblenou A/S/M:
// a column moved west, a wall added, a slab reshaped, a beam removed, a duct's
// properties changed) and, with `tour=revision`, starts the guided tour.
// The files are static, served from /models/revision-demo/ (deploy:models).

export const DEMO_FILES = [
  'BCN-IVO-ZZ-XX-M3-A-0001.ifc',
  'BCN-IVO-ZZ-XX-M3-M-0001.ifc',
  'BCN-IVO-ZZ-XX-M3-S-0001.ifc',
] as const

export const DEMO_BASE = '/models/revision-demo'

export interface CompareParams {
  /** `?compare` present at all. */
  open: boolean
  /** `?compare=demo`. */
  demo: boolean
  /** `?tour=revision`. */
  tour: boolean
}

export function readCompareParams(search: string): CompareParams {
  const p = new URLSearchParams(search)
  return {
    open: p.has('compare'),
    demo: p.get('compare') === 'demo',
    tour: p.get('tour') === 'revision',
  }
}

/** `?tour=revision` is a one-shot: drop it so a reload does not restart the tour. */
export function stripTourParam(): void {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('tour')) return
    url.searchParams.delete('tour')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  } catch { /* no history: harmless */ }
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> }>

/** Fetch the demo pair as Files (A older than B, so a drop-both split agrees). */
export async function fetchDemoPair(fetcher: Fetcher = (u) => fetch(u)): Promise<{ a: File[]; b: File[] }> {
  const get = async (side: 'a' | 'b', name: string, at: number): Promise<File> => {
    const res = await fetcher(`${DEMO_BASE}/${side}/${name}`)
    if (!res.ok) throw new Error(`demo ${side}/${name}: HTTP ${res.status}`)
    return new File([await res.arrayBuffer()], name, { type: 'application/x-step', lastModified: at })
  }
  const t = Date.UTC(2026, 9, 1)
  const [a, b] = await Promise.all([
    Promise.all(DEMO_FILES.map((n) => get('a', n, t))),
    Promise.all(DEMO_FILES.map((n) => get('b', n, t + 7 * 864e5))),
  ])
  return { a, b }
}
