// ─── modal migration guard ────────────────────────────────────────────────────
// Lives in scripts/ rather than beside the components it inspects: it reads the
// repository from disk, which is a build-time concern, and `tsconfig.json`
// type-checks `src` as browser code with no node types.
// The way ten dialogs drifted apart is that nothing stopped an eleventh from
// being written the same way. This is that something.
//
// It does not demand that every dialog already be migrated — that is a list, and
// a list is allowed to shrink. It demands that the list never GROWS, and that the
// things already migrated stay migrated.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'src', 'components')

/** Every .tsx under src/components, recursively. */
function componentFiles(dir = ROOT): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return componentFiles(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

const rel = (f: string): string => path.relative(ROOT, f).replace(/\\/g, '/')

/**
 * Dialogs still building their own shell.
 *
 * Every entry is a promise to migrate, not a permanent exemption. Three shapes
 * live here for different reasons:
 *
 *   • Export/Embed/Ids are anchored POPOVERS hanging off a toolbar button, not
 *     centred dialogs. Converting them is a product decision about what they
 *     should be, not a refactor, so they are deliberately not swept in.
 *   • CustomProfileModal is already Radix, and correct; it only needs the shared
 *     appearance.
 *   • The rest are queued.
 */
const NOT_YET_MIGRATED = new Set([
  'CustomProfileModal.tsx',
  'ValidationExportModal.tsx',
  'CapturePreviewModal.tsx',
  'account/AccountModal.tsx',
  'eir/EirProfileEditor.tsx',
  // Not dialogs: overlays, sheets and menus with their own rules.
  'CaptureToolbar.tsx',
  'ClientPresentationLayout.tsx',
  'DemoGallery.tsx',
  'InviteView.tsx',
  'MobileBottomNav.tsx',
  'SceneBackgroundMenu.tsx',
  'SceneContextMenu.tsx',
  'UploadOverlay.tsx',
  'blog/CopyForAI.tsx',
  'dashboard/AdminView.tsx',
  'dashboard/DashboardView.tsx',
  'mobile/IdsFailurePager.tsx',
  'mobile/MobileActionSheet.tsx',
  'mobile/MobileSheet.tsx',
])

/** A component that pins a full-screen layer is building a dialog shell. */
function buildsItsOwnShell(source: string): boolean {
  return /className="[^"]*fixed inset-0/.test(source)
}

describe('nobody builds their own dialog shell', () => {
  const offenders = componentFiles()
    .filter((f) => rel(f) !== 'Modal.tsx')
    .filter((f) => buildsItsOwnShell(readFileSync(f, 'utf8')))
    .map(rel)

  it('has no NEW hand-rolled dialogs', () => {
    const unexpected = offenders.filter((f) => !NOT_YET_MIGRATED.has(f))
    expect(unexpected, `these build their own dialog shell — use Modal instead:\n${unexpected.join('\n')}`)
      .toEqual([])
  })

  it('keeps the exemption list honest', () => {
    // An entry that no longer matches anything means the file was migrated and
    // the list was not updated — which is how an allow-list quietly becomes a
    // place where things go to be forgotten.
    const stale = [...NOT_YET_MIGRATED].filter((f) => !offenders.includes(f))
    expect(stale, `already migrated (or gone) — remove from NOT_YET_MIGRATED:\n${stale.join('\n')}`)
      .toEqual([])
  })
})

describe('what has been migrated stays migrated', () => {
  const migrated = [
    'pro/ProUpsellModal.tsx', 'KeyboardHelpModal.tsx',
    'ExportModal.tsx', 'EmbedModal.tsx', 'IdsModal.tsx',
  ]

  for (const file of migrated) {
    it(`${file} uses Modal`, () => {
      const source = readFileSync(path.join(ROOT, file), 'utf8')
      expect(source).toMatch(/from '\.{1,2}\/(\.\.\/)?Modal'/)
      expect(source, 'still portals its own dialog').not.toMatch(/createPortal/)
      expect(source, 'still listens for Escape itself').not.toMatch(/'Escape'/)
    })
  }
})
