import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useVectorLayerStore, VECTOR_LAYERS_LS_KEY } from '../../stores/vectorLayerStore'
import { addGeoJsonText, restoreVectorLayers } from './vector-runner'
import { useSceneAnchorStore } from '../../stores/sceneAnchorStore'

const ZONE = JSON.stringify({
  type: 'Feature', properties: { name: 'Zone', height: 10 },
  geometry: { type: 'Polygon', coordinates: [[[2.17, 41.38], [2.171, 41.38], [2.171, 41.381], [2.17, 41.38]]] },
})

describe('vector layer persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useVectorLayerStore.getState().clear()
    useSceneAnchorStore.getState().clear()
  })

  it('saves a file layer with its style, restores it, and forgets it once removed', async () => {
    const r = addGeoJsonText('zone.geojson', ZONE, { type: 'file', name: 'zone.geojson', size: ZONE.length })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    useVectorLayerStore.getState().setStyle(r.id, { color: '#123456' })
    vi.advanceTimersByTime(400)
    const saved = JSON.parse(localStorage.getItem(VECTOR_LAYERS_LS_KEY)!)
    expect(saved.layers).toHaveLength(1)
    expect(saved.layers[0].style.color).toBe('#123456')

    useVectorLayerStore.getState().clear()
    vi.advanceTimersByTime(400)
    expect(localStorage.getItem(VECTOR_LAYERS_LS_KEY)).toBeNull()

    localStorage.setItem(VECTOR_LAYERS_LS_KEY, JSON.stringify(saved))
    vi.useRealTimers()
    const out = await restoreVectorLayers()
    expect(out).toEqual({ restored: 1, failed: 0, problems: [] })
    const [layer] = useVectorLayerStore.getState().layers
    expect(layer.name).toBe('zone.geojson')
    expect(layer.style.color).toBe('#123456')
    expect(layer.data?.counts.polygon).toBe(1)
  })
})
