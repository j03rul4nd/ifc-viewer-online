// ─── TwinLabels ───────────────────────────────────────────────────────────────
// Floating values over bound elements: "21.4 °C" above a room, "3.2 kW" above
// the roof. One label per binding that asks for one (Binding.label), anchored
// at the top-centre of its elements' box in the first model that has them,
// projected every frame. Pointer-transparent except the chip itself, which
// selects and frames the elements.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTwinDeviceStore, selectShownReadings } from '../stores/twinDeviceStore'
import { useValidationStore } from '../stores/validationStore'
import { bindingState, buildCatalog, buildGuidIndex, deviceKey, metricOf, resolveLocs, type Binding, type Reading } from '../lib/twin/devices'
import type { ViewerAPI } from '../lib/viewer'
import { useIsMobile } from '../hooks/useIsMobile'
import { declutter, paintTwinLabels, type TwinLabelPaint } from '../lib/twin/label-paint'

interface Anchor { bindingId: string; modelId: string; firstId: number; ids: number[]; point: { x: number; y: number; z: number } }

const fmt = (v: unknown): string => (typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : String(Math.round(v * 10) / 10)) : String(v ?? '—'))

/** Text and dot colour of a label — one definition for the screen and for captures. */
function labelLook(b: Binding, reading: Reading | undefined, now: number): { text: string; color: string | null } {
  const st = bindingState(b, reading, now)
  return {
    text: reading && b.label ? fmt(metricOf(reading, b.label.field)) : '—',
    color: st.kind === 'rule' ? st.rule.effect.color : b.staleColor,
  }
}

export function TwinLabels({ viewerApiRef }: { viewerApiRef: React.MutableRefObject<ViewerAPI | null> }) {
  const active = useTwinDeviceStore((s) => s.active)
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const readings = useTwinDeviceStore(selectShownReadings)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const trees = useValidationStore((s) => s.spatialTrees)
  const [anchors, setAnchors] = useState<Anchor[]>([])
  // Touch: a 16 px pill is under what a thumb can hit; draw them a quarter larger
  // there, and declutter (and capture) at that same size.
  const isMobile = useIsMobile()
  const k = isMobile ? 1.25 : 1
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
        const els = anchors.map((a) => refs.current.get(a.bindingId))
        const keep = declutter(pts.map((p, i) => ({ ...p, text: els[i]?.textContent ?? '' })), 2, k)
        anchors.forEach((_, i) => {
          const el = els[i]
          if (!el) return
          const p = pts[i]
          el.style.display = keep[i] ? '' : 'none'
          if (keep[i]) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anchors, viewerApiRef, k])

  // Captures (PNG, clips, GIF): the same pills, projected with the camera that
  // rendered THAT frame, with the values shown at that moment. Registered once
  // per set of anchors; values are read from the store at paint time.
  useEffect(() => {
    const viewer = viewerApiRef.current
    if (!viewer || anchors.length === 0) return
    return viewer.addCapturePainter((ctx, w, h, s) => {
      const st = useTwinDeviceStore.getState()
      if (!st.active) return false
      const shown = st.past ?? st.readings
      const at = st.timeAt ?? Date.now()
      const byBinding = new Map(st.bindings.map((b) => [b.id, b]))
      const pts = viewer.projectToScreen(anchors.map((a) => a.point))
      const candidates: Array<TwinLabelPaint & { visible: boolean }> = []
      anchors.forEach((a, i) => {
        const b = byBinding.get(a.bindingId)
        if (!b?.label) return
        const reading = shown.get(deviceKey(b.sourceId, b.deviceId))
        candidates.push({ x: pts[i].x, y: pts[i].y, visible: pts[i].visible, ...labelLook(b, reading, at) })
      })
      // Same decluttering as on screen: a capture shows the labels that were readable.
      const keep = declutter(candidates, 2, k)
      const labels = candidates.filter((_, i) => keep[i])
      const drew = paintTwinLabels(ctx, w, h, s, labels, k)
      // DEV: what the last capture got, for QA without reading pixels.
      if (import.meta.env.DEV) {
        (globalThis as Record<string, unknown>).__ifcTwinLabelCapture = { anchors: anchors.length, painted: labels.length, drew, w, h, s, pts }
      }
      return drew
    })
  }, [anchors, viewerApiRef, k])

  if (!active || anchors.length === 0) return null
  const byId = new Map<string, Binding>(bindings.map((b) => [b.id, b]))
  const now = timeAt ?? Date.now()

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]" data-testid="twin-labels">
      {anchors.map((a) => {
        const b = byId.get(a.bindingId)
        if (!b?.label) return null
        const look = labelLook(b, readings.get(deviceKey(b.sourceId, b.deviceId)), now)
        return (
          <div key={a.bindingId} ref={(el) => { if (el) refs.current.set(a.bindingId, el); else refs.current.delete(a.bindingId) }}
            className="absolute left-0 top-0 will-change-transform" data-testid="twin-label">
            <button type="button"
              onClick={() => { const v = viewerApiRef.current; v?.frameElements(a.ids, a.modelId); v?.selectElement(a.firstId, a.modelId) }}
              className="pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 max-md:px-2 max-md:py-1 mb-1 rounded-full text-[10px] max-md:text-[12.5px] font-medium whitespace-nowrap bg-[rgba(10,12,18,0.82)] text-white border border-white/15 shadow"
              title={`${b.name} · ${b.label.field}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: look.color ?? '#94a3b8' }} />
              {look.text}
            </button>
          </div>
        )
      })}
    </div>
  )
}
