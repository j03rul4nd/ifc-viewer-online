// @vitest-environment jsdom
// The steel demo under React StrictMode: the doubled effect must not turn the
// tour off (the second run reads the URL after `tour` was stripped). And the
// tour overlay: interactive steps let the click reach their target and move
// on, and the highlight follows a target that moves without any event.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode, act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { bootSteelDemo, resetSteelDemoBoot } from '../../lib/steel/demo'
import { useSteelStore } from '../../stores/steelStore'
import { GuidedTourView } from '../workspace/GuidedTour'
import type { TourStep } from '../../lib/workspace-tours/tours'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let host: HTMLDivElement
const rect = Element.prototype.getBoundingClientRect
let targetTop = 10

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const top = (this as HTMLElement).dataset?.tour ? targetTop : 0
    return { top, left: 10, width: 100, height: 40, right: 110, bottom: top + 40, x: 10, y: top, toJSON() {} } as DOMRect
  }
  Element.prototype.scrollIntoView = () => {}
})
afterAll(() => { Element.prototype.getBoundingClientRect = rect })

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('steel demo boot under StrictMode', () => {
  beforeEach(() => {
    resetSteelDemoBoot()
    useSteelStore.setState({ open: false, demo: false, autoRun: false, tour: false })
    window.history.replaceState(null, '', '/?steel=demo&tour=steel&ref=noam')
  })

  it('starts the tour once and strips `tour` after starting', () => {
    function Boot() {
      useEffect(() => { bootSteelDemo((tour) => useSteelStore.getState().startDemo(tour)) }, [])
      return null
    }
    act(() => root.render(createElement(StrictMode, null, createElement(Boot))))
    expect(useSteelStore.getState()).toMatchObject({ open: true, demo: true, autoRun: true, tour: true })
    expect(window.location.search).toBe('?steel=demo&ref=noam')
  })

  it('a reload (no `tour` left) opens the demo without the tour', () => {
    window.history.replaceState(null, '', '/?steel=demo&ref=noam')
    expect(bootSteelDemo((tour) => useSteelStore.getState().startDemo(tour))).toBe(true)
    expect(useSteelStore.getState().tour).toBe(false)
  })
})

describe('tour overlay', () => {
  const tx = (s: string) => s
  const steps: TourStep[] = [
    { target: 'a', title: 'A', body: 'click it', interactive: true },
    { title: 'B', body: 'end' },
  ]

  it('an interactive step lets the click through to the target and moves on', () => {
    vi.useFakeTimers()
    const clicked = vi.fn()
    const target = document.createElement('button')
    target.dataset.tour = 'a'
    target.addEventListener('click', clicked)
    document.body.appendChild(target)
    act(() => root.render(createElement(GuidedTourView, { title: 'T', steps, onClose: () => {}, tx })))
    // No full-screen shield: four pieces around the target.
    const overlay = host.firstElementChild as HTMLElement
    const shields = [...overlay.children].filter((c) => (c as HTMLElement).style.right === '0px' || (c as HTMLElement).style.left === '0px')
    expect(shields.length).toBe(4)
    expect(host.querySelector('h2')!.textContent).toBe('A')
    act(() => { target.click() })
    expect(clicked).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(500) })
    expect(host.querySelector('h2')!.textContent).toBe('B')
    target.remove()
  })

  it('the highlight follows a target that moves', async () => {
    targetTop = 10
    const target = document.createElement('div')
    target.dataset.tour = 'a'
    document.body.appendChild(target)
    act(() => root.render(createElement(GuidedTourView, { title: 'T', steps: [{ target: 'a', title: 'A', body: 'x' }, { title: 'B', body: 'y' }], onClose: () => {}, tx })))
    const spot = () => [...host.querySelectorAll<HTMLElement>('[aria-hidden]')].find((e) => e.style.boxShadow)!
    expect(spot().style.top).toBe('4px')
    targetTop = 200
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(spot().style.top).toBe('194px')
    target.remove()
    targetTop = 10
  })
})
