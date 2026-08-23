import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  announceOpen, announceClosed, closeTopPanel, openPanels, resetPanelRegistry,
} from './panel-registry'

beforeEach(() => {
  resetPanelRegistry()
  document.body.innerHTML = ''
})

describe('one panel at a time', () => {
  it('closes the panel that was open when another opens', () => {
    // The whole point: eight panels render into the same slot at the right
    // edge, so two open at once is never what anybody wanted to look at.
    const closeMap = vi.fn()
    announceOpen('map', closeMap)
    announceOpen('pointcloud', vi.fn())
    expect(closeMap).toHaveBeenCalledTimes(1)
    expect(openPanels()).toEqual(['pointcloud'])
  })

  it('closes ALL of them, not just the most recent', () => {
    // Reachable whenever something opens a panel without going through the
    // shell — an SDK command, a deep link — and leaves two registered.
    const a = vi.fn(); const b = vi.fn()
    announceOpen('a', a)
    announceOpen('b', b)
    expect(a).toHaveBeenCalled()
    announceOpen('c', vi.fn())
    expect(b).toHaveBeenCalled()
    expect(openPanels()).toEqual(['c'])
  })

  it('never closes the panel that is opening', () => {
    const close = vi.fn()
    announceOpen('map', close)
    expect(close).not.toHaveBeenCalled()
  })

  it('does not close itself when it re-renders', () => {
    // The parent re-rendering must not read as "a panel opened", or a panel
    // would dismiss itself on every keystroke typed into it.
    const close = vi.fn()
    announceOpen('map', close)
    announceOpen('map', close)
    announceOpen('map', close)
    expect(close).not.toHaveBeenCalled()
    expect(openPanels()).toEqual(['map'])
  })

  it('keeps its place in the order when it re-renders', () => {
    // A re-render must not promote a panel past one that genuinely opened
    // later, or Escape would start taking the wrong one.
    announceOpen('a', vi.fn())
    resetPanelRegistry()
    announceOpen('a', vi.fn())
    announceOpen('a', vi.fn())
    expect(openPanels()).toEqual(['a'])
  })
})

describe('escape closes the most recent', () => {
  it('reports whether it had anything to close', () => {
    // The caller needs to know: Escape means other things elsewhere in the app,
    // and swallowing it unconditionally would break them.
    expect(closeTopPanel()).toBe(false)
    announceOpen('map', vi.fn())
    expect(closeTopPanel()).toBe(true)
    expect(openPanels()).toEqual([])
  })

  it('takes the one that is open, whichever it is', () => {
    const map = vi.fn(); const cloud = vi.fn()
    announceOpen('map', map)
    announceOpen('pointcloud', cloud)   // exclusivity already closed 'map'
    expect(map).toHaveBeenCalledTimes(1)
    closeTopPanel()
    expect(cloud).toHaveBeenCalledTimes(1)
    expect(openPanels()).toEqual([])
  })
})

describe('the Escape key itself', () => {
  const press = (): boolean => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('closes the open panel and consumes the key', () => {
    const close = vi.fn()
    announceOpen('map', close)
    expect(press()).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('leaves the key alone when no panel is open', () => {
    expect(press()).toBe(false)
  })

  it('leaves a MODAL to handle its own Escape', () => {
    // A modal sits on top and traps focus. Without this, Escape would close the
    // panel hidden behind it and leave the modal standing.
    const close = vi.fn()
    announceOpen('map', close)
    document.body.innerHTML = '<div role="dialog"></div>'
    expect(press()).toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  it('stops listening once the last panel closes', () => {
    const close = vi.fn()
    announceOpen('map', close)
    announceClosed('map')
    expect(press()).toBe(false)
  })
})

describe('a modal on top owns Escape, attribute or not', () => {
  it('yields to a modal that is in the stack', async () => {
    // The DOM query alone was not enough: six of the ten dialogs in this app
    // never set role="dialog", so Escape over them closed the panel behind.
    const { pushModal, resetModalStack } = await import('./modal-stack')
    resetModalStack()
    const close = vi.fn()
    pushModal('export')
    // The panel opens while the dialog is up — the SDK and deep links can do
    // this. It must not then steal Escape from the dialog.
    announceOpen('map', close)
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    window.dispatchEvent(event)
    expect(close).not.toHaveBeenCalled()
    resetModalStack()
  })
})
