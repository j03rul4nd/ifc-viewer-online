import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  boxHitsHull, convexHull, HORIZON_FACTOR, KEEP_BONUS, labelHorizonM, labelKey, labelsWanted, placeScreenLabels,
  screenBoxOf, screenHullOf, STREET_LEVEL_M, type ScreenItem, type ScreenPoint,
} from './screen-labels'

const item = (key: string, priority: number, sx: number, sy: number, w = 60, h = 16): ScreenItem =>
  ({ key, priority, sx, sy, w, h })

describe('placeScreenLabels', () => {
  it('keeps the more important name where two collide', () => {
    expect(placeScreenLabels([item('suburb', 500, 100, 100), item('city', 800, 110, 104)], 10)).toEqual(['city'])
  })
  it('keeps names that do not touch', () => {
    expect(placeScreenLabels([item('a', 1, 100, 100), item('b', 2, 400, 300)], 10).sort()).toEqual(['a', 'b'])
  })
  it('gives each layer a quota, so POIs never crowd out places', () => {
    const pois = Array.from({ length: 10 }, (_, i) => ({ ...item(`poi${i}`, 900 - i, i * 100, 50), layerId: 'poi' }))
    const town = { ...item('town', 100, 300, 400), layerId: 'place' }
    const kept = placeScreenLabels([...pois, town], 50, { poi: 3 })
    expect(kept.filter((k) => k.startsWith('poi'))).toHaveLength(3)
    expect(kept).toContain('town')
  })

  it('caps the number of names on screen', () => {
    const many = Array.from({ length: 50 }, (_, i) => item(`p${i}`, i, (i % 10) * 120, Math.floor(i / 10) * 60))
    expect(placeScreenLabels(many, 20)).toHaveLength(20)
  })
})

describe('labelKey', () => {
  it('gives one identity to one place seen by two tiles', () => {
    expect(labelKey('place', 'Poblenou', 0.50601, 0.62)).toBe(labelKey('place', 'Poblenou', 0.506012, 0.620004))
  })
  it('separates two places of the same name far apart', () => {
    expect(labelKey('place', 'Sant Martí', 0.5, 0.6)).not.toBe(labelKey('place', 'Sant Martí', 0.52, 0.6))
  })
})

describe('place names at a walker\'s eye', () => {
  it('are not drawn in the street: a camera 1.7 m up shows none', () => {
    expect(labelsWanted(1.7)).toBe(false)
    expect(labelsWanted(STREET_LEVEL_M - 1)).toBe(false)
  })

  it('come back once the view is a map again', () => {
    expect(labelsWanted(STREET_LEVEL_M)).toBe(true)
    expect(labelsWanted(400)).toBe(true)
  })
})

describe('names and the model', () => {
  it('keeps every name off a blocked rectangle', () => {
    const kept = placeScreenLabels(
      [item('over', 900, 200, 200), item('beside', 100, 500, 200)], 10, {}, [[150, 150, 260, 240]],
    )
    expect(kept).toEqual(['beside'])
  })

  it('does not write the same words twice close together', () => {
    const a = { ...item('a', 5, 100, 100), text: 'Gran Via' }
    const b = { ...item('b', 4, 100, 180), text: 'Gran Via' }
    const far = { ...item('c', 3, 700, 100), text: 'Gran Via' }
    expect(placeScreenLabels([a, b, far], 10)).toEqual(['a', 'c'])
  })

  it('projects a world box to the rectangle it covers on screen', () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000)
    camera.position.set(0, 0, 10)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const vp = { width: 800, height: 400 }
    const box = screenBoxOf(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)), camera, vp)!
    // Centred, and as wide as it is tall on screen (a cube seen head-on).
    expect((box[0] + box[2]) / 2).toBeCloseTo(400, 5)
    expect((box[1] + box[3]) / 2).toBeCloseTo(200, 5)
    expect(box[2] - box[0]).toBeCloseTo(box[3] - box[1], 5)
    // The near face (9 m away) sets the size: 2 m of 2·9·tan30° = 10.39 m of view height.
    expect(box[3] - box[1]).toBeCloseTo((2 / (2 * 9 * Math.tan(Math.PI / 6))) * 400, 3)
  })

  it('has no rectangle for a box behind the camera or off screen', () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000)
    camera.position.set(0, 0, 10)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const vp = { width: 800, height: 400 }
    const at = (x: number, z: number) => new THREE.Box3(new THREE.Vector3(x - 1, -1, z - 1), new THREE.Vector3(x + 1, 1, z + 1))
    expect(screenBoxOf(at(0, 30), camera, vp)).toBeNull()
    expect(screenBoxOf(at(500, -20), camera, vp)).toBeNull()
  })
})

describe('names, second pass (WP5)', () => {
  it('horizon: no name further than HORIZON_FACTOR × the camera–focus distance', () => {
    // 160 m up looking down 10°: focus ≈ 921 m away along the ray.
    const dirY = -Math.sin((10 * Math.PI) / 180)
    const lim = labelHorizonM(160, dirY)
    expect(lim).toBeCloseTo(HORIZON_FACTOR * (160 / -dirY), 6)
    // Rubí from the bench "baja" view is ~15 km away: out.
    expect(lim).toBeLessThan(15000)
    // Looking at the horizon the limit stays finite.
    expect(Number.isFinite(labelHorizonM(160, 0.2))).toBe(true)
    // Straight down from 1 km: 3 km.
    expect(labelHorizonM(1000, -1)).toBeCloseTo(1000 * HORIZON_FACTOR, 6)
  })

  it('model gap: a name in the corner of the rectangle but off the outline is kept', () => {
    // A diamond (a box seen at 45°) centred at 200,200, radius 100.
    const diamond: ScreenPoint[] = [[200, 100], [300, 200], [200, 300], [100, 200]]
    expect(convexHull([...diamond, [200, 200]])).toHaveLength(4)
    const corner = item('corner', 1, 115, 115, 20, 10) // in the rectangle, outside the diamond
    const inside = item('inside', 2, 200, 200, 20, 10)
    expect(boxHitsHull([105, 105, 125, 125], diamond)).toBe(false)
    expect(placeScreenLabels([corner, inside], 10, {}, [diamond])).toEqual(['corner'])
    // The old rectangle would have dropped both.
    expect(placeScreenLabels([corner, inside], 10, {}, [[100, 100, 300, 300]])).toEqual([])
  })

  it('model gap: the screen outline of a box is its convex hull and blocks its centre', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    camera.position.set(10, 10, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
    const vp = { width: 800, height: 800 }
    const hull = screenHullOf(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)), camera, vp)!
    // A cube seen along its diagonal is a hexagon.
    expect(hull).toHaveLength(6)
    expect(boxHitsHull([395, 395, 405, 405], hull)).toBe(true)
    const rect = screenBoxOf(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)), camera, vp)!
    // Its rectangle's corner is free map.
    expect(boxHitsHull([rect[0], rect[1], rect[0] + 3, rect[1] + 3], hull)).toBe(false)
  })

  it('hysteresis: a name placed the frame before keeps its spot against a peer', () => {
    const a = item('a', 700, 100, 100)
    const b = item('b', 710, 110, 104)
    expect(placeScreenLabels([a, b], 10)).toEqual(['b'])
    expect(placeScreenLabels([a, b], 10, {}, [], new Set(['a']))).toEqual(['a'])
    // …but not against a whole class above.
    const city = item('city', 700 + KEEP_BONUS + 1, 110, 104)
    expect(placeScreenLabels([a, city], 10, {}, [], new Set(['a']))).toEqual(['city'])
  })
})
