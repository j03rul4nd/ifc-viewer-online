// ─── useFederationLook ───────────────────────────────────────────────────────
// Pushes the federation presentation (colour by discipline, per-model opacity)
// into the viewer. Mounted once in App so a model loaded while the Scene panel
// is closed still picks up the set's look.
//
// Only what changed is sent: other tools (the point-cloud comparison above all)
// also set model opacity, and re-sending 1 to every model on each render would
// undo them.

import { useEffect, useRef } from 'react'
import type { ViewerAPI } from '../lib/viewer'
import { useSceneStore } from '../stores/sceneStore'
import { useFederationStore, disciplineOf, disciplineColor } from '../stores/federationStore'
import { clampOpacity } from '../lib/federation'

export function useFederationLook(viewerApiRef: React.MutableRefObject<ViewerAPI | null>): void {
  const models = useSceneStore((s) => s.models)
  const opacityById = useFederationStore((s) => s.opacityById)
  const disciplineById = useFederationStore((s) => s.disciplineById)
  const colorOn = useFederationStore((s) => s.colorByDiscipline)
  const sentOpacity = useRef<Record<string, number>>({})
  const lookOn = useRef(false)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const latest = useRef<(() => Promise<void>) | null>(null)
  const modelKey = models.map((m) => m.id).join('|')

  useEffect(() => {
    // Every call is async and walks every model; two in flight interleave and
    // the slower one wins (toggling colour off then applying a view painted
    // the palette over the view). One at a time, and only the latest matters.
    const apply = async (): Promise<void> => {
      const viewer = viewerApiRef.current
      if (!viewer) return
      if (colorOn) {
        const modelColors: Record<string, string> = {}
        const modelOpacities: Record<string, number> = {}
        for (const m of models) {
          modelColors[m.id] = disciplineColor(disciplineOf(m, disciplineById))
          modelOpacities[m.id] = clampOpacity(opacityById[m.id] ?? 1)
        }
        lookOn.current = true
        sentOpacity.current = {}
        await viewer.setPresentationLook({
          base: 'clay', baseColor: '#cfd3dc', baseOpacity: 1,
          focusTypes: [], focusColor: null, modelColors, modelOpacities,
        })
        return
      }
      if (lookOn.current) {
        lookOn.current = false
        await viewer.setPresentationLook(null)
      }
      for (const m of models) {
        const want = clampOpacity(opacityById[m.id] ?? 1)
        const sent = sentOpacity.current[m.id] ?? 1
        if (Math.abs(want - sent) > 1e-3) {
          viewer.setModelOpacity(want, m.id)
          sentOpacity.current[m.id] = want
        }
      }
    }
    latest.current = apply
    queue.current = queue.current.then(() => (latest.current === apply ? apply() : undefined)).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApiRef, modelKey, opacityById, disciplineById, colorOn])
}
