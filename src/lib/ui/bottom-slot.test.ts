// Validation and IDS share one bottom slot: whichever opens last wins.
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function fresh() {
  vi.resetModules()
  const ui = await import('../../stores/uiStore')
  const ids = await import('../../stores/idsStore')
  const slot = await import('./bottom-slot')
  return { ui: ui.useUIStore, ids: ids.useIdsStore, install: slot.installBottomSlotRule }
}

beforeEach(() => {
  localStorage.clear()
})

describe('bottom slot rule', () => {
  it('opening Validation closes IDS', async () => {
    const { ui, ids, install } = await fresh()
    const off = install()
    ids.getState().setPanelOpen(true)
    ui.getState().setValidationPanelOpen(true)
    expect(ids.getState().panelOpen).toBe(false)
    off()
  })

  it('opening IDS collapses Validation, persistently', async () => {
    const { ui, ids, install } = await fresh()
    const off = install()
    ui.getState().setValidationPanelOpen(true)
    ids.getState().setPanelOpen(true)
    expect(ui.getState().validationPanelOpen).toBe(false)
    expect(JSON.parse(localStorage.getItem('ifc-ui-columns:v1')!).validation).toBe(false)
    off()
  })

  it('covers setState and toggles', async () => {
    const { ui, ids, install } = await fresh()
    const off = install()
    ids.getState().setPanelOpen(true)
    ui.setState({ validationPanelOpen: true })
    expect(ids.getState().panelOpen).toBe(false)
    ui.getState().setValidationPanelOpen(false)
    ids.getState().setPanelOpen(true)
    ui.getState().toggleValidationPanel()
    expect(ui.getState().validationPanelOpen).toBe(true)
    expect(ids.getState().panelOpen).toBe(false)
    off()
  })

  it('closing either never opens the other', async () => {
    const { ui, ids, install } = await fresh()
    const off = install()
    ui.getState().setValidationPanelOpen(true)
    ui.getState().setValidationPanelOpen(false)
    expect(ids.getState().panelOpen).toBe(false)
    ids.getState().setPanelOpen(true)
    ids.getState().setPanelOpen(false)
    expect(ui.getState().validationPanelOpen).toBe(false)
    off()
  })

  it('detach removes the rule', async () => {
    const { ui, ids, install } = await fresh()
    install()()
    ids.getState().setPanelOpen(true)
    ui.getState().setValidationPanelOpen(true)
    expect(ids.getState().panelOpen).toBe(true)
  })

  it('is idempotent', async () => {
    const { ui, ids, install } = await fresh()
    const a = install()
    expect(install()).toBe(a)
    ids.getState().setPanelOpen(true)
    let closes = 0
    const off = ids.subscribe((s, p) => { if (p.panelOpen && !s.panelOpen) closes++ })
    ui.setState({ validationPanelOpen: true })
    expect(closes).toBe(1)
    off()
    a()
  })
})
