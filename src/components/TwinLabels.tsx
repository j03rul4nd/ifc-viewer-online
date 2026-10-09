// ─── TwinLabels ───────────────────────────────────────────────────────────────
// Floating values over bound elements: "21.4 °C" above a room, "3.2 kW" above
// the roof. One label per binding that asks for one (Binding.label), anchored
// at the top-centre of its elements' box in the first model that has them,
// projected every frame. Pointer-transparent except the chip itself, which
// selects and frames the elements.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTwinDeviceStore, selectShownReadings } from '../stores/twinDeviceStore'
import { useValidationStore } from '../stores/validationStore'
import { bindingState, buildCatalog, buildGuidIndex, deviceKey, metricOf, resolveLocs, type Binding } from '../lib/twin/devices'
import type { ViewerAPI } from '../lib/viewer'

interface Anchor { bindingId: string; modelId: string; firstId: number; ids: number[]; point: { x: number; y: number; z: number } }

const fmt = (v: unknown): string => (typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : String(Math.round(v * 10) / 10)) : String(v ?? '—'))

export function TwinLabels({ viewerApiRef }: { viewerApiRef: React.MutableRefObject<ViewerAPI | null> }) {
  const active = useTwinDeviceStore((s) => s.active)
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const readings = useTwinDeviceStore(selectShownReadings)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const trees = useValidationStore((s) => s.spatialTrees)
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const refs = useRef(new Map<string, HTMLDivElement>())

  const labelled = useMemo(() => bindings.filter((b) => b.label?.field), [bindings])
  // Re-anchor only when what is labelled, or the loaded models, change.
  const anchorKey = useMemo(() => JSON.stringify(labelled.map((b) => [b.id, b.targets.map((t) => t.globalId), b.query ?? null])), [labelled])

  useEffect(() => {
    let cancelled = false
    const viewer = viewerApiRef.current
    if (!viewer || !active || labelled.length === 0) { setAnchors([]); return }
    const guidIndex = buildGuidIndex(trees)
    const catalog = buildCatalog(trees)
    void (async () => {
      const out: Anchor[] = []
      for (const b of labelled) {
        const locs = resolveLocs(b, guidIndex, catalog)
        if (!locs.length) continue
        const modelId = locs[0].modelId
        const ids = locs.filter((l) => l.modelId === modelId).map((l) => l.expressId).slice(0, 500)
        const box = await viewer.getElementsBox(ids, modelId).catch(() => null)
        if (!box) continue
        out.push({
          bindingId: b.id, modelId, firstId: ids[0], ids,
          point: { x: (box.min.x + box.max.x) / 2, y: box.max.y, z: (box.min.z + box.max.z) / 2 },
        })
      }
      if (!cancelled) setAnchors(out)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey, trees, active])

  // Follow the camera: project every frame, write positions straight to the DOM.
  useEffect(() => {
    if (anchors.length === 0) return
    let raf = 0
    const tick = (): void => {
      const viewer = viewerApiRef.current
      if (viewer) {
        const pts = viewer.projectToScreen(anchors.map((a) => a.point))
        anchors.forEach((a, i) => {
          const el = refs.current.get(a.bindingId)
          if (!el) return
          const p = pts[i]
          el.style.display = p.visible ? '' : 'none'
          el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anchors, viewerApiRef])

  if (!active || anchors.length === 0) return null
  const byId = new Map<string, Binding>(bindings.map((b) => [b.id, b]))
  const now = timeAt ?? Date.now()

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]" data-testid="twin-labels">
      {anchors.map((a) => {
        const b = byId.get(a.bindingId)
        if (!b?.label) return null
        const reading = readings.get(deviceKey(b.sourceId, b.deviceId))
        const st = bindingState(b, reading, now)
        const color = st.kind === 'rule' ? st.rule.effect.color : b.staleColor
        return (
          <div key={a.bindingId} ref={(el) => { if (el) refs.current.set(a.bindingId, el); else refs.current.delete(a.bindingId) }}
            className="absolute left-0 top-0 will-change-transform" data-testid="twin-label">
            <button type="button"
              onClick={() => { const v = viewerApiRef.current; v?.frameElements(a.ids, a.modelId); v?.selectElement(a.firstId, a.modelId) }}
              className="pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 mb-1 rounded-full text-[10px] font-medium whitespace-nowrap bg-[rgba(10,12,18,0.82)] text-white border border-white/15 shadow"
              title={`${b.name} · ${b.label.field}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color ?? '#94a3b8' }} />
              {reading ? fmt(metricOf(reading, b.label.field)) : '—'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
