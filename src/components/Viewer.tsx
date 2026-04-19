import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { createViewer, type ViewerAPI } from '../lib/viewer'
import type { SelectedInfo, ViewerHandle, ViewerStyle } from '../types'

interface ViewerProps {
  /** Optional ref that will be populated with the ViewerAPI once the scene is ready.
   *  Used by useIfcLoader to call loadFragments() without coupling to ViewerHandle. */
  viewerApiRef?: React.MutableRefObject<ViewerAPI | null>
  onSelect: (info: SelectedInfo | null) => void
  hiddenCategories: Set<string>
  isolatedCategory: string | null
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

    // Expose API to the parent hook (useIfcLoader)
    if (props.viewerApiRef) props.viewerApiRef.current = api

    api.setSelectCallback((info) => {
      propsRef.current.onSelect(info)
    })

    return () => {
      api.dispose()
      apiRef.current = null
      if (props.viewerApiRef) props.viewerApiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reactive filter / style effects ─────────────────────────────────────
  useEffect(() => {
    apiRef.current?.applyFilters(props.hiddenCategories, props.isolatedCategory)
  }, [props.hiddenCategories, props.isolatedCategory])

  useEffect(() => {
    apiRef.current?.applyStyle(props.viewerStyle)
  }, [props.viewerStyle])

  // ── Imperative handle for parent controls ────────────────────────────────
  useImperativeHandle(ref, () => ({
    resetCamera:   () => apiRef.current?.resetCamera(),
    frameCategory: (id) => apiRef.current?.frameCategory(id),
  }), [])

  return <div ref={mountRef} className="absolute inset-0" />
})

export default Viewer
