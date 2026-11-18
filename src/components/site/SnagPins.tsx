// ─── SnagPins ─────────────────────────────────────────────────────────────────
// A small marker over each open snag that has a 3D point or an element, while
// the site tab is on screen. Same pattern as TwinLabels: anchors resolved once
// (point, or the top-centre of the element's box), projected every frame and
// written straight to the DOM. A click opens the snag in the site tab.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'
import type { ViewerAPI } from '../../lib/viewer'
import { useSiteStore } from '../../stores/siteStore'
import { useUIStore } from '../../stores/uiStore'
import { locateTarget, pinnableSnags } from '../../lib/site/locate'
import { useSceneStore } from '../../stores/sceneStore'
import type { SnagPriority } from '../../lib/site/snags'

interface Anchor { id: string; title: string; priority: SnagPriority; point: { x: number; y: number; z: number } }

const PIN_COLOR: Record<SnagPriority, string> = { low: '#6c7a89', medium: '#e0a526', high: '#e06b26', critical: '#d9534f' }

export default function SnagPins({ viewerApiRef }: { viewerApiRef: React.MutableRefObject<ViewerAPI | null> }) {
  const { t } = useTranslation('site')
  const active = useSiteStore((s) => s.active)
  const snags = useSiteStore((s) => s.snags)
  const pinnable = useMemo(() => (active ? pinnableSnags(snags) : []), [active, snags])
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const models = useSceneStore((s) => s.models)
  const refs = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    const viewer = viewerApiRef.current
    if (!viewer || pinnable.length === 0) { setAnchors([]); return }
    let cancelled = false
    void (async () => {
      const out: Anchor[] = []
      for (const s of pinnable) {
        const loc = s.location
        let point = loc.point ? { x: loc.point[0], y: loc.point[1], z: loc.point[2] } : null
        if (!point && loc.expressId !== undefined) {
          // The stored model id is from the load the snag was made in; resolve to a live model.
          const live = locateTarget(loc, useSiteStore.getState().elements, models.some((m) => m.id === loc.modelId) ? loc.modelId : models[0]?.id)
          const box = live ? await viewer.getElementsBox([live.expressId], live.modelId).catch(() => null) : null
          if (box) point = { x: (box.min.x + box.max.x) / 2, y: box.max.y, z: (box.min.z + box.max.z) / 2 }
        }
        if (point) out.push({ id: s.id, title: s.title, priority: s.priority, point })
      }
      if (!cancelled) setAnchors(out)
    })()
    return () => { cancelled = true }
  }, [pinnable, viewerApiRef, models])

  useEffect(() => {
    if (anchors.length === 0) return
    let raf = 0
    const tick = (): void => {
      const viewer = viewerApiRef.current
      if (viewer) {
        const pts = viewer.projectToScreen(anchors.map((a) => a.point))
        anchors.forEach((a, i) => {
          const el = refs.current.get(a.id)
          if (!el) return
          const p = pts[i]
          el.style.display = p.visible ? '' : 'none'
          if (p.visible) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anchors, viewerApiRef])

  if (!active || anchors.length === 0) return null

  const open = (id: string): void => {
    useSiteStore.getState().requestOpenSnag(id)
    const ui = useUIStore.getState()
    ui.setPendingSidebarTab('site')
    ui.setSidebarExpanded(true)
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]" data-testid="snag-pins">
      {anchors.map((a) => (
        <button key={a.id} type="button" title={a.title} aria-label={`${t('openPin')}: ${a.title}`}
          ref={(el) => { if (el) refs.current.set(a.id, el); else refs.current.delete(a.id) }}
          onClick={() => open(a.id)}
          className="absolute left-0 top-0 pointer-events-auto flex flex-col items-center"
          style={{ display: 'none' }}>
          <span className="block w-4 h-4 rounded-full border-2 border-white shadow" style={{ background: PIN_COLOR[a.priority] }} />
          <span className="block w-0.5 h-2 bg-white/80" />
        </button>
      ))}
    </div>
  )
}
