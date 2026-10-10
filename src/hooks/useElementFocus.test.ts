// useElementFocus: every handler that frames must frame the model it was given,
// not just select in it. expressIDs collide across federated models, so a
// dropped modelId on the framing call put the camera on #N of whichever model
// the viewer found first while the selection landed in the right one.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ViewerAPI } from '../lib/viewer'
import type { ModelTreeHandle } from '../App'
import { useElementFocus } from './useElementFocus'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

type Handlers = ReturnType<typeof useElementFocus>

let host: HTMLDivElement | null = null
let root: Root | null = null

function mount(): { viewer: Pick<ViewerAPI, 'focusElement' | 'selectElement' | 'frameElements'>; handlers: Handlers } {
  const viewer = { focusElement: vi.fn(), selectElement: vi.fn(), frameElements: vi.fn() }
  const viewerRef = { current: viewer as unknown as ViewerAPI }
  const treeRef = createRef<ModelTreeHandle>()
  let handlers: Handlers | null = null
  function Probe(): null {
    handlers = useElementFocus(viewerRef, treeRef)
    return null
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(createElement(Probe)) })
  return { viewer, handlers: handlers! }
}

afterEach(() => {
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
