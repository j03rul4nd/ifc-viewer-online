import { useCallback } from 'react'
import type { RefObject } from 'react'
import type { ViewerAPI } from '../lib/viewer'
import type { ModelTreeHandle, RevealOutcome } from '../App'
import { useUIStore } from '../stores/uiStore'

/** How long a reveal waits for a closed tree to mount before giving up. */
const TREE_MOUNT_TIMEOUT_MS = 1500

// Every handler forwards modelId to the viewer — to the framing call as well
// as the selection. expressIDs collide across federated models, so dropping it
// on one of the two framed an element in one model and selected it in another.
interface ElementFocusHandlers {
  /** Frame + select element in the viewer; modelId targets the correct model when multiple are loaded */
  jumpToElement:     (expressId: number, modelId?: string) => void
  /** Select element without reframing */
  selectElement:     (expressId: number, modelId?: string) => void
  /** Frame a set of elements of one model */
  focusElements:     (ids: number[], modelId?: string) => void
  /** Frame + select a single element */
  frameElement:      (expressId: number, modelId?: string) => void
  /**
   * Open tree (if closed) then scroll to element, in the model that owns it.
   * Resolves with what the tree managed to do, so the caller can say so.
   */
  revealInTree:      (expressId: number, modelId?: string) => Promise<RevealOutcome>
}

export function useElementFocus(
  viewerApiRef:  RefObject<ViewerAPI | null>,
  modelTreeRef:  RefObject<ModelTreeHandle | null>,
): ElementFocusHandlers {
  const jumpToElement = useCallback((expressId: number, modelId?: string) => {
    viewerApiRef.current?.focusElement(expressId, modelId)
    viewerApiRef.current?.selectElement(expressId, modelId)
  }, [viewerApiRef])

  const selectElement = useCallback((expressId: number, modelId?: string) => {
    viewerApiRef.current?.selectElement(expressId, modelId)
  }, [viewerApiRef])

  const focusElements = useCallback((ids: number[], modelId?: string) => {
    viewerApiRef.current?.frameElements(ids, modelId)
  }, [viewerApiRef])

  const frameElement = useCallback((expressId: number, modelId?: string) => {
    viewerApiRef.current?.focusElement(expressId, modelId)
    viewerApiRef.current?.selectElement(expressId, modelId)
  }, [viewerApiRef])

  const revealInTree = useCallback((expressId: number, modelId?: string): Promise<RevealOutcome> => {
    if (!useUIStore.getState().treeVisible) {
      useUIStore.getState().setTreeVisible(true)
    }
    // Wait for the tree to exist, not for a fixed delay. A closed tree is not
    // mounted, and on a phone it lives in a sheet that only mounts its content
    // a render after it opens: a guessed 80 ms either found it or answered
    // "not in the tree" for an element that is.
    return new Promise((resolve) => {
      const started = performance.now()
      const attempt = (): void => {
        const tree = modelTreeRef.current
        if (tree) resolve(tree.revealElement(expressId, modelId))
        else if (performance.now() - started > TREE_MOUNT_TIMEOUT_MS) resolve({ ok: false })
        else setTimeout(attempt, 16)
      }
      attempt()
    })
  }, [modelTreeRef])

  return { jumpToElement, selectElement, focusElements, frameElement, revealInTree }
}
