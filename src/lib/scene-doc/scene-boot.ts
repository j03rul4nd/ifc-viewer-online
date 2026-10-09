// ─── scene-boot ───────────────────────────────────────────────────────────────
// Opening a scene document from the address bar, BEFORE the app mounts:
//
//   ?scene=<url>        a scene JSON hosted anywhere with CORS (or same origin)
//   #scene=<packed>     a scene carried in the link itself (scene-link.ts)
//
// The scene's deep-link half becomes parameters the app already reads
// (setSceneParams); its layers and twin wait in `pendingScene` until the app
// has models to anchor them against. A scene that cannot be read never blocks
// the app: it boots as if the parameter were absent and says why.

import { parseSceneDoc, sceneToQuery, type SceneDoc } from './scene-doc'
import { decodeSceneLink, sceneLinkValue } from './scene-link'
import { setSceneParams, isLoadableUrl } from '../url-params'

export interface BootedScene {
  doc: SceneDoc
  warnings: string[]
  /** Where it came from: the URL, or "link" for a packed fragment. */
  from: string
}

let booted: BootedScene | null = null
let failure: { from: string; errors: string[] } | null = null

const FETCH_TIMEOUT_MS = 20_000

/** Is there a scene in this address at all? Cheap: decides whether boot waits. */
export function hasSceneInLocation(loc: Pick<Location, 'search' | 'hash'> = window.location): boolean {
  return /[?&]scene=/.test(loc.search) || sceneLinkValue(loc.hash) !== null
}

async function readScene(loc: Pick<Location, 'search' | 'hash' | 'href'>): Promise<{ from: string; text: string }> {
  const packed = sceneLinkValue(loc.hash)
  if (packed) return { from: 'link', text: await decodeSceneLink(packed) }
  const url = (new URLSearchParams(loc.search).get('scene') ?? '').trim()
  if (!isLoadableUrl(url)) throw new Error('scene: the address is not an http(s) URL or a "/" path.')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(new URL(url, loc.href).toString(), { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`scene: the server answered ${res.status}.`)
    return { from: url, text: await res.text() }
  } catch (e) {
    if (e instanceof TypeError) throw new Error('scene: could not be fetched (offline, or the host sends no CORS header).')
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('scene: the host did not answer in time.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve the scene in the address, if any. Never throws: a failure is kept
 * for `sceneBootFailure()` and the app boots without it.
 */
export async function bootScene(loc: Pick<Location, 'search' | 'hash' | 'href'> = window.location): Promise<BootedScene | null> {
  if (!hasSceneInLocation(loc)) return null
  let from = 'link'
  try {
    const r = await readScene(loc)
    from = r.from
    const v = parseSceneDoc(r.text)
    if (!v.ok) { failure = { from, errors: v.errors }; return null }
    booted = { doc: v.doc, warnings: v.warnings, from }
    setSceneParams(sceneToQuery(v.doc))
    return booted
  } catch (e) {
    failure = { from, errors: [e instanceof Error ? e.message : String(e)] }
    return null
  }
}

export const bootedScene = (): BootedScene | null => booted
export const sceneBootFailure = (): { from: string; errors: string[] } | null => failure

/** Tests only. */
export function resetSceneBoot(): void { booted = null; failure = null; setSceneParams(null) }
