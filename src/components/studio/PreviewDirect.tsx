// ─── Direct manipulation on the preview ───────────────────────────────────────
// Edit the picture where it is, the way CapCut does:
//   • tap a caption or a picture-in-picture → it is selected (box + handle)
//   • drag it → it moves; its centre snaps to the middle of the frame, with
//     guide lines, so centring is effortless
//   • drag the corner handle → it grows or shrinks
//   • double-tap a caption → its text opens for typing in the inspector
//   • tap empty picture → play / pause, as before
// Every drag is one undo step. Hidden while playing: you edit a still frame.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClipStudioStore } from '../../stores/clipStudioStore'
import { hitTest, overlayRect, snapCentre, textArea, textRect, type Rect } from '../../lib/capture/preview-hit'
import type { TextOverlay } from '../../lib/capture/timeline'
import type { MediaOverlay } from '../../lib/capture/project'

const MIN_TEXT_SCALE = 0.5
const MAX_TEXT_SCALE = 2
const MIN_OVERLAY_W = 0.05

export function PreviewDirect({ playing, onToggle, onEditText }: {
  playing: boolean
  onToggle: () => void
  /** Open the selected caption's text for typing (focus the inspector field). */
  onEditText: () => void
}) {
  const { t } = useTranslation('capture')
  const project = useClipStudioStore((s) => s.project)
  const output = useClipStudioStore((s) => s.output)
  const playhead = useClipStudioStore((s) => s.playhead)
  const selection = useClipStudioStore((s) => s.selection)
  const layerRef = useRef<HTMLDivElement>(null)
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false })
  const W = output.width, H = output.height

  // One offscreen context to measure text the way the compositor does.
  const measure = useMemo(() => {
    try { return document.createElement('canvas').getContext('2d') } catch { return null }
  }, [])

  const sizeOf = (id: string) => {
    const s = project.sources.find((x) => x.id === id)
    return s ? { width: s.width, height: s.height } : null
  }

  const text = selection?.kind === 'text' ? project.texts.find((o) => o.id === selection.id) : undefined
  const overlay = selection?.kind === 'overlay' ? project.overlays.find((o) => o.id === selection.id) : undefined
  const onScreen = (o: { startSec: number; endSec: number } | undefined) => !!o && playhead >= o.startSec && playhead <= o.endSec
  const box: Rect | null = !playing && measure
    ? text && onScreen(text) ? textRect(measure, project, text, W, H)
      : overlay && onScreen(overlay) ? overlayRect(overlay, sizeOf, W, H)
        : null
    : null

  /** Pointer → frame pixels. */
  const toFrame = (clientX: number, clientY: number) => {
    const r = layerRef.current!.getBoundingClientRect()
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H, scale: W / r.width }
  }

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !measure) return
    const p = toFrame(e.clientX, e.clientY)
    const s = useClipStudioStore.getState()
    const hit = playing ? null : hitTest(measure, s.project, s.playhead, W, H, p.x, p.y, sizeOf)
    const x0 = e.clientX, y0 = e.clientY
    let moved = false
    if (!hit) {
      // Empty picture: a tap plays/pauses (a drag does nothing).
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointerup', up)
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) { s.select(null); onToggle() }
      }
      window.addEventListener('pointerup', up)
      return
    }
    e.preventDefault()
    s.select(hit)
    // Where the item's centre starts, as frame fractions.
    const start = hit.kind === 'text'
      ? (() => {
          const o = s.project.texts.find((x) => x.id === hit.id)!
          const r = textRect(measure, s.project, o, W, H)
          const area = textArea(s.project, W, H)
          return { cx: (r.x + r.w / 2) / W, cy: (r.y + r.h / 2 - area.top) / area.height, area, hw: r.w / 2 / W, hh: r.h / 2 / area.height }
        })()
      : (() => {
          const o = s.project.overlays.find((x) => x.id === hit.id)!
          const r = overlayRect(o, sizeOf, W, H)
          return { cx: o.x, cy: o.y, area: { top: 0, width: W, height: H }, hw: r.w / 2 / W, hh: r.h / 2 / H }
        })()
    const move = (ev: PointerEvent) => {
      const dxPx = ev.clientX - x0, dyPx = ev.clientY - y0
      if (!moved && Math.hypot(dxPx, dyPx) < 4) return
      if (!moved) { moved = true; s.beginGesture() }
      const f = toFrame(ev.clientX, ev.clientY)
      const from = toFrame(x0, y0)
      const sx = snapCentre(start.cx + (f.x - from.x) / W)
      const sy = snapCentre(start.cy + (f.y - from.y) / start.area.height)
      const cx = ev.altKey ? start.cx + (f.x - from.x) / W : sx.value
      const cy = ev.altKey ? start.cy + (f.y - from.y) / start.area.height : sy.value
      setGuides({ v: !ev.altKey && sx.snapped, h: !ev.altKey && sy.snapped })
      // Keep the whole item inside the frame (an item larger than the frame stays centred).
      const keep = (v: number, half: number) => (half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, v)))
      const nx = keep(cx, start.hw), ny = keep(cy, start.hh)
      useClipStudioStore.getState().edit((pr) => (hit.kind === 'text'
        ? { ...pr, texts: pr.texts.map((o) => (o.id === hit.id ? { ...o, xFrac: nx, yFrac: ny } : o)) }
        : { ...pr, overlays: pr.overlays.map((o) => (o.id === hit.id ? { ...o, x: nx, y: ny } : o)) }))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setGuides({ v: false, h: false })
      if (moved) useClipStudioStore.getState().endGesture()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Corner handle: scale about the item's centre by the change in distance to it. */
  const onResize = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!box) return
    const s = useClipStudioStore.getState()
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2
    const p0 = toFrame(e.clientX, e.clientY)
    const d0 = Math.max(1, Math.hypot(p0.x - cx, p0.y - cy))
    const text0 = text?.scale ?? 1
    const width0 = overlay?.width ?? 0.3
    s.beginGesture()
    const move = (ev: PointerEvent) => {
      const p = toFrame(ev.clientX, ev.clientY)
      const k = Math.hypot(p.x - cx, p.y - cy) / d0
      useClipStudioStore.getState().edit((pr) => (text
        ? { ...pr, texts: pr.texts.map((o: TextOverlay) => (o.id === text.id ? { ...o, scale: Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, text0 * k)) } : o)) }
        : overlay
          ? { ...pr, overlays: pr.overlays.map((o: MediaOverlay) => (o.id === overlay.id ? { ...o, width: Math.min(1, Math.max(MIN_OVERLAY_W, width0 * k)) } : o)) }
          : pr))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      useClipStudioStore.getState().endGesture()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Esc drops the selection box before it closes the studio.
  useEffect(() => {
    if (!box) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement).closest('input, textarea')) return
      e.stopImmediatePropagation()
      useClipStudioStore.getState().select(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [box])

  const pct = (v: number, of: number) => `${(v / of) * 100}%`

  return (
    <div
      ref={layerRef}
      className="studio-direct absolute inset-0"
      onPointerDown={onDown}
      onDoubleClick={() => { if (text) onEditText() }}
      aria-label={t('studio.direct.hint')}
    >
      {guides.v && <span className="studio-guide studio-guide--v" aria-hidden="true" />}
      {guides.h && <span className="studio-guide studio-guide--h" aria-hidden="true" />}
      {box && (
        <div className="studio-direct-box" style={{ left: pct(box.x, W), top: pct(box.y, H), width: pct(box.w, W), height: pct(box.h, H) }}>
          <span className="studio-direct-handle" role="slider" aria-label={t('studio.direct.resize')} aria-valuenow={Math.round((text?.scale ?? overlay?.width ?? 1) * 100)}
            tabIndex={-1} onPointerDown={onResize} />
        </div>
      )}
    </div>
  )
}
