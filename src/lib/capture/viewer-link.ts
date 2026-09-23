// ─── Viewer link — how Clip Studio reaches the 3D scene ───────────────────────
// Clip Studio is a lazy-loaded modal; the viewer lives in the app shell. The
// capture toolbar (which already holds the viewer ref) registers it here, and
// the studio asks for it when it needs to render a shot or read the model's
// bounds. A module-level slot rather than store state: the store only holds
// serialisable data (D-05/D-18), and a ViewerAPI is anything but.

import type { ViewerAPI } from '../viewer'

let current: ViewerAPI | null = null

export function linkViewer(viewer: ViewerAPI | null): void {
  current = viewer
}

export function linkedViewer(): ViewerAPI | null {
  return current
}
