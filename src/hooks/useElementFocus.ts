import { useCallback } from 'react'
import type { RefObject } from 'react'
import type { ViewerAPI } from '../lib/viewer'
import type { ModelTreeHandle } from '../App'
import { useUIStore } from '../stores/uiStore'

interface ElementFocusHandlers {
  /** Frame + select element in the viewer; modelId targets the correct model when multiple are loaded */
  jumpToElement:     (expressId: number, modelId?: string) => void
  /** Select element without reframing */
  selectElement:     (expressId: number, modelId?: string) => void
  /** Frame a set of elements */
  focusElements:     (ids: number[]) => void
  /** Frame + select a single element */
  frameElement:      (expressId: number, modelId?: string) => void
  /** Open tree (if closed) then scroll to element, in the model that owns it */
  revealInTree:      (expressId: number, modelId?: string) => void
}

export function useElementFocus(
  viewerApiRef:  RefObject<ViewerAPI | null>,
  modelTreeRef:  RefObject<ModelTreeHandle | null>,
): ElementFocusHandlers {
  const jumpToElement = useCallback((expressId: number, modelId?: string) => {
    viewerApiRef.current?.focusElement(expressId)
    viewerApiRef.current?.selectElement(expressId, modelId)
  }, [viewerApiRef])

  const selectElement = useCallback((expressId: number, modelId?: string) => {
    viewerApiRef.current?.selectElement(expressId, modelId)
  }, [viewerApiRef])

  const focusElements = useCallback((ids: number[]) => {
    viewerApiRef.current?.frameElements(ids)
  }, [viewerApiRef])

  const frameElement = useCallback((expressId: number, modelId?: string) => {
    viewerApiRef.current?.focusElement(expressId)
    viewerApiRef.current?.selectElement(expressId, modelId)
  }, [viewerApiRef])

  const revealInTree = useCallback((expressId: number, modelId?: string) => {
    if (!useUIStore.getState().treeVisible) {
      useUIStore.getState().setTreeVisible(true)
    }
    // Slight delay so the tree has time to mount/expand before scrolling
    setTimeout(() => {
      modelTreeRef.current?.revealElement(expressId, modelId)
    }, 80)
  }, [modelTreeRef])

  return { jumpToElement, selectElement, focusElements, frameElement, revealInTree }
}
