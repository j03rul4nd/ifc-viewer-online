// ─── base-url.ts ──────────────────────────────────────────────────────────────
// Where the viewer app lives, from where the SDK module was loaded.
//
// The same built file is served at two paths (scripts/sdk/version-sdk.mjs):
//
//   <app>/sdk/ifc-viewer.es.js          — the latest, which moves with releases
//   <app>/sdk/1.18.0/ifc-viewer.es.js   — pinned, never changes once published
//
// Both must open the same app in their iframe: `../` from the pinned path is
// <app>/sdk/, which would serve the SDK docs page inside the viewer frame.
// Bundled into the SDK; kept apart so it can be tested without a module URL.

/** A version directory as the publisher writes it: 1.18.0, optionally with a pre-release tag. */
const VERSION_DIR = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/**
 * The app's base URL for an SDK module at `moduleUrl`. The directory holding
 * the module is `sdk/` or `sdk/<version>/`; the app is the parent of `sdk/`.
 */
export function appBaseUrlFor(moduleUrl: string): string {
  const here = new URL(moduleUrl)
  const dirs = here.pathname.split('/').slice(0, -1) // drop the file name
  const last = dirs[dirs.length - 1] ?? ''
  const up = VERSION_DIR.test(last) && dirs[dirs.length - 2] === 'sdk' ? '../../' : '../'
  return new URL(up, here).href
}
