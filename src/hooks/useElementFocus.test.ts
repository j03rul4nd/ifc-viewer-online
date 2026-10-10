// useElementFocus: every handler that frames must frame the model it was given,
// not just select in it. expressIDs collide across federated models, so a
// dropped modelId on the framing call put the camera on #N of whichever model
// the viewer found first while the selection landed in the right one.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ViewerAPI } from '../lib/viewer'
import type { ModelTreeHandle } from '../App'
import { useUIStore } from '../stores/uiStore'
import { useElementFocus } from './useElementFocus'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

type Handlers = ReturnType<typeof useElementFocus>

let host: HTMLDivElement | null = null
let root: Root | null = null

function mount(): {
  viewer: Pick<ViewerAPI, 'focusElement' | 'selectElement' | 'frameElements'>
  handlers: Handlers
  treeRef: { current: ModelTreeHandle | null }
} {
  const viewer = { focusElement: vi.fn(), selectElement: vi.fn(), frameElements: vi.fn() }
  const viewerRef = { current: viewer as unknown as ViewerAPI }
  const treeRef: { current: ModelTreeHandle | null } = { current: null }
  let handlers: Handlers | null = null
  function Probe(): null {
    handlers = useElementFocus(viewerRef, treeRef)
    return null
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(createElement(Probe)) })
  return { viewer, handlers: handlers!, treeRef }
}

afterEach(() => {
  vi.useRealTimers()
  if (root) act(() => root!.unmount())
  host?.remove()
  root = null
  host = null
})

describe('useElementFocus', () => {
  it('jumpToElement frames and selects in the same model (validation "View")', () => {
    const { viewer, handlers } = mount()
    handlers.jumpToElement(42, 'mep')
    expect(viewer.focusElement).toHaveBeenCalledWith(42, 'mep')
    expect(viewer.selectElement).toHaveBeenCalledWith(42, 'mep')
  })

  it('frameElement frames and selects in the same model (context menu "Frame")', () => {
    const { viewer, handlers } = mount()
    handlers.frameElement(7, 'structure')
    expect(viewer.focusElement).toHaveBeenCalledWith(7, 'structure')
    expect(viewer.selectElement).toHaveBeenCalledWith(7, 'structure')
  })

  it('focusElements frames the given model (tree double-click)', () => {
    const { viewer, handlers } = mount()
    handlers.focusElements([3, 4], 'arch')
    expect(viewer.frameElements).toHaveBeenCalledWith([3, 4], 'arch')
  })

  it('leaves the model to the viewer when the caller has none', () => {
    const { viewer, handlers } = mount()
    handlers.jumpToElement(42)
    expect(viewer.focusElement).toHaveBeenCalledWith(42, undefined)
    expect(viewer.selectElement).toHaveBeenCalledWith(42, undefined)
  })
})

// Reveal in tree on a phone: the tree is a sheet that is not mounted while
// closed, and mounts its content a render after it opens. A fixed 80 ms wait
// either found it or answered "not in the tree" for an element that is.
describe('useElementFocus.revealInTree', () => {
  it('opens a closed tree and reveals once it has mounted, however long that takes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    useUIStore.getState().setTreeVisible(false)
    const { handlers, treeRef } = mount()
    const revealElement = vi.fn(() => ({ ok: true as const, viaHost: false as const }))

    const outcome = handlers.revealInTree(42, 'arch')
    expect(useUIStore.getState().treeVisible).toBe(true)

    await vi.advanceTimersByTimeAsync(300)          // the sheet is still mounting
    expect(revealElement).not.toHaveBeenCalled()
    treeRef.current = { revealElement }
    await vi.advanceTimersByTimeAsync(20)

    await expect(outcome).resolves.toEqual({ ok: true, viaHost: false })
    expect(revealElement).toHaveBeenCalledWith(42, 'arch')
  })

  it('reveals at once when the tree is already there', async () => {
    const { handlers, treeRef } = mount()
    const revealElement = vi.fn(() => ({ ok: true as const, viaHost: false as const }))
    treeRef.current = { revealElement }

    void handlers.revealInTree(7, 'structure')
    expect(revealElement).toHaveBeenCalledWith(7, 'structure')
  })

  it('gives up, and says so, when no tree ever mounts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const { handlers } = mount()

    const outcome = handlers.revealInTree(42, 'arch')
    await vi.advanceTimersByTimeAsync(2000)

    await expect(outcome).resolves.toEqual({ ok: false })
  })
})
