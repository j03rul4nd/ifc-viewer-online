// ─── inspector ────────────────────────────────────────────────────────────────
// The panel shows ONE thing, and a scene can offer three: a federated IFC
// element, a point off a survey scan, and a building from the OpenStreetMap
// surroundings. Everything here is about the rule that decides which — last
// pick wins — and about not re-rendering when nothing changed.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useInspectorStore, publishInspectorTarget, clearInspectorTarget, LAS_CLASSES,
  type PointTarget, type MapFeatureTarget,
} from './inspector'

const point: PointTarget = {
  kind: 'point',
  cloudId: 'scan-1',
  cloudName: 'poblenou-site-scan.las',
  position: { x: 432340.125, y: 4583945.5, z: 12.75 },
  unit: 'm',
  intensity: 180,
  classification: 6,
}

const building: MapFeatureTarget = {
  kind: 'map-feature',
  id: 'way/12345',
  name: 'Torre Glòries',
  label: 'Office building',
  featureKind: 'building',
  heightM: 144.4,
  heightEstimated: false,
}

beforeEach(() => useInspectorStore.setState({ target: null }))

describe('inspector target', () => {
  it('starts empty, so the panel falls through to the IFC selection', () => {
    expect(useInspectorStore.getState().target).toBeNull()
  })

  it('holds whatever was picked last', () => {
    publishInspectorTarget(point)
    expect(useInspectorStore.getState().target).toEqual(point)
    publishInspectorTarget(building)
    expect(useInspectorStore.getState().target).toEqual(building)
  })

  it('clears, which is how an IFC selection takes the panel back', () => {
    publishInspectorTarget(point)
    clearInspectorTarget()
    expect(useInspectorStore.getState().target).toBeNull()
  })

  it('does not write when there is nothing to clear', () => {
    // clearInspectorTarget() runs on EVERY IFC selection, including the
    // thousands a drag-select makes. A store write per call would re-render the
    // whole sidebar for no change at all.
    let writes = 0
    const unsubscribe = useInspectorStore.subscribe(() => { writes++ })
    clearInspectorTarget()
    clearInspectorTarget()
    expect(writes).toBe(0)

    publishInspectorTarget(point)
    clearInspectorTarget()
    expect(writes).toBe(2)
    unsubscribe()
  })

  it('keeps the scan point in the FILE’s coordinates, not the scene’s', () => {
    // The scene position has the alignment transform baked into it and matches
    // nothing anybody has on paper; the eastings/northings do. A five-figure
    // easting is the tell that the right one was stored.
    publishInspectorTarget(point)
    const stored = useInspectorStore.getState().target as PointTarget
    expect(stored.position.x).toBeGreaterThan(400_000)
    expect(stored.unit).toBe('m')
  })

  it('lets a map feature have no name, because most of them do not', () => {
    const anonymous: MapFeatureTarget = {
      kind: 'map-feature', id: 'way/999', featureKind: 'building',
      heightM: 11.2, heightEstimated: true,
    }
    publishInspectorTarget(anonymous)
    const stored = useInspectorStore.getState().target as MapFeatureTarget
    expect(stored.name).toBeUndefined()
    // And says the height is a guess. An OSM height presented as surveyed is
    // the kind of number that ends up in somebody's shadow study.
    expect(stored.heightEstimated).toBe(true)
  })
})

describe('LAS_CLASSES', () => {
  it('names the codes a survey actually uses', () => {
    expect(LAS_CLASSES[2]).toBe('ground')
    expect(LAS_CLASSES[5]).toBe('highVegetation')
    expect(LAS_CLASSES[6]).toBe('building')
  })

  it('has no entry for codes it cannot name, so the panel shows the number', () => {
    // Inventing a label for a vendor-specific code would be worse than the raw
    // number, which at least the surveyor can look up.
    expect(LAS_CLASSES[64]).toBeUndefined()
    expect(LAS_CLASSES[200]).toBeUndefined()
  })

  it('covers every class the Poblenou scan writes', () => {
    for (const code of [2, 5, 6]) expect(LAS_CLASSES[code]).toBeTruthy()
  })
})
