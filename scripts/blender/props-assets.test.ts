// ─── showcase asset checks ────────────────────────────────────────────────────
// Runs on the Node side, where the files actually are: the browser tests mock
// the loader and can say nothing about what got committed. These guard the
// promise the UI makes about the download.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'fs'
import path from 'path'
import { PROP_ASSETS, PROP_ASSETS_KB } from '../../src/lib/geo/props-assets'

describe('the assets on disk', () => {
  const dir = path.join(process.cwd(), 'public', 'models', 'props')

  it('ships every asset the code asks for', () => {
    for (const name of PROP_ASSETS) {
      expect(existsSync(path.join(dir, `${name}.glb`)), `${name}.glb missing`).toBe(true)
    }
  })

  it('stays within the download the UI promises', () => {
    const total = PROP_ASSETS.reduce(
      (n, name) => n + statSync(path.join(dir, `${name}.glb`)).size, 0,
    )
    // The panel quotes a size. A drift past it is a broken promise, not a nit.
    expect(total / 1024).toBeLessThanOrEqual(PROP_ASSETS_KB * 1.1)
  })

  it('is real glTF binary, not a stub someone committed', () => {
    for (const name of PROP_ASSETS) {
      const head = readFileSync(path.join(dir, `${name}.glb`)).subarray(0, 4).toString('ascii')
      expect(head, `${name}.glb`).toBe('glTF')
    }
  })
})

