// ─── Viewer link — how Clip Studio reaches the 3D scene ───────────────────────
// Clip Studio is a lazy-loaded modal; the viewer lives in the app shell. The
// capture toolbar (which already holds the viewer ref) registers it here, and
// the studio asks for it when it needs to render a shot or read the model's
// bounds. A module-level slot rather than store state: the store only holds
// serialisable data (D-05/D-18), and a ViewerAPI is anything but.

import type { ViewerAPI } from '../viewer'

// Several toolbars can hold the viewer at once (the main toolbar, the tour
// player's bar, the client layout). Each registers under its own key, so one
// unmounting never unlinks the viewer from under the others.
const owners = new Map<object, ViewerAPI>()

export function linkViewer(owner: object, viewer: ViewerAPI | null): void {
  if (viewer) owners.set(owner, viewer)
  else owners.delete(owner)
}

export function linkedViewer(): ViewerAPI | null {
  let last: ViewerAPI | null = null
  for (const v of owners.values()) last = v
  return last
}
