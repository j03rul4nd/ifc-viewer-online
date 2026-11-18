// ─── useModelSites ────────────────────────────────────────────────────────────
// Map mode has one placement (the basemap aligns to one scene origin), but a
// federated project is several files. This resolves where each loaded model
// claims to be so the panel can show agreement — or disagreement — honestly.

import React, { useMemo } from 'react'
import { useGeoStore } from '../../stores/geoStore'
import { useSceneStore } from '../../stores/sceneStore'
import { placementFromExtraction } from '../../lib/geo/placement'
import { collectModelSites, type ModelInput } from '../../lib/geo/model-sites'
import type { ViewerAPI } from '../../lib/viewer'

export function useModelSites(viewerApiRef: React.MutableRefObject<ViewerAPI | null>) {
  const sceneModels = useSceneStore((s) => s.models)
  const activeModelId = useSceneStore((s) => s.activeModelId)
  const georefByModel = useGeoStore((s) => s.georefByModel)
  // Participates because applying a manual placement should refresh the pins
  // without waiting for another extraction.
  const placement = useGeoStore((s) => s.placement)

  const modelSites = useMemo(() => {
    const inputs: ModelInput[] = sceneModels.map((m) => {
      const g = georefByModel[m.id] ?? null
      // Bounds are only needed for grid-coordinate rungs; a failure here simply
      // leaves the model "unlocated", which is exactly what we want to show.
      const bounds = viewerApiRef.current?.getModelBounds(m.id) ?? null
      const resolved = g ? placementFromExtraction(g, bounds) : null
      return {
        modelId: m.id,
        label: m.fileName,
        extraction: g,
        placement: resolved?.ok ? resolved.value : null,
      }
    })
    return collectModelSites(inputs, activeModelId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneModels, georefByModel, activeModelId, viewerApiRef, placement])

  /** Sibling pins (everything located that is not the anchor). */
  const otherPins = useMemo(
    () => modelSites.located
      .filter((s) => !s.anchor)
      .map((s) => ({ id: s.modelId, lat: s.lat!, lon: s.lon!, label: s.label, secondary: true })),
    [modelSites],
  )

  return { modelSites, otherPins }
}
