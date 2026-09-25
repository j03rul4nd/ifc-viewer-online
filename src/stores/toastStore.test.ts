// Toasts with one action ("Load a copy anyway"): the callback lives outside
// the store, runs once, and never outlives its toast — and the toast holding
// it stays put while the user is on it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '../i18n/config'
import ToastContainer from '../components/ToastContainer'
import { useToastStore, toast, runToastAction, pauseToast, resumeToast } from './toastStore'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement | null = null
let root: Root | null = null
function mount(): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(createElement(ToastContainer)) })
  return host
}
/** The newest such button: a toast that just closed may still be animating out above it. */
const buttonNamed = (el: HTMLElement, name: string): HTMLButtonElement | undefined =>
  [...el.querySelectorAll('button')].filter((b) => b.textContent === name || b.getAttribute('aria-label') === name).pop()

beforeEach(() => {
  useToastStore.getState().clearAll()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  root = null
  host = null
  vi.useRealTimers()
})

describe('toast actions', () => {
  it('keeps only the label in the store; the callback runs once and dismisses the toast', () => {
    const run = vi.fn()
    toast('site.las is already in the scene', 'info', { action: { label: 'Load a copy anyway', run } })
    const [t] = useToastStore.getState().toasts
    expect(t).toMatchObject({ message: 'site.las is already in the scene', actionLabel: 'Load a copy anyway' })
    // Serialisable: nothing but plain data in the store.
    expect(JSON.parse(JSON.stringify(t))).toEqual(t)

    runToastAction(t.id)
    runToastAction(t.id)
    expect(run).toHaveBeenCalledTimes(1)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('a dismissed or expired toast forgets its action', () => {
    vi.useFakeTimers()
    const a = vi.fn()
    const b = vi.fn()
    toast('one', 'info', { action: { label: 'x', run: a } })
    toast('two', 'info', { duration: 100, action: { label: 'y', run: b } })
    const [one, two] = useToastStore.getState().toasts
    useToastStore.getState().removeToast(one.id)
    vi.advanceTimersByTime(150)
    runToastAction(one.id)
    runToastAction(two.id)
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })

  it('a throwing action still dismisses its toast', () => {
    toast('boom', 'info', { action: { label: 'x', run: () => { throw new Error('no') } } })
    const [t] = useToastStore.getState().toasts
    expect(() => runToastAction(t.id)).not.toThrow()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('duration 0: the toast stays until it is closed, and toast() hands back its id to close it', () => {
    vi.useFakeTimers()
    const id = toast('stays', 'info', { duration: 0, action: { label: 'x', run: () => {} } })
    vi.advanceTimersByTime(60_000)
    expect(useToastStore.getState().toasts.map((t) => t.id)).toEqual([id])
    useToastStore.getState().removeToast(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('a paused countdown keeps the toast, and resumes with the time it had left', () => {
    vi.useFakeTimers()
    toast('held', 'info', { duration: 1000 })
    const [t] = useToastStore.getState().toasts
    vi.advanceTimersByTime(600)
    pauseToast(t.id)
    vi.advanceTimersByTime(5000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    resumeToast(t.id)
    vi.advanceTimersByTime(350)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

describe('ToastContainer', () => {
  it('renders the action; clicking it runs the action (not just the dismiss)', () => {
    const run = vi.fn()
    const el = mount()
    act(() => { toast('dup', 'info', { action: { label: 'Load a copy anyway', run } }) })
    const button = buttonNamed(el, 'Load a copy anyway')
    expect(button).toBeTruthy()
    act(() => { button!.click() })
    expect(run).toHaveBeenCalledTimes(1)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('a toast without an action has no action button, only its close button', () => {
    const el = mount()
    act(() => { toast('plain', 'success') })
    expect(el.textContent).toContain('plain')
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons).toHaveLength(1)
    expect(buttons[0].getAttribute('aria-label')).toBeTruthy()
  })

  it('a toast is heard: its message alone goes to a polite region, an error to an assertive one', () => {
    const el = mount()
    const polite = el.querySelector('[data-toast-announcer="polite"]') as HTMLElement
    const assertive = el.querySelector('[data-toast-announcer="assertive"]') as HTMLElement
    expect(polite.getAttribute('aria-live')).toBe('polite')
    expect(assertive.getAttribute('aria-live')).toBe('assertive')
    act(() => { toast('dup', 'info', { action: { label: 'Load a copy anyway', run: () => {} } }) })
    // The message and a word about its option — not the buttons' names ("Close").
    expect(polite.textContent).toMatch(/^dup\. /)
    expect(polite.textContent).toContain('Load a copy anyway')
    expect(polite.textContent).not.toContain('Close')
    act(() => { toast('bad', 'error') })
    expect(assertive.textContent).toBe('bad')
    expect(polite.textContent).toMatch(/^dup\. /)
    // No live region wraps the visible stack (nested regions read twice), and nothing is an alert inside it.
    expect(el.querySelectorAll('[aria-live]')).toHaveLength(2)
    expect(el.querySelector('[role="alert"]')).toBeNull()
  })

  it('toasts raised together are all heard, in order; the region empties again after a while', () => {
    vi.useFakeTimers()
    const el = mount()
    const polite = el.querySelector('[data-toast-announcer="polite"]') as HTMLElement
    act(() => { toast('first', 'info'); toast('second', 'warning') })
    expect(polite.textContent).toBe('first second')
    act(() => { vi.advanceTimersByTime(8000) })
    expect(polite.textContent).toBe('')
  })

  it('the same message twice is heard twice; a toast leaving says nothing', () => {
    const el = mount()
    const polite = el.querySelector('[data-toast-announcer="polite"]') as HTMLElement
    act(() => { toast('again', 'info') })
    const first = polite.textContent
    act(() => { toast('again', 'info') })
    expect(polite.textContent).not.toBe(first)
    expect(polite.textContent?.trim()).toBe('again')
    const said = polite.textContent
    act(() => { useToastStore.getState().clearAll() })
    expect(polite.textContent).toBe(said)
  })

  it('closing a toast from the keyboard hands focus back to where it came from', () => {
    const el = mount()
    const origin = document.createElement('button')
    origin.textContent = 'origin'
    document.body.appendChild(origin)
    try {
      act(() => { toast('dup', 'info', { action: { label: 'Load a copy anyway', run: () => {} } }) })
      origin.focus()
      const close = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label'))!
      act(() => { close.focus() })
      expect(document.activeElement).toBe(close)
      act(() => { close.click() })
      expect(document.activeElement).toBe(origin)

      act(() => { toast('dup 2', 'info', { action: { label: 'Load a copy anyway', run: () => {} } }) })
      origin.focus()
      const action = buttonNamed(el, 'Load a copy anyway')!
      act(() => { action.focus() })
      act(() => { action.click() })
      expect(document.activeElement).toBe(origin)
    } finally {
      origin.remove()
    }
  })

  it('a toast closed by code while focus is in it hands focus back too', () => {
    const el = mount()
    const origin = document.createElement('button')
    document.body.appendChild(origin)
    try {
      let id = ''
      act(() => { id = toast('dup', 'info', { action: { label: 'Load a copy anyway', run: () => {} } }) })
      origin.focus()
      const action = buttonNamed(el, 'Load a copy anyway')!
      act(() => { action.focus() })
      // A newer duplicate replaces it, say.
      act(() => { useToastStore.getState().removeToast(id) })
      expect(document.activeElement).toBe(origin)
    } finally {
      origin.remove()
    }
  })

  it('coming back from another window does not make the toast forget where focus came from', () => {
    const el = mount()
    const origin = document.createElement('button')
    document.body.appendChild(origin)
    try {
      act(() => { toast('dup', 'info', { action: { label: 'Load a copy anyway', run: () => {} } }) })
      origin.focus()
      const close = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label'))!
      act(() => { close.focus() })
      // The window regains focus: focus fires again on the same element, with no relatedTarget.
      act(() => { close.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: null })) })
      act(() => { close.click() })
      expect(document.activeElement).toBe(origin)
    } finally {
      origin.remove()
    }
  })

  it('focus inside a toast holds it past its duration, like the pointer does', () => {
    vi.useFakeTimers()
    const el = mount()
    act(() => { toast('stay', 'info', { duration: 1000, action: { label: 'x', run: () => {} } }) })
    const action = buttonNamed(el, 'x')!
    act(() => { action.focus() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    act(() => { action.blur() })
    act(() => { vi.advanceTimersByTime(1100) })
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('a toast that stays until closed shows no countdown', () => {
    const el = mount()
    act(() => { toast('stays', 'info', { duration: 0, action: { label: 'x', run: () => {} } }) })
    const card = el.querySelector('.pointer-events-auto') as HTMLElement
    expect([...card.querySelectorAll('div')].some((d) => d.style.animation.includes('toast-countdown'))).toBe(false)
    act(() => { toast('goes', 'info', { duration: 1000 }) })
    const cards = el.querySelectorAll('.pointer-events-auto')
    const last = cards[cards.length - 1] as HTMLElement
    expect([...last.querySelectorAll('div')].some((d) => d.style.animation.includes('toast-countdown'))).toBe(true)
  })

  it('a missed tap on a toast with an action does not throw the action away; its ✕ closes it', () => {
    const run = vi.fn()
    const el = mount()
    act(() => { toast('dup', 'info', { action: { label: 'Load a copy anyway', run } }) })
    const card = el.querySelector('.pointer-events-auto') as HTMLElement
    act(() => { card.click() })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    const close = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label'))!
    act(() => { close.click() })
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(run).not.toHaveBeenCalled()
  })

  it('a click anywhere still dismisses a plain toast', () => {
    const el = mount()
    act(() => { toast('plain', 'info') })
    act(() => { (el.querySelector('.pointer-events-auto') as HTMLElement).click() })
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('hovering a toast holds it past its duration', () => {
    vi.useFakeTimers()
    const el = mount()
    act(() => { toast('stay', 'info', { duration: 1000 }) })
    const card = el.querySelector('.pointer-events-auto') as HTMLElement
    act(() => { card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    act(() => { card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })) })
    act(() => { vi.advanceTimersByTime(1100) })
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
