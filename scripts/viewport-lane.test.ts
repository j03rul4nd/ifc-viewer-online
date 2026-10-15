// ─── viewport lane guard ──────────────────────────────────────────────────────
// Content panels run down over the Validation/IDS drawer with plain CSS
// (`bottom: calc(12px - var(--lane-drawer-h))`). That only works while a few
// structural facts hold, and nothing at runtime would notice them breaking: an
// `overflow-hidden` or `z-*` on the viewer area would clip or bury the panels,
// a positioned drawer root would paint over them. This pins those facts.
// See docs/WINDOW_DESIGN.md R6.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { RAIL_CLEARANCE_PX } from '../src/lib/ui/lane'

const SRC = path.join(process.cwd(), 'src')
const read = (rel: string): string => readFileSync(path.join(SRC, rel), 'utf8')

function tsxFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

describe('tokens', () => {
  const css = read('index.css')

  it('keeps the camera reserve small', () => {
    const m = css.match(/--viewport-chrome-h:\s*(\d+)px/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeLessThanOrEqual(64)
  })

  it('keeps the rail clearance in step with lane.ts', () => {
    const w = css.match(/--panel-rail-w:\s*(\d+)px;/)
    expect(w).not.toBeNull()
    const extra = css.match(/--panel-rail-clearance:\s*calc\(var\(--panel-rail-w\)\s*\+\s*(\d+)px\);/)
    expect(extra).not.toBeNull()
    expect(Number(w![1]) + Number(extra![1])).toBe(RAIL_CLEARANCE_PX)
  })
})

describe('panels', () => {
  it('no panel caps itself against the window height', () => {
    const offenders = tsxFiles()
      .filter((f) => /maxHeight="calc\(100d?vh/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f))
    expect(offenders).toEqual([])
  })

  it('ViewportPanel uses the lane, not the old reserve', () => {
    const src = read('components/ViewportPanel.tsx')
    expect(src).toContain('data-lane')
    expect(src).toContain('pointer-events-none')
    expect(src).not.toContain('viewport-chrome-clearance')
    expect(src).not.toContain('100vw')
  })
})

describe('the main column', () => {
  it('keeps the viewer area unclipped and without a stacking context', () => {
    const app = read('App.tsx')
    expect(app).toContain('<div data-viewer-area="" className="flex-1 relative">')
    expect(app).toContain('data-main-column')
  })
})
