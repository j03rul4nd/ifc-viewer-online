// ─── toolbar gating ───────────────────────────────────────────────────────────
// View, Tools and Share used to be disabled on `canRun`, which is false while
// validation runs — and auto-validate is on by default, so the menus went grey
// right after every load. They now follow scene content. This source guard
// keeps the validation run out of those three gates and the "+ Add data" doors
// wired.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const src = readFileSync(join(resolve(__dirname, '..'), 'src/components/Toolbar.tsx'), 'utf8')

describe('toolbar gating', () => {
  it.each(['view', 'tools', 'share'])('the %s menu does not wait for the validation run', (id) => {
    const tag = new RegExp(`<ToolMenu\\s+id="${id}"[\\s\\S]*?>`).exec(src)
    expect(tag, `ToolMenu id="${id}" not found`).not.toBeNull()
    expect(tag![0]).not.toContain('canRun')
  })

  it('keeps the Add data doors and drops the old Add-to-scene group', () => {
    expect(src).toContain('data-testid="toolbar-add-data"')
    expect(src).toContain('data-testid="mobile-add-data"')
    expect(src).not.toContain("<MenuLabel>{t('menu.addData')}")
  })
})
