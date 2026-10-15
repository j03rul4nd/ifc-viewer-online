// @vitest-environment jsdom
// ─── DrawerResizeGrip smoke tests ─────────────────────────────────────────────
// Mounted with createElement (the repo runs no .test.tsx). Pins the ARIA model,
// the keyboard and double-click steps, that drag frames are not persisted, and
// that the grip stops only its own six keys — Escape must still reach the IDS
// drawer behind it.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '../i18n/config'
import { DrawerResizeGrip } from './DrawerResizeGrip'
import { useUIStore } from '../stores/uiStore'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const KEY = 'ifc-ui-drawer:v1'
let root: Root
let host: HTMLDivElement
let grip: HTMLElement
const parentKeys = vi.fn()

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  localStorage.clear()
  parentKeys.mockClear()
  useUIStore.setState({ bottomDrawerRatio: 0.4 })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const drawer = createRef<HTMLDivElement>()
  act(() => root.render(
    createElement('div', { onKeyDown: (e: { key: string }) => parentKeys(e.key) },
      createElement('div', { ref: drawer },
        createElement(DrawerResizeGrip, { drawerRef: drawer, minPx: 180 }))),
  ))
  Object.defineProperty(drawer.current!, 'offsetHeight', { configurable: true, value: 342 })
  Object.defineProperty(drawer.current!.parentElement!, 'clientHeight', { configurable: true, value: 856 })
  grip = host.querySelector('[role="separator"]')!
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const ratio = () => useUIStore.getState().bottomDrawerRatio
const key = (k: string, shiftKey = false) =>
  act(() => { grip.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true })) })
const pointer = (target: EventTarget, type: string, clientY: number) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { clientY, button: 0, bubbles: true })) })

describe('DrawerResizeGrip', () => {
  it('is an accessible, translated separator', () => {
    expect(grip.getAttribute('aria-orientation')).toBe('horizontal')
    expect(grip.tabIndex).toBe(0)
    expect(grip.getAttribute('aria-label')).toBe('Resize panel')
    expect(grip.getAttribute('title')).toBe('Drag or use the arrow keys to resize. Double-click to switch size.')
    expect(grip.getAttribute('aria-valuenow')).toBe('40')
    expect(grip.getAttribute('aria-valuemin')).toBe('10')
    expect(grip.getAttribute('aria-valuemax')).toBe('90')
  })

  it('resizes from the keyboard and persists', () => {
    key('ArrowUp')
    expect(ratio()).toBeCloseTo(366 / 856, 4)
    expect(JSON.parse(localStorage.getItem(KEY)!).ratio).toBeCloseTo(366 / 856, 4)
    key('ArrowDown', true)
    expect(ratio()).toBeCloseTo(246 / 856, 4)
    act(() => { useUIStore.setState({ bottomDrawerRatio: 0.4 }) })
    key('PageUp')
    expect(ratio()).toBe(0.6)
    key('Home')
    expect(ratio()).toBeCloseTo(180 / 856, 4)
    key('End')
    expect(ratio()).toBeCloseTo(616 / 856, 4)
  })

  it('stops only its own keys', () => {
    for (const k of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) key(k)
    expect(parentKeys).not.toHaveBeenCalled()
    key('Escape')
    key('a')
    expect(parentKeys.mock.calls.map((c) => c[0])).toEqual(['Escape', 'a'])
  })

  it('cycles the detents on double-click', () => {
    act(() => { useUIStore.setState({ bottomDrawerRatio: 0.6 }) })
    act(() => { grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    expect(ratio()).toBe(0.25)
  })

  it('commits a drag on release only', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    pointer(grip, 'pointerdown', 500)
    pointer(document, 'pointermove', 400)
    expect(setItem).not.toHaveBeenCalled()
    pointer(document, 'pointerup', 400)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(ratio()).toBeCloseTo(442 / 856, 4)
    setItem.mockRestore()
  })

  it('snaps near a detent', () => {
    pointer(grip, 'pointerdown', 500)
    pointer(document, 'pointermove', 492)
    pointer(document, 'pointerup', 492)
    expect(ratio()).toBeCloseTo(342 / 856, 4)
    expect(JSON.parse(localStorage.getItem(KEY)!).ratio).toBeCloseTo(0.4, 2)
  })
})
