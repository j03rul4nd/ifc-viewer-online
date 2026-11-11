// @vitest-environment jsdom
// ─── ScanList ─────────────────────────────────────────────────────────────────
// Mounts the real list against the real store (createRoot + act, like
// components/loading/loading-ui.test.ts). Pins the selection rules, the Escape
// layering the panel registry relies on (a consumed Esc is defaultPrevented,
// an unconsumed one is not), and that nothing is removed without a confirm.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '../../i18n/config'
import { ScanList, type ScanListProps } from './ScanList'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useTopicStore } from '../../stores/topicStore'
import { __resetCloudPrefsForTests } from '../../lib/pointcloud/pc-prefs'
import { DEFAULT_DISPLAY, type PointCloudEntry } from '../../lib/pointcloud/pc-types'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

function entry(id: string): PointCloudEntry {
  return {
    id, fileName: `${id}.las`, fileSize: 1024, format: 'las',
    status: 'ready', errorKey: null, progress: 100,
    pointCount: 1000, declaredCount: null, truncated: false, streamErrorKey: null, visible: true,
    frame: null,
    attributes: { color: true, intensity: false, classification: false, confidence: false },
    alignment: null, alignedToModelId: null, fileKey: `url:/${id}.las`, loadedAt: 1, color: 0x4C9AFF,
  }
}

let host: HTMLDivElement
let root: Root
let props: ScanListProps

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

beforeEach(() => {
  localStorage.clear()
  __resetCloudPrefsForTests()
  useTopicStore.setState({ topics: [], members: {} })
  usePointCloudStore.setState({
    clouds: [entry('a'), entry('b'), entry('c')], activeCloudId: 'c', display: { ...DEFAULT_DISPLAY },
    selectedCloudIds: [], selectionAnchorId: null, editScope: 'all', samplesOpen: false,
  })
  props = {
    describeError: () => 'error',
    issueCountById: {},
    onVisible: vi.fn(), onSolo: vi.fn(), onFrame: vi.fn(), onLocate: vi.fn(), onRemove: vi.fn(),
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (): void => { act(() => root.render(createElement(ScanList, props))) }
const row = (id: string): HTMLElement => host.querySelector(`[data-testid=pc-scan-row][data-cloud-id=${id}]`) as HTMLElement
const selected = (): string[] => usePointCloudStore.getState().selectedCloudIds
const click = (el: Element, init: MouseEventInit = {}): void => {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })) })
}
const key = (init: KeyboardEventInit): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => { host.querySelector('[data-testid=pc-scan-list]')!.dispatchEvent(e) })
  return e
}
const button = (text: string): HTMLButtonElement =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement

describe('ScanList', () => {
  it('selects with click, Ctrl-click and Shift-click', () => {
    render()
    click(row('a'))
    expect(selected()).toEqual(['a'])
    click(row('c'), { ctrlKey: true })
    expect(selected()).toEqual(['a', 'c'])
    click(row('b'), { shiftKey: true })
    expect(selected()).toEqual(['b', 'c'])
  })

  it('Escape clears the selection first, then lets the panel close', () => {
    render()
    click(row('a'))
    const first = key({ key: 'Escape' })
    expect(selected()).toEqual([])
    expect(first.defaultPrevented).toBe(true)
    const second = key({ key: 'Escape' })
    expect(second.defaultPrevented).toBe(false)
  })

  it('Ctrl+A selects every scan', () => {
    render()
    const e = key({ key: 'a', ctrlKey: true })
    expect(selected()).toEqual(['a', 'b', 'c'])
    expect(e.defaultPrevented).toBe(true)
  })

  it('removes a selection only after an inline confirm', () => {
    usePointCloudStore.getState().selectClouds(['a', 'b'])
    render()
    click(host.querySelector('[data-testid=pc-bulk-remove]')!)
    const confirm = host.querySelector('[data-testid=pc-remove-confirm]')!
    expect(confirm.textContent).toContain('2')
    click(button('Keep'))
    expect(props.onRemove).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid=pc-remove-confirm]')).toBeNull()
    click(host.querySelector('[data-testid=pc-bulk-remove]')!)
    click(button('Yes, remove'))
    expect(props.onRemove).toHaveBeenCalledWith(['a', 'b'])
  })

  it("asks 'Remove?' on a row before removing it", () => {
    render()
    click(row('a').querySelector('[data-testid=pc-row-remove]')!)
    expect(props.onRemove).not.toHaveBeenCalled()
    expect(row('a').textContent).toContain('Remove?')
    click(row('a').querySelector('[data-testid=pc-row-remove]')!)
    expect(props.onRemove).toHaveBeenCalledWith(['a'])
  })

  it('colours a row with things to check amber', () => {
    props.issueCountById = { a: 2 }
    render()
    const dot = row('a').querySelector('[data-testid=pc-row-health]') as HTMLElement
    expect(dot.style.background).toMatch(/rgb\(233, 162, 59\)|#E9A23B/i)
    expect(dot.title).toContain('Things to check: 2')
  })
})
