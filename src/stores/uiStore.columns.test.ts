// The rule for docked columns, as assertions.
//
// A column collapses IN PLACE, its state lives here rather than inside its
// component, and all three remember themselves together. The last part is what
// stopped being true by accident before: the sidebar kept its own `useState`,
// so it forgot itself on every remount while the other two survived a reload.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const KEY = 'ifc-ui-columns:v1'

/**
 * A fresh store, reading whatever is in localStorage right now.
 *
 * The module has to be re-evaluated, not merely re-imported: the defaults are
 * read once at creation, which is exactly the behaviour under test.
 */
async function freshStore() {
  vi.resetModules()
  const mod = await import('./uiStore')
  return mod.useUIStore as unknown as { getState: () => Record<string, unknown> }
}

beforeEach(() => {
  localStorage.clear()
})

describe('all three columns live in the store', () => {
  it('exposes an open flag and a setter for each', async () => {
    const store = (await freshStore()).getState()
    for (const key of ['treeVisible', 'sidebarExpanded', 'validationPanelOpen']) {
      expect(typeof store[key], key).toBe('boolean')
    }
    for (const key of ['setTreeVisible', 'setSidebarExpanded', 'setValidationPanelOpen']) {
      expect(typeof store[key], key).toBe('function')
    }
  })
})

describe('they remember themselves, together', () => {
  it('persists a collapse and reads it back on the next session', async () => {
    const store = await freshStore()
    ;(store.getState().setTreeVisible as (v: boolean) => void)(false)
    expect(JSON.parse(localStorage.getItem(KEY)!).tree).toBe(false)

    const next = await freshStore()
    expect(next.getState().treeVisible).toBe(false)
  })

  it('writing one column does not wipe the others', async () => {
    // The trap in storing three flags as one object: a setter that writes only
    // its own field resets the rest to their defaults, so collapsing the tree
    // would quietly reopen the sidebar.
    const store = await freshStore()
    const s = store.getState()
    ;(s.setSidebarExpanded as (v: boolean) => void)(false)
    ;(store.getState().setTreeVisible as (v: boolean) => void)(false)

    const saved = JSON.parse(localStorage.getItem(KEY)!)
    expect(saved.sidebar).toBe(false)
    expect(saved.tree).toBe(false)
  })

  it('all three round-trip independently', async () => {
    const store = await freshStore()
    ;(store.getState().setTreeVisible as (v: boolean) => void)(false)
    ;(store.getState().setSidebarExpanded as (v: boolean) => void)(true)
    ;(store.getState().setValidationPanelOpen as (v: boolean) => void)(true)

    const next = (await freshStore()).getState()
    expect(next.treeVisible).toBe(false)
    expect(next.sidebarExpanded).toBe(true)
    expect(next.validationPanelOpen).toBe(true)
  })
})

describe('a broken preference must not break the layout', () => {
  it('falls back to defaults on unreadable JSON', async () => {
    localStorage.setItem(KEY, '{not json')
    const store = (await freshStore()).getState()
    expect(store.treeVisible).toBe(true)
    expect(store.sidebarExpanded).toBe(true)
  })

  it('ignores fields of the wrong type rather than trusting them', async () => {
    localStorage.setItem(KEY, JSON.stringify({ tree: 'yes', sidebar: false }))
    const store = (await freshStore()).getState()
    expect(store.treeVisible).toBe(true)     // default, not the string
    expect(store.sidebarExpanded).toBe(false) // honoured
  })
})
