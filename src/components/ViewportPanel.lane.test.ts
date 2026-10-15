// @vitest-environment jsdom
// ─── ViewportPanel lane contract ──────────────────────────────────────────────
// jsdom has no layout, so this pins the contract rather than the pixels (the
// browser check measures those): which panels run over the results drawer and
// claim the lane, that the wrapper lets clicks through while the card takes
// them, and that closing releases the claim. Inline calc()/var() strings are
// not asserted — jsdom's cssstyle may drop them.

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ViewportPanel, type ViewportPanelProps } from './ViewportPanel'
import { useLaneStore } from '../stores/laneStore'
import { resetPanelRegistry } from '../lib/ui/panel-registry'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  resetPanelRegistry()
  useLaneStore.setState({ columnWidthPx: 0, claim: null })
})

function render(props: { id: string; mobile: 'sheet' | 'dock'; widthPx: number; open: boolean }) {
  if (!host) {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  }
  const el = createElement(
    ViewportPanel,
    { ...props, label: props.id, onClose: () => undefined, children: null } as ViewportPanelProps,
    createElement('div', null, 'body'),
  )
  act(() => root!.render(el))
}

const wrapper = (id: string) => document.querySelector<HTMLElement>(`[data-viewport-panel="${id}"]`)

describe('content panels run over the drawer', () => {
  it('claims the column lane and splits pointer events', () => {
    useLaneStore.setState({ columnWidthPx: 1120 })
    render({ id: 'pointcloud', mobile: 'sheet', widthPx: 380, open: true })
    const w = wrapper('pointcloud')!
    expect(w.getAttribute('data-lane')).toBe('column')
    expect(w.className).toContain('pointer-events-none')
    expect((w.firstElementChild as HTMLElement).className).toContain('pointer-events-auto')
    expect(useLaneStore.getState().claim).toEqual({ id: 'pointcloud', widthPx: 380, overDrawer: true })

    render({ id: 'pointcloud', mobile: 'sheet', widthPx: 380, open: false })
    expect(useLaneStore.getState().claim).toBeNull()
  })

  it('stays in the viewer when the drawer would be too narrow, but still claims', () => {
    useLaneStore.setState({ columnWidthPx: 800 })
    render({ id: 'pointcloud', mobile: 'sheet', widthPx: 380, open: true })
    expect(wrapper('pointcloud')!.getAttribute('data-lane')).toBe('viewer')
    expect(useLaneStore.getState().claim).toEqual({ id: 'pointcloud', widthPx: 380, overDrawer: false })
  })
})

describe('palettes stay in the viewer', () => {
  it('never claims the lane', () => {
    useLaneStore.setState({ columnWidthPx: 1120 })
    render({ id: 'measurement', mobile: 'dock', widthPx: 288, open: true })
    expect(wrapper('measurement')!.getAttribute('data-lane')).toBe('viewer')
    expect(useLaneStore.getState().claim).toBeNull()
  })
})
