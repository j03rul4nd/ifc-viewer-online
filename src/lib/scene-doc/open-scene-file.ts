// ─── Open a scene file ────────────────────────────────────────────────────────
// Opening a scene = reloading the viewer on it: the same path a shared link
// takes, so a file and a link can never behave differently. Shared by
// SceneShareModal, Open ▾ › Open scene file…, the Add data hub and the drop
// router (lazy-imported there to keep scene-doc out of the entry chunk).

import { parseSceneDoc } from './scene-doc'
import { encodeSceneLink } from './scene-link'
import { appBase } from './scene-snapshot'

export type SceneUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid'; errors: string[] }
  | { ok: false; reason: 'tooBig' }

/** Validate a scene document and pack it into a `#scene=` link to this app. */
export async function sceneUrlFromText(text: string): Promise<SceneUrlResult> {
  const v = parseSceneDoc(text)
  if (!v.ok) return { ok: false, reason: 'invalid', errors: v.errors }
  const packed = await encodeSceneLink(v.doc)
  if (!packed) return { ok: false, reason: 'tooBig' }
  return { ok: true, url: `${appBase()}#scene=${packed}` }
}

/** Navigate to a scene link, reloading when only the fragment changed. */
export function navigateToScene(url: string): void {
  const next = new URL(url)
  const sameDocument = next.pathname === window.location.pathname && next.search === window.location.search
  window.location.assign(next.toString())
  // Only the fragment changed: assigning it does not reload by itself.
  if (sameDocument) window.location.reload()
}
