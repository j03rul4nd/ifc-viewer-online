import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { createViewer, type ViewerAPI } from '../lib/viewer'
import type { SelectedInfo, ViewerHandle, ViewerStyle } from '../types'

interface ViewerProps {
  /** Optional ref that will be populated with the ViewerAPI once the scene is ready.
   *  Used by useIfcLoader to call loadFragments() without coupling to ViewerHandle. */
  viewerApiRef?: React.MutableRefObject<ViewerAPI | null>
  onSelect: (info: SelectedInfo | null) => void
  /** Fired on right-click over an element (payload) or empty space (null). */
  onContextMenu?: (payload: { x: number; y: number; info: SelectedInfo } | null) => void
  hiddenCategories: Set<string>
  isolatedCategory: string | null
  hiddenElementIds?: Set<string>
  /** When set (a localId), only this element is shown within its owning model. */
  isolatedElementId?: number | null
  /** Which model the isolated element belongs to. Other models render normally. */
  isolatedElementModelId?: string | null
  selectedId: string | null
  viewerStyle: ViewerStyle
}

const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(props, ref) {
  const mountRef = useRef<HTMLDivElement>(null)
  const apiRef   = useRef<ViewerAPI | null>(null)

  // Keep latest props accessible inside stable callbacks without re-running effects
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })

  // ── Scene setup (runs once) ──────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const api = createViewer(mount)
    apiRef.current = api
    if (props.viewerApiRef) props.viewerApiRef.current = api

    api.setSelectCallback((info) => propsRef.current.onSelect(info))
    api.setContextMenuCallback((payload) => propsRef.current.onContextMenu?.(payload))

    return () => {
      api.dispose()
      apiRef.current = null
      if (props.viewerApiRef?.current === api) {
        props.viewerApiRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reactive filter / style effects ─────────────────────────────────────
  useEffect(() => {
    apiRef.current?.applyFilters(props.hiddenCategories, props.isolatedCategory, props.hiddenElementIds, props.isolatedElementId, props.isolatedElementModelId)
  }, [props.hiddenCategories, props.isolatedCategory, props.hiddenElementIds, props.isolatedElementId, props.isolatedElementModelId])

  useEffect(() => {
    apiRef.current?.applyStyle(props.viewerStyle)
  }, [props.viewerStyle])

  // ── Imperative handle for parent controls ────────────────────────────────
  useImperativeHandle(ref, () => ({
    resetCamera:          () => apiRef.current?.resetCamera(),
    frameCategory:        (id) => apiRef.current?.frameCategory(id),
    setCameraViewpoint:   (position, direction) => apiRef.current?.setCameraViewpoint(position, direction),
    getCameraViewpoint:   () => apiRef.current?.getCameraViewpoint() ?? null,
    takeSnapshot:         () => apiRef.current?.takeSnapshot() ?? '',
  }), [])

  // The outer div owns the absolute-fill layout. PostproductionRenderer
  // (via RendererWith2D) sets style.position = 'relative' on the mount
  // container, which would collapse absolute inset-0. Keeping layout and
  // OBC's container separate avoids that conflict.
  return (
    <div className="absolute inset-0">
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{ touchAction: 'none', position: 'relative' }}
      />
    </div>
  )
})

export default Viewer